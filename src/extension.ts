"use strict";
import { commands, ExtensionContext, window, workspace } from "vscode";
import {
  buildQuickPickItem,
  cacheDirectories,
  IDirectoryOption,
  IFSLocation,
  IQuickPickItem,
  isDirectory,
  workspaceRoots
} from "./lib";

async function launchUI(context: ExtensionContext) {
  const roots = workspaceRoots();

  if (roots.length > 0) {
    // TODO: do we need to show a loader and wait for cache if trying to launch before
    // cache is ready?

    const directories = context.workspaceState.get<IFSLocation[]>(
      "directoriesCache"
    );

    // TODO: does the sortedRoots functionality make sense to restore given the new UI flow?
    // https://github.com/patbenatar/vscode-advanced-new-file/issues/48

    const quickPick = window.createQuickPick<IQuickPickItem>();
    const dirOptions: IDirectoryOption[] = directories.map(d => ({
      displayText: d.relative, // TODO: if multi-root, prepend the root.baseName
      fsLocation: d
    }));
    quickPick.items = dirOptions.map(o => buildQuickPickItem(o));
    quickPick.show();

    let activeChangeCancellationToken: NodeJS.Timer;

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

      const isExactMatch =
        quickPick.items.find(i => i.label === value) !== undefined;
      const hasCreateItem = quickPick.items[0].option === undefined;

      if (hasCreateItem && isExactMatch) {
        quickPick.items = quickPick.items.slice(1, -1);
      } else if (hasCreateItem && !isExactMatch) {
        quickPick.items = [
          {
            description: "",
            label: value
          }
        ].concat(quickPick.items.slice(1, -1));
      } else if (!hasCreateItem && !isExactMatch) {
        quickPick.items = [
          {
            description: "",
            label: value
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
      } else {
        // TODO: get the root from the item.label
        // if multi, it should start with one of the root dirs
        // although you could have two roots with the same base name
        // path.join(baseDirectory.fsLocation.absolute, input);
      }

      // TODO: do we need caching of last selection anymore? now that we don't have
      // the select step... maybe it's caching of the last dir created?
    });
  } else {
    await window.showErrorMessage(
      "It doesn't look like you have a folder opened in your workspace. " +
        "Try opening a folder first."
    );
  }
}

export function activate(context: ExtensionContext) {
  cacheDirectories(context);

  const watcher = workspace.createFileSystemWatcher("**/*", false, true, false);
  watcher.onDidCreate(uri => {
    if (!isDirectory(uri.fsPath)) {
      return;
    }
    cacheDirectories(context);
  });
  watcher.onDidDelete(uri => cacheDirectories(context));

  const command = commands.registerCommand("extension.advancedNewFile", () =>
    launchUI(context)
  );

  context.subscriptions.push(command);
  context.subscriptions.push(watcher);
}
