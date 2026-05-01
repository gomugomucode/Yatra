# Changelog

All notable changes to the Yatra project will be documented in this file.

## [1.7.3] - 2026-05-01
### Final Production Hardening (Security, Integrity, Determinism)

#### Firebase Rules Hardening
- Tightened `database.rules.json` with stricter least-privilege behavior for critical paths: `bookings`, `trips`, `tripRequests`, and `alerts`.
- Added/expanded `.validate` schema checks on critical nodes so writes are shape-safe and reject malformed payloads.
- Removed broad client mutation on booking records (`bookings/$bookingId/.write` locked), preventing passenger-side post-creation tampering.
- Added immutable guards on sensitive trip fields (`driverId`, `busId`, and escrow fields/signatures/amounts) to block unauthorized state edits.
- Added query-scoped root read guards to align list access with indexed user-specific queries rather than broad root reads.

#### API Integrity and Exploit Prevention
- Hardened `/api/solana/escrow/release` with strict preconditions: trip+booking existence, status consistency, escrow lock-state consistency, GPS-backed completion proof, and amount/participant integrity checks.
- Hardened `/api/solana/escrow/reclaim` with dual-record consistency checks plus deterministic reclaim-policy enforcement before on-chain refund.
- Hardened `/api/solana/mint-ticket` with stricter fare validation, booking existence checks, and passenger-booking ownership enforcement.
- Hardened `/api/solana/verify-driver` with stricter payload/wallet validation and explicit safe error responses.

#### State Integrity Guarantees
- Updated `lib/firebaseDb.ts` so trip status updates synchronize linked booking status to prevent booking/trip divergence.
- Upgraded GPS completion flow (`autoCompleteTripByGPS`) to persist explicit completion evidence (`completionMethod`, `gpsVerifiedAt`) and keep booking/trip completion in sync.
- Replaced silent failure in trip location publishing with explicit errors for invalid coordinates.

#### Reliability Tests (Integration-Level)
- Added deterministic integration tests in `tests/solana-api.integration.test.ts` for:
  - `/api/solana/mint-ticket`
  - `/api/solana/escrow/release`
  - `/api/solana/escrow/reclaim`
  - `/api/solana/verify-driver`
- Fully mocked Firebase Admin and Solana boundaries to ensure zero network dependency and deterministic pass/fail behavior.
- Expanded `tests/database-rules.test.ts` to validate critical schema and immutability constraints in hardened Firebase rules.

#### Cleanup
- Removed noisy production debug logs from escrow execution paths in `lib/solana/escrow.ts`.
- Standardized explicit, safe error surfaces for security-sensitive API failures.

## [1.7.2] - 2026-05-01
### Reliability, Security Tightening, and Verification Truthfulness

#### Tests and Verification
- Added deterministic Vitest-based test setup (`vitest.config.ts`, `npm run test`).
- Added coverage for trip transition matrix, escrow reclaim policy edge cases, mint-ticket input/persistence invariants, and Firebase rules privacy assumptions.
- Extracted reusable core policies for testing and runtime consistency:
  - `lib/tripStateMachine.ts`
  - `lib/solana/escrowPolicy.ts`

#### ZK Identity UX and Server Validation
- Removed misleading "verified" wording from onboarding proof generation UI in `components/onboarding/YatraOnboardingWizard.tsx`; proof generation is now clearly labeled as local-only until server verification.
- Tightened verifier input checks in `lib/zk/verifier.ts` to reject malformed proof payloads early.
- Hardened `/api/solana/verify-driver` request validation and reduced noisy logs, while preserving explicit error reporting.

#### Least-Privilege Firebase Alignment
- Tightened `database.rules.json` for `bookings`, `trips`, `users`, and `alerts` to better enforce participant/admin scope and reduce broad write exposure.
- Updated `subscribeToBookings` in `lib/firebaseDb.ts` to use role-scoped Firebase queries instead of root reads, aligning client behavior with least-privilege rules.

#### Landing Motion Polish
- Upgraded landing interactions in `app/page.tsx` with smoother scroll-reactive hero motion, refined CTA shimmer treatment, and improved tactile card feedback while preserving the Daylight aesthetic and performance.

#### Cleanup
- Reduced noisy logs in production-sensitive paths (`lib/zk/prover.ts`, `lib/firebaseDb.ts`, `lib/utils/sms.ts`).
- Added mint-ticket persistence helper utilities to keep receipt write path behavior explicit and testable.

## [1.7.1] - 2026-05-01
### Infrastructure Finalization & Escrow Hardening

