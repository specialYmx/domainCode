import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { VerificationCode } from "./imap";

export interface TenantConfig {
  id: string;
  displayName?: string;
  recipients: string[];
  accessKeyHash: string;
  enabled: boolean;
}

const warnedAboutSecretFormat = { value: false };
const warnedAboutEnvFallback = { value: false };
const warnedAboutLoadFailure = { value: false };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const recipients = value
    .map((item) => (typeof item === "string" ? normalizeEmail(item) : ""))
    .filter(Boolean);
  return Array.from(new Set(recipients));
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function resolveTenantConfigPath(): string | null {
  const fromEnv = process.env.TENANT_CONFIG_PATH?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }
  return null;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function parseTenantArray(parsed: unknown, sourceName: string): TenantConfig[] {
  if (!Array.isArray(parsed)) {
    throw new Error(`${sourceName} must be a JSON array.`);
  }

  const tenants: TenantConfig[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;

    const recipients = parseRecipients(record.recipients);
    if (recipients.length === 0) continue;

    const keyHash =
      typeof record.accessKeyHash === "string"
        ? record.accessKeyHash.trim().toLowerCase()
        : "";
    const rawKey = typeof record.accessKey === "string" ? record.accessKey.trim() : "";

    let accessKeyHash = keyHash;
    if (!accessKeyHash && rawKey) {
      if (!warnedAboutSecretFormat.value) {
        warnedAboutSecretFormat.value = true;
        console.warn(
          `${sourceName} uses accessKey plaintext. Prefer accessKeyHash in production.`,
        );
      }
      accessKeyHash = sha256Hex(rawKey);
    }

    if (!accessKeyHash) continue;

    tenants.push({
      id,
      displayName: typeof record.displayName === "string" ? record.displayName : id,
      recipients,
      accessKeyHash,
      enabled: record.enabled !== false,
    });
  }

  return tenants;
}

function parseRawTenants(): TenantConfig[] {
  const configPath = resolveTenantConfigPath();
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`TENANT_CONFIG_PATH not found: ${configPath}`);
    }

    const raw = stripBom(readFileSync(configPath, "utf8"));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`TENANT_CONFIG_PATH must be valid JSON: ${configPath}`);
    }
    return parseTenantArray(parsed, "TENANT_CONFIG_PATH");
  }

  const raw = process.env.TENANT_CONFIG_JSON;
  if (!raw) return [];

  if (!warnedAboutEnvFallback.value) {
    warnedAboutEnvFallback.value = true;
    console.warn("Using TENANT_CONFIG_JSON fallback. Prefer TENANT_CONFIG_PATH for maintainability.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(raw));
  } catch {
    throw new Error("TENANT_CONFIG_JSON must be valid JSON.");
  }
  return parseTenantArray(parsed, "TENANT_CONFIG_JSON");
}

let parsedCache: TenantConfig[] | null = null;
let cacheSignature: string | null = null;

function getTenantSourceSignature(): string {
  const configPath = resolveTenantConfigPath();
  if (configPath) {
    if (!existsSync(configPath)) return `path:${configPath}:missing`;
    const stat = statSync(configPath);
    return `path:${configPath}:${stat.mtimeMs}:${stat.size}`;
  }
  const raw = process.env.TENANT_CONFIG_JSON || "";
  return `env:${sha256Hex(stripBom(raw))}:${raw.length}`;
}

export function getTenants(): TenantConfig[] {
  const signature = getTenantSourceSignature();
  if (parsedCache && cacheSignature === signature) {
    return parsedCache;
  }

  try {
    const parsed = parseRawTenants();
    parsedCache = parsed;
    cacheSignature = signature;
    warnedAboutLoadFailure.value = false;
    return parsed;
  } catch (error) {
    if (parsedCache) {
      if (!warnedAboutLoadFailure.value) {
        warnedAboutLoadFailure.value = true;
        console.warn("Tenant config reload failed, using previous cached config:", error);
      }
      return parsedCache;
    }
    throw error;
  }
}

export function getAllTenantIds(): string[] {
  return getTenants()
    .filter((tenant) => tenant.enabled)
    .map((tenant) => tenant.id);
}

export function getTenantById(tenantId: string): TenantConfig | null {
  return getTenants().find((tenant) => tenant.enabled && tenant.id === tenantId) || null;
}

export function getTenantByAccessKey(accessKey: string): TenantConfig | null {
  if (!accessKey) return null;
  const digest = sha256Hex(accessKey.trim());
  return (
    getTenants().find(
      (tenant) => tenant.enabled && safeEquals(tenant.accessKeyHash, digest),
    ) || null
  );
}

export function groupCodesByTenant(codes: VerificationCode[]): Record<string, VerificationCode[]> {
  const output: Record<string, VerificationCode[]> = {};
  const tenants = getTenants().filter((tenant) => tenant.enabled);

  for (const tenant of tenants) {
    output[tenant.id] = [];
  }

  for (const code of codes) {
    const recipient = normalizeEmail(code.normalizedRecipient || code.recipient || "");
    if (!recipient) continue;
    for (const tenant of tenants) {
      if (!tenant.recipients.includes(recipient)) continue;
      output[tenant.id].push(code);
    }
  }

  return output;
}
