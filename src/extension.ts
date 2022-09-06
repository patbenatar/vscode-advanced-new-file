'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import { compact, startsWith, sortBy } from 'lodash';
import * as gitignoreToGlob from 'gitignore-to-glob';
import { sync as globSync } from 'glob';
import * as Cache from 'vscode-cache';
import { QuickPickItem, ViewColumn } from 'vscode';
import * as braces from 'braces';
const micromatch = require('micromatch');
export interface FSLocation {
  relative: string;
  absolute: string;
}

export interface WorkspaceRoot {
  rootPath: string;
  baseName: string;
  multi: boolean;
}

export interface DirectoryOption {
  displayText: string;
  fsLocation: FSLocation;
}

declare module 'vscode' {
  interface QuickPickItem {
    option?: DirectoryOption
  }
}

function isFolderDescriptor(filepath: string): boolean {
  return filepath.charAt(filepath.length - 1) === path.sep;
}

function invertGlob(pattern: string): string {
  return pattern.replace(/^!/, '');
}

function walkupGitignores(dir: string, found: string[] = []): string[] {
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

function flatten(memo: any[], item: any): any[] {
  return memo.concat(item);
}

function gitignoreGlobs(root: string): string[] {
  const gitignoreFiles = walkupGitignores(root);
  return gitignoreFiles.map(g => gitignoreToGlob(g)).reduce(flatten, []);
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
  //A: returns all the subdirectories
  const ignore =
    gitignoreGlobs(root).concat(configIgnoredGlobs(root)).map(invertGlob);
  
  //A: it's done this way beacause of the ignare thing
  const results = globSync('**', { cwd: root, ignore })
    .map((f): FSLocation => {
      return {
        relative: path.join(path.sep, f),
        absolute: path.join(root, f)
      };
    })
    .filter(f => fs.statSync(f.absolute).isDirectory());
   

    function flatten(lists) {
      return lists.reduce((a, b) => a.concat(b), []);
    }
    
    function getDirectories(srcpath:FSLocation) {
      return fs.readdirSync(srcpath.absolute)
      .map((f): FSLocation => {
        return {
          relative: path.join(srcpath.relative, f),
          absolute: path.join(srcpath.absolute, f)
        };
      })
      .filter(f => fs.statSync(f.absolute).isDirectory() );
    }
    
    function getDirectoriesRecursive(srcpath : FSLocation) {
      return [srcpath,...flatten(getDirectories(srcpath).map(getDirectoriesRecursive))];
    }

    var root_fs =  {
      relative: path.sep,
      absolute: root
    }
    const results2: FSLocation[] = getDirectoriesRecursive(root_fs)

    //fs.statSync(path+'/'+file).isDirectory()
    console.log(ignore);
    console.log("------------------============------------------------");
    console.log(results);
    console.log("------------------============------------------------");
    console.log(results2);

  return results;
}

function convenienceOptions(
  roots: WorkspaceRoot[],
  cache: Cache): vscode.QuickPickItem[] {

  const config: string[] = vscode.workspace
    .getConfiguration('advancedNewFile').get('convenienceOptions');

  const optionsByName = {
    last: [buildQuickPickItem(lastSelection(cache), '- last selection')],
    current: [
      buildQuickPickItem(currentEditorPathOption(roots), '- current file')
    ],
    root: rootOptions(roots).map(o => buildQuickPickItem(o, '- workspace root'))
  };

  const options = config
    .map<vscode.QuickPickItem[]>(c => optionsByName[c]).reduce(flatten);

  return compact<vscode.QuickPickItem>(options);
}

async function subdirOptionsForRoot(
  root: WorkspaceRoot): Promise<DirectoryOption[]> {

    //A: that takes alot of time
  console.log('here: subdirOptionsForRoot')
  const dirs = await directories(root.rootPath);

  return dirs.map((dir: FSLocation): DirectoryOption => {
    const displayText = root.multi ?
      path.join(path.sep, root.baseName, dir.relative) :
      dir.relative;

    return {
      displayText,
      fsLocation: dir
    };
  });
}

export function showQuickPick(
  choices: Promise<vscode.QuickPickItem[]>): Thenable<QuickPickItem> {

  return vscode.window.showQuickPick<vscode.QuickPickItem>(choices, {
    placeHolder: 'First, select an existing path to create relative to ' +
      '(larger projects may take a moment to load)'
  });
}

export async function showInputBox(
  baseDirectory: DirectoryOption): Promise<string> {

  try {
    const input = await vscode.window.showInputBox({
      prompt: `Relative to ${baseDirectory.displayText}`,
      placeHolder: 'Filename or relative path to file'
    });

    return path.join(baseDirectory.fsLocation.absolute, input);
  } catch (e) {
    return;
  }
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

export function buildQuickPickItem(
  option: DirectoryOption,
  description: string = null): vscode.QuickPickItem {

  if (!option) return;

  return {
    label: option.displayText,
    description,
    option
  };
}

export function currentEditorPath(): string {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return;

  return path.dirname(activeEditor.document.fileName);
}

export function expandBraces(absolutePath: string): string[] {
  const shouldExpandBraces =
    vscode.workspace.getConfiguration('advancedNewFile').get('expandBraces');

  if (!shouldExpandBraces) {
    return [absolutePath];
  }

  return braces.expand(absolutePath);
}

export function createFileOrFolder(absolutePath: string): void {
  let directoryToFile = path.dirname(absolutePath);

  if (!fs.existsSync(absolutePath)) {
    if (isFolderDescriptor(absolutePath)) {
      mkdirp.sync(absolutePath);
    } else {
      mkdirp.sync(directoryToFile);
      fs.appendFileSync(absolutePath, '');
    }
  }
}

export async function openFile(absolutePath: string): Promise<void> {
  if (isFolderDescriptor(absolutePath)) {
    const showInformationMessages = vscode.workspace
      .getConfiguration('advancedNewFile').get('showInformationMessages', true);

    if (showInformationMessages) {
      vscode.window.showInformationMessage(`Folder created: ${absolutePath}`);
    }
  } else {
    const textDocument = await vscode.workspace.openTextDocument(absolutePath);

    if (textDocument) {
      const shouldExpandBraces =
    vscode.workspace.getConfiguration('advancedNewFile').get('expandBraces');

      if (shouldExpandBraces) {
        vscode.window.showTextDocument(textDocument, { preview: false });
      } else {
        vscode.window.showTextDocument(textDocument, ViewColumn.Active);
      }
    }
  }
}

export function lastSelection(cache: Cache): DirectoryOption {
  if (!cache.has('last')) return;
  const value = cache.get('last');

  if (typeof value === 'object') {
    return value as DirectoryOption;
  } else {
    cache.forget('last');
    return;
  }
}

export function workspaceRoots(): WorkspaceRoot[] {
  if (vscode.workspace.workspaceFolders) {
    const multi = vscode.workspace.workspaceFolders.length > 1;

    return vscode.workspace.workspaceFolders.map((folder) => {
      return {
        //A: All the opened Folders
        rootPath: folder.uri.fsPath,
        baseName: folder.name || path.basename(folder.uri.fsPath),
        multi
        
      };
    });
    //A: it there is no opened workspace folders then just get the base folder
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

export function rootOptions(roots: WorkspaceRoot[]): DirectoryOption[] {
  return roots.map((root): DirectoryOption => {
    return {
      displayText: root.multi ? path.join(path.sep, root.baseName) : path.sep,
      fsLocation: {
        relative: path.sep,
        absolute: root.rootPath
      }
    };
  });
}

export function currentEditorPathOption(
  roots: WorkspaceRoot[]): DirectoryOption {

  const currentFilePath = currentEditorPath();
  const currentFileRoot = currentFilePath &&
    roots.find(r => currentFilePath.indexOf(r.rootPath) === 0);

  if (!currentFileRoot) return;

  const rootMatcher = new RegExp(`^${currentFileRoot.rootPath}`);
  let relativeCurrentFilePath = currentFilePath.replace(rootMatcher, '');

  relativeCurrentFilePath =
    relativeCurrentFilePath === '' ? path.sep : relativeCurrentFilePath;

  const displayText = currentFileRoot.multi ?
    path.join(path.sep, currentFileRoot.baseName, relativeCurrentFilePath) :
    relativeCurrentFilePath;

  return {
    displayText,
    fsLocation: {
      relative: relativeCurrentFilePath,
      absolute: currentFilePath
    }
  };
}

export async function dirQuickPickItems(
  roots: WorkspaceRoot[],
  cache: Cache): Promise<vscode.QuickPickItem[]> {

  const dirOptions = await Promise.all(

    roots.map(async r => await subdirOptionsForRoot(r))
  );
  console.log("after first");

  let quickPickItems =
    dirOptions.reduce(flatten).map(o => buildQuickPickItem(o));

  quickPickItems.unshift(...convenienceOptions(roots, cache));

  return quickPickItems;
}

export function cacheSelection(
  cache: Cache,
  dir: DirectoryOption,
  root: WorkspaceRoot) {

  cache.put('last', dir);

  let recentRoots = cache.get('recentRoots') || [];

  const rootIndex = recentRoots.indexOf(root.rootPath);
  if (rootIndex >= 0) recentRoots.splice(rootIndex, 1);

  recentRoots.unshift(root.rootPath);
  cache.put('recentRoots', recentRoots);
}

export function sortRoots(
  roots: WorkspaceRoot[],
  desiredOrder: string[]): WorkspaceRoot[] {

  return sortBy(roots, (root) => {
    //A: if found then put it at the begining, else at the end with the same order
    const desiredIndex = desiredOrder.indexOf(root.rootPath);
    return desiredIndex >= 0 ? desiredIndex : roots.length;
  });
}

export function rootForDir(
  roots: WorkspaceRoot[],
  dir: DirectoryOption): WorkspaceRoot {

  return roots.find(r => startsWith(dir.fsLocation.absolute, r.rootPath));
}

export async function command(context: vscode.ExtensionContext) {
  const roots = workspaceRoots();

  if (roots.length > 0) {
    //A: join all the root paths with a ;
    const cacheName = roots.map(r => r.rootPath).join(';');
    
    //A: open the cache specified by the cacheName
    //A: the namespace of the cache consists of all the paths of opened folders
    const cache = new Cache(context, `workspace:${cacheName}`);
    //A: puts the rescent Roots at the begining 
    const sortedRoots = sortRoots(roots, cache.get('recentRoots') || []);
    //A: choose the root here
    //A: that's the bitch i think

    const dirSelection =
      await showQuickPick(dirQuickPickItems(sortedRoots, cache));

    //A: if the user pressed enter with the root then fuckin leave
    if (!dirSelection) return;
    const dir = dirSelection.option;

    const selectedRoot = rootForDir(roots, dir);
    cacheSelection(cache, dir, selectedRoot);
    //A: enter the desired file or dir to be created here
    const newFileInput = await showInputBox(dir);
    if (!newFileInput) return;

    const newFileArray = expandBraces(newFileInput);
    for (let newFile of newFileArray) {
      createFileOrFolder(newFile);
      await openFile(newFile);
    }
  } else {
    //A: Didn't find any folder in the workspace
    await vscode.window.showErrorMessage(
      'It doesn\'t look like you have a folder opened in your workspace. ' +
      'Try opening a folder first.'
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    'extension.advancedNewFile',
    () => command(context)
  );

  context.subscriptions.push(disposable);
}

export function deactivate() { }
