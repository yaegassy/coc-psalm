import {
  ExtensionContext,
  window,
  LanguageClient,
  LanguageClientOptions,
  StreamInfo,
  DocumentSelector,
  workspace,
  Diagnostic,
  HandleDiagnosticsSignature,
  commands,
} from 'coc.nvim';

import * as path from 'path';
import { spawn, execFile, ChildProcess } from 'mz/child_process';
import * as semver from 'semver';
import * as fs from 'fs';

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

  const defaultPsalmClientScriptPath = path.join('vendor', 'vimeo', 'psalm', 'psalm');
  const defaultPsalmServerScriptPath = path.join('vendor', 'vimeo', 'psalm', 'psalm-language-server');
  let psalmClientScriptPath = conf.get<string>('psalmClientScriptPath') || defaultPsalmClientScriptPath;
  let psalmServerScriptPath = conf.get<string>('psalmScriptPath') || defaultPsalmServerScriptPath;
  const unusedVariableDetection = conf.get<boolean>('unusedVariableDetection') || false;
  const enableDebugLog = true; // conf.get<boolean>('enableDebugLog') || false;

  const analyzedFileExtensions: undefined | string[] | DocumentSelector = conf.get<string[] | DocumentSelector>(
    'analyzedFileExtensions'
  ) || [
    { scheme: 'file', language: 'php' },
    { scheme: 'untitled', language: 'php' },
  ];
  const psalmConfigPaths: string[] = conf.get<string[]>('configPaths') || ['psalm.xml', 'psalm.xml.dist'];

  // Check if the psalmServerScriptPath setting was provided.
  if (!fs.existsSync(psalmServerScriptPath)) {
    window.showMessage(
      `The setting psalm.psalmScriptPath must be provided (e.g. vendor/bin/psalm-language-server)`,
      'error'
    );
    return;
  }

  // Check if the psalmClientScriptPath setting was provided.
  if (!psalmClientScriptPath) {
    window.showMessage(`The setting psalm.psalmClientScriptPath must be provided (e.g. vendor/bin/psalm)`, 'error');
    return;
  }

  const workspacePath = workspace.root;

  if (!isFile(psalmServerScriptPath)) {
    psalmServerScriptPath = path.join(workspacePath, psalmServerScriptPath);
  }

  if (!isFile(psalmClientScriptPath)) {
    psalmClientScriptPath = path.join(workspacePath, psalmClientScriptPath);
  }

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
    if (err.code === 'ENOENT') {
      window.showMessage(
        `PHP executable not found. Install PHP 7 and add it to your PATH or set the php.executablePath setting`,
        'error'
      );
    } else {
      window.showErrorMessage('Error spawning PHP: ' + err.message);
      console.error(err);
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

  // **NOTE**
  // In coc-psalm, activationEvents are intentionally set to "workspaceContains:psalm.xml" or "workspaceContains:psalm.xml.dist".
  // In order for this to work, you need to change activationEvents to "onLanguage:php".
  const psalmConfigPath = filterPath(psalmConfigPaths, workspacePath);
  if (psalmConfigPath === null) {
    window
      .showWarningMessage('No psalm.xml config found in project root. Want to configure one?', 'Yes', 'No')
      .then(async (result) => {
        if (result == 'Yes') {
          await execFile(phpExecutablePath, [psalmClientScriptPath, '--init'], { cwd: workspacePath });
          window
            .showInformationMessage(
              'Psalm configuration has been initialized. To make the setting effective, run :CocRestart.',
              'Restart coc.nvim'
            )
            .then((result) => {
              if (result == 'Restart coc.nvim') {
                commands.executeCommand('editor.action.restart');
              }
            });
        }
      });
    return;
  }

  const psalmHasLanguageServerOption: boolean = await checkPsalmLanguageServerHasOption(
    phpExecutablePath,
    phpExecutableArgs,
    psalmServerScriptPath,
    [],
    '--language-server'
  );
  const psalmScriptArgs = psalmHasLanguageServerOption ? ['--language-server'] : [];
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

        args.unshift('-r', workspacePath);

        args.unshift('-c', path.join(workspacePath, psalmConfigPath));

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
    progressOnInitialization: true,
    disableCompletion: true,
    disableSnippetCompletion: true,
    diagnosticCollectionName: 'psalm',
    middleware: {
      handleDiagnostics: (uri: string, diagnostics: Diagnostic[], next: HandleDiagnosticsSignature) => {
        diagnostics = diagnostics.filter((o) => (o.code = JSON.stringify(o.code, ['value']).replace('value', 'see')));
        next(uri, diagnostics);
      },
    },
  };

  // Create the language client and start the client.
  const lc = new LanguageClient(
    'psalmLanguageServer',
    'Psalm Language Server',
    serverOptionsCallbackForDirectory(workspacePath),
    clientOptions
  );

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  const disposable = lc.start();
  context.subscriptions.push(...registerCommands(lc), disposable);

  await lc.onReady();
}
