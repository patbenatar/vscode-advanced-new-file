declare namespace GitignoreToGlob {
  interface Options {
    dirsToCheck?: string[],
    string?: boolean
  }
}

declare function GitignoreToGlob(gitignorePathOrContents: string, options?: GitignoreToGlob.Options): string[];
declare function GitignoreToGlob(gitignorePath: string, dirsToCheck?: string[]): string[];

export = GitignoreToGlob;
