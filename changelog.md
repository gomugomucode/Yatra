# Changelog - Yatra Project Stabilization

All notable changes to this project are documented in this file.


## [2026-05-13] - TRRL Phase 3 Multi-Platform Registry

### ⛓️ TRRL Phase 3 — Platform Registry (Multi-Platform Write Access)

- **New**: `RegistryAdmin` PDA (seeds: `["registry_admin"]`) — singleton that holds the admin authority. Admin is the only keypair that can register/deregister platforms. Deployed to devnet: `ESggUMq...`.
- **New**: `PlatformEntry` PDA (seeds: `["platform", platform_pubkey]`) — one per registered platform. Stores name, `is_active`, `registered_at`, `total_updates`. Pathao, InDrive, Yatra each get their own entry.
- **New**: `init_registry` instruction — one-time setup, caller becomes admin.
- **New**: `register_platform(platform, name)` instruction — admin-only, creates a `PlatformEntry` PDA for the given platform keypair.
- **New**: `deregister_platform` instruction — admin-only, sets `is_active = false`. The PDA is kept on-chain as an audit trail. Future `update_rep` calls from that keypair are rejected.
- **Changed**: `update_rep` no longer accepts any arbitrary signer. Caller must pass a matching `PlatformEntry` PDA — Anchor validates via seed derivation. Unregistered keypairs are rejected at account validation before the instruction handler runs.
- **New**: `last_platform: Pubkey` field added to `DriverRep` — records which platform wrote the last update. Visible in `readDriverRepOnChain` response.
- **Deployed**: Program upgraded in-place at `9BvgVETSbpoccubSqkTZUuqaTaZVwPXzvhDi4ies88HN`. All existing `DriverRep` PDAs remain valid.
- **Bootstrapped**: Registry initialized and Yatra registered as first platform on devnet. `scripts/bootstrap-trrl-registry.ts` documents the one-time setup.
- **New**: `scripts/verify-trrl-phase3.ts` — end-to-end verification script. Confirms registry exists, Yatra PlatformEntry is active, `update_rep` succeeds with Yatra keypair, and correctly rejects an unregistered keypair.

### 🔌 TypeScript Client Updates (`lib/solana/trrlProgram.ts`)

- **New**: `getRegistryAdminPDA()` — derives the singleton registry PDA.
- **New**: `getPlatformEntryPDA(platformPubkey)` — derives a platform's entry PDA.
- **New**: `initRegistry(connection, adminKeypair)` — idempotent, skips if already initialized.
- **New**: `registerPlatform(connection, adminKeypair, platformPubkey, name)` — idempotent.
- **New**: `deregisterPlatform(connection, adminKeypair, platformPubkey)`.
- **New**: `readPlatformEntry(connection, platformPubkey)` — public read, no auth. Any platform can verify a peer is legitimately registered.
- **Changed**: `updateDriverRepOnChain` now passes `platformEntry` account to the program. Interface unchanged for callers — the two route handlers required no modification.
- **Changed**: `readDriverRepOnChain` now returns `lastPlatform` field.

---

## [2026-05-13] - TRRL On-Chain Reputation, Driver Card UI & Build Fixes

### ⛓️ TRRL Phase 2 — On-Chain Anchor Program

- **New**: Built and deployed a full Anchor program (`/trrl`) to Solana devnet at `9BvgVETSbpoccubSqkTZUuqaTaZVwPXzvhDi4ies88HN`.
- **New**: `DriverRep` PDA (seeds: `["driver_rep", driver_pubkey]`) stores score, totalTrips, completedTrips, avgRatingX100, onTimeArrivals, zkVerified, sosTriggered, lastUpdated on-chain. Score is recalculated inside the program on every write — same formula as Firebase.
- **New**: `initialize_rep` instruction creates the PDA with score=500 default on first write.
- **New**: `update_rep` instruction — only the Yatra server keypair can call this, ensuring no external party can tamper with scores.
- **New**: `lib/solana/trrlProgram.ts` — TypeScript client with `getDriverRepPDA`, `initializeDriverRep` (idempotent), `updateDriverRepOnChain` (auto-inits then updates), `readDriverRepOnChain` (read-only, no auth).
- **New**: `lib/solana/trrl_idl.json` — Anchor IDL generated from `anchor build`, consumed by the TS client.

