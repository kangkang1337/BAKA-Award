# BAKA AWARD 品牌图片

本机图片文件由 `.gitignore` 排除，不会上传到 GitHub；`dist` 构建时会正常复制它们。

## 文件位置

```text
public/images/branding/
├─ favicon-plush.png       # 整只娃娃的图标版，用作浏览器网站图标
└─ home-character.png      # 首页主视觉人物插画
```

若从 GitHub 克隆项目，请把自己的授权图片放进这个目录，并使用上面两个文件名；若换了文件名，也要同步修改 `index.html` 的 favicon 路径和 `src/pages/Home.tsx` 的插画路径。

首页插画在电脑端轻微上下浮动，在手机端降低透明度并缩小显示。系统开启“减少动态效果”时会停止浮动。
