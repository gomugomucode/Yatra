import { get, query, ref, orderByChild, equalTo } from 'firebase/database';
import { getDb } from '@/lib/firebaseDb';

export interface DriverReputationView {
  driverId: string;
  driverPubkey: string;
  totalTrips: number;
  completedTrips: number;
  avgRatingX100: number;
  onTimeArrivals: number;
  zkVerified: boolean;
  sosTriggered: number;
  score: number;
  lastSolanaTx?: string;
  reputationPDA?: string;
}

export interface TripView {
  id: string;
  driverId: string;
  passengerId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  pickupLocation?: { lat: number; lng: number; address?: string };
  dropoffLocation?: { lat: number; lng: number; address?: string };
}

export class YatraProtocol {
  private readonly db = getDb();

  async getDriverReputation(driverId: string): Promise<DriverReputationView | null> {
    const snap = await get(ref(this.db, `reputation/drivers/${driverId}`));
    if (!snap.exists()) return null;
    const rep = snap.val();
    return {
      driverId,
      driverPubkey: rep.driverPubkey || '',
      totalTrips: rep.totalTrips || 0,
      completedTrips: rep.completedTrips || 0,
      avgRatingX100: rep.avgRatingX100 || 0,
      onTimeArrivals: rep.onTimeArrivals || 0,
      zkVerified: !!rep.zkVerified,
      sosTriggered: rep.sosTriggered || 0,
      score: rep.score || 0,
      lastSolanaTx: rep.lastSolanaTx || undefined,
      reputationPDA: rep.reputationPDA || undefined,
    };
  }

  async getTripById(tripId: string): Promise<TripView | null> {
    const snap = await get(ref(this.db, `trips/${tripId}`));
    if (!snap.exists()) return null;
    const trip = snap.val();
    return {
      id: trip.id || tripId,
      driverId: trip.driverId,
      passengerId: trip.passengerId,
      status: trip.status,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
    };
  }

  async listTripsByDriver(driverId: string): Promise<TripView[]> {
    const snap = await get(query(ref(this.db, 'trips'), orderByChild('driverId'), equalTo(driverId)));
    if (!snap.exists()) return [];
    const rows = snap.val() as Record<string, any>;
    return Object.entries(rows).map(([id, trip]) => ({
      id: trip.id || id,
      driverId: trip.driverId,
      passengerId: trip.passengerId,
      status: trip.status,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
    }));
  }

  async listTripsByPassenger(passengerId: string): Promise<TripView[]> {
    const snap = await get(query(ref(this.db, 'trips'), orderByChild('passengerId'), equalTo(passengerId)));
    if (!snap.exists()) return [];
    const rows = snap.val() as Record<string, any>;
    return Object.entries(rows).map(([id, trip]) => ({
      id: trip.id || id,
      driverId: trip.driverId,
      passengerId: trip.passengerId,
      status: trip.status,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
    }));
  }
}

