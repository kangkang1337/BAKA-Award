# BAKA AWARD

BAKA AWARD 是个人游戏年度颁奖与回顾网站，不代表任何媒体、组织或行业机构。网站使用 React、TypeScript 和 Vite 构建，可发布为静态站点。

线上网站：[bakaaward.com](https://bakaaward.com)

## 本地开发

需要 Node.js `20.19+` 或 `22.12+`。

```bash
npm ci
npm run dev
```

构建和预览：

```bash
npm run build
npm run preview
```

## Steam Film Archive

页面读取 `public/data/steam-film/` 中的静态 JSON。Steam 同步和历史快照在本机运行，不需要网站后端常驻，也不会由网页直接连接 Steam。配置与更新方法见[Steam Film Archive 指南](docs/steam-film-archive.md)。

生成的数据文件面向访客公开。每次发布前请检查 JSON 中的游戏资料，并确认愿意公开；本地 SQLite 数据库和 API Key 不应上传。

## 项目结构

```text
src/                 React 页面、组件、年度内容与样式
server/              Steam Film 本地同步、SQLite 快照与导出工具
public/data/          静态网站读取的数据文件
public/images/       本地图片资源（由 .gitignore 排除）
docs/                开发、Steam Film 与部署说明
```

年度内容位于 `src/data/`。图片文件不包含在 Git 仓库中；添加方式见各年度图片目录中的 README。

## 部署

构建 `dist/` 并将其内容发布到静态网站托管服务。Nginx 部署步骤见[部署指南](docs/deployment.md)。Steam Film 的 JSON 应与网站构建内容一起发布。

## 许可

项目目前没有附带开源许可证。公开仓库本身不授予复制、修改或再发布代码的许可；图片素材的使用权需由使用者自行确认。
