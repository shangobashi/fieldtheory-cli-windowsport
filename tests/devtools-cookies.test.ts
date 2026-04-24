import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDevToolsVersion, getTargets, createTab, isAllowedBootstrapUrl } from '../src/devtools-cookies.js';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function withServer(handler: Handler, run: (port: number) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');

  try {
    await run(addr.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('getDevToolsVersion rejects non-browser endpoint', async () => {
  await withServer((req, res) => {
    if (req.url === '/json/version') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ Browser: 'curl/8.8.0', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  }, async (port) => {
    await assert.rejects(() => getDevToolsVersion(port), /not Chrome\/Chromium\/Brave/i);
  });
});

test('getDevToolsVersion rejects non-loopback websocket URL', async () => {
  await withServer((req, res) => {
    if (req.url === '/json/version') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ Browser: 'Chrome/124.0', webSocketDebuggerUrl: 'ws://10.0.0.8:9222/devtools/browser/abc' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  }, async (port) => {
    await assert.rejects(() => getDevToolsVersion(port), /loopback-only/i);
  });
});

test('getDevToolsVersion rejects malformed JSON response', async () => {
  await withServer((req, res) => {
    if (req.url === '/json/version') {
      res.setHeader('content-type', 'application/json');
      res.end('{not-json');
      return;
    }
    res.statusCode = 404;
    res.end();
  }, async (port) => {
    await assert.rejects(() => getDevToolsVersion(port), /Failed to parse DevTools JSON/);
  });
});

test('getTargets rejects malformed entries and non-loopback sockets', async () => {
  await withServer((req, res) => {
    if (req.url === '/json/list') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify([
          { id: 'a', title: 'ok', url: 'https://x.com/home', type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/a' },
          { id: 'b', title: 'bad', url: 'https://x.com/home', type: 'page', webSocketDebuggerUrl: 'ws://evil.example/devtools/page/b' },
        ])
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  }, async (port) => {
    await assert.rejects(() => getTargets(port), /loopback-only/i);
  });
});

test('createTab URL-encodes bootstrap URL for /json/new', async () => {
  let requestedPath = '';

  await withServer((req, res) => {
    requestedPath = req.url ?? '';
    if (req.url?.startsWith('/json/new?')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        id: 'new-target',
        title: 'x',
        url: 'https://x.com/home?ref=abc',
        type: 'page',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/new-target',
      }));
      return;
    }
    res.statusCode = 404;
    res.end();
  }, async (port) => {
    const target = await createTab('https://x.com/home?foo=bar baz&x=1', port);
    assert.equal(target.id, 'new-target');
    assert.equal(
      requestedPath,
      `/json/new?${encodeURIComponent('https://x.com/home?foo=bar%20baz&x=1')}`
    );
  });
});

test('bootstrap URL allowlist accepts x.com/twitter.com and rejects others', () => {
  assert.equal(isAllowedBootstrapUrl('https://x.com/home'), true);
  assert.equal(isAllowedBootstrapUrl('https://twitter.com/home'), true);
  assert.equal(isAllowedBootstrapUrl('http://x.com/home'), false);
  assert.equal(isAllowedBootstrapUrl('https://example.com/home'), false);
  assert.equal(isAllowedBootstrapUrl('https://x.com.evil.tld/home'), false);
});
