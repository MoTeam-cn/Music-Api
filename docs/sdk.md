# 浏览器 SDK（`/sdk.js`）

> 适用版本：music-api **0.2.0+**。类型声明：`GET /sdk.d.ts`。

本服务**不设任何 CORS 头**，浏览器跨域只能走 JSONP。手写 JSONP 要自己拼回调名、清理全局函数、处理超时和错误，容易漏。SDK 把这些收进一个 `<script>` 里，站点只传业务参数：

```html
<script src="https://your-music-api.example.com/sdk.js"></script>
<script>
  MusicApi.search({ q: '晴天', source: 'netease', size: 5 })
    .then(function (res) { console.log(res.data.list); })
    .catch(function (err) { console.error(err.code, err.message); });
</script>
```

SDK 负责：回调命名与清理、`origin` 注入、超时、重试、客户端缓存、并发去重、必填参数校验、错误对象、播放地址 + `Audio` 便捷方法。**它不改变服务端契约**：仍然是只读 GET、`envelope` 响应、JSONP 传输。

---

## 1. 引入

### 1.1 基本引入

```html
<!-- 同源部署 -->
<script src="/sdk.js"></script>

<!-- 跨域部署：直接写接口域名，SDK 会从脚本地址推导 baseUrl -->
<script src="https://api.example.com/sdk.js"></script>
```

- 脚本地址**自动推导** `baseUrl`：`https://api.example.com/sdk.js` → `https://api.example.com`；放在子路径（如 `/static/sdk.js`）时会推导成 `https://api.example.com/static`，此时应显式传 `data-base-url`。
- `origin` 默认取当前站点 `location.hostname`（无域名时用 `web`），用于服务端区分调用来源；也可用 `data-origin` 覆盖。
- 只支持**经典脚本**（`<script src>`），不支持 `type="module"` 的 ESM 导入（ESM 跨域需要 CORS，与本服务策略冲突）。

### 1.2 用 `data-*` 属性配置默认值

属性都是可选的，等价于加载后调用 `MusicApi.configure(...)`：

```html
<script src="https://api.example.com/sdk.js"
        data-base-url="https://api.example.com"
        data-origin="my-site"
        data-source="netease"
        data-quality="high"
        data-timeout="15000"
        data-retries="1"
        data-cache="true"
        data-debug="false"></script>
```

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `data-base-url` / `data-base` | string | 从脚本地址推导 | 接口根地址，末尾斜杠会被去掉 |
| `data-origin` | string | `location.hostname` | 服务端必填的调用来源，1~64 字符 |
| `data-source` | `netease`/`tencent`/`kugou`/`baidu` | `netease` | 非搜索接口的默认音源 |
| `data-quality` | `standard`/`high`/`lossless` | 服务端默认 `standard` | `/v1/song/url` 默认音质 |
| `data-timeout` | number(ms) | `15000` | 单次请求超时 |
| `data-retries` | number | `0` | 超时/网络错误重试次数 |
| `data-cache` | `true`/`false` | `true` | 是否启用客户端缓存 |
| `data-debug` | `true`/`false` | `false` | 保留位（当前不输出日志） |

> 属性只对**首次加载**生效；之后用 `MusicApi.configure()` 改。

---

## 2. 全局对象

引入后得到全局 `MusicApi`（同时挂在 `window.MusicApi`）。它本身是一个已初始化的客户端，同时提供工厂与工具：

| 成员 | 说明 |
|---|---|
| `MusicApi.version` | SDK 版本号，如 `0.2.0` |
| `MusicApi.options` / `defaults` | 当前生效配置（只读用途） |
| `MusicApi.configure(patch)` | 合并配置，返回自身；影响之后的所有请求 |
| `MusicApi.create(options)` | 基于当前配置新建独立客户端（独立缓存） |
| `MusicApi.clearCache()` | 清空客户端缓存 |
| `MusicApi.isError(err)` | 判断是否为 SDK 错误对象 |
| `MusicApi.CODE` | SDK 侧错误码常量 |
| `MusicApi.SOURCES` / `MusicApi.QUALITIES` | 枚举值 |
| `MusicApi.noConflict()` | 删除全局 `MusicApi` 并返回引用（避免命名冲突） |

