# 2025 图片：放置位置与添加方法

这份说明专门讲图片。先记住两点：**把图片文件放进 `public/images/2025/`，再到 `src/data/2025.ts` 填它的网址路径。只放文件还不会显示在页面上。**

> **GitHub 仓库说明：**出于图片来源和授权不确定的考虑，仓库只保留本目录、说明文档和 `.gitkeep` 文件，不提交图片本身。当前电脑上的图片文件仍保留在原处，`npm run build` 和服务器部署照常会包含这些本地图片；从 GitHub 克隆项目后，需要自行放入有权使用的图片，页面才会显示完整图片。

## 应该打开哪个文件夹

在 Windows 文件资源管理器里打开项目文件夹，然后按顺序进入：

```text
2_baka_award
└─ public
   └─ images
      └─ 2025
         ├─ guest    ← Guest 和评委头像
         └─ games    ← 获奖游戏图片
```

这里的 `2_baka_award` 是项目根目录，里面能看到 `package.json`、`src`、`public` 等文件夹。你要把图片复制到 **`public/images/2025/` 下面**，不要放进 `src`，也不要放进 `dist`。

如果还没有 `games` 文件夹，就在 `2025` 文件夹里右键 → **新建 → 文件夹**，命名为 `games`。然后在 `games` 里为每款游戏新建一个文件夹。也可以在项目根目录的 PowerShell 运行：

```powershell
New-Item -ItemType Directory -Force .\public\images\2025\games
```

## 给获奖游戏添加图片

### 1. 复制图片文件

例如，给“最佳艺术设计”的《光与影：33号远征队》添加图片，可以按下面的结构放置：

```text
public/images/2025/games/expedition-33/
├─ cover.jpg
├─ scene-01.jpg
└─ scene-02.webp
```

`expedition-33` 和文件名可以自己取。建议使用英文、数字和连字符，避免空格；支持静态 `.jpg`、`.jpeg`、`.png`、`.webp` 图片。

为了缩短加载等待，**优先使用 WebP**：游戏截图最长边建议不超过 1920 像素，Guest 照片不超过 1200 像素，画质可设为 80–85。普通 JPG/PNG 也能显示，但大文件会让页面和部署包变大。本机现有的 2025 图片已生成对应 WebP 版本供网站加载，原图保留在旁边；这些图片文件都受 `.gitignore` 保护，不会随代码推送到 GitHub。

### 2. 在年度数据中填入路径

用代码编辑器打开项目里的：

```text
src/data/2025.ts
```

搜索 `最佳艺术设计` 或 `'art'`，找到该奖项对应的 `award(...)`。在游戏名和短评后面添加图片配置：

```ts
      '《光与影：33号远征队》',
      `这里保留该奖项原有的泉此方短评。`,
      {
        cover: '/images/2025/games/expedition-33/cover.jpg',
        screenshots: [
          '/images/2025/games/expedition-33/scene-01.jpg',
          '/images/2025/games/expedition-33/scene-02.webp',
        ],
      },
```

只放一张图时，填写 `cover` 即可；多张图时可继续在 `screenshots` 列表中添加路径。每个奖项目前最多展示三张图，页面会按该奖项的版式排图。

**路径写法要照抄这个格式：**磁盘上的 `public/images/2025/games/expedition-33/cover.webp`，在代码中对应 `/images/2025/games/expedition-33/cover.webp`。开头要有 `/images`，不要写 `public`、`C:\Users\...` 或反斜杠 `\`。文件名和扩展名必须与实际文件完全一致。

### 3. 给不同奖项配不同的评委照片（可选）

把评委照片复制到 `public/images/2025/guest/`，然后在同一个图片配置对象中添加 `guestImage`：

```ts
      {
        cover: '/images/2025/games/expedition-33/cover.jpg',
        screenshots: ['/images/2025/games/expedition-33/scene-01.jpg'],
        guestImage: '/images/2025/guest/art-jury.jpg',
      },
```

不填 `guestImage` 时，该奖项会沿用本届 Guest 的默认照片。默认照片在同一文件的 `guest.image` 字段设置：

```ts
image: '/images/2025/guest/portrait.jpg',
```

## 如何更改或移除图片

- **更换图片但保留文件名：**直接用新图片覆盖 `public` 里的旧文件，代码路径不用改。
- **更换了文件名或文件夹：**把 `src/data/2025.ts` 中对应的路径也改成新名称。
- **移除一张截图：**从该奖项的 `screenshots` 列表中删掉那一行；想移除全部获奖图时，删除整个图片配置对象即可，页面会显示典礼的静态占位构图。
- **只想换 Guest 或某个奖项的评委照片：**改 `guest.image` 或对应奖项的 `guestImage`，游戏图片路径不用动。

## 保存后怎么确认图片显示

本地运行时，在项目根目录执行：

```powershell
npm run dev
```

打开终端显示的本地地址，进入 2025 典礼。保存 `2025.ts` 后页面通常会自动刷新。若图片没出现，可以把图片路径直接放进浏览器地址栏检查，例如：

```text
http://localhost:5173/images/2025/games/expedition-33/cover.webp
```

浏览器能单独打开图片，路径就正确；若显示 404，请核对文件是否放在 `public/images/2025/`、文件名与扩展名大小写是否相同，以及代码路径是否以 `/images/2025/` 开头。

发布网站时，在项目根目录运行：

```powershell
npm run build
```

Vite 会自动把 `public/images/2025/` 的图片复制到 `dist/images/2025/`。部署时上传新生成的 `dist` 即可；不要手动把图片再复制一份到 `dist`。
