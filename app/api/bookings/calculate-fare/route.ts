import { NextResponse } from 'next/server';
import { calculateFareFromLocations } from '@/lib/utils/fareCalculator';
import { VehicleTypeId } from '@/lib/types';
import { coordSchema } from '@/lib/utils/coordSchema';

export async function POST(request: Request) {
  try {
    const {
      pickupLocation,
      dropoffLocation,
      vehicleType,
      numberOfPassengers = 1,
    } = await request.json();

    // Validate input
    if (!pickupLocation || !dropoffLocation || !vehicleType) {
      return NextResponse.json(
        {
          error: 'Missing required fields: pickupLocation, dropoffLocation, vehicleType',
        },
        { status: 400 }
      );
    }

    const pickupParse = coordSchema.safeParse(pickupLocation);
    if (!pickupParse.success) {
      return NextResponse.json(
        { error: 'Invalid pickupLocation coordinates' },
        { status: 400 }
      );
    }

    const dropoffParse = coordSchema.safeParse(dropoffLocation);
    if (!dropoffParse.success) {
      return NextResponse.json(
        { error: 'Invalid dropoffLocation coordinates' },
        { status: 400 }
      );
    }

    const validVehicleTypes: VehicleTypeId[] = ['bus', 'others', 'taxi', 'bike'];
    if (!validVehicleTypes.includes(vehicleType)) {
      return NextResponse.json(
        { error: `Invalid vehicleType. Must be one of: ${validVehicleTypes.join(', ')}` },
        { status: 400 }
      );
    }

    if (numberOfPassengers < 1 || numberOfPassengers > 50) {
      return NextResponse.json(
        { error: 'numberOfPassengers must be between 1 and 50' },
        { status: 400 }
      );
    }

    // Calculate fare
    const fare = calculateFareFromLocations(
      pickupParse.data,
      dropoffParse.data,
      vehicleType,
      numberOfPassengers
    );

    return NextResponse.json({
      fare,
      currency: 'NPR',
      vehicleType,
      numberOfPassengers,
    });
  } catch (error) {
    console.error('[calculate-fare] error', error);
    const message =
      error instanceof Error ? error.message : 'Failed to calculate fare';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

