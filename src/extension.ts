'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import { curry, noop } from 'lodash';
import * as gitignoreToGlob from 'gitignore-to-glob';
import { sync as globSync } from 'glob';
import * as Cache from 'vscode-cache';

let cache;

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

function directoriesSync(root: string): string[] {
  const gitignoreFiles = walkupGitignores(root);
  const gitignoreGlobs =
    gitignoreFiles.map(gitignoreToGlob).reduce(flatten, []);

  const configFilesExclude = Object.assign(
    [],
    vscode.workspace.getConfiguration('adv-new-file').get('exclude'),
    vscode.workspace.getConfiguration('files.exclude')
  );
  const workspaceIgnored = Object.keys(configFilesExclude)
    .filter(key => configFilesExclude[key] === true);
  const workspaceIgnoredGlobs =
    gitignoreToGlob(workspaceIgnored.join('\n'), { string: true });

  const ignore =
    gitignoreGlobs.concat(workspaceIgnoredGlobs).map(invertGlob);

  const results = globSync('**', { cwd: root, ignore })
    .filter(f => fs.statSync(path.join(root, f)).isDirectory())
    .map(f => '/' + f);

  results.unshift('/');

  const repeatLast = vscode.workspace.getConfiguration('adv-new-file').get('repeatLast');
  if (repeatLast) {
    let last = cache.get('last', '/');
    results.unshift(last);
  }
  return results;
}

export function showQuickPick(choices: Promise<string[]>) {
  return vscode.window.showQuickPick(choices, {
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
    vscode.window.showInformationMessage(`Folder created: ${absolutePath}`);
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

export function handleRepeatLast(selection): PromiseLike<string> {
  const repeatLast = vscode.workspace.getConfiguration('adv-new-file').get('repeatLast');
  if (repeatLast) {
    cache.put('last', selection);
  }
  return Promise.resolve(selection);
}

export function activate(context: vscode.ExtensionContext) {
  cache = new Cache(context);
  let disposable =
    vscode.commands.registerCommand('extension.advancedNewFile', () => {
      let root = vscode.workspace.rootPath;

      if (root) {
        const resolverArgsCount = 2;
        const resolveAbsolutePath = curry(path.join, resolverArgsCount)(root);

        return showQuickPick(directories(root))
          .then(guardNoSelection)
          .then(handleRepeatLast)
          .then(showInputBox)
          .then(guardNoSelection)
          .then(resolveAbsolutePath)
          .then(createFileOrFolder)
          .then(openFile)
          .then(noop, noop);  // Silently handle rejections for now
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
