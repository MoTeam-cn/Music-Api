# 音乐聚合接口 · 设计稿 v1

> 状态：**设计稿（未实现）** ｜ 2026-10-19 ｜ 目标目录 `Common/music-api`
> 读者：后续实现者 + 二次开发者。确认后按第 13 节里程碑进入编码。

---

## 1. 定位

一个**只读**的音乐元数据聚合网关：把网易云、QQ 音乐、酷狗、百度四家音乐平台的**网页公开接口**，收敛成同一套 `/v1` JSON 接口。

- **只提供接口**，不含任何前端播放器 UI；二次开发者自己接页面、自己决定交互。
- 跨域取数走 **JSONP**（不设 CORS），前端一个 `<script>` 就能用。
- 只做「搜索 / 详情 / 歌词 / 歌单 / 榜单 / 公开可播地址」，**不做登录、不做会员、不碰版权内容**。
- 零运行时依赖：Node 24 原生跑 `.ts`，无构建步骤、无 `node_modules`、无数据库。

一句话数据流：

```
GET /v1/song/url?source=netease&id=xxx
        │
        ├─ router → 参数校验 → 限流 → 缓存
        ├─ provider/netease.url(id) → 上游公开接口 → 归一化 → 可用性过滤
        └─ JSON { code, message, data, source, cost }
```

---

## 2. 红线（明确不做什么）

| # | 不做 | 原因 |
|---|---|---|
| 1 | 登录态透传 | 不接受 Cookie / Token / 手机号参数，服务自身不持有任何账号 |
| 2 | VIP / 付费曲目播放地址 | 只返回公开可播内容；VIP 曲目一律 `available:false`，取地址返回 `3002` |
| 3 | 音频下载与落盘 | 不缓存音频文件，不提供下载接口 |
| 4 | 音频流代理 | 默认关闭（`ENABLE_STREAM_PROXY=0`），只返回上游有时效的直链；开启也仅做 302/透传，不落盘 |
| 5 | CORS | 不输出任何 `Access-Control-Allow-*` 头；跨域需求用 JSONP 解决（见 6.3） |
| 6 | 复数路由 | 只有 `/v1/song`，没有 `/v1/songs` |
| 7 | 第三方依赖 | 运行时只用 Node 内置模块 |
| 8 | 数据库 | 进程内 LRU 缓存，重启即失效 |
| 9 | 破解 / 逆向私有协议 | 不实现 weapi/eapi 加密链路，不做签名绕过 |

---

## 3. 技术基线

| 项 | 选择 | 说明 |
|---|---|---|
| 运行时 | Node ≥ 24.14（本机 v24.14.1） | 原生类型擦除，`node src/main.ts` 直接运行 |
| 语言 | TypeScript（仅类型） | 只写可擦除语法：禁 `enum` / `namespace` / 参数属性；`import type` 显式导入类型 |
| 类型检查 | `tsc --noEmit` | 本机借用 `Common/claude-gateway/node_modules/typescript`（5.9.3）；CI 里 `npm i -D typescript` |
| HTTP 服务 | `node:http` | 自写路由，无 express/koa |
| 上游请求 | `node:https` + keep-alive Agent | 无 axios；`node:zlib` 解压、`node:crypto` 做哈希 |
| 测试 | `node:test` + 本地 stub 上游 | 单测不联网 |
| 进程模型 | 单进程、无状态 | 水平扩展靠多实例，缓存不共享 |

运行形态（三种都可）：

```
node src/main.ts                        # 直接跑
node --watch src/main.ts                # 开发热重载
tsc -p tsconfig.json --noEmit           # 只做类型检查
```

---

## 4. 目录结构

