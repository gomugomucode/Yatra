const SPARROW_API = 'https://api.sparrowsms.com/v2/sms/';

export const sendSMS = async (to: string, message: string): Promise<boolean> => {
    const token = process.env.SPARROWSMS_TOKEN;

    if (!token) {
        console.debug(`[SMS] No SPARROWSMS_TOKEN set — skipping. To: ${to.slice(0, 6)}... | Msg: ${message}`);
        return false;
    }

    try {
        const res = await fetch(SPARROW_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                from: process.env.SPARROWSMS_SENDER_ID || 'Demo',
                to,
                text: message,
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`[SMS] SparrowSMS error ${res.status}: ${body}`);
            return false;
        }

        return true;
    } catch (err: any) {
        console.error('[SMS] Request failed:', err.message);
        return false;
    }
};
