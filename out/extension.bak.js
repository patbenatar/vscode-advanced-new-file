"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const gitignoreToGlob = require("gitignore-to-glob");
const glob_1 = require("glob");
const lodash_1 = require("lodash");
const mkdirp = require("mkdirp");
const path = require("path");
const vscode = require("vscode");
const vscode_1 = require("vscode");
const Cache = require("vscode-cache");
function isFolderDescriptor(filepath) {
    return filepath.charAt(filepath.length - 1) === path.sep;
}
function invertGlob(pattern) {
    return pattern.replace(/^!/, "");
}
function walkupGitignores(dir, found = []) {
    const gitignore = path.join(dir, ".gitignore");
    if (fs.existsSync(gitignore)) {
        found.push(gitignore);
    }
    const parentDir = path.resolve(dir, "..");
    const reachedSystemRoot = dir === parentDir;
    if (!reachedSystemRoot) {
        return walkupGitignores(parentDir, found);
    }
    else {
        return found;
    }
}
function flatten(memo, item) {
    return memo.concat(item);
}
function gitignoreGlobs(root) {
    const gitignoreFiles = walkupGitignores(root);
    return gitignoreFiles.map(g => gitignoreToGlob(g)).reduce(flatten, []);
}
function configIgnoredGlobs(root) {
    const configFilesExclude = Object.assign([], vscode.workspace.getConfiguration("advancedNewFile").get("exclude"), vscode.workspace.getConfiguration("files.exclude", vscode.Uri.file(root)));
    const configIgnored = Object.keys(configFilesExclude).filter(key => configFilesExclude[key] === true);
    return gitignoreToGlob(configIgnored.join("\n"), { string: true });
}
function directoriesSync(root) {
    const ignore = gitignoreGlobs(root)
        .concat(configIgnoredGlobs(root))
        .map(invertGlob);
    const results = glob_1.sync("**", { cwd: root, ignore })
        .map((f) => {
        return {
            relative: path.join(path.sep, f),
            absolute: path.join(root, f)
        };
    })
        .filter(f => fs.statSync(f.absolute).isDirectory())
        .map(f => f);
    return results;
}
function convenienceOptions(roots, cache) {
    const config = vscode.workspace
        .getConfiguration("advancedNewFile")
        .get("convenienceOptions");
    const optionsByName = {
        last: [buildQuickPickItem(lastSelection(cache), "- last selection")],
        current: [
            buildQuickPickItem(currentEditorPathOption(roots), "- current file")
        ],
        root: rootOptions(roots).map(o => buildQuickPickItem(o, "- workspace root"))
    };
    const options = config
        .map(c => optionsByName[c])
        .reduce(flatten);
    return lodash_1.compact(options);
}
function subdirOptionsForRoot(root) {
    return __awaiter(this, void 0, void 0, function* () {
        const dirs = yield directories(root.rootPath);
        return dirs.map((dir) => {
            const displayText = root.multi
                ? path.join(path.sep, root.baseName, dir.relative)
                : dir.relative;
            return {
                displayText,
                fsLocation: dir
            };
        });
    });
}
function showQuickPick(choices) {
    return vscode.window.showQuickPick(choices, {
        placeHolder: "First, select an existing path to create relative to " +
            "(larger projects may take a moment to load)"
    });
}
exports.showQuickPick = showQuickPick;
function showInputBox(baseDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const input = yield vscode.window.showInputBox({
                prompt: `Relative to ${baseDirectory.displayText}`,
                placeHolder: "Filename or relative path to file"
            });
            return path.join(baseDirectory.fsLocation.absolute, input);
        }
        catch (e) {
            return;
        }
    });
}
exports.showInputBox = showInputBox;
function directories(root) {
    return new Promise((resolve, reject) => {
        const findDirectories = () => {
            try {
                resolve(directoriesSync(root));
            }
            catch (error) {
                reject(error);
            }
        };
        const delayToAllowVSCodeToRender = 1;
        setTimeout(findDirectories, delayToAllowVSCodeToRender);
    });
}
exports.directories = directories;
function buildQuickPickItem(option, description = null) {
    if (!option) {
        return;
    }
    return {
        label: option.displayText,
        description,
        option
    };
}
exports.buildQuickPickItem = buildQuickPickItem;
function currentEditorPath() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    return path.dirname(activeEditor.document.fileName);
}
exports.currentEditorPath = currentEditorPath;
function createFileOrFolder(absolutePath) {
    const directoryToFile = path.dirname(absolutePath);
    if (!fs.existsSync(absolutePath)) {
        if (isFolderDescriptor(absolutePath)) {
            mkdirp.sync(absolutePath);
        }
        else {
            mkdirp.sync(directoryToFile);
            fs.appendFileSync(absolutePath, "");
        }
    }
}
exports.createFileOrFolder = createFileOrFolder;
function openFile(absolutePath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isFolderDescriptor(absolutePath)) {
            const showInformationMessages = vscode.workspace
                .getConfiguration("advancedNewFile")
                .get("showInformationMessages", true);
            if (showInformationMessages) {
                vscode.window.showInformationMessage(`Folder created: ${absolutePath}`);
            }
        }
        else {
            const textDocument = yield vscode.workspace.openTextDocument(absolutePath);
            if (textDocument) {
                vscode.window.showTextDocument(textDocument, vscode_1.ViewColumn.Active);
            }
        }
    });
}
exports.openFile = openFile;
function lastSelection(cache) {
    if (!cache.has("last")) {
        return;
    }
    const value = cache.get("last");
    if (typeof value === "object") {
        return value;
    }
    else {
        cache.forget("last");
        return;
    }
}
exports.lastSelection = lastSelection;
function workspaceRoots() {
    if (vscode.workspace.workspaceFolders) {
        const multi = vscode.workspace.workspaceFolders.length > 1;
        return vscode.workspace.workspaceFolders.map(folder => {
            return {
                rootPath: folder.uri.fsPath,
                baseName: path.basename(folder.uri.fsPath),
                multi
            };
        });
    }
    else {
        return [];
    }
}
exports.workspaceRoots = workspaceRoots;
function rootOptions(roots) {
    return roots.map((root) => {
        return {
            displayText: root.multi ? path.join(path.sep, root.baseName) : path.sep,
            fsLocation: {
                relative: path.sep,
                absolute: root.rootPath
            }
        };
    });
}
exports.rootOptions = rootOptions;
function currentEditorPathOption(roots) {
    const currentFilePath = currentEditorPath();
    const currentFileRoot = currentFilePath &&
        roots.find(r => currentFilePath.indexOf(r.rootPath) === 0);
    if (!currentFileRoot) {
        return;
    }
    const rootMatcher = new RegExp(`^${currentFileRoot.rootPath}`);
    let relativeCurrentFilePath = currentFilePath.replace(rootMatcher, "");
    relativeCurrentFilePath =
        relativeCurrentFilePath === "" ? path.sep : relativeCurrentFilePath;
    const displayText = currentFileRoot.multi
        ? path.join(path.sep, currentFileRoot.baseName, relativeCurrentFilePath)
        : relativeCurrentFilePath;
    return {
        displayText,
        fsLocation: {
            relative: relativeCurrentFilePath,
            absolute: currentFilePath
        }
    };
}
exports.currentEditorPathOption = currentEditorPathOption;
function dirQuickPickItems(roots, cache) {
    return __awaiter(this, void 0, void 0, function* () {
        const dirOptions = yield Promise.all(roots.map((r) => __awaiter(this, void 0, void 0, function* () { return yield subdirOptionsForRoot(r); })));
        const quickPickItems = dirOptions
            .reduce(flatten)
            .map(o => buildQuickPickItem(o));
        quickPickItems.unshift(...convenienceOptions(roots, cache));
        return quickPickItems;
    });
}
exports.dirQuickPickItems = dirQuickPickItems;
function cacheSelection(cache, dir, root) {
    cache.put("last", dir);
    const recentRoots = cache.get("recentRoots") || [];
    const rootIndex = recentRoots.indexOf(root.rootPath);
    if (rootIndex >= 0) {
        recentRoots.splice(rootIndex, 1);
    }
    recentRoots.unshift(root.rootPath);
    cache.put("recentRoots", recentRoots);
}
exports.cacheSelection = cacheSelection;
function sortRoots(roots, desiredOrder) {
    return lodash_1.sortBy(roots, root => {
        const desiredIndex = desiredOrder.indexOf(root.rootPath);
        return desiredIndex >= 0 ? desiredIndex : roots.length;
    });
}
exports.sortRoots = sortRoots;
function rootForDir(roots, dir) {
    return roots.find(r => lodash_1.startsWith(dir.fsLocation.absolute, r.rootPath));
}
exports.rootForDir = rootForDir;
function command(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const roots = workspaceRoots();
        if (roots.length > 0) {
            const cacheName = roots.map(r => r.rootPath).join(";");
            const cache = new Cache(context, `workspace:${cacheName}`);
            const sortedRoots = sortRoots(roots, cache.get("recentRoots") || []);
            const quickPick = vscode.window.createQuickPick();
            let activeChangeCancellationToken;
            quickPick.show();
            // TODO: debounce both handlers?
            quickPick.onDidChangeValue(value => {
                if (activeChangeCancellationToken !== undefined) {
                    clearTimeout(activeChangeCancellationToken);
                    activeChangeCancellationToken = undefined;
                }
                if (value === "") {
                    // TODO: what about multi root workspace?
                    value = "/";
                    quickPick.value = value;
                }
                const isExactMatch = quickPick.items.find(i => i.label === value) !== undefined;
                const hasCreateItem = quickPick.items[0].option === undefined;
                if (hasCreateItem && isExactMatch) {
                    quickPick.items = quickPick.items.slice(1, -1);
                }
                else if (hasCreateItem && !isExactMatch) {
                    quickPick.items = [
                        {
                            label: value,
                            description: ""
                        }
                    ].concat(quickPick.items.slice(1, -1));
                }
                else if (!hasCreateItem && !isExactMatch) {
                    quickPick.items = [
                        {
                            label: value,
                            description: ""
                        }
                    ].concat(quickPick.items);
                }
            });
            quickPick.onDidChangeActive(items => {
                // console.log("active", items);
                if (items.length !== 1) {
                    return;
                }
                const item = items[0];
                if (item.option === undefined) {
                    return;
                }
                if (activeChangeCancellationToken !== undefined) {
                    clearTimeout(activeChangeCancellationToken);
                    activeChangeCancellationToken = undefined;
                }
                activeChangeCancellationToken = setTimeout(() => {
                    console.log("setting value", item.label);
                    quickPick.value = item.label;
                }, 10);
            });
            quickPick.onDidAccept(() => {
                const item = quickPick.activeItems[0];
                if (!item) {
                    return;
                }
                if (item.option) {
                    // it doesn't make any sense to select an option, it's a dir that
                    // already exists
                }
                else {
                    // TODO: get the root from the item.label
                    // if multi, it should start with one of the root dirs
                    // although you could have two roots with the same base name
                    // path.join(baseDirectory.fsLocation.absolute, input);
                }
                // TODO: do we need caching of last selection anymore? now that we don't have
                // the select step... maybe it's caching of the last dir created?
            });
            quickPick.busy = true;
            quickPick.items = yield dirQuickPickItems(sortedRoots, cache);
            quickPick.busy = false;
            // quickPick.title = "foo bar";
            // quickPick.onDidChangeSelection(items => {
            //   console.log("selection", items);
            // })
            // quickPick.busy = true;
            // const dirSelection =
            //   await showQuickPick(dirQuickPickItems(sortedRoots, cache));
            // if (!dirSelection) return;
            // const dir = dirSelection.option;
            // const selectedRoot = rootForDir(roots, dir);
            // cacheSelection(cache, dir, selectedRoot);
            // const newFileInput = await showInputBox(dir);
            // if (!newFileInput) return;
            // createFileOrFolder(newFileInput);
            // await openFile(newFileInput);
        }
        else {
            yield vscode.window.showErrorMessage("It doesn't look like you have a folder opened in your workspace. " +
                "Try opening a folder first.");
        }
    });
}
exports.command = command;
function activate(context) {
    const disposable = vscode.commands.registerCommand("extension.advancedNewFile", () => command(context));
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.bak.js.map