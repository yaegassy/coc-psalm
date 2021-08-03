import * as coc from 'coc.nvim';

interface Command {
  id: string;
  execute(): Promise<coc.Disposable>;
}

function analyzeWorkSpace(client: coc.LanguageClient): Command {
  return {
    id: 'psalm.analyzeWorkSpace',
    async execute() {
      await client.stop();
      return client.start();
    },
  };
}

function restartPsalmServer(client: coc.LanguageClient): Command {
  return {
    id: 'psalm.restartPsalmServer',
    async execute() {
      await client.stop();
      return client.start();
    },
  };
}

export function registerCommands(client: coc.LanguageClient): coc.Disposable[] {
  const commands: Command[] = [restartPsalmServer(client), analyzeWorkSpace(client)];

  const disposables = commands.map((command) => {
    return coc.commands.registerCommand(command.id, command.execute);
  });

  return disposables;
}
