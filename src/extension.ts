'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import { curry, noop } from 'lodash';
import * as gitignoreToGlob from 'gitignore-to-glob';
import { sync as globSync } from 'glob';
import * as Cache from 'vscode-cache';

function isFolderDescriptor(filepath) {
  return filepath.charAt(filepath.length - 1) === path.sep;
}

function invertGlob(pattern) {
  return pattern.replace(/^!/, '');
}

function walkupGitignores(dir, found = []) {
  const gitignore = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignore)) found.push(gitignore);

  const parentDir = path.resolve(dir, '..');
  const reachedSystemRoot = dir === parentDir;

  if (!reachedSystemRoot) {
    return walkupGitignores(parentDir, found);
  } else {
    return found;
  }
}

function flatten(memo, item) {
  return memo.concat(item);
}

function gitignoreGlobs(root: string): string[] {
  const gitignoreFiles = walkupGitignores(root);
  return gitignoreFiles.map(gitignoreToGlob).reduce(flatten, []);
}

function configIgnoredGlobs(): string[] {
  const configFilesExclude = Object.assign(
    [],
    vscode.workspace.getConfiguration('advancedNewFile').get('exclude'),
    vscode.workspace.getConfiguration('files.exclude')
  );
  const configIgnored = Object.keys(configFilesExclude)
    .filter(key => configFilesExclude[key] === true);

  return gitignoreToGlob(configIgnored.join('\n'), { string: true });
}

function directoriesSync(root: string): string[] {
  const ignore =
    gitignoreGlobs(root).concat(configIgnoredGlobs()).map(invertGlob);

  const results = globSync('**', { cwd: root, ignore })
    .filter(f => fs.statSync(path.join(root, f)).isDirectory())
    .map(f => path.normalize(f));

  return results;
}

export function showQuickPick(choices: Promise<vscode.QuickPickItem[]>) {
  return vscode.window.showQuickPick<vscode.QuickPickItem>(choices, {
    placeHolder: 'First, select an existing path to create relative to ' +
    '(larger projects may take a moment to load)'
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

export function directories(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const findDirectories = () => {
      try {
        resolve(directoriesSync(root));
      } catch (error) {
        reject(error);
      }
    };

    const delayToAllowVSCodeToRender = 1;
    setTimeout(findDirectories, delayToAllowVSCodeToRender);
  });
}

export function toQuickPickItems(choices: string[]): Promise<vscode.QuickPickItem[]> {
  return Promise.resolve(choices.map((choice) => {
    return { label: choice, description: null };
  }));
}

export function prependChoice(label: string, description: string): (choices: vscode.QuickPickItem[]) => vscode.QuickPickItem[] {
  return function(choices) {
    if (label) {
      const choice = {
        label: label,
        description: description
      }

      choices.unshift(choice);
    }

    return choices;
  }
}

export function currentEditorPath(): string {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return;

  const currentFilePath = path.dirname(activeEditor.document.fileName);
  const rootMatcher = new RegExp(`^${vscode.workspace.rootPath}`);
  const relativeCurrentFilePath = currentFilePath.replace(rootMatcher, '');

  return relativeCurrentFilePath;
}

export function createFileOrFolder(absolutePath: string): string {
  let directoryToFile = path.dirname(absolutePath);

  if (!fs.existsSync(absolutePath)) {
    if (isFolderDescriptor(absolutePath)) {
      mkdirp.sync(absolutePath);
    } else {
      mkdirp.sync(directoryToFile);
      fs.appendFileSync(absolutePath, '');
    }
  }

  return absolutePath;
}

export function openFile(absolutePath: string): PromiseLike<string> {
  if (isFolderDescriptor(absolutePath)) {
    if (vscode.workspace.getConfiguration('advancedNewFile').get('showInformationMessages', true)) {
      vscode.window.showInformationMessage(`Folder created: ${absolutePath}`);
    }
    return Promise.resolve(absolutePath);
  }

  return vscode.workspace.openTextDocument(absolutePath)
    .then((textDocument): PromiseLike<string> => {
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

export function cacheSelection(cache: Cache): (selection: string) => string {
  return function(selection: string) {
    cache.put('last', selection);
    return selection;
  }
}

export function lastSelection(cache: Cache): string {
  if (!cache.has('last')) return;
  return cache.get('last') as string;
}

export function unwrapSelection(selection?: vscode.QuickPickItem): string {
  if (!selection) return;
  return selection.label;
}

export function activate(context: vscode.ExtensionContext) {
  let disposable =
    vscode.commands.registerCommand('extension.advancedNewFile', () => {
      const editor = vscode.window.activeTextEditor;
      let currentFileRoot: string = undefined;

      if (vscode.workspace.workspaceFolders.length > 0) {
        if (editor) {
          currentFileRoot = vscode.workspace.getWorkspaceFolder(editor.document.uri).uri.fsPath;
        }

        const cache = new Cache(context, `workspace:${currentFileRoot}`);
        const resolverArgsCount = 2;

        const currentFilePicks = currentFileRoot ? directories(currentFileRoot) : Promise.resolve([]);
        const resolveAbsolutePath = (typedPath) => {
          if (!currentFileRoot) {
            return typedPath;
          }

          return path.resolve(currentFileRoot, typedPath);
        }

        const choices = currentFilePicks
          .then(toQuickPickItems)
          .then((itemsBeforeWorkspaceRoots) => {
            return vscode.workspace.workspaceFolders.reduce(
              (items, wsFolder) => prependChoice(
                wsFolder.uri.fsPath,
                `- workspace ${wsFolder.name} root`)(items),
              itemsBeforeWorkspaceRoots
            );
          })
          .then(prependChoice(currentEditorPath(), '- current file'))
          .then(prependChoice(lastSelection(cache), '- last selection'));

        return showQuickPick(choices)
          .then(unwrapSelection)
          .then(guardNoSelection)
          .then(cacheSelection(cache))
          .then(showInputBox)
          .then(guardNoSelection)
          .then(resolveAbsolutePath)
          .then(createFileOrFolder)
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

export function deactivate() { }
