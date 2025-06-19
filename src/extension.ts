'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import {compact, startsWith, sortBy} from 'lodash';
import * as gitignoreToGlob from 'gitignore-to-glob';
import {sync as globSync} from 'glob';
import * as Cache from 'vscode-cache';
import {QuickPickItem, ViewColumn} from 'vscode';
import * as braces from 'braces';

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
        option?: DirectoryOption;
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

function flatten<T>(memo: T[], item: T[]): T[] {
    return memo.concat(item);
}

function gitignoreGlobs(root: string): string[] {
    const gitignoreFiles = walkupGitignores(root);
    return gitignoreFiles.map((g) => gitignoreToGlob(g)).reduce(flatten, []);
}

function configIgnoredGlobs(root: string): string[] {
    const configFilesExcluded: {
        [key: string]: boolean;
    } = Object.assign(
        {},
        vscode.workspace.getConfiguration('advancedNewFile').get('exclude'),
        (
            vscode.workspace
                .getConfiguration('advancedNewFile')
                .get('useFilesExclude', true)
        ) ?
            vscode.workspace
                .getConfiguration('files', vscode.Uri.file(root))
                .get('exclude', {})
        :   {}
    );
    const configIgnored = Object.keys(configFilesExcluded).filter(
        (key) => configFilesExcluded[key] === true
    );
    return gitignoreToGlob(configIgnored.join('\n'), {string: true});
}

function directoriesSync(root: string): FSLocation[] {
    const ignore: string[] = [];
    if (
        vscode.workspace
            .getConfiguration('advancedNewFile')
            .get('useGitIgnore', true)
    ) {
        ignore.push(...gitignoreGlobs(root));
    }
    ignore.push(...configIgnoredGlobs(root));

    const results = globSync('**', {cwd: root, ignore: ignore.map(invertGlob)})
        .map((f): FSLocation => {
            return {
                relative: path.join(path.sep, f),
                absolute: path.join(root, f)
            };
        })
        .filter((f) => fs.statSync(f.absolute).isDirectory())
        .map((f) => f);

    return results;
}

function convenienceOptions(
    roots: WorkspaceRoot[],
    cache: Cache
): vscode.QuickPickItem[] {
    const config: string[] = vscode.workspace
        .getConfiguration('advancedNewFile')
        .get('convenienceOptions');

    const optionsByName = {
        last: [buildQuickPickItem(lastSelection(cache), '- last selection')],
        current: [
            buildQuickPickItem(currentEditorPathOption(roots), '- current file')
        ],
        root: rootOptions(roots).map((o) =>
            buildQuickPickItem(o, '- workspace root')
        )
    };

    const options = config
        .map<
            vscode.QuickPickItem[]
        >((c) => Reflect.get(optionsByName, c) as vscode.QuickPickItem[])
        .reduce((p, v) => flatten(p, v));

    return compact<vscode.QuickPickItem>(options);
}

async function subdirOptionsForRoot(
    root: WorkspaceRoot
): Promise<DirectoryOption[]> {
    const dirs = await directories(root.rootPath);

    return dirs.map((dir: FSLocation): DirectoryOption => {
        const displayText =
            root.multi ?
                path.join(path.sep, root.baseName, dir.relative)
            :   dir.relative;

        return {
            displayText,
            fsLocation: dir
        };
    });
}

export function showQuickPick(
    choices: Promise<vscode.QuickPickItem[]>
): Thenable<QuickPickItem> {
    return vscode.window.showQuickPick<vscode.QuickPickItem>(choices, {
        placeHolder:
            'First, select an existing path to create relative to ' +
            '(larger projects may take a moment to load)'
    });
}

export async function showInputBox(
    baseDirectory: DirectoryOption
): Promise<string> {
    try {
        const input = await vscode.window.showInputBox({
            prompt: `Relative to ${baseDirectory.displayText}`,
            placeHolder: 'Filename or relative path to file'
        });

        return path.join(baseDirectory.fsLocation.absolute, input);
    } catch {
        return;
    }
}

export function directories(root: string): Promise<FSLocation[]> {
    return new Promise((resolve, reject) => {
        const findDirectories = () => {
            try {
                resolve(directoriesSync(root));
            } catch (error) {
                if (error instanceof Error) {
                    reject(error);
                } else {
                    reject(new Error());
                }
            }
        };

        const delayToAllowVSCodeToRender = 1;
        setTimeout(findDirectories, delayToAllowVSCodeToRender);
    });
}

export function buildQuickPickItem(
    option: DirectoryOption,
    description: string = null
): vscode.QuickPickItem {
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
    const shouldExpandBraces = vscode.workspace
        .getConfiguration('advancedNewFile')
        .get('expandBraces');

    if (!shouldExpandBraces) {
        return [absolutePath];
    }

    return braces.expand(absolutePath);
}

