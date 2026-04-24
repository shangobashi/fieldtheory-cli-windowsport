import crypto from 'node:crypto';

import http from 'node:http';

import { chmod, readFile } from 'node:fs/promises';

import { URL } from 'node:url';

import { pathExists, writeJson } from './fs.js';

import { ensureDataDir, twitterOauthTokenPath } from './paths.js';

import { loadXApiConfig } from './config.js';

import { restrictWindowsAcl } from './windows-acl.js';

import { protectWindowsSecret, unprotectWindowsSecret } from './windows-dpapi.js';

import type { XOAuthTokenSet } from './types.js';

interface WindowsDpapiEnvelope {

  format: 'dpapi-v1';

  ciphertext_b64: string;

}

interface SecretCryptoHooks {

  protect: (plaintext: string) => Promise<string>;

  unprotect: (ciphertextB64: string) => Promise<string>;

}

const DEFAULT_SECRET_CRYPTO_HOOKS: SecretCryptoHooks = {
  protect: async (plaintext: string) => {
    const encrypted = await protectWindowsSecret(Buffer.from(plaintext, 'utf8'));
    return encrypted.toString('base64');
  },
  unprotect: async (ciphertextB64: string) => {
    const decrypted = await unprotectWindowsSecret(Buffer.from(ciphertextB64, 'base64'));
    return decrypted.toString('utf8');
  },
};

function base64Url(input: Buffer): string {

  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

}

function createPkce() {

  const verifier = base64Url(crypto.randomBytes(32));

  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());

  const state = base64Url(crypto.randomBytes(16));

  return { verifier, challenge, state };

}

function buildTwitterOAuthUrl(): { url: string; state: string; verifier: string } {

  const cfg = loadXApiConfig();

  if (!cfg.callbackUrl) {

    throw new Error('Missing X_CALLBACK_URL in .env.local');

  }

  const { verifier, challenge, state } = createPkce();

  const url = new URL('https://twitter.com/i/oauth2/authorize');

  url.searchParams.set('response_type', 'code');

  url.searchParams.set('client_id', cfg.clientId);

  url.searchParams.set('redirect_uri', cfg.callbackUrl);

  url.searchParams.set('scope', 'tweet.read users.read bookmark.read offline.access');

  url.searchParams.set('state', state);

  url.searchParams.set('code_challenge', challenge);

  url.searchParams.set('code_challenge_method', 'S256');

  return { url: url.toString(), state, verifier };

}

function isObject(value: unknown): value is Record<string, unknown> {

  return typeof value === 'object' && value !== null;

}

function asString(value: unknown): string | undefined {

  return typeof value === 'string' ? value : undefined;

}

function isDpapiEnvelope(value: unknown): value is WindowsDpapiEnvelope {

  return isObject(value) && value.format === 'dpapi-v1' && typeof value.ciphertext_b64 === 'string' && value.ciphertext_b64.length > 0;

}

function parseTokenSet(value: unknown): XOAuthTokenSet {

  if (!isObject(value)) {

    throw new Error('OAuth token file is not a JSON object');

  }

  const accessToken = asString(value.access_token);

  const obtainedAt = asString(value.obtained_at);

  if (!accessToken || !obtainedAt) {

    throw new Error('OAuth token file is missing required access_token or obtained_at fields');

  }

  return {

    access_token: accessToken,

    refresh_token: asString(value.refresh_token),

    expires_in: typeof value.expires_in === 'number' && Number.isFinite(value.expires_in)

      ? value.expires_in

      : typeof value.expires_in === 'string' && value.expires_in.trim() !== '' && Number.isFinite(Number(value.expires_in))

        ? Number(value.expires_in)

        : undefined,

    scope: asString(value.scope),

    token_type: asString(value.token_type),

    obtained_at: obtainedAt,

  };

}

async function exchangeCodeForToken(code: string, verifier: string): Promise<XOAuthTokenSet> {

  const cfg = loadXApiConfig();

  if (!cfg.callbackUrl) {

    throw new Error('Missing X_CALLBACK_URL in .env.local');

  }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

  const body = new URLSearchParams({

    grant_type: 'authorization_code',

    code,

    redirect_uri: cfg.callbackUrl,

    code_verifier: verifier,

    client_id: cfg.clientId,

  });

  const response = await fetch('https://api.x.com/2/oauth2/token', {

    method: 'POST',

    headers: {

      Authorization: `Basic ${basic}`,

      'Content-Type': 'application/x-www-form-urlencoded',

    },

    body,

  });

  const text = await response.text();

  const parsed: unknown = JSON.parse(text);

  if (!response.ok) {

    throw new Error(`Token exchange failed (HTTP ${response.status}). Check your X API credentials.`);

  }

  if (!isObject(parsed)) {

    throw new Error('Token exchange response was not a JSON object.');

  }

  const accessToken = asString(parsed.access_token);

  if (!accessToken) {

    throw new Error('Token exchange response missing access_token.');

  }

  const tokenType = asString(parsed.token_type);

  const refreshToken = asString(parsed.refresh_token);

  const scope = asString(parsed.scope);

  const expiresInRaw = parsed.expires_in;

  const expiresIn = typeof expiresInRaw === 'number'

    ? expiresInRaw

    : typeof expiresInRaw === 'string' && expiresInRaw.trim() !== ''

      ? Number(expiresInRaw)

      : undefined;

  return {

    access_token: accessToken,

    refresh_token: refreshToken,

    expires_in: Number.isFinite(expiresIn) ? expiresIn : undefined,

    scope,

    token_type: tokenType,

    obtained_at: new Date().toISOString(),

  };

}

