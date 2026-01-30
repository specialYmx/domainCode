import { getCache, subscribeCache } from "../utils/cache";

export default defineEventHandler((event) => {
  const res = event.node.res;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const send = (payload: any) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const cached = getCache();
  if (cached) {
    send({ type: "codes", data: cached });
  }

  const unsubscribe = subscribeCache((nextCache) => {
    send({ type: "codes", data: nextCache });
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
