import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface VerificationCode {
    code: string;
    sender: string;
    recipient?: string;
    subject: string;
    date: Date;
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
                const uids = await client.search({
                    from: process.env.NEXT_PUBLIC_SENDER_FILTER || 'noreply@tm.openai.com',
                });

                if (uids && uids.length > 0) {
                    // Only fetch last 20 to keep it fast
                    const recentUids = uids.slice(-20);

                    for (const uid of recentUids) {
                        const msg = await client.fetchOne(uid.toString(), { source: true });
                        if (msg && msg.source) {
                            const parsed = await simpleParser(msg.source);

                            const subject = parsed.subject || '';
                            const body = parsed.text || '';

                            if (subject.toLowerCase().includes('chatgpt') || subject.includes('验证码')) {
                                const codeMatch = (subject + ' ' + body).match(/\b\d{6}\b/);
                                if (codeMatch) {
                                    codes.push({
                                        code: codeMatch[0],
                                        sender: parsed.from?.value[0]?.address || 'Unknown',
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
