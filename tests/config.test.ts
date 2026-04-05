import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChromeSessionConfig } from '../src/config.js';

test('loadChromeSessionConfig reads chrome user data dir and profile directory from env', () => {
  process.env.FTX_CHROME_USER_DATA_DIR = '/tmp/chrome-user-data';
  process.env.FTX_CHROME_PROFILE_DIRECTORY = 'Profile 1';
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeUserDataDir, '/tmp/chrome-user-data');
  assert.equal(config.chromeProfileDirectory, 'Profile 1');
  delete process.env.FTX_CHROME_USER_DATA_DIR;
  delete process.env.FTX_CHROME_PROFILE_DIRECTORY;
});

test('loadChromeSessionConfig defaults profile to Default', () => {
  process.env.FTX_CHROME_USER_DATA_DIR = '/tmp/chrome-user-data';
  delete process.env.FTX_CHROME_PROFILE_DIRECTORY;
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeProfileDirectory, 'Default');
  delete process.env.FTX_CHROME_USER_DATA_DIR;
});

test('loadChromeSessionConfig falls back to legacy FT_* env vars', () => {
  process.env.FT_CHROME_USER_DATA_DIR = '/tmp/legacy-user-data';
  process.env.FT_CHROME_PROFILE_DIRECTORY = 'Profile 2';
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeUserDataDir, '/tmp/legacy-user-data');
  assert.equal(config.chromeProfileDirectory, 'Profile 2');
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_CHROME_PROFILE_DIRECTORY;
});
