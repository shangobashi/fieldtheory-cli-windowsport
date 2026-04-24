import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildWindowsAclGrant, normalizeWindowsAclTargetPath } from '../src/windows-acl.js';

test('normalizeWindowsAclTargetPath resolves and normalizes relative paths', () => {
  const input = `.${path.sep}tmp${path.sep}..${path.sep}tokens${path.sep}oauth.json`;
  const normalized = normalizeWindowsAclTargetPath(input);
  assert.equal(path.isAbsolute(normalized), true);
  assert.equal(normalized.includes('..'), false);
});

test('normalizeWindowsAclTargetPath rejects empty and NUL-containing paths', () => {
  assert.throws(() => normalizeWindowsAclTargetPath('   '), /must not be empty/i);
  assert.throws(() => normalizeWindowsAclTargetPath('bad\0path'), /NUL/i);
});

test('buildWindowsAclGrant uses file and directory grant formats', () => {
  assert.equal(buildWindowsAclGrant('DOMAIN\\user', false), 'DOMAIN\\user:F');
  assert.equal(buildWindowsAclGrant('DOMAIN\\user', true), 'DOMAIN\\user:(OI)(CI)F');
});
