import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface CreateTenantInput {
  email: string;
  tenantId?: string;
  displayName?: string;
  accessKey?: string;
}

export interface CreateTenantResult {
  id: string;
  displayName: string;
  recipients: string[];
  accessKey: string;
  file: string;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTenantId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/__+/g, "_");
}

function buildDefaultTenantId(email: string): string {
  const [localRaw, domainRaw = ""] = email.split("@");
  const local = normalizeTenantId(localRaw || "tenant");
  const domainParts = domainRaw
    .split(".")
    .map((part) => normalizeTenantId(part))
    .filter(Boolean);

  const domainTag =
    domainParts.length > 1
      ? domainParts.slice(0, -1).join("_")
      : (domainParts[0] || "mail");

  return normalizeTenantId(`sale_${local}_${domainTag}`);
}

function resolveTenantConfigPathForWrite(): string {
  const fromPath = process.env.TENANT_CONFIG_PATH?.trim();
  const fromJson = process.env.TENANT_CONFIG_JSON?.trim();

  if (!fromPath && fromJson) {
    throw new Error("TENANT_CONFIG_JSON mode is read-only here. Please set TENANT_CONFIG_PATH.");
  }

  const rawPath = fromPath || "data/tenants.json";
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

function ensureConfigFile(configPath: string): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(configPath)) {
    writeFileSync(configPath, "[]\n", "utf8");
  }
}

function readTenantArray(configPath: string): Array<Record<string, unknown>> {
  ensureConfigFile(configPath);
  const raw = readFileSync(configPath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${configPath}`);
  }

  return parsed.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function writeTenantArray(configPath: string, tenants: Array<Record<string, unknown>>): void {
  writeFileSync(configPath, `${JSON.stringify(tenants, null, 2)}\n`, "utf8");
}

function createAccessKey(): string {
  return randomBytes(12).toString("base64url");
}

export function createTenant(input: CreateTenantInput): CreateTenantResult {
  const email = normalizeEmail(String(input.email || ""));
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required");
  }

  const configPath = resolveTenantConfigPathForWrite();
  const tenants = readTenantArray(configPath);

  const recipients = [email];
  const id = normalizeTenantId(input.tenantId || buildDefaultTenantId(email));
  if (!id) {
    throw new Error("Tenant ID is invalid");
  }

  if (tenants.some((item) => String(item.id || "").trim() === id)) {
    throw new Error(`Tenant ID already exists: ${id}`);
  }

  const emailExists = tenants.some((item) => {
    const list = Array.isArray(item.recipients) ? item.recipients : [];
    return list.map((value) => normalizeEmail(String(value || ""))).includes(email);
  });
  if (emailExists) {
    throw new Error(`Recipient already exists: ${email}`);
  }

  const accessKey = String(input.accessKey || "").trim() || createAccessKey();
  const displayName = String(input.displayName || "").trim() || email;

  tenants.push({
    id,
    displayName,
    recipients,
    accessKeyHash: sha256Hex(accessKey),
    enabled: true,
  });

  writeTenantArray(configPath, tenants);

  return {
    id,
    displayName,
    recipients,
    accessKey,
    file: configPath,
  };
}
