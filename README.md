# coc-psalm

> fork from a [psalm/psalm-vscode-plugin](https://github.com/psalm/psalm-vscode-plugin)

[coc.nvim](https://github.com/neoclide/coc.nvim) extension for [Psalm](https://psalm.dev/) language server (PHP static analysis tool)

<img width="780" alt="coc-psalm-screenshot" src="https://user-images.githubusercontent.com/188642/105113456-53e03280-5b08-11eb-8fad-5a2bb0aa33a0.png">

## Install

For example, [vim-plug](https://github.com/junegunn/vim-plug) users:

```vim
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'yaegassy/coc-psalm', {'do': 'yarn install --frozen-lockfile'}
```

> TODO: Publish to the npm registry

## Note

Requires `psalm.xml` or `psalm.xml.dist` configuration file in the "project root".

```sh
./vendor/bin/psalm --init
```

## Configuration options

- `psalm.enable`: Enable coc-psalm extension, default: `true`
- `psalm.phpExecutablePath`: Optional, defaults to searching for "php". The path to a PHP 7.0+ executable to use to execute the Psalm server. The PHP 7.0+ installation should preferably include and enable the PHP module `pcntl`. (Modifying requires restart), default: `null`
- `psalm.phpExecutableArgs`: Optional (Advanced), default is '-dxdebug.remote_autostart=0 -dxdebug.remote_enable=0 -dxdebug_profiler_enable=0'.  Additional PHP executable CLI arguments to use, default: `["-dxdebug.remote_autostart=0", "-dxdebug.remote_enable=0", "-dxdebug_profiler_enable=0"]`
- `psalm.psalmScriptPath`: Optional (Advanced). If provided, this overrides the Psalm script to use, e.g. vendor/bin/psalm-language-server. (Modifying requires restart), default: `null`
- `psalm.enableDebugLog`: Enable this to print messages, default: `false`
- `psalm.analyzedFileExtensions`: A list of file extensions to request Psalm to analyze. By default, this only includes 'php' (Modifying requires restart), default: `[{ "scheme": "file", "language": "php" }, { "scheme": "untitled", "language": "php" }]`
- `psalm.unusedVariableDetection`: Enable this to enable unused variable and parameter detection, default: `false`
- `psalm.configPaths`: A list of files to checkup for psalm configuration (relative to the workspace directory), default: `["psalm.xml", "psalm.xml.dist"]`

## License

MIT

---

> This extension is created by [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
