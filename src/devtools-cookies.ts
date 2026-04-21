/**
 * DevTools Protocol cookie extraction for Chrome/Brave browsers.
 * 
 * This module provides an alternative to direct cookie database decryption
 * by using Chrome's DevTools Protocol to extract cookies while the browser
 * is running. This works with newer Chrome versions (v20 encryption) that
 * cannot be decrypted using standard DPAPI + AES-GCM methods.
 */

import * as http from 'node:http';

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Get list of browser targets from DevTools Protocol
 */
async function getTargets(port: number = 9222): Promise<CDPTarget[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += String(chunk); });
      res.on('end', () => {
        try {
          const parsed: unknown = JSON.parse(data);
          if (!Array.isArray(parsed)) {
            reject(new Error('DevTools response was not an array'));
            return;
          }

          const targets = parsed
            .filter(isObject)
            .map((item) => ({
              id: asString(item.id),
              title: asString(item.title),
              url: asString(item.url),
              type: asString(item.type),
              webSocketDebuggerUrl: asString(item.webSocketDebuggerUrl),
            }))
            .filter((item): item is CDPTarget => Boolean(item.id && item.title && item.url && item.type && item.webSocketDebuggerUrl));

          resolve(targets);
        } catch {
          reject(new Error('Failed to parse DevTools response'));
        }
      });
    });
    req.on('error', () => reject(new Error('Cannot connect to browser DevTools Protocol')));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('DevTools Protocol connection timeout'));
    });
  });
}

/**
 * Create a new tab and navigate to URL
 */
async function createTab(url: string, port: number = 9222): Promise<CDPTarget> {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:${port}/json/new?${url}`, { method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += String(chunk); });
      res.on('end', () => {
        try {
          const parsed: unknown = JSON.parse(data);
          if (!isObject(parsed)) {
            reject(new Error('Failed to parse new tab response'));
            return;
          }

          const target: CDPTarget = {
            id: asString(parsed.id) ?? '',
            title: asString(parsed.title) ?? '',
            url: asString(parsed.url) ?? '',
            type: asString(parsed.type) ?? '',
            webSocketDebuggerUrl: asString(parsed.webSocketDebuggerUrl) ?? '',
          };

          if (!target.id || !target.webSocketDebuggerUrl) {
            reject(new Error('New tab response missing required fields'));
            return;
          }

          resolve(target);
        } catch {
          reject(new Error('Failed to parse new tab response'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Get cookies from a browser target using DevTools Protocol
 */
async function getCookiesFromTarget(webSocketUrl: string): Promise<CDPCookie[]> {
  const wsModule = await import('ws');
  const WebSocket = wsModule.default ?? wsModule.WebSocket;
  if (!WebSocket) {
    throw new Error('WebSocket implementation unavailable');
  }

  return new Promise((resolve, reject) => {
    const wsInstance = new WebSocket(webSocketUrl);
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
      wsInstance.send(JSON.stringify({
        id: messageId++,
        method: 'Network.getAllCookies',
      }));
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

/**
 * Extract X/Twitter cookies using DevTools Protocol.
 * 
 * Requires browser to be running with remote debugging enabled:
 * brave.exe --remote-debugging-port=9222 --remote-allow-origins=*
 * 
 * @returns Object with csrfToken and cookieHeader, or null if extraction fails
 */
export async function extractCookiesViaDevTools(
  port: number = 9222
): Promise<{ csrfToken: string; cookieHeader: string; browser: string } | null> {
  try {
    // Get browser targets
    const targets = await getTargets(port);
    
    // Find or create an x.com tab
    let xTarget = targets.find(t => t.url?.includes('x.com'));
    
    if (!xTarget) {
      // Create a new tab on x.com
      xTarget = await createTab('https://x.com', port);
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Get cookies from the target
    const cookies = await getCookiesFromTarget(xTarget.webSocketDebuggerUrl);
    
    // Find ct0 and auth_token
    const ct0 = cookies.find(c => c.name === 'ct0' && c.domain.includes('x.com'));
    const authToken = cookies.find(c => c.name === 'auth_token' && c.domain.includes('x.com'));

    if (!ct0?.value) {
      return null;
    }

    const cookieParts = [`ct0=${ct0.value}`];
    if (authToken?.value) {
      cookieParts.push(`auth_token=${authToken.value}`);
    }

    return {
      csrfToken: ct0.value,
      cookieHeader: cookieParts.join('; '),
      browser: 'Chrome/Brave via DevTools Protocol',
    };
  } catch (error) {
    // DevTools Protocol extraction failed - return null and let caller fallback to DB or OAuth
    if (process.env.FTX_DEBUG) {
      console.error('DevTools Protocol extraction failed:', error);
    }
    return null;
  }
}

export async function isDevToolsAvailable(port: number = 9222): Promise<boolean> {
  try {
    const targets = await getTargets(port);
    return targets.length > 0;
  } catch {
    return false;
  }
}
