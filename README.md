<div align="center">

# यात्री · Yatra

**Nepal's Transit Ecosystem, Tokenized & Verifiable.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![ZK](https://img.shields.io/badge/Identity-ZK--Civic-0057FF?style=flat-square)](https://civic.com)

</div>

---

## Overview

**Yatra** (यात्री) is a decentralized transport application built for the Nepal transit ecosystem. It combines real-time bus tracking with blockchain-powered trust—issuing **Soulbound NFT receipts** on Solana for every trip and using **ZK-Civic** to verify driver identity without exposing private data.

---

## Problem Statement

Nepal's public transport lacks:
- **Real-time visibility** — passengers can't track buses live.
- **Trusted driver identity** — no verifiable credential system.
- **Immutable receipts** — tickets are physical, fragile, and untraceable.

---

## Solution Architecture

Yatra is built on a three-layer hybrid stack:

| Layer | Technology | Purpose |
|---|---|---|
| 🔗 **Settlement** | Solana Token-2022 | Soulbound NFT receipts per trip |
| 🛡️ **Identity** | ZK-Civic (Groth16 ZKP) | Driver verification without data exposure |
| 📡 **Telemetry** | Firebase Realtime DB | Live bus tracking & seat occupancy sync |

---

## Key Features

### 🚗 For Chalakh (चालक · Driver)
- **ZK Identity Onboarding** — Verified via on-chain ZK proof; no raw documents exposed.
- **Driver Command Center** — High-performance cockpit UI to manage route, seats, and passengers.
- **On-Chain Trip Logs** — Every completed trip is logged as an immutable Soulbound NFT.
- **SOS & Real-time Status** — Emergency alert system and live online/offline toggling.

### 🎒 For Yatri (यात्री · Passenger)
- **Live Bus Tracking** — Millisecond-latency location updates on an interactive Leaflet map.
- **Soulbound Receipts** — Non-transferable NFT proof of travel, minted on Solana after trip completion.
- **Proximity Notifications** — Geofenced alerts when the bus nears your pickup point.
- **Seat Transparency** — Real-time visibility into booked, occupied, and available seats.

---

## Ride Flow

### Passenger Flow

```
[Open App]
    │
    ▼
[Grant Location Permission]
    │  userLocation acquired → filteredBuses computed (10km radius)
    ▼
[See Nearby Drivers on Map]
    │  Only active drivers within 10km shown
    ▼
[Tap a Driver Pin]
    │  selectedBus set, pickup guide shown
    ▼
[Set Pickup Point]
    │  Tap map  ──or──  "Use my location"
    ▼
[Tap HAIL NOW]
    │  POST /api/trip-requests/create
    │  trip.status = "requested"
    │  requestStatus = "requesting" (after API succeeds)
    ▼
[Waiting for Driver...]        ──────────────────► [5-min timeout → "expired"]
    │  driver gets FCM push + in-app toast
    │
    ├─► Driver Rejects → toast, requestStatus = "idle"
    │
    └─► Driver Accepts
            │  trip.status = "accepted"
            │  requestStatus = "accepted"
            │  Passenger starts publishing location to
            │    tripLocations/{tripId}/passenger every 3s
            │  Cyan ETA card appears: "X min to pickup"
            │  Cyan polyline drawn: driver → pickup pin
            ▼
        [Driver En Route to Pickup]
            │  ETA updates every 30s via OSRM
            │
            └─► Driver within 50m → trip.status = "arrived"
                    │  Full-screen arrival alert on both sides
                    ▼
                [Passenger Boards]
                    │  Driver taps "Passenger Boarded"
                    │  trip.status = "active"
                    │  requestStatus = "on-trip"
                    │  Blue ETA card: "X min to destination"
                    │  Blue polyline: driver → dropoff
                    ▼
                [Trip Underway]
                    │
                    └─► Driver taps "Complete Trip"
                            │  trip.status = "completed"
                            │  tripLocations/{tripId} deleted
                            │  NFT minted on Solana (Soulbound receipt)
                            │  SMS sent to passenger
                            ▼
                        [Trip Complete · NFT in Wallet]
```

---

### Driver Flow

