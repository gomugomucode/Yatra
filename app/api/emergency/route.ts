import { NextResponse } from 'next/server';
import { coordSchema } from '@/lib/utils/coordSchema';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { busId, busNumber, driverName, location, type } = body;

        const locationParse = coordSchema.safeParse(location);
        if (!locationParse.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid emergency location coordinates' },
                { status: 400 }
            );
        }

        // In a real app, this would integrate with Twilio or a similar service
        // to place an automated voice call to emergency services or the fleet manager.

        console.log('🚨 EMERGENCY API TRIGGERED 🚨');
        console.log('--------------------------------');
        console.log(`Type: ${type.toUpperCase()}`);
        console.log(`Bus: ${busNumber} (${busId})`);
        console.log(`Driver: ${driverName}`);
        console.log(`Location: ${locationParse.data.lat}, ${locationParse.data.lng}`);
        console.log('Action: Simulating call to 100...');
        console.log('--------------------------------');

        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, 1000));

        return NextResponse.json({
            success: true,
            message: 'Emergency services notified',
            callId: 'mock-call-' + Date.now()
        });
    } catch (error) {
        console.error('Emergency API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process emergency alert' },
            { status: 500 }
        );
    }
}
