# 验证码同步助手 (DomainCode)

一个极简、高效的验证码接收终端，专为域名邮箱转发场景设计。基于 Nuxt 3 构建。

## 🌟 核心功能

- **实时同步**：通过 IMAP 协议从主邮箱抓取最新的验证码。
- **转发支持**：显式展示原始收件地址（适用于域名邮箱转发）。
- **极致紧凑**：优化 UI 布局，单屏展示更多信息。
- **一键复制**：点击验证码即可快速复制。

## 🚀 部署指引 (推荐 Zeabur)

1.  将代码推送至 GitHub。
2.  在 Zeabur 导入仓库。
3.  **配置环境变量**（必须）：
    - `EMAIL_HOST`: IMAP 服务器地址 (如 `imap.qq.com`)
    - `EMAIL_PORT`: 端口号 (通常为 `993`)
    - `EMAIL_USER`: 邮箱账号
    - `EMAIL_PASS`: 邮箱授权码（非登录密码）
4.  **可选过滤与刷新配置**：
    - `ALLOWED_SENDERS`: 允许的发件人白名单，逗号分隔（如 `noreply@tm.openai.com,otp@tm1.openai.com`）
    - `ALLOWED_SENDER_DOMAINS`: 允许的发件人域名，逗号分隔（如 `tm.openai.com,tm1.openai.com`）
    - `ALLOW_ANY_SENDER`: 设为 `true` 时临时放行所有发件人（仅用于测试）
    - `NEXT_PUBLIC_SENDER_FILTER`: 旧的单发件人过滤（兼容保留），仅在 `ALLOWED_SENDERS` 未设置时生效
    - `IMAP_SINCE_HOURS`: 拉取最近多少小时内的邮件，默认 `3`
    - `IMAP_IDLE`: 是否开启 IMAP IDLE 实时刷新，设为 `false` 可禁用
5.  **多租户隔离（推荐开启）**：
    - `SESSION_SECRET`: 会话签名密钥（生产环境必填）
    - `TENANT_CONFIG_PATH`: 租户配置文件路径（推荐 `data/tenants.json`）
      - 文件内容参考 `data/tenants.example.json`
      - 每个租户建议使用 `accessKeyHash`（SHA-256）
      - `recipients` 必须填完整邮箱地址（如 `ymx01@ymx.indevs.in`）
    - `TENANT_CONFIG_JSON`: 可选兼容方式（不推荐，维护困难）
6.  生成域名并访问。

## 🔧 账号管理脚本（推荐）

```bash
# 新增买家/订单（自动生成访问码）
npm run tenant:add -- --id order_001 --display buyer-001 --emails ymx01@ymx.indevs.in

# 给已有买家追加邮箱
npm run tenant:append -- --id order_001 --emails ymx02@ymxhan.indevs.in

# 停用买家（立即失效）
npm run tenant:disable -- --id order_001

# 重置访问码（旧码作废）
npm run tenant:rotate-key -- --id order_001
```

命令会直接更新 `data/tenants.json`，并在终端输出需要发给买家的访问码（仅输出一次，建议保存）。

## 🛠 本地开发

```bash
# 安装依赖
npm install

# 复制配置文件并修改
cp .env.example .env

# 本机开发（默认，支持热更新）
npm run dev

# 局域网访问调试（手机/其他电脑）
npm run dev:lan
```

## 🧯 常见问题

- 控制台持续出现 `GET http://127.0.0.1:24678/_nuxt/ net::ERR_CONNECTION_REFUSED`
  - 这是旧 HMR 连接信息，已改为固定走 `127.0.0.1:3000`。
  - 关闭旧 Node 进程后重新 `npm run dev`，并关闭 DevTools 的 `Preserve log` 再观察。
- 日志出现 `ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC`
  - 这是 IMAP TLS 链路的瞬时网络抖动/连接中断，不是访问码逻辑错误。
  - 服务会自动重连并指数退避；若频繁出现，优先排查网络、代理、邮箱服务端 TLS 稳定性。