```
[Open Driver Dashboard]
    │
    ▼
[Select Your Bus · Go Online]
    │  Location sharing enabled
    │  drivers/active/{driverId} updated every 5s
    │  onDisconnect presence hook attached
    ▼
[Waiting for Requests...]
    │  subscribeToTripRequests watches trips/{tripId}
    │  where driverId matches
    ▼
[Trip Request Arrives]
    │  FCM push notification + in-app toast
    │  TripRequestPanel slides up from bottom
    │  90-second countdown starts
    │
    ├─► Timer hits 0 → auto-reject → trip.status = "rejected"
    │
    ├─► Tap "Reject" → trip.status = "rejected"
    │
    └─► Tap "Accept"
            │  trip.status = "accepted"
            │  Panel shows: "Trip accepted — navigate to pickup"
            │  Green "P" marker appears on map (passenger location)
            │    (via tripLocations/{tripId}/passenger)
            ▼
        [Navigate to Pickup Pin]
            │  Within 50m → proximity alert fires
            │  Driver dismisses → trip.status = "arrived"
            ▼
        [Passenger at Door]
            │  Tap "Passenger Boarded →"
            │  trip.status = "active"
            │  Panel shows: "Trip underway"
            ▼
        [Navigate to Destination]
            │
            └─► Tap "Complete Trip ✓"
                    │  trip.status = "completed"
                    │  handlePassengerDropoff called
                    │    → NFT minted, SMS sent
                    │  tripLocations/{tripId} cleaned up
                    ▼
                [Ready for Next Request]
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│                                                                 │
│  ┌──────────────────┐              ┌──────────────────────────┐ │
│  │  Passenger App   │              │      Driver App          │ │
│  │  /passenger      │              │      /driver             │ │
│  │                  │              │                          │ │
│  │ • LeafletMap     │              │ • LeafletMap             │ │
│  │ • filteredBuses  │              │ • TripRequestPanel       │ │
│  │   (10km radius)  │              │   (Accept/Reject/Board)  │ │
│  │ • ETA card       │              │ • Passenger "P" marker   │ │
│  │ • Route polyline │              │ • Route polyline         │ │
│  └────────┬─────────┘              └──────────┬───────────────┘ │
│           │                                   │                 │
└───────────┼───────────────────────────────────┼─────────────────┘
            │                                   │
            ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FIREBASE RTDB                              │
│                                                                 │
│  buses/{id}                   ← driver location every 5s       │
│  drivers/active/{id}          ← presence + heading/speed       │
│  trips/{tripId}               ← trip status state machine      │
│    .status: requested → accepted → arrived → active → completed │
│  tripLocations/{tripId}/      ← participant-only read/write     │
│    driver                     ← driver position (5s)           │
│    passenger                  ← passenger position (3s, post-  │
│                                  accept only)                   │
│  users/{uid}                  ← profile + role                 │
│  bookings/                    ← seat reservation records       │
│  alerts/                      ← SOS / emergency events         │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API LAYER (Next.js)                       │
│                                                                 │
│  POST /api/auth/register        → set custom role claim        │
│  POST /api/sessionLogin         → issue httpOnly session cookie │
│  POST /api/trip-requests/create → write trip + send FCM push   │
│  POST /api/sessionLogout        → clear session + role cookies  │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SETTLEMENT LAYER                            │
│                                                                 │
│  Solana Devnet                                                  │
│  • Token-2022 Soulbound NFT minted on trip completion          │
│  • ZK-Civic Groth16 proof anchored via on-chain Memo tx        │
│  • Driver identity committed without raw credential exposure    │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ROUTING LAYER                                 │
│                                                                 │
│  OSRM (project-osrm.org)                                       │
│  • Phase 1: driver → pickup pin ETA (updates every 30s)        │
│  • Phase 2: driver → destination ETA (after boarding)          │
│  • GeoJSON LineString polyline rendered on passenger map        │
└─────────────────────────────────────────────────────────────────┘
```

### Trip Status State Machine

```
  idle ──► requested ──► accepted ──► arrived ──► active ──► completed
                │                                              │
                └──► rejected                                  └──► NFT minted
                │                                                   SMS sent
                └──► cancelled
                │
                └──► expired  (5-min passenger timeout /
                               90-sec driver countdown)
```

### Security Model

| Path | Read | Write |
|---|---|---|
| `buses/` | Public | Driver only (own record) |
| `drivers/active/` | Public | Driver only (own record) |
| `trips/{id}` | Participant only (driver or passenger) | Any authenticated user |
| `tripLocations/{id}/driver` | Participant only | Driver only |
| `tripLocations/{id}/passenger` | Participant only | Passenger only |
| `locations/{uid}` | Owner only | Owner only |
| `users/{uid}` | Any authenticated | Owner only |

---

## Technical Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS v4, Framer Motion |
| **Blockchain** | Solana Web3.js, SPL Token-2022, SnarkJS (Groth16) |
| **Identity** | Civic Pass / ZK-Civic |
| **Database** | Firebase Realtime DB + Admin SDK |
| **Maps** | Leaflet.js + React-Leaflet |
| **Auth** | Firebase Authentication |
| **Validation** | Zod, React Hook Form |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Solana keypair (for minting receipts)
- A Firebase project with Realtime Database enabled

### Installation

```bash
git clone https://github.com/your-repo/yatra.git
cd yatra
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# ── Solana ──────────────────────────────────────────
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_KEYPAIR=[your_base58_or_array_private_key]

# ── Firebase Client ──────────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# ── Firebase Admin SDK (server-side) ────────────────
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
```

### Run

```bash
npm run dev
# → http://localhost:3000
```

---

## Project Structure

```
yatra/
├── app/
│   ├── api/            # API routes (auth, bookings, buses)
│   ├── driver/         # Driver console (चालक)
│   ├── passenger/      # Passenger dashboard (यात्री)
│   └── page.tsx        # Landing page
├── components/
│   ├── driver/         # Driver-specific UI
│   ├── passenger/      # Passenger-specific UI
│   ├── map/            # Leaflet map components
│   └── shared/         # Common UI elements
├── lib/
│   ├── solana/         # Token-2022 minting & connection
│   ├── zk/             # Groth16 prover & verifier
│   └── firebaseDb.ts   # Real-time DB operations
└── circuits/           # ZK circuit definitions
```

---

<div align="center">

🇳🇵 **Built By HASAN GAHA. Powered by Solana.**

</div>