```js
// 多实例：不同站点来源 / 不同音源 / 不同超时
var kugou = MusicApi.create({ source: 'kugou', origin: 'kugou-page' });
var tencent = MusicApi.create({ source: 'tencent', origin: 'qq-page', timeout: 8000 });
```

---

## 3. 客户端配置参数

`create(options)` / `configure(options)` / 每次调用的第二参都接受同一组参数（单次调用参数优先级最高）：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `baseUrl` | string | 脚本地址推导 | 接口根地址 |
| `origin` | string | `location.hostname` 或 `web` | 服务端必填的调用来源 |
| `source` | Source | `netease` | 非搜索接口的默认音源 |
| `quality` | Quality | 不传（服务端 `standard`） | 取地址默认音质 |
| `timeout` | number | `15000` | 单次请求超时（ms） |
| `retries` | number | `0` | 超时/网络错误重试次数，间隔 250ms×次数 |
| `cache` | boolean | `true` | 客户端缓存（按接口 TTL，与服务端一致） |
| `cacheSize` | number | `200` | 缓存条数上限（LRU） |
| `cacheTtl` | number \| object | 内置 TTL | 自定义缓存时长，可写 `{ '/v1/search': 10000 }` |
| `throwOnError` | boolean | `true` | 业务错误是否 reject；`false` 时照常 resolve envelope |
| `noCache` | boolean | `false` | URL 追加时间戳绕过服务端缓存（会产生缓存碎片，慎用） |
| `signal` | AbortSignal | — | 取消请求 |
| `onRequest` | function | — | 请求发出前回调：`({ path, params, url })` |
| `onResponse` | function | — | 响应后回调：`(envelope, { path, params, cached })` |
| `onError` | function | — | 失败回调：`(err)` |

内置客户端缓存 TTL（与服务端一致）：搜索/取地址 60s、歌词 1h、`/v1/source`、`/v1/status` 5s、其余 5min。命中缓存不发请求，`onResponse` 的 `cached` 为 `true`。

---

## 4. 方法

所有方法返回 `Promise<Envelope<T>>`；`code !== 0` 时 reject 一个 `MusicApiError`（`throwOnError: false` 时改为 resolve）。

```ts
interface Envelope<T> {
  code: number;      // 0 成功
  message: string;
  data: T;           // 失败为 null
  source?: Source;
  cost: number;      // 上游耗时 ms，缓存命中为 0
}
```

| 方法 | 参数 | 对应接口 |
|---|---|---|
| `search(params \| q)` | `q`（必填）、`source`（默认 `all`）、`type`（默认 `song`）、`page`、`size` | `/v1/search` |
| `song({ source?, id })` | `id` 必填 | `/v1/song` |
| `songUrl({ source?, id, quality? })` | `id` 必填；别名 `url()` | `/v1/song/url` |
| `lyric({ source?, id })` | `id` 必填 | `/v1/lyric` |
| `album({ source?, id })` | `id` 必填 | `/v1/album` |
| `artist({ source?, id })` | `id` 必填 | `/v1/artist` |
| `playlist({ source?, id, page?, size? })` | `id` 必填，支持分页 | `/v1/playlist` |
| `rank({ source?, id? })` | 不带 `id` 返回榜单列表 | `/v1/rank` |
| `sources()` | —，别名 `source()` | `/v1/source` |
| `status()` | — | `/v1/status` |
| `play(song, options?)` | 取直链并播放，见 `5.3 | `/v1/song/url` + `Audio` |
| `request(path, params?, options?)` | 通用底层调用，返回 envelope | 任意 |

- `source` 省略时用客户端默认（`netease`）；`search` 省略时按服务端语义走 `source=all` 聚合四源。
- `songUrl` / `play` 可以直接传 `Song` 对象（列表里的条目自带 `source`、`id`）。
- 必填参数在**本地**校验，缺失直接 reject `9004`，不浪费一次请求。

---

## 5. 常用场景

### 5.1 搜索

```js
// 聚合四源（默认）
const all = await MusicApi.search('晴天');
console.log(all.data.list, all.data.failed); // failed: 本次失败的源

