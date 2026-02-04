import { ImapFlow } from "imapflow";
import { fetchChatGPTCodes, isTransientImapTlsError } from "../utils/imap";
import { setCachesByTenant } from "../utils/cache";
import { getAllTenantIds, groupCodesByTenant } from "../utils/tenant";

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
  const grouped = groupCodesByTenant(codes);
  setCachesByTenant(getAllTenantIds(), grouped);
}

async function runSession(): Promise<void> {
  const client = createClient();
  let refreshTimer: NodeJS.Timeout | null = null;

  client.on("error", (err) => {
    if (isTransientImapTlsError(err)) {
      console.warn("IMAP IDLE TLS transient error, reconnecting:", (err as any)?.message || err);
      return;
    }
    console.error("IMAP IDLE client error:", err);
  });

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
      if (isTransientImapTlsError(err)) {
        console.warn("IMAP idle TLS transient error:", (err as any)?.message || err);
      } else {
        console.error("IMAP idle error:", err);
      }
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
