// 内存缓存 - 存储验证码数据和时间戳
interface CacheData {
    codes: any[];
    timestamp: number;
}

let cache: CacheData | null = null;
const CACHE_TTL = 15 * 1000; // 15秒缓存，足够短不会错过新验证码

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const forceRefresh = query.force === 'true'; // 支持强制刷新

        const now = Date.now();
        
        // 如果缓存有效且不是强制刷新，直接返回缓存
        if (cache && !forceRefresh && (now - cache.timestamp) < CACHE_TTL) {
            return { 
                success: true, 
                codes: cache.codes,
                cached: true, // 告知前端这是缓存数据
                cacheAge: Math.floor((now - cache.timestamp) / 1000) // 缓存年龄（秒）
            };
        }

        // 获取新数据
        const codes = await fetchChatGPTCodes();
        
        // 更新缓存
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
        // 如果获取失败但有缓存，返回缓存数据（降级处理）
        if (cache) {
            return { 
                success: true, 
                codes: cache.codes,
                cached: true,
                stale: true // 标记为过期缓存
            };
        }
        
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to fetch codes',
        });
    }
});
