import { ImapFlow } from "imapflow";
import { fetchChatGPTCodes } from "../utils/imap";
import { setCache } from "../utils/cache";

const globalKey = "__imapIdleStarted__";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.EMAIL_HOST || "imap.qq.com",
    port: parseInt(process.env.EMAIL_PORT || "993"),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASS || "",
    },
    logger: false,
  });
}

async function refreshNow(): Promise<void> {
  const codes = await fetchChatGPTCodes();
  setCache(codes);
}

async function runSession(): Promise<void> {
  const client = createClient();
  let refreshTimer: NodeJS.Timeout | null = null;

  const scheduleRefresh = () => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      try {
        await refreshNow();
      } catch (err) {
        console.error("IMAP refresh error:", err);
      }
    }, 500);
  };

  client.on("exists", () => scheduleRefresh());
  client.on("expunge", () => scheduleRefresh());
  client.on("flags", () => scheduleRefresh());

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    scheduleRefresh();

    while (true) {
      await client.idle();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

async function startWatcher(): Promise<void> {
  if (process.env.IMAP_IDLE === "false") return;

  let backoff = 1000;
  const maxBackoff = 60_000;

  while (true) {
    try {
      await runSession();
      backoff = 1000;
    } catch (err) {
      console.error("IMAP idle error:", err);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, maxBackoff);
    }
  }
}

export default defineNitroPlugin(() => {
  const g = globalThis as any;
  if (g[globalKey]) return;
  g[globalKey] = true;
  startWatcher();
});
