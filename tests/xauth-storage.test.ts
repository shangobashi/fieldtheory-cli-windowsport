import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { loadTwitterOAuthTokenFromPath, saveTwitterOAuthTokenForPath } from '../src/xauth.js';
import type { XOAuthTokenSet } from '../src/types.js';

const SAMPLE_TOKEN: XOAuthTokenSet = {
  access_token: 'access-123',
  refresh_token: 'refresh-456',
  scope: 'bookmark.read',
  token_type: 'bearer',
  expires_in: 3600,
  obtained_at: '2026-04-23T00:00:00.000Z',
};

const fakeHooks = {
  protect: async (plaintext: string) => Buffer.from(`enc:${plaintext}`, 'utf8').toString('base64'),
  unprotect: async (ciphertextB64: string) => {
    const decoded = Buffer.from(ciphertextB64, 'base64').toString('utf8');
    assert.match(decoded, /^enc:/);
    return decoded.slice(4);
  },
};

async function tempTokenPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ftx-xauth-test-'));
  return path.join(dir, 'oauth-token.json');
}

test('loadTwitterOAuthTokenFromPath reads legacy plaintext token on non-Windows', async () => {
  const tokenPath = await tempTokenPath();
  await writeFile(tokenPath, JSON.stringify(SAMPLE_TOKEN, null, 2), 'utf8');

  const loaded = await loadTwitterOAuthTokenFromPath({ tokenPath, platform: 'linux' });
  assert.deepEqual(loaded, SAMPLE_TOKEN);
});

test('save/load Windows DPAPI envelope roundtrip', async () => {
  const tokenPath = await tempTokenPath();

  await saveTwitterOAuthTokenForPath(SAMPLE_TOKEN, {
    tokenPath,
    platform: 'win32',
    cryptoHooks: fakeHooks,
  });

  const raw = await readFile(tokenPath, 'utf8');
  assert.equal(raw.includes('access-123'), false, 'token file should not contain plaintext access token');
  assert.equal(raw.includes('"format": "dpapi-v1"'), true);

  const loaded = await loadTwitterOAuthTokenFromPath({
    tokenPath,
    platform: 'win32',
    cryptoHooks: fakeHooks,
  });

  assert.deepEqual(loaded, SAMPLE_TOKEN);
});

test('loadTwitterOAuthTokenFromPath migrates legacy plaintext to DPAPI envelope on Windows', async () => {
  const tokenPath = await tempTokenPath();
  await writeFile(tokenPath, JSON.stringify(SAMPLE_TOKEN, null, 2), 'utf8');

  const loaded = await loadTwitterOAuthTokenFromPath({
    tokenPath,
    platform: 'win32',
    cryptoHooks: fakeHooks,
  });

  assert.deepEqual(loaded, SAMPLE_TOKEN);

  const rawAfter = await readFile(tokenPath, 'utf8');
  assert.equal(rawAfter.includes('access-123'), false);
  const parsed = JSON.parse(rawAfter) as { format?: string; ciphertext_b64?: string };
  assert.equal(parsed.format, 'dpapi-v1');
  assert.equal(typeof parsed.ciphertext_b64, 'string');
  assert.ok((parsed.ciphertext_b64 ?? '').length > 10);
});
