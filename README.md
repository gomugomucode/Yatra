<div align="center">

<img src="https://img.shields.io/badge/STATUS-LIVE%20BETA-10b981?style=for-the-badge" alt="Status: Live Beta" />

# · YATRA

### The DePIN Transport Protocol for South Asia

**Real-time tracking · Soulbound receipts · ZK identity · On-chain reputation**

Every journey, verified. Every driver, accountable. Every rupee, traceable.

<br />

[Launch App](https://yatra-chi.vercel.app) · [Documentation](#architecture)  · [Contributing](#contributing)

<br />

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Solana](https://img.shields.io/badge/Solana_Token--2022-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Firebase](https://img.shields.io/badge/Firebase_RTDB-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Three.js](https://img.shields.io/badge/Three.js_R3F-000?style=flat-square&logo=three.js)](https://threejs.org)
[![ZK](https://img.shields.io/badge/ZK_Groth16-0057FF?style=flat-square)](https://docs.circom.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Why Yatra Exists

Nepal operates 12,000+ public buses carrying millions of passengers daily. Not a single trip produces a verifiable digital record. Drivers build years of service history that vanishes when they switch operators. Passengers receive paper tickets that disintegrate in their pockets. Transport regulators have zero real-time visibility into fleet operations. And across the broader South and Southeast Asian gig economy — 50 million ride-sharing drivers — reputation is locked inside platforms that can erase it overnight.

Yatra fixes this by combining three technologies that have never been unified in a single transit product:

| Problem | Yatra's Answer |
|---|---|
| Passengers cannot track buses | Real-time GPS with sub-3-second latency via Firebase Realtime DB |
| No verifiable driver identity | Mandatory ZK-SNARK (Groth16) anchored on Solana — identity verified & documents validated via AI authenticity checks during onboarding |
| No immutable trip records | Soulbound NFT receipt (Token-2022 NonTransferable) minted to the passenger's wallet on every trip |
| Driver reputation is not portable | On-chain DriverReputation PDA readable by any dApp without permission |
| No trustless fare payment | GPS-verified escrow — fare releases only when geofence confirms drop-off |

---

## Product

### For Passengers (यात्री)

- **Live bus tracking** — see every nearby driver within 10km on an interactive map, updated every 3 seconds
- **One-tap hailing** — select a driver, set your pickup point, and send a request that only that driver receives
- **Two-phase ETA** — Phase 1: driver's ETA to your pickup pin. Phase 2: ETA to your destination after boarding
- **Route visualization** — real-time polyline drawn from driver to pickup (cyan) and driver to destination (blue) via OSRM
- **Soulbound trip receipt** — a non-transferable NFT minted to your Solana wallet after every completed trip
- **Proximity alerts** — geofenced notifications at 500m, 200m, and 50m as the bus approaches
- **Loyalty tiers** — Bronze (5 trips), Silver (10), Gold (25) — on-chain badges that unlock priority booking

### For Drivers (चालक)

- **Integrated ZK Identity Setup** — mandatory verification of license and age (21+) directly in the driver profile form. AI-assisted authenticity checks on uploaded documents (front/back) before sealing identity.
- **Command center** — cockpit-style dashboard to manage route, seats, and live passengers
- **Trip request panel** — incoming requests slide up with a 90-second countdown. Accept or reject with one tap
- **On-chain trip logs** — every completed trip updates your DriverReputation PDA on Solana
- **Portable reputation** — your score (0–1000) is readable by any other transit app, insurance protocol, or DeFi lending platform
- **SOS emergency system** — one-tap SOS writes an alert to Firebase and sends an SMS to a registered emergency contact

### For Transport Offices (यातायात कार्यालय)

- **Fleet dashboard** — enter a number plate or driver ID, see the bus live on a map
- **Driver reputation lookup** — view any driver's on-chain score, trip count, ZK verification status
- **Real-time analytics** — trips tracked today, active buses, route coverage
- **Compliance monitoring** — programmatic vehicle tracking without trusting operator self-reporting

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                         │
│                                                           │
│  Passenger App (/passenger)    Driver App (/driver)       │
│  • Leaflet map + OSRM route   • Cockpit dashboard        │
│  • 10km radius driver filter  • TripRequestPanel          │
│  • ETA card (Phase 1 + 2)     • Accept / Reject / Board  │
│  • Soulbound receipt viewer   • Passenger "P" marker      │
│  • Wallet connect (Phantom)   • SOS emergency button      │
└──────────────┬────────────────────────┬───────────────────┘
               │                        │
               ▼                        ▼
┌───────────────────────────────────────────────────────────┐
│                   FIREBASE REALTIME DB                     │
│                                                           │
│  buses/{id}               ← driver GPS every 5s          │
│  drivers/active/{id}      ← presence + heading + speed   │
│  trips/{tripId}           ← status state machine         │
│    .status: requested → accepted → arrived → active       │
│             → completed                                   │
│  tripLocations/{tripId}/  ← participant-only paths       │
│    driver/                ← driver position (5s)         │
│    passenger/             ← passenger position (3s,      │
│                              published only after accept) │
│  users/{uid}              ← profile + role               │
│  bookings/                ← seat reservation records     │
│  alerts/                  ← SOS / emergency events       │
└──────────────┬────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────┐
│                 SOLANA SETTLEMENT LAYER                    │
│                                                           │
│  Token-2022 Soulbound NFT    ← minted per trip           │
│    NonTransferable extension ← cannot be moved            │
│    MetadataPointer extension ← trip data embedded         │
│                                                           │
│  DriverReputation PDA        ← on-chain driver score     │
│    seeds: ["driver_rep", driver_pubkey]                   │
│    fields: total_trips, avg_rating, zk_verified,          │
│            on_time_rate, sos_count                        │
│                                                           │
│  PassengerReputation PDA     ← on-chain passenger tier   │
│    seeds: ["passenger_rep", passenger_pubkey]             │
│    fields: total_rides, no_shows, loyalty_tier            │
│                                                           │
│  TripRecord PDA              ← immutable per-trip record │
│    seeds: ["trip", driver_pubkey, trip_id]                │
│                                                           │
│  EscrowAccount PDA           ← GPS-verified fare release │
│    seeds: ["escrow", trip_id]                             │
│                                                           │
│  ZK Commitment               ← Poseidon hash via Memo   │
└──────────────┬────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────┐
│                   ROUTING LAYER (OSRM)                    │
│                                                           │
│  Phase 1: driver → pickup pin ETA (30s refresh)          │
│  Phase 2: driver → destination ETA (after boarding)      │
│  GeoJSON LineString polyline rendered on Leaflet map      │
└───────────────────────────────────────────────────────────┘
```

### Trip Status State Machine

```
idle ──► requested ──► accepted ──► arrived ──► active ──► completed
              │                                              │
              ├──► rejected                                  └──► NFT minted
              ├──► cancelled                                      SMS sent
              └──► expired (5-min passenger / 90-sec driver)      Reputation updated
```

### Visibility and Privacy Model

| State | Passenger sees | Driver sees | Location data |
|---|---|---|---|
| `idle` | Anonymous driver pins within 10km | Nothing | Passenger GPS local only |
| `requested` | Selected driver moving | Pickup pin from trip record | Passenger NOT published |
| `accepted` | Driver live + ETA card | Passenger "P" marker live | Both publish to `tripLocations/` |
| `arrived` | "Driver has arrived" alert | "Passenger reached" alert | Both published |
| `active` | ETA to destination + polyline | Passenger location live | Both published |
| `completed` | Receipt NFT in wallet | Ready for next request | Publishing stops, path cleaned |

### Firebase Security Rules

| Path | Read | Write |
|---|---|---|
| `buses/` | All authenticated | Driver's own record only |
| `drivers/active/` | All authenticated | Driver's own record only |
| `trips/{id}` | Participant only | Any authenticated (creation) |
| `tripLocations/{id}/driver` | Participant only | Driver only |
| `tripLocations/{id}/passenger` | Participant only | Passenger only |
| `locations/{uid}` | Owner only | Owner only |
| `users/{uid}` | Any authenticated | Owner only |

---

## TRRL — Tokenized Ride-Sharing Reputation Layer

TRRL is the protocol layer that transforms Yatra from a transit app into infrastructure. It is a permissionless on-chain reputation system for ride-sharing drivers and passengers.

### Driver Reputation Score (0–1000)

```
base  = (completed_trips / total_trips) × 400        // Completion rate
      + (avg_rating / 5.0) × 300                      // Rating weight
      + min(on_time_arrivals / completed_trips, 1) × 200  // Punctuality
      + (zk_verified ? 100 : 0)                        // Identity bonus
      - (sos_triggered × 20)                           // Safety penalty
      = capped at 1000
```

### Cross-Platform Integration

Any dApp, insurance protocol, or lending platform can query a driver's reputation:

```typescript
import { YatraProtocol } from '@yatra/sdk';

const rep = await new YatraProtocol().getDriverReputation(driverWallet);
// {
//   totalRides: 847,
//   averageRating: 4.85,
//   isZkVerified: true,
//   onTimeRate: 0.93,
//   loyaltyTier: 'gold',
//   score: 892
// }
```

No API key. No permission. No agreement with Yatra. The data is on Solana — it is public, permissionless, and composable.

### Why This Matters

A driver in Butwal spends 5 years building a perfect rating. The operator closes. On every existing platform, that driver starts at zero. With TRRL, that driver's 1,247-trip history is on-chain. Any new platform reads it in 2 seconds. The driver's reputation is finally, for the first time, theirs.

---

## ZK Identity System

Yatra uses a Groth16 zero-knowledge circuit to verify driver identity without exposing raw credentials.

```
Input: [licenseNumber, birthYear]
         │
         ▼
  ┌──────────────────┐
  │  Poseidon Hash   │ ← commitment = H(license, birthYear)
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  Age Constraint  │ ← GreaterEqThan(18): birthYear ≤ currentYear - 18
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  Groth16 Proof   │ ← generated client-side via SnarkJS
  └────────┬─────────┘
           ▼
  Server: snarkjs.groth16.verify(vk, publicSignals, proof)
           │
           ▼
  On-chain: commitment anchored via Solana Memo tx
            Soulbound Badge minted automatically on devnet
             DriverProfile: isApproved = true, isVerified = true
```

The driver's license number and birth year never leave their device. Only the cryptographic proof and the Poseidon commitment are transmitted. The server verifies the math without seeing the inputs.

---

## Fare Escrow (GPS-Verified)

```
Passenger books trip
    │
    ▼
Fare locked in EscrowAccount PDA (devnet USDC)
    │
    ├── Driver completes trip
    │   │
    │   ▼
    │   GPS confirms drop-off within 200m of destination
    │   │
    │   ▼
    │   Escrow releases to driver's USDC ATA
    │
    └── 2-hour timeout with no completion
        │
        ▼
        Passenger reclaims escrow
```

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package manager |
| Solana CLI | 1.18+ | Keypair generation (optional) |
| Firebase project | — | Realtime Database + Authentication enabled |

### Installation

```bash
git clone https://github.com/AATechCulworx/yatra.git
cd yatra
npm install
```

### Environment Variables

Create `.env.local` in the project root:

```env
# --- FIREBASE (CLIENT-SIDE) ---
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_DATABASE_URL=your_database_url
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_key

# --- FIREBASE (SERVER-SIDE / ADMIN) ---
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="your_private_key"
FIREBASE_DATABASE_URL=your_database_url

# --- SOLANA ---
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_SERVER_PRIVATE_KEY=your_base58_encoded_private_key
SOLANA_SERVER_KEY=your_base58_encoded_private_key

# --- GOOGLE MAPS ---
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key

# --- SMS (SPARROW SMS) ---
SPARROWSMS_TOKEN=your_sparrow_sms_token

```

> **Security:** Never commit `.env.local` to git. The `.gitignore` already excludes it.

### Run

```bash
npm run dev        # Development server → http://localhost:3000
npm run build      # Production build
npm run start      # Production server
npm run lint       # ESLint
npx tsc --noEmit   # Type check without emitting
```

---

## Project Structure

```
yatra/
├── app/
│   ├── api/
│   │   ├── auth/             # Session login/logout, register, verify-driver
│   │   ├── bookings/         # Create, calculate-fare, booking lifecycle
│   │   ├── buses/            # Bus CRUD and state management
│   │   ├── trip-requests/    # Trip request creation + FCM notification
│   │   ├── solana/           # NFT minting, driver badge, trip completion
│   │   └── seed/             # Test data seeder (dev only)
│   ├── auth/                 # Login, signup, profile setup
│   ├── driver/               # Driver cockpit dashboard
│   ├── passenger/            # Passenger map + booking UI
│   ├── admin/                # Admin panel
│   └── page.tsx              # 3D immersive landing page
│
├── components/
│   ├── landing/              # Three.js 3D scene, scroll animations, navbar
│   ├── driver/               # TripRequestPanel, cockpit controls
│   ├── passenger/            # Booking UI, ETA cards, receipt viewer
│   ├── map/                  # Leaflet map, markers, route polyline
│   ├── onboarding/           # Role selection wizard
│   ├── ui/                   # shadcn/ui primitives (Radix-based)
│   └── shared/               # Common elements
│
├── lib/
│   ├── solana/
│   │   ├── connection.ts     # Solana RPC connection
│   │   ├── tripTicket.ts     # Token-2022 Soulbound NFT minting
│   │   ├── tokenExtensions.ts # Token-2022 extension helpers
│   │   ├── trrl.ts           # TRRL reputation SDK
│   │   └── escrow.ts         # Fare escrow operations
│   ├── zk/
│   │   ├── prover.ts         # Client-side Groth16 proof generation
│   │   └── verifier.ts       # Server-side snarkjs.groth16.verify()
│   ├── routing/
│   │   └── osrm.ts           # OSRM route + ETA fetching
│   ├── contexts/
│   │   └── AuthContext.tsx    # Firebase auth state + profile subscription
│   ├── utils/
│   │   ├── fareCalculator.ts # Distance-based fare calculation
│   │   ├── etaCalculator.ts  # ETA estimation
│   │   ├── geofencing.ts     # Haversine distance + radius checks
│   │   └── cn.ts             # clsx + tailwind-merge
│   ├── firebase.ts           # Client-side Firebase singleton
│   ├── firebaseAdmin.ts      # Server-side Admin SDK singleton
│   ├── firebaseDb.ts         # All RTDB operations
│   ├── types.ts              # Shared types + TripStatus + RequestStatus
│   └── constants.ts          # Vehicle types, defaults
│
├── hooks/
│   ├── useLiveLocation.ts    # GPS watch + Firebase publish
│   ├── useAccidentDetection.ts # Sudden deceleration detection
│   └── useProximityHandshake.ts # Geofenced proximity alerts
│
├── circuits/
│   └── driverIdentity.circom # Groth16 ZK circuit (Poseidon + age check)
│
├── middleware.ts              # Cookie-based route guards
├── database.rules.json        # Firebase security rules
└── package.json
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router), React 19 | Server components, API routes, edge middleware |
| **Language** | TypeScript 5 | Type safety across client + server + blockchain |
| **3D / Landing** | Three.js, @react-three/fiber, @react-three/drei, GSAP | Immersive 3D landing page with scroll-synced animation |
| **Smooth Scroll** | Lenis | Buttery scroll physics for the landing experience |
| **Blockchain** | Solana Web3.js, SPL Token-2022 | Soulbound NFTs, reputation PDAs, fare escrow |
| **ZK Identity** | SnarkJS (Groth16), Circom | Client-side proof generation, server-side verification |
| **Database** | Firebase Realtime DB + Admin SDK | Sub-second GPS sync, presence detection, onDisconnect |
| **Maps** | Leaflet.js + React-Leaflet | Lightweight, mobile-friendly map rendering |
| **Routing** | OSRM (Open Source Routing Machine) | Turn-by-turn ETA and GeoJSON route polylines |
| **Auth** | Firebase Authentication | Phone OTP, email/password, Google OAuth |
| **Forms** | React Hook Form + Zod | Validated, performant form handling |
| **UI** | Tailwind CSS v4, shadcn/ui, Framer Motion | Utility-first styling, accessible primitives, smooth animation |
| **Notifications** | Firebase Cloud Messaging + SparrowSMS | Push notifications + Nepal SMS delivery |

---

## Business Model

| Stream | Model | Scale |
|---|---|---|
| **Booking fee** | 1% of every fare | ~$100k ARR at 5% market penetration |
| **Fleet subscription** | NPR 500/bus/month for transport operators | Recurring B2B revenue |
| **Protocol API fee** | $0.001 per TRRL reputation query | Passive protocol revenue at scale |

---

## Roadmap

- [x] Firebase auth with phone OTP, email, and Google OAuth
- [x] Real-time GPS tracking with sub-3-second latency
- [x] Booking lifecycle with seat management
- [x] ZK prover (client-side Groth16 proof generation)
- [x] Token-2022 Soulbound NFT minting (devnet)
- [x] Proximity alerts (haversine geofencing)
- [x] OSRM integration for ETA and routing
- [x] 3D immersive landing page (Three.js + scroll animation)
- [x] Trip request + FCM push notification to driver
- [x] Driver accept/reject panel with 90-second countdown
- [x] Two-phase ETA (pickup + destination) with route polyline
- [x] Participant-only visibility (tripLocations path)
- [x] Passenger wallet connect (Phantom) + NFT receipt delivery
- [x] ZK verifier wired to `snarkjs.groth16.verify()`
- [ ] DriverReputation PDA (Anchor program on devnet)
- [ ] PassengerReputation PDA + loyalty badges
- [ ] Fare escrow with GPS-verified release
- [ ] Transport office dashboard (number plate → live map)
- [ ] `@yatra/sdk` npm package for third-party integration
- [ ] SparrowSMS integration for real notifications
- [ ] Mainnet deployment

---

## Contributing

Yatra is open source. Contributions are welcome.

```bash
# Fork the repo, create a branch, make changes, then:
npm run lint          # Must pass
npx tsc --noEmit      # Must pass
npm run build         # Must succeed
# Then open a PR
```

---

## Acknowledgments

- [Superteam Nepal](https://superteam.fun/earn/regions/nepal) — community and support
- [Solana Foundation](https://solana.org) — hackathon infrastructure
- [Colosseum](https://colosseum.com) — Frontier Hackathon platform
- [OSRM](https://project-osrm.org) — open-source routing engine

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

<br />

**Built in Butwal, Nepal 🇳🇵by Team Aparicchit**

**Powered by Solana ◎**

<br />

*Every journey, verified. Every driver, accountable. Every rupee, traceable.*

<br />

[yatra-chi.vercel.app](https://yatra-chi.vercel.app)

</div>
