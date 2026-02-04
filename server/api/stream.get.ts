import { getTenantCache, subscribeTenantCache } from "../utils/cache";
import { requireTenant } from "../utils/auth";

export default defineEventHandler((event) => {
  const tenant = requireTenant(event);
  const res = event.node.res;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const send = (payload: any) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const cached = getTenantCache(tenant.id);
  if (cached) {
    send({ type: "codes", data: cached, tenantId: tenant.id });
  }

  const unsubscribe = subscribeTenantCache(tenant.id, (nextCache) => {
    send({ type: "codes", data: nextCache, tenantId: tenant.id });
  });

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  res.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});
