# Yatra Project Changelog

All notable changes to the Yatra protocol and application will be documented in this file.

## [2026-04-23] - Authentication, Admin Portal & Infrastructure

### Added
- **Authentication System**: Implemented a secure authentication system restricting access to specific roles.
- **Admin Portal**: Created a portal for managing application resources (images, quotes).
- **Multi-Upload Logic**: Enabled admins to upload multiple resources simultaneously.

### Fixed
- **NPM Installation**: Resolved critical dependency installation errors related to 'yarn' and EBUSY/EPERM file locks.
- **Initial Setup**: Finalized the core project structure and base dependencies.


## [2026-04-24] - ZK Identity & Automated Onboarding

### Added
- **Integrated ZK Verification**: The Driver Profile setup page now includes a built-in ZK-SNARK verification flow.
- **Birth Year Validation**: Added age verification (21+) for drivers, integrated into the ZK circuit input.
- **Verification Progress UI**: Implemented real-time status indicators in the profile form.
- **Automated Solana Minting**: Integrated `/api/solana/verify-driver` into the signup flow. 
- **Auto-Approval Logic**: Verified drivers are automatically marked as `isApproved: true`.
- **Environment Template**: Created `.env.example` for environment variable standardization.
- **Unified Validation**: Centralized regex and validation logic in `lib/zk/prover.ts`.

### Changed
- **Profile Submission**: Updated `handleDriverSubmit` in `app/auth/profile/page.tsx` for ZK fields.
- **Image Processing**: Enhanced `handleImageChange` to support license photos with auto-resizing.
- **Security Rules**: Refined `database.rules.json` for participant-only visibility and badge validation.

### Fixed
- **Firebase "Undefined" Errors**: Resolved critical runtime errors during profile submission.
- **Icon Imports**: Fixed missing `Calendar` and `CheckCircle2` imports.

## [2026-04-24] - Driver Portal & Dashboard Optimization

### Added
- **Driver Profile Sidebar**: Implemented a sidebar for drivers to mirror the passenger experience.
- **TRRL Integration**: Integrated Tokenized Reputation Layer (TRRL) to reward drivers based on performance.
- **Avatar Access**: Restored driver profile accessibility via a visible avatar button in the navigation.

### Changed
- **Dashboard Parity**: Achieved feature parity between passenger and driver sidebars (reputation, earnings, history).
- **Navigation Flow**: Fixed navigation issues in the driver portal to ensure a premium ride-hailing UX.

### Fixed
- **Firebase "Permission Denied"**: Resolved database permission errors by correcting region configuration and rule scoping.
- **TypeScript Errors**: Fixed type-safety issues across the driver dashboard and component integration.


---
*Built with pride in Butwal, Nepal 🇳🇵*