// 单源 + 分页
const page = await MusicApi.search({ q: '晴天', source: 'netease', page: 1, size: 10 });
page.data.list.forEach(function (song) {
  console.log(song.source, song.id, song.name, song.available, song.vip);
});
```

### 5.2 歌单：先过滤，再取地址

```js
const res = await MusicApi.playlist({ source: 'netease', id: '3778678', page: 1, size: 50 });
const playable = res.data.song.filter(function (s) { return s.available && !s.vip; });
console.log(res.data.total, res.data.hasMore, playable.length);
```

> `available: false` 不要再去取地址；VIP/付费取地址一定返回 `3002`，服务端不做换源兜底。

### 5.3 播放（`play`）

```js
// 直接传 Song 对象：自动取 source/id → 取直链 → 创建 Audio 并播放
const audio = await MusicApi.play(res.data.song[0], { volume: 0.8 });

// 复用已有 Audio（例如页面底部播放器）
await MusicApi.play(song, { audio: myAudio, autoplay: false });
myAudio.play();
```

`play` 的额外参数：`audio`（复用元素）、`autoplay`（默认 `true`）、`volume`（0~1）。浏览器自动播放策略可能拦截 `play()`，SDK 已吞掉该异常，需要用户手势时请传 `autoplay: false` 自己触发。

### 5.4 歌词

```js
const { data } = await MusicApi.lyric({ source: 'tencent', id: '003abc' });
console.log(data.lyric, data.translation);
```

### 5.5 榜单

```js
const list = await MusicApi.rank({ source: 'netease' });      // 榜单列表
const detail = await MusicApi.rank({ source: 'netease', id: '3778678' }); // 榜单详情
```

### 5.6 能力矩阵

```js
const { data } = await MusicApi.sources();
if (!data.capability.baidu.artist) console.log('百度不支持歌手详情');
```

### 5.7 错误处理

```js
try {
  await MusicApi.songUrl({ source: 'netease', id: '2652820720' });
} catch (err) {
  if (!MusicApi.isError(err)) throw err;
  if (err.code === 3002) {
    // VIP/付费：只展示元数据
  } else if (err.code === 4001) {
    // 被限流，稍后重试
  } else {
    console.error(err.code, err.message, err.path, err.params);
  }
}
```

### 5.8 取消与超时

```js
const controller = new AbortController();
const task = MusicApi.search({ q: '晴天' }, { signal: controller.signal, timeout: 5000 });
controller.abort(); // reject { code: 9003 }
```

### 5.9 调试钩子

```js
MusicApi.configure({
  onRequest: function (info) { console.log('→', info.path, info.params); },
  onResponse: function (env, info) { console.log('←', info.path, env.code, info.cached ? 'cache' : 'net'); },
  onError: function (err) { console.warn('✗', err.code, err.message); }
});
```

### 5.10 TypeScript

```ts
/// <reference path="./sdk.d.ts" />

