import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as vscode from 'vscode';
import * as advancedNewFile from '../src/extension';
import * as proxyquire from 'proxyquire';
import * as path from 'path';
import * as fs from 'fs';
import { removeSync as removeDirSync } from 'fs-extra';

chai.use(chaiAsPromised);
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
});