// SDK 单测：用 vm + 极简 DOM 桩跑真实 music-sdk.js，不联网。
// 覆盖：环境探测、参数序列化、JSONP 生命周期、缓存/去重/重试/超时/取消、便捷方法。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../src/sdk/music-sdk.js', import.meta.url), 'utf8');

interface FakeScript {
  tagName: string;
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  parentNode: FakeParent | null;
}

interface FakeParent {
  appendChild(child: FakeScript): void;
  removeChild(child: FakeScript): void;
}

interface Env {
  sandbox: Record<string, any>;
  scripts: FakeScript[];
  removed: FakeScript[];
  api: any;
}

interface EnvOptions {
  src?: string;
  attrs?: Record<string, string>;
  hostname?: string;
  withCurrentScript?: boolean;
  extraScripts?: Array<{ src: string }>;
}

function makeEnv(options: EnvOptions = {}): Env {
  const scripts: FakeScript[] = [];
  const removed: FakeScript[] = [];
  const attrs = options.attrs ?? {};
  const currentScript = {
    src: options.src ?? 'https://api.test/sdk.js',
    getAttribute(name: string): string | null {
      const key = name.replace(/^data-/, '');
      const value = attrs[key];
      return value === undefined ? null : value;
    },
    dataset: {} as Record<string, string>,
  };

  const parent: FakeParent = {
    appendChild(child: FakeScript): void {
      child.parentNode = parent;
      scripts.push(child);
    },
    removeChild(child: FakeScript): void {
      removed.push(child);
      const at = scripts.indexOf(child);
      if (at >= 0) scripts.splice(at, 1);
      child.parentNode = null;
    },
  };

  const sandbox: Record<string, any> = {
    console,
    setTimeout,
    clearTimeout,
    location: { hostname: options.hostname ?? 'example.com', origin: 'https://example.com' },
    document: {
      currentScript: options.withCurrentScript === false ? null : currentScript,
      head: parent,
      body: null,
      documentElement: parent,
      getElementsByTagName: () => options.extraScripts ?? (options.withCurrentScript === false ? [] : [currentScript]),
      createElement: (tagName: string): FakeScript => ({
        tagName,
        src: '',
        async: false,
        onload: null,
        onerror: null,
        parentNode: null,
      }),
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  vm.runInNewContext(SOURCE, sandbox, { filename: 'music-sdk.js' });
  return { sandbox, scripts, removed, api: sandbox.MusicApi };
}

function parseQuery(src: string): URLSearchParams {
  return new URL(src, 'https://api.test').searchParams;
}

function pending(env: Env): FakeScript {
  assert.equal(env.scripts.length, 1, 'expected exactly one script tag');
  return env.scripts[0];
}

function respond(env: Env, envelope: unknown): string {
  const script = env.scripts[env.scripts.length - 1];
  assert.ok(script !== undefined, 'expected a pending script tag');
  const name = parseQuery(script.src).get('callback');
  assert.ok(name !== null && name !== undefined, 'callback param missing');
  const fn = env.sandbox[name];
  assert.equal(typeof fn, 'function', 'callback should be installed on window');
  fn(envelope);
  script.onload?.();
  return name;
}

function ok<T>(data: T, source?: string): Record<string, unknown> {
  const envelope: Record<string, unknown> = { code: 0, message: 'ok', data, cost: 1 };
  if (source !== undefined) envelope.source = source;
  return envelope;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('exposes global client and auto-detects baseUrl / origin', () => {
  const env = makeEnv({ src: 'https://api.example.com/sdk.js', hostname: 'music.site.com' });
  assert.equal(typeof env.api.search, 'function');
  assert.equal(env.api.options.baseUrl, 'https://api.example.com');
  assert.equal(env.api.options.origin, 'music.site.com');
  assert.equal(env.api.options.source, 'netease');
  assert.equal(env.api.options.timeout, 15000);
  assert.equal(env.api.CODE.timeout, 9001);
  assert.deepEqual(Array.from(env.api.SOURCES), ['netease', 'tencent', 'kugou', 'baidu']);
});

test('script data-* attributes override defaults', () => {
  const env = makeEnv({
    attrs: {
      'base-url': 'https://api.other.com',
      origin: 'my-site',
      source: 'kugou',
      quality: 'high',
      timeout: '5000',
      retries: '2',
      cache: 'false',
      debug: 'true',
    },
  });
  assert.equal(env.api.options.baseUrl, 'https://api.other.com');
  assert.equal(env.api.options.origin, 'my-site');
  assert.equal(env.api.options.source, 'kugou');
  assert.equal(env.api.options.quality, 'high');
  assert.equal(env.api.options.timeout, 5000);
  assert.equal(env.api.options.retries, 2);
  assert.equal(env.api.options.cache, false);
  assert.equal(env.api.options.debug, true);
});

test('falls back to location.origin when the script tag is unknown', () => {
  const env = makeEnv({ withCurrentScript: false, hostname: 'fallback.test' });
  assert.equal(env.api.options.baseUrl, 'https://example.com');
  assert.equal(env.api.options.origin, 'fallback.test');
});

test('search serializes params and omits all/song defaults', async () => {
  const env = makeEnv();
  const promise = env.api.search({ q: '晴天' });
  const script = pending(env);
  const query = parseQuery(script.src);
  assert.equal(script.src.startsWith('https://api.test/v1/search?'), true);
  assert.equal(query.get('q'), '晴天');
  assert.equal(query.get('origin'), 'example.com');
  assert.equal(query.get('source'), null);
  assert.equal(query.get('type'), null);
  assert.equal(query.get('page'), null);
  assert.equal(query.get('size'), null);
  const callback = query.get('callback');
  assert.ok(callback !== null && /^__music_api_cb_\d+_[a-z0-9]+$/.test(callback));

  const envelope = ok({ page: 1, size: 20, total: 0, failed: [], list: [] });
  respond(env, envelope);
  assert.deepEqual(await promise, envelope);
  assert.equal(env.sandbox[callback as string], undefined, 'callback should be cleaned up');
  assert.equal(env.scripts.length, 0);
});

test('search accepts explicit source / page / size', async () => {
  const env = makeEnv();
  const promise = env.api.search({ q: 'hello world', source: 'tencent', page: 2, size: 5 });
  const query = parseQuery(pending(env).src);
  assert.equal(query.get('q'), 'hello world');
  assert.equal(query.get('source'), 'tencent');
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('size'), '5');
  respond(env, ok({ list: [] }));
  await promise;
});

test('client cache avoids a second script tag', async () => {
  const env = makeEnv();
  const first = env.api.status();
  const script = pending(env);
  const envelope = ok({ version: '0.2.0' });
  respond(env, envelope);
  assert.deepEqual(await first, envelope);

  const cachedEvents: boolean[] = [];
  const second = await env.api.status({ onResponse: (_res: unknown, info: { cached: boolean }) => cachedEvents.push(info.cached) });
  assert.deepEqual(second, envelope);
  assert.equal(env.scripts.length, 0, 'cache hit should not create a script');
  assert.deepEqual(cachedEvents, [true]);
  assert.equal(parseQuery(script.src).get('path'), null);
});

test('cache: false always hits the network', async () => {
  const env = makeEnv();
  const first = env.api.status();
  respond(env, ok({ version: '1' }));
  await first;

  const second = env.api.status({ cache: false });
  assert.equal(env.scripts.length, 1);
  respond(env, ok({ version: '2' }));
  assert.equal((await second).data.version, '2');
});

test('concurrent identical requests share one script tag', async () => {
  const env = makeEnv();
  const first = env.api.status();
  const second = env.api.status();
  assert.equal(env.scripts.length, 1);
  const envelope = ok({ version: 'shared' });
  respond(env, envelope);
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, envelope);
  assert.equal(a, b);
});

test('business errors reject with the upstream code', async () => {
  const env = makeEnv();
  const promise = env.api.songUrl({ source: 'netease', id: '2652820720' });
  const query = parseQuery(pending(env).src);
  assert.equal(query.get('source'), 'netease');
  assert.equal(query.get('id'), '2652820720');
  assert.equal(query.get('quality'), null);
  respond(env, { code: 3002, message: 'vip or paid only', data: null, source: 'netease', cost: 9 });

  await assert.rejects(promise, (err: any) => {
    assert.equal(err.name, 'MusicApiError');
    assert.equal(err.code, 3002);
    assert.equal(err.source, 'netease');
    assert.equal(env.api.isError(err), true);
    return true;
  });
});

test('throwOnError: false resolves the error envelope', async () => {
  const env = makeEnv();
  const promise = env.api.song({ source: 'netease', id: '1' }, { throwOnError: false });
  respond(env, { code: 3001, message: 'not found', data: null, cost: 4 });
  const envelope = await promise;
  assert.equal(envelope.code, 3001);
});

test('missing required params reject locally without a request', async () => {
  const env = makeEnv();
  await assert.rejects(env.api.search({}), (err: any) => {
    assert.equal(err.code, 9004);
    assert.equal(err.param, 'q');
    return true;
  });
  await assert.rejects(env.api.song({}), (err: any) => err.code === 9004);
  assert.equal(env.scripts.length, 0);
});

test('timeout rejects 9001 and removes the script', async () => {
  const env = makeEnv();
  const promise = env.api.status({ timeout: 20 });
  const script = pending(env);
  const callback = parseQuery(script.src).get('callback') as string;
  await assert.rejects(promise, (err: any) => err.code === 9001);
  assert.equal(env.scripts.length, 0);
  assert.equal(env.removed.length, 1);
  assert.equal(env.sandbox[callback], undefined);
});

test('network error rejects 9002 and retries when asked', async () => {
  const env = makeEnv();
  const promise = env.api.status({ timeout: 2000, retries: 1 });
  const first = pending(env);
  first.onerror?.();
  await sleep(400);
  assert.equal(env.scripts.length, 1, 'retry should create a second script');
  const envelope = ok({ version: 'retried' });
  respond(env, envelope);
  assert.deepEqual(await promise, envelope);
});

test('abort signal rejects 9003', async () => {
  const env = makeEnv();
  const controller = new AbortController();
  const promise = env.api.status({ signal: controller.signal, timeout: 5000 });
  pending(env);
  controller.abort();
  await assert.rejects(promise, (err: any) => err.code === 9003);
  assert.equal(env.scripts.length, 0);
});

test('songUrl accepts a Song object and an explicit quality', async () => {
  const env = makeEnv();
  const promise = env.api.songUrl({ source: 'tencent', id: '003abc', quality: 'high' });
  const query = parseQuery(pending(env).src);
  assert.equal(query.get('source'), 'tencent');
  assert.equal(query.get('id'), '003abc');
  assert.equal(query.get('quality'), 'high');
  respond(env, ok({ url: 'https://cdn.test/a.mp3' }, 'tencent'));
  assert.equal((await promise).data.url, 'https://cdn.test/a.mp3');

  const alias = env.api.url({ source: 'kugou', id: 'hash1' }, { quality: 'lossless' });
  const aliasQuery = parseQuery(pending(env).src);
  assert.equal(aliasQuery.get('quality'), 'lossless');
  respond(env, ok({ url: 'https://cdn.test/b.mp3' }));
  await alias;
});

test('playlist forwards paging and detail endpoints use the right paths', async () => {
  const env = makeEnv();
  const playlist = env.api.playlist({ source: 'netease', id: '3778678', page: 2, size: 50 });
  const playlistQuery = parseQuery(pending(env).src);
  assert.equal(playlistQuery.get('page'), '2');
  assert.equal(playlistQuery.get('size'), '50');
  respond(env, ok({ song: [] }));
  await playlist;

  const rank = env.api.rank({ source: 'kugou' });
  const rankQuery = parseQuery(pending(env).src);
  assert.equal(rankQuery.get('id'), null);
  respond(env, ok([]));
  await rank;

  const sources = env.api.sources();
  const sourceQuery = parseQuery(pending(env).src);
  assert.equal(sourceQuery.get('origin'), 'example.com');
  assert.ok(pending(env).src.includes('/v1/source?'));
  respond(env, ok({ capability: {}, disable: [] }));
  await sources;
});

test('create() merges defaults and configure() mutates the global client', async () => {
  const env = makeEnv();
  const client = env.api.create({ source: 'baidu', origin: 'app-ios', baseUrl: 'https://api.alt' });
  const promise = client.song({ id: 'song-1' });
  const script = pending(env);
  const query = parseQuery(script.src);
  assert.equal(script.src.startsWith('https://api.alt/v1/song?'), true);
  assert.equal(query.get('source'), 'baidu');
  assert.equal(query.get('origin'), 'app-ios');
  respond(env, ok({ id: 'song-1' }));
  await promise;

  env.api.configure({ source: 'kugou' });
  const after = env.api.song({ id: '2' });
  assert.equal(parseQuery(pending(env).src).get('source'), 'kugou');
  respond(env, ok({ id: '2' }));
  await after;
});

test('request hooks observe path, params and cache state', async () => {
  const env = makeEnv();
  const events: string[] = [];
  const options = {
    onRequest: (info: { path: string }) => events.push('req:' + info.path),
    onResponse: (_res: unknown, info: { cached: boolean }) => events.push('res:' + (info.cached ? 'hit' : 'miss')),
    onError: (err: { code: number }) => events.push('err:' + err.code),
  };
  const first = env.api.status(options);
  respond(env, ok({}));
  await first;
  await env.api.status(options);
  const failed = env.api.status({ ...options, timeout: 20, cache: false });
  await assert.rejects(failed);
  assert.deepEqual(events, ['req:/v1/status', 'res:miss', 'res:hit', 'req:/v1/status', 'err:9001']);
});

test('noCache appends a cache-busting timestamp', async () => {
  const env = makeEnv();
  const promise = env.api.status({ noCache: true });
  const query = parseQuery(pending(env).src);
  assert.ok((query.get('_') ?? '').length > 0);
  respond(env, ok({}));
  await promise;
});
