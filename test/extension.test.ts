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

      return expect(advancedNewFile.showInputBox('/base/dir'))
        .to.eventually.equal('/base/dir/input/path/to/file.rb');
    });
  });

  describe('directories', () => {
    const loadWithMocks = () => {
      return proxyquire('../src/extension', {
        'glob-fs': () => {
          return {
            readdirSync: () => {
              return [
                'path',
                'path/to',
                'path/to/file.rb'
              ];
            }
          }
        },
        fs: {
          statSync: (fileDescriptor) => {
            switch(fileDescriptor) {
              case '/root/path/path/to/file.rb':
                return { isDirectory: () => false };
              default:
                return { isDirectory: () => true };
            }
          }
        }
      });
    };

    it('only returns directories, prepended with /', () => {
      const advancedNewFile = loadWithMocks();

      let result = advancedNewFile.directories('/root/path');

      expect(result).to.include('/path');
      expect(result).to.include('/path/to');
      expect(result).not.to.include('/path/to/file.rb');
    });

    it('adds its root (/) to the set', () => {
      const advancedNewFile = loadWithMocks();

      let result = advancedNewFile.directories('/root/path');

      expect(result).to.include('/');
    });
  });

  describe('createFile', () => {
    const tmpDir = path.join(__dirname, 'createFile.tmp');
    before(() => fs.mkdirSync(tmpDir));
    after(() => removeDirSync(tmpDir));

    context('file does not exist', () => {
      const newFileDescriptor = path.join(tmpDir, 'path/to/file.ts');
      after(() => fs.unlinkSync(newFileDescriptor));

      it('creates any nonexistent dirs in path', () => {
        advancedNewFile.createFile(newFileDescriptor);

        expect(fs.statSync(path.join(tmpDir, 'path')).isDirectory()).to.be.true;
        expect(fs.statSync(path.join(tmpDir, 'path/to')).isDirectory()).to.be.true;
      });

      it('creates an empty file', () => {
        expect(fs.readFileSync(newFileDescriptor, { encoding: 'utf8' }))
          .to.eq('');
      });
    });

    context('file exists', () => {
      const existingFileDescriptor = path.join(tmpDir, 'file.ts');
      before(() => fs.appendFileSync(existingFileDescriptor, 'existing content'));
      after(() => fs.unlinkSync(existingFileDescriptor));

      it('does not overwrite the file', () => {
        advancedNewFile.createFile(existingFileDescriptor);

        expect(fs.readFileSync(existingFileDescriptor, { encoding: 'utf8' }))
          .to.eq('existing content');
      });

      it('returns the path to file', () => {
        expect(advancedNewFile.createFile(existingFileDescriptor))
          .to.eq(existingFileDescriptor);
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
          workspace: { openTextDocument: openTextDocument },
          window: { showTextDocument: showTextDocument }
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
            workspace: { openTextDocument: openTextDocument },
            window: { showTextDocument: showTextDocument }
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
            workspace: { openTextDocument: openTextDocument },
            window: { showTextDocument: showTextDocument }
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
            workspace: { openTextDocument: openTextDocument },
            window: { showTextDocument: showTextDocument }
          }
        });

        return expect(advancedNewFile.openFile('/path/to/file.ts'))
          .to.eventually.be.rejectedWith('Could not open document');
      });
    });
  });

  describe('command integration tests', () => {
    const tmpDir = path.join(__dirname, 'createFile.tmp');
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
          commands: { registerCommand: registerCommand },
          workspace: {
            rootPath: tmpDir,
            openTextDocument: openTextDocument
          },
          window: {
            showErrorMessage: showErrorMessage,
            showQuickPick: () => Promise.resolve('path/to'),
            showInputBox: () => Promise.resolve('input/path/to/file.rb'),
            showTextDocument: showTextDocument
          }
        },
        'glob-fs': () => {
          return { readdirSync: () => ['path', 'path/to'] }
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

    context('no project opened in workspace', () => {
      it('shows an error message', () => {
        let command;
        const registerCommand = (name, commandFn) => command = commandFn;
        const showErrorMessage = chai.spy();

        const advancedNewFile = proxyquire('../src/extension', {
          vscode: {
            commands: { registerCommand: registerCommand },
            workspace: { rootPath: undefined },
            window: { showErrorMessage: showErrorMessage }
          }
        });

        const context = { subscriptions: [] };

        advancedNewFile.activate(context);
        command();

        expect(showErrorMessage)
          .to.have.been.called
          .with('It doesn\'t look like you have a folder opened in your workspace. Try opening a folder first.');
      });
    });
  });
});