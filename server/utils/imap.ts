import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface VerificationCode {
    code: string;
    sender: string;
    recipient?: string;
    subject: string;
    date: Date;
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

                            const matches = (subject + ' ' + body).match(/\b\d{6}\b/g) || [];
                            if (matches.length > 0) {
                                for (const match of matches) {
                                    codes.push({
                                        code: match,
                                        sender: fromAddress || 'Unknown',
                                        recipient: parsed.to ? (Array.isArray(parsed.to) ? parsed.to[0].text : parsed.to.text) : 'Unknown',
                                        subject,
                                        date: parsed.date || new Date(),
                                    });
                                }
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
        console.error('IMAP error:', err);
        throw err;
    }

    return codes.sort((a, b) => b.date.getTime() - a.date.getTime());
}
