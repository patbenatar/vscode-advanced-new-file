import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as spies from 'chai-spies';
import * as vscode from 'vscode';
import { ViewColumn } from 'vscode';
import * as AdvancedNewFile from '../src/extension';
import * as proxyquire from 'proxyquire';
import * as path from 'path';
import * as fs from 'fs';
import { removeSync as removeDirSync } from 'fs-extra';
import { cacheSelection } from '../src/extension';

chai.use(chaiAsPromised);
chai.use(spies);
const expect = chai.expect;

describe('Advanced New File', () => {
  describe('showInputBox', () => {
    it('resolves with the path to input from workspace root', async () => {
      const advancedNewFile =
        proxyquire('../src/extension', {
          vscode: {
            window: {
              showInputBox: () => {
                return Promise.resolve('input/path/to/file.rb');
              }
            }
          }
        }) as typeof AdvancedNewFile;

      const expectedPath =
        path.join('/', 'base', 'dir', 'input', 'path', 'to', 'file.rb');

      const directory: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          absolute: '/base/dir',
          relative: '/'
        }
      };

      const result = await advancedNewFile.showInputBox(directory);

      expect(result).to.eq(expectedPath);
    });
  });

  describe('directories', () => {
    const dummyProjectRoot = path.join(__dirname, 'dummy_project');

    it('only returns directories, prepended with /', async () => {
      let result = await AdvancedNewFile.directories(dummyProjectRoot);
      let relativePaths = result.map(r => r.relative);

      expect(relativePaths).to.include(`${path.sep}folder`);
      expect(relativePaths).not.to.include(`${path.sep}folder${path.sep}file`);
    });

    context('with a gitignore file', () => {
      const gitignoreFile = path.join(dummyProjectRoot, '.gitignore');
      before(() => {
        fs.writeFileSync(gitignoreFile, 'ignored/**\nnested-ignored/');
      });
      after(() => fs.unlinkSync(gitignoreFile));

      it('does not include gitignored directories', async () => {
        let result = await AdvancedNewFile.directories(dummyProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths).not.to.include(`${path.sep}ignored`);
      });

      it('does not include nested gitignored directories', async () => {
        let result = await AdvancedNewFile.directories(dummyProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths)
          .not.to.include(`${path.sep}folder${path.sep}nested-ignored`);
      });
    });

    context('with a gitignore file in a directory above workspace root', () => {
      const testProjectRoot = path.join(dummyProjectRoot, 'folder');
      const parentGitignoreFile =
        path.join(testProjectRoot, '..', '.gitignore');
      const gitignoreFile = path.join(testProjectRoot, '.gitignore');

      before(() => {
        fs.writeFileSync(parentGitignoreFile, 'nested-ignored/');
        fs.writeFileSync(gitignoreFile, 'nested/');
      });

      after(() => {
        fs.unlinkSync(parentGitignoreFile);
        fs.unlinkSync(gitignoreFile);
      });

      it('ignores as specified in both gitignore files', async () => {
        let result = await AdvancedNewFile.directories(testProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths).not.to.include(`${path.sep}nested-ignored`);
        expect(relativePaths).not.to.include(`${path.sep}nested`);
      });
    });

    context('with vscode setting files.exclude', () => {
      const advancedNewFile =
        proxyquire('../src/extension', {
          vscode: {
            workspace: {
              getConfiguration(name) {
                switch (name) {
                  case 'advancedNewFile':
                    return {
                      get: () => {}
                    };
                  default:
                    return {
                      'ignored/': true,
                      'folder/': false
                    };
                }
              }
            }
          }
        }) as typeof AdvancedNewFile;

      it('does not include directories with a true value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths).not.to.include(`${path.sep}ignored`);
      });

      it('includes directories with a false value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths).to.include(`${path.sep}folder`);
      });
    });

    context('with vscode setting advancedNewFile.exclude', () => {
      const advancedNewFile =
        proxyquire('../src/extension', {
          vscode: {
            workspace: {
              getConfiguration(name) {
                switch (name) {
                  case 'advancedNewFile':
                    return {
                      get: () => {
                        return {
                          'ignored/': true,
                          'folder/': false
                        };
                      }
                    };
                  default:
                    return {};
                }
              }
            }
          }
        }) as typeof AdvancedNewFile;

      it('does not include directories with a true value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths).not.to.include(`${path.sep}ignored`);
      });

      it('includes directories with a false value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        let relativePaths = result.map(r => r.relative);

        expect(relativePaths).to.include(`${path.sep}folder`);
      });
    });
  });

  describe('createFileOrFolder', () => {
    const tmpDir = path.join(__dirname, 'createFileOrFolder.tmp');
    before(() => fs.mkdirSync(tmpDir));
    after(() => removeDirSync(tmpDir));

    context('creating file', () => {
      context('file does not exist', () => {
        const newFileDescriptor = path.join(tmpDir, 'path/to/file.ts');
        afterEach(() => fs.unlinkSync(newFileDescriptor));

        it('creates any nonexistent dirs in path', () => {
          AdvancedNewFile.createFileOrFolder(newFileDescriptor);

          expect(fs.statSync(path.join(tmpDir, 'path')).isDirectory())
            .to.be.true;

          expect(fs.statSync(path.join(tmpDir, 'path/to')).isDirectory())
            .to.be.true;
        });

        it('creates an empty file', () => {
          AdvancedNewFile.createFileOrFolder(newFileDescriptor);

          expect(fs.readFileSync(newFileDescriptor, { encoding: 'utf8' }))
            .to.eq('');
        });
      });

      context('file exists', () => {
        const existingFileDescriptor = path.join(tmpDir, 'file.ts');
        before(() => {
          fs.appendFileSync(existingFileDescriptor, 'existing content');
        });
        after(() => fs.unlinkSync(existingFileDescriptor));

        it('does not overwrite the file', () => {
          AdvancedNewFile.createFileOrFolder(existingFileDescriptor);

          expect(fs.readFileSync(existingFileDescriptor, { encoding: 'utf8' }))
            .to.eq('existing content');
        });
      });
    });

    context('creating folder', () => {
      context('folder does not exist', () => {
        const newFolderDescriptor = path.join(tmpDir, 'path/to/folder') +
          path.sep;

        afterEach(() => fs.rmdirSync(newFolderDescriptor));

        it('creates any nonexistent dirs in path', () => {
          AdvancedNewFile.createFileOrFolder(newFolderDescriptor);

          expect(fs.statSync(path.join(tmpDir, 'path')).isDirectory())
            .to.be.true;

          expect(fs.statSync(path.join(tmpDir, 'path/to')).isDirectory())
            .to.be.true;
        });

        it('creates a folder', () => {
          AdvancedNewFile.createFileOrFolder(newFolderDescriptor);

          expect(fs.statSync(path.join(tmpDir, 'path/to/folder')).isDirectory())
            .to.be.true;
        });
      });

      context('folder with content exists', () => {
        const existingFolderDescriptor = path.join(tmpDir, 'folder');
        const existingFileDescriptor = path.join(
          existingFolderDescriptor,
          'file.txt'
        );
        const newFolderDescriptor = path.join(tmpDir, 'folder') + path.sep;

        before(() => {
          fs.mkdirSync(existingFolderDescriptor);
          fs.appendFileSync(existingFileDescriptor, 'existing content');
        });
        after(() => {
          fs.unlinkSync(existingFileDescriptor);
          fs.rmdirSync(existingFolderDescriptor);
        });

        it('does not delete folder content', () => {
          AdvancedNewFile.createFileOrFolder(newFolderDescriptor);

          expect(
            fs.readFileSync(existingFileDescriptor, { encoding: 'utf8' })
          )
            .to.eq('existing content');
        });
      });
    });
  });

  describe('openFile', () => {
    const mockGetConfiguration =
      (config = { showInformationMessages: true }) => {
        return (name) => {
          switch (name) {
            case 'advancedNewFile':
              return {
                get: (configName) => config[configName]
              };
            default:
              return {};
          }
        };
      };

    it('attempts to open the file', () => {
      const textDocument = 'mock document';
      const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
      const showTextDocument = chai.spy();

      const advancedNewFile =
        proxyquire('../src/extension', {
          vscode: {
            workspace: {
              openTextDocument,
              getConfiguration: mockGetConfiguration()
            },
            window: { showTextDocument }
          }
        }) as typeof AdvancedNewFile;

      advancedNewFile.openFile('/path/to/file.ts').then(() => {
        expect(openTextDocument)
          .to.have.been.called.with('/path/to/file.ts', ViewColumn.Active);
      });
    });

    context('file can be opened successfully', () => {
      it('focuses the opened file', () => {
        const textDocument = 'mock document';
        const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
        const showTextDocument = chai.spy();

        const advancedNewFile =
          proxyquire('../src/extension', {
            vscode: {
              workspace: {
                openTextDocument,
                getConfiguration: mockGetConfiguration()
              },
              window: { showTextDocument }
            }
          }) as typeof AdvancedNewFile;

        return advancedNewFile.openFile('/path/to/file.ts').then(() => {
          expect(showTextDocument).to.have.been.called.with(textDocument);
        });
      });
    });

    context('file is a folder', () => {
      it('does not attempt to open it', () => {
        const openTextDocument = chai.spy();
        const showInformationMessage = chai.spy();

        const advancedNewFile =
          proxyquire('../src/extension', {
            vscode: {
              workspace: {
                openTextDocument,
                getConfiguration: mockGetConfiguration()
              },
              window: {
                showInformationMessage
              }
            }
          }) as typeof AdvancedNewFile;

        advancedNewFile.openFile(path.join('path/to/folder/')).then(() => {
          expect(openTextDocument).not.to.have.been.called();
        });
      });

      it('displays an informational message instead', () => {
        const openTextDocument = chai.spy();
        const showInformationMessage = chai.spy();

        const advancedNewFile =
          proxyquire('../src/extension', {
            vscode: {
              workspace: {
                openTextDocument,
                getConfiguration: mockGetConfiguration()
              },
              window: {
                showInformationMessage
              }
            }
          }) as typeof AdvancedNewFile;

        advancedNewFile.openFile(path.join('path/to/folder/')).then(() => {
          expect(showInformationMessage).to
            .have.been.called.with('Folder created: /path/to/folder/');
        });
      });

      context('informational messages disabled in config', () => {
        it('does not display an informational message', () => {
          const openTextDocument = chai.spy();
          const showInformationMessage = chai.spy();

          const advancedNewFile =
            proxyquire('../src/extension', {
              vscode: {
                workspace: {
                  openTextDocument,
                  getConfiguration: mockGetConfiguration({
                    showInformationMessages: false
                  })
                },
                window: {
                  showInformationMessage
                }
              }
            }) as typeof AdvancedNewFile;

          advancedNewFile.openFile(path.join('path/to/folder/')).then(() => {
            expect(showInformationMessage).not.to.have.been.called();
          });
        });
      });
    });
  });

  describe('lastSelection', () => {
    context('empty cache', () => {
      it('is undefined', () => {
        const cache = {
          has: () => false
        };

        expect(AdvancedNewFile.lastSelection(cache)).to.be.undefined;
      });
    });

    it('returns the cached last selection', () => {
      const lastSelection: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          absolute: '/',
          relative: '/'
        }
      };
      const cache = {
        has: () => true,
        get: () => lastSelection
      };

      expect(AdvancedNewFile.lastSelection(cache)).to.eq(lastSelection);
    });
  });

  describe('currentEditorPath', () => {
    context('no active editor', () => {
      it('is undefined', () => {
        const advancedNewFile =
          proxyquire('../src/extension', {
            vscode: {
              window: {
                activeTextEditor: undefined
              }
            }
          }) as typeof AdvancedNewFile;

        expect(advancedNewFile.currentEditorPath()).to.be.undefined;
      });
    });

    it('returns the abssolute path to file open in active editor', () => {
      const editor = {
        document: {
          fileName: '/foo/bar/baz/bip/file.ts'
        }
      };

      const advancedNewFile =
        proxyquire('../src/extension', {
          vscode: {
            window: {
              activeTextEditor: editor
            }
          }
        }) as typeof AdvancedNewFile;

      expect(advancedNewFile.currentEditorPath()).to.eq('/foo/bar/baz/bip');
    });
  });

  describe('rootForDir', () => {
    it('returns the root for the selected dir base path', () => {
      const fooRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/foo',
        baseName: 'foo',
        multi: true
      };

      const barRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/bar',
        baseName: 'bar',
        multi: true
      };

      const roots = [fooRoot, barRoot];

      const selectedDir: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          relative: '/baz',
          absolute: '/bar/baz'
        }
      };

      const result = AdvancedNewFile.rootForDir(roots, selectedDir);
      expect(result).to.eq(barRoot);
    });
  });

  describe('cacheSelection', () => {
    it('caches the last selected dir', () => {
      const cache = { put: chai.spy(), get: () => [] };
      const selectedDir: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          relative: '/bar',
          absolute: '/foo/bar'
        }
      };
      const selectedRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/foo',
        baseName: 'foo',
        multi: false
      };

      AdvancedNewFile.cacheSelection(cache, selectedDir, selectedRoot);

      expect(cache.put).to.have.been.called.with('last', selectedDir);
    });

    it('reorders the cache of recent roots', () => {
      const oldRecentRoots = ['/foo', '/bar', '/baz'];
      const cache = { put: chai.spy(), get: () => oldRecentRoots };
      const selectedDir: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          relative: '/bar',
          absolute: '/foo/bar'
        }
      };
      const selectedRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/bar',
        baseName: 'bar',
        multi: true
      };

      AdvancedNewFile.cacheSelection(cache, selectedDir, selectedRoot);

      const newRecentRoots = ['/bar', '/foo', '/baz'];

      expect(cache.put).to.have.been.called.with('recentRoots', newRecentRoots);
    });

    context('root doesnt yet exist in cached recentRoots', () => {
      it('prepends the new root', () => {
        const oldRecentRoots = ['/foo', '/baz'];
        const cache = { put: chai.spy(), get: () => oldRecentRoots };
        const selectedDir: AdvancedNewFile.DirectoryOption = {
          displayText: 'foo',
          fsLocation: {
            relative: '/bar',
            absolute: '/foo/bar'
          }
        };
        const selectedRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/bar',
          baseName: 'bar',
          multi: true
        };

        AdvancedNewFile.cacheSelection(cache, selectedDir, selectedRoot);

        const newRecentRoots = ['/bar', '/foo', '/baz'];

        expect(cache.put).to
          .have.been.called.with('recentRoots', newRecentRoots);
      });
    });
  });

  describe('sortRootsByRecent', () => {
    it('returns the roots sorted to match the cache of recent roots', () => {
      const fooRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/foo',
        baseName: 'foo',
        multi: true
      };

      const barRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/bar',
        baseName: 'bar',
        multi: true
      };

      const bazRoot: AdvancedNewFile.WorkspaceRoot = {
        rootPath: '/baz',
        baseName: 'baz',
        multi: true
      };

      const roots = [fooRoot, barRoot, bazRoot];
      const desiredOrder = ['/bar', '/foo', '/baz'];

      const result = AdvancedNewFile.sortRoots(roots, desiredOrder);
      expect(result).to.eql([barRoot, fooRoot, bazRoot]);
    });

    context('no cache', () => {
      it('returns the roots in their original order', () => {
        const fooRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/foo',
          baseName: 'foo',
          multi: true
        };

        const barRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/bar',
          baseName: 'bar',
          multi: true
        };

        const roots = [fooRoot, barRoot];
        const desiredOrder = [];

        const result = AdvancedNewFile.sortRoots(roots, desiredOrder);
        expect(result).to.eql(roots);
      });
    });

    context('partial cache', () => {
      it('sorts what it can, and returns un-cached roots at the end', () => {
        const fooRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/foo',
          baseName: 'foo',
          multi: true
        };

        const barRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/bar',
          baseName: 'bar',
          multi: true
        };

        const bazRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/baz',
          baseName: 'baz',
          multi: true
        };

        const bipRoot: AdvancedNewFile.WorkspaceRoot = {
          rootPath: '/bip',
          baseName: 'bip',
          multi: true
        };

        const roots = [fooRoot, bazRoot, barRoot, bipRoot];
        const desiredOrder = ['/bar', '/foo'];

        const result = AdvancedNewFile.sortRoots(roots, desiredOrder);
        expect(result).to.eql([barRoot, fooRoot, bazRoot, bipRoot]);
      });
    });
  });

  describe('command integration tests', () => {
    const tmpDir = path.join(__dirname, 'createFileOrFolder.tmp');
    beforeEach(() => fs.mkdirSync(tmpDir));
    afterEach(() => removeDirSync(tmpDir));

    it('creates and opens a file at given path', () => {
      const textDocument = 'mock document';
      const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
      const showTextDocument = chai.spy();
      const showErrorMessage = chai.spy();

      const selectedRelativeDir = '/path/to';
      const selectedAbsoluteDir = path.join(tmpDir, '/path/to');
      const selectedOption: AdvancedNewFile.DirectoryOption = {
        displayText: selectedRelativeDir,
        fsLocation: {
          relative: selectedRelativeDir,
          absolute: selectedAbsoluteDir
        }
      };

      const advancedNewFile = proxyquire('../src/extension', {
        vscode: {
          workspace: {
            workspaceFolders: [{ uri: { fsPath: tmpDir }}],
            openTextDocument,
            getConfiguration(name) {
              switch (name) {
                case 'advancedNewFile':
                  return {
                    get: () => {}
                  };
                default:
                  return {};
              }
            }
          },
          window: {
            showErrorMessage,
            showQuickPick: () => Promise.resolve({
              label: '/path/to', option: selectedOption
            }),
            showInputBox: () => Promise.resolve('/input/path/to/file.rb'),
            showTextDocument
          }
        },
        fs: {
          statSync: () => {
            return { isDirectory: () => true };
          }
        },
        'vscode-cache': class Cache {
          public get() {}
          public has() { return false; }
          public put() {}
        }
      });

      const context = { subscriptions: [] };

      const newFileDescriptor =
        path.join(selectedAbsoluteDir, '/input/path/to/file.rb');

      return advancedNewFile.command(context).then(() => {
        expect(openTextDocument)
          .to.have.been.called.with(newFileDescriptor);

        expect(showTextDocument)
          .to.have.been.called.with(textDocument);

        expect(fs.readFileSync(newFileDescriptor, { encoding: 'utf8' }))
          .to.eq('');
      });
    });

    it('creates a folder at given path and shows information message', () => {
      let command;
      const registerCommand = (name, commandFn) => command = commandFn;

      const textDocument = 'mock document';
      const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
      const showTextDocument = chai.spy();
      const showErrorMessage = chai.spy();
      const showInformationMessage = chai.spy();

      const selectedRelativeDir = '/path/to';
      const selectedAbsoluteDir = path.join(tmpDir, '/path/to');
      const selectedOption: AdvancedNewFile.DirectoryOption = {
        displayText: selectedRelativeDir,
        fsLocation: {
          relative: selectedRelativeDir,
          absolute: selectedAbsoluteDir
        }
      };

      const advancedNewFile = proxyquire('../src/extension', {
        vscode: {
          commands: { registerCommand },
          workspace: {
            workspaceFolders: [{ uri: { fsPath: tmpDir }}],
            openTextDocument,
            getConfiguration(configName) {
              switch (configName) {
                case 'advancedNewFile':
                  return {
                    get: (name, defaultValue) => defaultValue
                  };
                default:
                  return {};
              }
            }
          },
          window: {
            showErrorMessage,
            showQuickPick: () => Promise.resolve({
              label: 'path/to', option: selectedOption
            }),
            showInputBox: () => Promise.resolve('input/path/to/folder/'),
            showInformationMessage,
            showTextDocument
          }
        },
        fs: {
          statSync: () => {
            return { isDirectory: () => true };
          }
        },
        'vscode-cache': class Cache {
          public get() {}
          public has() { return false; }
          public put() {}
        }
      });

      const context = { subscriptions: [] };

      advancedNewFile.activate(context);

      const newFolderDescriptor =
        path.join(selectedAbsoluteDir, 'input/path/to/folder/');

      return command().then(() => {
        expect(openTextDocument)
          .to.not.have.been.called.with(newFolderDescriptor);

        expect(showTextDocument)
          .to.not.have.been.called.with(textDocument);

        expect(showInformationMessage)
          .to.have.been.called.with(`Folder created: ${newFolderDescriptor}`);

        expect(fs.statSync(newFolderDescriptor).isDirectory())
          .to.be.true;
      });
    });

    context('no project opened in workspace', () => {
      it('shows an error message', () => {
        let command;
        const registerCommand = (name, commandFn) => command = commandFn;
        const showErrorMessage = chai.spy();

        const advancedNewFile = proxyquire('../src/extension', {
          vscode: {
            commands: { registerCommand },
            workspace: { workspaceFolders: [] },
            window: { showErrorMessage }
          }
        });

        const context = { subscriptions: [] };

        advancedNewFile.activate(context);
        command();

        expect(showErrorMessage)
          .to.have.been.called
          .with('It doesn\'t look like you have a folder opened in your ' +
                'workspace. Try opening a folder first.');
      });
    });
  });
});
