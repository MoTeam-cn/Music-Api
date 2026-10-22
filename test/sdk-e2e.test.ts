// 端到端：真实 HTTP 服务 + 真实 music-sdk.js。
// 桩只模拟浏览器「插入 <script> 并执行返回脚本」这一件事，JSONP 链路、envelope、
// origin 校验、错误码全部走真实服务端。只用 /v1/status 与参数错误路由，不联网。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { loadConfig } from '../src/config.ts';
import { createApp } from '../src/server.ts';

const SOURCE = readFileSync(new URL('../src/sdk/music-sdk.js', import.meta.url), 'utf8');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 sdk-e2e';

interface Running {
  base: string;
  close: () => Promise<void>;
}

async function startServer(): Promise<Running> {
  const config = loadConfig({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'error' });
  const server = createApp(config);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    base: 'http://127.0.0.1:' + port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface Browser {
  sandbox: Record<string, any>;
  api: any;
  requests: string[];
}

function browser(baseUrl: string): Browser {
  const requests: string[] = [];
  const sandbox: Record<string, any> = {
    console,
    setTimeout,
    clearTimeout,
    location: { hostname: 'example.com', origin: 'https://example.com' },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  const parent = {
    appendChild(child: any): void {
      requests.push(child.src);
      setTimeout(() => {
        fetch(child.src, { headers: { 'user-agent': UA } })
          .then((res) => res.text())
          .then((text) => {
            vm.runInContext(text, sandbox, { filename: 'jsonp.js' });
            if (typeof child.onload === 'function') child.onload();
          })
          .catch((err: unknown) => {
            if (typeof child.onerror === 'function') child.onerror(err);
          });
      }, 0);
    },
    removeChild(): void {
      // 浏览器移除 <script> 不会影响已执行的回调
    },
  };

  sandbox.document = {
    currentScript: { src: baseUrl + '/sdk.js', getAttribute: () => null, dataset: {} },
    head: parent,
    body: null,
    documentElement: parent,
    getElementsByTagName: () => [],
    createElement: () => ({ src: '', async: false, onload: null, onerror: null, parentNode: null }),
  };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'music-sdk.js' });
  return { sandbox, api: sandbox.MusicApi, requests };
}

test('sdk drives the real server through jsonp end-to-end', async () => {
  const app = await startServer();
  try {
    const { api, requests } = browser(app.base);
    assert.equal(api.options.baseUrl, app.base);
    assert.equal(api.options.origin, 'example.com');

    const res = await api.status();
    assert.equal(res.code, 0);
    assert.equal(res.data.version, '0.2.0');
    assert.equal(res.data.notice.length > 0, true);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].startsWith(app.base + '/v1/status?'));
    assert.ok(requests[0].includes('callback='));
    assert.ok(requests[0].includes('origin=example.com'));

    // 客户端缓存：第二次不再发请求
    const cached = await api.status();
    assert.equal(cached.code, 0);
    assert.equal(requests.length, 1);

    // 真实业务错误经 JSONP 透传
    await assert.rejects(api.song({ source: 'bad', id: '1' }), (err: any) => {
      assert.equal(err.code, 1002);
      assert.equal(err.source, undefined);
      return true;
    });
    const soft = await api.song({ source: 'bad', id: '1' }, { throwOnError: false });
    assert.equal(soft.code, 1002);
  } finally {
    await app.close();
  }
});

test('sdk surfaces server-side param errors without network upstream', async () => {
  const app = await startServer();
  try {
    const { api } = browser(app.base);
    await assert.rejects(api.request('/v1/playlist', { source: 'netease', id: '1', page: 0 }), (err: any) => err.code === 1001);
  } finally {
    await app.close();
  }
});
