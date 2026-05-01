import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { busId, busNumber, driverName, location, type } = body;

        if (
            !busId ||
            !busNumber ||
            !driverName ||
            !type ||
            !Number.isFinite(location?.lat) ||
            !Number.isFinite(location?.lng)
        ) {
            return NextResponse.json(
                { success: false, error: 'Missing required emergency payload fields.' },
                { status: 400 }
            );
        }

        const adminDb = getAdminDb();
        const incidentRef = adminDb.ref('emergencyIncidents').push();
        const incidentId = incidentRef.key;
        await incidentRef.set({
            id: incidentId,
            busId,
            busNumber,
            driverName,
            type,
            location,
            status: 'open',
            createdAt: new Date().toISOString(),
            dispatch: 'manual_required',
        });

        return NextResponse.json({
            success: true,
            message: 'Emergency incident recorded. Manual dispatch required.',
            incidentId,
            dispatch: 'manual_required',
        });
    } catch (error) {
        console.error('Emergency API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process emergency alert' },
            { status: 500 }
        );
    }
}
