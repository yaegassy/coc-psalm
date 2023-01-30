# coc-psalm

[coc.nvim](https://github.com/neoclide/coc.nvim) extension for [Psalm](https://psalm.dev/) language server.

"Psalm" started as a static analysis tool, but now it also has the features of a [Language Server](https://psalm.dev/docs/running_psalm/language_server/).

<img width="780" alt="coc-psalm-screenshot" src="https://user-images.githubusercontent.com/188642/105113456-53e03280-5b08-11eb-8fad-5a2bb0aa33a0.png">

## Install

```
:CocInstall coc-psalm
```

## Note

Install `psalm` in your project.

```
composer require --dev vimeo/psalm
```

**Required:** The project must contain a `psalm.xml` or `psalm.xml.dist` file as a condition for starting "coc-psalm".

```sh
./vendor/bin/psalm --init
```

## Configuration options

- `psalm.enable`: Enable coc-psalm extension, default: `true`
- `psalm.disableCompletion`: Disable completion only, default: `false`
- `psalm.disableDefinition`: Disable definition only, default: `false`
- `psalm.disableProgressOnInitialization`: Disable ProgressOnInitialization only, default: `false`
- `psalm.phpExecutablePath`: Optional, defaults to searching for "php". The path to a PHP 7.0+ executable to use to execute the Psalm server. The PHP 7.0+ installation should preferably include and enable the PHP module `pcntl`. (Modifying requires restart), default: `null`
- `psalm.phpExecutableArgs`: Optional (Advanced), default is '-dxdebug.remote_autostart=0 -dxdebug.remote_enable=0 -dxdebug_profiler_enable=0'.  Additional PHP executable CLI arguments to use, default: `["-dxdebug.remote_autostart=0", "-dxdebug.remote_enable=0", "-dxdebug_profiler_enable=0"]`
- `psalm.psalmScriptPath`: Optional (Advanced). If provided, this overrides the Psalm server script to use, e.g. `vendor/bin/psalm-language-server`, `$HOME/path/to/psalm-language-server`, `~/path/to/psalm-language-server` (Modifying requires restart), default: `null`
- `psalm.psalmScriptExtraArgs`: Optional (Advanced). Additional arguments to the Psalm language server. (Modifying requires restart), default: `[]`
- `psalm.enableUseIniDefaults`: Enable this to use PHP-provided ini defaults for memory and error display. (Modifying requires restart), default: `false`
- `psalm.enableDebugLog`: Enable this to print messages, default: `false`
- `psalm.analyzedFileExtensions`: A list of file extensions to request Psalm to analyze. By default, this only includes 'php' (Modifying requires restart), default: `[{ "scheme": "file", "language": "php" }, { "scheme": "untitled", "language": "php" }]`
- `psalm.unusedVariableDetection`: Enable this to enable unused variable and parameter detection, default: `false`
- `psalm.configPaths`: A list of files to checkup for psalm configuration (relative to the workspace directory), default: `["psalm.xml", "psalm.xml.dist"]`
- `psalm.trace.server`: Traces the communication between coc.nvim and the Psalm language server, valid options `["off", "messages", "verbose"]`, default: `off`

## Commands

- `psalm.restartPsalmServer`: Restart Psalm Language server
- `psalm.analyzeWorkSpace`: Analyze Workspace

## Code Actions

**Example key mapping (Code Action related)**:

```vim
nmap <silent> ga <Plug>(coc-codeaction-line)
```

**Usage**:

In the line with diagnostic message, enter the mapped key (e.g. `ga`) and you will see a list of code actions that can be performed.

**Actions**:

- `Add @psalm suppress for this line`
- `Show issue for https://psalm.dev/xxx`: Open the issue url in your browser

## "psalm.xml" or "psalm.xml.dist" completion and linting and more...

To use it, you need to install [coc-xml](https://github.com/fannheyward/coc-xml).

## Thanks

- [vimeo/psalm](https://github.com/vimeo/psalm)
- [psalm/psalm-vscode-plugin](https://github.com/psalm/psalm-vscode-plugin)

## License

MIT

---

> This extension is built with [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