```
music-api/
├── package.json            # 无 dependencies；scripts: start / check / test / probe
├── tsconfig.json           # noEmit + erasableSyntaxOnly + verbatimModuleSyntax
├── README.md               # 快速开始、接口表、二次开发说明
├── DISCLAIMER.md           # 免责声明全文（中英）
├── 设计稿.md               # 本文件
├── src/
│   ├── main.ts             # 入口：读配置 → 建 server → 优雅退出
│   ├── config.ts           # 环境变量解析 + 常量（超时/缓存/限流）
│   ├── server.ts           # http server、请求生命周期、全局错误兜底
│   ├── router.ts           # 极简路由：/v1 前缀、单数资源、405/404
│   ├── http/
│   │   ├── request.ts      # 查询参数解析与校验（page/size/source/id）
│   │   ├── respond.ts      # 统一 envelope、错误码 → HTTP 状态
│   │   ├── upstream.ts     # 上游请求：超时/重试/JSONP 剥离/域名白名单
│   │   ├── cache.ts        # TTL + LRU
│   │   ├── limit.ts        # 令牌桶（按 IP）+ 每源并发闸门
│   │   └── log.ts          # 单行 JSON 日志（IP 脱敏）
│   ├── core/
│   │   ├── model.ts        # Source / Song / SongUrl / Lyric / Album / Artist / Playlist / Rank
│   │   ├── error.ts        # 错误码表 + AppError
│   │   ├── filter.ts       # 可用性过滤兜底（VIP/付费/空地址）
│   │   └── normalize.ts    # 时长、封面尺寸、HTML 实体、字符串清洗
│   ├── provider/
│   │   ├── types.ts        # Provider 接口 + 能力矩阵类型
│   │   ├── index.ts        # 注册表：source → provider，能力查询
│   │   ├── netease.ts      # 网易云
│   │   ├── tencent.ts      # QQ 音乐
│   │   ├── kugou.ts        # 酷狗
│   │   └── baidu.ts        # 百度（experimental）
│   └── route/
│       ├── search.ts       # GET /v1/search
│       ├── song.ts         # GET /v1/song、/v1/song/url
│       ├── lyric.ts        # GET /v1/lyric
│       ├── album.ts        # GET /v1/album
│       ├── artist.ts       # GET /v1/artist
│       ├── playlist.ts     # GET /v1/playlist
│       ├── rank.ts         # GET /v1/rank
│       ├── source.ts       # GET /v1/source（能力矩阵 + 健康）
│       └── status.ts       # GET /v1/status（版本/运行态/免责摘要）
├── test/
│   ├── router.test.ts
│   ├── respond.test.ts
│   ├── filter.test.ts
│   ├── cache.test.ts
│   ├── limit.test.ts
│   ├── provider.test.ts    # 四源 fixture → 统一模型
│   └── stub.ts             # 本地假上游
├── tools/
│   └── probe.ts            # 打真网探测四源能力（开发用，不进服务）
└── docs/
    └── endpoint.md         # 实测后的端点状态表（可用/需头/失效）
```

模块边界一句话：`route/*` 只做参数与装配，`provider/*` 只做上游映射，`core/*` 不碰网络，`http/*` 不认业务。

---

