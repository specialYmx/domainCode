import { getCache, setCache } from "../utils/cache";
import { fetchChatGPTCodes } from "../utils/imap";

let refreshInFlight: Promise<any[]> | null = null;

async function refreshCache(): Promise<any[]> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        const codes = await fetchChatGPTCodes();
        setCache(codes);
        return codes;
    })().finally(() => {
        refreshInFlight = null;
    });
    return refreshInFlight;
}

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const forceRefresh = query.force === "true";
    const cached = getCache();
    const now = Date.now();

    if (!forceRefresh && cached) {
        const cacheAgeMs = now - cached.timestamp;
        if (cacheAgeMs > 5000) {
            refreshCache().catch((err) => console.error("IMAP refresh error:", err));
        }
        return {
            success: true,
            codes: cached.codes,
            cached: true,
            cacheAge: Math.floor(cacheAgeMs / 1000),
        };
    }

    try {
        const codes = await refreshCache();
        return {
            success: true,
            codes,
            cached: false,
        };
    } catch (error: any) {
        return {
            success: false,
            codes: [],
            cached: false,
            error: error?.message || "Failed to fetch codes",
        };
    }
});

