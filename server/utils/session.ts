import { createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie, type H3Event } from "h3";

const COOKIE_NAME = "dc_session";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const warnedAboutSessionSecret = { value: false };

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (!warnedAboutSessionSecret.value) {
    warnedAboutSessionSecret.value = true;
    console.warn("SESSION_SECRET missing; using insecure development fallback.");
  }
  return "dev-insecure-session-secret-change-me";
}

function toBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString();
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface SessionPayload {
  tenantId: string;
  exp: number;
}

export function createSessionToken(
  tenantId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const payload: SessionPayload = {
    tenantId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSig = sign(encodedPayload);
  if (!safeEquals(signature, expectedSig)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;
    if (!payload.tenantId || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(event: H3Event, tenantId: string): void {
  const token = createSessionToken(tenantId);
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEFAULT_TTL_SECONDS,
  });
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function getSessionTenantId(event: H3Event): string | null {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return payload.tenantId;
}
