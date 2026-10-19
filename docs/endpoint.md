# 上游端点实测记录

> 实测时间：2026-10-19（本机，Node 24 fetch）。接口随时可能变更，失效时对应能力降级为 `1003` / `2002`。

## 网易云

| 能力 | 端点 | 状态 | 备注 |
|---|---|---|---|
| search | `GET music.163.com/api/search/get/web` | ✅ | 需 Referer；返回 result.songs |
| song | `GET /api/song/detail?ids=[id]` | ✅ | ar/al/dt/fee |
| url | `GET /api/song/enhance/player/url?ids=[id]&br=` | ✅ | 未登录 128k；带 `os=pc` Cookie 时 VIP 会返回 45s 试听片段（freeTrialInfo），已拦截 |
| lyric | `GET /api/song/lyric` | ✅ | lrc + tlyric |
| album | `GET /api/album/{id}` | ✅ | |
| artist | `GET /api/artist/{id}` | ✅ | hotSongs |
| playlist | `POST /api/v6/playlist/detail` | ✅ | 需表单 id；trackIds 批量取详情 |
| rank | `GET /api/toplist` + 歌单详情 | ✅ | 64 个榜单 |

## QQ 音乐

| 能力 | 端点 | 状态 | 备注 |
|---|---|---|---|
| search | `GET c.y.qq.com/soso/fcgi-bin/search_for_qq_cp` | ✅ | 手机版搜索，无签名；桌面版 client_search_cp 已 500 |
| song | `POST u.y.qq.com/cgi-bin/musicu.fcg` `music.pf_song_detail_svr` | ✅ | |
| url | `musicu.fcg` `vkey.GetVkeyServer/CgiGetVkey` | ✅ | purl 为空即 VIP/付费 |
| lyric | `GET c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg` | ✅ | 需 Referer |
| album | `GET c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg` | ✅ | |
| playlist | `GET c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg` | ✅ | |
| rank | `musicu.fcg` `musicToplist.ToplistInfoServer` | ✅ | GetAll / GetDetail |
| artist | — | ❌ | 经典 v8 歌手接口 404，musicu 模块参数错误 |

> 新版网页搜索走 `u6.y.qq.com/cgi-bin/musics.fcg?sign=`（带签名），本项目**不实现签名**，改用无签名的手机版搜索。

## 酷狗

| 能力 | 端点 | 状态 | 备注 |
|---|---|---|---|
| search | `GET songsearch.kugou.com/song_search_v2` | ✅ | 无签名 |
| url | `GET m.kugou.com/app/i/getSongInfo.php?cmd=playInfo` | ✅ | 老播放接口；VIP 无 url |
| lyric | `krcs.kugou.com/search` + `lyrics.kugou.com/download` | ✅ | 返回 base64 lrc |
| rank | `http://mobilecdn.kugou.com/api/v3/rank/*` | ✅ | 该域名 HTTPS 证书不匹配，走 HTTP |
| playlist | `special/song` + `special/info` | ✅ | 歌单名/封面/创建者取自 special/info |
| album | `album/song` + `album/info` | ✅ | 专辑名/歌手/封面取自 album/info |
| artist | `http://mobilecdn.kugou.com/api/v3/singer/*` | ✅ | info + song |

> 新版 `wwwapi.kugou.com/play/songinfo` 需要签名（md5 变体），本项目不实现。

## 百度音乐（千千 / 91q）

| 能力 | 端点 | 状态 | 备注 |
|---|---|---|---|
| search | `GET api-qianqian.taihe.com/v1/search` | ✅ | 签名见下 |
| song | `GET /v1/song/info?TSID=` | ✅ | |
| url | `GET /v1/song/tracklink?TSID=` | ✅ | data.path；isVip/isPaid 过滤 |
| lyric | `tracklink.data.lyric` → 静态 .lrc | ✅ | |
| artist | `/v1/artist/info` + `/v1/artist/song` | ✅ | |
| album | `/v1/album/info` | ❌ | 合法 albumCode 仍返回空 |
| playlist / rank | — | ❌ | 未找到公开路径；`music.taihe.com/songlist` 页面本身无数据（前端报错） |

**签名算法**（来自公开网页 JS）：

```
params 追加 appid=16073360、timestamp=秒级时间戳
按 key 升序拼成 k1=v1&k2=v2...，末尾拼上固定 secret
sign = md5(拼接串)
```

secret 为公开 JS 中的常量，仅用于构造与浏览器一致的公开请求，不涉及账号或 DRM。
