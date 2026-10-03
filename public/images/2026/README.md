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

EX 番外使用单独目录，避免和 2026 正篇素材混在一起：

```text
public/images/2026/ex-mobile/
├─ yui.png
├─ 01-companion.webp
├─ 02-portrait.webp
├─ 03-idle.webp
├─ 04-gifts.webp
├─ 05-story.webp
├─ 06-rooted.webp
└─ 07-mobile-game-of-the-year.webp
```

开场桌面和各奖项已经有不依赖图片的插画式占位。要替换时，将本地图片放入上面的目录，并在 `src/data/2026-mobile-ex.ts` 对应项填写路径，例如：

```ts
image: '/images/2026/ex-mobile/02-portrait.webp',
```

图片路径以 `/images/` 开头，不包含 `public`。平泽唯图片填写在 `mobileExGuest.image`；像剧情 / 美术页需要两张图时，填写 `images` 数组。角色立绘建议用透明 PNG/WebP，页面会完整显示，不会裁掉人物。缺图时会继续显示可替换的提示占位。

这些图片仍按根目录 `.gitignore` 只保存在本机；本地打包后部署时，`dist/images/2026/ex-mobile/` 会包含它们。
