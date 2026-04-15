# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server → http://localhost:3000
npm run build     # Production build (runs Next.js compiler)
npm run start     # Start production server
npm run lint      # Run ESLint
```

No test suite is configured. TypeScript type checking: `npx tsc --noEmit`.

## Environment Variables

Requires a `.env.local` with two groups of Firebase credentials:

- `NEXT_PUBLIC_FIREBASE_*` — client-side Firebase config (API key, auth domain, project ID, database URL, app ID)
- `FIREBASE_*` — server-side Admin SDK (project ID, client email, private key, database URL)
- `SOLANA_RPC_URL` — defaults to devnet
- `SOLANA_KEYPAIR` — base58 or array private key used for minting NFT receipts server-side

The Firebase Realtime Database is hosted in **europe-west1**. If `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is unset, `lib/firebase.ts` builds the URL using that region.

## Architecture

Yatra is a Next.js 16 App Router application with three user roles: **driver (चालक)**, **passenger (यात्री)**, and **admin**. The stack is a hybrid of Firebase (auth + realtime DB) and Solana (NFT receipts + ZK identity).

### Auth & Routing

- `middleware.ts` — cookie-based session guard. Reads `session` and `role` cookies. Redirects unauthenticated users to `/auth` and enforces role-based routing between `/driver/*` and `/passenger/*`.
- `lib/contexts/AuthContext.tsx` — React context wrapping Firebase Auth. Manages `currentUser`, `userData` (from Realtime DB), and `role`. The role is written to a cookie on login so the middleware can read it server-side.
- `app/auth/` — login/OTP flow. Supports phone (SMS OTP via Firebase), email/password, and Google OAuth.
- `app/api/auth/sessionLogin` / `sessionLogout` — server API routes that issue/revoke Firebase session cookies.

### Data Layer

- `lib/firebase.ts` — singleton Firebase client app initialization (lazy).
- `lib/firebaseAdmin.ts` — Firebase Admin SDK for server API routes.
- `lib/firebaseDb.ts` — all Realtime Database operations: bus subscriptions, location updates, seat management, bookings, user profiles, and live presence.
- `lib/types.ts` — all shared types: `User`, `Driver`, `PassengerUser`, `Bus`, `Booking`, `Passenger`, `Location`, `Alert`, `VehicleTypeId`.

### Solana Layer (`lib/solana/`)

- `connection.ts` — creates a Solana `Connection` from `SOLANA_RPC_URL`.
- `tripTicket.ts` — mints **Soulbound NFT receipts** using SPL Token-2022. Uses the `NonTransferable` extension to prevent transfers. Metadata is embedded on-chain via the `MetadataPointer` extension. Called from `app/api/solana/mint-ticket/`.
- `tokenExtensions.ts` — helper for Token-2022 extension utilities.

### ZK Identity (`lib/zk/`, `circuits/`)

- `circuits/driverIdentity.circom` — Groth16 ZK circuit for driver identity.
- `lib/zk/prover.ts` — client-side prover using snarkjs. Takes `licenseNumber` + `birthYear`, generates a Poseidon commitment, and produces a proof. Runs in the browser.
- `lib/zk/verifier.ts` + `verification_key.json` — server-side proof verification.
- `app/api/auth/verify-driver/` — API route that verifies the ZK proof and writes a `verificationBadge` to the driver's Firebase profile.

### Custom Hooks (`hooks/`)

- `useLiveLocation.ts` — watches `navigator.geolocation` and publishes updates to Firebase.
- `useAccidentDetection.ts` — detects sudden deceleration via device sensors.
- `useProximityHandshake.ts` — geofenced proximity alerts for passengers when a bus approaches.

### Key Utilities (`lib/utils/`)

- `fareCalculator.ts` — fare calculation logic.
- `etaCalculator.ts` — ETA estimation.
- `geofencing.ts` — proximity/geofence checks.
- `cn.ts` — `clsx` + `tailwind-merge` utility (shadcn pattern).

### UI

- `components/ui/` — shadcn/ui primitives (Radix-based).
- `components/map/` — Leaflet/react-leaflet map components. Maps are client-only (`'use client'`); Leaflet cannot run SSR.
- `components/driver/` and `components/passenger/` — role-specific dashboards and panels.
- Styling: Tailwind CSS v4 + Framer Motion for animations + `tw-animate-css`.

### API Routes (`app/api/`)

| Route | Purpose |
|---|---|
| `auth/sessionLogin` | Exchange Firebase ID token for a session cookie |
| `auth/sessionLogout` | Clear session cookie |
| `auth/verify-driver` | Verify ZK proof, write badge to Firebase |
| `buses/` | Bus CRUD and state |
| `bookings/create`, `bookings/[id]` | Booking lifecycle |
| `bookings/calculate-fare` | Fare estimation endpoint |
| `solana/mint-ticket` | Mint Soulbound NFT receipt on Solana |
| `seed` | Seed Firebase with test data |

## Important Patterns

- **Singleton Firebase init**: Both `lib/firebase.ts` and `lib/firebaseAdmin.ts` use module-level singletons guarded by `getApps().length === 0` to avoid multiple initializations in Next.js hot-reload.
- **Server vs. client Firebase**: Admin SDK (`firebase-admin`) is strictly server-side. Client SDK (`firebase`) is used in browser and in client components. Never import `firebaseAdmin` from a client component.
- **Leaflet SSR**: All map components must be `'use client'` and typically wrapped in `dynamic(() => import(...), { ssr: false })` to avoid SSR crashes.
- **Role cookie flow**: Role is set in a JS cookie by `AuthContext` on login and read by `middleware.ts` for server-side routing. The session cookie (httpOnly) is separate and set by the `sessionLogin` API route.
- **ZK demo mode**: `zkDemoMode: true` on a `verificationBadge` means the proof was not cryptographically verified — used for testing without a valid circuit setup.