const res = await MusicApi.search({ q: '晴天', source: 'all' });
res.data.list.forEach((song) => console.log(song.name, song.available));
```

把 `GET /sdk.d.ts` 下载到项目里（或写进 `tsconfig.json` 的 `files`/`include`）即可获得完整类型：`Song`、`PlaylistDetail`、`Envelope<T>`、`MusicApiClient` 等。

---

## 6. 错误码

服务端业务码原样透传（与 REST 文档一致），SDK 另加 9xxx 本地错误：

| code | 来源 | 含义 |
|---|---|---|
| `0` | 服务端 | 成功 |
| `1001` | 服务端 | 参数缺失/非法 |
| `1002` | 服务端 | 不支持的 source |
| `1003` | 服务端 | 该源不支持此能力 |
| `1004` | 服务端 | 方法不允许 |
| `2001` | 服务端 | 上游超时 |
| `2002` | 服务端 | 上游错误 |
| `2003` | 服务端 | 上游解析失败 |
| `3001` | 服务端 | 资源不存在 |
| `3002` | 服务端 | 仅 VIP / 付费 / 无版权 |
| `4001` | 服务端 | 限流（默认 60 次/分钟/IP） |
| `4002` | 服务端 | UA 被拦截 |
| `5000` | 服务端 | 内部错误 |
| `9001` | SDK | 请求超时（`timeout`） |
| `9002` | SDK | 脚本加载失败 / 空响应 / 非法 envelope |
| `9003` | SDK | 被 `AbortSignal` 取消 |
| `9004` | SDK | 本地参数校验失败（`err.param` 指出字段） |
| `9005` | SDK | 运行环境不支持（无 `document` / 无 `Audio`） |

错误对象结构：

```ts
interface MusicApiError extends Error {
  name: 'MusicApiError';
  musicApi: true;
  code: number;
  path?: string;
  param?: string;
  source?: Source;
  params?: Record<string, unknown>;
  envelope?: Envelope<unknown>; // 服务端原始响应
}
```

---

## 7. 行为细节

| 项 | 说明 |
|---|---|
| 传输 | JSONP：`<script src="...?callback=__music_api_cb_N_xxx&origin=...">`，回调名每次唯一，完成后从 `window` 删除并移除 `<script>` |
| 编码 | 参数 `encodeURIComponent`，按 key 排序（与服务端缓存键一致），`undefined`/`null`/空串自动丢弃，布尔转 `1`/`0` |
| 去重 | 相同 `path + params` 的并发请求只发一次，其余共享同一个 Promise |
| 缓存 | 只缓存 `code === 0` 的 envelope；命中不建 `<script>`；`clearCache()` 可清空 |
| 重试 | 仅对 `9001` / `9002` 重试，`retries` 次，间隔 250ms×次数；业务错误不重试 |
| `origin` | 每次请求自动带 `origin`；不参与客户端缓存键 |
| `noCache` | 追加 `_=<timestamp>`，仅用于强制穿透服务端缓存，日常不要用 |
| 兼容性 | 需要 `Promise`、`document`、`addEventListener`；现代浏览器（Chrome/Edge/Firefox/Safari 近年版本）均可 |
| 安全 | 只读 GET，不持有账号、不读 Cookie、不返回凭据；JSONP 只执行本服务返回的只读 envelope |

---

## 8. 与手写 JSONP 的对比

```js
// 手写：拼参数、造回调、清理、超时、错误分支都要自己来
function jsonp(url, cb) { /* ... */ }

// SDK：一行
const { data } = await MusicApi.search({ q: '晴天' });
```

SDK 不做的事（刻意保持与服务端一致）：

- 不做跨源换源兜底（VIP/付费一律 `3002`）；
- 不缓存音频、不代理播放、不持久化直链；
- 不提供 UI，播放只返回 `Audio` 元素，样式与交互由站点自己决定。

---

## 9. 部署与版本

- 静态资源路径固定为 `GET /sdk.js`（`Content-Type: text/javascript`）、`GET /sdk.d.ts`（`text/plain`）。
- 两者都带 `ETag` / `Last-Modified` / `304`，CDN 可缓存：`public, max-age=300, s-maxage=3600`。
- SDK 版本随服务端 `VERSION` 注入，`MusicApi.version` 可读取；升级服务端即生效，站点无需改代码。
- 源码：`src/sdk/music-sdk.js`；类型：`src/sdk/music-sdk.d.ts`；单测：`test/sdk.test.ts`（vm + DOM 桩，不联网）。

---

## 10. 自测

```bash
node --test --test-isolation=none test/sdk.test.ts
# 或全量
npm test
```
