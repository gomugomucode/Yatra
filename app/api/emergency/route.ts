import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { z } from 'zod';

const emergencySchema = z.object({
    busId: z.string().min(1),
    busNumber: z.string().min(1),
    driverName: z.string().min(1),
    type: z.enum(['accident', 'breakdown', 'emergency']),
    location: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180)
    })
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        const parseResult = emergencySchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid emergency payload fields.', details: parseResult.error.format() },
                { status: 400 }
            );
        }

        const { busId, busNumber, driverName, location, type } = parseResult.data;

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