## 5. 路由表

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/v1/search` | `q`（必填）、`source`（默认 `all`）、`type`（默认 `song`）、`page`、`size` | 聚合搜索；`type` = `song`/`album`/`artist`/`playlist` |
| GET | `/v1/song` | `source`、`id` | 单曲详情（含可用性、音质档位） |
| GET | `/v1/song/url` | `source`、`id`、`quality`（默认 `standard`） | 公开可播直链；不可播返回 `3002` |
| GET | `/v1/lyric` | `source`、`id` | LRC 原文 + 翻译（有则返回） |
| GET | `/v1/album` | `source`、`id` | 专辑详情 + 曲目列表 |
| GET | `/v1/artist` | `source`、`id` | 歌手信息 + 热门曲目（源支持时） |
| GET | `/v1/playlist` | `source`、`id` | 歌单详情 + 曲目列表 |
| GET | `/v1/rank` | `source`、`id`（可省） | 榜单列表 / 榜单详情 |
| GET | `/v1/source` | — | 四源能力矩阵、健康状态、禁用列表 |
| GET | `/v1/status` | — | 版本、uptime、缓存命中率、免责声明摘要 |

路由规则：

- **全部 GET**、幂等、无副作用（不写文件、不建会话）。
- **资源名单数**、小写；只有 `/v1` 一个前缀，不做 `/api`、`/v2`。
- 末尾斜杠等价（`/v1/song/` 归一为 `/v1/song`）。
- 未知路径 `404`、方法不符 `405`，都返回 JSON envelope。
- `source=all` **仅** `/v1/search` 支持；其余接口必须指定单一 source，避免隐式扇出。
- 不支持分页的接口不接收 `page`/`size`（多余参数忽略而非报错）。
- 全部路由支持可选 `callback` / `cb` 参数，带则返回 JSONP（见 6.3）；JSONP 只能 GET，所以「全 GET」是刻意约束。

---

## 6. 响应契约

统一 envelope，**内容全部包在 JSON 对象里**：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "source": "netease",
  "cost": 137
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | number | 业务码，0 为成功 |
| `message` | string | 人类可读，成功为 `ok` |
| `data` | object \| null | 业务数据；失败为 `null` |
| `source` | string? | 实际命中的源；`source=all` 时省略，由条目自带 `source` |
| `cost` | number | 上游耗时（毫秒），缓存命中为 0 |

- `Content-Type: application/json; charset=utf-8`
- **不输出 CORS 头**；跨域取数走 **JSONP**（`?callback=`，见 6.3）
- 不返回 `null` 顶层；HTTP 状态按错误码映射（见下）

### 6.1 错误码

| code | HTTP | 含义 | 触发场景 |
|---|---|---|---|
| 0 | 200 | ok | — |
| 1001 | 400 | 参数缺失/非法 | 缺 `q`、`page` 非数字、`size` 超限 |
| 1002 | 400 | 不支持的 source | `source=xxx` |
| 1003 | 400 | 该源不支持此能力 | 例如对某源请求 `/v1/rank` |
| 2001 | 504 | 上游超时 | 6s 未响应 |
| 2002 | 502 | 上游错误 | 非 2xx、熔断中 |
| 2003 | 502 | 上游解析失败 | JSON 结构变化 |
| 3001 | 404 | 资源不存在 | 无效 id |
| 3002 | 403 | 仅 VIP / 付费 / 无版权 | 拿不到公开可播地址 |
| 4001 | 429 | 限流 | 超 `RATE_LIMIT` |
| 5000 | 500 | 内部错误 | 未捕获异常 |

### 6.2 示例

搜索成功：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "page": 1,
    "size": 20,
    "total": 132,
    "failed": [],
    "list": [
      {
        "source": "netease",
        "id": "1901371647",
        "name": "晴天",
        "artist": ["周杰伦"],
        "album": "叶惠美",
        "duration": 269,
        "cover": "https://p1.music.126.net/xxx.jpg",
        "available": true,
        "vip": false
      }
    ]
  },
  "cost": 212
}
```

VIP 曲目取地址：

```json
{ "code": 3002, "message": "vip or paid only", "data": null, "source": "netease", "cost": 96 }
```

---

### 6.3 JSONP（跨域方案）

**为什么用 JSONP**：跨域 `fetch`/`XHR` 读取 JSON 响应需要 CORS 头，而本服务明确不设 CORS；`<script src>` 不受同源策略限制，因此跨域取数走 JSONP——把同一个 envelope 包进回调函数，浏览器当脚本执行。

**请求**：任意路由追加 `callback`（别名 `cb`）：

```
GET /v1/search?q=晴天&source=netease&callback=onSearch
GET /v1/song/url?source=tencent&id=xxx&callback=window.Music.onUrl
```

**响应**：

```
Content-Type: application/javascript; charset=utf-8
Cache-Control: no-store

/**/typeof onSearch === 'function' && onSearch({ "code": 0, "message": "ok", "data": { ... }, "source": "netease", "cost": 137 });
```

规则：