export function createFileOrFolder(absolutePath: string): void {
    const directoryToFile = path.dirname(absolutePath);

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
            .getConfiguration('advancedNewFile')
            .get('showInformationMessages', true);

        if (showInformationMessages) {
            vscode.window.showInformationMessage(
                `Folder created: ${absolutePath}`
            );
        }
    } else {
        const textDocument =
            await vscode.workspace.openTextDocument(absolutePath);

        if (textDocument) {
            const shouldExpandBraces = vscode.workspace
                .getConfiguration('advancedNewFile')
                .get('expandBraces');

            if (shouldExpandBraces) {
                vscode.window.showTextDocument(textDocument, {preview: false});
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
                rootPath: folder.uri.fsPath,
                baseName: folder.name || path.basename(folder.uri.fsPath),
                multi
            };
        });
    } else if (vscode.workspace.rootPath) {
        return [
            {
                rootPath: vscode.workspace.rootPath,
                baseName: path.basename(vscode.workspace.rootPath),
                multi: false
            }
        ];
    } else {
        return [];
    }
}

export function rootOptions(roots: WorkspaceRoot[]): DirectoryOption[] {
    return roots.map((root): DirectoryOption => {
        return {
            displayText:
                root.multi ? path.join(path.sep, root.baseName) : path.sep,
            fsLocation: {
                relative: path.sep,
                absolute: root.rootPath
            }
        };
    });
}

export function currentEditorPathOption(
    roots: WorkspaceRoot[]
): DirectoryOption {
    const currentFilePath = currentEditorPath();
    const currentFileRoot =
        currentFilePath &&
        roots.find((r) => currentFilePath.indexOf(r.rootPath) === 0);

    if (!currentFileRoot) return;

    const rootMatcher = new RegExp(`^${currentFileRoot.rootPath}`);
    let relativeCurrentFilePath = currentFilePath.replace(rootMatcher, '');

    relativeCurrentFilePath =
        relativeCurrentFilePath === '' ? path.sep : relativeCurrentFilePath;

    const displayText =
        currentFileRoot.multi ?
            path.join(
                path.sep,
                currentFileRoot.baseName,
                relativeCurrentFilePath
            )
        :   relativeCurrentFilePath;

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
    cache: Cache
): Promise<vscode.QuickPickItem[]> {
    const dirOptions = await Promise.all(
        roots.map(async (r) => await subdirOptionsForRoot(r))
    );
    const quickPickItems = dirOptions
        .reduce(flatten)
        .map((o) => buildQuickPickItem(o));

    quickPickItems.unshift(...convenienceOptions(roots, cache));

    return quickPickItems;
}

export function cacheSelection(
    cache: Cache,
    dir: DirectoryOption,
    root: WorkspaceRoot
) {
    cache.put('last', dir);

    const recentRoots: string[] = cache.get('recentRoots') || [];

    const rootIndex = recentRoots.indexOf(root.rootPath);
    if (rootIndex >= 0) recentRoots.splice(rootIndex, 1);

    recentRoots.unshift(root.rootPath);
    cache.put('recentRoots', recentRoots);
}

export function sortRoots(
    roots: WorkspaceRoot[],
    desiredOrder: string[]
): WorkspaceRoot[] {
    return sortBy(roots, (root) => {
        const desiredIndex = desiredOrder.indexOf(root.rootPath);
        return desiredIndex >= 0 ? desiredIndex : roots.length;
    });
}

export function rootForDir(
    roots: WorkspaceRoot[],
    dir: DirectoryOption
): WorkspaceRoot {
    return roots.find((r) => startsWith(dir.fsLocation.absolute, r.rootPath));
}

export async function command(context: vscode.ExtensionContext) {
    const roots = workspaceRoots();

    if (roots.length > 0) {
        const cacheName = roots.map((r) => r.rootPath).join(';');
        const cache = new Cache(context, `workspace:${cacheName}`);

        const sortedRoots = sortRoots(roots, cache.get('recentRoots') || []);

        const dirSelection = await showQuickPick(
            dirQuickPickItems(sortedRoots, cache)
        );
        if (!dirSelection) return;
        const dir = dirSelection.option;

        const selectedRoot = rootForDir(roots, dir);
        cacheSelection(cache, dir, selectedRoot);

        const newFileInput = await showInputBox(dir);
        if (!newFileInput) return;

        const newFileArray = expandBraces(newFileInput);
        for (const newFile of newFileArray) {
            createFileOrFolder(newFile);
            await openFile(newFile);
        }
    } else {
        await vscode.window.showErrorMessage(
            "It doesn't look like you have a folder opened in your workspace. " +
                'Try opening a folder first.'
        );
    }
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'extension.advancedNewFile',
        () => command(context)
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