### 🔌 TRRL Wiring into Ride Flow

- **New**: `app/api/trips/update-status/route.ts` now calls `updateDriverRepOnChain` fire-and-forget on trip completion. Response is not blocked — if Solana fails it logs and continues.
- **New**: `app/api/ratings/submit/route.ts` now calls `updateDriverRepOnChain` fire-and-forget after every passenger rating. Firebase rating save always succeeds; on-chain sync is best-effort.
- **Fix**: Both routes previously `await`ed the Solana call synchronously, adding 2–5s latency to every trip completion and rating submission. Converted to `.then().catch()` pattern so the API responds immediately.
- **Fix**: `ratings/submit` Solana call was inside the main try/catch — a Solana timeout would return HTTP 500 even though the rating was already saved. Now isolated with its own error handler.
- **Fix**: Removed orphaned `MEMO_PROGRAM_ID = new PublicKey(...)` line in `ratings/submit/route.ts` that referenced `PublicKey` without importing it, causing a TypeScript build error.

### 🌐 Public Reputation API

- **New**: `GET /api/reputation/[wallet]` — public, no auth, CORS open. Any platform (Pathao, InDrive, Uber) can query a driver's TRRL score by Solana wallet address.
- **New**: Queries on-chain PDA and Firebase in parallel (`Promise.allSettled`). On-chain wins for score/stats (tamper-proof); Firebase supplies metadata (`zkCommitment`, `lastSolanaTx`).
- **New**: Response includes `reputationPDA`, `pdaExplorerUrl` — callers can independently verify the score on Solana Explorer without trusting Yatra.
- **New**: `source` field: `YATRA_TRRL_V1_ONCHAIN` when PDA is available, `YATRA_TRRL_V1_FIREBASE` as fallback.
- **New**: Rate limited to 60 req/IP/min, 60s CDN cache.
- **New**: Added `.indexOn: ["driverPubkey"]` to `database.rules.json` for efficient Firebase query on wallet address.

### 🪪 Passenger — Driver Card on Accepted Screen

- **New**: When a driver accepts a ride, the passenger now sees the driver's full reputation card:
  - Star rating (rolling average from all passenger ratings)
  - Completed trip count
  - TRRL score badge (color-coded: green ≥700, yellow ≥400, red <400)
  - ZK Verified shield icon (inline next to name and in reputation row)
  - Driver photo if available, emoji fallback
- **New**: Reputation subscribes live via Firebase (`reputation/drivers/{driverId}`) — updates in real time if score changes mid-ride.
- **New**: Reputation row only appears after `accepted` / `on-trip` status, not during the `requesting` phase.

### 🔧 Build Fixes

- **Fix**: `Wallet` named export from `@coral-xyz/anchor` is only registered at runtime via a CJS `exports.Wallet = ...` inside `if (!isBrowser)` — Turbopack's static analysis rejects it. Fixed by importing directly from `@coral-xyz/anchor/dist/esm/nodewallet.js`.
- **Fix**: `NodeWallet` is also not re-exported from the anchor package root in ESM. Same direct-file import approach resolves both.

---

## [2026-05-13] - ZK, Solana Anchoring, Escrow, SMS & Wallet Connect Fixes

### 🔐 ZK Identity

- **Fix**: Replaced hardcoded `salt = BigInt(777)` in `lib/zk/prover.ts` with a cryptographically random 248-bit salt generated via `crypto.getRandomValues()` on every proof. Salt never leaves the device — it is a private circuit input only. Each proof now produces a unique commitment even for the same driver credentials.

### ⛓️ TRRL Reputation — Solana Anchoring

- **Fix**: Removed fake `mockSig = 'memo' + Math.random()...` fallback in `lib/solana/trrl.ts`. If the Memo transaction fails the function now throws instead of silently writing a fake signature to Firebase.
- **Fix**: Replaced `Keypair.fromSeed(sha256(...))` fake PDA with `PublicKey.findProgramAddressSync` in `app/api/ratings/submit/route.ts` — this was the actual live code path for reputation anchoring after a passenger rating.
- **Fix**: Removed unused `Keypair` import from `ratings/submit/route.ts`.
- **New**: Added Solana Memo anchoring to `app/api/trips/update-status/route.ts` on trip completion. Previously the route updated Firebase reputation but never sent any on-chain transaction. Now posts a `TRIP_COMPLETED` Memo tx after each completed trip, stores the real devnet signature as `lastSolanaTx`.
- **Fix**: Added `maxDuration = 60` to `update-reputation/route.ts` and `update-status/route.ts` to prevent Vercel timeouts during `sendAndConfirmTransaction`.
- **Fix**: Removed misleading `reputationPDA` field (derived from `Keypair.fromSeed`) from `update-reputation/route.ts` response — a Keypair address is not a PDA.

