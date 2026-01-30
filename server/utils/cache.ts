export interface CacheData {
  codes: any[];
  timestamp: number;
}

type CacheListener = (cache: CacheData) => void;

let cache: CacheData | null = null;
const listeners = new Set<CacheListener>();

export function getCache(): CacheData | null {
  return cache;
}

export function setCache(codes: any[], timestamp: number = Date.now()): void {
  cache = { codes, timestamp };
  for (const listener of listeners) {
    listener(cache);
  }
}

export function subscribeCache(listener: CacheListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
