'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import { curry, noop } from 'lodash';
import * as gitignoreToGlob from 'gitignore-to-glob';
import { sync as globSync } from 'glob';
import * as Cache from 'vscode-cache';
import * as Promise from 'bluebird';
import { QuickPickItem } from 'vscode';

interface FSLocation {
  relative: string;
  absolute: string;
}

interface WorkspaceRoot {
  rootPath: string;
  baseName: string;
  multi: boolean;
  vsCodeFolder?: vscode.WorkspaceFolder;
}

interface DirectoryOption {
  displayText: string;
  fsLocation: FSLocation;
}

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

function configIgnoredGlobs(root: string): string[] {
  const configFilesExclude = Object.assign(
    [],
    vscode.workspace.getConfiguration('advancedNewFile').get('exclude'),
    vscode.workspace.getConfiguration('files.exclude', vscode.Uri.file(root))
  );
  const configIgnored = Object.keys(configFilesExclude)
    .filter(key => configFilesExclude[key] === true);

  return gitignoreToGlob(configIgnored.join('\n'), { string: true });
}

function directoriesSync(root: string): FSLocation[] {
  const ignore =
    gitignoreGlobs(root).concat(configIgnoredGlobs(root)).map(invertGlob);

  const results = globSync('**', { cwd: root, ignore })
    .map((f): FSLocation => {
      return {
        relative: path.join(path.sep, f),
        absolute: path.join(root, f)
      };
    })
    .filter(f => fs.statSync(f.absolute).isDirectory())
    .map(f => f);

  return results;
}

export function showQuickPick(choices: Promise<vscode.QuickPickItem[]>) {
  return vscode.window.showQuickPick<vscode.QuickPickItem>(choices, {
    placeHolder: 'First, select an existing path to create relative to ' +
    '(larger projects may take a moment to load)'
  });
}

export function showInputBox(baseDirectory: DirectoryOption) {
  const resolverArgsCount = 2;
  const resolveAbsolutePath =
    curry(path.join, resolverArgsCount)(baseDirectory.fsLocation.absolute);

  return vscode.window.showInputBox({
    prompt: `Relative to ${baseDirectory.displayText}`,
    placeHolder: 'Filename or relative path to file'
  }).then(resolveAbsolutePath);
}

export function directories(root: string): Promise<FSLocation[]> {
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

export function toQuickPickItems(options: DirectoryOption[]): vscode.QuickPickItem[] {
  return options.map((option) => {
    return {
      label: option.displayText,
      description: null,
      option: option
    };
  });
}

export function prependChoice(choices: vscode.QuickPickItem[], option: DirectoryOption, description: string): vscode.QuickPickItem[] {
  if (option) {
    const choice = {
      label: option.displayText,
      description: description,
      option: option
    }

    choices.unshift(choice);
  }

  return choices;
}

export function currentEditorPath(): string {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return;

  return path.dirname(activeEditor.document.fileName);
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

export function guardNoSelection<T>(selection?: T): PromiseLike<T> {
  if (!selection) return Promise.reject('No selection');
  return Promise.resolve(selection);
}

export function cacheSelection(cache: Cache): (selection: DirectoryOption) => DirectoryOption {
  return function(selection) {
    cache.put('last', selection);
    return selection;
  }
}

export function lastSelection(cache: Cache): DirectoryOption {
  if (!cache.has('last')) return;
  return cache.get('last') as DirectoryOption;
}

export function unwrapSelection(selection: vscode.QuickPickItem): DirectoryOption {
  return selection['option'];
}

export function workspaceRoots(): WorkspaceRoot[] {
  if (vscode.workspace.workspaceFolders) {
    const multi = vscode.workspace.workspaceFolders.length > 1

    return vscode.workspace.workspaceFolders.map((folder) => {
      return {
        rootPath: folder.uri.fsPath,
        baseName: path.basename(folder.uri.fsPath),
        multi: multi,
        vsCodeFolder: folder
      };
    });
  } else if (vscode.workspace.rootPath) {
    return [{
      rootPath: vscode.workspace.rootPath,
      baseName: path.basename(vscode.workspace.rootPath),
      multi: false
    }];
  } else {
    return [];
  }
}

function optionsForRoot(root: WorkspaceRoot): PromiseLike<DirectoryOption[]> {
  return directories(root.rootPath)
    .map(((dir): DirectoryOption => {
      const displayText = root.multi ?
        path.join(path.sep, root.baseName, dir.relative) :
        dir.relative;

      return {
        displayText: displayText,
        fsLocation: dir
      };
  }));
}

export function prependRootChoices(roots: WorkspaceRoot[]) {
  return function(choices: vscode.QuickPickItem[]): vscode.QuickPickItem[] {
    roots.forEach((root) => {
      const option: DirectoryOption = {
        displayText: root.multi ? path.join(path.sep, root.baseName) : path.sep,
        fsLocation: {
          relative: path.sep,
          absolute: root.rootPath
        }
      };

      prependChoice(choices, option, '- workspace root');
    });

    return choices;
  }
}

export function prependCurrentEditorPathChoice(roots: WorkspaceRoot[]) {
  return function(choices: vscode.QuickPickItem[]): vscode.QuickPickItem[] {
    const currentFilePath = currentEditorPath()
    const currentFileRoot = roots.find(r => currentFilePath.indexOf(r.rootPath) === 0)

    if (currentFileRoot) {
      const rootMatcher = new RegExp(`^${currentFileRoot.rootPath}`);
      const relativeCurrentFilePath = currentFilePath.replace(rootMatcher, '');

      const option: DirectoryOption = {
        displayText: currentFileRoot.multi ? path.join(path.sep, currentFileRoot.baseName, relativeCurrentFilePath) : relativeCurrentFilePath,
        fsLocation: {
          relative: relativeCurrentFilePath,
          absolute: currentFilePath
        }
      }

      prependChoice(choices, option, '- current file');
    }

    return choices;
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable =
    vscode.commands.registerCommand('extension.advancedNewFile', () => {
      const roots = workspaceRoots();

      if (roots.length >= 0) {
        const cacheName = roots.map(r => r.rootPath).join(';')
        const cache = new Cache(context, `workspace:${cacheName}`);

        const choices = Promise.map(roots, optionsForRoot)
          .reduce(flatten, [])
          .then(toQuickPickItems)
          .then(prependRootChoices(roots))
          .then(prependCurrentEditorPathChoice(roots))
          .then((c) => prependChoice(c, lastSelection(cache), '- last selection'));

        return showQuickPick(choices)
          .then(guardNoSelection)
          .then(unwrapSelection)
          .then(cacheSelection(cache))
          .then(showInputBox)
          .then(guardNoSelection)
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
