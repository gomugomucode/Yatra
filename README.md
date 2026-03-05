<div align="center">

# Yatra

**Nepal's Transit Ecosystem, Tokenized & Verifiable.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![ZK](https://img.shields.io/badge/Identity-ZK--Civic-0057FF?style=flat-square)](https://civic.com)

</div>

---

## Overview

**Yatra** is a decentralized transport application built for the Nepal transit ecosystem. It combines real-time bus tracking with blockchain-powered trust—issuing **Soulbound NFT receipts** on Solana for every trip and using **ZK-Civic** to verify driver identity without exposing private data.

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
git clone https://github.com/Since2024/yatra.git
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

## License

Private repository. Built for the Nepal Transit Ecosystem.

---

<div align="center">

🇳🇵 **Built By HASAN GAHA. Powered by Solana.**

</div>