| 项 | 规则 |
|---|---|
| 回调名校验 | `^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*){0,3}$`，长度 ≤ 64；不合法 → 400 `1001`（回普通 JSON） |
| HTTP 状态 | JSONP 一律 **200**（`<script>` 不看状态码），错误只体现在 `code` |
| 前缀 | 固定 `/**/`，避免响应被当作对象字面量或 Flash 载体利用 |
| 防注入 | 回调名只允许上述字符集，**绝不原样回显**未校验输入 |
| 缓存 | 服务端缓存的是 `data`，JSONP 壳在出口现包；响应头 `no-store`，避免 VIP 可用性过期 |
| CORS | 仍然不发任何 `Access-Control-Allow-*`；JSONP 也不需要预检 |
| 默认 | 不带 `callback` → 普通 JSON，HTTP 状态按 6.1 映射 |
| 失败兜底 | 限流 / 内部错误在 JSONP 模式下同样返回 200 + `4001`/`5000`，前端能收到 |

前端示例：

```html
<script>
  function onSearch(res) {
    if (res.code !== 0) return console.error(res.message);
    console.log(res.data.list);
  }
</script>
<script src="http://127.0.0.1:8802/v1/search?q=晴天&source=netease&callback=onSearch"></script>
```

jQuery：`$.ajax({ url: '.../v1/search', dataType: 'jsonp', data: { q: '晴天' } })`（默认回调参数名就是 `callback`，可直接用）。

安全边界：JSONP 等于把响应交给任意页面执行，所以**只返回只读数据、不返回任何凭据**；这也正是本服务不持有账号、不接受 Cookie 的前提。

---

## 7. 领域模型（`core/model.ts`）

```ts
export type Source = 'netease' | 'tencent' | 'kugou' | 'baidu';
export type Quality = 'standard' | 'high' | 'lossless';

export interface Song {
  source: Source;
  id: string;              // 统一字符串：网易数字 id / QQ songmid / 酷狗 hash / 百度 songid
  name: string;
  artist: string[];
  album?: string;
  albumId?: string;
  duration: number;        // 秒
  cover?: string;
  available: boolean;      // 是否公开可播
  vip: boolean;            // 是否 VIP/付费（仅提示，不提供地址）
}

export interface SongDetail extends Song {
  quality: Quality[];      // 该曲公开可用的档位
  publishAt?: string;
}

export interface SongUrl {
  source: Source;
  id: string;
  url: string;
  quality: Quality;
  bitrate: number;         // kbps
  size?: number;           // 字节
  expireAt?: number;       // 上游直链过期时间（毫秒），无则省略
}

export interface Lyric {
  source: Source;
  id: string;
  lyric: string;           // LRC 原文
  translation?: string;
}

export interface AlbumDetail {
  source: Source;
  id: string;
  name: string;
  artist: string[];
  cover?: string;
  publishAt?: string;
  song: Song[];            // 单数命名，与路由一致
}

export interface ArtistDetail {
  source: Source;
  id: string;
  name: string;
  avatar?: string;
  song: Song[];            // 热门曲目
}

export interface PlaylistDetail {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  creator?: string;
  count: number;
  song: Song[];
}

export interface RankDetail {
  source: Source;
  id: string;
  name: string;
  updateAt?: string;
  song: Song[];
}

export interface SearchPage {
  page: number;
  size: number;
  total: number;
  failed: Source[];        // source=all 时失败的源
  list: Song[];
}
```

---

## 8. 适配器设计

### 8.1 能力矩阵（初版目标，以实测为准）

| 能力 | 网易云 | QQ 音乐 | 酷狗 | 百度 |
|---|---|---|---|---|
| 搜索 | ✅ | ✅ | ✅ | ⚠️ |
| 单曲详情 | ✅ | ✅ | ✅ | ✅ |
| 公开播放地址 | ✅（未登录通常 128k） | ✅（vkey 直链） | ✅ | ⚠️ |
| 歌词 | ✅ | ✅ | ✅ | ✅ |
| 专辑 | ✅ | ✅ | ✅ | ⚠️ |
| 歌手 | ✅ | ✅ | ⚠️ | ⚠️ |
| 歌单 | ✅ | ✅ | ✅ | ⚠️ |
| 榜单 | ✅ | ✅ | ✅ | ⚠️ |