async function writeTokenStorage(

  tokenPath: string,

  payload: XOAuthTokenSet | WindowsDpapiEnvelope,

  platform: NodeJS.Platform

): Promise<void> {

  await writeJson(tokenPath, payload);

  if (platform === 'win32') {

    try {

      restrictWindowsAcl(tokenPath, false);

    } catch (error) {

      process.stderr.write(

        `Warning: could not restrict ACL on OAuth token file: ${error instanceof Error ? error.message : String(error)}\n`

      );

    }

  } else {

    await chmod(tokenPath, 0o600);

  }

}

export async function saveTwitterOAuthTokenForPath(

  token: XOAuthTokenSet,

  options: {

    tokenPath: string;

    platform?: NodeJS.Platform;

    cryptoHooks?: SecretCryptoHooks;

  }

): Promise<string> {

  const platform = options.platform ?? process.platform;

  const hooks = options.cryptoHooks ?? DEFAULT_SECRET_CRYPTO_HOOKS;

  const tokenPath = options.tokenPath;

  if (platform === 'win32') {

    const serialized = JSON.stringify(token);

    const ciphertext = await hooks.protect(serialized);

    if (!ciphertext) {

      throw new Error('Failed to encrypt OAuth token with DPAPI (empty ciphertext)');

    }

    await writeTokenStorage(tokenPath, { format: 'dpapi-v1', ciphertext_b64: ciphertext }, platform);

    return tokenPath;

  }

  await writeTokenStorage(tokenPath, token, platform);

  return tokenPath;

}

async function saveTwitterOAuthToken(token: XOAuthTokenSet): Promise<string> {

  ensureDataDir();

  return saveTwitterOAuthTokenForPath(token, { tokenPath: twitterOauthTokenPath() });

}

export async function loadTwitterOAuthTokenFromPath(

  options: {

    tokenPath: string;

    platform?: NodeJS.Platform;

    cryptoHooks?: SecretCryptoHooks;

  }

): Promise<XOAuthTokenSet | null> {

  const tokenPath = options.tokenPath;

  const platform = options.platform ?? process.platform;

  const hooks = options.cryptoHooks ?? DEFAULT_SECRET_CRYPTO_HOOKS;

  if (!(await pathExists(tokenPath))) return null;

  const rawText = await readFile(tokenPath, 'utf8');

  const parsed: unknown = JSON.parse(rawText);

  if (isDpapiEnvelope(parsed)) {

    if (platform !== 'win32') {

      throw new Error('OAuth token file is DPAPI-encrypted and can only be decrypted on Windows for the same user');

    }

    const plaintext = await hooks.unprotect(parsed.ciphertext_b64);

    const token = parseTokenSet(JSON.parse(plaintext));

    return token;

  }

  const legacyToken = parseTokenSet(parsed);

  if (platform === 'win32') {

    await saveTwitterOAuthTokenForPath(legacyToken, { tokenPath, platform, cryptoHooks: hooks });

  }

  return legacyToken;

}

export async function loadTwitterOAuthToken(): Promise<XOAuthTokenSet | null> {

  return loadTwitterOAuthTokenFromPath({ tokenPath: twitterOauthTokenPath() });

}

export async function runTwitterOAuthFlow(): Promise<{ tokenPath: string; scope?: string }> {

  const cfg = loadXApiConfig();

  if (!cfg.callbackUrl) {

    throw new Error('Missing X_CALLBACK_URL in .env.local');

  }

  const { url, state, verifier } = buildTwitterOAuthUrl();

  const callback = new URL(cfg.callbackUrl);

  const port = Number(callback.port || 80);

  const pathname = callback.pathname;

  const code = await new Promise<string>((resolve, reject) => {

    let settled = false;

    let timeoutHandle: ReturnType<typeof setTimeout>;

    let server: http.Server;

    const finish = (err?: Error, value?: string) => {

      if (settled) return;

      settled = true;

      clearTimeout(timeoutHandle);

      server.close(() => {

        if (err) reject(err);

        else resolve(value!);

      });

    };

    server = http.createServer((req, res) => {

      try {

        const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

        if (reqUrl.pathname !== pathname) {

          res.statusCode = 404;

          res.end('Not found');

          return;

        }

        const returnedState = reqUrl.searchParams.get('state');

        const returnedCode = reqUrl.searchParams.get('code');

        const error = reqUrl.searchParams.get('error');

        if (error) {

          res.statusCode = 400;

          res.end(`OAuth error: ${error}`);

          finish(new Error(`OAuth error: ${error}`));

          return;

        }

        if (!returnedCode || returnedState !== state) {

          res.statusCode = 400;

          res.end('Invalid OAuth callback');

          finish(new Error('Invalid OAuth callback state/code'));

          return;

        }

        res.statusCode = 200;

        res.end('ftx auth complete. You can close this tab.');

        finish(undefined, returnedCode);

      } catch (err) {

        finish(err instanceof Error ? err : new Error(String(err)));

      }

    });

    server.once('error', (err) => {

      finish(err instanceof Error ? err : new Error(String(err)));

    });

    timeoutHandle = setTimeout(() => {

      finish(new Error('OAuth flow timed out after 5 minutes. Please try again.'));

    }, 5 * 60 * 1000);

    server.listen(port, '127.0.0.1', () => {

      console.log('Open this URL in your browser to authorize X bookmarks access:');

      console.log(url);

    });

  });

  const token = await exchangeCodeForToken(code, verifier);

  const tokenPath = await saveTwitterOAuthToken(token);

  return { tokenPath, scope: token.scope };

}

