# Steam Film Archive

Steam Film Archive 是 BAKA AWARD 的私人游戏时光附页。前端从 `/steam-film` 提供胶片时间轴；数据服务运行在独立的 Node.js 进程中，监听 `127.0.0.1:8788`，数据保存在 SQLite。它不读取或修改 Steam-KaKaBase，也不与其他项目共用数据库。

没有后端配置时，页面仍可浏览交互样例。样例封面和游戏名只用于演示，不是站主的 Steam 游戏库。

## 本地预览

需要 Node.js `22.12+`。后端使用 Node 内置的 TypeScript 类型剥离和 `node:sqlite`，无需添加运行时依赖。

```powershell
Copy-Item .env.example .env
npm ci
```

第一个终端启动本地 API：

```powershell
npm run dev:steam-film
```

第二个终端启动网站：

```powershell
npm run dev
```

打开 Vite 显示的本地地址并进入 **STEAM FILM ARCHIVE**。Vite 会把 `/api/steam-film` 请求代理到本地 `127.0.0.1:8788`。空白的 `.env` 配置会让页面显示交互样例，不开放 Steam 登录或同步。

Steam OpenID 登录应通过部署好的 HTTPS 域名测试。不要在本地配置生产密钥后从本地预览页发起登录：OpenID 回调目标由 `PUBLIC_ORIGIN` 决定，生产环境必须回到同一个 HTTPS 站点。

## 数据与真实性

- Steam Web API Key 只由后端读取，不进入 Vite 前端、构建产物或接口响应。
- 游戏列表、游玩时间和最近游玩日期来自 `IPlayerService/GetOwnedGames`。Steam 的游戏详情隐私设置必须允许读取游戏库。
- 首次游玩日期和最早成就日期没有可靠来源时保持空值。`first_seen_at` 只表示网站第一次成功同步到该游戏的时间，不代表第一次启动。
- 普通游戏库接口不提供可靠的全部成就汇总；成就数量暂时显示为未知。页面不会为每款游戏额外发起成就 API 请求。
- 档案仅允许配置的一个 SteamID64 登录查看。匿名访问 `/games` 会收到 `401`；状态接口不会向匿名访问者提供游戏数量。
- SQLite 数据库路径不能位于项目的 `public/` 或 `dist/` 中。生产环境使用独立的 `/var/lib` 私有目录。

## 必需配置

`.env.example` 仅含空白占位项。`.env` 已被 Git 忽略，任何密钥都不要写入前端源码或提交到仓库。

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | 生产服务器设为 `production`；这会强制要求 HTTPS 和全部私密配置。 |
| `HOST` | 固定为 `127.0.0.1`，服务不直接暴露到公网。 |
| `PORT` | 独立服务端口，默认 `8788`；不要与 Steam-KaKaBase 的 `8765` 混用。 |
| `PUBLIC_ORIGIN` | 网站根地址；生产填写 `https://bakaaward.com`，不要带路径。 |
| `STEAM_OWNER_ID` | 唯一允许登录的 17 位 SteamID64。 |
| `STEAM_API_KEY` | Steam Web API Key；仅放在服务器环境变量中。 |
| `SESSION_SECRET` | 至少 32 字节的随机会话签名秘密。 |
| `DATABASE_PATH` | SQLite 文件完整路径；生产建议 `/var/lib/baka-award-steam-film/steam-film.sqlite`。 |

在 PowerShell 中可生成随机会话秘密：

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Steam 登录使用 OpenID，不会向网站提交 Steam 密码。首次登录只会绑定 `STEAM_OWNER_ID`。SQLite 文件也会记住绑定的 SteamID；更改配置为另一个账号时，服务会拒绝登录，避免把已有档案交给新账号。

## Ubuntu + Nginx 独立部署

下面是新增 Steam Film 服务的部署准备。静态网站继续按[现有 Nginx 部署指南](deployment.md)运行。此处只新增自己的目录、systemd 单元和 Nginx 路由；不要改动 Steam-KaKaBase 的服务、数据库、端口、全局配置或防火墙。

