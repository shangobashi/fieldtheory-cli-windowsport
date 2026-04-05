import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { createDecipheriv, createHash, pbkdf2Sync, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { platform, tmpdir } from 'node:os';
import { openDb } from './db.js';

export interface ChromeCookieResult {
  csrfToken: string;
  cookieHeader: string;
}

interface RawCookie {
  name: string;
  hostKey: string;
  encryptedValueHex: string;
  value: string;
}

function getMacOSChromeKey(): Buffer {
  const candidates = [
    { service: 'Chrome Safe Storage', account: 'Chrome' },
    { service: 'Chrome Safe Storage', account: 'Google Chrome' },
    { service: 'Google Chrome Safe Storage', account: 'Chrome' },
    { service: 'Google Chrome Safe Storage', account: 'Google Chrome' },
    { service: 'Chromium Safe Storage', account: 'Chromium' },
    { service: 'Brave Safe Storage', account: 'Brave' },
    { service: 'Brave Browser Safe Storage', account: 'Brave Browser' },
  ];

  for (const candidate of candidates) {
    try {
      const password = execFileSync(
        'security',
        ['find-generic-password', '-w', '-s', candidate.service, '-a', candidate.account],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (password) {
        return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
      }
    } catch {
      // Try the next known browser/keychain naming pair.
    }
  }

  throw new Error(
    'Could not read a browser Safe Storage password from the macOS Keychain.\n' +
    'This is needed to decrypt Chrome-family cookies.\n' +
    'Fix: open the browser profile that is logged into X, then retry.\n' +
    'If you already use the API flow, prefer: ftx sync --api'
  );
}

function sanitizeCookieValue(name: string, value: string): string {
  const cleaned = value.replace(/\0+$/g, '').trim();
  if (!cleaned) {
    throw new Error(
      `Cookie ${name} was empty after decryption.\n\n` +
      'This usually happens when Chrome is open or the wrong profile is selected.\n\n' +
      'Try:\n' +
      '  1. Close Chrome completely and run ftx sync again\n' +
      '  2. If that does not work, try a different profile:\n' +
      '     ftx sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or use the API method instead:\n' +
      '     ftx auth && ftx sync --api'
    );
  }
  if (!/^[\x21-\x7E]+$/.test(cleaned)) {
    throw new Error(
      `Could not decrypt the ${name} cookie.\n\n` +
      'This usually happens when Chrome is open or the wrong profile is selected.\n\n' +
      'Try:\n' +
      '  1. Close Chrome completely and run ftx sync again\n' +
      '  2. Try a different profile:\n' +
      '     ftx sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or use the API method instead:\n' +
      '     ftx auth && ftx sync --api'
    );
  }
  return cleaned;
}

export function decryptCookieValue(encryptedValue: Buffer, key: Buffer, dbVersion = 0): string {
  if (encryptedValue.length === 0) return '';

  if (encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x30) {
    const iv = Buffer.alloc(16, 0x20);
    const ciphertext = encryptedValue.subarray(3);
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    if (dbVersion >= 24 && decrypted.length > 32) {
      decrypted = decrypted.subarray(32);
    }

    return decrypted.toString('utf8');
  }

  return encryptedValue.toString('utf8');
}

export function decryptWindowsCookieValue(
  encryptedValue: Buffer,
  masterKey: Buffer,
  hostKey: string,
  dbVersion = 0,
): string {
  if (encryptedValue.length === 0) return '';

  const versionTag = encryptedValue.subarray(0, 3).toString('utf8');
  if (versionTag === 'v10' || versionTag === 'v11') {
    const iv = encryptedValue.subarray(3, 15);
    const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16);
    const authTag = encryptedValue.subarray(encryptedValue.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    if (dbVersion >= 24 && decrypted.length > 32) {
      const expectedHostHash = createHash('sha256').update(hostKey).digest();
      if (decrypted.subarray(0, 32).equals(expectedHostHash)) {
        decrypted = decrypted.subarray(32);
      }
    }

    return decrypted.toString('utf8');
  }

  return unprotectWindowsData(encryptedValue).toString('utf8');
}

function runPowerShell(script: string): string {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    }
  ).trim();
}

