# 2026 图片放置说明

本届图片目录只留在本机；图片不会提交到 GitHub。请把获得授权、准备公开展示的图片放进对应文件夹，推荐使用 WebP。

```text
public/images/2026/
├─ guest/
│  └─ suika.webp
└─ games/
   ├─ 01/
   ├─ 02/
   └─ ...
```

主视觉目前由代码绘制星空、远方和小型宴席，人物以克制的剪影呈现；之后如果想换成自己的萃香插画，可将图片放入 `guest/suika.webp`，然后在 `src/data/2026.ts` 的 `guest` 对象中设置：

```ts
image: '/images/2026/guest/suika.webp',
```

奖项图片也在 `src/data/2026.ts` 的 `plannedAward(...)` 数据里补充。每个奖项可以设置封面和截图；图片在代码里的网址以 `/images/2026/` 开头，不要写 `public` 或本机磁盘路径。

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
