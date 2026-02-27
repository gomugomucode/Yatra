export interface Location {
  lat: number;
  lng: number;
  address?: string;
  timestamp: Date;
}

export type UserRole = 'driver' | 'passenger' | 'admin';

export interface LiveUser {
  uid: string;
  role: 'driver' | 'passenger';
  lat: number;
  lng: number;
  isOnline: boolean;
  updatedAt: string | number;
}

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: UserRole;
  createdAt: Date;
  solanaWallet?: string; // Phantom wallet address (for Solana features)
}

export interface Driver extends User {
  vehicleType: VehicleTypeId;
  vehicleNumber: string;
  capacity: number;
  licenseNumber: string;
  isApproved: boolean;
  rating?: number;
  verificationBadge?: {
    mintAddress: string;
    txSignature: string;
    explorerLink: string;
    verifiedAt: string;
  };
}

export interface PassengerUser extends User {
  emergencyContact?: string;
}

export type UserProfile = Driver | PassengerUser;

export type VehicleTypeId = 'bus' | 'others' | 'taxi' | 'bike';

export interface VehicleType {
  id: VehicleTypeId;
  name: string;
  icon: string;
  capacity: number;
  fareMultiplier: number;
  color: string;
}

export interface Bus {
  id: string;
  driverName: string;
  busNumber: string;
  route: string;
  currentLocation?: Location;
  destination: Location;
  passengers: Passenger[];
  capacity: number;
  isActive: boolean;
  emoji: string;
  vehicleType: VehicleTypeId;
  // Seat management fields
  onlineBookedSeats: number;      // Seats booked via app
  offlineOccupiedSeats: number;   // Manually tracked by driver
  availableSeats: number;          // Calculated: capacity - online - offline
  lastSeatUpdate: Date;            // For showing "Updated Xs ago"
  // Additional fields
  onlineBooked?: number;           // Alias for onlineBookedSeats
  offlineBooked?: number;          // Alias for offlineOccupiedSeats
  driverImage?: string;            // Base64 or URL
  vehicleImage?: string;           // Base64 or URL
}

export interface Passenger {
  id: string;
  name: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  status: 'waiting' | 'picked' | 'dropped';
  bookingTime: Date;
}

export interface Booking {
  id: string;
  passengerId: string;
  busId: string;
  passengerName: string;
  phoneNumber: string;
  email?: string;
  numberOfPassengers: number;
  pickupLocation: LocationWithTimestamp;
  dropoffLocation: LocationWithTimestamp;
  fare: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'expired';
  timestamp: Date;
  notes?: string;
  paymentMethod?: 'cash' | 'digital';
  // Booking timeout fields
  reservationExpiresAt?: Date;     // 10-minute timeout
  isExpired: boolean;
}

export interface LocationWithTimestamp {
  lat: number;
  lng: number;
  address?: string;
  timestamp: Date;
}

export interface RouteStop {
  name: string;
  location: Location;
  order: number;
}

export type AlertType = 'accident' | 'breakdown' | 'emergency';

export interface Alert {
  id: string;
  busId: string;
  busNumber: string;
  driverName: string;
  type: AlertType;
  location: Location;
  timestamp: string; // ISO string
  status: 'active' | 'resolved';
  details?: string;
}
