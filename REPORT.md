# Technical Architecture & Implementation Status Report: Yatra Protocol

**Audit date:** 2026-05-17  
**Workspace:** `/home/npc/yatra`  
**Method:** Full filesystem crawl (4161 tracked files excluding `node_modules`, `.next`, `target`, `reference`), direct source inspection, `npm test`, `npm run build`, `npx tsc --noEmit`, and `anchor build` attempt.

---

## 1. System Topology & Directory Mapping

### 1.1 Workspace Tree (Key Roots)

```
yatra/                              ← Next.js 16 monolith (npm root, package name: bus-tra)
├── app/                            ← App Router: pages + 21 API route handlers
│   ├── api/                        ← Serverless API (auth, bookings, trips, solana, reputation)
│   ├── driver/                     ← Driver cockpit (1,549 LOC page)
│   ├── passenger/                  ← Passenger map/booking UI (1,548 LOC page)
│   ├── admin/                      ← Transport office dashboard
│   └── page.tsx                    ← Marketing landing (2,374 LOC)
├── components/                     ← React UI (driver, passenger, map, admin, shadcn/ui)
├── hooks/                          ← GPS, proximity, accident detection, theme
├── lib/                            ← Core domain logic
│   ├── solana/                     ← Escrow, TRRL clients, NFT minting, IDLs
│   ├── zk/                         ← Groth16 prover/verifier
│   ├── routing/osrm.ts             ← Public OSRM routing
│   ├── firebase*.ts                ← Client + Admin SDK
│   └── firebaseDb.ts               ← RTDB operations (941 LOC)
├── circuits/                       ← Circom ZK circuit + build artifacts
├── public/zk/                      ← WASM + zkey for client proving
├── tests/                          ← Vitest (6 files, 27 tests)
├── scripts/                        ← TRRL bootstrap/verification (excluded from tsc)
├── yatra_trrl/                     ← Nested Anchor/Rust workspace (ISOLATED)
│   └── programs/yatra_trrl/        ← On-chain program source
├── reference/                      ← reference app (gitignored)
├── proxy.ts                        ← Next.js middleware (auth/route guards)
├── next.config.ts
├── tsconfig.json                   ← Excludes yatra_trrl, scripts, reference
└── vercel.json                     ← Vercel deploy (region: sin1)
```

### 1.2 Monorepo Structure (Logical, Not npm Workspaces)

| Layer | Root | Package manager | Linked to web? |
|-------|------|-----------------|--------------|
| Web application | `/` | npm (`package-lock.json`) | — |
| Anchor program | `yatra_trrl/` | yarn (`yarn.lock`) | **No** — excluded via `tsconfig.json` |
| ZK circuits | `circuits/` | (manual circom/snarkjs) | Artifacts copied to `public/zk/` |
| Reference only | `reference/rydex/` | — | Gitignored |

There is **no** root `workspaces` field in `package.json`. The Solana subsystem is a **physically nested but logically decoupled** directory. TypeScript compilation boundaries are enforced by exclusion, not by package linking.

### 1.3 Core Dependencies (Web Root)

| Category | Packages | Version |
|----------|----------|---------|
| Framework | `next`, `react`, `react-dom` | 16.2.4 / 19.2.1 |
| Blockchain | `@solana/web3.js`, `@solana/spl-token`, `@coral-xyz/anchor`, wallet adapters | 1.98.4 / 0.4.14 / 0.32.1 |
| Realtime DB | `firebase`, `firebase-admin` | 12.6.0 / 13.7.0 |
| ZK | `snarkjs`, `circomlib` | 0.7.6 / 2.0.5 |
| Maps | `leaflet`, `react-leaflet` | 1.9.4 / 5.0.0 |
| UI | Tailwind v4, Radix/shadcn, `framer-motion` | — |
| Testing | `vitest`, `vite-tsconfig-paths` | 3.2.4 / 5.1.4 |

### 1.4 Anchor Subsystem Dependencies

```toml
# yatra_trrl/programs/yatra_trrl/Cargo.toml
anchor-lang = "1.0.0"
# dev: litesvm 0.10.0, solana-* 3.x
```

