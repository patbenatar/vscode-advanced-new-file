# VSCode Advanced New File

Inspired by Sublime's AdvancedNewFile plugin, this adds the ability to create
files anywhere in your workspace.

![Demo](https://media.giphy.com/media/l3vRfRJO7ZX6WNJQs/source.gif)

## Features

* Fuzzy-matching autocomplete to create new file relative to existing path
* Create new directories while creating a new file

## Usage

* Command palette: "Advanced New File"
* Keyboard shortcut: cmd+alt+n (Mac), ctrl+alt+n (Win, Linux)

## Notes

Because VSCode extensions don't yet have the ability to do type-ahead
autocomplete within the text input box (See
https://github.com/Microsoft/vscode/issues/426), we work around this limitation
and provide autocomplete using a two-step workflow of selecting existing path,
then providing new filename/path relative to the selection.