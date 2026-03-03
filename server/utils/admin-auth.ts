import { timingSafeEqual } from "node:crypto";
import { createError, getRequestHeader, getRequestIP, type H3Event } from "h3";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 30;
const buckets = new Map<string, RateLimitBucket>();

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function getProvidedAdminKey(event: H3Event): string {
  const fromHeader = getRequestHeader(event, "x-admin-key")?.trim();
  if (fromHeader) return fromHeader;

  const authHeader = getRequestHeader(event, "authorization")?.trim() || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function markAttempt(ip: string, failed: boolean): void {
  const now = Date.now();
  const current = buckets.get(ip);

  if (!current || now > current.resetAt) {
    buckets.set(ip, {
      count: failed ? 1 : 0,
      resetAt: now + WINDOW_MS,
    });
    return;
  }

  if (failed) current.count += 1;
}

function assertRateLimit(ip: string): void {
  const now = Date.now();
  const current = buckets.get(ip);
  if (!current) return;
  if (now > current.resetAt) {
    buckets.delete(ip);
    return;
  }
  if (current.count >= MAX_ATTEMPTS) {
    throw createError({
      statusCode: 429,
      statusMessage: "Too Many Requests",
      message: "Too many admin auth attempts. Try again later.",
    });
  }
}

export function requireAdminAccess(event: H3Event): void {
  const expected = process.env.ADMIN_ACCESS_KEY?.trim() || "";
  if (!expected) {
    throw createError({
      statusCode: 503,
      statusMessage: "Service Unavailable",
      message: "ADMIN_ACCESS_KEY is not configured",
    });
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) || "unknown";
  assertRateLimit(ip);

  const provided = getProvidedAdminKey(event);
  if (!provided || !safeEquals(expected, provided)) {
    markAttempt(ip, true);
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "Invalid admin access key",
    });
  }

  markAttempt(ip, false);
}
