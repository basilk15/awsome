const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ensurePrivateDirectory } = require('../electron/privateDirectory.cjs');

const hasPosixModes = process.platform !== 'win32';

test('new and existing desktop storage directories are private', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awsome-permissions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'com.basil.awsome.electron');
  ensurePrivateDirectory(directory);
  assert.ok(fs.statSync(directory).isDirectory());
  if (hasPosixModes) {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    fs.chmodSync(directory, 0o755);
  }
  fs.writeFileSync(path.join(directory, 'saved'), 'existing data');
  ensurePrivateDirectory(directory);
  if (hasPosixModes) assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(directory, 'saved'), 'utf8'), 'existing data');
});

test('rejects a linked desktop storage directory', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awsome-permissions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = fs.mkdtempSync(path.join(root, 'target-'));
  const directory = path.join(root, 'linked');
  fs.symlinkSync(target, directory, 'junction');
  assert.throws(() => ensurePrivateDirectory(directory));
});