✅ = 计划实现；⚠️ = experimental（实现但允许随时返回 `1003`/`2002`）。

### 8.2 适配器接口（`provider/types.ts`）

```ts
export interface Provider {
  readonly source: Source;
  readonly capability: Readonly<Record<Capability, boolean>>;
  search(q: string, page: number, size: number): Promise<SearchPage>;
  song(id: string): Promise<SongDetail>;
  url(id: string, quality: Quality): Promise<SongUrl>;
  lyric(id: string): Promise<Lyric>;
  album?(id: string): Promise<AlbumDetail>;
  artist?(id: string): Promise<ArtistDetail>;
  playlist?(id: string): Promise<PlaylistDetail>;
  rank?(id?: string): Promise<RankDetail>;
}
```

- 可选方法 + `capability` 声明；未实现的能力直接 `1003`，**不做假实现、不跨源顶替**。
- 适配器只负责「上游 JSON → 统一模型」，不处理缓存/限流/HTTP 响应。
- 所有 id 在适配器内部转成字符串；上层不关心原始类型。

### 8.3 各源公开端点（候选，P1 用探针逐条实测后写死）

> 下表是**设计阶段的候选端点**。这类接口随时会变，实现阶段先跑 `tools/probe.ts`，实测结果回写 `docs/endpoint.md`，失效的降级为 `1003`。

**网易云**（`music.163.com`，匿名 + `Referer`，无签名）

| 能力 | 端点 | 关键参数 |
|---|---|---|
| 搜索 | `/api/search/get/web` | `s`、`type=1`、`limit`、`offset` |
| 详情 | `/api/song/detail` | `ids=[id]` |
| 地址 | `/api/song/enhance/player/url` | `ids=[id]`、`br=128000` |
| 歌词 | `/api/song/lyric` | `id`、`lv=-1`、`kv=-1`、`tv=-1` |
| 专辑 | `/api/album/{id}` | — |
| 歌手 | `/api/artist/{id}` | — |
| 歌单 | `/api/v6/playlist/detail` | `id`（POST 表单） |
| 榜单 | `/api/toplist` + 歌单详情 | — |

**QQ 音乐**（`c.y.qq.com` / `u.y.qq.com`，匿名 + `Referer: https://y.qq.com/`，无签名）

| 能力 | 端点 | 关键参数 |
|---|---|---|
| 搜索 | `/soso/fcgi-bin/client_search_cp` | `w`、`p`、`n`、`format=json` |
| 详情 | `musicu.fcg` | `module=music.pf_song_detail_svr` |
| 地址 | `musicu.fcg` | `module=vkey.GetVkeyServer`、`cmd=CgiGetVkey`、`songmid`、随机 `guid` |
| 歌词 | `/lyric/fcgi-bin/fcg_query_lyric_new.fcg` | `songmid`、`nobase64=1` |
| 专辑 | `musicu.fcg` | `module=music.musichallAlbum.AlbumInfoServer` |
| 歌手 | `musicu.fcg` | `module=music.musichallSinger.SingerInfoInter` |
| 歌单 | `/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg` | `disstid`、`type=1`、`json=1`、`utf8=1` |
| 榜单 | `musicu.fcg` | `module=musicToplist.ToplistInfoServer` |

**酷狗**（匿名设备标识 `kg_mid`/`kg_dfid` 本地生成，无账号）

| 能力 | 端点 | 关键参数 |
|---|---|---|
| 搜索 | `songsearch.kugou.com/song_search_v2` | `keyword`、`page`、`pagesize`、`platform=WebFilter` |
| 地址/歌词 | `wwwapi.kugou.com/yy/index.php?r=play/getdata` | `hash`、`album_id`、`mid`、`dfid` |
| 榜单 | `mobilecdn.kugou.com/api/v3/rank/song` | `rankid`、`page`、`pagesize` |
| 歌单 | `mobilecdn.kugou.com/api/v3/special/song` | `specialid`、`page`、`pagesize` |
| 专辑 | `mobilecdn.kugou.com/api/v3/album/song` | `albumid` |

