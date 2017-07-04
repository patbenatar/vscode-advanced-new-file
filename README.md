# VSCode Advanced New File

[![Travis](https://travis-ci.org/patbenatar/vscode-advanced-new-file.svg?branch=master)](https://travis-ci.org/patbenatar/vscode-advanced-new-file)
[![AppVeyor](https://ci.appveyor.com/api/projects/status/jelxhuh2ssuckk0n/branch/master?svg=true)](https://ci.appveyor.com/project/patbenatar/vscode-advanced-new-file)

Inspired by Sublime's AdvancedNewFile plugin, this adds the ability to create
files anywhere in your workspace.

![Demo](https://media.giphy.com/media/l3vRfRJO7ZX6WNJQs/source.gif)

## Features

* Fuzzy-matching autocomplete to create new file relative to existing path
* Create new directories while creating a new file
* Create a directory instead of a file by suffixing the file path with `/` as in `somedirectory/` to create the directory (thanks to [maximilianschmitt](https://github.com/maximilianschmitt))
* Ignores gitignored and workspace `files.exclude` settings.
* Additional option of adding `advancedNewFile.exclude` settings to workspace settings just like native `files.exlude` except it explicitly effects AdvancedNewFile plugin only. (thanks to [Kaffiend](https://github.com/Kaffiend))

## Configuration Example
```
 "advancedNewFile": {
    "exclude": {
      "node_modules": true,
      "node_modules_electron": true,
      "dev": true,
      "dist": true
    }
  }
```
## Usage

* Command palette: "Advanced New File"
* Keyboard shortcut: cmd+alt+n (Mac), ctrl+alt+n (Win, Linux)

## Notes

Because VSCode extensions don't yet have the ability to do type-ahead
autocomplete within the text input box (See
https://github.com/Microsoft/vscode/issues/426), we work around this limitation
and provide autocomplete using a two-step workflow of selecting existing path,
then providing new filename/path relative to the selection.

## Contributing

1. Clone the repo
1. `$ npm install`
1. Add your feature or fix (in `src/`) with test coverage (in `test/`)
1. Launch the extension and do some manual QA (via Debug > Launch Extension)
1. Run the tests (via Debug > Launch Tests)
1. Run the linter: `tslint src/** test/**`
1. Open a PR
