/**
 * Mock SMS Service
 * In production, replace this with Twilio, SparrowSMS, or AakashSMS integration.
 */
export const sendSMS = async (to: string, message: string): Promise<boolean> => {
    if (process.env.NODE_ENV !== 'production') {
        console.debug(`[SMS MOCK] sending SMS to ${to.slice(0, 4)}...`);
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return true;
};
