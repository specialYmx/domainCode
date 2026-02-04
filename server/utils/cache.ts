export interface CacheData {
  codes: any[];
  timestamp: number;
}

type CacheListener = (cache: CacheData) => void;

const tenantCache = new Map<string, CacheData>();
const tenantListeners = new Map<string, Set<CacheListener>>();

export function getTenantCache(tenantId: string): CacheData | null {
  return tenantCache.get(tenantId) || null;
}

export function setTenantCache(
  tenantId: string,
  codes: any[],
  timestamp: number = Date.now(),
): void {
  const next = { codes, timestamp };
  tenantCache.set(tenantId, next);
  const listeners = tenantListeners.get(tenantId);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(next);
  }
}

export function setCachesByTenant(
  tenantIds: string[],
  codesByTenant: Record<string, any[]>,
  timestamp: number = Date.now(),
): void {
  for (const tenantId of tenantIds) {
    setTenantCache(tenantId, codesByTenant[tenantId] || [], timestamp);
  }
}

export function subscribeTenantCache(
  tenantId: string,
  listener: CacheListener,
): () => void {
  let listeners = tenantListeners.get(tenantId);
  if (!listeners) {
    listeners = new Set<CacheListener>();
    tenantListeners.set(tenantId, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = tenantListeners.get(tenantId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      tenantListeners.delete(tenantId);
    }
  };
}
