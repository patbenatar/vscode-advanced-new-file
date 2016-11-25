'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
const { curry, noop } = require('lodash'); // Typings for curry appear to be broken
const glob = require('glob-fs')({ gitignore: true });

export function showQuickPick(choices: string[]) {
  return vscode.window.showQuickPick(choices, {
    placeHolder: 'Create relative to existing directory'
  });
}

export function showInputBox(baseDirectory?: string) {
  if (!baseDirectory) return;

  let resolveRelativePath = curry(path.join, 2)(baseDirectory);

  return vscode.window.showInputBox({
    prompt: `Relative to ${baseDirectory}`,
    placeHolder: 'Filename'
  }).then(resolveRelativePath);
}

export function directories(root: string): string[] {
  let directories = glob
    .readdirSync('**', { cwd: root })
    .filter(f => fs.statSync(path.join(root, f)).isDirectory())
    .map(f => '/' + f);

  directories.unshift('/');

  return directories;
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
  return vscode.workspace.openTextDocument(absolutePath).then((textDocument) => {
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
  let disposable = vscode.commands.registerCommand('extension.advancedNewFile', () => {
    let root = vscode.workspace.rootPath;
    let resolveAbsolutePath = curry(path.join, 2)(root);

    showQuickPick(directories(root))
      .then(guardNoSelection)
      .then(showInputBox)
      .then(guardNoSelection)
      .then(resolveAbsolutePath)
      .then(createFile)
      .then(openFile)
      .then(noop, noop); // Silently handle rejections for now
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}