**百度**（`musicapi.taihe.com` 统一入口，`method=` 分发；experimental）

| 能力 | method |
|---|---|
| 搜索 | `baidu.ting.search.merge` |
| 地址 | `baidu.ting.song.play` |
| 歌词 | `baidu.ting.song.lry` |
| 榜单 | `baidu.ting.billboard.billList` |
| 歌单 | `baidu.ting.diy.gedan` |

### 8.4 可用性过滤（合规核心）

适配器出口统一过 `core/filter.ts`，规则按源：

| 源 | 判定字段 | 允许 | 拒绝 |
|---|---|---|---|
| 网易云 | `fee` | `0`（免费）、`8`（低码率免费） | `1`（VIP）、`4`（付费专辑） |
| QQ 音乐 | `pay.pay_play` + `vkey.purl` | `pay_play=0` 且 `purl` 非空 | 其余 |
| 酷狗 | `play_url` + `privilege`/`pay_type` | 地址非空且允许公开播放 | 空地址 |
| 百度 | `file_link` | 非空 | 空 |

规则：

1. `available=false` 的曲目**仍可出现在搜索结果**（带 `vip:true` 提示），但 `/v1/song/url` 一律 `3002`。
2. 不做任何「换源兜底」：网易拿不到就返回网易失败，绝不偷偷换成别的源。
3. 不提供任何 cookie/token 配置项，服务无法被用来登录播放。
4. 过滤器是最后一道闸：即使适配器写错，出口也必须再过一遍。

### 8.5 请求头与签名

- 每源固定匿名 `User-Agent` + `Referer`，酷狗额外带本地随机生成的 `kg_mid`/`kg_dfid`（匿名设备标识，不含账号）。
- 不实现 weapi/eapi 的 AES 链路（客户端私有协议，易变且对「公开内容」无必要）；若某源匿名接口失效，降级为 `1003`，不逆向。
- 上游域名白名单写死在 `config.ts`，`upstream.ts` 校验，防 SSRF。

---

## 9. 上游访问层（`http/upstream.ts`）

- `node:https` + `keepAlive` Agent（每源 8 连接），自动 `gzip/br` 解压。
- 超时 6s（`AbortSignal.timeout`），GET 失败重试 2 次，退避 200ms / 600ms；非幂等一律不重试（本服务全 GET）。
- JSONP 剥离：`callback(...)`、`MusicJsonCallback(...)`、`jsonp123(...)` 统一剥壳。
- 非 2xx / 结构不符 → `2002` / `2003`，保留上游状态码到日志（不返回给客户端）。
- 熔断：单源连续 5 次失败 → 冷却 60s，期间直接 `2002`，`/v1/source` 可见 `cooldown`。

缓存（`http/cache.ts`，LRU 500 条）：

| 数据 | TTL | key |
|---|---|---|
| 搜索 | 60s | `source:search:q:type:page:size` |
| 详情/专辑/歌手/歌单/榜单 | 300s | `source:capability:id` |
| 播放地址 | 60s | `source:url:id:quality` |
| 歌词 | 3600s | `source:lyric:id` |

只缓存成功结果；缓存命中 `cost=0`。

---

## 10. 限流与运行

- 令牌桶：每 IP 60 次/分钟、突发 10；`X-Forwarded-For` 仅在 `TRUST_PROXY=1` 时采信。
- 每源并发闸门 8，排队超 3s 返回 `2001`。
- 日志单行 JSON：`{ts, level, route, source, code, cost, ip}`，`ip` 只存 sha256 前 8 位。
- 优雅退出：`SIGINT/SIGTERM` → 停止接收 → 等在途 5s → 退出。
- `/v1/status`：`version`、`uptime`、`cacheHit`、`source` 健康、`notice`（免责摘要）。

---

