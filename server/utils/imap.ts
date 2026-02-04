import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface VerificationCode {
    code: string;
    sender: string;
    recipient?: string;
    normalizedRecipient?: string;
    subject: string;
    date: Date;
}

interface CodeCandidate {
    code: string;
    index: number;
    text: string;
    sourceWeight: number;
}

export function isTransientImapTlsError(error: unknown): boolean {
    const code = typeof error === "object" && error && "code" in error
        ? String((error as any).code || "")
        : "";
    const message = typeof error === "object" && error && "message" in error
        ? String((error as any).message || "").toLowerCase()
        : "";
    const reason = typeof error === "object" && error && "reason" in error
        ? String((error as any).reason || "").toLowerCase()
        : "";

    if (code === "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC") return true;
    if (reason.includes("bad record mac")) return true;
    if (message.includes("bad record mac")) return true;
    if (message.includes("decryption failed")) return true;
    return false;
}

function parseList(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function senderAllowed(sender: string, allowedSenders: string[], allowedDomains: string[]): boolean {
    if (!sender) return false;
    const normalized = sender.toLowerCase();
    if (allowedSenders.length === 0 && allowedDomains.length === 0) return true;
    if (allowedSenders.includes(normalized)) return true;
    for (const domain of allowedDomains) {
        if (normalized.endsWith(`@${domain}`)) return true;
    }
    return false;
}

function normalizeEmailAddress(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    const match = normalized.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    if (!match) return null;
    return match[1];
}

function extractFromHeaderValue(value: unknown): string[] {
    if (!value) return [];

    if (typeof value === "string") {
        return value
            .split(/[,\s]+/)
            .map((part) => normalizeEmailAddress(part))
            .filter((item): item is string => Boolean(item));
    }

    if (Array.isArray(value)) {
        const output: string[] = [];
        for (const item of value) {
            output.push(...extractFromHeaderValue(item));
        }
        return output;
    }

    if (typeof value === "object" && value && "value" in value) {
        const list = (value as any).value;
        if (!Array.isArray(list)) return [];
        return list
            .map((entry: any) => normalizeEmailAddress(entry?.address || ""))
            .filter((item: string | null): item is string => Boolean(item));
    }

    return [];
}

function extractRecipients(parsed: any): string[] {
    const recipients = new Set<string>();
    const headers = parsed?.headers;
    const headerCandidates = [
        headers?.get?.("x-original-to"),
        headers?.get?.("delivered-to"),
        headers?.get?.("envelope-to"),
        headers?.get?.("to"),
    ];

    for (const candidate of headerCandidates) {
        for (const email of extractFromHeaderValue(candidate)) {
            recipients.add(email);
        }
    }

    for (const email of extractFromHeaderValue(parsed?.to)) {
        recipients.add(email);
    }

    return Array.from(recipients);
}

function collectCandidates(text: string, sourceWeight: number): CodeCandidate[] {
    const results: CodeCandidate[] = [];
    const regex = /\b\d{6}\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        results.push({
            code: match[0],
            index: match.index,
            text,
            sourceWeight,
        });
    }
    return results;
}

function scoreCandidate(candidate: CodeCandidate): number {
    const keywords = [
        "验证码",
        "verification code",
        "verification",
        "passcode",
        "otp",
        "code",
    ];
    let bestDistance = Number.MAX_SAFE_INTEGER;
    const lower = candidate.text.toLowerCase();

    for (const keyword of keywords) {
        let start = 0;
        while (true) {
            const idx = lower.indexOf(keyword, start);
            if (idx === -1) break;
            const dist = Math.abs(candidate.index - idx);
            if (dist < bestDistance) bestDistance = dist;
            start = idx + keyword.length;
        }
    }

    const proximityScore = bestDistance === Number.MAX_SAFE_INTEGER ? 0 : 10000 - Math.min(bestDistance, 10000);
    return candidate.sourceWeight + proximityScore;
}

function pickBestCode(subject: string, body: string): string | null {
    const candidates = [
        ...collectCandidates(subject, 100000), // Prefer subject if other signals are similar.
        ...collectCandidates(body, 0),
    ];
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    return candidates[0].code;
}

export async function fetchChatGPTCodes(): Promise<VerificationCode[]> {
    const client = new ImapFlow({
        host: process.env.EMAIL_HOST || 'imap.qq.com',
        port: parseInt(process.env.EMAIL_PORT || '993'),
        secure: true,
        auth: {
            user: process.env.EMAIL_USER || '',
            pass: process.env.EMAIL_PASS || '',
        },
        logger: false,
    });

    const codes: VerificationCode[] = [];
    client.on("error", (err) => {
        if (isTransientImapTlsError(err)) {
            console.warn("IMAP TLS transient error, will retry:", (err as any)?.message || err);
            return;
        }
        console.error("IMAP client error:", err);
    });

    try {
        await client.connect();

        try {
            let lock = await client.getMailboxLock('INBOX');
            try {
                const sinceHours = parseFloat(process.env.IMAP_SINCE_HOURS || '3');
                const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

                const uids = await client.search({
                    since: sinceDate,
                });

                if (uids && uids.length > 0) {
                    const sortedUids = [...uids].sort((a, b) => a - b);
                    for (const uid of sortedUids) {
                        const msg = await client.fetchOne(uid.toString(), { source: true });
                        if (msg && msg.source) {
                            const parsed = await simpleParser(msg.source);

                            const subject = parsed.subject || '';
                            const body = parsed.text || '';
                            const fromAddress = parsed.from?.value[0]?.address || '';
                            const allowAnySender = (process.env.ALLOW_ANY_SENDER || "").toLowerCase() === "true";
                            const allowedSenders = parseList(process.env.ALLOWED_SENDERS || process.env.NEXT_PUBLIC_SENDER_FILTER);
                            const allowedDomains = parseList(process.env.ALLOWED_SENDER_DOMAINS);

                            if (!allowAnySender && !senderAllowed(fromAddress, allowedSenders, allowedDomains)) {
                                continue;
                            }

                            const bestCode = pickBestCode(subject, body);
                            if (bestCode) {
                                const recipients = extractRecipients(parsed);
                                const normalizedRecipient = recipients[0] || undefined;
                                codes.push({
                                    code: bestCode,
                                    sender: fromAddress || 'Unknown',
                                    recipient: normalizedRecipient || "Unknown",
                                    normalizedRecipient,
                                    subject,
                                    date: parsed.date || new Date(),
                                });
                            }
                        }
                    }
                }
            } finally {
                lock.release();
            }
        } finally {
            await client.logout();
        }
    } catch (err) {
        if (isTransientImapTlsError(err)) {
            console.warn("IMAP TLS transient error during fetch:", (err as any)?.message || err);
        } else {
            console.error('IMAP error:', err);
        }
        throw err;
    }

    return codes.sort((a, b) => b.date.getTime() - a.date.getTime());
}
