const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>租户管理后台</title>
  <style>
    :root {
      --bg: #0c1118;
      --panel: #121927;
      --panel-2: #0f1522;
      --text: #e7edf6;
      --muted: #9bb0ce;
      --line: #24314a;
      --accent: #41d0a1;
      --accent-2: #4fa4ff;
      --danger: #ff7373;
      --ok: #6fe6b8;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: radial-gradient(1200px 600px at -10% -20%, #1b2b4a 0%, transparent 55%),
                  radial-gradient(900px 500px at 110% 0%, #173247 0%, transparent 50%),
                  var(--bg);
      color: var(--text);
      padding: 24px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      backdrop-filter: blur(8px);
    }

    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      letter-spacing: 0.04em;
    }

    p { margin: 0; color: var(--muted); }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .full { grid-column: 1 / -1; }

    label {
      display: block;
      font-size: 12px;
      margin-bottom: 6px;
      color: #b6c7df;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      border: 1px solid #2d3b59;
      background: var(--panel-2);
      color: var(--text);
      border-radius: 10px;
      padding: 11px 12px;
      font-size: 14px;
      outline: none;
    }

    input:focus {
      border-color: var(--accent-2);
      box-shadow: 0 0 0 2px rgba(79,164,255,0.2);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }

    button {
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-primary {
      background: linear-gradient(90deg, var(--accent), #58d7ff);
      color: #082d24;
    }

    .btn-secondary {
      background: #182236;
      color: #c9d8ee;
      border-color: #2b3e5f;
    }

    .hint { font-size: 13px; color: var(--muted); margin-top: 8px; }

    .result {
      margin-top: 12px;
      border: 1px dashed #2e486a;
      border-radius: 10px;
      padding: 12px;
      background: rgba(17,26,40,0.6);
    }

    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
    .tag { font-size: 12px; color: #cfe2ff; background: #1d2a44; border: 1px solid #2f446b; padding: 3px 8px; border-radius: 999px; }
    .mono { font-family: Consolas, Monaco, monospace; font-size: 13px; }
    .ok { color: var(--ok); }
    .err { color: var(--danger); }

    @media (max-width: 700px) {
      body { padding: 14px; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <section class="panel">
      <h1>租户配置页</h1>
      <p>输入管理员密钥后，直接新增账号并返回访问码。新增写入 <span class="mono">TENANT_CONFIG_PATH</span> 对应文件。</p>
      <p class="hint">建议通过 HTTPS 使用，避免管理员密钥泄漏。</p>
    </section>

    <section class="panel">
      <div class="grid">
        <div class="full">
          <label for="adminKey">管理员密钥 (ADMIN_ACCESS_KEY)</label>
          <input id="adminKey" type="password" placeholder="请输入管理员密钥" />
        </div>

        <div>
          <label for="email">客户邮箱</label>
          <input id="email" type="email" placeholder="如 ymx16@ymx0516.dndns.org" />
        </div>

        <div>
          <label for="displayName">显示名 (可选)</label>
          <input id="displayName" type="text" placeholder="默认等于邮箱" />
        </div>

        <div>
          <label for="tenantId">租户ID (可选)</label>
          <input id="tenantId" type="text" placeholder="默认自动生成 sale_xxx" />
        </div>

        <div>
          <label for="accessKey">访问码 (可选)</label>
          <input id="accessKey" type="text" placeholder="留空将自动生成" />
        </div>
      </div>

      <div class="actions">
        <button id="pingBtn" class="btn-secondary" type="button">验证密钥</button>
        <button id="createBtn" class="btn-primary" type="button">新增账号并生成访问码</button>
      </div>

      <div id="status" class="hint">等待操作...</div>

      <div id="result" class="result" style="display:none">
        <div class="row"><span class="tag">新租户</span><span id="rTenant" class="mono"></span></div>
        <div class="row"><span class="tag">邮箱</span><span id="rEmail" class="mono"></span></div>
        <div class="row"><span class="tag">访问码</span><span id="rKey" class="mono"></span><button id="copyBtn" class="btn-secondary" type="button">复制</button></div>
        <div class="row"><span class="tag">配置文件</span><span id="rFile" class="mono"></span></div>
      </div>
    </section>
  </div>

  <script>
    const adminKeyEl = document.getElementById("adminKey");
    const emailEl = document.getElementById("email");
    const displayNameEl = document.getElementById("displayName");
    const tenantIdEl = document.getElementById("tenantId");
    const accessKeyEl = document.getElementById("accessKey");
    const pingBtn = document.getElementById("pingBtn");
    const createBtn = document.getElementById("createBtn");
    const statusEl = document.getElementById("status");
    const resultEl = document.getElementById("result");
    const rTenantEl = document.getElementById("rTenant");
    const rEmailEl = document.getElementById("rEmail");
    const rKeyEl = document.getElementById("rKey");
    const rFileEl = document.getElementById("rFile");
    const copyBtn = document.getElementById("copyBtn");

    const cacheKey = "domaincode_admin_key";
    adminKeyEl.value = localStorage.getItem(cacheKey) || "";

    function setStatus(text, type) {
      statusEl.textContent = text;
      statusEl.className = type === "err" ? "hint err" : (type === "ok" ? "hint ok" : "hint");
    }

    function getHeaders() {
      const key = adminKeyEl.value.trim();
      return {
        "Content-Type": "application/json",
        "x-admin-key": key,
      };
    }

    function persistAdminKey() {
      const key = adminKeyEl.value.trim();
      if (key) {
        localStorage.setItem(cacheKey, key);
      }
    }

    async function validateAdmin() {
      const key = adminKeyEl.value.trim();
      if (!key) {
        setStatus("请先输入管理员密钥", "err");
        return;
      }

      setStatus("正在验证管理员密钥...", "");
      try {
        const res = await fetch("/api/admin/ping", {
          method: "GET",
          headers: { "x-admin-key": key },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "验证失败");

        persistAdminKey();
        setStatus("验证成功，当前配置模式: " + data.mode + "，文件: " + data.tenantConfigPath, "ok");
      } catch (err) {
        setStatus(err.message || "验证失败", "err");
      }
    }

    async function createTenant() {
      const key = adminKeyEl.value.trim();
      const email = emailEl.value.trim();
      if (!key) {
        setStatus("请先输入管理员密钥", "err");
        return;
      }
      if (!email) {
        setStatus("请先输入客户邮箱", "err");
        return;
      }

      resultEl.style.display = "none";
      setStatus("正在创建租户...", "");

      const payload = {
        email,
        displayName: displayNameEl.value.trim() || undefined,
        tenantId: tenantIdEl.value.trim() || undefined,
        accessKey: accessKeyEl.value.trim() || undefined,
      };

      try {
        const res = await fetch("/api/admin/tenants/create", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "创建失败");

        persistAdminKey();
        setStatus("新增成功，访问码已生成。", "ok");

        rTenantEl.textContent = data.tenant.id;
        rEmailEl.textContent = data.tenant.recipients[0] || "";
        rKeyEl.textContent = data.accessKey;
        rFileEl.textContent = data.file;
        resultEl.style.display = "block";

        emailEl.value = "";
        displayNameEl.value = "";
        tenantIdEl.value = "";
        accessKeyEl.value = "";
      } catch (err) {
        setStatus(err.message || "创建失败", "err");
      }
    }

    pingBtn.addEventListener("click", validateAdmin);
    createBtn.addEventListener("click", createTenant);
    copyBtn.addEventListener("click", async () => {
      const value = rKeyEl.textContent || "";
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setStatus("访问码已复制", "ok");
      } catch {
        setStatus("复制失败，请手动复制", "err");
      }
    });
  </script>
</body>
</html>`;

export default defineEventHandler((event) => {
  setHeader(event, "content-type", "text/html; charset=utf-8");
  return page;
});

