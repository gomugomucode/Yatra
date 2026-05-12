import type { Bus, Passenger, VehicleType, VehicleTypeId } from './types';

// Butwal, Nepal coordinates
export const BUTWAL_CENTER = {
  lat: 27.6588,
  lng: 83.4534,
};

// Butwal, Devinagar coordinates (default location)
export const DEFAULT_LOCATION = {
  lat: 27.6921,
  lng: 83.4615,
};

export const BUS_EMOJIS = ['🚌', '🚎', '🚍', '🚐', '🚋'];
export const PASSENGER_EMOJI = '👤';

export const VEHICLE_TYPES: VehicleType[] = [
  {
    id: 'bus',
    name: 'Bus',
    icon: '🚌',
    capacity: 40,
    fareMultiplier: 1.0,
    color: '#2563eb', // blue
  },
  {
    id: 'others',
    name: 'Others',
    icon: '🚐',
    capacity: 15,
    fareMultiplier: 1.2,
    color: '#16a34a', // green
  },
  {
    id: 'taxi',
    name: 'Taxi',
    icon: '🚕',
    capacity: 4,
    fareMultiplier: 2.5,
    color: '#eab308', // yellow
  },
  {
    id: 'bike',
    name: 'Bike',
    icon: '🏍️',
    capacity: 2,
    fareMultiplier: 1.5,
    color: '#dc2626', // red
  },

];

export const VEHICLE_TYPE_MAP: Record<VehicleTypeId, VehicleType> = VEHICLE_TYPES.reduce(
  (acc, type) => {
    acc[type.id] = type;
    return acc;
  },
  {} as Record<VehicleTypeId, VehicleType>
);

export const ROUTES = [
  {
    name: 'Butwal Main Route',
    stops: [
      { name: 'Devinagar', lat: 27.6921, lng: 83.4615 },
      { name: 'Tilottama', lat: 27.7000, lng: 83.4500 },
      { name: 'Manigram', lat: 27.7100, lng: 83.4400 },
      { name: 'Sunauli Border', lat: 27.5000, lng: 83.4500 },
    ],
  },
  {
    name: 'Butwal City Circular',
    stops: [
      { name: 'Devinagar', lat: 27.6921, lng: 83.4615 },
      { name: 'Bus Park', lat: 27.6800, lng: 83.4700 },
      { name: 'Bhairahawa', lat: 27.5000, lng: 83.4484 },
      { name: 'Lumbini', lat: 27.4692, lng: 83.2811 },
    ],
  },
];

export const MOCK_BUSES: Bus[] = [
  {
    id: 'bus-001',
    driverName: 'Rajesh Thapa',
    busNumber: 'Lu 1 Pa 2345',
    route: 'Butwal Main Route',
    currentLocation: { lat: 27.6921, lng: 83.4615, timestamp: new Date() },
    destination: { lat: 27.5000, lng: 83.4500, timestamp: new Date() },
    passengers: [],
    capacity: VEHICLE_TYPE_MAP.bus.capacity,
    isActive: true,
    emoji: VEHICLE_TYPE_MAP.bus.icon,
    vehicleType: 'bus',
    driverId: 'mock-driver-123',
    driverWalletAddress: 'H8k4...mock',
    onlineBookedSeats: 0,
    offlineOccupiedSeats: 0,
    availableSeats: VEHICLE_TYPE_MAP.bus.capacity,
    lastSeatUpdate: new Date(),
  },
  {
    id: 'bus-002',
    driverName: 'Suresh Gurung',
    busNumber: 'Lu 1 Pa 5678',
    route: 'Butwal City Circular',
    currentLocation: { lat: 27.7000, lng: 83.4500, timestamp: new Date() },
    destination: { lat: 27.4692, lng: 83.2811, timestamp: new Date() },
    passengers: [],
    capacity: VEHICLE_TYPE_MAP.others.capacity,
    isActive: true,
    emoji: VEHICLE_TYPE_MAP.others.icon,
    vehicleType: 'others',
    driverId: 'mock-driver-456',
    driverWalletAddress: 'J2m1...mock',
    onlineBookedSeats: 0,
    offlineOccupiedSeats: 0,
    availableSeats: VEHICLE_TYPE_MAP.others.capacity,
    lastSeatUpdate: new Date(),
  },
  {
    id: 'bus-003',
    driverName: 'Kabita Karki',
    busNumber: 'Lu 2 Ta 9101',
    route: 'Butwal Main Route',
    currentLocation: { lat: 27.6800, lng: 83.4700, timestamp: new Date() },
    destination: { lat: 27.5000, lng: 83.4500, timestamp: new Date() },
    passengers: [],
    capacity: VEHICLE_TYPE_MAP.taxi.capacity,
    isActive: true,
    emoji: VEHICLE_TYPE_MAP.taxi.icon,
    vehicleType: 'taxi',
    driverId: 'mock-driver-789',
    driverWalletAddress: 'L9p5...mock',
    onlineBookedSeats: 0,
    offlineOccupiedSeats: 0,
    availableSeats: VEHICLE_TYPE_MAP.taxi.capacity,
    lastSeatUpdate: new Date(),
  },
  {
    id: 'bus-004',
    driverName: 'Ramesh Bhandari',
    busNumber: 'Lu 3 Pa 2222',
    route: 'Butwal City Circular',
    currentLocation: { lat: 27.7100, lng: 83.4400, timestamp: new Date() },
    destination: { lat: 27.4692, lng: 83.2811, timestamp: new Date() },
    passengers: [],
    capacity: VEHICLE_TYPE_MAP.bike.capacity,
    isActive: true,
    emoji: VEHICLE_TYPE_MAP.bike.icon,
    vehicleType: 'bike',
    driverId: 'mock-driver-222',
    driverWalletAddress: 'K1w9...mock',
    onlineBookedSeats: 0,
    offlineOccupiedSeats: 0,
    availableSeats: VEHICLE_TYPE_MAP.bike.capacity,
    lastSeatUpdate: new Date(),
  },
  {
    id: 'bus-005',
    driverName: 'Sunita Magar',
    busNumber: 'Lu 1 Pa 3456',
    route: 'Butwal Main Route',
    currentLocation: { lat: 27.6588, lng: 83.4534, timestamp: new Date() },
    destination: { lat: 27.5000, lng: 83.4500, timestamp: new Date() },
    passengers: [],
    capacity: VEHICLE_TYPE_MAP.bus.capacity,
    isActive: true,
    emoji: VEHICLE_TYPE_MAP.bus.icon,
    vehicleType: 'bus',
    driverId: 'mock-driver-333',
    driverWalletAddress: 'M5n2...mock',
    onlineBookedSeats: 0,
    offlineOccupiedSeats: 0,
    availableSeats: VEHICLE_TYPE_MAP.bus.capacity,
    lastSeatUpdate: new Date(),
  },
];

export const MOCK_PASSENGERS: Passenger[] = [
  {
    id: 'pass-001',
    name: 'Amit Sharma',
    pickupLocation: { lat: 27.6921, lng: 83.4615, timestamp: new Date() },
    dropoffLocation: { lat: 27.5000, lng: 83.4500, timestamp: new Date() },
    status: 'waiting',
    bookingTime: new Date(),
  },
  {
    id: 'pass-002',
    name: 'Priya Joshi',
    pickupLocation: { lat: 27.7000, lng: 83.4500, timestamp: new Date() },
    dropoffLocation: { lat: 27.4692, lng: 83.2811, timestamp: new Date() },
    status: 'waiting',
    bookingTime: new Date(),
  },
];