Rust toolchain pinned to **1.89.0** (`yatra_trrl/rust-toolchain.toml`). Anchor provider defaults to **localnet** in `Anchor.toml`; deployed artifacts in the web layer target **devnet**.

---

## 2. Dynamic Feature & Architecture Discovery

### 2.1 Primary Operational Mechanics

#### Real-Time Telemetry

| Component | Path | Behavior |
|-----------|------|----------|
| GPS hook | `hooks/useLiveLocation.ts` | `watchPosition` with **3s** throttle; writes to Firebase via `updateLiveUserStatus` |
| Driver bus path | `lib/firebaseDb.ts` → `drivers/active/{id}` | Canonical live driver location; `onDisconnect` presence hooks |
| Trip-scoped path | `tripLocations/{tripId}/driver\|passenger` | Participant-only after trip accepted |
| Proximity | `hooks/useProximityHandshake.ts` | Haversine ≤10m → audio alert |
| Accident | `hooks/useAccidentDetection.ts` | Sudden deceleration detection |

Data flow: **Browser GPS → Firebase RTDB** (sub-second fan-out to subscribers). No blockchain involvement in the hot path.

#### Trip Status Processing

State machine defined in `lib/tripStateMachine.ts`:

```
requested → accepted | rejected | cancelled | expired
accepted  → arrived | active | cancelled | expired
arrived   → active | cancelled | expired
active    → completed | cancelled
completed | cancelled | rejected | expired → (terminal)
```

**Server authority:** `POST /api/trips/update-status` uses Firebase Admin transactions for idempotent transitions, syncs linked `bookings/`, updates `users/{driverId}/stats`, and mutates `reputation/drivers/{driverId}`. On `completed`, it fire-and-forget calls `releaseEscrow()` with **mock telemetry** defaults.

**Client authority:** Driver/passenger pages (`app/driver/page.tsx`, `app/passenger/page.tsx`) also write trip state directly to RTDB subject to `database.rules.json`.

#### Escrow Security

**Documented model:** GPS-verified fare release via `EscrowAccount` PDA.

**Actual implementation** (`lib/solana/escrow.ts`):

- Funds held in **server wallet** (custodial), not an on-chain escrow program.
- `getEscrowPDA()` derives an identifier using Memo program seeds — tracking only.
- `createEscrowAccount()` posts a **Memo** transaction anchoring commitment JSON.
- `releaseEscrow()` / `reclaimEscrow()` use `SystemProgram.transfer` from server wallet.
- Optional TRRL `updateRep` instruction appended on release via **stub IDL** with placeholder program ID `TrrL111111111111111111111111111111111111111`.

API surface:

| Route | Role |
|-------|------|
| `POST /api/solana/escrow/create` | Lock (memo + Firebase `escrowStatus: locked`) |
| `POST /api/solana/escrow/release` | GPS-gated release (`gpsVerifiedAt` or `forceRelease`) |
| `POST /api/solana/escrow/reclaim` | 2h timeout / terminal status reclaim |

Policy helper: `lib/solana/escrowPolicy.ts` (`canReclaimEscrow`, 2-hour default).

#### User / Driver Interfaces

| Surface | Path | Scale |
|---------|------|-------|
| Passenger | `app/passenger/page.tsx` | ~1,548 LOC — map, booking, ETA, wallet, TRRL score display |
| Driver | `app/driver/page.tsx` | ~1,549 LOC — cockpit, trip requests, passengers |
| Admin | `app/admin/*` | Fleet map, reputation lookup |
| Landing | `app/page.tsx` | ~2,374 LOC — marketing, protocol narrative |
| Auth | `app/auth/*`, `proxy.ts` | Session cookies + role gating |

Wallet: `components/providers/ClientWalletProvider.tsx` (Phantom via `@solana/wallet-adapter-react`).

