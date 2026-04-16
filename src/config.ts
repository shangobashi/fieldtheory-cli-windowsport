import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { dataDir } from './paths.js';

interface ChromeSessionConfig {
  chromeUserDataDir: string;
  chromeProfileDirectory?: string;
  browser: string;
}

function loadEnv(): void {
  const dir = dataDir();
  const candidatePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(dir, '.env.local'),
    path.join(dir, '.env'),
  ];

  for (const envPath of candidatePaths) {
    loadDotenv({ path: envPath, quiet: true });
  }
}

function detectBrowserDataDir(): { dir: string; browser: string } {
  const platform = os.platform();
  const home = os.homedir();

  const candidates: Array<{ dir: string; browser: string }> = platform === 'win32'
    ? [
        { dir: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'), browser: 'Chrome' },
        { dir: path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data'), browser: 'Brave' },
      ]
    : platform === 'darwin'
    ? [
        { dir: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'), browser: 'Chrome' },
        { dir: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'), browser: 'Brave' },
      ]
    : platform === 'linux'
    ? [
        { dir: path.join(home, '.config', 'google-chrome'), browser: 'Chrome' },
        { dir: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'), browser: 'Brave' },
      ]
    : [];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate.dir, 'Local State'))) {
      return candidate;
    }
  }

  return { dir: '', browser: '' };
}

export function loadChromeSessionConfig(): ChromeSessionConfig {
  loadEnv();

  // Check env var first
  const envDir = process.env.FTX_CHROME_USER_DATA_DIR;
  if (envDir) {
    return {
      chromeUserDataDir: envDir,
      chromeProfileDirectory: process.env.FTX_CHROME_PROFILE_DIRECTORY ?? 'Default',
      browser: 'Chrome',
    };
  }

  // Auto-detect Chrome or Brave
  const detected = detectBrowserDataDir();
  if (!detected.dir) {
    throw new Error(
      'Could not detect Chrome or Brave user-data directory.\n' +
      'Set FTX_CHROME_USER_DATA_DIR in .env or pass --chrome-user-data-dir.\n' +
      'Supported browsers: Google Chrome, Brave Browser.'
    );
  }

  return {
    chromeUserDataDir: detected.dir,
    chromeProfileDirectory: process.env.FTX_CHROME_PROFILE_DIRECTORY ?? 'Default',
    browser: detected.browser,
  };
}

export function loadXApiConfig() {
  loadEnv();

  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const bearerToken = process.env.X_BEARER_TOKEN;
  const callbackUrl = process.env.X_CALLBACK_URL ?? 'http://127.0.0.1:3000/callback';

  if (!apiKey || !apiSecret || !clientId || !clientSecret) {
    throw new Error(
      'Missing X API credentials for API sync.\n' +
      'Set X_API_KEY, X_API_SECRET, X_CLIENT_ID, and X_CLIENT_SECRET in .env.\n' +
      'These are only needed for --api mode. Default sync uses your Chrome session.'
    );
  }

  return { apiKey, apiSecret, clientId, clientSecret, bearerToken, callbackUrl };
}
