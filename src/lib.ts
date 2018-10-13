import * as fs from "fs";
import * as gitignoreToGlob from "gitignore-to-glob";
import { sync as globSync } from "glob";
import * as path from "path";
import { ExtensionContext, Uri, workspace } from "vscode";

export interface IWorkspaceRoot {
  rootPath: string;
  baseName: string;
}

export interface IFSLocation {
  relative: string;
  absolute: string;
}

export interface IDirectoryOption {
  displayText: string;
  fsLocation: IFSLocation;
}

export interface IQuickPickItem {
  label: string;
  description: string;
  option?: IDirectoryOption;
}

export function workspaceRoots(): IWorkspaceRoot[] {
  if (workspace.workspaceFolders) {
    return workspace.workspaceFolders.map(folder => {
      return {
        baseName: path.basename(folder.uri.fsPath),
        rootPath: folder.uri.fsPath
      };
    });
  } else {
    return [];
  }
}

function walkupGitignores(dir: string, found: string[] = []): string[] {
  const gitignore = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignore)) {
    found.push(gitignore);
  }

  const parentDir = path.resolve(dir, "..");
  const reachedSystemRoot = dir === parentDir;

  if (!reachedSystemRoot) {
    return walkupGitignores(parentDir, found);
  } else {
    return found;
  }
}

function invertGlob(pattern: string): string {
  return pattern.replace(/^!/, "");
}

export function flatten(memo: any[], item: any): any[] {
  return memo.concat(item);
}

function gitignoreGlobs(root: string): string[] {
  const gitignoreFiles = walkupGitignores(root);
  return gitignoreFiles.map(g => gitignoreToGlob(g)).reduce(flatten, []);
}

function configIgnoredGlobs(root: string): string[] {
  const configFilesExclude = Object.assign(
    [],
    workspace.getConfiguration("advancedNewFile").get("exclude"),
    workspace.getConfiguration("files.exclude", Uri.file(root))
  );
  const configIgnored = Object.keys(configFilesExclude).filter(
    key => configFilesExclude[key] === true
  );

  return gitignoreToGlob(configIgnored.join("\n"), { string: true });
}

export function isDirectory(absolutePath: string): boolean {
  return fs.statSync(absolutePath).isDirectory();
}

export function loadDirectoriesFromDisk(root: IWorkspaceRoot): IFSLocation[] {
  const rootPath = root.rootPath;

  const ignore = gitignoreGlobs(rootPath)
    .concat(configIgnoredGlobs(rootPath))
    .map(invertGlob);

  const results = globSync("**", { cwd: rootPath, ignore })
    .map(
      (f): IFSLocation => {
        return {
          absolute: path.join(rootPath, f),
          relative: path.join(path.sep, f)
        };
      }
    )
    .filter(f => isDirectory(f.absolute))
    .map(f => f);

  return results;
}

export function cacheDirectories(context: ExtensionContext) {
  const roots = workspaceRoots();
  const directoriesToCache = roots
    .map(loadDirectoriesFromDisk)
    .reduce(flatten, []);
  context.workspaceState.update("directoriesCache", directoriesToCache);
}

export function buildQuickPickItem(
  option: IDirectoryOption,
  description: string = null
): IQuickPickItem {
  if (!option) {
    return;
  }

  return {
    description,
    label: option.displayText,
    option
  };
}
