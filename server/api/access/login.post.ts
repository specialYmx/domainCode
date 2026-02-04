import { getTenantByAccessKey } from "../../utils/tenant";
import { setSessionCookie } from "../../utils/session";

interface LoginBody {
  accessKey?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 25;
const buckets = new Map<string, RateLimitBucket>();

function assertRateLimit(ip: string): void {
  const now = Date.now();
  const current = buckets.get(ip);
  if (!current || now > current.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= MAX_ATTEMPTS) {
    throw createError({
      statusCode: 429,
      statusMessage: "Too Many Requests",
      message: "Too many login attempts. Try again later.",
    });
  }
  current.count += 1;
}

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) || "unknown";
  assertRateLimit(ip);

  const body = await readBody<LoginBody>(event);
  const accessKey = body?.accessKey?.trim() || "";
  if (!accessKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "Access code is required",
    });
  }

  const tenant = getTenantByAccessKey(accessKey);
  if (!tenant) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "访问码无效（不是邮箱或租户ID）",
    });
  }

  setSessionCookie(event, tenant.id);
  return {
    success: true,
    tenantId: tenant.id,
    displayName: tenant.displayName || tenant.id,
  };
});
