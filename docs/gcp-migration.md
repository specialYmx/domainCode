# DomainCode GCP 迁移执行文档

这份文档用于把当前 `domainCode` 项目从 Zeabur 迁移到一台 GCP VM。目标读者是 GCP 机器上的 Codex 或维护人员，可以按本文直接执行部署。

## 项目概况

- 项目名：`domainCode`
- 仓库：`https://github.com/specialYmx/domainCode.git`
- 技术栈：Nuxt 3 + Nitro Node Server + Docker
- 运行端口：容器内 `8080`
- 功能：通过 IMAP 读取 QQ 邮箱里的验证码邮件，按租户 `recipients` 过滤展示验证码。
- 管理页：`/admin`
- 主页面：`/`

核心数据不是数据库，而是租户配置 JSON：

```text
/data/tenants.json
```

Zeabur 当前有持久盘挂载到 `/data`，迁移时必须把 Zeabur 的 `/data/tenants.json` 带到 GCP，否则已有租户和访问码会丢失。

## 需要准备的信息

在 GCP 机器部署前，先准备这些值。不要把真实密钥提交到 Git。

```env
EMAIL_HOST=imap.qq.com
EMAIL_PORT=993
EMAIL_USER=1355628444@qq.com
EMAIL_PASS=QQ邮箱IMAP授权码

ALLOWED_SENDERS=noreply@tm.openai.com,otp@tm1.openai.com
ALLOWED_SENDER_DOMAINS=tm.openai.com,tm1.openai.com
ALLOW_ANY_SENDER=false
IMAP_IDLE=true
IMAP_SINCE_HOURS=3

SESSION_SECRET=32位以上随机字符串
ADMIN_ACCESS_KEY=后台管理密钥
TENANT_CONFIG_PATH=/data/tenants.json
```

说明：

- `EMAIL_PASS` 是 QQ 邮箱 IMAP 授权码，不是 QQ 邮箱登录密码。
- `TENANT_CONFIG_PATH` 在 GCP Docker 部署里建议固定为 `/data/tenants.json`。
- 如果临时排查收不到历史邮件，可以把 `IMAP_SINCE_HOURS` 临时改成 `24`，确认后再改回 `3`。
- 当前代码已兼容 DuckDuckGo Email Protection 转发，会把类似 `noreply_at_tm.openai.com_xxx@duck.com` 的发件人还原成 `noreply@tm.openai.com` 再匹配白名单。

## 给 GCP 上 Codex 的提示词

把下面这段发给 GCP 机器上的 Codex：

```text
请把 domainCode 项目部署到当前 GCP VM。

项目仓库：https://github.com/specialYmx/domainCode.git

要求：
1. 使用 Docker Compose 部署。
2. 服务容器名用 domaincode。
3. 容器内端口是 8080，先映射到宿主机 8080。
4. 使用仓库自带 Dockerfile 构建。
5. 在项目目录创建 .env，填入我提供的环境变量。
6. 创建 data 目录，并把我提供的 tenants.json 放到 ./data/tenants.json。
7. docker-compose.yml 里把 ./data 挂载到容器 /data。
8. TENANT_CONFIG_PATH 必须是 /data/tenants.json。
9. 启动后检查 docker logs，确认没有 IMAP 登录错误、TENANT_CONFIG_PATH not found、端口占用错误。
10. 最后告诉我访问地址：http://服务器公网IP:8080 和 http://服务器公网IP:8080/admin。

不要把 .env、tenants.json 或任何密钥提交到 Git。
```

## GCP VM 基础安装

如果服务器还没有 Docker，Ubuntu/Debian 可以执行：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

执行完 `usermod` 后，重新登录 SSH，让 Docker 用户组生效。

确认 Docker 可用：

```bash
docker --version
docker compose version
```

## 拉取代码

```bash
cd ~
git clone https://github.com/specialYmx/domainCode.git
cd domainCode
```

如果目录已存在，更新代码：

```bash
cd ~/domainCode
git pull origin main
```

## 创建环境变量

在项目根目录创建 `.env`：

```bash
nano .env
```

内容模板：

