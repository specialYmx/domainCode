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
5.  生成域名并访问。

## 🛠 本地开发

```bash
# 安装依赖
npm install

# 复制配置文件并修改
cp .env.example .env

# 启动开发服务器
npm run dev
```
