import {
  TextDocument,
  CodeAction,
  CodeActionContext,
  CodeActionProvider,
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Position,
  Range,
  TextEdit,
  window,
  workspace,
  WorkspaceEdit,
  commands,
} from 'coc.nvim';

import path from 'path';

export class PsalmCodeActionProvider implements CodeActionProvider {
  private readonly source = 'psalmLanguageServer';
  private outputChannel = window.createOutputChannel('psalmLanguageServer-action');
  private diagnosticCollection = languages.createDiagnosticCollection(this.source);

  public async provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext) {
    const doc = workspace.getDocument(document.uri);
    const wholeRange = Range.create(0, 0, doc.lineCount, 0);
    let whole = false;
    if (
      range.start.line === wholeRange.start.line &&
      range.start.character === wholeRange.start.character &&
      range.end.line === wholeRange.end.line &&
      range.end.character === wholeRange.end.character
    ) {
      whole = true;
    }
    const codeActions: CodeAction[] = [];
    const fixInfoDiagnostics: Diagnostic[] = [];

    for (const diagnostic of context.diagnostics) {
      //this.outputChannel.appendLine(`DEBUG: ${JSON.stringify(diagnostic)}\n`);
      if (diagnostic.code) {
        //this.outputChannel.appendLine(`DEBUG: ${JSON.parse(JSON.stringify(diagnostic.code))}\n`);

        /** type guard */
        if (typeof diagnostic.code === 'string') {
          let url = JSON.parse(diagnostic.code).issue;

          this.outputChannel.appendLine(`URL: ${url}\n`);

          let title = `Show issue for ${url} (Open url)`;

          let command = {
            title: '',
            command: 'vscode.open',
            arguments: [url],
          };

          const action: CodeAction = {
            title,
            command,
          };

          codeActions.push(action);
        }
      }
    }

    // /**
    //  * TODO: Add @psalm suppress for current line
    //  *
    //  * You need to respect the indentation of the existing lines.
    //  */
    // if (range.start.line === range.end.line && range.start.character === 0) {
    //   const edit = TextEdit.insert(
    //     Position.create(range.start.line, range.start.character),
    //     '/** @psalm-suppress all */\n'
    //   );
    //   codeActions.push({
    //     title: 'Add @psalm suppress for current line',
    //     edit: {
    //       changes: {
    //         [doc.uri]: [edit],
    //       },
    //     },
    //   });
    // }
    //
    // /**
    //  * TODO: Add @psalm suppress for current file
    //  *
    //  * You need to parse the file or buffer and retrieve the "<?php", "<?",
    //  * or "declare(strict_type=1)" lines and add them to the appropriate locations.
    //  */
    // if (whole) {
    //   const suppressBlockComment = `/**\n * @psalm-suppress all\n */\n`;
    //   const edit = TextEdit.insert(Position.create(1, 0), suppressBlockComment);
    //   codeActions.push({
    //     title: 'Add @psalm suppress for current file',
    //     edit: {
    //       changes: {
    //         [doc.uri]: [edit],
    //       },
    //     },
    //   });
    // }

    return codeActions;
  }
}
