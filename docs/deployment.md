# 部署到 Ubuntu + Nginx

本项目是静态网站：在本机运行 Vite 构建，再将 `dist/` 上传到服务器。以下命令中的服务器用户名和 IP 都是占位符。

## 首次部署

### 1. 在本机构建并上传

在项目根目录的 PowerShell 中运行：

```powershell
$Server = "USER@SERVER_IP"
npm ci
npm run build
ssh $Server "mkdir -p /tmp/baka-award"
scp -r .\dist "${Server}:/tmp/baka-award/"
```

### 2. 在服务器安装并发布

SSH 登录服务器：

```powershell
ssh USER@SERVER_IP
```

在 Ubuntu 终端运行：

```bash
sudo apt update
sudo apt install -y nginx rsync
sudo mkdir -p /var/www/baka-award
sudo rsync -a --delete /tmp/baka-award/dist/ /var/www/baka-award/
sudo chown -R www-data:www-data /var/www/baka-award
sudo chmod -R 755 /var/www/baka-award
```

### 3. 配置 Nginx

先在域名 DNS 管理页面添加指向服务器公网 IP 的 A 记录，然后在服务器创建站点配置：

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

`try_files ... /index.html` 用于客户端路由回退，确保直接打开或刷新 `/2025`、`/2026` 时不会出现 404。若启用了 UFW 防火墙，放行 Web 流量：

```bash
sudo ufw allow 'Nginx Full'
```

确认域名可通过 HTTP 访问后，为网站启用 HTTPS：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bakaaward.com
sudo certbot renew --dry-run
```

## 后续更新

在本机项目根目录重新构建并上传：

```powershell
$Server = "USER@SERVER_IP"
npm run build
scp -r .\dist "${Server}:/tmp/baka-award/"
```

然后 SSH 登录服务器，将新文件同步到网站目录：

```bash
sudo rsync -a --delete /tmp/baka-award/dist/ /var/www/baka-award/
sudo chown -R www-data:www-data /var/www/baka-award
```

无需重启 Nginx。`--delete` 会移除网站目录中不属于新版本的旧文件，因此 `/var/www/baka-award` 应只用于本网站。上传目录 `/tmp/baka-award/` 也专供本项目使用。
