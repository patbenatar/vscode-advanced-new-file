import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as spies from 'chai-spies';
import * as vscode from 'vscode';
import * as advancedNewFile from '../src/extension';
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
        expect(advancedNewFile.guardNoSelection(null))
          .to.be.rejectedWith('No selection');
      });
    });

    context('selection is undefined', () => {
      it('rejects the promise', () => {
        expect(advancedNewFile.guardNoSelection())
          .to.be.rejectedWith('No selection');
      });
    });

    context('selection is a string', () => {
      it('resolves the promise with given value', () => {
        expect(advancedNewFile.guardNoSelection('Foo bar'))
          .to.eventually.equal('Foo bar');
      });
    });
  });

  describe('showInputBox', () => {
    it('resolves with the path to input from workspace root', () => {
      const advancedNewFile = proxyquire('../src/extension', {
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

      return expect(advancedNewFile.showInputBox('/base/dir'))
        .to.eventually.equal(expectedPath);
    });
  });

  describe('directories', () => {
    const dummyProjectRoot = path.join(__dirname, 'dummy_project');

    it('only returns directories, prepended with /', async () => {
      let result = await advancedNewFile.directories(dummyProjectRoot);

      expect(result).to.include('/folder');
      expect(result).not.to.include('/folder/file');
    });

    it('includes its root (/) in the set', async () => {
      let result = await advancedNewFile.directories(dummyProjectRoot);
      expect(result).to.include('/');
    });

    context('with a gitignore file', () => {
      const gitignoreFile = path.join(dummyProjectRoot, '.gitignore');
      before(() => {
        fs.writeFileSync(gitignoreFile, 'ignored/**\nnested-ignored/');
      });
      after(() => fs.unlinkSync(gitignoreFile));

      it('does not include gitignored directories', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
        expect(result).not.to.include('/ignored');
      });

      it('does not include nested gitignored directories', async () => {
        let result = await advancedNewFile.directories(dummyProjectRoot);
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
        let result = await advancedNewFile.directories(testProjectRoot);

        expect(result).not.to.include('/nested-ignored');
        expect(result).not.to.include('/nested');
      });
    });

    context('with vscode setting files.exclude', () => {
      const advancedNewFile = proxyquire('../src/extension', {
        vscode: {
          workspace: {
            getConfiguration() {
              return {
                'ignored/': true,
                'folder/': false
              };
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
          advancedNewFile.createFileOrFolder(newFileDescriptor);

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
          advancedNewFile.createFileOrFolder(existingFileDescriptor);

          expect(fs.readFileSync(existingFileDescriptor, { encoding: 'utf8' }))
            .to.eq('existing content');
        });

        it('returns the path to file', () => {
          expect(advancedNewFile.createFileOrFolder(existingFileDescriptor))
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
          advancedNewFile.createFileOrFolder(newFolderDescriptor);

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
          advancedNewFile.createFileOrFolder(newFolderDescriptor);

          expect(
            fs.readFileSync(existingFileDescriptor, { encoding: 'utf8' })
          )
            .to.eq('existing content');
        });

        it('returns the path to folder', () => {
          expect(advancedNewFile.createFileOrFolder(newFolderDescriptor))
            .to.eq(newFolderDescriptor);
        });
      });
    });
  });

  describe('openFile', () => {
    it('attempts to open the file', () => {
      const textDocument = 'mock document';
      const openTextDocument = chai.spy(() => Promise.resolve(textDocument));
      const showTextDocument = chai.spy();

      const advancedNewFile = proxyquire('../src/extension', {
        vscode: {
          workspace: { openTextDocument },
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

        const advancedNewFile = proxyquire('../src/extension', {
          vscode: {
            workspace: { openTextDocument },
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

        const advancedNewFile = proxyquire('../src/extension', {
          vscode: {
            workspace: { openTextDocument },
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

        const advancedNewFile = proxyquire('../src/extension', {
          vscode: {
            workspace: { openTextDocument },
            window: { showTextDocument }
          }
        });

        return expect(advancedNewFile.openFile('/path/to/file.ts'))
          .to.eventually.be.rejectedWith('Could not open document');
      });
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
            getConfiguration() { return {}; }
          },
          window: {
            showErrorMessage,
            showQuickPick: () => Promise.resolve('path/to'),
            showInputBox: () => Promise.resolve('input/path/to/file.rb'),
            showTextDocument
          }
        },
        fs: {
          statSync: () => {
            return { isDirectory: () => true };
          }
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

    it('creates a folder at given path', () => {
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
            getConfiguration() { return {}; }
          },
          window: {
            showErrorMessage,
            showQuickPick: () => Promise.resolve('path/to'),
            showInputBox: () => Promise.resolve('input/path/to/folder/'),
            showTextDocument
          }
        },
        fs: {
          statSync: () => {
            return { isDirectory: () => true };
          }
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
