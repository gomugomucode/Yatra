# Changelog - Yatra Project Stabilization

All notable changes to this project are documented in this file.

## [2026-05-10] - Infrastructure & Reliability Overhaul

### 🚀 Real-time Signaling & Firebase Security
- **Fix**: Resolved `permission_denied` errors at `/bookings`, `/trips`, and `/locations` nodes by standardizing node-level read permissions for authenticated users.
- **New**: Added missing `.indexOn: ["driverId"]` to the `bookings` node in `database.rules.json` to enable efficient filtering.
- **Improvement**: Hardened `lib/firebaseDb.ts` with diagnostic logging for all real-time subscriptions.
- **New**: Implemented **Presence Cleanup** for drivers, ensuring offline status is reflected immediately upon disconnect.

### 📍 Geolocation & Driver Tracking
- **Refactor**: Replaced fragile interval-based tracking with a robust `watchPosition` implementation in the Driver Dashboard.
- **Fix**: Added handling for `GeolocationPositionError` (Permission Denied, Position Unavailable, Timeout) to prevent silent tracking failures.
- **Improvement**: Integrated a 5-second "heartbeat" flush to maintain high-frequency location updates for passengers even during browser throttling.

### 💳 Booking & Seat Management
- **New**: Implemented **Atomic Firebase Transactions** for seat count updates in `lib/seatManagement.ts` to prevent race conditions during peak hours.
- **New**: Added **Lazy Cleanup** for expired bookings in the booking creation API, automatically releasing seats from stale reservations.
- **Security**: Added a **Duplicate Booking Guard** to prevent passengers from having multiple active reservations simultaneously.
- **Reliability**: Implemented transaction rollbacks; if a booking record fails to persist, reserved seats are now automatically returned to the bus capacity.

### ⛓️ Solana NFT Ticketing & Reputation (TRRL)
- **Fix**: Standardized the server private key environment variable to `SOLANA_SERVER_PRIVATE_KEY` across all API routes.
- **New**: Connected the **Trip Rating System** to the **Trust & Reputation Layer (TRRL)**. Ratings now dynamically update the driver's blockchain-anchored score.
- **New**: Added support for both Base58 and JSON array private key formats in the Solana minting service.
- **Improvement**: Hardened the driver-side minting UI with proper response validation and "blockchain receipt" visibility.

### 🛠️ Environment & Deployment
- **New**: Created `lib/utils/url.ts` with `getAppUrl()` helper to intelligently resolve the base URL across Local, Vercel Preview, and Production environments.
- **New**: Created a comprehensive `.env.example` documenting all required Firebase, Solana, and App configuration variables.
- **Standardization**: Fixed regional mismatch where the Client SDK and Admin SDK were defaulting to different Firebase regions (US vs Europe).

## [Next Steps]
- [ ] Integrate passenger loyalty tiers into the TRRL system.
- [ ] Implement on-chain PDA storage for driver reputation (Phase 2).
- [ ] Add automated integration tests for the new transaction rollback logic.