### 🔒 Escrow PDA

- **Fix**: Replaced `Keypair.fromSeed(seed.slice(0, 32))` with `PublicKey.findProgramAddressSync` in `lib/solana/escrow.ts`. The old derivation produced an on-curve address with a private key, not a real program-derived address.
- **Fix**: `createEscrowAccount` previously sent `SystemProgram.transfer` to the PDA address. Since `releaseEscrow` and `reclaimEscrow` pay from the server wallet (not the PDA), any SOL sent to the PDA would be permanently stranded — no custom program means no one can sign for a real PDA. Replaced with a Memo transaction that anchors the escrow commitment on-chain without stranding funds. The PDA now serves as a deterministic tracking identifier stored in Firebase.
- **New**: Added `maxDuration = 60` to `app/api/solana/escrow/create/route.ts`.
- **Fix**: Removed `Keypair` import from `escrow.ts` (no longer needed).

### 📱 SMS Notifications

- **Fix**: Replaced mock `sendSMS` in `lib/utils/sms.ts` (which always returned `true` and never sent anything) with a real SparrowSMS integration.
- **New**: If `SPARROWSMS_TOKEN` is not set, logs to console and returns `false` — no more silent fake success.
- **New**: Added `SPARROWSMS_TOKEN` and `SPARROWSMS_SENDER_ID` entries to `.env`.

### 👛 Passenger Wallet Connect

- **Fix**: `WalletProviderWrapper` had `wallets: []` — the connect modal opened but showed no wallets. Added `PhantomWalletAdapter` and `SolflareWalletAdapter` from `@solana/wallet-adapter-wallets`.
- **Fix**: `isVerified` logic in `WalletSettings.tsx` required `savedWallet` (from Firebase) to be truthy before showing the green "Wallet verified" banner. For a first-time connection there is a brief window where `justVerified = true` but Firebase hasn't propagated yet, so the banner never appeared. Fixed to `justVerified || (!!savedWallet && savedWallet === connectedAddress)`.
- **New**: `WalletProviderWrapper` now reads `NEXT_PUBLIC_SOLANA_RPC_URL` for the devnet endpoint instead of hardcoding it. Added `NEXT_PUBLIC_SOLANA_RPC_URL` to `.env`.

## [2026-05-11] - Map UI, Real-time Sync, and Geolocation Fixes

### 📍 Map & Geolocation Reliability
- **Fix**: Removed conflicting CSS `transition-transform` from the live user map marker (`LiveUserMarker.tsx`) to eliminate visual pin drifting and stuttering during high-frequency GPS updates.
- **Improvement**: Updated the `useLiveLocation` hook with a 20-second timeout and a 10-second cache (`maximumAge`) to gracefully handle weak GPS signals without throwing `Timeout expired` errors.

### 🚀 Real-time Signaling & API Performance
- **Fix**: Added a `limitToLast(20)` constraint to the driver's real-time trip request listener. This prevents massive historical payload downloads and instantly resolves latency issues when passengers hail a ride.

### 💳 Seat Synchronization & Reputation
- **Fix**: Rewrote `updateTripStatus` to dynamically resolve whether an ID belongs to the `trips` or `bookings` collection. This restores the atomic release of seats (`releaseOnlineSeats`) when a driver completes a passenger booking.
- **Security & Fix**: Resolved a "Permission denied" error during reputation sync by restricting the driver query to just `users/$uid/solanaWallet`. Updated `submitTripRating` to properly route to the `bookings` collection for reputation synchronization.
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
- [x] Implement on-chain PDA storage for driver reputation (Phase 2). ✓ Done 2026-05-13
- [ ] Add automated integration tests for the new transaction rollback logic.
