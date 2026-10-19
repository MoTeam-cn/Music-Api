# Music-Api

集成 **网易云音乐 / QQ 音乐 / 酷狗音乐 / 百度音乐（千千）** 的公开网页接口，统一成一套只读 REST API。
零运行时依赖、Node 24 原生 TypeScript、支持 JSONP 跨域、内置限流与缓存。

> [!WARNING]
> **本项目仅供学习、研究与自建自用。**
> 不存储、不转码、不分发任何音频；不提供 VIP / 付费内容；不含登录、破解、DRM 绕过能力；与各音乐平台**无任何关联**。
> 请勿用于商业用途、公开大规模服务或批量抓取。音乐数据版权归各平台及权利人所有。
> 完整条款见 **[DISCLAIMER.md](DISCLAIMER.md)**，使用前请务必阅读。

![license](https://img.shields.io/badge/license-Apache--2.0-blue)
![node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)
![tests](https://img.shields.io/badge/tests-26%20passing-success)

---

## 特性

- **四源统一模型**：搜索、详情、歌词、专辑、歌手、歌单、榜单、播放地址，字段一致。
- **只读、全 GET**：无写操作、无账号、无 Cookie 透传。
- **JSONP**：`?callback=cb` 返回脚本，浏览器 `<script>` 直接跨域取数；**不设任何 CORS 头**。
- **合规过滤**：VIP / 付费 / 无版权曲目只返回元数据并标 `available:false`，取播放地址一律 `3002`，不做换源兜底。
- **零依赖**：运行时只用 Node 内置模块，无构建步骤、无数据库。
- **工程件**：TTL + LRU 缓存、令牌桶限流、上游超时重试、域名白名单、IP 哈希日志。
- **自带文档**：`GET /` 说明页、`GET /openapi.json` OpenAPI 3.0 规范。

---

## 快速开始

要求 **Node ≥ 24.14**（原生类型擦除，直接运行 `.ts`）。

```bash
git clone https://github.com/MoTeam-cn/Music-Api.git
cd Music-Api
npm start
# music-api 0.1.0 listening on http://127.0.0.1:8802
```

浏览器打开 `http://127.0.0.1:8802/` 可看到接口说明页。

运行不需要 `npm install`；`devDependencies` 只用于类型检查与测试。

---

## 接口

所有接口均为 `GET`，资源名**单数**，统一前缀 `/v1`。

| 路径 | 参数 | 说明 |
|---|---|---|
| `/v1/search` | `q`、`source`（默认 all）、`type`（默认 song）、`page`、`size` | 搜索；`source=all` 并发聚合四源 |
| `/v1/song` | `source`、`id` | 单曲详情 |
| `/v1/song/url` | `source`、`id`、`quality` | 公开可播直链 |
| `/v1/lyric` | `source`、`id` | LRC 歌词 |
| `/v1/album` | `source`、`id` | 专辑详情 + 曲目 |
| `/v1/artist` | `source`、`id` | 歌手 + 热门曲目 |
| `/v1/playlist` | `source`、`id`、`page`、`size`、`with_url`、`quality` | 歌单详情 + 曲目，支持分页；`with_url=1` 直接带播放地址 |
| `/v1/rank` | `source`、`id`（可省） | 不带 id 返回榜单列表，带 id 返回榜单详情 |
| `/v1/source` | — | 四源能力矩阵 + 禁用列表 |
| `/v1/status` | — | 版本、运行时长、缓存命中、免责声明摘要 |

`source` 取值：`netease` / `tencent` / `kugou` / `baidu`；`quality`：`standard` / `high` / `lossless`。

---

## 示例

### 搜索

```bash
curl 'http://127.0.0.1:8802/v1/search?q=晴天&source=netease&size=5'
```

### 歌单播放器

```bash
# 分页：第 1 页，每页 50（默认 size=50，最大 100）
curl 'http://127.0.0.1:8802/v1/playlist?source=netease&id=3778678&page=1&size=50'

# 第 2 页
curl 'http://127.0.0.1:8802/v1/playlist?source=netease&id=3778678&page=2&size=50'

# 直接带播放地址：with_url=1（免费曲目才有；VIP/付费为 null）
curl 'http://127.0.0.1:8802/v1/playlist?source=netease&id=3778678&page=1&size=20&with_url=1'
```

- `with_url=1`：在歌单响应里直接给每首可播歌曲补 `url`，前端播放器不用再逐首请求。
  - 网易 / QQ 走批量接口（一次请求解决整页）；酷狗 / 百度按并发单曲补齐（并发 6）。
  - VIP / 付费 / 无版权曲目 `url` 为 `null`，`available:false`、`vip:true`，**不需要付费，但这类歌拿不到地址**。
  - 结果只缓存 60s（直链有时效），普通歌单缓存 5min。
- 分页字段：`page`、`size`、`total`、`hasMore`；`page*size < total` 时 `hasMore=true`。
- 不想一次拿地址就仍用单曲接口：`/v1/song/url`。

歌单 ID 直接从各平台网页 URL 里取：

| 平台 | 歌单 URL 示例 | 传入 id |
|---|---|---|
| 网易云 | `music.163.com/playlist?id=3778678` | `3778678` |
| QQ 音乐 | `y.qq.com/n/ryqq/playlist/7011264340` | `7011264340` |
| 酷狗 | `kugou.com/yy/special/single/7074327.html` | `7074327` |
| 百度 | 公开歌单页当前无数据 | 不支持 |

### JSONP（浏览器跨域）

```html
<script>
  function onSearch(res) {
    if (res.code !== 0) return console.error(res.message);
    console.log(res.data.list);
  }
</script>
<script src="http://127.0.0.1:8802/v1/search?q=晴天&source=netease&callback=onSearch"></script>
```

jQuery 直接可用：`$.ajax({ url: '/v1/search', dataType: 'jsonp', data: { q: '晴天' } })`。

> 本服务不设 CORS 头，跨域只能用 JSONP。回调名有白名单校验，非法回调返回 `1001`。

---

## 响应格式

```json
{ "code": 0, "message": "ok", "data": {}, "source": "netease", "cost": 137 }
```

| 字段 | 说明 |
|---|---|
| `code` | 业务码，0 成功 |
| `message` | 可读信息 |
| `data` | 数据，失败为 `null` |
| `source` | 命中的源（聚合搜索省略） |
| `cost` | 上游耗时 ms，缓存命中为 0 |

错误码：`1001` 参数 · `1002` 源 · `1003` 能力 · `1004` 方法 · `2001` 超时 · `2002` 上游 · `2003` 解析 · `3001` 不存在 · `3002` VIP/付费 · `4001` 限流 · `5000` 内部。

JSONP 模式下 HTTP 恒为 `200`（`<script>` 不看状态码），错误只看 `code`。

---

## 能力矩阵（实测）

| 能力 | 网易云 | QQ 音乐 | 酷狗 | 百度 |
|---|---|---|---|---|
| search | ✅ | ✅ | ✅ | ✅ |
| song | ✅ | ✅ | ✅ | ✅ |
| url | ✅ | ✅ | ✅ | ✅ |
| lyric | ✅ | ✅ | ✅ | ✅ |
| album | ✅ | ✅ | ✅ | — |
| artist | ✅ | — | ✅ | ✅ |
| playlist | ✅ | ✅ | ✅ | — |
| rank | ✅ | ✅ | ✅ | — |

`—` 表示该源公开接口未提供 / 未验证，调用返回 `1003`。

---

## 文档与调试

- `GET /`：默认说明页（纯 HTML、无样式）
- `GET /openapi.json`：OpenAPI 3.0 规范，可导入 **Apifox / Postman / Swagger Editor**
- `docs/endpoint.md`：四源端点实测记录（含签名算法与已知坑）
- `docs/design.md`：设计与实现说明

> Swagger UI 若部署在别的域名下会受 CORS 限制（本服务不发 CORS 头），建议下载 JSON 导入，或把 UI 与本服务同源部署。

---

## 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8802 | 端口 |
| `HOST` | 127.0.0.1 | 对外部署改 0.0.0.0 |
| `LOG_LEVEL` | info | debug/info/warn/error |
| `TIMEOUT_MS` | 6000 | 上游超时 |
| `RATE_LIMIT` | 60 | 每 IP 每分钟请求数 |
| `RATE_BURST` | 10 | 突发额度 |
| `CACHE_MAX` | 500 | 缓存条数上限 |
| `SOURCE_DISABLE` | 空 | 逗号分隔，临时下线某源（如 `baidu`） |
| `TRUST_PROXY` | 0 | 是否采信 X-Forwarded-For |

---

## 缓存与性能

目标：同一查询在 TTL 内**不再打上游**，并发请求也只打一次。

### 服务端

- **TTL + LRU**：默认 500 条，过期即失效；命中时 `cost` 为 `0`。
- **stale-while-revalidate**：过期后 30 秒内先返回旧值、后台刷新，避免抖动与并发打爆上游。
- **singleflight**：同一 key 的并发未命中只发起一次上游请求，其余请求共享结果（`X-Cache: SHARED`）。
- **错误不缓存**：失败响应直接透传，不写缓存。

| 接口 | TTL |
|---|---|
| `/v1/search`、`/v1/song/url` | 60s |
| `/v1/status`、`/v1/source` | 5s |
| `/v1/lyric` | 1h |
| 其余（song/album/artist/playlist/rank） | 5min |

### HTTP / CDN

- API 响应带 `Cache-Control: public, max-age=<ttl>, s-maxage=<ttl>, stale-while-revalidate=30`。
- `X-Cache` 头：`HIT` / `MISS` / `STALE` / `SHARED` / `STATIC`，便于排查。
- `/openapi.json`：`public, max-age=3600, s-maxage=86400`，带强 `ETag` + `Last-Modified`，支持 `304`。
- `/` 首页：`public, max-age=600, s-maxage=3600`，同样支持 `ETag` / `304`。
- 所有响应声明 `Vary: Accept-Encoding`；大于 1KB 的响应自动 gzip。
- 支持 `HEAD` 请求（CDN 探活/预检）。

> 走 CDN 时直接按 `s-maxage` 缓存即可；源站还有一层进程内缓存兜底，重复请求不会穿透到上游。

---

## 部署建议（重要）

本项目设计为**自建自用**，不建议公开部署成公共音乐服务。若要放到服务器上：

1. **加访问控制**：用 Nginx / Caddy 做 Basic Auth 或内网访问，不要裸奔。
2. **保持低频**：默认限流 60 次/分钟/IP，不要调高到影响上游。
3. **不要对外宣传**：公开的大流量服务会放大侵权风险，也容易被上游风控。
4. **保留关停能力**：随时能通过 `SOURCE_DISABLE` 或停进程下线。
5. **日志脱敏**：默认只记录 IP 哈希，不要额外记录用户信息。
6. **收到投诉立即处理**：见 [DISCLAIMER.md](DISCLAIMER.md) 的下架说明。

---

## Docker 部署

镜像发布在 GHCR：`ghcr.io/moteam-cn/music-api`，多架构（`linux/amd64` + `linux/arm64`），无运行时依赖，镜像约 60MB。

国内推荐用**南京大学 GHCR 镜像**（公开镜像可匿名拉取，无需登录）：

```bash
docker pull ghcr.nju.edu.cn/moteam-cn/music-api:latest
```

### 直接运行

```bash
docker run -d \
  --name music-api \
  --restart unless-stopped \
  -p 21983:8802 \
  -e HOST=0.0.0.0 \
  -e TRUST_PROXY=1 \
  ghcr.nju.edu.cn/moteam-cn/music-api:latest
```

宿主机访问 `http://127.0.0.1:21983/`；容器内部始终监听 `8802`，只映射宿主端口。

> 官方地址把 `ghcr.nju.edu.cn` 换成 `ghcr.io` 即可。私有部署建议加反代 Basic Auth / 内网访问，不要裸奔。

### docker compose

仓库自带 `docker-compose.yml`：

```bash
docker compose up -d
docker compose logs -f
# 默认映射 21983:8802
```

### 本地构建

```bash
docker build -t music-api .
docker run --rm -p 21983:8802 -e HOST=0.0.0.0 music-api
```

### 标签规则

| 触发 | 标签 |
|---|---|
| push 到 `main` | `latest`、`main`、`sha-<短哈希>` |
| 打 tag `v1.2.3` | `1.2.3`、`1.2`、`sha-<短哈希>` |
| PR | 只构建不推送 |

> 公网部署请务必加访问控制（反代 Basic Auth / 内网），不要裸奔；容器内监听 `0.0.0.0:8802`，宿主端口由 `-p` 决定（示例 21983）。

---

## 目录结构

```
src/
  main.ts  config.ts  server.ts  router.ts
  core/      model / error / normalize
  http/      upstream / respond / request / cache / limit / log
  provider/  netease / tencent / kugou / baidu / index / types
  route/     search / song / lyric / album / artist / playlist / rank / source / status / doc
  web/       home.html 默认说明页
  docs/      openapi.json OpenAPI 规范
test/        node:test 单测（不联网）
tools/       probe.ts 上游连通性探针
docs/        端点实测与设计文档
Dockerfile / docker-compose.yml / .github/workflows/ghcr.yml  容器化与镜像发布
```

---

## 开发与测试

```bash
npm start          # 启动
npm run dev        # 热重载
npm test           # 33 项单测，不联网
npm run check      # tsc --noEmit
npm run probe      # 打真网探测四源能力（需要网络）
```

新增音源：在 `src/provider/` 实现 `Provider` 接口，注册到 `src/provider/index.ts` 的 `PROVIDERS`，路由无需改动。

---

## 合规与使用边界

请在使用前确认你理解并接受以下边界：

1. **仅限学习 / 研究 / 个人自用**，不得用于商业产品、付费服务或对外运营。
2. **不得批量抓取**、镜像、转售接口或数据。
3. **不得移除或隐藏**本项目的免责声明与版权说明。
4. **不得尝试**用本项目获取 VIP / 付费内容，或绕过任何版权保护措施。
5. 你所在地区的法律与各平台服务条款**优先于**本项目文档；冲突时以法律与平台条款为准。
6. 因使用本项目产生的一切后果由使用者自行承担。

---

## 已知限制

- 搜索只实现 `type=song`；`type=album/artist/playlist` 返回 `1003`。
- QQ 音乐歌手详情、百度专辑/歌单/榜单暂无公开接口，返回 `1003`。
- 酷狗歌单里的单曲不返回封面（接口只给歌单封面）。
- 酷狗榜单/歌单/专辑走 `mobilecdn.kugou.com` 的 HTTP（该域名 HTTPS 证书不匹配）。
- 网易未登录通常只能取 128k；QQ/酷狗/百度直链均有时效。
- 上游接口随时可能变更，失效能力会降级为 `1003` / `2002`。

---

## 免责声明

本服务仅提供**技术研究与学习**用途的公开音乐元数据聚合接口：

- 不存储、不转码、不分发任何音频文件，仅返回平台公开接口中已有的元数据与有时效的播放直链；
- 不提供会员 / VIP / 付费内容，不含登录、破解、DRM 绕过能力，不持有任何平台账号；
- 所有数据来自各平台公开可访问的网页接口，版权归原平台及权利人所有；
- 与网易云音乐、腾讯音乐、酷狗音乐、百度音乐**均无关联**，未获其授权或背书。

完整中英文条款、下架流程与责任限制见 **[DISCLAIMER.md](DISCLAIMER.md)**。

---

## License

- **代码**：[Apache License 2.0](LICENSE)
- **音乐数据 / 封面 / 歌词**：版权归各平台及权利人所有，**不在**本仓库许可证覆盖范围内，详见 [NOTICE.md](NOTICE.md)

---

## 联系

- Bug / 功能建议：GitHub Issues
- 权利人与下架请求：请开 Issue 并注明「版权下架」，会尽快处理
