interface CacheData {
    codes: any[];
    timestamp: number;
}

let cache: CacheData | null = null;
const CACHE_TTL = 15 * 1000;

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const forceRefresh = query.force === 'true';

        const now = Date.now();

        if (cache && !forceRefresh && (now - cache.timestamp) < CACHE_TTL) {
            return {
                success: true,
                codes: cache.codes,
                cached: true,
                cacheAge: Math.floor((now - cache.timestamp) / 1000)
            };
        }

        const codes = await fetchChatGPTCodes();

        cache = {
            codes,
            timestamp: now
        };

        return {
            success: true,
            codes,
            cached: false
        };
    } catch (error: any) {
        if (cache) {
            return {
                success: true,
                codes: cache.codes,
                cached: true,
                stale: true
            };
        }
        return {
            success: false,
            codes: [],
            cached: false,
            error: error?.message || 'Failed to fetch codes',
        };
    }
});
