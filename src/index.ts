import {
  CancellationToken,
  Diagnostic,
  DocumentSelector,
  ExtensionContext,
  HandleDiagnosticsSignature,
  LanguageClient,
  LanguageClientOptions,
  languages,
  LinesTextDocument,
  Position,
  ProvideDefinitionSignature,
  StreamInfo,
  window,
  workspace,
} from 'coc.nvim';
import * as fs from 'fs';
import { ChildProcess, execFile, spawn } from 'mz/child_process';
import * as path from 'path';
import * as semver from 'semver';
import { PsalmCodeActionProvider } from './actions';
import { registerCommands } from './commands';

function isFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function filterPath(paths: string[], workspacePath: string): string | null {
  for (const configPath of paths) {
    if (isFile(path.join(workspacePath, configPath))) {
      return configPath;
    }
  }

  return null;
}

// Returns true if psalm.psalmScriptPath supports the language server protocol.
async function checkPsalmHasLanguageServer(psalmScriptPath: string): Promise<boolean> {
  const exists: boolean = isFile(psalmScriptPath);
  if (!exists) {
    window.showMessage(
      'The setting psalm.psalmScriptPath refers to a path that does not exist. path: ' + psalmScriptPath,
      'error'
    );
    return false;
  }
  return true;
}

async function checkPsalmLanguageServerHasOption(
  phpExecutablePath: string,
  phpExecutableArgs: string | string[] | null,
  psalmScriptPath: string,
  psalmScriptArgs: string[],
  option: string
): Promise<boolean> {
  let stdout: string;
  try {
    const args: string[] = ['-f', psalmScriptPath, '--', '--help', ...psalmScriptArgs];
    if (phpExecutableArgs) {
      if (typeof phpExecutableArgs === 'string' && phpExecutableArgs.trim().length > 0) {
        args.unshift(phpExecutableArgs);
      } else if (Array.isArray(phpExecutableArgs) && phpExecutableArgs.length > 0) {
        args.unshift(...phpExecutableArgs);
      }
    }
    [stdout] = await execFile(phpExecutablePath, args);
    return new RegExp('(\\b|\\s)' + escapeRegExp(option) + '(?![-_])(\\b|\\s)', 'm').test(stdout);
  } catch (err) {
    return false;
  }
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export async function activate(context: ExtensionContext): Promise<void> {
  const conf = workspace.getConfiguration('psalm');

  const isEnable = conf.get<boolean>('enable', true);
  if (!isEnable) {
    return;
  }

  const phpExecutablePath = conf.get<string>('phpExecutablePath') || 'php';

  let phpExecutableArgs = conf.get<string>('phpExecutableArgs') || [
    '-dxdebug.remote_autostart=0',
    '-dxdebug.remote_enable=0',
    '-dxdebug_profiler_enable=0',
  ];

  // server path
  let psalmServerScriptPath: string;
  const customServerScriptPath = conf.get<string>('psalmScriptPath');
  const expandServerScriptPath = customServerScriptPath ? workspace.expand(customServerScriptPath) : undefined;
  let resolveServerScriptPath: string | undefined;
  if (expandServerScriptPath) {
    if (!expandServerScriptPath.startsWith('/')) {
      resolveServerScriptPath = path.join(workspace.root, expandServerScriptPath);
    } else {
      resolveServerScriptPath = expandServerScriptPath;
    }
  }
  if (resolveServerScriptPath && fs.existsSync(resolveServerScriptPath)) {
    psalmServerScriptPath = resolveServerScriptPath;
  } else {
    psalmServerScriptPath = path.join(workspace.root, 'vendor', 'vimeo', 'psalm', 'psalm-language-server');
  }

  const unusedVariableDetection = conf.get<boolean>('unusedVariableDetection') || false;
  const enableUseIniDefaults = conf.get<boolean>('enableUseIniDefaults') || false;
  const enableDebugLog = true; // conf.get<boolean>('enableDebugLog') || false;
  const psalmScriptExtraArgs = conf.get<string[]>('psalmScriptExtraArgs', []) || [];

  const analyzedFileExtensions: undefined | string[] | DocumentSelector = conf.get<string[] | DocumentSelector>(
    'analyzedFileExtensions'
  ) || [
    { scheme: 'file', language: 'php' },
    { scheme: 'untitled', language: 'php' },
  ];
  const psalmConfigPaths: string[] = conf.get<string[]>('configPaths') || ['psalm.xml', 'psalm.xml.dist'];

  // Check if psalm is installed and supports the language server protocol.
  const isValidPsalmVersion: boolean = await checkPsalmHasLanguageServer(psalmServerScriptPath);
  if (!isValidPsalmVersion) {
    return;
  }

  // Check path (if PHP is available and version is ^7.0.0)
  let stdout: string;
  try {
    [stdout] = await execFile(phpExecutablePath, ['--version']);
  } catch (err) {
    if (err instanceof Error) {
      if (err['code'] === 'ENOENT') {
        window.showMessage(
          `PHP executable not found. Install PHP 7 and add it to your PATH or set the php.executablePath setting`,
          'error'
        );
      } else {
        window.showErrorMessage('Error spawning PHP: ' + err.message);
        console.error(err);
      }
    }
    return;
  }

  // Parse version and discard OS info like 7.0.8--0ubuntu0.16.04.2
  const match = stdout.match(/^PHP ([^\s]+)/m);
  if (!match) {
    window.showErrorMessage('Error parsing PHP version. Please check the output of php --version');
    return;
  }
  let version = match[1].split('-')[0];
  // Convert PHP prerelease format like 7.0.0rc1 to 7.0.0-rc1
  if (!/^\d+.\d+.\d+$/.test(version)) {
    version = version.replace(/(\d+.\d+.\d+)/, '$1-');
  }
  if (semver.lt(version, '7.0.0')) {
    window.showErrorMessage('The language server needs at least PHP 7 installed. Version found: ' + version);
    return;
  }

  if (phpExecutableArgs) {
    if (typeof phpExecutableArgs === 'string' && phpExecutableArgs.trim().length > 0) {
      phpExecutableArgs = phpExecutableArgs.trim();
      if (phpExecutableArgs === '--') {
        phpExecutableArgs = [];
      }
    } else if (Array.isArray(phpExecutableArgs) && phpExecutableArgs.length > 0) {
      phpExecutableArgs = phpExecutableArgs.map((v) => v.trim()).filter((v) => v.length > 0 && v !== '--');
    }
  } else {
    phpExecutableArgs = [];
  }

  const psalmConfigPath = filterPath(psalmConfigPaths, workspace.root);
  if (psalmConfigPath === null) return;

  const psalmHasLanguageServerOption: boolean = await checkPsalmLanguageServerHasOption(
    phpExecutablePath,
    phpExecutableArgs,
    psalmServerScriptPath,
    [],
    '--language-server'
  );
  const psalmScriptArgs = psalmHasLanguageServerOption ? ['--language-server'] : [];
  if (psalmScriptExtraArgs) {
    if (Array.isArray(psalmScriptExtraArgs)) {
      psalmScriptArgs.unshift(...psalmScriptExtraArgs);
    }
  }
  const psalmHasExtendedDiagnosticCodes: boolean = await checkPsalmLanguageServerHasOption(
    phpExecutablePath,
    phpExecutableArgs,
    psalmServerScriptPath,
    psalmScriptArgs,
    '--use-extended-diagnostic-codes'
  );
  const psalmHasVerbose: boolean = enableDebugLog
    ? await checkPsalmLanguageServerHasOption(
        phpExecutablePath,
        phpExecutableArgs,
        psalmServerScriptPath,
        psalmScriptArgs,
        '--verbose'
      )
    : false;

  const serverOptionsCallbackForDirectory = (dirToAnalyze: string) => () =>
    new Promise<ChildProcess | StreamInfo>((resolve) => {
      // Listen on random port
      const spawnServer = (...args: string[]): ChildProcess => {
        if (unusedVariableDetection) {
          args.unshift('--find-dead-code');
        }

        if (psalmHasVerbose && enableDebugLog) {
          args.unshift('--verbose');
        }

        if (psalmHasExtendedDiagnosticCodes) {
          // this will add the help link to the diagnostic issue
          args.unshift('--use-extended-diagnostic-codes');
        }

        if (enableUseIniDefaults) {
          args.unshift('--use-ini-defaults');
        }

        args.unshift('-r', workspace.root);

        args.unshift('-c', path.join(workspace.root, psalmConfigPath));

        args.unshift(...psalmScriptArgs);

        // end of the psalm language server arguments, so we use the php cli argument separator
        args.unshift('--');

        // The server is implemented in PHP
        // this goes before the cli argument separator
        args.unshift('-f', psalmServerScriptPath);

        if (phpExecutableArgs) {
          if (Array.isArray(phpExecutableArgs)) {
            args.unshift(...phpExecutableArgs);
          } else {
            args.unshift(phpExecutableArgs);
          }
        }

        console.log('starting Psalm Language Server', phpExecutablePath, args);

        const childProcess = spawn(phpExecutablePath, args, { cwd: dirToAnalyze });
        childProcess.stderr.on('data', (chunk: Buffer) => {
          console.error(chunk + '');
        });
        if (enableDebugLog) {
          childProcess.stdin.on('data', (chunk: Buffer) => {
            console.log('in: ' + chunk);
          });
          childProcess.stdout.on('data', (chunk: Buffer) => {
            console.log('out: ' + chunk);
          });
        }
        childProcess.on('exit', (code, signal) => {
          console.log('Psalm Language Server exited: ' + code + ':' + signal);
        });
        return childProcess;
      };

      resolve(spawnServer());
    });

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for php (and maybe HTML) documents
    documentSelector: analyzedFileExtensions,
    synchronize: {
      // Synchronize the setting section 'psalm' to the server (TODO: server side support)
      configurationSection: 'psalm',
      fileEvents: [
        workspace.createFileSystemWatcher('**/' + psalmConfigPath),
        // this is for when files get changed outside of vscode
        workspace.createFileSystemWatcher('**/*.php'),
      ],
    },
    progressOnInitialization: !getConfigDisableProgressOnInitialization() ? true : false,
    diagnosticCollectionName: 'psalm',
    disabledFeatures: getLanguageClientDisabledFeatures(),
    middleware: {
      handleDiagnostics: (uri: string, diagnostics: Diagnostic[], next: HandleDiagnosticsSignature) => {
        diagnostics = diagnostics.filter((o) => (o.code = JSON.stringify(o.code, ['value']).replace('value', 'issue')));
        next(uri, diagnostics);
      },
      provideDefinition: async (
        document: LinesTextDocument,
        position: Position,
        token: CancellationToken,
        next: ProvideDefinitionSignature
      ) => {
        if (getConfigDisableDefinition()) return;

        const def = await next(document, position, token);
        return def;
      },
    },
  };

  // Create the language client and start the client.
  const lc = new LanguageClient(
    'psalm',
    'Psalm Language Server',
    serverOptionsCallbackForDirectory(workspace.root),
    clientOptions
  );

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  const disposable = lc.start();
  context.subscriptions.push(...registerCommands(lc), disposable);

  /** **CUSTOM** Add code action */
  const codeActionProvider = new PsalmCodeActionProvider();
  context.subscriptions.push(languages.registerCodeActionProvider(analyzedFileExtensions, codeActionProvider, 'psalm'));

  await lc.onReady();
}

function getLanguageClientDisabledFeatures() {
  const r: string[] = [];
  if (getConfigDisableCompletion()) r.push('completion');
  return r;
}

function getConfigDisableCompletion() {
  return workspace.getConfiguration('psalm').get<boolean>('disableCompletion', false);
}

function getConfigDisableDefinition() {
  return workspace.getConfiguration('psalm').get<boolean>('disableDefinition', false);
}

function getConfigDisableProgressOnInitialization() {
  return workspace.getConfiguration('psalm').get<boolean>('disableProgressOnInitialization', false);
}
