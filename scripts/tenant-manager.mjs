import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

function loadDotEnv(filepath = ".env") {
  const fullPath = isAbsolute(filepath) ? filepath : resolve(process.cwd(), filepath);
  if (!existsSync(fullPath)) return;
  const content = readFileSync(fullPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    const value = line.slice(eqIndex + 1).trim();
    process.env[key] = value;
  }
}

loadDotEnv();

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseEmails(input) {
  return Array.from(
    new Set(
      String(input || "")
        .split(/[,\s]+/)
        .map((item) => normalizeEmail(item))
        .filter(Boolean),
    ),
  );
}

function resolveConfigPath(opts) {
  const raw =
    opts.file ||
    process.env.TENANT_CONFIG_PATH ||
    "data/tenants.json";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function ensureConfigFile(configPath) {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(configPath)) {
    writeFileSync(configPath, "[]\n", "utf8");
  }
}

function readTenants(configPath) {
  ensureConfigFile(configPath);
  const raw = readFileSync(configPath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`Expected JSON array in ${configPath}`);
  }
  return data;
}

function writeTenants(configPath, tenants) {
  writeFileSync(configPath, `${JSON.stringify(tenants, null, 2)}\n`, "utf8");
}

function printUsage() {
  console.log(`Usage:
  npm run tenant:add -- --id <tenant_id> --display <name> --emails a@x.com,b@y.com [--key custom]
  npm run tenant:append -- --id <tenant_id> --emails c@z.com
  npm run tenant:disable -- --id <tenant_id>
  npm run tenant:rotate-key -- --id <tenant_id> [--key custom]

Optional:
  --file <path>  Override config path (default: TENANT_CONFIG_PATH or data/tenants.json)
`);
}

function requireOption(opts, key, message) {
  if (!opts[key]) {
    throw new Error(message);
  }
}

function createAccessKey() {
  return randomBytes(12).toString("base64url");
}

function addTenant(opts) {
  requireOption(opts, "id", "Missing --id");
  requireOption(opts, "emails", "Missing --emails");

  const configPath = resolveConfigPath(opts);
  const tenants = readTenants(configPath);
  const id = String(opts.id).trim();
  const displayName = opts.display ? String(opts.display).trim() : id;
  const recipients = parseEmails(opts.emails);
  if (recipients.length === 0) {
    throw new Error("No valid emails found in --emails");
  }
  if (tenants.some((item) => item?.id === id)) {
    throw new Error(`Tenant already exists: ${id}`);
  }

  const accessKey = opts.key ? String(opts.key) : createAccessKey();
  const record = {
    id,
    displayName,
    recipients,
    accessKeyHash: sha256Hex(accessKey),
    enabled: true,
  };

  tenants.push(record);
  writeTenants(configPath, tenants);

  console.log("Tenant created:");
  console.log(JSON.stringify({
    id,
    displayName,
    recipients,
    accessKey,
    file: configPath,
  }, null, 2));
}

function appendEmails(opts) {
  requireOption(opts, "id", "Missing --id");
  requireOption(opts, "emails", "Missing --emails");

  const configPath = resolveConfigPath(opts);
  const tenants = readTenants(configPath);
  const id = String(opts.id).trim();
  const tenant = tenants.find((item) => item?.id === id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`);
  }

  const nextEmails = parseEmails(opts.emails);
  if (nextEmails.length === 0) {
    throw new Error("No valid emails found in --emails");
  }

  const current = Array.isArray(tenant.recipients) ? tenant.recipients : [];
  tenant.recipients = Array.from(
    new Set([...current.map((item) => normalizeEmail(item)), ...nextEmails]),
  );
  writeTenants(configPath, tenants);

  console.log("Recipients updated:");
  console.log(JSON.stringify({
    id,
    recipients: tenant.recipients,
    file: configPath,
  }, null, 2));
}

function disableTenant(opts) {
  requireOption(opts, "id", "Missing --id");

  const configPath = resolveConfigPath(opts);
  const tenants = readTenants(configPath);
  const id = String(opts.id).trim();
  const tenant = tenants.find((item) => item?.id === id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`);
  }

  tenant.enabled = false;
  writeTenants(configPath, tenants);

  console.log("Tenant disabled:");
  console.log(JSON.stringify({ id, file: configPath }, null, 2));
}

function rotateKey(opts) {
  requireOption(opts, "id", "Missing --id");

  const configPath = resolveConfigPath(opts);
  const tenants = readTenants(configPath);
  const id = String(opts.id).trim();
  const tenant = tenants.find((item) => item?.id === id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`);
  }

  const accessKey = opts.key ? String(opts.key) : createAccessKey();
  tenant.accessKeyHash = sha256Hex(accessKey);
  tenant.enabled = true;
  writeTenants(configPath, tenants);

  console.log("Access key rotated:");
  console.log(JSON.stringify({
    id,
    accessKey,
    file: configPath,
  }, null, 2));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const command = opts._[0];

  if (!command || opts.help || opts.h) {
    printUsage();
    return;
  }

  switch (command) {
    case "add":
      addTenant(opts);
      break;
    case "append":
      appendEmails(opts);
      break;
    case "disable":
      disableTenant(opts);
      break;
    case "rotate-key":
      rotateKey(opts);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
