import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createCipheriv, createHash, randomBytes } from 'node:crypto';
import { decryptCookieValue, decryptWindowsCookieValue } from '../src/chrome-cookies.js';

function encryptLikeChrome(plaintext: string, password = 'test-password'): { encrypted: Buffer; key: Buffer } {
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const iv = Buffer.alloc(16, 0x20);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const encrypted = Buffer.concat([Buffer.from('v10'), ciphertext]);
  return { encrypted, key };
}

test('decryptCookieValue: decrypts v10-prefixed Chrome cookie', () => {
  const { encrypted, key } = encryptLikeChrome('my-secret-csrf-token');
  const result = decryptCookieValue(encrypted, key);
  assert.equal(result, 'my-secret-csrf-token');
});

test('decryptCookieValue: returns empty string for empty buffer', () => {
  const key = pbkdf2Sync('test', 'saltysalt', 1003, 16, 'sha1');
  const result = decryptCookieValue(Buffer.alloc(0), key);
  assert.equal(result, '');
});

test('decryptCookieValue: returns raw utf8 for non-v10 prefix (unencrypted)', () => {
  const key = pbkdf2Sync('test', 'saltysalt', 1003, 16, 'sha1');
  const buf = Buffer.from('plain-cookie-value', 'utf8');
  const result = decryptCookieValue(buf, key);
  assert.equal(result, 'plain-cookie-value');
});

test('decryptCookieValue: round-trips various cookie values', () => {
  const values = [
    'abc123',
    'a-much-longer-csrf-token-that-is-over-16-bytes-long-and-needs-multiple-blocks',
    '特殊文字',
    '{"json":"value"}',
  ];
  for (const value of values) {
    const { encrypted, key } = encryptLikeChrome(value);
    const result = decryptCookieValue(encrypted, key);
    assert.equal(result, value, `Round-trip failed for: ${value}`);
  }
});

test('decryptCookieValue: uses correct PBKDF2 parameters (1003 iterations, sha1, saltysalt)', () => {
  const password = 'Chrome-Safe-Storage-Password';
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const { encrypted } = encryptLikeChrome('test-value', password);
  const result = decryptCookieValue(encrypted, key);
  assert.equal(result, 'test-value');
});

test('decryptWindowsCookieValue: decrypts AES-GCM Chrome cookie payloads', () => {
  const masterKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const plaintext = Buffer.from('windows-cookie-secret', 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([Buffer.from('v10'), iv, ciphertext, authTag]);

  const result = decryptWindowsCookieValue(payload, masterKey, '.x.com');
  assert.equal(result, 'windows-cookie-secret');
});

test('decryptWindowsCookieValue: strips host hash prefix for newer Chrome DB versions', () => {
  const masterKey = randomBytes(32);
  const iv = randomBytes(12);
  const hostKey = '.x.com';
  const hostHash = createHash('sha256').update(hostKey).digest();
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const plaintext = Buffer.concat([hostHash, Buffer.from('prefixed-cookie', 'utf8')]);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([Buffer.from('v10'), iv, ciphertext, authTag]);

  const result = decryptWindowsCookieValue(payload, masterKey, hostKey, 24);
  assert.equal(result, 'prefixed-cookie');
});
