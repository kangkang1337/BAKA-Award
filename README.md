# BAKA AWARD

BAKA AWARD 是一个独立的个人年度游戏颁奖网站，不代表任何媒体、组织或行业机构。项目使用 React、TypeScript 和 Vite 构建为静态网站，不需要数据库、后端服务或 Steam / KaKaBase API。

线上网站：[bakaaward.com](https://bakaaward.com)

## 环境要求

- Node.js `20.19+` 或 `22.12+`
- npm（随 Node.js 安装）

## 本地运行

在项目根目录运行：

```sh
npm ci
npm run dev
```

终端会显示本地预览地址，通常是 `http://localhost:5173`。首页是年度档案馆；点击 2025 档案进入颁奖页面。开发服务器支持直接访问 `/2025`。

生成生产部署文件：

```bash
npm run build
```

构建结果在 `dist/`。将 `dist` 内容放到普通静态 Web 服务器即可。如果服务器不自动处理 SPA 路由，请配置未知路径回退到 `index.html`，以便刷新 `/2025` 时仍能打开典礼页。

## 上传到 GitHub

GitHub 适合保存源代码、记录每次修改，也能作为项目备份。建议先建立 **Private（私有）仓库** 做备份；之后若想公开，再检查图片和许可后改成 Public。

1. 在 GitHub 新建一个空仓库，例如 `baka-award`。因为本地已有 README，不要勾选自动创建 README、`.gitignore` 或 License。
2. 在 PowerShell 进入项目根目录，先检查忽略规则和准备上传的文件：

```powershell
cd C:\path\to\2_baka_award
git init -b main
git status --short --ignored
git check-ignore -v node_modules dist .env
```

`node_modules/`、`dist/` 和本机 `.env` 应显示为忽略项。检查列表中没有密码、密钥或其他不想上传的文件后，再暂存并提交：

```powershell
git add .
git status --short
git diff --cached --stat
git commit -m "Initial BAKA AWARD website"
git remote add origin https://github.com/GITHUB_NAME/baka-award.git
git push -u origin main
```

将 `GITHUB_NAME` 换成自己的 GitHub 用户名。以后修改项目时，用 `git add .`、`git commit -m "说明本次修改"` 和 `git push` 保存更新。GitHub 登录时按提示使用浏览器认证或 SSH key；不要把令牌、密码或私钥粘贴进 README、源码或命令行历史。

### 公开仓库前的安全与版权检查

- `.gitignore` 会排除依赖目录、构建文件、本机环境文件和常见私钥格式；它只对**尚未跟踪**的文件生效。提交前仍要检查 `git status` 和 `git diff --cached`。如果密钥曾经提交过，仅删除文件还不够，需要撤销并轮换该密钥。
- `package.json` 的 `private: true` 只防止误发布到 npm，**不代表 GitHub 仓库是私有的**。在 GitHub 建仓时要明确选 Private 或 Public。
- `.gitignore` 会排除 `public/images/` 下的图片文件，只保留 `.gitkeep` 文件夹标记和图片说明文档。本机的图片不会被删除，仍可照常构建和部署；从 GitHub 克隆项目后，需要自行补入获准使用的图片才能还原完整画面。
- 当前网站素材包含游戏截图和角色图片；网站本身已经公开展示它们，但这不等同于拥有再发布许可。公开仓库只包含代码和空图片目录，可以减少在 GitHub 再发布图片文件。
- 项目没有附带开源 License。仓库设为 Public 不会自动授予他人复制、修改或再发布代码的许可；要明确允许复用时，再选择合适的 License。
- 上传源代码到 GitHub 不会自动更新 `bakaaward.com`。网站仍按下方部署流程，将新构建的 `dist/` 上传到服务器。

## 部署到 Ubuntu + Nginx

网站当前部署在 Ubuntu + Nginx，域名为 `bakaaward.com`。网站是静态文件：在 Windows 电脑上构建，再把 `dist` 上传到服务器；服务器不需要安装 Node.js，也不需要运行后端进程。下面的 SSH 用户名和 IP 都使用占位符，避免把服务器登录信息写进公开仓库。

> 以下命令中的 Windows 部分在项目根目录的 PowerShell 中执行；标注为“服务器”的命令在 SSH 登录后的 Ubuntu 终端中执行。不要把 SSH 密码或私钥写进 README。

### 1. 在电脑上构建并上传

打开 PowerShell，进入项目目录并构建：

```powershell
cd C:\path\to\2_baka_award
$Server = "USER@SERVER_IP"
npm ci
npm run build
ssh $Server "mkdir -p /tmp/baka-award"
scp -r .\dist "${Server}:/tmp/baka-award/"
```

`npm run build` 会生成 `dist/`。`scp` 会把它上传到服务器的 `/tmp/baka-award/dist/`。

### 2. 首次部署：在服务器安装 Nginx 并发布文件

SSH 登录服务器：

```powershell
ssh USER@SERVER_IP
```

登录后，在 Ubuntu 服务器终端运行：

```bash
sudo apt update
sudo apt install -y nginx rsync
sudo mkdir -p /var/www/baka-award
sudo rsync -a --delete /tmp/baka-award/dist/ /var/www/baka-award/
sudo chown -R www-data:www-data /var/www/baka-award
sudo chmod -R 755 /var/www/baka-award
```

### 3. 配置 Nginx 路由

先在域名 DNS 管理页面添加 A 记录：主机名 `@`，目标为服务器公网 IP。DNS 生效后，在服务器创建 Nginx 站点配置：

```bash
sudo tee /etc/nginx/sites-available/baka-award > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name bakaaward.com;

    root /var/www/baka-award;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

sudo ln -sfn /etc/nginx/sites-available/baka-award /etc/nginx/sites-enabled/baka-award
sudo nginx -t
sudo systemctl reload nginx
```

`try_files ... /index.html` 是单页应用路由回退配置，确保直接打开或刷新 `/2025` 不会得到 404。若启用了 UFW 防火墙，请放行 Web 流量：

```bash
sudo ufw allow 'Nginx Full'
```

浏览器打开 `http://bakaaward.com`，检查首页和 `http://bakaaward.com/2025`。确认域名已经指向服务器且 80/443 端口可以访问后，在服务器启用 HTTPS：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bakaaward.com
sudo certbot renew --dry-run
```

证书签发成功后，通过 `https://bakaaward.com` 访问网站。

### 4. 后续更新已部署的网站

每次修改项目后，在 Windows PowerShell 的项目根目录重新构建并上传：

```powershell
cd C:\path\to\2_baka_award
$Server = "USER@SERVER_IP"
npm run build
scp -r .\dist "${Server}:/tmp/baka-award/"
```

然后 SSH 登录服务器：

```powershell
ssh USER@SERVER_IP
```

在服务器终端发布新文件：

```bash
sudo rsync -a --delete /tmp/baka-award/dist/ /var/www/baka-award/
sudo chown -R www-data:www-data /var/www/baka-award
```

无需重启 Nginx；浏览器强制刷新页面即可看到更新。`--delete` 会清理网站目录中已从新版本 `dist/` 移除的旧文件，因此 `/var/www/baka-award` 必须只用于本网站。上传目录 `/tmp/baka-award/` 也专供本项目使用。

## 添加或更改游戏图片

图片操作的完整步骤、Windows 文件夹位置、路径示例和故障检查见 [2025 图片添加说明](public/images/2025/README.md)。

图片文件放在 `public/images/2025/games/` 下；比如：

```text
public/images/2025/games/expedition-33/
├─ cover.jpg
├─ scene-01.jpg
└─ scene-02.webp
```

然后编辑 `src/data/2025.ts`，在对应奖项 `award(...)` 调用的游戏名和 Guest 短评后添加图片配置对象：

路径从 `/images/2025/...` 开始，不写 `public` 或 Windows 磁盘路径。每奖最多展示三张静态图。替换图片时可以覆盖同名文件；改文件名或目录时，记得同步修改路径。为减少等待，建议使用 WebP，并将游戏截图控制在最长边 1920 像素以内、Guest 照片控制在 1200 像素以内；2025 图片添加说明里有更多细节。

## 编辑 Guest 和短评

在同一个 `src/data/2025.ts` 文件内编辑 `guest`：

```ts
guest: {
  name: '角色名称',
  displayName: '页面显示名',
  image: '/images/2025/guest/portrait.webp',
  theme: '本届主题说明',
  introduction: 'Guest 介绍',
  comments: {
    goty: '对应年度游戏奖的短评',
    gameplay: '对应最佳游戏性奖的短评',
  },
},
```

默认角色图放入 `public/images/2025/guest/`，并在 `guest.image` 中填写路径。每个奖项可在图片配置对象中指定自己的评委照片：

```ts
{
  cover: '/images/2025/games/game-name/cover.webp',
  screenshots: ['/images/2025/games/game-name/scene-01.jpg'],
  guestImage: '/images/2025/guest/gameplay.webp',
}
```

如果图片配置里不填 `guestImage`，该奖项会沿用本届 Guest 的默认图片。具体示例见图片添加说明。

2025 的每段泉此方短评填写在对应奖项的 `guestComment` 字段中，支持用空行分段；长短评可在页面中滚动阅读。

每届只应设置一名 Guest，且 Guest 不应获得该年度奖项。当前页面的数据不会自动替你检查这条规则。

## 奖项与版式

奖项定义集中在 `src/data/2025.ts`，共用组件在 `src/layouts/AwardStage.tsx`。每个奖项的数据包含 ID、编号、标题、中英文副标题、说明、版式、获奖游戏和可选短评。不要把年度内容写进组件。

目前 10 个固定奖项各有版式，`special` 专用于正式颁奖后的 After Show 特别奖：

| 版式 | 视觉方向 |
| --- | --- |
| `hero` | 年度大奖，主视觉与叠层短评 |
| `split` | 动态分屏 |
| `editorial` | 杂志式图文排版 |
| `image` | 图片主导，文字压在画面上 |
| `minimal` | 留白、横向图片与居中短评 |
| `gallery` | 多图画廊 |
| `chaos` | 错位、倾斜拼贴 |
| `time` | 阶梯式时间感构图 |
| `reveal` | 大小图揭晓式构图 |
| `warm` | 温暖的个人化构图 |
| `special` | After Show 彩蛋式特别奖 |

短评的位置会根据版式变化；移动端会排回图片和获奖信息下方，长文可在短评区域内滚动阅读。要调整各版式，可编辑 `src/styles/award-layouts.css`；2025 年颜色、字体和视觉覆盖分别在 `src/themes/2025.ts` 与 `src/styles/theme-2025.css`。

特别奖不是固定类别：没有特别奖时保留 `specialAward: null`；需要时只填一个 Award 数据对象。

2025 的出场顺序是：最佳游戏性、最佳叙事、最佳艺术设计、最佳音乐、最佳独立游戏、我们需要攻略奖、再玩五分钟奖、意外之喜奖、我就是喜欢奖、BAKA年度游戏；泉此方认证特别奖作为 After Show 彩蛋排在年度游戏之后。年度游戏进入时会播放一次全屏丝带效果：长丝带从中心向画面四周伸展并飘散；手机端减少丝带数量，系统开启“减少动态效果”时会关闭动画。

## 项目结构

```text
src/
├── components/       # 品牌与 Guest 等共用部件
├── data/2025.ts      # 2025 年度内容
├── layouts/          # 奖项舞台布局
├── pages/            # 首页与 Ceremony 页面
├── styles/           # 通用样式与奖项视觉
├── styles/theme-2025.css # 2025 年视觉主题覆盖
├── themes/2025.ts    # 2025 年主题
└── types.ts          # 年度、Guest、Award、Game 类型
public/images/2025/   # 手动提供的本地图片
```