function unprotectWindowsData(data: Buffer): Buffer {
  const base64 = data.toString('base64');
  const script =
    `Add-Type -AssemblyName System.Security; ` +
    `$bytes = [Convert]::FromBase64String('${base64}'); ` +
    `$plain = [System.Security.Cryptography.ProtectedData]::Unprotect(` +
    `$bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
    `[Convert]::ToBase64String($plain)`;
  const output = runPowerShell(script);
  if (!output) {
    throw new Error('Windows DPAPI returned an empty response while decrypting Chrome cookies.');
  }
  return Buffer.from(output, 'base64');
}

function getWindowsChromeMasterKey(chromeUserDataDir: string): Buffer {
  const localStatePath = join(chromeUserDataDir, 'Local State');
  if (!existsSync(localStatePath)) {
    throw new Error(
      `Chrome Local State not found at: ${localStatePath}\n` +
      'Fix: Make sure Google Chrome is installed and has been opened at least once.'
    );
  }

  const localState = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
    os_crypt?: { encrypted_key?: string };
  };
  const encodedKey = localState.os_crypt?.encrypted_key;
  if (!encodedKey) {
    throw new Error('Chrome Local State does not contain os_crypt.encrypted_key.');
  }

  const encryptedKey = Buffer.from(encodedKey, 'base64');
  const dpapiPrefix = Buffer.from('DPAPI');
  const keyPayload = encryptedKey.subarray(0, 5).equals(dpapiPrefix)
    ? encryptedKey.subarray(5)
    : encryptedKey;
  return unprotectWindowsData(keyPayload);
}

async function queryCookies(
  dbPath: string,
  domain: string,
  names: string[],
): Promise<{ cookies: RawCookie[]; dbVersion: number }> {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Chrome Cookies database not found at: ${dbPath}\n` +
      'Fix: Make sure Google Chrome is installed and has been opened at least once.\n' +
      'If you use a non-default Chrome profile, pass --chrome-profile-directory <name>.'
    );
  }

  const tempDbPath = join(tmpdir(), `ftx-cookies-${randomUUID()}.db`);
  let queryPath = dbPath;

  try {
    copyFileSync(dbPath, tempDbPath);
    queryPath = tempDbPath;
  } catch {
    queryPath = dbPath;
  }

  const safeDomain = domain.replace(/'/g, "''");
  const nameList = names.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ');
  const sql = `
    SELECT
      name,
      host_key,
      hex(encrypted_value) AS encrypted_value_hex,
      value
    FROM cookies
    WHERE host_key LIKE '%${safeDomain}' AND name IN (${nameList})
  `;

  const db = await openDb(queryPath);

  try {
    const cookieRows = db.exec(sql);
    const metaRows = db.exec("SELECT value FROM meta WHERE key = 'version' LIMIT 1");
    const dbVersion = Number(metaRows[0]?.values?.[0]?.[0] ?? 0);
    const cookies = (cookieRows[0]?.values ?? []).map((row) => ({
      name: String(row[0] ?? ''),
      hostKey: String(row[1] ?? ''),
      encryptedValueHex: String(row[2] ?? ''),
      value: String(row[3] ?? ''),
    }));
    return { cookies, dbVersion };
  } catch (error) {
    throw new Error(
      `Could not read Chrome Cookies database.\n` +
      `Path: ${dbPath}\n` +
      `Error: ${(error as Error).message}\n` +
      'Fix: If Chrome is open, close it and retry. The database may be locked.'
    );
  } finally {
    db.close();
    if (queryPath === tempDbPath) {
      try {
        unlinkSync(tempDbPath);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

export async function extractChromeXCookies(
  chromeUserDataDir: string,
  profileDirectory = 'Default'
): Promise<ChromeCookieResult> {
  const os = platform();
  if (os !== 'darwin' && os !== 'win32') {
    throw new Error(
      `Direct cookie extraction is supported on macOS and Windows.\n` +
      `Detected platform: ${os}\n` +
      'Fix: Pass --csrf-token and --cookie-header directly, or use the OAuth API flow.'
    );
  }

  const dbPath = join(chromeUserDataDir, profileDirectory, 'Cookies');
  const key = os === 'darwin' ? getMacOSChromeKey() : getWindowsChromeMasterKey(chromeUserDataDir);

  let result = await queryCookies(dbPath, '.x.com', ['ct0', 'auth_token']);
  if (result.cookies.length === 0) {
    result = await queryCookies(dbPath, '.twitter.com', ['ct0', 'auth_token']);
  }

  const decrypted = new Map<string, string>();
  for (const cookie of result.cookies) {
    const hexValue = cookie.encryptedValueHex;
    if (hexValue && hexValue.length > 0) {
      const buffer = Buffer.from(hexValue, 'hex');
      const value = os === 'darwin'
        ? decryptCookieValue(buffer, key, result.dbVersion)
        : decryptWindowsCookieValue(buffer, key, cookie.hostKey, result.dbVersion);
      decrypted.set(cookie.name, value);
    } else if (cookie.value) {
      decrypted.set(cookie.name, cookie.value);
    }
  }

  const ct0 = decrypted.get('ct0');
  const authToken = decrypted.get('auth_token');

  if (!ct0) {
    throw new Error(
      'No ct0 CSRF cookie found for x.com in Chrome.\n' +
      'This means you are not logged into X in the selected Chrome profile.\n\n' +
      'Fix:\n' +
      '  1. Open Google Chrome\n' +
      '  2. Go to https://x.com and log in\n' +
      '  3. Close Chrome completely\n' +
      '  4. Re-run this command\n\n' +
      (profileDirectory !== 'Default'
        ? `Using Chrome profile: "${profileDirectory}"\n`
        : 'Using the Default Chrome profile. If your X login is in a different profile,\n' +
          'pass --chrome-profile-directory <name> (for example "Profile 1").\n')
    );
  }

  const cookieParts = [`ct0=${sanitizeCookieValue('ct0', ct0)}`];
  if (authToken) cookieParts.push(`auth_token=${sanitizeCookieValue('auth_token', authToken)}`);

  return {
    csrfToken: sanitizeCookieValue('ct0', ct0),
    cookieHeader: cookieParts.join('; '),
  };
}
