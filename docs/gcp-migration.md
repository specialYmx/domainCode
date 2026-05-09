# DomainCode GCP 迁移执行文档

这份文档用于把 `domainCode` 从 Zeabur 迁移到一台 GCP VM。可以直接发给 GCP 机器上的 Codex，让它按步骤部署。

重要原则：

- 不要把 `.env`、`data/tenants.json`、邮箱授权码、后台密钥提交到 Git。
- 当前仓库 `.gitignore` 已经排除了 `.env` 和 `data/tenants.json`。
- 迁移成败最关键的是两个东西：环境变量和 `/data/tenants.json`。

## 项目概况

- 项目名：`domainCode`
- GitHub 仓库：`https://github.com/specialYmx/domainCode.git`
- 技术栈：Nuxt 3 + Nitro Node Server + Docker
- 容器内端口：`8080`
- 主页面：`/`
- 管理页：`/admin`
- 功能：通过 IMAP 读取 QQ 邮箱收件箱里的验证码邮件，按租户 `recipients` 分配验证码。

核心数据不是数据库，而是租户配置文件：

```text
/data/tenants.json
```

Zeabur 当前挂载盘是 `/data`，所以必须把 Zeabur 的 `/data/tenants.json` 迁移到 GCP。否则服务能启动，但已有客户邮箱、租户和访问码都会丢失。

## 需要你提供的东西

把下面这些准备好，交给 GCP 机器上的 Codex 或部署人员。真实值不要写进 Git。

### 必须提供

```text
1. GCP VM 的公网 IP
2. GCP VM 的 SSH 登录方式
3. QQ 邮箱 IMAP 账号：EMAIL_USER
4. QQ 邮箱 IMAP 授权码：EMAIL_PASS
5. Zeabur 的 /data/tenants.json 文件内容
6. 后台管理密钥：ADMIN_ACCESS_KEY
7. Session 签名密钥：SESSION_SECRET
```

如果没有现成的 `SESSION_SECRET`，可以在 GCP 机器上生成一个新的：

```bash
openssl rand -hex 32
```

如果没有现成的 `ADMIN_ACCESS_KEY`，也可以生成一个新的。但改了 `ADMIN_ACCESS_KEY` 只影响 `/admin` 管理页登录，不影响已有客户访问码。

### 可选提供

```text
1. 要绑定的域名，例如 code.example.com
2. 是否需要 HTTPS
3. 是否先临时开放 8080 端口
4. 是否要用 Caddy/Nginx 反代
```

### 不需要提供

```text
1. GitHub 密码
2. QQ 邮箱登录密码
3. OpenAI/ChatGPT 账号密码
```

`EMAIL_PASS` 必须是 QQ 邮箱的 IMAP 授权码，不是 QQ 登录密码。

## 线上环境变量模板

在 GCP 项目目录创建 `.env`，内容如下。把占位符替换成真实值。

### Zeabur 当前变量迁移摘要

下面是 Zeabur 线上变量里对 GCP 迁移有用的部分。真实密钥不要写进本文档或提交到 Git，迁移时只写入 GCP 服务器上的 `.env`。

| 变量 | GCP 上建议值 | 说明 |
| --- | --- | --- |
| `EMAIL_HOST` | `imap.qq.com` | QQ 邮箱 IMAP 地址 |
| `EMAIL_PORT` | `993` | IMAP SSL 端口 |
| `EMAIL_USER` | `1355628444@qq.com` | 当前主收信邮箱 |
| `EMAIL_PASS` | 使用 Zeabur 当前值 | QQ 邮箱 IMAP 授权码，不能用 QQ 登录密码 |
| `ALLOWED_SENDERS` | `noreply@tm.openai.com,otp@tm1.openai.com,ymx19960516@gmail.com` | 发件人白名单 |
| `ALLOWED_SENDER_DOMAINS` | `tm.openai.com,tm1.openai.com` | 发件域白名单 |
| `IMAP_IDLE` | `true` | 开启 IMAP 实时监听 |
| `SESSION_SECRET` | 使用 Zeabur 当前值，或重新生成 | 会话签名密钥 |
| `ADMIN_ACCESS_KEY` | 使用 Zeabur 当前值，或重新生成 | `/admin` 管理页密钥 |
| `TENANT_CONFIG_PATH` | `/data/tenants.json` | Docker 挂载后的租户配置路径 |
| `ALLOW_ANY_SENDER` | `false` | Zeabur 未显示该项时，GCP 建议显式设置为 `false` |
| `IMAP_SINCE_HOURS` | `3` | Zeabur 未显示该项时，GCP 建议显式设置为 `3` |

注意：你已经把真实 `EMAIL_PASS`、`ADMIN_ACCESS_KEY`、`SESSION_SECRET` 提供给迁移执行方时，可以直接填入 GCP 的 `.env`。但不要把这些真实值保存到仓库文档里。

