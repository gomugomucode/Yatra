# Changelog

All notable changes to the Yatra project will be documented in this file.

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
