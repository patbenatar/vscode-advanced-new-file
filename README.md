# VSCode Advanced New File

[![Travis](https://travis-ci.org/patbenatar/vscode-advanced-new-file.svg?branch=master)](https://travis-ci.org/patbenatar/vscode-advanced-new-file)
[![AppVeyor](https://ci.appveyor.com/api/projects/status/jelxhuh2ssuckk0n/branch/master?svg=true)](https://ci.appveyor.com/project/patbenatar/vscode-advanced-new-file)

Inspired by Sublime's AdvancedNewFile plugin, this adds the ability to create
files anywhere in your workspace.

![Demo](https://media.giphy.com/media/l3vRfRJO7ZX6WNJQs/source.gif)

## Features

* Fuzzy-matching autocomplete to create new file relative to existing path (thanks to
  [JoeNg93](https://github.com/JoeNg93) for making it faster)
* Create new directories while creating a new file
* Create a directory instead of a file by suffixing the file path with `/` as
  in `somedirectory/` to create the directory (thanks to
  [maximilianschmitt](https://github.com/maximilianschmitt))
* Ignores gitignored and workspace `files.exclude` settings.
* Additional option of adding `advancedNewFile.exclude` settings to workspace
  settings just like native `files.exlude` except it explicitly effects
  AdvancedNewFile plugin only. (thanks to [Kaffiend](https://github.com/Kaffiend))
* Control the order of top convenient options ("last selection", "current file",
  etc) via config setting `advancedNewFile.convenienceOptions`
* Brace expansion - expand braces into multiple files. Entering `index.{html,css}` will create and open `index.html` and `index.css`. (thanks to [chuckhendo](https://github.com/chuckhendo) and [timlogemann](https://github.com/timlogemann))

## Configuration Example

```
"advancedNewFile.exclude": {
  "node_modules": true,
  "node_modules_electron": true,
  "dev": true,
  "dist": true
},
"advancedNewFile.showInformationMessages": true,
"advancedNewFile.convenienceOptions": ["last", "current", "root"],
"advancedNewFile.expandBraces": false
```

## Usage

* Command palette: "Advanced New File"
* Keyboard shortcut: cmd+alt+n (Mac), ctrl+alt+n (Win, Linux)

## Keybindings
You can add your own keybinding in your `keybindings.json`
```
{
  "key": "ctrl+n", // "cmd+n" on mac
  "command": "extension.advancedNewFile",
}
```

## Notes

Because VSCode extensions don't yet have the ability to do type-ahead
autocomplete within the text input box (See
https://github.com/Microsoft/vscode/issues/426), we work around this limitation
and provide autocomplete using a two-step workflow of selecting existing path,
then providing new filename/path relative to the selection.

If you encounter an error on Mac or Linux check for broken symlinks with:
`find . -xtype l`

## Contributing

1. Clone the repo
1. `$ npm install`
1. Add your feature or fix (in `src/`) with test coverage (in `test/`)
1. Launch the extension and do some manual QA (via Debug > Launch Extension)
1. Run the tests (via Debug > Launch Tests)
1. Run the linter: `npm run lint`
1. Open a PR

## Publishing

### OpenVSX

Change the publisher in package.json to giantcola, then run:

```
docker-compose run plugin ./node_modules/.bin/ovsx publish -p [token]
```
