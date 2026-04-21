import crypto from 'node:crypto';
import http from 'node:http';
import { chmod } from 'node:fs/promises';
import { URL } from 'node:url';
import { pathExists, readJson, writeJson } from './fs.js';
import { ensureDataDir, twitterOauthTokenPath } from './paths.js';
import { loadXApiConfig } from './config.js';
import { restrictWindowsAcl } from './windows-acl.js';
import type { XOAuthTokenSet } from './types.js';

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

async function saveTwitterOAuthToken(token: XOAuthTokenSet): Promise<string> {
  ensureDataDir();
  const tokenPath = twitterOauthTokenPath();
  await writeJson(tokenPath, token);

  if (process.platform === 'win32') {
    try {
      restrictWindowsAcl(tokenPath, false);
    } catch (error) {
      process.stderr.write(
        `Warning: could not restrict ACL on OAuth token file: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }
  } else {
    await chmod(tokenPath, 0o600);
  }

  return tokenPath;
}

export async function loadTwitterOAuthToken(): Promise<XOAuthTokenSet | null> {
  const tokenPath = twitterOauthTokenPath();
  if (!(await pathExists(tokenPath))) return null;
  return readJson<XOAuthTokenSet>(tokenPath);
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