### 2.2 End-to-End Data Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENT (Browser)                                                         │
│  useLiveLocation ──► firebaseDb.updateLiveUserStatus / updateBusLocation │
│  BookingPanel ──► POST /api/bookings/create | /api/trip-requests/create  │
│  Wallet ──► POST /api/solana/mint-ticket (after trip complete)          │
│  ZK Prover ──► POST /api/solana/verify-driver (Groth16 proof)           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ FIREBASE REALTIME DB (source of truth for trip lifecycle)                │
│  trips/{id}.status  bookings/{id}  drivers/active/{id}                 │
│  reputation/drivers/{driverId}  users/{uid}                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────────┐
│ API Routes       │ │ Direct RTDB      │ │ Solana (devnet, server-signed)│
│ (Admin SDK)      │ │ (client writes)  │ │                               │
│ update-status    │ │ trip transitions │ │ Memo anchors (escrow, rep)    │
│ ratings/submit   │ │ GPS publishes    │ │ Token-2022 soulbound NFTs   │
│ reputation API   │ │                  │ │ TRRL PDA updates (split brain)│
│ escrow *         │ │                  │ │ SystemProgram transfers       │
└──────────────────┘ └──────────────────┘ └──────────────────────────────┘
```

### 2.3 Blockchain vs Mock Integration Points

| Feature | Integration mode | Evidence |
|---------|------------------|----------|
| Trip GPS / ETA | **Live** (Firebase + OSRM) | No chain reads in hot path |
| Driver reputation (UI) | **Hybrid** | Firebase primary; `GET /api/reputation/:wallet` merges chain + Firebase |
| TRRL on-chain write (ratings) | **Live attempt** via `trrlProgram.ts` → IDL `9BvgVET...` | `app/api/ratings/submit/route.ts` |
| TRRL on-chain write (trip complete) | **Mock telemetry** via `escrow.ts` stub | `app/api/trips/update-status/route.ts` L178–196 |
| Escrow | **Custodial mock** | Server wallet + Memo, not program escrow |
| NFT receipts | **Live devnet** | `lib/solana/tripTicket.ts` Token-2022 NonTransferable |
| ZK identity | **Live verify** | `lib/zk/verifier.ts` + Memo anchor |
| Reputation memo-only | **Live devnet** | `app/api/solana/update-reputation/route.ts` |

### 2.4 Schema Alignment: TypeScript ↔ On-Chain ↔ Firebase

#### Trip status (`lib/types.ts`)

```typescript
export type TripStatus =
  | 'requested' | 'accepted' | 'arrived' | 'active'
  | 'completed' | 'cancelled' | 'rejected' | 'expired';
