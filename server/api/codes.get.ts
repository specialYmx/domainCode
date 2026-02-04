import { getTenantCache, setCachesByTenant } from "../utils/cache";
import { requireTenant } from "../utils/auth";
import { fetchChatGPTCodes } from "../utils/imap";
import { getAllTenantIds, groupCodesByTenant } from "../utils/tenant";

let refreshInFlight: Promise<Record<string, any[]>> | null = null;
const REFRESH_TIMEOUT_MS = 12_000;

class RefreshTimeoutError extends Error {
    constructor() {
        super("Refresh timeout");
    }
}

async function refreshCache(): Promise<Record<string, any[]>> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        const codes = await fetchChatGPTCodes();
        const grouped = groupCodesByTenant(codes);
        setCachesByTenant(getAllTenantIds(), grouped);
        return grouped;
    })().finally(() => {
        refreshInFlight = null;
    });
    return refreshInFlight;
}

async function refreshCacheWithTimeout(timeoutMs: number): Promise<Record<string, any[]>> {
    return await Promise.race([
        refreshCache(),
        new Promise<Record<string, any[]>>((_, reject) =>
            setTimeout(() => reject(new RefreshTimeoutError()), timeoutMs),
        ),
    ]);
}

export default defineEventHandler(async (event) => {
    const tenant = requireTenant(event);
    const query = getQuery(event);
    const forceRefresh = query.force === "true";
    const cached = getTenantCache(tenant.id);
    const now = Date.now();

    if (!forceRefresh && cached) {
        const cacheAgeMs = now - cached.timestamp;
        if (cacheAgeMs > 5000) {
            refreshCache().catch((err) => console.error("IMAP refresh error:", err));
        }
        return {
            success: true,
            tenantId: tenant.id,
            codes: cached.codes,
            cached: true,
            cacheAge: Math.floor(cacheAgeMs / 1000),
        };
    }

    if (!forceRefresh && !cached) {
        refreshCache().catch((err) => console.error("IMAP refresh error:", err));
        return {
            success: true,
            tenantId: tenant.id,
            codes: [],
            cached: false,
            warming: true,
        };
    }

    try {
        await refreshCacheWithTimeout(REFRESH_TIMEOUT_MS);
        const current = getTenantCache(tenant.id);
        return {
            success: true,
            tenantId: tenant.id,
            codes: current?.codes || [],
            cached: false,
        };
    } catch (error: any) {
        const timedOut = error instanceof RefreshTimeoutError;
        if (cached) {
            return {
                success: true,
                tenantId: tenant.id,
                codes: cached.codes,
                cached: true,
                stale: true,
                timeout: timedOut || undefined,
            };
        }

        if (timedOut) {
            refreshCache().catch((err) => console.error("IMAP refresh error:", err));
            return {
                success: true,
                tenantId: tenant.id,
                codes: [],
                cached: false,
                warming: true,
                timeout: true,
            };
        }

        return {
            success: false,
            tenantId: tenant.id,
            codes: [],
            cached: false,
            error: error?.message || "Failed to fetch codes",
        };
    }
});