```env
EMAIL_HOST=imap.qq.com
EMAIL_PORT=993
EMAIL_USER=1355628444@qq.com
EMAIL_PASS=替换成Zeabur当前EMAIL_PASS

ALLOWED_SENDERS=noreply@tm.openai.com,otp@tm1.openai.com,ymx19960516@gmail.com
ALLOWED_SENDER_DOMAINS=tm.openai.com,tm1.openai.com
ALLOW_ANY_SENDER=false
IMAP_IDLE=true
IMAP_SINCE_HOURS=3

SESSION_SECRET=替换成Zeabur当前SESSION_SECRET或重新生成
ADMIN_ACCESS_KEY=替换成Zeabur当前ADMIN_ACCESS_KEY或重新生成
TENANT_CONFIG_PATH=/data/tenants.json
```

说明：

- `TENANT_CONFIG_PATH` 在 Docker 部署里固定为 `/data/tenants.json`。
- `IMAP_SINCE_HOURS=3` 表示只扫描最近 3 小时邮件。迁移排查时可以临时改成 `24`。
- 当前代码已兼容 DuckDuckGo Email Protection 转发，会把 `noreply_at_tm.openai.com_xxx@duck.com` 还原成 `noreply@tm.openai.com` 再匹配白名单。
- DuckDuckGo 地址必须写进租户 `recipients`，例如 `knelt-wimp-contest@duck.com`，不要写最终收信的 QQ 邮箱。

## 发给 GCP 上 Codex 的提示词

把下面这段直接发给 GCP 机器上的 Codex：

如果你希望最少手动操作，并且接受在本地保存一份带真实密钥的交接文件，请使用：

```text
docs/gcp-migration.local.md
```

该文件被 `.gitignore` 忽略，不应提交到 Git。它可以直接发给 GCP 上的 Codex，用于创建 `.env` 并完成部署。

```text
请把 domainCode 项目部署到当前 GCP VM。

项目仓库：https://github.com/specialYmx/domainCode.git

部署要求：
1. 使用 Docker Compose 部署。
2. 服务容器名使用 domaincode。
3. 使用仓库自带 Dockerfile 构建。
4. 容器内端口是 8080，先映射到宿主机 8080。
5. 在项目根目录创建 .env，填入我提供的环境变量。
6. 创建 data 目录，把我提供的 tenants.json 放到 ./data/tenants.json。
7. docker-compose.yml 里把 ./data 挂载到容器 /data。
8. TENANT_CONFIG_PATH 必须是 /data/tenants.json。
9. 启动后检查 docker logs，确认没有 IMAP 登录错误、TENANT_CONFIG_PATH not found、端口占用错误。
10. 最后告诉我访问地址：http://服务器公网IP:8080 和 http://服务器公网IP:8080/admin。

安全要求：
1. 不要把 .env、tenants.json 或任何密钥提交到 Git。
2. 不要把真实密钥写入 README 或其他文档。
3. 如果需要排查，只输出脱敏后的环境变量，例如 EMAIL_PASS=<set>。
```

## GCP VM 基础安装

以下命令适用于 Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

执行完 `usermod` 后，退出 SSH 再重新登录，让 Docker 用户组生效。

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

如果目录已存在：

```bash
cd ~/domainCode
git pull origin main
```

如果 GCP 机器拉 GitHub 超时，需要给服务器配置代理，或者在本地打包上传代码。不要把 GitHub 密码发给任何人。

## 创建 .env

```bash
cd ~/domainCode
nano .env
```

填入本文上面的环境变量模板，并替换真实值。

限制权限：

```bash
chmod 600 .env
```

确认不要被 Git 跟踪：

```bash
git status --short .env
```

正常情况下不应显示 `.env`。

## 迁移 tenants.json

创建目录：

```bash
cd ~/domainCode
mkdir -p data
```

把 Zeabur 的 `/data/tenants.json` 放到：

```text
~/domainCode/data/tenants.json
```

可以用 `nano` 粘贴：

```bash
nano data/tenants.json
```

限制权限：

```bash
chmod 600 data/tenants.json
```

确认是合法 JSON：

```bash
test -s data/tenants.json && echo "tenants.json exists"
node -e "JSON.parse(require('fs').readFileSync('data/tenants.json','utf8')); console.log('valid json')"
```

确认不要被 Git 跟踪：

```bash
git status --short data/tenants.json
```

正常情况下不应显示 `data/tenants.json`。

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

如果不想把 `docker-compose.yml` 提交到 Git，可以保持为本地部署文件。

## 启动服务

```bash
cd ~/domainCode
docker compose up -d --build
docker ps
docker logs -f domaincode
```

正常访问地址：

```text
http://服务器公网IP:8080
http://服务器公网IP:8080/admin
```

## GCP 防火墙

如果先用公网 IP + `8080` 访问，需要放行 TCP `8080`。

可以在 GCP 控制台创建防火墙规则：

