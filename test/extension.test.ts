import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as spies from 'chai-spies';
import * as vscode from 'vscode';
// import * as advancedNewFile from '../src/extension';
import * as AdvancedNewFile from '../src/extension';
import * as proxyquire from 'proxyquire';
import * as path from 'path';
import * as fs from 'fs';
import { removeSync as removeDirSync } from 'fs-extra';

chai.use(chaiAsPromised);
chai.use(spies);
const expect = chai.expect;

describe('Advanced New File', () => {
  describe('guardNoSelection', () => {
    context('selection is null', () => {
      it('rejects the promise', () => {
        expect(AdvancedNewFile.guardNoSelection(null))
          .to.be.rejectedWith('No selection');
      });
    });

    context('selection is undefined', () => {
      it('rejects the promise', () => {
        expect(AdvancedNewFile.guardNoSelection())
          .to.be.rejectedWith('No selection');
      });
    });

    context('selection is a string', () => {
      it('resolves the promise with given value', () => {
        expect(AdvancedNewFile.guardNoSelection('Foo bar'))
          .to.eventually.equal('Foo bar');
      });
    });
  });

  describe('showInputBox', () => {
    it('resolves with the path to input from workspace root', () => {
      const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
        vscode: {
          window: {
            showInputBox: () => {
              return Promise.resolve('input/path/to/file.rb');
            }
          }
        }
      });

      const expectedPath =
        path.join('/', 'base', 'dir', 'input', 'path', 'to', 'file.rb');

      const directory: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          absolute: '/base/dir',
          relative: '/'
        }
      }

      return expect(advancedNewFile.showInputBox(directory))
        .to.eventually.equal(expectedPath);
    });
  });

  describe('directories', () => {
    const dummyProjectRoot = path.join(__dirname, 'dummy_project');

    it('only returns directories, prepended with /', async () => {
      let result = await AdvancedNewFile.directories(dummyProjectRoot);

      expect(result).to.include('/folder');
      expect(result).not.to.include('/folder/file');
    });

    context('with a gitignore file', () => {
      const gitignoreFile = path.join(dummyProjectRoot, '.gitignore');
      before(() => {
        fs.writeFileSync(gitignoreFile, 'ignored/**\nnested-ignored/');
      });
      after(() => fs.unlinkSync(gitignoreFile));

      it('does not include gitignored directories', async () => {
        let result = await AdvancedNewFile.directories(dummyProjectRoot);
        expect(result).not.to.include('/ignored');
      });

      it('does not include nested gitignored directories', async () => {
        let result = await AdvancedNewFile.directories(dummyProjectRoot);
        expect(result).not.to.include('/folder/nested-ignored');
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

        expect(result).not.to.include('/nested-ignored');
        expect(result).not.to.include('/nested');
      });
    });

    context('with vscode setting files.exclude', () => {
      const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
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
      });

      it('does not include directories with a true value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        expect(result).not.to.include('/ignored');
      });

      it('includes directories with a false value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        expect(result).to.include('/folder');
      });
    });

    context('with vscode setting advancedNewFile.exclude', () => {
      const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
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
      });

      it('does not include directories with a true value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        expect(result).not.to.include('/ignored');
      });

      it('includes directories with a false value', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        expect(result).to.include('/folder');
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
        after(() => fs.unlinkSync(newFileDescriptor));

        it('creates any nonexistent dirs in path', () => {
          AdvancedNewFile.createFileOrFolder(newFileDescriptor);

          expect(fs.statSync(path.join(tmpDir, 'path')).isDirectory())
            .to.be.true;

          expect(fs.statSync(path.join(tmpDir, 'path/to')).isDirectory())
            .to.be.true;
        });

        it('creates an empty file', () => {
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

        it('returns the path to file', () => {
          expect(AdvancedNewFile.createFileOrFolder(existingFileDescriptor))
            .to.eq(existingFileDescriptor);
        });
      });
    });

    context('creating folder', () => {
      context('folder does not exist', () => {
        const newFolderDescriptor = path.join(tmpDir, 'path/to/folder') +
          path.sep;

        after(() => fs.rmdirSync(newFolderDescriptor));

        it('creates any nonexistent dirs in path', () => {
          AdvancedNewFile.createFileOrFolder(newFolderDescriptor);

          expect(fs.statSync(path.join(tmpDir, 'path')).isDirectory())
            .to.be.true;

          expect(fs.statSync(path.join(tmpDir, 'path/to')).isDirectory())
            .to.be.true;
        });

        it('creates a folder', () => {
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

        it('returns the path to folder', () => {
          expect(AdvancedNewFile.createFileOrFolder(newFolderDescriptor))
            .to.eq(newFolderDescriptor);
        });
      });
    });
  });

  describe('openFile', () => {
    const mockGetConfiguration = function(config = { showInformationMessages: true }) {
      return function(name) {
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

      const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
        vscode: {
          workspace: {
            openTextDocument,
            getConfiguration: mockGetConfiguration()
          },
          window: { showTextDocument }
        }
      });

      advancedNewFile.openFile('/path/to/file.ts').then(() => {
        expect(openTextDocument).to.have.been.called.with('/path/to/file.ts');
      });
    });

    context('file can be opened successfully', () => {
      it('focuses the opened file', () => {
        const textDocument = 'mock document';
        const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
        const showTextDocument = chai.spy();

        const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
          vscode: {
            workspace: {
              openTextDocument,
              getConfiguration: mockGetConfiguration()
            },
            window: { showTextDocument }
          }
        });

        return advancedNewFile.openFile('/path/to/file.ts').then(() => {
          expect(showTextDocument).to.have.been.called.with(textDocument);
        });
      });

      it('resolves with the opened file path', () => {
        const textDocument = 'mock document';
        const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
        const showTextDocument = chai.spy();

        const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
          vscode: {
            workspace: {
              openTextDocument,
              getConfiguration: mockGetConfiguration()
            },
            window: { showTextDocument }
          }
        });

        return expect(advancedNewFile.openFile('/path/to/file.ts'))
          .to.eventually.eq('/path/to/file.ts');
      });
    });

    context('file fails to open', () => {
      it('rejects with an error message', () => {
        const textDocument = 'mock document';
        const openTextDocument = chai.spy(() => Promise.resolve(null));
        const showTextDocument = chai.spy();

        const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
          vscode: {
            workspace: {
              openTextDocument,
              getConfiguration: mockGetConfiguration()
            },
            window: { showTextDocument }
          }
        });

        return expect(advancedNewFile.openFile('/path/to/file.ts'))
          .to.eventually.be.rejectedWith('Could not open document');
      });
    });

    context('file is a folder', () => {
      it('does not attempt to open it', () => {
        const openTextDocument = chai.spy();
        const showInformationMessage = chai.spy();

        const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
          vscode: {
            workspace: {
              openTextDocument,
              getConfiguration: mockGetConfiguration()
            },
            window: {
              showInformationMessage
            }
          }
        });

        advancedNewFile.openFile(path.join('path/to/folder/')).then(() => {
          expect(openTextDocument).not.to.have.been.called();
        });
      });

      it('displays an informational message instead', () => {
        const openTextDocument = chai.spy();
        const showInformationMessage = chai.spy();

        const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
          vscode: {
            workspace: {
              openTextDocument,
              getConfiguration: mockGetConfiguration()
            },
            window: {
              showInformationMessage
            }
          }
        });

        advancedNewFile.openFile(path.join('path/to/folder/')).then(() => {
          expect(showInformationMessage).to.have.been.called.with('Folder created: /path/to/folder/');
        });
      });

      context('informational messages disabled in config', () => {
        it('does not display an informational message', () => {
          const openTextDocument = chai.spy();
          const showInformationMessage = chai.spy();

          const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
            vscode: {
              workspace: {
                openTextDocument,
                getConfiguration: mockGetConfiguration({ showInformationMessages: false })
              },
              window: {
                showInformationMessage
              }
            }
          });

          advancedNewFile.openFile(path.join('path/to/folder/')).then(() => {
            expect(showInformationMessage).not.to.have.been.called();
          });
        });
      });
    });
  });

  describe('cacheSelection', () => {
    it('returns a function that when called writes the value to cache and ' +
       'returns the selection for promise-chaining', () => {

      const cache = {
        put: chai.spy()
      }
      const fn = AdvancedNewFile.cacheSelection(cache);

      const selection: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          absolute: '/',
          relative: '/'
        }
      }

      const result = fn(selection);

      expect(cache.put).to.have.been.called.with('last', selection);
      expect(result).to.eq(selection);
    });
  });

  describe('lastSelection', () => {
    context('empty cache', () => {
      it('is undefined', () => {
        const cache = {
          has: () => false
        }
        expect(AdvancedNewFile.lastSelection(cache)).to.be.undefined;
      });
    });

    it('returns the cached last selection', () => {
      const cache = {
        has: () => true,
        get: () => '/cached/value'
      }
      expect(AdvancedNewFile.lastSelection(cache)).to.eq('/cached/value');
    });
  });

  describe('unwrapSelection', () => {
    context('no QuickPickItem selected', () => {
      it('is undefined', () => {
        expect(AdvancedNewFile.unwrapSelection(null)).to.be.undefined;
      });
    });

    it('returns the label of the selected QuickPickItem', () => {
      const item: vscode.QuickPickItem = {
        label: '/foo/bar',
        description: 'something'
      }

      expect(AdvancedNewFile.unwrapSelection(item)).to.eq('/foo/bar');
    });
  });

  describe('currentEditorPath', () => {
    context('no active editor', () => {
      it('is undefined', () => {
        const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
          vscode: {
            window: {
              activeTextEditor: undefined
            }
          }
        });

        expect(advancedNewFile.currentEditorPath()).to.be.undefined;
      });
    });

    it('returns the abssolute path to file open in active editor', () => {
      const editor = {
        document: {
          fileName: '/foo/bar/baz/bip/file.ts'
        }
      }

      const advancedNewFile = <typeof AdvancedNewFile> proxyquire('../src/extension', {
        vscode: {
          window: {
            activeTextEditor: editor
          }
        }
      });

      expect(advancedNewFile.currentEditorPath()).to.eq('/foo/bar/baz/bip');
    });
  });

  describe('prependChoice', () => {
    it('builds a QuickPickItem from the option and adds to the set', () => {
      let choices: vscode.QuickPickItem[] = [{
        label: 'existing-label',
        description: 'existing-description'
      }];

      const option: AdvancedNewFile.DirectoryOption = {
        displayText: 'foo',
        fsLocation: {
          absolute: '/',
          relative: '/'
        }
      }

      const result = AdvancedNewFile.prependChoice(choices, option, 'description');

      expect(result).to.include({
        label: 'foo',
        description: 'description',
        option: option
      });
    });

    context('no label given', () => {
      it('does not add a choice', () => {
        let choices: vscode.QuickPickItem[] = [{
          label: 'existing-label',
          description: 'existing-description'
        }];

        const result = AdvancedNewFile.prependChoice(choices, null, 'description');

        expect(result.length).to.eq(1);
      })
    });
  });

  describe('command integration tests', () => {
    const tmpDir = path.join(__dirname, 'createFileOrFolder.tmp');
    beforeEach(() => fs.mkdirSync(tmpDir));
    afterEach(() => removeDirSync(tmpDir));

    it('creates and opens a file at given path', () => {
      let command;
      const registerCommand = (name, commandFn) => command = commandFn;

      const textDocument = 'mock document';
      const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
      const showTextDocument = chai.spy();
      const showErrorMessage = chai.spy();

      const advancedNewFile = proxyquire('../src/extension', {
        vscode: {
          commands: { registerCommand },
          workspace: {
            rootPath: tmpDir,
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
            showQuickPick: () => Promise.resolve({ label: 'path/to' }),
            showInputBox: () => Promise.resolve('input/path/to/file.rb'),
            showTextDocument
          }
        },
        fs: {
          statSync: () => {
            return { isDirectory: () => true };
          }
        },
        'vscode-cache': class Cache {
          get() {}
          has() { return false }
          put() {}
        }
      });

      const context = { subscriptions: [] };

      advancedNewFile.activate(context);

      const newFileDescriptor =
        path.join(tmpDir, 'path/to/input/path/to/file.rb');

      return command().then(() => {
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

      const advancedNewFile = proxyquire('../src/extension', {
        vscode: {
          commands: { registerCommand },
          workspace: {
            rootPath: tmpDir,
            openTextDocument,
            getConfiguration(name) {
              switch (name) {
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
            showQuickPick: () => Promise.resolve({ label: 'path/to' }),
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
          get() {}
          has() { return false }
          put() {}
        }
      });

      const context = { subscriptions: [] };

      advancedNewFile.activate(context);

      const newFolderDescriptor =
        path.join(tmpDir, 'path/to/input/path/to/folder/');

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

    context('info messages disabled in settings', () => {
      it('creates a folder at given path and does not show information ' +
         'message', () => {
        let command;
        const registerCommand = (name, commandFn) => command = commandFn;

        const textDocument = 'mock document';
        const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
        const showTextDocument = chai.spy();
        const showErrorMessage = chai.spy();
        const showInformationMessage = chai.spy();

        const advancedNewFile = proxyquire('../src/extension', {
          vscode: {
            commands: { registerCommand },
            workspace: {
              rootPath: tmpDir,
              openTextDocument,
              getConfiguration(name) {
                switch (name) {
                  case 'advancedNewFile':
                    return {
                      get: (name, defaultValue) => false
                    };
                  default:
                    return {};
                }
              }
            },
            window: {
              showErrorMessage,
              showQuickPick: () => Promise.resolve({ label: 'path/to' }),
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
            get() {}
            has() { return false }
            put() {}
          }
        });

        const context = { subscriptions: [] };

        advancedNewFile.activate(context);

        const newFolderDescriptor =
          path.join(tmpDir, 'path/to/input/path/to/folder/');

        return command().then(() => {
          expect(openTextDocument)
            .to.not.have.been.called.with(newFolderDescriptor);

          expect(showTextDocument)
            .to.not.have.been.called.with(textDocument);

          expect(showInformationMessage).to.not.have.been.called();

          expect(fs.statSync(newFolderDescriptor).isDirectory())
            .to.be.true;
        });
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
            workspace: { rootPath: undefined },
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