```env
EMAIL_HOST=imap.qq.com
EMAIL_PORT=993
EMAIL_USER=1355628444@qq.com
EMAIL_PASS=替换成QQ邮箱IMAP授权码

ALLOWED_SENDERS=noreply@tm.openai.com,otp@tm1.openai.com
ALLOWED_SENDER_DOMAINS=tm.openai.com,tm1.openai.com
ALLOW_ANY_SENDER=false
IMAP_IDLE=true
IMAP_SINCE_HOURS=3

SESSION_SECRET=替换成32位以上随机字符串
ADMIN_ACCESS_KEY=替换成后台管理密钥
TENANT_CONFIG_PATH=/data/tenants.json
```

建议限制权限：

```bash
chmod 600 .env
```

## 迁移租户数据

创建数据目录：

```bash
mkdir -p data
```

把 Zeabur 的 `/data/tenants.json` 内容复制到：

```text
~/domainCode/data/tenants.json
```

可以用 `nano` 粘贴：

```bash
nano data/tenants.json
```

确认文件存在并是合法 JSON：

```bash
test -s data/tenants.json && echo "tenants.json exists"
node -e "JSON.parse(require('fs').readFileSync('data/tenants.json','utf8')); console.log('valid json')"
```

## 创建 Docker Compose 配置

在项目根目录创建 `docker-compose.yml`：

```yaml
services:
  domaincode:
    build: .
    container_name: domaincode
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
```

## 启动服务

```bash
docker compose up -d --build
docker logs -f domaincode
```

正常情况下，服务会监听：

```text
http://服务器公网IP:8080
http://服务器公网IP:8080/admin
```

## GCP 防火墙

如果直接用公网 IP 加 `8080` 访问，需要在 GCP 防火墙放行 TCP `8080`。

建议后续改成域名 + HTTPS，只开放 `80/443`，由 Nginx 或 Caddy 反代到本机 `8080`。

## 验证清单

部署完成后逐项检查：

- `docker ps` 能看到 `domaincode` 容器处于 `Up` 状态。
- `docker logs domaincode` 没有 `TENANT_CONFIG_PATH not found`。
- `docker logs domaincode` 没有 QQ 邮箱 IMAP 登录失败。
- 浏览器能打开 `/admin`。
- `/admin` 用 `ADMIN_ACCESS_KEY` 能验证成功。
- 主页面用已有访问码能登录。
- 新触发一封 ChatGPT/OpenAI 验证码后，主页面能看到验证码。
- DuckDuckGo 转发地址必须作为租户邮箱存在于 `data/tenants.json` 的 `recipients` 里，例如：

```json
[
  {
    "id": "sale_knelt_wimp_contest_duck",
    "displayName": "knelt-wimp-contest@duck.com",
    "recipients": ["knelt-wimp-contest@duck.com"],
    "accessKeyHash": "sha256_hash_here",
    "enabled": true
  }
]
```

## 常见问题

### 页面打开但没有验证码

先确认：

- 邮件是否真的进入 `EMAIL_USER` 对应邮箱的收件箱。
- 租户 `recipients` 是否是邮件头里的真实 `To` 地址，而不是最终转发邮箱。
- DuckDuckGo 转发时，租户里应填 `xxx@duck.com`。
- 新邮件是否在 `IMAP_SINCE_HOURS` 时间范围内。

### 后台新增租户后重启丢失

通常是没有挂载数据目录。确认 `docker-compose.yml` 有：

```yaml
volumes:
  - ./data:/data
```

并且 `.env` 有：

```env
TENANT_CONFIG_PATH=/data/tenants.json
```

### 端口无法访问

检查：

```bash
docker ps
docker logs domaincode
sudo ss -lntp | grep 8080
```

同时确认 GCP 防火墙放行了 TCP `8080`。

### 更新代码

```bash
cd ~/domainCode
git pull origin main
docker compose up -d --build
docker logs -f domaincode
```

## 后续建议

生产环境建议用域名和 HTTPS。可以用 Caddy 简化配置：

```caddyfile
your-domain.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

然后 GCP 防火墙只放行 `80` 和 `443`，不要直接暴露 `8080`。