#### Trip Lifecycle & GPS Verification
- **Refined GPS Completion**: Stabilized the 200m proximity check in the driver dashboard using a persistent location reference to prevent jitter-induced completion failures.
- **Two-Phase ETA**: Implemented a dynamic ETA system on the passenger side that automatically switches between "Time to Pickup" and "Time to Destination" based on the current trip phase.
- **Atomic State Transitions**: Hardened the `autoCompleteTripByGPS` flow to ensure synchronized cleanup of real-time location and trip state in Firebase.

#### Solana Escrow & Digital Payments
- **Escrow Reclaim (Refund) System**: Implemented a secure reclaim system for digital payments. Passengers can now refund funds from the Solana PDA if a trip is cancelled, rejected, or expires after a 2-hour safety timeout.
- **NPR-to-SOL Conversion Fix**: Updated the conversion factor in `lib/solana/escrow.ts` to provide more realistic transaction amounts for Devnet testing (1 NPR ≈ 0.0001 SOL).
- **Reclaim UI Integration**: Added a "Reclaim Funds" action to the `TripTicketCard` for failed digital bookings, ensuring passengers can easily recover locked funds.

#### Reputation & Anchoring (TRRL)
- **Finalized Reputation Anchoring**: Completed the integration of on-chain reputation synchronization. Driver scores are now anchored via the Solana Memo program upon trip completion.
- **Robust API Handling**: Added detailed error handling and fallbacks to the `/api/solana/update-reputation` endpoint to prevent blockchain latency from blocking the UI flow.

## [1.7.0] - 2026-05-01
### GPS-Verified Trips & Solana Escrow System

#### Trip Lifecycle & GPS Enforcement
- **GPS-Verified Completion**: Implemented a strict 200m proximity check in the driver dashboard. Drivers can no longer mark a trip as "Completed" unless their live GPS coordinates are within 200m of the destination pin, preventing "force-completion" fraud.
- **Atomic Cleanup**: Added `autoCompleteTripByGPS` utility in `lib/firebaseDb.ts` to coordinate status transitions and real-time location data cleanup upon trip finalization.

#### Solana Escrow Protocol
- **PDA-Based Escrow**: Implemented a Program Derived Address (PDA) escrow pattern in `lib/solana/escrow.ts`. Digital payments are now securely locked in a trip-specific escrow account on Solana Devnet.
- **On-Chain Release**: funds are only released to the driver's wallet via the `/api/solana/escrow/release` endpoint after the backend verifies the GPS-enforced trip completion.
- **Booking Integration**: Wired the escrow initialization into the booking creation API (`app/api/bookings/create/route.ts`). If `paymentMethod === 'digital'`, funds are automatically locked before the trip starts.

#### Protocol Layer & Reputation
- **On-Chain Reputation Anchoring**: Upgraded the Tokenized Reputation Layer (TRRL) to anchor scores on-chain via a dedicated API (`app/api/solana/update-reputation`). 
- **Reputation PDA**: Introduced simulated PDA derivation for reputation tracking, preparing the system for a full Anchor program deployment.
- **Enhanced TRRL Logic**: Refactored `lib/solana/trrl.ts` to support atomic updates of driver scores with verifiable Solana transaction signatures.


## [1.6.0] - 2026-05-01
### Stability & Console Cleanup

#### Wallet Infrastructure
- **Redundant Adapter Removal**: Removed explicit `PhantomWalletAdapter` from `WalletProviderWrapper.tsx`. The application now relies on the **Solana Wallet Standard**, which automatically detects Phantom and other modern wallets without redundant library overhead.

#### Push Notification Stability
- **Graceful Registration**: Wrapped service worker and push token registration in `lib/push.ts` with robust `try/catch` blocks and browser feature guards.
- **AbortError Suppression**: Suppressed noisy `AbortError` logs that occur when registration is interrupted or unsupported by the browser environment.
- **Permission Guards**: Added strict checks for `PushManager` and `Notification.permission` before attempting registration, eliminating console warnings in non-compliant browsers.

#### Runtime Optimization
- **Console Noise Reduction**: Purged over 15+ verbose `console.log` and `console.warn` calls from the driver and passenger dashboards.
- **Production Logging**: Replaced noisy developmental logs with meaningful `console.debug` calls for non-critical failures and retained only critical error reporting.

## [1.5.0] - 2026-05-01
### ZK Infrastructure & Project Licensing