```

Aligned with `tripStateMachine.ts` and Firebase rules requiring `id, driverId, passengerId, status, createdAt`.

#### Driver reputation — **MISALIGNED (three schemas)**

| Field | Firebase / `trrl.ts` | `trrl_idl.json` (deployed `9BvgVET...`) | `yatra_trrl` Rust (`B8Y64wzm...`) |
|-------|----------------------|----------------------------------------|-----------------------------------|
| Score | `score` (0–1000, TS formula) | `score` (on-chain recalc) | `trust_score` (telemetry formula) |
| Trips | `totalTrips`, `completedTrips` | same | `total_trips`, `completed_trips` |
| Rating | `avgRatingX100` | `avg_rating_x100` | **not present** |
| Punctuality | `onTimeArrivals` | `on_time_arrivals` | `avg_arrival_delta_s` (delta seconds) |
| Telemetry | — | — | `path_fidelity_x100`, `hard_brake_events`, `route_deviation_events` |
| Platform registry | — | `PlatformEntry`, `RegistryAdmin` | **not present** |
| Update args | object in TS client | `UpdateRepParams` | `TripTelemetry` struct |

The web client's `readDriverRepOnChain()` expects `driverRep` account layout from **`trrl_idl.json`**, while `escrow.ts` builds instructions from **`yatra_trrl_idl.ts`** (telemetry layout, wrong program ID). These cannot both be correct for the same deployment.

#### Program ID divergence

| Source | Program ID |
|--------|------------|
| `lib/solana/trrlProgram.ts`, `trrl_idl.json`, README, landing page | `9BvgVETSbpoccubSqkTZUuqaTaZVwPXzvhDi4ies88HN` |
| `yatra_trrl/programs/yatra_trrl/src/lib.rs` `declare_id!` | `B8Y64wzmTott2wp5rgP1UyDgAofohU3hfTnmxkMAPFDV` |
| `lib/solana/escrow.ts` (stub) | `TrrL111111111111111111111111111111111111111` |

**Conclusion:** The repository contains artifacts from at least **two generations** of the TRRL program. The deployed devnet program (`9BvgVET...`) source is **not** in the tree (changelog references `/trrl`, which no longer exists). The nested `yatra_trrl/` workspace is a **newer, incompatible redesign** that has not been wired to production clients.

---

## 3. Webpack, Next.js, and Compilation Decoupling Analysis

### 3.1 Build Pipeline

| Step | Command | Result (audit run) |
|------|---------|-------------------|
| Production build | `npm run build` | **PASS** — all routes compile; middleware shown as `ƒ Proxy` |
| Typecheck | `npx tsc --noEmit` | **PASS** |
| Unit tests | `npm test` | **PARTIAL** — 18/27 pass |
| Anchor SBF build | `anchor build` in `yatra_trrl/` | **FAIL** — `cargo-build-sbf` binary not found (Solana platform tools absent) |

### 3.2 Decoupling Mechanisms

**TypeScript boundary** (`tsconfig.json`):

```json
"exclude": ["node_modules", "scripts", "yatra_trrl", "reference"]
```

The web bundler never type-checks or bundles Rust/Anchor sources. Path alias `@/*` maps to repo root only.

**Next.js config** (`next.config.ts`):

```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["snarkjs"],
};
```

`snarkjs` is excluded from server bundling to avoid Webpack/ESM resolution failures with heavy crypto dependencies. No custom `webpack` config — minimal surface area.

**Runtime isolation patterns:**

| Pattern | File | Purpose |
|---------|------|---------|
| `export const runtime = 'nodejs'` | All Solana API routes | Avoid Edge runtime incompatibility with `bigint-buffer`, Anchor |
| `require('./trrl_idl.json')` | `trrlProgram.ts` | Dynamic CJS load of IDL JSON |
| `require('bs58').default` | `connection.ts` | Avoid `esModuleInterop` ambiguity |
| Inline wallet stub | `escrow.ts` L168–180 | Avoid `@coral-xyz/anchor/dist/esm/nodewallet.js` in Next server build |
| Hardcoded `Connection('https://api.devnet.solana.com')` | `mint-ticket/route.ts` L74 | Bypasses env in one route (inconsistency) |

**Middleware:** `proxy.ts` exports `proxy()` + `config.matcher` — recognized by Next.js 16 as middleware (build output: `ƒ Proxy (Middleware)`). README references `middleware.ts`; actual file is `proxy.ts`.

**Scripts excluded from tsc:** `scripts/bootstrap-trrl-registry.ts`, `scripts/verify-trrl-phase3.ts` — run via `npx ts-node` / manual execution only.

### 3.3 ESM / Webpack Fix History

One-off migration scripts at repo root (`refactor_theme.mjs`, `final_audit_fix.mjs`, etc.) indicate prior UI refactors; they are **not** part of the build pipeline. The only production compilation fix documented in source is `serverExternalPackages: ["snarkjs"]` plus Anchor wallet workarounds in `escrow.ts`.

---

## 4. On-Chain Workspace Analysis (Rust/Anchor Subsystem)

### 4.1 Program: `yatra_trrl` (in-tree source)

**Location:** `yatra_trrl/programs/yatra_trrl/src/`  
**Program ID (source):** `B8Y64wzmTott2wp5rgP1UyDgAofohU3hfTnmxkMAPFDV`  
**Anchor version:** 1.0.0  
**Build status:** Not compiled in audit environment; no `target/deploy/yatra_trrl.so` present.

### 4.2 Instructions (Rust `lib.rs`)

| Instruction | Accounts | Args | Handler |
|-------------|----------|------|---------|
| `initialize_rep` | `driver_rep` (init PDA), `authority`, `driver`, `system_program` | — | Sets defaults: `trust_score=500`, `path_fidelity_x100=10000`, counters zeroed |
| `update_rep` | `driver_rep` (mut), `authority`, `driver` | `TripTelemetry` | `update::update_rep_handler` |

**Not wired:** `src/instructions/initialize.rs` contains a stale `Initialize` handler ("Greetings from") — module `instructions.rs` exists but is **never imported** in `lib.rs`.

### 4.3 State Accounts

#### `DriverReputationProfile` (`state.rs`)

| Field | Type | Notes |
|-------|------|-------|
| `driver` | `Pubkey` | 32 bytes |
| `trust_score` | `u16` | 0–1000, recalculated on each update |
| `total_trips` | `u32` | saturating add |
| `completed_trips` | `u32` | if `telemetry.is_completed` |
| `path_fidelity_x100` | `u16` | EMA: `(9*old + new) / 10` |
| `avg_arrival_delta_s` | `i16` | running mean of arrival delta |
| `hard_brake_events` | `u8` | cumulative |
| `route_deviation_events` | `u8` | cumulative |
| `sos_triggered` | `u8` | cumulative |
| `zk_verified` | `bool` | never set in `update_rep_handler` |
| `bump` | `u8` | PDA bump |

**PDA seeds:** `["driver_rep", driver_pubkey]`

### 4.4 Score Formula (On-Chain, `update.rs`)

```rust
// Operational layer (max ~350 pts in practice)
completion_rate = (completed * 250) / total
zk_verified_bonus = if zk_verified { 100 } else { 0 }  // never toggled in handler
sos_penalty = min(sos_triggered * 30, 100)

// Analytical layer
path_fidelity = (path_fidelity_x100 * 100) / 10000   // max 100
punctuality = if abs(avg_arrival_delta_s) >= 300 { 0 } else { ((300 - abs_delta) * 100) / 300 }
anomaly_penalty = min((hard_brakes + deviations) * 10, 50)

trust_score = min(completion_rate + zk_bonus + path_fidelity + punctuality - sos_penalty - anomaly_penalty, 1000)
```

Differs materially from the Firebase/README formula (rating-weighted 400/300/200/100 split).

#### `TripTelemetry` (instruction arg)

| Field | Type | Clamping |
|-------|------|----------|
| `is_completed` | `bool` | — |
| `fidelity_x100` | `u16` | used in EMA, no explicit clamp |
| `arrival_delta_s` | `i16` | punctuality zeroed if \|delta\| ≥ 300s |
| `hard_brakes` | `u8` | contributes to anomaly penalty, cap 50 total |
| `deviations` | `u8` | same |
| `sos_triggered` | `u8` | SOS penalty cap 100 |

### 4.5 Errors (`error.rs`)

Only placeholder: `ErrorCode::CustomError` — no domain-specific errors defined.

### 4.6 Deployed Program Artifact (IDL only, not in Rust tree)

`lib/solana/trrl_idl.json` describes program `9BvgVETSbpoccubSqkTZUuqaTaZVwPXzvhDi4ies88HN`:

| Instruction | Purpose |
|-------------|---------|
| `init_registry` | Singleton `RegistryAdmin` PDA |
| `register_platform` | Admin registers platform keypair |
| `deregister_platform` | Sets `is_active = false` |
| `initialize_rep` | Create `DriverRep` PDA |
| `update_rep` | Update with `UpdateRepParams`; requires `platform_entry` PDA |

| Account | Seeds |
|---------|-------|
| `RegistryAdmin` | `["registry_admin"]` |
| `PlatformEntry` | `["platform", platform_pubkey]` |
| `DriverRep` | `["driver_rep", driver]` |

| Error codes | 6000–6005: `InvalidScore`, `InvalidRating`, `NotAdmin`, `PlatformNotRegistered`, `PlatformInactive`, `RegistryAlreadyInitialized` |

This IDL matches `lib/solana/trrlProgram.ts` and changelog Phase 2/3 — **not** the Rust sources in `yatra_trrl/`.

### 4.7 Test Suite Status

| Suite | Location | Status |
|-------|----------|--------|
| Anchor TS integration | `yatra_trrl/tests/yatra_trrl.ts` | **Not run** — requires `anchor test` + deployed `.so` |
| LiteSVM Rust test | `programs/yatra_trrl/tests/test_initialize.rs` | **Stale** — references removed `Initialize` instruction; expects `target/deploy/yatra_trrl.so` |
| Vitest (web) | `tests/*.test.ts` | 18 pass / 9 fail |

#### Vitest failures (root cause summary)

| File | Failures | Cause |
|------|----------|-------|
| `database-rules.test.ts` | 6/6 | Tests expect admin-only reads and stricter tripLocations rules; actual `database.rules.json` is more permissive (`auth != null` on bookings/trips) |
| `solana-api.integration.test.ts` | 3/4 | Escrow/mint mocks don't satisfy route preconditions (missing booking pairs, env keys) |

Passing: `trip-state-machine`, `escrow-policy`, `loyalty`, `mint-ticket-utils`.

---

## 5. Technical Health Matrix & Execution Roadmap

### 5.1 Readiness Matrix

| Subsystem | Status | Notes |
|-----------|--------|-------|
| Next.js web app (UI + API routes) | **Production-ready (devnet beta)** | Build passes; deployed to Vercel per README |
| Firebase auth + RTDB telemetry | **Production-ready** | Rules deployed via `firebase.json`; rules drift vs tests |
| Trip state machine | **Stable** | Validated by unit tests |
| OSRM routing / ETA | **Stable (external dependency)** | Public `router.project-osrm.org`, 5s timeout |
| ZK identity (Circom + SnarkJS) | **Functional** | Circuit built; verifier in API; age hardcoded to 2026 in circuit |
| Token-2022 soulbound NFTs | **Functional (devnet)** | Server-signed minting |
| Escrow | **Custodial mock** | Not trustless; GPS gate in API only |
| TRRL reads (`/api/reputation`) | **Functional** | On-chain + Firebase merge with fallback |
| TRRL writes (`trrlProgram.ts`) | **Stable against deployed IDL** | Targets `9BvgVET...` if devnet program live |
| TRRL writes (`escrow.ts` hybrid) | **Broken / stub** | Wrong program ID + schema |
| `yatra_trrl` Rust program | **Uncompiled, unwired** | Split from IDL; no source for deployed program |
| Anchor CI / reproducible builds | **Blocked** | SBF toolchain missing in environment |
| Security: committed secrets | **Risk** | `.env` present locally (gitignored); ensure never pushed |
| Test suite | **Degraded** | 33% failure rate; rules tests out of sync |

### 5.2 Prioritized Engineering Roadmap

#### P0 — Unify on-chain TRRL (blocking native execution)

1. **Decide canonical program:** Either restore source for `9BvgVET...` (Phase 3 registry model) **or** finish `yatra_trrl` redesign and redeploy — not both.
2. **Single IDL pipeline:** `anchor build` → copy IDL to `lib/solana/trrl_idl.json` + regenerate `yatra_trrl_idl.ts`; delete manual stub.
3. **Align `declare_id!`** in Rust with deployed address; update `TRRL_PROGRAM_ID` constant once.
4. **Remove placeholder** `TrrL111111111111111111111111111111111111111` from `escrow.ts`.
5. **Pick one `update_rep` schema:** `UpdateRepParams` (ratings-based) vs `TripTelemetry` (sensor-based) — update all callers (`update-status`, `ratings/submit`, `releaseEscrow`).

#### P1 — Escrow truthfulness

6. Implement real escrow (new Anchor program or SPL token vault) replacing server-wallet custodian pattern.
7. Wire GPS verification from actual `tripLocations` path before release, not only Firebase boolean flags.
8. Unify `SOLANA_RPC_URL` usage — `mint-ticket/route.ts` hardcodes devnet URL.

#### P2 — Build & test hygiene

9. Install Solana platform tools; add CI job: `anchor build && anchor test`.
10. Delete or fix stale `test_initialize.rs` and orphaned `instructions/initialize.rs`.
11. Reconcile `database.rules.json` with `tests/database-rules.test.ts` (tighten reads or update tests).
12. Fix `solana-api.integration.test.ts` fixtures to match dual-record escrow API requirements.

#### P3 — Schema & documentation

13. Extend `lib/types.ts` with `TripTelemetry`, `escrowStatus`, and reputation fields used in Firebase.
14. Update README architecture block — remove references to missing `/trrl` path and incorrect single-program narrative.
15. Set `zk_verified` on-chain when ZK verification succeeds (`verify-driver` route).

#### P4 — Mainnet readiness

16. Mainnet program deployment + registry bootstrap.
17. Replace public OSRM with self-hosted or contracted routing SLA.
18. Rotate any keys that have appeared in local `.env` files; use Vercel env secrets only.

### 5.3 Recommended Integration Sequence (Decoupled → Native)

```
Phase A (current)     Firebase-authoritative trips + custodial Solana settlements
        ↓
Phase B               Single TRRL program ID + IDL synced from Anchor workspace
        ↓
Phase C               All rep writes through trrlProgram.ts; remove escrow stub path
        ↓
Phase D               On-chain escrow program; server only relays attested GPS proofs
        ↓
Phase E               Mainnet + partner platform keypairs (Pathao/InDrive registry)
```

---

## Appendix A: API Route Inventory

| Route | Method | Auth | Solana |
|-------|--------|------|--------|
| `/api/sessionLogin` | POST | — | — |
| `/api/sessionLogout` | POST | session | — |
| `/api/auth/register` | POST | — | — |
| `/api/auth/verify-wallet` | POST | session | — |
| `/api/bookings/create` | POST | session | — |
| `/api/bookings/calculate-fare` | POST | — | — |
| `/api/trip-requests/create` | POST | session | FCM push |
| `/api/trips/update-status` | POST | session | escrow release (async) |
| `/api/ratings/submit` | POST | session | TRRL update (async) |
| `/api/reputation/[wallet]` | GET | public | read PDA |
| `/api/solana/mint-ticket` | POST | — | Token-2022 mint |
| `/api/solana/verify-driver` | POST | — | ZK + badge |
| `/api/solana/update-reputation` | POST | — | Memo only |
| `/api/solana/escrow/create` | POST | — | Memo + Firebase |
| `/api/solana/escrow/release` | POST | — | Transfer |
| `/api/solana/escrow/reclaim` | POST | — | Transfer |
| `/api/emergency` | POST | — | — |
| `/api/seed` | POST | dev | — |
| `/api/admin/reputation` | — | admin | — |
| `/api/buses/[id]/offline-count` | — | — | — |

## Appendix B: ZK Circuit Summary

**File:** `circuits/driverIdentity.circom`

- Private inputs: `licenseHash`, `birthYear`, `salt`
- Public outputs: `commitment`, `ageValid`
- Age check: ≥21 years (hardcoded year 2026)
- Commitment: `licenseHash + birthYear * 10^9 + salt` (must match `lib/zk/prover.ts`)
- Artifacts: `public/zk/driverIdentity.wasm`, `driverIdentity.zkey`, `lib/zk/verification_key.json`

## Appendix C: Verification Commands Run

```bash
npm test          # 18 passed, 9 failed
npm run build     # success
npx tsc --noEmit  # success
anchor build      # failed — cargo-build-sbf not installed
```

---

*Report generated from direct repository inspection. No assumptions beyond files present in the workspace at audit time.*

Completed a full workspace audit and saved the findings to REPORT.md.

Highlights
Topology: Single Next.js 16 app at the repo root (bus-tra), with a nested but isolated Anchor workspace in yatra_trrl/ (excluded from root tsconfig.json). Not an npm workspaces monorepo.

What works today:

npm run build and npx tsc --noEmit both pass
Firebase real-time GPS, trip state machine, OSRM routing, ZK verification, and Token-2022 NFT minting are implemented end-to-end on devnet
Public reputation API merges on-chain PDA + Firebase fallback
Critical finding — TRRL split brain: Three incompatible on-chain definitions coexist:

Deployed IDL/client (9BvgVET...) — platform registry + rating-based UpdateRepParams
In-tree Rust (B8Y64wzm...) — telemetry-based TripTelemetry / DriverReputationProfile
Escrow stub (TrrL1111...) — placeholder program ID in escrow.ts
Ratings use (1); trip completion escrow path uses (3); Rust source (2) is not built or wired.

Escrow: Custodial server-wallet + Memo anchors, not a true on-chain escrow program despite README claims.

Tests: 18/27 Vitest tests pass; failures are rules drift and integration fixture mismatches. anchor build failed (SBF toolchain not installed).

The report includes a full directory map, data-pipeline diagram, compilation decoupling analysis, instruction/account inventory, score formulas, and a prioritized P0–P4 roadmap to reach native on-chain execution.