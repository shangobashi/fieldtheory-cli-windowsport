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

/**
 * Get list of browser targets from DevTools Protocol
 */
async function getTargets(port: number = 9222): Promise<CDPTarget[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
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
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
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
  // Use import for ws in ES module context
  const ws: any = await import('ws');
  const WebSocket = ws.default || ws.WebSocket || ws;

  return new Promise((resolve, reject) => {
    const wsInstance = new WebSocket(webSocketUrl);
    let messageId = 1;

    wsInstance.on('open', () => {
      wsInstance.send(JSON.stringify({
        id: messageId++,
        method: 'Network.getAllCookies'
      }));
    });

    wsInstance.on('message', (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.result?.cookies) {
          wsInstance.close();
          resolve(response.result.cookies);
        }
      } catch (e) {
        reject(new Error('Failed to parse cookie response'));
      }
    });

    wsInstance.on('error', (err: Error) => {
      reject(new Error(`WebSocket error: ${err.message}`));
    });

    setTimeout(() => {
      wsInstance.close();
      reject(new Error('DevTools Protocol request timeout'));
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
      browser: 'DevTools Protocol'
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if DevTools Protocol is available
 */
export async function isDevToolsAvailable(port: number = 9222): Promise<boolean> {
  try {
    await getTargets(port);
    return true;
  } catch {
    return false;
  }
}
