import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.ts';
import { createApp } from '../src/server.ts';

interface Running {
  base: string;
  close: () => Promise<void>;
}

async function start(overrides: Record<string, string> = {}): Promise<Running> {
  const config = loadConfig({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'error', ...overrides });
  const server = createApp(config);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    base: 'http://127.0.0.1:' + port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('status returns envelope without cors headers', async () => {
  const app = await start();
  try {
    const res = await fetch(app.base + '/v1/status');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.equal(res.headers.get('access-control-allow-headers'), null);
    const body: any = await res.json();
    assert.equal(body.code, 0);
    assert.equal(body.message, 'ok');
    assert.equal(typeof body.data.version, 'string');
    assert.ok(body.data.notice.length > 0);
  } finally {
    await app.close();
  }
});

test('jsonp mode returns script with 200 and no cors', async () => {
  const app = await start();
  try {
    const res = await fetch(app.base + '/v1/status?callback=cb');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.equal(res.headers.get('content-type'), 'application/javascript; charset=utf-8');
    const text = await res.text();
    assert.ok(text.startsWith("/**/typeof cb === 'function' && cb("));
  } finally {
    await app.close();
  }
});

test('plural path is 404 and post is 405', async () => {
  const app = await start();
  try {
    const notFound = await fetch(app.base + '/v1/songs');
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json() as any).code, 3001);
    const method = await fetch(app.base + '/v1/status', { method: 'POST' });
    assert.equal(method.status, 405);
    assert.equal((await method.json() as any).code, 1004);
  } finally {
    await app.close();
  }
});

test('trailing slash is normalized and cache hit costs zero', async () => {
  const app = await start();
  try {
    const first = await fetch(app.base + '/v1/status/');
    assert.equal(first.status, 200);
    const second = await fetch(app.base + '/v1/status');
    const body: any = await second.json();
    assert.equal(body.cost, 0);
  } finally {
    await app.close();
  }
});

test('home page and openapi are served raw without cors', async () => {
  const app = await start();
  try {
    const home = await fetch(app.base + '/');
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('access-control-allow-origin'), null);
    assert.ok((home.headers.get('content-type') ?? '').startsWith('text/html'));
    const html = await home.text();
    assert.ok(html.includes('music-api'));
    assert.ok(html.includes('/v1/playlist'));

    const spec = await fetch(app.base + '/openapi.json');
    assert.equal(spec.status, 200);
    assert.ok((spec.headers.get('content-type') ?? '').startsWith('application/json'));
    const doc: any = await spec.json();
    assert.equal(doc.openapi, '3.0.3');
    assert.ok(doc.paths['/v1/playlist'] !== undefined);
    assert.ok(doc.components.schemas.PlaylistDetail !== undefined);
  } finally {
    await app.close();
  }
});

test('rate limit returns 429 with code 4001', async () => {
  const app = await start({ RATE_LIMIT: '1', RATE_BURST: '0' });
  try {
    const first = await fetch(app.base + '/v1/status');
    assert.equal(first.status, 200);
    const second = await fetch(app.base + '/v1/status');
    assert.equal(second.status, 429);
    assert.equal((await second.json() as any).code, 4001);
  } finally {
    await app.close();
  }
});
