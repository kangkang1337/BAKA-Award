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

## First Play Timeline

`/steam-film` 现在展示个人首次游玩时间轴。运行本地管理器：

```bash
npm run timeline:manage
```

它只监听 `127.0.0.1`，使用已有的 `var/steam-film-static.sqlite`，添加或确认记录后自动生成静态时间轴 JSON。小黑盒历史文件、导入原件与 SQLite 都留在被 Git 忽略的 `var/` 下。导入模板、字段和冲突处理见[时间轴指南](docs/first-play-timeline.md)。

首次游玩日期只取个人确认或导入的历史记录，不从 Steam 累计时长、成就、最后游玩时间或网站首次记录推断。加入时间轴的游戏和评语会在网站上公开。

## Steam Film Archive

Steam 同步和历史快照仍在本机运行，不需要网站后端常驻，也不会由网页直接连接 Steam。时间轴游戏可以匹配 Steam 档案封面与当前时长；未加入时间轴的游戏不会输出到公开档案。配置与同步方法见[Steam Film Archive 指南](docs/steam-film-archive.md)。

生成的数据文件面向访客公开。时间轴中的评语也会公开；本地 SQLite、原始导入文件、SteamID64 和 API Key 不应上传。

## 项目结构

```text
src/                 React 页面、组件、年度内容与样式
server/              Steam 本地同步、SQLite 快照、首次游玩管理与导出工具
public/data/          静态网站读取的数据文件
public/images/       本地图片资源（由 .gitignore 排除）
docs/                开发、Steam Film 与部署说明
```

年度内容位于 `src/data/`。图片文件不包含在 Git 仓库中；添加方式见各年度图片目录中的 README。

## 部署

构建 `dist/` 并将其内容发布到静态网站托管服务。Nginx 部署步骤见[部署指南](docs/deployment.md)。Steam Film 的 JSON 应与网站构建内容一起发布。

## 许可

项目目前没有附带开源许可证。公开仓库本身不授予复制、修改或再发布代码的许可；图片素材的使用权需由使用者自行确认。