## 11. 配置（`src/config.ts`，全部环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8802` | 监听端口（8801 本机 EACCES） |
| `HOST` | `127.0.0.1` | 部署对外时改 `0.0.0.0` |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `TIMEOUT_MS` | `6000` | 上游超时 |
| `RATE_LIMIT` | `60` | 每 IP 每分钟请求数 |
| `CACHE_MAX` | `500` | LRU 上限 |
| `SOURCE_DISABLE` | 空 | 逗号分隔，临时下线某源（如 `baidu`） |
| `TRUST_PROXY` | `0` | 是否采信 `X-Forwarded-For` |
| `ENABLE_STREAM_PROXY` | `0` | 音频流代理开关（默认关） |

---

## 12. 测试与验收

单测（`node --test`，本地 stub 上游，**不联网**）：

1. 路由：单数命中、复数 `404`、方法不符 `405`、尾斜杠归一。
2. 响应：envelope 形状、错误码→HTTP 映射、**断言无 `Access-Control-*` 头**。
3. 归一化：四源 fixture → 统一 `Song`（字段/时长/封面/artist 数组）。
4. 过滤：VIP、付费、空地址 → `available:false` / `3002`。
5. 缓存：TTL 命中、LRU 淘汰、失败不缓存。
6. 限流：第 61 次 `429 / 4001`。
7. 上游：超时重试、JSONP 剥壳、熔断冷却。
8. JSONP：壳格式 `/**/typeof cb === 'function' && cb(...)`、`Content-Type: application/javascript`、恒 200、非法回调名 → `1001`、回调名注入（`cb);alert(1)//`）被拒且不回显。

验收清单（全部可执行验证）：

- [ ] `node src/main.ts` 零依赖启动，无 `node_modules`
- [ ] `tsc --noEmit` 0 错误
- [ ] 四源 `/v1/search` 实测返回 200（`tools/probe.ts` 记录）
- [ ] VIP 曲目 `/v1/song/url` 返回 `3002`
- [ ] `curl -i` 看不到任何 CORS 头
- [ ] `curl '.../v1/song?source=netease&id=x&callback=cb'` 返回 `/**/typeof cb === 'function' && cb({...})`，`Content-Type: application/javascript`
- [ ] 非法 `callback=cb);alert(1)//` 返回 `1001`，响应体不含原样回显
- [ ] 全路由 GET 且资源名单数
- [ ] `/v1/source` 能力矩阵与实际实现一致

---

## 13. 里程碑

| 阶段 | 内容 | 产物 | 验收 |
|---|---|---|---|
| P0 | 骨架：config/server/router/respond/error/model + 本地启动 | 可跑的空壳，`/v1/status` 通 | `node src/main.ts` + 单测路由 |
| P1 | 网易云 + QQ 全能力（含签名/头/JSONP） | 搜索/详情/地址/歌词/歌单/榜单 | 探针四类接口真网 200 |
| P2 | 酷狗 + 百度；能力矩阵补齐 | 四源齐活 | 探针 + 降级路径 |
| P3 | 缓存/限流/熔断/状态/日志 | 稳定性层 | 单测 + 压测 100 rps |
| P4 | 文档：README、DISCLAIMER、docs/endpoint、二次开发示例 | 可交付 | 验收清单全勾 |

预估：P0 0.5 天、P1 1 天、P2 1 天、P3 0.5 天、P4 0.5 天（以实测为准，端点失效会加时）。

---

## 14. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 上游接口变更 | 某能力失效 | 适配器隔离 + `probe` + 熔断 + 能力矩阵显式降级 |
| 网易 460 / IP 风控 | 搜索或地址被拒 | 固定匿名头、限速、单源并发 ≤8、不共享账号 |
| 百度音乐服务不稳定 | 长期不可用 | 标 experimental，默认仍启用但失败快、不拖慢聚合 |
| 版权与合规 | 法律风险 | 只公开内容、不代理不落盘、免责声明、`SOURCE_DISABLE` 一键下线 |
| 被当免费 CDN | 带宽/封禁 | 默认不代理音频；直链有时效；限流 |
| 二次开发滥用 | 上游封 IP | README 写明「自建自用、控制频率」，不内置代理池 |