#### ZK Asset Standardization
- **Public Asset Migration**: Relocated ZK circuit build outputs to a standardized public path (`/public/zk/`) to ensure reliable client-side fetching.
- **Path Reconciliation**: Updated `lib/zk/prover.ts` to use standardized paths (`/zk/driverIdentity.wasm`, `/zk/driverIdentity.zkey`).
- **Error Resilience**: Implemented graceful failure handling in the ZK prover. The system now provides clear, descriptive error messages if cryptographic assets are missing, preventing application crashes during verification.

#### Project Governance
- **MIT License**: Added official MIT License file to the project root with 2026 Yatra copyright for GitHub compatibility and open-source compliance.

## [1.4.0] - 2026-05-01
### Final Daylight UI Audit & Component Refactoring

#### Design System Completion
- **Universal Daylight Compliance**: Performed a site-wide audit and refactored all remaining UI components to ensure 100% adherence to the Daylight (light-only) design system.
- **Surface & Typography Standardization**: Replaced all residual dark-themed surfaces and low-contrast text with high-visibility tokens (`bg-white`, `bg-slate-50`, `text-slate-900`, `text-slate-600`).
- **Contrast Optimization**: Eliminated semi-transparent backgrounds and legacy dark-mode overrides in favor of solid, high-contrast surfaces optimized for outdoor, high-glare environments.

#### Component Refactoring
- **Driver Dashboard**: Overhauled headers, status badges, and SOS buttons in `app/driver/page.tsx` for maximum visibility.
- **Passenger Dashboard**: Refactored the hailing instruction grid, status banners, and map overlays in `app/passenger/page.tsx`.
- **Booking & Modals**:
    - **DetailedBookingModal.tsx**: Updated the booking flow, vehicle selection, and confirmation states with solid surfaces and high-contrast typography.
    - **BookingPanel.tsx**: Refactored the quick-hail and manual booking panel to remove glassmorphism and improve input legibility.
- **Alerts & Notifications**:
    - **AccidentAlert.tsx**: Improved contrast for emergency alerts, using solid red borders and high-visibility countdown timers.
    - **NotificationToast.tsx**: Standardized shared toast notifications with high-contrast text and icon containers.
- **Profile & Wallet**:
    - **YatraProfileDrawer.tsx**: Completely refactored the passenger profile drawer, including wallet balance cards and journey NFT galleries.
    - **WalletSettings.tsx**: Updated Solana wallet connection states and verification badges for better clarity on light backgrounds.
- **Trip Management**:
    - **TripHistory.tsx & TripTicketCard.tsx**: Overhauled the trip history list and NFT ticket cards, replacing dark-gradient backgrounds with clean light-theme variants.
    - **RouteInfo.tsx & SeatVisualizer.tsx**: Updated route stops and seat availability grids for improved data legibility.

#### Build & Stability
- **Turbopack Build Verification**: Successfully verified code-wide changes with `npm run build`, ensuring zero regressions in JSX structure or CSS utility compatibility.
- **JSX Structuring**: Fixed a critical structure error in the passenger dashboard instruction grid that was causing build failures.

## [1.3.0] - 2026-05-01
### Modern SaaS UI Upgrade & Turbopack Stability

#### Landing Page Redesign
- **Daylight SaaS Aesthetic**: Completely overhauled the landing page with a modern, high-contrast light theme (Pure White, Charcoal text, Orange accents).
- **Framer Motion Integration**: Added performant micro-interactions, including staggered entry animations and smooth hover-lift effects on feature cards.
- **Hero Section**: Implemented a high-conversion hero section with animated CTAs and a subtle orange glow pulse.

#### Stability & Module Remediation
- **Turbopack Compatibility**: Resolved critical "module factory is not available" errors by simplifying `ScrollReveal` component to avoid `framer-motion` `whileInView` triggers.
- **Zod Downgrade**: Reverted `zod` from canary v4 to stable `^3.23.8` to fix module instantiation crashes in Next.js 16.
- **PWA Infrastructure**: Created standard `/public/sw.js` and verified `manifest.json` to eliminate asset 404s and support offline capabilities.
- **TypeScript Safety**: Added global type declarations for `snarkjs` in `types/snarkjs.d.ts` to resolve build-time errors in the ZK prover.

#### UI & Performance Tweaks
- **Button Visibility**: Fixed a critical text visibility bug in the driver CTA where black text was layered on a dark background.
- **Scroll Optimization**: Added `data-scroll-behavior="smooth"` to `RootLayout` for consistent, accessible navigation.
- **Service Worker**: Implemented a network-first caching strategy in `sw.js` for dynamic transit data reliability.

## [1.2.0] - 2026-04-30
### "Daylight" UI Migration & System Stabilization

