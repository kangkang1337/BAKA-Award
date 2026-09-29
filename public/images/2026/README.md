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