### 1. 安装独立程序和数据目录

服务器需要 Node.js `22.12+`。先从项目目录把后端文件复制到临时位置：

```powershell
scp .\server\index.ts USER@SERVER:/tmp/steam-film-index.ts
```

在服务器安装隔离的程序、运行用户与私有数据目录：

```bash
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin baka-steam-film
sudo install -d -o root -g root -m 755 /opt/baka-award-steam-film/server
sudo install -o root -g root -m 644 /tmp/steam-film-index.ts /opt/baka-award-steam-film/server/index.ts
sudo install -d -o baka-steam-film -g baka-steam-film -m 700 /var/lib/baka-award-steam-film
```

若该专用用户或目录已经存在，不要重复创建或覆盖；先确认路径确实属于此服务。不要把 SQLite 文件放到 `/var/www`、`public` 或 `dist`。

### 2. 设置秘密环境变量

创建 `/etc/baka-award-steam-film.env`，填入上表的生产值：

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=8788
PUBLIC_ORIGIN=https://bakaaward.com
STEAM_OWNER_ID=你的17位SteamID64
STEAM_API_KEY=你的SteamWebAPIKey
SESSION_SECRET=至少32字节随机值
DATABASE_PATH=/var/lib/baka-award-steam-film/steam-film.sqlite
```

将环境文件权限限制为 root 可读。systemd 会在启动服务时读取它：

```bash
sudo chown root:root /etc/baka-award-steam-film.env
sudo chmod 600 /etc/baka-award-steam-film.env
```

### 3. 创建独立 systemd 服务

先确认 Node 路径：`command -v node`。以下单元假设路径为 `/usr/bin/node`；若命令输出不同，只改 `ExecStart` 中的 Node 可执行文件路径。

```ini
[Unit]
Description=BAKA AWARD Steam Film Archive API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=baka-steam-film
Group=baka-steam-film
WorkingDirectory=/opt/baka-award-steam-film
EnvironmentFile=/etc/baka-award-steam-film.env
ExecStart=/usr/bin/node --experimental-strip-types /opt/baka-award-steam-film/server/index.ts
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/baka-award-steam-film

[Install]
WantedBy=multi-user.target
```

保存为 `/etc/systemd/system/baka-award-steam-film.service`，再启动并查看本服务状态：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now baka-award-steam-film
sudo systemctl status baka-award-steam-film
sudo journalctl -u baka-award-steam-film -n 50 --no-pager
```

服务只绑定 loopback。不要为 `8788` 添加公网监听或开放防火墙端口。

### 4. 给现有站点增加专用 Nginx 路由

把下面的 `location` 块添加到 `bakaaward.com` 现有的 HTTPS `server {}` 中。保留现有静态站点、证书和路由配置：

```nginx
location ^~ /api/steam-film/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

配置检查通过后再重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

验证 `https://bakaaward.com/api/steam-film/status` 返回状态 JSON；未认证时不应包含 `gameCount` 或游戏列表。随后从网站的 Steam Film 页面使用绑定账号登录并手动同步。Steam 账号的“游戏详情”隐私需要允许读取。

### 5. 更新服务

新版本只替换 `/opt/baka-award-steam-film/server/index.ts` 并重启此独立服务。静态站点仍按部署指南更新 `dist/`。每次变更 systemd 或 Nginx 配置时先执行 `nginx -t` 或 `systemd-analyze verify`，再只重载对应服务。

SQLite 文件是私人数据。定期备份时使用 SQLite 的一致性备份功能，或先停止此 systemd 服务再复制数据库；运行中的 WAL 数据库不要只复制主 `.sqlite` 文件。

## 验证与限制

本地测试命令为 `npm test`，生产前端构建为 `npm run build`。Steam OpenID 身份验证和真实游戏库同步还需要有效的 Steam API Key、正确的 SteamID64、HTTPS 域名，以及 Steam 账号允许读取的游戏详情。没有这些服务器配置时，页面只提供清楚标记的样例交互。