```text
Direction: Ingress
Action: Allow
Targets: 选中当前 VM 或按网络标签
Source IPv4 ranges: 0.0.0.0/0
Protocols and ports: tcp:8080
```

生产环境建议后续改成域名 + HTTPS，只开放 `80/443`，不要长期直接暴露 `8080`。

## 可选：Caddy HTTPS 反代

如果已经有域名解析到 GCP 公网 IP，可以用 Caddy 自动签发 HTTPS。

安装 Caddy 后配置：

```caddyfile
your-domain.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

此时 GCP 防火墙只需要放行：

```text
tcp:80
tcp:443
```

访问：

```text
https://your-domain.example.com
https://your-domain.example.com/admin
```

## 验证清单

部署完成后逐项检查：

```bash
docker ps
docker logs domaincode --tail=100
curl -I http://127.0.0.1:8080
```

浏览器检查：

- 能打开 `http://服务器公网IP:8080`
- 能打开 `http://服务器公网IP:8080/admin`
- `/admin` 用 `ADMIN_ACCESS_KEY` 能验证成功
- 主页面用已有访问码能登录
- 新触发一封 ChatGPT/OpenAI 验证码后，主页面能看到验证码

日志里不应出现：

```text
TENANT_CONFIG_PATH not found
Invalid login
Authentication failed
EADDRINUSE
```

## DuckDuckGo 转发检查

DuckDuckGo 转发后的 OpenAI 邮件通常长这样：

```text
From: noreply_at_tm.openai.com_xxx@duck.com
To: xxx@duck.com
```

租户里必须包含 `To` 地址：

```json
[
  {
    "id": "sale_duck_example",
    "displayName": "xxx@duck.com",
    "recipients": ["xxx@duck.com"],
    "accessKeyHash": "sha256_hash_here",
    "enabled": true
  }
]
```

不要把最终接收邮件的 QQ 邮箱当成租户邮箱，除非邮件头里的 `To` 本身就是 QQ 邮箱。

## 备份和恢复

备份租户数据：

```bash
cd ~/domainCode
mkdir -p backups
cp data/tenants.json "backups/tenants.$(date +%Y%m%d-%H%M%S).json"
```

恢复租户数据：

```bash
cd ~/domainCode
cp backups/要恢复的文件.json data/tenants.json
docker compose restart domaincode
```

## 更新代码

```bash
cd ~/domainCode
git pull origin main
docker compose up -d --build
docker logs -f domaincode
```

## 常见问题

### 页面能打开但没有验证码

检查：

- 邮件是否进入 `EMAIL_USER` 对应邮箱的收件箱。
- 新邮件是否在 `IMAP_SINCE_HOURS` 范围内。
- `data/tenants.json` 的 `recipients` 是否匹配邮件头里的真实 `To` 地址。
- DuckDuckGo 转发时，租户里是否填了 `xxx@duck.com`。
- 线上 `.env` 是否设置 `ALLOW_ANY_SENDER=false` 且白名单包含 OpenAI 发件域。

临时排查可以把：

```env
IMAP_SINCE_HOURS=24
```

然后重启：

```bash
docker compose restart domaincode
```

### 后台新增租户后重启丢失

通常是数据目录没有挂载。确认 `docker-compose.yml` 有：

```yaml
volumes:
  - ./data:/data
```

并且 `.env` 有：

```env
TENANT_CONFIG_PATH=/data/tenants.json
```

### IMAP 登录失败

检查：

- `EMAIL_USER` 是否正确。
- `EMAIL_PASS` 是否是 QQ 邮箱 IMAP 授权码。
- QQ 邮箱是否开启 IMAP/SMTP 服务。
- GCP 机器是否能访问 `imap.qq.com:993`。

测试网络：

```bash
timeout 5 bash -c '</dev/tcp/imap.qq.com/993' && echo ok || echo failed
```

### 端口无法访问

检查：

```bash
docker ps
docker logs domaincode --tail=100
sudo ss -lntp | grep 8080
```

同时确认 GCP 防火墙放行了 TCP `8080`，或已经配置好 `80/443` 反代。

### GitHub 拉取超时

如果 GCP 机器访问 GitHub 超时，可以：

- 配置服务器代理后再 `git pull`
- 在本地 `git pull` 后打包上传
- 使用 GitHub Release/ZIP 包上传

这不是项目代码问题，是服务器到 GitHub 的网络问题。

## 最终迁移完成标准

满足下面条件才算迁移完成：

- GCP 上 `domaincode` 容器稳定运行。
- `/admin` 可访问并能验证管理员密钥。
- 旧访问码能登录主页面。
- 新验证码能被读取和展示。
- `data/tenants.json` 在宿主机 `~/domainCode/data/tenants.json`，不是只存在容器内部。
- `.env` 和 `data/tenants.json` 没有进入 Git。
- 如果使用域名，HTTPS 可访问。
