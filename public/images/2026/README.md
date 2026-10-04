# 2026 图片放置说明

本届图片目录只留在本机；图片不会提交到 GitHub。请把获得授权、准备展示的图片放进对应文件夹，推荐使用 WebP。文件名已在 `src/data/2026.ts` 预留，按下面的名称保存后无需再改代码。

```text
public/images/2026/
├─ guest/
│  ├─ 00.webp    # 嘉宾开场介绍图
│  ├─ 01.webp    # 奖项 01 的嘉宾照片
│  ├─ 02.webp    # 奖项 02 的嘉宾照片
│  ├─ ...
│  └─ 16.webp    # 奖项 16 的嘉宾照片
└─ games/
   ├─ 01/
   │  ├─ 01.webp  # 奖项 01 游戏截图 1
   │  ├─ 02.webp  # 奖项 01 游戏截图 2
   │  └─ 03.webp  # 奖项 01 游戏截图 3（若有）
   ├─ 02/
   │  ├─ 01.webp  # 奖项 02 游戏截图 1
   │  └─ 02.webp  # 奖项 02 游戏截图 2
   ├─ ...
   └─ 16/
      ├─ 01.webp  # 奖项 16 游戏截图 1
      ├─ 02.webp  # 奖项 16 游戏截图 2
      ├─ 03.webp  # 奖项 16 游戏截图 3
      └─ 04.webp  # 奖项 16 游戏截图 4
```

`guest/00.webp` 用在颁奖典礼的嘉宾介绍页；`guest/01.webp`–`guest/16.webp` 分别对应 16 个奖项页面。编号 `01`–`15` 是年度奖项，`16` 是嘉宾特别奖。各奖项根据 `src/data/2026.ts` 里的清单显示 2–4 张；比如奖项 03 使用：

```ts
guestImage: '/images/2026/guest/03.webp',
winner: {
  screenshots: [
    '/images/2026/games/03/01.webp',
    '/images/2026/games/03/2.webp',
  ],
},
```

奖项顺序、截图文件名和对应作品在 `src/data/2026.ts`。奖项 03 的第二张文件沿用现有名称 `2.webp`；奖项 16 使用 `01.webp`–`04.webp` 四张。图片会保留完整画面和原始比例，不会裁切填满框。上传其他格式时需同步改扩展名和代码路径。代码引用使用 `/images/2026/` 开头的网页路径，不要写 `public` 或本机磁盘路径。图片未放入前会显示原来的嘉宾剪影和奖项占位画面，缺图不会显示破图图标。

添加或替换图片后运行 `npm run build`，Vite 会将本机图片放入 `dist/images/2026/`。图片遵循根目录 `.gitignore`，只会出现在本机和实际部署文件中，不会随源代码推送到 GitHub。

## 2026 EX: MOBILE 图片

手机游戏番外的图片单独放在 `ex-mobile/`，按唯和奖项编号分文件夹：

```text
public/images/2026/ex-mobile/
├─ yui/   # 平泽唯出场图片与照片
├─ 1/     # 最佳陪伴：《异环》
├─ 2/     # 最佳立绘：《StarSavior》
├─ 3/     # 最佳摸鱼：《Ancient Gods》
├─ 4/     # 最会送东西：《异域战记》
├─ 5/     # 最佳剧情 / 美术：《Reverse:1999》
├─ 6/     # 最有信仰：《东方LostWord》
└─ 7/     # MOBILE GAME OF THE YEAR：《终末地》
```

把图片文件放进对应文件夹后，在 `src/data/2026-mobile-ex.ts` 里编辑对应的 `images` 数组。网页路径以 `/images/` 开头，不写 `public` 或本机磁盘路径：

```ts
images: [
  '/images/2026/ex-mobile/2/portrait.webp',
  '/images/2026/ex-mobile/2/screenshot.jpg',
],
```

平泽唯的图片填写在 `mobileExGuest.images` 数组。第一项始终作为出场图片；现在第一项是 `yui/d0411a877362475ac8ec426fbad6651c684d593f13668-PCKL1i_fw1200webp.webp`。进入番外时，其余图片会随机排序，出场后可以用图片两侧的箭头切换。每个奖项的评语卡片也会显示一张唯的照片。

文件名可以保留空格；写在 TypeScript 网址中时将空格写成 `%20`，例如 `download%20(1).jpg`。每个普通奖项使用对应编号文件夹中的单张主图，页面会按原比例完整显示。终末地的 `7/` 文件夹可以放三张：`images` 数组第一张作为手机里的主画面，后两张作为旁边的旅行记录图展示，不会压住手机画面或页面导航。

这些图片仍由根目录 `.gitignore` 排除，只保存在本机。运行 `npm run build` 后，本地打包的 `dist/images/2026/ex-mobile/` 会带上这些图片，可用于部署；GitHub 源码仓库不会包含它们。
