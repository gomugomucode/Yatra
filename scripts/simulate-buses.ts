import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Configuration
const NUM_BUSES = 20;
const CENTER_LAT = 27.7172;
const CENTER_LNG = 85.3240;
const RADIUS = 0.05; // ~5km
const UPDATE_INTERVAL = 3000; // 3 seconds

// Initialize Firebase (Assumes env vars are set or service account is present)
// For local dev, we might need to mock or use specific creds
// This script assumes it's run in an environment with FIREBASE_SERVICE_ACCOUNT set
// or similar. For now, we'll just show the logic.

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('../service-account.json'); // Fallback

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://your-project.firebaseio.com"
    });
}

const db = getDatabase();

interface SimulatedBus {
    id: string;
    lat: number;
    lng: number;
    heading: number;
    speed: number;
}

const buses: SimulatedBus[] = [];

// Initialize buses
for (let i = 0; i < NUM_BUSES; i++) {
    buses.push({
        id: `SIM-BUS-${i + 1}`,
        lat: CENTER_LAT + (Math.random() - 0.5) * RADIUS,
        lng: CENTER_LNG + (Math.random() - 0.5) * RADIUS,
        heading: Math.random() * 360,
        speed: 20 + Math.random() * 40, // 20-60 km/h
    });
}

console.log(`Starting simulation for ${NUM_BUSES} buses...`);

setInterval(async () => {
    const updates: Record<string, any> = {};

    buses.forEach(bus => {
        // Move bus
        const dist = (bus.speed * (UPDATE_INTERVAL / 1000)) / 111000; // degrees approx
        const rad = bus.heading * (Math.PI / 180);

        bus.lat += Math.cos(rad) * dist;
        bus.lng += Math.sin(rad) * dist;

        // Randomly change heading slightly
        bus.heading += (Math.random() - 0.5) * 20;

        // Bounce off bounds (simple box)
        if (Math.abs(bus.lat - CENTER_LAT) > RADIUS) bus.heading += 180;
        if (Math.abs(bus.lng - CENTER_LNG) > RADIUS) bus.heading += 180;

        // Write to the canonical active drivers path
        updates[`drivers/active/${bus.id}`] = {
            id: bus.id,
            driverId: bus.id,
            role: 'driver',
            status: 'online',
            isOnline: true,
            lat: bus.lat,
            lng: bus.lng,
            heading: bus.heading,
            speed: bus.speed,
            timestamp: new Date().toISOString(),
        };

        // Also ensure they are active in 'buses' node (less frequent, but good for init)
        // We won't update 'buses' every time to avoid write amplification, 
        // but for simulation we assume they are already active.
    });

    try {
        await db.ref().update(updates);
        console.log(`Updated ${NUM_BUSES} bus locations.`);
    } catch (error) {
        console.error('Update failed:', error);
    }
}, UPDATE_INTERVAL);
