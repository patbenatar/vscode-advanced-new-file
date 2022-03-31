# 1.2.2

## Misc
* Revert change from glob to globby to fix regressions

# 1.2.1

## Misc
* Faster glob searching for big projects
* Update `vscode` devDependency to address `hoek` CVE warning

# 1.2.0

## What's New
* Open new document in active pane

# 1.1.0

## What's New
* Control the order of top convenient options ("last selection", "current file",
  etc) via config setting `advancedNewFile.convenienceOptions`
* In multi-root workspaces, order roots by recency

# 1.0.0

## What's New
* Support for multi-root workspaces

## Misc
* Dropped support for VS Code versions < 1.16.0 (August 2017) so we can use
  Node 7.6+, enabling a large refactor to use async/await

# 0.5.1

## What's New
* Adds an `advancedNewFile.showInformationMessages` configuration option to
  control whether top-bar notifications display. Enabled by default.

# 0.5.0

## What's New
* Adds an `advancedNewFile.exclude` configuration option in case you want the
  plugin to ignore a set of directories that aren't ignored in your
  workspace `files.exclude` config or `.gitignore`
* Add some "quick picks" to the top of the directory list: last selection, dir
  of currently open file, workspace root.

# 0.4.3

## Bug Fixes
* Fix a crash on Windows when the project directory is on a different drive
  than the VS Code installation.

# 0.4.2

## Bug Fixes
* Fixes keyboard shortcut on Mac. Formerly we hacked around a VS Code issue in
  order to get the desired keyboard shortcut, but that issue has been fixed in
  latest VS Code. NOTE: This may introduce keyboard shortcut issues in
  earlier versions of VS Code (< 1.11.1)

# 0.4.1

## Bug Fixes
* Fix an issue causing a stack level too deep error on Windows

# 0.4.0

## What's New
* Create a directory instead of a file by suffixing the file path with `/`
  (thanks to [maximilianschmitt](https://github.com/maximilianschmitt))

# 0.3.2

## What's New
* Show quickpick immediately while we wait for directories to load; helpful on
  large projects where loading may take a while

# 0.3.1

## What's New
* Added a CHANGELOG

# 0.3.0

## What's New
* Honor gitignores located above workspace root
* Added Travis.ci for Mac and Linux testing, AppVeyor for Windows testing
* Added TSLint and filled some typedef gaps

# 0.2.0

## What's New
* Ignore directories specified in VSCode setting files.exclude

## Bug Fixes
* Fix an issue where nested gitignored directories weren't being excluded

# 0.1.2

## What's New
* Full suite of unit and integration tests

## Bug Fixes
* Fix Windows support

# 0.1.1

## What's New
* Make instructional copy for directory selection step more clear
