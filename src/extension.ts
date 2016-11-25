'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
const glob = require('glob-fs')({ gitignore: true });

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "advanced-new-file" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('extension.advancedNewFile', () => {
    let root = vscode.workspace.rootPath;

    function promptForNewFile(baseDirectory?: string) {
      if (!baseDirectory) return;

      function createNewFile(filename: string): string {
        let absolutePathToFile = path.join(root, baseDirectory, filename);
        let directoryToFile = path.dirname(absolutePathToFile);

        if (!fs.existsSync(absolutePathToFile)) {
          mkdirp.sync(directoryToFile);
          fs.appendFileSync(absolutePathToFile, '');
        }

        return absolutePathToFile;
      }

      function openNewFile(absolutePath: string): void {
        vscode.workspace.openTextDocument(absolutePath).then((textDocument) => {
          if (textDocument) vscode.window.showTextDocument(textDocument)
        });
      }

      return vscode.window.showInputBox({
        prompt: `Relative to ${baseDirectory}`,
        placeHolder: 'Filename'
      }).then(createNewFile).then(openNewFile);
    }

    let existingDirectories = glob
      .readdirSync('**', { cwd: root })
      .filter(f => fs.statSync(path.join(root, f)).isDirectory())

    existingDirectories.unshift('/');

    vscode.window.showQuickPick(existingDirectories, {
      placeHolder: 'Create relative to existing directory'
    }).then(promptForNewFile);
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}