# BAKA AWARD

BAKA AWARD 是一个独立的个人年度游戏颁奖典礼网站，不代表任何媒体、组织或行业机构。网站以年度档案的形式记录游戏、嘉宾与个人回忆。

线上网站：[bakaaward.com](https://bakaaward.com)

## 技术栈

React、TypeScript、Vite。项目构建为静态网站，不需要数据库或后端服务。

## 本地运行

需要 Node.js `20.19+` 或 `22.12+`，以及 npm。

```bash
npm ci
npm run dev
```

生成生产文件并本地预览：

```bash
npm run build
npm run preview
```

构建结果位于 `dist/`，可发布到任意静态网站托管服务。

## 项目结构

```text
src/
├── components/   # 共用界面组件
├── data/          # 各年度奖项与典礼内容
├── layouts/       # 页面与奖项布局
├── pages/         # 首页、典礼页面
├── styles/        # 通用样式和年度视觉样式
├── themes/        # 年度主题配置
└── types.ts       # 数据类型
public/images/     # 本地图片资源
```

年度内容编辑入口为 `src/data/2025.ts` 和 `src/data/2026.ts`。图片添加说明：

- [2025 图片说明](public/images/2025/README.md)
- [2026 图片说明](public/images/2026/README.md)
- [品牌图片说明](public/images/branding/README.md)

图片文件由 `.gitignore` 排除，不会随代码上传到 GitHub。克隆项目后，如需还原完整画面，请自行添加拥有使用权的图片。

## 部署

构建后将 `dist/` 内容发布到静态 Web 服务器，并配置客户端路由回退到 `index.html`。Ubuntu + Nginx 部署步骤见[部署指南](docs/deployment.md)。

## 许可

项目目前没有附带开源许可证。公开仓库本身不授予他人复制、修改或再发布代码的许可；图片素材也不包含在仓库中，其使用权需由使用者自行确认。
