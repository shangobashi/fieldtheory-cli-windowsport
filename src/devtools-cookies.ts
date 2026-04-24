/**
 * DevTools Protocol cookie extraction for Chrome/Brave browsers.
 */
import * as http from 'node:http';

const DEVTOOLS_HOST = '127.0.0.1';
const ALLOWED_TARGET_TYPES = new Set(['page', 'background_page', 'webview', 'tab']);
const ALLOWED_BOOTSTRAP_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

interface CDPCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite: string;
}

interface CDPTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

interface DevToolsVersion {
  Browser: string;
  webSocketDebuggerUrl: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function assertLoopbackWebSocketUrl(raw: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`${label} must use ws:// or wss://`);
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${label} must be loopback-only`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain credentials`);
  }
  return parsed.toString();
}

function validateBootstrapUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Bootstrap URL is invalid: ${raw}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Bootstrap URL must use HTTPS');
  }
  if (!ALLOWED_BOOTSTRAP_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Bootstrap URL hostname not allowlisted: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Bootstrap URL must not include credentials');
  }

  return parsed.toString();
}

export function isAllowedBootstrapUrl(raw: string): boolean {
  try {
    validateBootstrapUrl(raw);
    return true;
  } catch {
    return false;
  }
}

function requestJson(pathname: string, method: 'GET' | 'PUT' = 'GET', port = 9222): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: DEVTOOLS_HOST,
        port,
        method,
        path: pathname,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += String(chunk);
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse DevTools JSON from ${pathname}`));
          }
        });
      }
    );

    req.on('error', () => reject(new Error('Cannot connect to browser DevTools Protocol on loopback')));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`DevTools request timeout for ${pathname}`));
    });
    req.end();
  });
}

export async function getDevToolsVersion(port = 9222): Promise<DevToolsVersion> {
  const parsed = await requestJson('/json/version', 'GET', port);
  if (!isObject(parsed)) {
    throw new Error('DevTools /json/version response was not a JSON object');
  }

  const browser = asString(parsed.Browser);
  const ws = asString(parsed.webSocketDebuggerUrl);
  if (!browser) {
    throw new Error('DevTools /json/version missing Browser');
  }
  if (!/\b(chrome|chromium|brave)\b/i.test(browser)) {
    throw new Error(`DevTools endpoint is not Chrome/Chromium/Brave: ${browser}`);
  }
  if (!ws) {
    throw new Error('DevTools /json/version missing webSocketDebuggerUrl');
  }

  return {
    Browser: browser,
    webSocketDebuggerUrl: assertLoopbackWebSocketUrl(ws, '/json/version webSocketDebuggerUrl'),
  };
}

export async function getTargets(port = 9222): Promise<CDPTarget[]> {
  const parsed = await requestJson('/json/list', 'GET', port);
  if (!Array.isArray(parsed)) {
    throw new Error('DevTools /json/list response was not an array');
  }

  const targets: CDPTarget[] = [];
  for (const item of parsed) {
    if (!isObject(item)) {
      throw new Error('DevTools /json/list contained non-object target entry');
    }

    const id = asString(item.id);
    const title = asString(item.title) ?? '';
    const url = asString(item.url);
    const type = asString(item.type);
    const webSocketDebuggerUrl = asString(item.webSocketDebuggerUrl);

    if (!id || !url || !type || !webSocketDebuggerUrl) {
      throw new Error('DevTools /json/list target missing required fields');
    }
    if (!ALLOWED_TARGET_TYPES.has(type)) {
      throw new Error(`DevTools target type not allowed: ${type}`);
    }

    targets.push({
      id,
      title,
      url,
      type,
      webSocketDebuggerUrl: assertLoopbackWebSocketUrl(webSocketDebuggerUrl, `/json/list target ${id} webSocketDebuggerUrl`),
    });
  }

  return targets;
}

export async function createTab(url: string, port = 9222): Promise<CDPTarget> {
  const validatedUrl = validateBootstrapUrl(url);
  const encodedUrl = encodeURIComponent(validatedUrl);
  const parsed = await requestJson(`/json/new?${encodedUrl}`, 'PUT', port);

  if (!isObject(parsed)) {
    throw new Error('Failed to parse new tab response as JSON object');
  }

  const target: CDPTarget = {
    id: asString(parsed.id) ?? '',
    title: asString(parsed.title) ?? '',
    url: asString(parsed.url) ?? '',
    type: asString(parsed.type) ?? '',
    webSocketDebuggerUrl: asString(parsed.webSocketDebuggerUrl) ?? '',
  };

  if (!target.id || !target.url || !target.type || !target.webSocketDebuggerUrl) {
    throw new Error('New tab response missing required fields');
  }
  if (!ALLOWED_TARGET_TYPES.has(target.type)) {
    throw new Error(`New tab target type not allowed: ${target.type}`);
  }

  target.webSocketDebuggerUrl = assertLoopbackWebSocketUrl(
    target.webSocketDebuggerUrl,
    '/json/new webSocketDebuggerUrl'
  );

  return target;
}

async function getCookiesFromTarget(webSocketUrl: string): Promise<CDPCookie[]> {
  const validatedWebSocketUrl = assertLoopbackWebSocketUrl(webSocketUrl, 'Target webSocketDebuggerUrl');
  const wsModule = await import('ws');
  const WebSocket = wsModule.default ?? wsModule.WebSocket;
  if (!WebSocket) {
    throw new Error('WebSocket implementation unavailable');
  }

  return new Promise((resolve, reject) => {
    const wsInstance = new WebSocket(validatedWebSocketUrl);
    let messageId = 1;
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const finish = (err?: Error, cookies?: CDPCookie[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      wsInstance.close();
      if (err) reject(err);
      else resolve(cookies ?? []);
    };

    wsInstance.on('open', () => {
      wsInstance.send(JSON.stringify({ id: messageId++, method: 'Network.getAllCookies' }));
    });

    wsInstance.on('message', (data: unknown) => {
      try {
        const text = typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : ArrayBuffer.isView(data)
              ? Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
              : String(data);

        const response: unknown = JSON.parse(text);
        if (!isObject(response)) return;
        const result = response.result;
        if (!isObject(result) || !Array.isArray(result.cookies)) return;
        finish(undefined, result.cookies as CDPCookie[]);
      } catch {
        finish(new Error('Failed to parse cookie response'));
      }
    });

    wsInstance.on('error', (err: Error) => {
      finish(new Error(`WebSocket error: ${err.message}`));
    });

    timeoutHandle = setTimeout(() => {
      finish(new Error('DevTools Protocol request timeout'));
    }, 10000);
  });
}

export async function extractCookiesViaDevTools(
  port: number = 9222
): Promise<{ csrfToken: string; cookieHeader: string; browser: string } | null> {
  try {
    const version = await getDevToolsVersion(port);
    const targets = await getTargets(port);

    let xTarget = targets.find((target) => isAllowedBootstrapUrl(target.url));
    if (!xTarget) {
      xTarget = await createTab('https://x.com/home', port);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const cookies = await getCookiesFromTarget(xTarget.webSocketDebuggerUrl);
    const ct0 = cookies.find((c) => c.name === 'ct0' && (c.domain.includes('x.com') || c.domain.includes('twitter.com')));
    const authToken = cookies.find((c) => c.name === 'auth_token' && (c.domain.includes('x.com') || c.domain.includes('twitter.com')));

    if (!ct0?.value) {
      return null;
    }

    const cookieParts = [`ct0=${ct0.value}`];
    if (authToken?.value) cookieParts.push(`auth_token=${authToken.value}`);

    return {
      csrfToken: ct0.value,
      cookieHeader: cookieParts.join('; '),
      browser: version.Browser,
    };
  } catch (error) {
    if (process.env.FTX_DEBUG) {
      console.error(
        `DevTools Protocol extraction failed closed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return null;
  }
}

export async function isDevToolsAvailable(port: number = 9222): Promise<boolean> {
  try {
    await getDevToolsVersion(port);
    await getTargets(port);
    return true;
  } catch {
    return false;
  }
}
