# 免责声明 / Disclaimer

> 最后更新：2026-10-19
> 适用于仓库 [MoTeam-cn/Music-Api](https://github.com/MoTeam-cn/Music-Api) 及其部署实例。

## 中文

### 1. 项目性质

本项目（Music-Api，下称「本项目」）是一个**技术研究与学习**用途的公开音乐元数据聚合接口。它把各音乐平台**公开可访问**的网页接口收敛成统一 API，供开发者学习接口设计、数据归一化与 Node.js 工程实践。

本项目与网易云音乐、腾讯音乐（QQ 音乐）、酷狗音乐、百度音乐（千千音乐）及其关联公司**没有任何关联**，未获得其授权、认可或背书。

### 2. 不提供什么

本项目**明确不提供**以下能力，且不会接受相关需求：

- 不存储、不缓存、不转码、不分发任何音频文件；
- 不提供会员、VIP、付费专辑、数字专辑等任何付费内容；
- 不包含登录、扫码、Cookie / Token 注入、账号共享等能力；
- 不包含破解、绕过 DRM、绕过付费墙、伪造签名等能力；
- 不提供批量抓取、镜像站、离线下载或转售接口的能力。

接口返回的播放地址均来自各平台公开接口中已有的、有时效的直链，本项目不参与其生成，也不对其可用性作任何保证。

### 3. 数据来源与版权

- 所有歌曲元数据、封面、歌词、榜单等内容，版权归各音乐平台及原始权利人所有。
- 本项目仅做格式转换与字段归一化，**不主张**对上述内容的任何权利。
- 本仓库的 Apache-2.0 许可证**仅覆盖源代码**，不覆盖任何音乐数据、封面、歌词或商标（见 [NOTICE.md](NOTICE.md)）。

### 4. 使用限制

使用者在使用本项目时**必须**遵守：

1. 仅用于个人学习、研究与自建自用，**不得**用于商业产品、付费服务或对外运营；
2. **不得**批量抓取、高频请求、镜像接口或转售数据；
3. **不得**移除、隐藏或修改本项目的免责声明与版权说明；
4. **不得**将本项目用于任何侵犯版权、违反平台服务条款或违反当地法律的行为；
5. 部署到公网时必须自行增加访问控制、限流与关停手段，并自行承担由此产生的全部风险。

### 5. 责任限制

本项目按「现状」（AS IS）提供，不附带任何明示或暗示的担保，包括但不限于可用性、准确性、合法性或特定用途适用性。

- 上游接口随时可能变更、限流或封禁，本项目不保证任何接口长期可用。
- 因使用或无法使用本项目造成的任何直接或间接损失，作者与贡献者**不承担任何责任**。
- 使用者因违反法律、平台条款或本声明产生的任何后果，由使用者**自行承担**。

### 6. 下架与投诉

若权利人认为本项目的某部分内容侵犯其权益，请通过 GitHub Issue 联系并注明「版权下架」，提供：

- 权利证明与联系方式；
- 涉及的具体接口 / 文件 / 数据范围。

我们会在核实后**尽快移除**相关能力或内容（也可通过 `SOURCE_DISABLE` 环境变量立即下线对应音源）。本项目无意侵犯任何人的合法权益。

### 7. 声明变更

本声明可能随项目发展更新，更新后自发布之日起生效。继续使用即视为接受最新版本。

---

## English

This project (Music-Api) is a **technical research and learning** project that aggregates publicly accessible web endpoints of several music platforms into a unified read-only API.

- It stores, transcodes and distributes **no audio**; it only normalizes metadata already exposed by public endpoints and returns time-limited playback URLs.
- It offers **no** membership, VIP or paid content, and contains **no** login, cracking, DRM-bypass or paywall-bypass capability.
- It is **not affiliated with, endorsed by, or authorized by** NetEase Cloud Music, Tencent Music (QQ Music), Kugou Music, or Baidu Music (Qianqian).
- All music metadata, artwork and lyrics are copyrighted by the respective platforms and rights holders. The Apache-2.0 license covers **source code only**.
- Use is limited to personal study, research and self-hosting. Commercial use, bulk scraping, API resale or public large-scale deployment is **prohibited**.
- The software is provided **AS IS**, without warranty of any kind. The authors assume **no liability** for any use of this project.
- Rights holders may open an issue marked "copyright takedown" with proof of ownership; affected capabilities will be removed promptly.
