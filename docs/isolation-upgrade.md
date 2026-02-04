# Isolation Upgrade Plan (Access Code + Tenant Separation)

## 1. Why this change

Current implementation exposes all verification codes through shared APIs and shared SSE updates. Any visitor can read all forwarded mailbox content.

This upgrade introduces tenant-level isolation without building a full registration system.

## 2. Target architecture

- Access is controlled by an **access code** per tenant/order.
- Login endpoint validates access code and sets an HttpOnly session cookie.
- Every data API reads tenant identity from cookie, never from frontend filter fields.
- Cache and realtime stream are partitioned by tenant ID.
- Verification code matching uses **full recipient address** (`local@domain`) to support multi-domain accounts.

## 3. New environment variables

```env
# Session signing secret (required in production)
SESSION_SECRET=replace_with_random_32+_chars

# Preferred: path-based tenant config
TENANT_CONFIG_PATH=data/tenants.json

# Optional fallback (not recommended for large lists)
# TENANT_CONFIG_JSON=[{...}]
```

## 4. API changes

### Added

- `POST /api/access/login`
  - body: `{ "accessKey": "..." }`
  - success: sets session cookie and returns tenant info
- `POST /api/access/logout`
  - clears session cookie
- `GET /api/access/me`
  - returns current tenant profile from cookie

### Updated

- `GET /api/codes`
  - now requires session
  - returns codes only for current tenant
- `GET /api/stream`
  - now requires session
  - pushes updates only for current tenant

## 5. File-level implementation summary

- `server/utils/tenant.ts`
  - parse tenant config
  - access code hash validation
  - group fetched IMAP codes by tenant recipients
- `server/utils/session.ts`
  - signed cookie create/verify/clear helpers
- `server/utils/auth.ts`
  - shared `requireTenant` guard for APIs
- `server/utils/cache.ts`
  - changed from global cache to per-tenant cache and listeners
- `server/utils/imap.ts`
  - recipient normalization and extraction from `X-Original-To`, `Delivered-To`, `Envelope-To`, `To`
- `server/api/codes.get.ts`
  - tenant-only read path
- `server/api/stream.get.ts`
  - tenant-only SSE subscription
- `server/plugins/imap-idle.server.ts`
  - refresh and write cache by tenant
- `app.vue`
  - adds access code login flow and logout

## 6. Operational flow

1. Admin creates tenant mapping (`tenant -> recipients -> access code hash`).
2. Buyer opens site and submits access code once.
3. Browser receives HttpOnly session cookie.
4. Frontend requests `/api/codes` and `/api/stream`.
5. Backend resolves tenant from session and returns isolated data only.

## 7. Tenant management scripts

```bash
# Create tenant and auto-generate access key
npm run tenant:add -- --id order_001 --display buyer-001 --emails ymx01@ymx.indevs.in

# Append recipients to existing tenant
npm run tenant:append -- --id order_001 --emails ymx02@ymxhan.indevs.in

# Disable tenant
npm run tenant:disable -- --id order_001

# Rotate access key
npm run tenant:rotate-key -- --id order_001
```

By default scripts write to `TENANT_CONFIG_PATH` (or `data/tenants.json`).

## 8. Migration checklist for Zeabur

1. Add `SESSION_SECRET`.
2. Add/maintain `TENANT_CONFIG_PATH`.
3. Redeploy app.
4. Verify both API and SSE isolation with two different access codes.
5. Confirm unauthenticated calls to `/api/codes` and `/api/stream` return 401.

## 9. Test cases

- Valid access code can login and see only bound recipient codes.
- Invalid access code gets 401.
- User A cannot fetch User B data by changing query params.
- SSE stream for User A does not include User B updates.
- Full-address matching distinguishes same local-part across domains.

## 10. Known limitations

- Still relies on a single IMAP source mailbox. Isolation is app-layer enforced.
- For stronger tenant boundaries, migrate mailbox backend to per-user accounts (mailcow/Stalwart/Mailu).

## 11. Helper: generate accessKeyHash

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" \"your-access-key\"
```