---

## 15. 免责声明（草案，将写入 `DISCLAIMER.md` 与 `/v1/status`）

> 本服务仅提供**技术研究与学习**用途的公开音乐元数据聚合接口，不存储、不转码、不分发任何音频文件，不提供任何会员/VIP 内容，不包含登录、破解或绕过版权保护的能力。所有数据与播放地址均来自各音乐平台**公开可访问**的网页接口，版权归原平台及权利人所有。使用者应自行遵守所在地区法律及各平台服务条款，不得将本服务用于商业分发、批量抓取或任何侵犯版权的行为。因使用本服务产生的任何法律责任由使用者自行承担，作者不承担任何连带责任。若权利人认为内容不当，可通过仓库 issue 联系，将立即下线相关能力。

> This service is provided **for technical research and learning only**. It stores, transcodes and distributes no audio, offers no VIP/member content, and contains no login, cracking or DRM-bypass capability. All metadata and play URLs come from publicly accessible web endpoints of the respective platforms; copyrights belong to the platforms and rights holders. Users are solely responsible for complying with applicable laws and platform terms, and must not use this service for commercial redistribution, bulk scraping or any copyright infringement. The author assumes no liability for any use of this service.

---

## 16. 默认决策与待确认

已按以下默认决策设计，若有异议请指出：

1. **跨域方案 = JSONP**：带 `?callback=` 返回 `application/javascript` 包 `callback(envelope)`；不带时返回普通 `application/json`；两种模式都不设 CORS 头。
2. 默认监听 `127.0.0.1:8802`，部署时改 `HOST=0.0.0.0`。
3. 默认**不**代理音频流，只返回有时效直链。
4. `source=all` 聚合搜索保留（并发扇出，延迟取最慢源，失败源列在 `failed`）。
5. 不提供前端页面；仅接口 + README 示例（curl / fetch / Node）。

待确认：

- [ ] 是否需要零依赖的静态接口文档页 `/`（同源，不涉及 CORS）？
- [ ] 端口与监听地址是否按默认？
- [ ] 是否保留 `source=all` 聚合（会增加上游压力）？

确认后从 P0 开始实现。

---

## 17. 实现状态（2026-10-19）

已按本稿完成实现：`node src/main.ts` 启动，`npm test` 25 项全绿，`tsc --noEmit` 0 错误。

与设计稿的差异（均已同步到 README 与 `docs/endpoint.md`）：

1. 搜索只实现 `type=song`；`type=album/artist/playlist` 返回 `1003`（后续可补）。
2. QQ 音乐歌手详情无公开接口，能力关闭；百度专辑/歌单/榜单未找到公开接口，能力关闭。
3. 酷狗歌单/专辑详情接口不返回名称，`name` 为空字符串。
4. 酷狗播放、榜单、歌单、专辑走 `m.kugou.com` / `mobilecdn.kugou.com` 的 HTTP（该域名 HTTPS 证书不匹配）。
5. 网易 `/api/song/enhance/player/url` 带 `os=pc` Cookie 时会对 VIP 曲目返回 45 秒试听片段，已按 `fee` 与 `freeTrialInfo` 双重拦截（返回 `3002`）。
6. QQ 新版网页搜索需签名（`u6.y.qq.com/cgi-bin/musics.fcg?sign=`），改用无签名手机版搜索 `search_for_qq_cp`。
7. 百度签名算法取自公开网页 JS（`md5(排序参数 + 固定 secret)`），仅用于构造与浏览器一致的公开请求。
8. 新增文档面：`GET /` 纯 HTML 说明页、`GET /openapi.json` OpenAPI 3.0 规范（不包 envelope）。
9. 网易搜索接口不返回封面，搜索后用详情接口批量补齐（一次额外请求，失败降级）；酷狗歌单/专辑用 `special/info`、`album/info` 补名称与封面；榜单补 `cover`。
10. 百度公开歌单页当前无数据，歌单能力保持关闭；酷狗歌单内单曲不返回封面（接口限制）。
