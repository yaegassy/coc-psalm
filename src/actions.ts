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
  //private outputChannel = window.createOutputChannel('psalmLanguageServer-action');
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

    /** Add @psalm suppress for this line */
    if (range.start.line === range.end.line && range.start.character === 0 && context.diagnostics.length > 0) {
      const thisLineFullLength = doc.getline(range.start.line).length;
      const thisLineTrimLength = doc.getline(range.start.line).trim().length;
      const suppressLineLength = thisLineFullLength - thisLineTrimLength;

      let suppressLineNewText = '/** @psalm-suppress all */\n';
      if (suppressLineLength > 0) {
        let addIndentSpace = ' '.repeat(suppressLineLength);
        suppressLineNewText = '/** @psalm-suppress all */\n' + addIndentSpace;
      }

      let thisLineContent = doc.getline(range.start.line);
      thisLineContent = thisLineContent.trim();

      /** MEMO: For "DocComment" line, do not add suppress action */
      if (!thisLineContent.startsWith('/**') && !thisLineContent.startsWith('*')) {
        const edit = TextEdit.insert(Position.create(range.start.line, suppressLineLength), suppressLineNewText);
        codeActions.push({
          title: 'Add @psalm suppress for this line',
          edit: {
            changes: {
              [doc.uri]: [edit],
            },
          },
        });
      }
    }

    /** Add @psalm suppress for the entire file */
    /** MEMO: Since file-level suppression is not supported in the current psalm, comment out this feature */
    // if (whole && context.diagnostics.length > 0) {
    //   const suppressFileNewText = `/** @psalm-suppress all */\n`;
    //   let suppressFileLine = 0;
    //   let isSuppressFilleLine = false;
    //
    //   for (let [i, v] of (await doc.buffer.lines).entries()) {
    //     v = v.trim();
    //     if (v.endsWith('declare(strict_types=1);')) {
    //       suppressFileLine = i + 1;
    //       isSuppressFilleLine = true;
    //     } else if (v.endsWith('<?php')) {
    //       suppressFileLine = i + 1;
    //       isSuppressFilleLine = true;
    //     }
    //   }
    //
    //   if (isSuppressFilleLine) {
    //     const edit = TextEdit.insert(Position.create(suppressFileLine, 0), suppressFileNewText);
    //     codeActions.push({
    //       title: 'Add @psalm suppress for the entire file',
    //       edit: {
    //         changes: {
    //           [doc.uri]: [edit],
    //         },
    //       },
    //     });
    //   }
    // }

    /** Show issue for ${url} */
    for (const diagnostic of context.diagnostics) {
      //this.outputChannel.appendLine(`DEBUG: ${JSON.stringify(diagnostic)}\n`);
      if (diagnostic.code) {
        //this.outputChannel.appendLine(`DEBUG: ${JSON.parse(JSON.stringify(diagnostic.code))}\n`);

        /** type guard */
        if (typeof diagnostic.code === 'string') {
          let url = JSON.parse(diagnostic.code).issue;
          //this.outputChannel.appendLine(`URL: ${url}\n`);

          let title = `Show issue for ${url}`;
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

    return codeActions;
  }
}
