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
    - `NEXT_PUBLIC_SENDER_FILTER`: 过滤发件人 (可选，默认为 `noreply@tm.openai.com`)
4.  生成域名并访问。

## 🛠 本地开发

```bash
# 安装依赖
npm install

# 复制配置文件并修改
cp .env.example .env

# 启动开发服务器
npm run dev
```
