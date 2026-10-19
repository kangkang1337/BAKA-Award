# Steam Film Archive

Steam Film Archive 的网站部分是静态页面。它只读取构建时随站点发布的 JSON，不使用 Steam 登录、Cookie、`/api/steam-film` 或常驻 Node.js 服务。

本机的 Steam 数据流程如下：

```text
Steam Web API → 本地同步命令 → 本地 SQLite 与历史快照 → 静态 JSON → 网站胶片墙
```

## 第一次配置

在项目根目录复制示例配置：

```powershell
Copy-Item .env.steam-film.local.example .env.steam-film.local
```

编辑 `.env.steam-film.local`，填写自己的 17 位 SteamID64 和 Steam Web API Key：

```dotenv
STEAM_OWNER_ID=你的17位SteamID64
STEAM_WEB_API_KEY=你的32位SteamWebAPIKey
STEAM_FILM_DATABASE_PATH=./var/steam-film-static.sqlite
STEAM_FILM_HTTPS_PROXY=
```

Steam 游戏详情需要允许 Steam Web API 读取。API Key 只由本机 Node.js 命令读取，不能改成 `VITE_...` 变量。`.env.steam-film.local`、`var/` 和 SQLite 文件已列入 `.gitignore`。可用以下命令核对私密配置被忽略：

```powershell
git check-ignore -v .env.steam-film.local
git check-ignore -v var/steam-film-static.sqlite
```

不要把配置内容粘贴到 issue、网页源码或公开 JSON 中。

### Steam API 代理

`steam:*` 本地命令为 Steam API 请求单独使用 HTTP/HTTPS 代理，不会修改全局 `fetch`、SQLite 或 Vite 开发服务器的网络设置。代理按以下顺序选择：

1. `.env.steam-film.local` 中的 `STEAM_FILM_HTTPS_PROXY`。
2. 当前进程的标准环境变量 `HTTPS_PROXY`，其次 `https_proxy`。
3. 都未配置时直连。

支持 HTTP 或 HTTPS 代理 URL，例如：

```dotenv
# 格式示意：把尖括号替换成代理客户端显示的 HTTP 端口
STEAM_FILM_HTTPS_PROXY=http://127.0.0.1:<本机HTTP代理端口>
```

请在正在使用的代理客户端设置里查找“本地监听”“HTTP 代理”或“混合端口”，把客户端显示的协议、主机和端口填入；不要根据浏览器设置、Git 的 `http.proxy` 或其他电脑推测端口。若代理要求认证，可把凭据放在这个仅本机使用且被 Git 忽略的 URL 中，但不要分享配置内容。当前不支持 SOCKS URL。显式代理连接失败时命令会报告代理错误，不会悄悄改为直连。

`npm run steam:network-check` 只请求 Steam 官方公开的 GetServerInfo 接口，不需要 API Key，不读写 SQLite、不创建批次或快照，也不导出 JSON。它使用与同步相同的代理选择和请求客户端，可先用它检查连通性。Git、浏览器和 Node.js 的代理设置彼此独立。

项目脚本通过 Node.js 的 `--env-file-if-exists=.env.steam-film.local` 在 CLI 模块启动前加载本地配置；请求代码再为单个 Steam `fetch` 显式附加代理 Dispatcher，不依赖进程级 `--use-env-proxy` 开关。代理未配置时使用 `fetch` 直连。

## 更新命令

```bash
npm run steam:sync
npm run steam:export
npm run steam:update
npm run steam:network-check
```

- `steam:sync`：请求 Steam，校验完整响应，将游戏更新和时长快照保存到 SQLite。
- `steam:export`：只读现有 SQLite 并重新生成静态 JSON；不访问 Steam，也不创建快照。
- `steam:update`：依次同步、保存快照并导出 JSON。日常更新使用这一条即可。
- `steam:network-check`：只检查 Steam API 基础连通性；不需要 Steam 账号配置，不触碰数据库。

同步失败批次会记录对应类别，例如 `steam-network-error`、`steam-proxy-connection-error`、`steam-http-error`、`steam-response-invalid`、`steam-data-invalid` 或 `database-write-failed`。网络与响应校验在数据库事务开始前完成；数据库写入失败会回滚整批游戏更新和快照。原有档案不会因游戏从某次响应中消失而删除。数据库绑定到首次成功使用的 SteamID64；如果配置了不同账号，程序会拒绝同步。

脚本是一次性本地进程，完成后会退出。网页上没有“同步”按钮：公开静态页面不能启动你的电脑程序，也不能安全保管 API Key。同步后必须把新的静态 JSON 与网站一起重新发布，访客才能看到新资料。

## 文件与公开范围

| 路径 | 用途 |
| --- | --- |
| `var/steam-film-static.sqlite` | 静态归档流程的本地游戏档案、同步批次和只追加的累计时长快照；Git 忽略 |
| `public/data/steam-film/archive.v1.json` | 胶片墙展示所需的公开游戏字段及最后成功同步时间 |
| `public/data/steam-film/monthly-reel.v1.json` | 月报基础数据、算法版本和统计完整性说明 |
| `.env.steam-film.local` | 本机 SteamID64、API Key、数据库路径和可选 Steam API 代理；Git 忽略 |

静态 JSON 是公开文件，任何访问者都可以下载。档案导出不包含 API Key、SteamID64、Cookie、OpenID 信息、个人备注、原始 API 响应、SQLite 文件或逐次快照明细。它会公开游戏名称、Steam AppID、封面、可用的游玩时长和日期字段。发布前仍应自行检查生成结果：

```bash
git status --short
git diff -- public/data/steam-film
```

空白模板表示当前仓库没有可公开的同步数据，不是示例档案。首次本地同步前，页面会显示空状态；加载失败和不兼容的数据版本会分别显示错误信息。

## Monthly Reel 数据说明

快照只从配置本地同步后开始累积，不会从当前总时长伪造过去月份。SQLite 以 UTC 保存采样和批次时间；月报按固定 `Asia/Shanghai` 时区划分自然月，并记录 `snapshot-delta-v1` 算法版本。

当前基础导出只把同一上海自然月内、相邻成功同步批次都包含该游戏且累计时长没有倒退的两条快照做差。这样的结果仍标记为“部分统计”，因为它不一定覆盖整个月。跨月采样差不会分摊；中间批次缺失该游戏、采样不足或发现累计时长倒退时，不会补零或把区间伪装成精确月时长。没有足够证据的月份显示为积累中或统计不足。真实首次游玩时间不能由累计时长推导。

逐次采样记录只留在本地 SQLite，不会导出到网站。未来要增加可视化月报，应继续保留每份报告使用的数据范围、统计生成时间与算法版本。

## 兼容说明

`server/index.ts` 仍保留旧的 OpenID / HTTP API 服务代码及对应安全测试，方便迁移期间对照或回退。新的静态页面和 `steam:*` 命令不启动该服务；静态站点不需要为 Steam Film 配置 API 反向代理。以后确认不再需要旧 VPS 路由后，可以单独安排退役清理。
