'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
const { curry, noop } = require('lodash'); // Typings for curry are broken
import { sync as globSync } from 'glob';
const gitignoreToGlob = require('gitignore-to-glob'); // No typings exist yet

function invertGlob(pattern) {
  return pattern.replace(/^!/, '');
}

export function showQuickPick(choices: string[]) {
  return vscode.window.showQuickPick(choices, {
    placeHolder: 'First, select an existing path to create relative to'
  });
}

export function showInputBox(baseDirectory: string) {
  const resolverArgsCount = 2;
  const resolveRelativePath =
    curry(path.join, resolverArgsCount)(baseDirectory);

  return vscode.window.showInputBox({
    prompt: `Relative to ${baseDirectory}`,
    placeHolder: 'Filename or relative path to file'
  }).then(resolveRelativePath);
}

export function directories(root: string): string[] {
  const gitignoreFile = path.join(root, '.gitignore');
  const gitignoreGlobs = fs.existsSync(gitignoreFile) ?
    gitignoreToGlob(gitignoreFile) :
    [];

  const configFilesExclude = vscode.workspace.getConfiguration('files.exclude');
  const workspaceIgnored = Object.keys(configFilesExclude)
    .filter(key => configFilesExclude[key] === true);
  const workspaceIgnoredGlobs =
    gitignoreToGlob(workspaceIgnored.join('\n'), { string: true });

  const ignore = gitignoreGlobs.concat(workspaceIgnoredGlobs).map(invertGlob);

  const results = globSync('**', { cwd: root, ignore })
    .filter(f => fs.statSync(path.join(root, f)).isDirectory())
    .map(f => '/' + f);

  results.unshift('/');

  return results;
}

export function createFile(absolutePath: string): string {
  let directoryToFile = path.dirname(absolutePath);

  if (!fs.existsSync(absolutePath)) {
    mkdirp.sync(directoryToFile);
    fs.appendFileSync(absolutePath, '');
  }

  return absolutePath;
}

export function openFile(absolutePath: string): PromiseLike<string> {
  return vscode.workspace.openTextDocument(absolutePath)
    .then((textDocument) => {
      if (textDocument) {
        vscode.window.showTextDocument(textDocument);
        return Promise.resolve(absolutePath);
      } else {
        return Promise.reject('Could not open document');
      }
    });
}

export function guardNoSelection(selection?: string): PromiseLike<string> {
  if (!selection) return Promise.reject('No selection');
  return Promise.resolve(selection);
}

export function activate(context: vscode.ExtensionContext) {
  let disposable =
    vscode.commands.registerCommand('extension.advancedNewFile', () => {
      let root = vscode.workspace.rootPath;

      if (root) {
        const resolverArgsCount = 2;
        const resolveAbsolutePath = curry(path.join, resolverArgsCount)(root);

        return showQuickPick(directories(root))
          .then(guardNoSelection)
          .then(showInputBox)
          .then(guardNoSelection)
          .then(resolveAbsolutePath)
          .then(createFile)
          .then(openFile)
          .then(noop, noop); // Silently handle rejections for now
      } else {
        return vscode.window.showErrorMessage(
          'It doesn\'t look like you have a folder opened in your workspace. ' +
          'Try opening a folder first.'
        );
      }
    });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