#### Core Architecture
- **Permanent Light Mode Enforcement**: Completely removed dark mode across the application to ensure a bright, high-contrast, daylight-friendly experience. Removed the theme toggle from the Navbar, disabled `useTheme`, removed the FOUC script, and forced `light_all` tiles in the Leaflet map.
- **Global Design System**: Implemented a comprehensive CSS variable system in `globals.css` using `--y-*` prefix. Standardized tokens for surface, background, border, text, and brand colors.
- **Tailwind Integration**: Fully mapped Tailwind v4 configuration to the new semantic tokens, ensuring utility classes like `bg-y-surface` and `text-y-purple` are the primary styling method.
- **FOUC Prevention**: Injected a theme-persistence script in `layout.tsx` `<head>` to execute before React hydration, eliminating the "dark flash" on initial load.
- **Dark Mode Support**: Updated the dark theme selector to use `[data-theme="dark"]` for robust cross-browser support and consistency with the persistence script.

#### Component & Feature Updates
- **Standardized Navbar**: Refactored `components/shared/Navbar.tsx` to include a `children` prop, enabling dynamic injection of page-specific actions (e.g., booking modals, profile drawers) while maintaining a consistent layout across all dashboards.
- **Driver Dashboard**: 
    - Remediated "Cockpit" design leaks in `app/driver/page.tsx`.
    - Removed `backdrop-blur` and opacity-based backgrounds (`rgba()`).
    - Standardized SOS button and status indicators for high visibility.
    - Integrated standardized `Navbar` with driver-specific interactive elements.
- **Passenger Dashboard**: 
    - Updated `app/passenger/page.tsx` to utilize the new `Navbar` system.
    - Refactored "Active Trip" cards and "Ride is Here" alerts to use solid brand surfaces (`bg-y-teal`, `bg-y-surface`).
    - Optimized ETA overlays with high-contrast text and solid backgrounds.
- **Leaflet Map Synchronization**:
    - Resolved SSR tile-mismatch issues in `components/map/LeafletMap.tsx` using a `mounted` state guard for the `TileLayer`.
    - Synchronized map styles with the active theme (`dark_all` vs `light_all` tiles).
    - Removed glassmorphism from GPS status overlays and standardized marker ripple effects.
- **Auth & Profile**:
    - Cleaned up loading states in `app/auth/profile/page.tsx`, replacing legacy `slate` and `orange` colors with `y-purple` and `y-bg` tokens.
    - Verified all onboarding screens follow the high-contrast Daylight aesthetic.

#### Performance & Accessibility
- **GPU Optimization**: Eliminated `backdrop-blur` and heavy SVG filters site-wide, significantly improving scroll performance and battery life on mobile devices.
- **Outdoor Legibility**: Increased contrast ratios by replacing semi-transparent overlays with solid surfaces, optimized for high-glare environments.
- **Touch Target Compliance**: Audited and enforced a minimum 48px touch target size for all primary interactive elements across mobile views.
- **Theme-Compliant Skeletons**: Standardized `Skeleton` components to use theme-aware pulse colors, preventing jarring transitions during data fetching.

#### Style Cleanup
- **Removed**: 
    - All instances of `backdrop-blur-*`.
    - Hardcoded opacity backgrounds (e.g., `bg-white/80`, `bg-black/40`).
    - Redundant header logic in dashboard pages, now centralized in `Navbar`.

#### Final Remediation & Bug Fixes
- **OS Theme Override Bug**: Fixed an issue where the OS dark mode preference (`prefers-color-scheme: dark`) was overriding the Daylight (Light) theme default. Removed the media query from `globals.css` and updated both `useTheme.ts` and the `layout.tsx` FOUC script to enforce Light mode as the strict default unless the user explicitly toggles it.
- **Strict Daylight Adherence**: Overwrote `globals.css` with exact token mapping, matching the user's explicit token spec.
- **FOUC Fix**: Updated FOUC inline script in `layout.tsx` to precisely match fallback requirement and updated `themeColor` to `#F8FAFC`.
- **Legacy Tailwind Purge**: Found and replaced all residual `text-slate-*`, `border-slate-*`, and hardcoded utility leaks across `app/passenger/page.tsx` and `app/driver/page.tsx` with `--y-*` semantic variables.
- **TypeScript & Build**: Fixed missing `useTheme` import causing IDE and build errors in `app/passenger/page.tsx`. Changed Zod wildcard import (`* as z`) to named import in `app/auth/profile/page.tsx` to fix Turbopack caching and module factory crashes.

---
*Note: This release establishes Yatra as a production-grade platform with a robust, accessible, and high-performance design system tailored for the unique challenges of transit in Nepal.*
