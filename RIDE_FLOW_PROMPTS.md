# Yatra — Real Ride-Hailing Flow: Complete Implementation Guide
> Source of truth: codebase diagnosis (2026-04-16) + CLAUDE.md

---

## 1. Current-State Diagnosis

### What is already working
| System | Status |
|---|---|
| Driver live location (`drivers/active/{driverId}`) | Solid — writes every 5s with heartbeat + `onDisconnect` presence |
| Passenger location (`locations/{uid}`) | Works — `useLiveLocation` hook writes every 3s |
| Trip request creation (`POST /api/trip-requests/create`) | Works end-to-end — writes to `trips/`, verifies session, sends FCM push |
| Driver notification | `subscribeToTripRequests` fires toast + service-worker push on new request |
| Proximity handshake | `useProximityHandshake` — Haversine + 10m alert. Solid logic |
| OSRM routing | `lib/routing/osrm.ts` exists; lazy ETA fetch in proximity hook (throttled 30s) |
| Booking / NFT / SMS on dropoff | Complete and functional — do not touch |
| Auth, ZK, emergency, admin | Functional — leave alone |

### What is incomplete
| Gap | Effect |
|---|---|
| No driver Accept/Reject UI | Driver gets a toast but there are no Accept/Reject buttons. Trip stays in `requested` forever |
| No `updateTripStatus` write functions | `firebaseDb.ts` has subscription reads but zero write functions to advance trip state |
| Two-phase ETA not wired | OSRM ETA exists in `etaSeconds` inside the hook but is never surfaced in any UI |
| Route polyline not drawn | `osrm.ts` returns a GeoJSON LineString — nothing renders it on the map |
| Booking and trip-request flows disconnected | `handleBusSelect` (hailing) and `handleBookBus` (seat reservation) are two parallel, unconnected systems |

### What is unsafe for real users
| Issue | Risk |
|---|---|
| `locations` node is `.read: true` | Any authenticated user reads every passenger's live GPS |
| `trips` node is `.read: auth != null` | Any logged-in user reads all trips from all passengers and drivers |
| No radius filter applied | `subscribeToLiveUsers` returns ALL online drivers globally — passenger in Kathmandu sees drivers in Butwal |
| Passenger location published before driver accepts | `useLiveLocation` starts broadcasting immediately on dashboard load |
| `requestStatus` written but never read | Field exists, is written correctly, but no component reads it to gate visibility |

### What is missing for a real ride-hailing flow
1. Nearby driver filtering (5–10 km radius, client-side)
2. Driver accept/reject panel with countdown timer
3. Trip status write functions: `acceptTrip`, `rejectTrip`, `startTrip`, `completeTrip`
4. Visibility gating: passenger location only shared with their specific accepted driver
5. `subscribeTripLocation` and `publishTripLocation` via a `tripLocations/{tripId}/{role}` path
6. Two-phase ETA: Phase 1 (driver → pickup pin), Phase 2 (driver → dropoff after boarding)
7. Route polyline drawn on passenger map for active trip
8. Firebase security rules that enforce participant-only reads on `trips` and `locations`
9. Bridge between trip-accept and booking creation (or a deliberate decision to keep them separate)

---

## 2. Ride-Session State Machine

```
idle
  └─► viewing_nearby_drivers   (geolocation granted; passenger sees filtered drivers within 10km)
        └─► driver_selected     (passenger taps a driver pin)
              └─► request_sent  (POST /api/trip-requests/create; trip.status = "requested")
                    ├─► cancelled     (passenger cancels before accept; trip.status = "cancelled")
                    └─► driver_accepted  (driver taps Accept; trip.status = "accepted")
                          ├─► enroute_to_pickup  (implicit; driver is moving toward pickup pin)
                          │     └─► arrived_pickup  (driver within 50m; trip.status = "arrived")
                          │           └─► trip_started  (driver taps "Passenger Boarded"; trip.status = "active")
                          │                 └─► trip_completed  (driver taps "Drop Off"; trip.status = "completed"
                          │                                      → NFT minted, booking created, SMS sent)
                          └─► cancelled  (driver rejects; trip.status = "cancelled")
```

### State definitions

| State | Who sees whom | Location data visible | ETA shown | Notification |
|---|---|---|---|---|
| `idle` | Neither | Nothing published | None | None |
| `viewing_nearby_drivers` | Passenger sees anonymous driver pins within 10km | Driver positions only (anonymous). Passenger location NOT in Firebase yet | None | None |
| `driver_selected` | Passenger sees selected driver pin | Same as above | None | None |
| `request_sent` | Passenger sees selected driver moving. Driver does NOT see passenger location | Passenger lat/lng NOT published. Pickup pin coords embedded in trip record only | Passenger sees "Waiting for driver..." | Driver gets FCM push + in-app toast |
| `driver_accepted` | Both sides see each other live | Passenger publishes to `tripLocations/{tripId}/passenger`. Driver sees passenger only via this path | Phase 1: driver → pickup pin (OSRM, updates every 30s) | Passenger gets "Driver accepted" alert |
| `enroute_to_pickup` | Both see each other. Route polyline: driver → pickup pin | Same as above | Phase 1: live updating OSRM ETA | Proximity toasts at 500m / 200m / 50m |
| `arrived_pickup` | Both see each other | Same | "Driver has arrived" | Full-screen arrival alert on both sides |
| `trip_started` | Both see each other. Route polyline switches: pickup → dropoff | Passenger publishes location. Driver sees passenger | Phase 2: driver → dropoff (OSRM) | None |
| `trip_completed` | Neither. Trip record closed | Location publishing stops | None | NFT minted, SMS sent |
| `cancelled` | Neither. Clean up subscriptions | Location publishing stops | None | Cancellation toast to non-initiating party |

---

## 3. Implementation Strategy

Execute these steps in order. Each is a self-contained prompt below.

| Step | Prompt | Files affected | Risk | Can break existing? |
|---|---|---|---|---|
| 1 | Prompt A | `lib/firebaseDb.ts`, `lib/types.ts` | Low | No — additive only |
| 2 | Prompt B (rules) | `database.rules.json` | Medium | Yes — test rules before deploying |
| 3 | Prompt B (filter) | `app/passenger/page.tsx` | Low | No — adds filter only |
| 4 | Prompt C | New `components/driver/TripRequestPanel.tsx` + `app/driver/page.tsx` | Medium | Only if trip subscription is changed |
| 5 | Prompt E (gating) | `app/passenger/page.tsx` | Low | No — additive |
| 6 | Prompt E (driver subscribe) | `app/driver/page.tsx` + `MapWrapper.tsx` | Medium | MapWrapper prop change is additive |
| 7 | Prompt D (ETA) | `app/passenger/page.tsx` | Low | No — additive state + effect |
| 8 | Prompt D (route) | `components/map/LeafletMap.tsx` + `MapWrapper.tsx` | Low | Additive prop |
| 9 | Prompt C (lifecycle) | `components/driver/TripRequestPanel.tsx` | Low | Extends existing component |
| 10 | Prompt F | `app/passenger/page.tsx`, `lib/types.ts` | Medium | `RequestStatus` type touches multiple consumers — grep first |

**Critical ordering rules:**
- Do Prompt A (write functions) before Prompt C (driver panel uses them)
- Do Prompt B rules before Prompt E (rules must be deployed before passenger starts publishing to the new path)
- Steps 1, 7, and 8 are fully independent and can be done in parallel
- Steps 5 and 6 are the critical integration point — test the full mutual visibility loop between them before continuing

---

## 4. Developer Prompt A — Ride State Machine and Data Flow

```
You are a senior Firebase + TypeScript engineer working on Yatra, a real ride-hailing app for Nepal.

SOURCE OF TRUTH:
- lib/firebaseDb.ts — all Realtime Database operations (subscriptions and reads only; no write functions exist yet)
- lib/types.ts — all shared types including TripRequest, RequestStatus

TARGET FILES:
- lib/firebaseDb.ts  (add functions — do not modify any existing function)
- lib/types.ts       (extend types only — do not change any existing type signature)

GOAL:
Add the write functions and new Firebase paths that the trip state machine needs to advance
through its lifecycle. This prompt creates the foundation all other prompts build on.

DO NOT TOUCH:
- Any existing subscription functions (subscribeToTrip, subscribeToTripRequests, etc.)
- Any Solana, ZK, or auth code
- Any UI components
- The booking flow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Extend TripRequest status in lib/types.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the TripRequest interface or type. Ensure the status field covers all lifecycle states:

  type TripStatus =
    | 'requested'      // passenger sent request; driver not yet responded
    | 'accepted'       // driver accepted; both sides now visible to each other
    | 'arrived'        // driver within 50m of pickup pin
    | 'active'         // passenger boarded; trip underway
    | 'completed'      // driver tapped Drop Off; NFT minting triggered
    | 'cancelled'      // either party cancelled
    | 'rejected'       // driver rejected; passenger notified
    | 'expired';       // driver did not respond within 90 seconds

If TripRequest already has a `status` field with some of these values, extend it to include all.
Add the new type alias `TripStatus` and use it as the type of the status field.

Also extend RequestStatus in lib/types.ts (used in passenger UI):
  type RequestStatus = 'idle' | 'requesting' | 'accepted' | 'on-trip';

Export TripStatus and RequestStatus explicitly if they are not already exported.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Add write functions to lib/firebaseDb.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add the following functions. All write to Firebase Realtime DB. Use the existing
`database` import pattern already in the file.

2a. updateTripStatus
  export async function updateTripStatus(
    tripId: string,
    status: TripStatus,
    extraFields?: Record<string, unknown>
  ): Promise<void> {
    const db = getDatabase();
    await update(ref(db, `trips/${tripId}`), {
      status,
      updatedAt: new Date().toISOString(),
      ...extraFields,
    });
  }

2b. publishTripLocation
  export async function publishTripLocation(
    tripId: string,
    role: 'driver' | 'passenger',
    lat: number,
    lng: number
  ): Promise<void> {
    // Validate coordinates before writing
    if (
      !isFinite(lat) || !isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      console.warn('[publishTripLocation] Invalid coordinates', { lat, lng });
      return;
    }
    const db = getDatabase();
    await set(ref(db, `tripLocations/${tripId}/${role}`), {
      lat,
      lng,
      timestamp: new Date().toISOString(),
    });
  }

2c. subscribeTripLocation
  export function subscribeTripLocation(
    tripId: string,
    role: 'driver' | 'passenger',
    callback: (loc: { lat: number; lng: number } | null) => void
  ): () => void {
    const db = getDatabase();
    const locRef = ref(db, `tripLocations/${tripId}/${role}`);
    const unsubscribe = onValue(locRef, (snap) => {
      const val = snap.val();
      if (val && typeof val.lat === 'number' && typeof val.lng === 'number') {
        callback({ lat: val.lat, lng: val.lng });
      } else {
        callback(null);
      }
    });
    return unsubscribe;
  }

2d. cleanupTripLocation
  export async function cleanupTripLocation(tripId: string): Promise<void> {
    const db = getDatabase();
    await remove(ref(db, `tripLocations/${tripId}`));
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [ ] npx tsc --noEmit passes with zero new errors
- [ ] TripStatus type covers all 8 states listed above
- [ ] RequestStatus type includes 'accepted' and 'on-trip'
- [ ] calling updateTripStatus('test-id', 'accepted') writes { status: 'accepted', updatedAt: ... }
      to trips/test-id in the Firebase console
- [ ] calling publishTripLocation with lat: 999 does NOT write to Firebase (coordinate guard)
- [ ] calling subscribeTripLocation returns a function that, when called, stops the listener
- [ ] No existing function in firebaseDb.ts is modified

ROLLBACK:
If this breaks the build, revert lib/types.ts and lib/firebaseDb.ts from git.
These are purely additive changes — reverting restores the exact previous state.
```

---

## 5. Developer Prompt B — Nearby Driver Discovery and Firebase Rules

```
You are a senior Firebase + Next.js engineer working on Yatra.

This prompt has two parts: (A) Fix Firebase security rules, (B) Apply radius filter on the passenger side.
Do Part A first and deploy rules before doing Part B.

TARGET FILES:
- database.rules.json          (Part A — rules)
- app/passenger/page.tsx       (Part B — radius filter)
- lib/utils/geofencing.ts      (read-only reference)

GOAL:
(A) Scope Firebase read access so passengers cannot read other passengers' GPS,
    and trip data is only readable by participants.
(B) Filter the driver list on the passenger page so only drivers within a configurable
    radius appear, and nothing shows until the passenger's location is known.

DO NOT TOUCH:
- Any auth, ZK, Solana, or booking code
- drivers/active node (must stay .read: true — all passengers need to see driver positions)
- Any driver-side code
- Any map component internals

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART A — Fix database.rules.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Make the following targeted changes to database.rules.json.
Do not remove or alter any other node rules.

CHANGE 1 — Scope `locations` node:
  Find: "locations": { ".read": true, ... }
  Replace .read with: "auth != null && auth.uid === $uid"
  (Each user reads only their own location entry. Drivers read passenger
   location via the new tripLocations path instead — see CHANGE 3.)

CHANGE 2 — Scope `trips` node:
  Find: "trips": { ".read": "auth != null", ... }
  Replace .read with:
  "auth != null && (
    data.child('passengerId').val() === auth.uid ||
    data.child('driverId').val() === auth.uid
  )"
  (Only the driver and passenger assigned to a trip can read it.)
  Keep .write as "auth != null" for now.

CHANGE 3 — Add new `tripLocations` node:
  Add this node at the top level of your rules:
  "tripLocations": {
    "$tripId": {
      ".read": "auth != null && (
        root.child('trips').child($tripId).child('passengerId').val() === auth.uid ||
        root.child('trips').child($tripId).child('driverId').val() === auth.uid
      )",
      "driver": {
        ".write": "auth != null &&
          root.child('trips').child($tripId).child('driverId').val() === auth.uid"
      },
      "passenger": {
        ".write": "auth != null &&
          root.child('trips').child($tripId).child('passengerId').val() === auth.uid"
      }
    }
  }

After editing, deploy with:
  firebase deploy --only database

Test in the Firebase Rules Playground before deploying:
  - Authenticated user reading locations/{anotherUserId} → should DENY
  - Authenticated user reading trips/{tripId} where they are not a participant → should DENY
  - Authenticated user (as passenger) writing tripLocations/{tripId}/passenger → should ALLOW
  - Authenticated user (as driver) writing tripLocations/{tripId}/driver → should ALLOW

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART B — Apply radius filter in app/passenger/page.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — Add configuration constant at top of file:
  const NEARBY_DRIVER_RADIUS_KM = 10; // configurable

STEP 2 — Import the geofencing utility:
  import { isWithinRadius } from '@/lib/utils/geofencing';

STEP 3 — Replace the `filteredBuses` declaration.
  Current: filters by isActive + vehicleType only
  New logic:

  const locationPending = !userLocation;

  const filteredBuses = useMemo(() => {
    if (!userLocation) return [];
    return buses.filter((bus) => {
      if (!bus.isActive) return false;
      if (selectedVehicleType && bus.vehicleType !== selectedVehicleType) return false;
      if (!bus.currentLocation) return false;
      return isWithinRadius(
        bus.currentLocation,
        userLocation,
        NEARBY_DRIVER_RADIUS_KM
      );
    });
  }, [buses, userLocation, selectedVehicleType]);

STEP 4 — Show an empty state when location is pending.
  In the JSX, find where the driver list or map is rendered.
  When locationPending is true, instead of the driver list, render:
    <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
      <MapPin className="w-8 h-8 animate-pulse" />
      <p className="text-sm text-center">
        Grant location permission to see nearby drivers
      </p>
    </div>

STEP 5 — Show driver count as subtitle.
  When filteredBuses.length > 0, render near the list header:
    <p className="text-xs text-muted-foreground">
      {filteredBuses.length} driver{filteredBuses.length !== 1 ? 's' : ''} within {NEARBY_DRIVER_RADIUS_KM}km
    </p>

STEP 6 — Do NOT filter busLocations or busETAs maps.
  The map markers read from busLocations directly. Only filteredBuses
  (the list) is filtered. The map will still show the filtered set
  because it derives markers from filteredBuses — verify this is the case.
  If the map reads from a separate buses array, apply the same filter there.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [ ] Firebase Rules Playground: reading another user's locations/{uid} is denied
- [ ] Firebase Rules Playground: reading trips/{id} as a non-participant is denied
- [ ] Firebase Rules Playground: passenger writing tripLocations/{id}/passenger is allowed
- [ ] In the passenger UI with location permission denied: "Grant location permission" card shows
- [ ] With location permission granted and 0 drivers within 10km: "0 drivers within 10km" shows
- [ ] A driver whose currentLocation is 15km away does not appear in the list
- [ ] A driver whose currentLocation is 3km away appears in the list
- [ ] npx tsc --noEmit: zero new errors

MANUAL TEST STEPS:
1. Open passenger page on a device with location disabled → should see empty state card
2. Enable location → nearby drivers appear (if any are online within 10km)
3. Temporarily set NEARBY_DRIVER_RADIUS_KM = 0.001 → no drivers should appear
4. Check Firebase console: locations/{yourUid} should only be readable by your own session

ROLLBACK:
- database.rules.json: revert the file and redeploy. Rules changes take effect immediately.
- page.tsx: revert the filteredBuses change from git. locationPending flag is purely additive.
```

---

## 6. Developer Prompt C — Request and Acceptance Flow

```
You are a senior Next.js + Firebase engineer working on Yatra.

TARGET FILES:
- components/driver/TripRequestPanel.tsx   (CREATE NEW)
- app/driver/page.tsx                      (MODIFY — add panel rendering and lifecycle buttons)
- lib/firebaseDb.ts                        (read-only — use updateTripStatus from Prompt A)

GOAL:
Give the driver a real Accept/Reject panel when a trip request arrives, and add
"Passenger Boarded" and "Complete Trip" buttons that advance the trip state machine.

DO NOT TOUCH:
- The existing trip subscription logic (subscribeToTripRequests)
- Solana, ZK, auth, or booking code
- Passenger-side code
- Any map component internals
- handlePassengerDropoff (it handles NFT minting — call it, do not replace it)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Create components/driver/TripRequestPanel.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create a new component with this exact interface:

  interface TripRequestPanelProps {
    request: TripRequest;
    driverLocation: { lat: number; lng: number } | null;
    tripStatus: TripStatus;
    onAccept: () => void;
    onReject: () => void;
    onPassengerBoarded: () => void;
    onCompleteTrip: () => void;
  }

The component renders a fixed bottom panel (z-50, above map, below SOS bar).
It has three distinct states based on tripStatus:

STATE: 'requested'
  - Show: passenger display name (or "Passenger"), distance from driver to pickup pin
  - Distance: use haversineDistance(driverLocation, request.pickupLocation) if both are defined, else "—"
  - Import haversineDistance from lib/utils/geofencing.ts
  - Show a 90-second countdown timer (count down from 90)
  - When timer hits 0: auto-call onReject
  - Two buttons: "Accept" (emerald filled) and "Reject" (ghost/destructive)
  - onAccept calls onAccept prop; onReject calls onReject prop

STATE: 'accepted' | 'arrived'
  - Hide Accept/Reject
  - Show green banner: "Trip accepted — navigate to pickup"
  - Show button: "Passenger Boarded →" (green, full-width)
  - onPress calls onPassengerBoarded prop

STATE: 'active'
  - Hide the boarded button
  - Show blue banner: "Trip underway"
  - Show button: "Complete Trip ✓" (blue, full-width)
  - onPress calls onCompleteTrip prop

Style: dark panel consistent with the existing driver cockpit theme.
Use Framer Motion for a slide-up animation on first render.
Use lucide-react for icons (MapPin, Clock, Check, X).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Wire TripRequestPanel into app/driver/page.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2a. Import TripRequestPanel and updateTripStatus:
  import TripRequestPanel from '@/components/driver/TripRequestPanel';
  import { updateTripStatus } from '@/lib/firebaseDb';

2b. Render TripRequestPanel below the map area when activeTripRequest is non-null:
  {activeTripRequest && (
    <TripRequestPanel
      request={activeTripRequest}
      driverLocation={driverLocation}
      tripStatus={activeTripRequest.status as TripStatus}
      onAccept={handleAcceptTrip}
      onReject={handleRejectTrip}
      onPassengerBoarded={handlePassengerBoarded}
      onCompleteTrip={handleCompleteTrip}
    />
  )}

2c. Add the four handler functions (add these to the component, do not modify existing handlers):

  const handleAcceptTrip = async () => {
    if (!activeTripRequest) return;
    await updateTripStatus(activeTripRequest.id, 'accepted');
    setActiveTripRequest(prev => prev ? { ...prev, status: 'accepted' } : null);
    toast.success('Trip accepted — navigate to pickup');
  };

  const handleRejectTrip = async () => {
    if (!activeTripRequest) return;
    await updateTripStatus(activeTripRequest.id, 'rejected');
    setActiveTripRequest(null);
    toast.info('Trip rejected');
  };

  const handlePassengerBoarded = async () => {
    if (!activeTripRequest) return;
    await updateTripStatus(activeTripRequest.id, 'active');
    setActiveTripRequest(prev => prev ? { ...prev, status: 'active' } : null);
    toast.success('Trip started');
  };

  const handleCompleteTrip = async () => {
    if (!activeTripRequest) return;
    await updateTripStatus(activeTripRequest.id, 'completed');
    // Call existing dropoff handler with bookingId if available
    if (activeTripRequest.bookingId) {
      await handlePassengerDropoff(activeTripRequest.bookingId);
    }
    setActiveTripRequest(null);
    toast.success('Trip completed');
  };

2d. In the existing showPassengerReachedAlert dismiss handler:
  Before dismissing the full-screen alert, call:
    await updateTripStatus(activeTripRequest.id, 'arrived');
  This ensures the passenger side also sees the 'arrived' status.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [ ] When a trip request arrives, TripRequestPanel slides up from the bottom
- [ ] Countdown timer starts at 90 and counts down; at 0, trip is auto-rejected
- [ ] "Accept" writes { status: 'accepted' } to trips/{tripId} in Firebase console
- [ ] "Reject" writes { status: 'rejected' } to trips/{tripId}
- [ ] After acceptance, panel transitions to "Passenger Boarded" state
- [ ] "Passenger Boarded" writes { status: 'active' }
- [ ] "Complete Trip" writes { status: 'completed' }
- [ ] handlePassengerDropoff is called on complete (verify NFT mint is not broken)
- [ ] npx tsc --noEmit: zero errors

MANUAL TEST STEPS:
1. Log in as driver, go online
2. In a second window/device, log in as passenger, select that driver, send a request
3. Driver panel should slide up with countdown → press Accept
4. Check Firebase console: trips/{id}.status = 'accepted'
5. Press "Passenger Boarded" → check status = 'active'
6. Press "Complete Trip" → check status = 'completed'
7. Wait for countdown without pressing Accept → trip should auto-reject

ROLLBACK:
- Delete TripRequestPanel.tsx
- Remove the four handler functions and the panel rendering from driver/page.tsx
- These are additive; removing them restores the previous state exactly
```

---

## 7. Developer Prompt D — Two-Phase ETA and Route Polyline

```
You are a senior Next.js + React engineer working on Yatra.

TARGET FILES:
- app/passenger/page.tsx               (add ETA state and effects)
- components/map/MapWrapper.tsx        (add activeRoute prop)
- components/map/LeafletMap.tsx        (render Polyline from activeRoute)
- lib/routing/osrm.ts                  (read-only reference)

GOAL:
Wire two-phase ETA for the passenger: Phase 1 shows driver's ETA to the pickup pin
before boarding, Phase 2 shows ETA to destination after boarding. Draw the route on
the map. Both must update as the driver moves.

DO NOT TOUCH:
- useProximityHandshake (it handles the final 10m arrival alert — keep it)
- Booking, Solana, ZK, auth code
- Driver-side map components
- Existing map props that are not mentioned here

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Add ETA state in app/passenger/page.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add these state variables:
  const [etaToPickup, setEtaToPickup] = useState<number | null>(null);
  const [etaToDestination, setEtaToDestination] = useState<number | null>(null);
  const [activeRoute, setActiveRoute] = useState<GeoJSON.LineString | null>(null);
  const lastEtaFetchRef = useRef<{ lat: number; lng: number } | null>(null);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Add the two-phase ETA effect
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a useEffect that watches the active driver's position and trip status.
Use `hailedDriverId` (or the equivalent variable that stores the selected driver's ID)
and `busLocations[hailedDriverId]` to get the driver's current position.

  useEffect(() => {
    const trip = activeTripPickup; // the subscribed trip object
    if (!trip || !hailedDriverId) {
      setEtaToPickup(null);
      setEtaToDestination(null);
      setActiveRoute(null);
      return;
    }
    if (!['accepted', 'arrived', 'active'].includes(trip.status)) return;

    const driverPos = busLocations[hailedDriverId];
    if (!driverPos) return;

    // Skip if driver hasn't moved significantly (4 decimal places ≈ 11m)
    const last = lastEtaFetchRef.current;
    if (
      last &&
      Math.abs(last.lat - driverPos.lat) < 0.0001 &&
      Math.abs(last.lng - driverPos.lng) < 0.0001
    ) return;

    lastEtaFetchRef.current = { lat: driverPos.lat, lng: driverPos.lng };

    const fetchEta = async () => {
      try {
        const isActive = trip.status === 'active';
        const target = isActive ? dropoffLocation : pickupLocation;
        if (!target) return;

        // Use getRoute from lib/routing/osrm.ts which returns { duration, geometry }
        const result = await getRoute(
          { lat: driverPos.lat, lng: driverPos.lng },
          { lat: target.lat, lng: target.lng }
        );

        if (result) {
          const etaMinutes = Math.ceil(result.duration / 60);
          if (isActive) {
            setEtaToDestination(etaMinutes);
            setEtaToPickup(null);
          } else {
            setEtaToPickup(etaMinutes);
            setEtaToDestination(null);
          }
          if (result.geometry) {
            setActiveRoute(result.geometry as GeoJSON.LineString);
          }
        }
      } catch (err) {
        console.warn('[ETA fetch failed]', err);
      }
    };

    fetchEta();
    const interval = setInterval(fetchEta, 30_000); // throttle 30s
    return () => clearInterval(interval);
  }, [activeTripPickup?.status, busLocations, hailedDriverId, pickupLocation, dropoffLocation]);

  // Clear route and ETA when trip ends
  useEffect(() => {
    if (!activeTripPickup || ['completed', 'cancelled', 'rejected', 'expired']
        .includes(activeTripPickup.status)) {
      setEtaToPickup(null);
      setEtaToDestination(null);
      setActiveRoute(null);
      lastEtaFetchRef.current = null;
    }
  }, [activeTripPickup?.status]);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Render the ETA card in the passenger UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a fixed overlay card above the map (z-[400]):

  {(etaToPickup !== null || etaToDestination !== null) && (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-4 py-2 rounded-full shadow-lg backdrop-blur-sm"
         style={{ background: etaToDestination !== null ? '#1d4ed8cc' : '#059669cc' }}>
      <span className="text-lg">{etaToDestination !== null ? '🏁' : '🚗'}</span>
      <span className="text-white text-sm font-medium">
        {etaToDestination !== null
          ? `${etaToDestination} min to destination`
          : `${etaToPickup} min to pickup`}
      </span>
    </div>
  )}

Hide when both are null (before request or after trip ends).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — Pass activeRoute to the map components
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In app/passenger/page.tsx, pass activeRoute to MapWrapper:
  <MapWrapper ... activeRoute={activeRoute} />

In components/map/MapWrapper.tsx:
  Add prop: activeRoute?: GeoJSON.LineString | null
  Pass it through to LeafletMap: <LeafletMap ... activeRoute={activeRoute} />

In components/map/LeafletMap.tsx:
  Add prop: activeRoute?: GeoJSON.LineString | null
  Inside the map JSX (must be a client component — it already is), when activeRoute is non-null:

  import { Polyline } from 'react-leaflet';

  {activeRoute && (
    <Polyline
      positions={activeRoute.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])}
      pathOptions={{
        color: etaToDestination !== null ? '#3b82f6' : '#22d3ee',
        weight: 4,
        opacity: 0.85,
      }}
    />
  )}

  Note: GeoJSON coordinates are [lng, lat]; Leaflet expects [lat, lng] — the reversal above is correct.
  Note: LeafletMap does not have access to etaToDestination directly. Pass a prop `routePhase: 'pickup' | 'trip' | null`
  instead and use it to select the color:
    color: routePhase === 'trip' ? '#3b82f6' : '#22d3ee'

  Derive routePhase in passenger/page.tsx:
    const routePhase = etaToDestination !== null ? 'trip' : etaToPickup !== null ? 'pickup' : null;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [ ] After driver accepts, a cyan card appears on the passenger map: "X min to pickup"
- [ ] After passenger boards (trip.status = 'active'), card changes to blue: "X min to destination"
- [ ] A cyan polyline is drawn on the passenger map from driver position to pickup pin
- [ ] After boarding, polyline changes to blue from driver to destination
- [ ] ETA updates approximately every 30 seconds as driver moves
- [ ] When trip completes or cancels, ETA card and polyline both disappear
- [ ] useProximityHandshake is still running (10m arrival alert still fires)
- [ ] npx tsc --noEmit: zero new errors

MANUAL TEST STEPS:
1. Accept a trip request as driver
2. On passenger's device: cyan ETA card should appear within 30s
3. Drive (or simulate movement): ETA should update every ~30s
4. Tap "Passenger Boarded" on driver: ETA card on passenger should switch to blue
5. "Complete Trip": ETA card should disappear

ROLLBACK:
Remove the two new useEffects, the ETA state variables, and the ETA card JSX.
Remove activeRoute prop from MapWrapper and LeafletMap.
All changes are additive — removing them restores the previous state.
```

---

## 8. Developer Prompt E — Visibility and Privacy Rules

```
You are a senior Next.js + Firebase engineer working on Yatra.

TARGET FILES:
- app/passenger/page.tsx      (control when passenger publishes location)
- app/driver/page.tsx         (subscribe to passenger location during active trip)
- components/map/MapWrapper.tsx + components/map/LeafletMap.tsx  (show passenger marker)
- lib/firebaseDb.ts           (read-only — use publishTripLocation and subscribeTripLocation from Prompt A)

GOAL:
Enforce the visibility rule: passenger location is only shared with the specific driver
after they accept. Before that, the driver cannot see the passenger's GPS.

DO NOT TOUCH:
- useLiveLocation hook (driver still uses it for their own position)
- Auth, ZK, Solana code
- Booking or NFT code
- Firebase security rules (already fixed in Prompt B)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Passenger: only publish location after driver accepts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In app/passenger/page.tsx:

The passenger already calls watchPosition for the userLocation UI state.
Do NOT use useLiveLocation for Firebase writes — that hook writes to locations/{uid}
which now has restricted rules and is not the right path.

Add a new useEffect that watches activeTripPickup?.status:

  const locationPublishIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchPositionRef = useRef<ReturnType<typeof navigator.geolocation.watchPosition> | null>(null);

  useEffect(() => {
    const status = activeTripPickup?.status;
    const tripId = activeTripId; // the ID of the active trip

    // Publish only during accepted/arrived/active states
    if (!tripId || !['accepted', 'arrived', 'active'].includes(status ?? '')) {
      // Stop publishing
      if (locationPublishIntervalRef.current) {
        clearInterval(locationPublishIntervalRef.current);
        locationPublishIntervalRef.current = null;
      }
      return;
    }

    // Start publishing every 3 seconds using the userLocation from existing state
    // userLocation is already kept up to date by the separate watchPosition effect
    locationPublishIntervalRef.current = setInterval(() => {
      if (userLocation) {
        publishTripLocation(tripId, 'passenger', userLocation.lat, userLocation.lng)
          .catch(err => console.warn('[passenger publish location]', err));
      }
    }, 3000);

    return () => {
      if (locationPublishIntervalRef.current) {
        clearInterval(locationPublishIntervalRef.current);
        locationPublishIntervalRef.current = null;
      }
    };
  }, [activeTripPickup?.status, activeTripId, userLocation]);

  // Cleanup tripLocations when trip ends
  useEffect(() => {
    const status = activeTripPickup?.status;
    if (activeTripId && ['completed', 'cancelled', 'rejected', 'expired'].includes(status ?? '')) {
      cleanupTripLocation(activeTripId).catch(console.warn);
    }
  }, [activeTripPickup?.status, activeTripId]);

Import publishTripLocation and cleanupTripLocation from lib/firebaseDb.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Driver: subscribe to passenger location during active trip
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In app/driver/page.tsx:

2a. Add state:
  const [passengerLocation, setPassengerLocation] = useState<{ lat: number; lng: number } | null>(null);

2b. Add useEffect:
  useEffect(() => {
    if (!activeTripRequest?.id || !['accepted', 'arrived', 'active'].includes(activeTripRequest.status)) {
      setPassengerLocation(null);
      return;
    }
    const unsubscribe = subscribeTripLocation(
      activeTripRequest.id,
      'passenger',
      (loc) => setPassengerLocation(loc)
    );
    return unsubscribe;
  }, [activeTripRequest?.id, activeTripRequest?.status]);

Import subscribeTripLocation from lib/firebaseDb.

2c. Pass passengerLocation to MapWrapper:
  <MapWrapper ... passengerLocation={passengerLocation} />

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Render passenger marker on driver's map
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In components/map/MapWrapper.tsx:
  Add optional prop: passengerLocation?: { lat: number; lng: number } | null
  Pass it through to LeafletMap.

In components/map/LeafletMap.tsx:
  Add optional prop: passengerLocation?: { lat: number; lng: number } | null

  Import { Marker } from 'react-leaflet'.
  Import { divIcon } from 'leaflet'.

  Create a custom passenger icon:
    const passengerIcon = divIcon({
      html: `<div class="flex items-center justify-center w-8 h-8 bg-emerald-500 rounded-full border-2 border-white shadow-lg text-white text-sm font-bold">P</div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

  Render when passengerLocation is non-null:
    {passengerLocation && (
      <Marker
        position={[passengerLocation.lat, passengerLocation.lng]}
        icon={passengerIcon}
      />
    )}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [ ] In Firebase console: tripLocations/{tripId}/passenger does NOT exist while trip.status = 'requested'
- [ ] After driver accepts: tripLocations/{tripId}/passenger appears and updates every 3s
- [ ] Driver's map shows a green "P" marker at the passenger's location after accepting
- [ ] After trip completes: tripLocations/{tripId} is removed from Firebase
- [ ] A third authenticated user cannot read tripLocations/{tripId} (verify with a test session)
- [ ] Driver without an active trip sees no passenger marker on their map
- [ ] npx tsc --noEmit: zero errors

MANUAL TEST STEPS:
1. Two devices: passenger and driver
2. Passenger sends request. Check Firebase: tripLocations/{id}/passenger should NOT exist yet
3. Driver accepts. Check Firebase: tripLocations/{id}/passenger should now appear
4. Move the passenger device: coordinates in Firebase should update every 3s
5. Driver's map: green P marker should appear and move
6. Driver completes trip: tripLocations/{id} should be deleted from Firebase

ROLLBACK:
Remove the new useEffect in passenger/page.tsx.
Remove passengerLocation state and subscribeTripLocation useEffect from driver/page.tsx.
Remove passengerLocation prop from MapWrapper and LeafletMap.
All changes are additive.
```

---

## 9. Developer Prompt F — Reliability and Real-User Hardening

```
You are a senior Next.js + Firebase engineer working on Yatra.

TARGET FILES:
- app/passenger/page.tsx      (flow cleanup and error handling)
- lib/types.ts                (RequestStatus extension)
- app/api/trip-requests/create/route.ts   (if it exists — add validation)

GOAL:
Fix the two parallel booking flows, harden coordinate validation, add timeout
handling, and ensure the flow is safe for real passengers who may have spotty
connectivity.

DO NOT TOUCH:
- Solana, ZK, auth, NFT minting code
- Firebase security rules (fixed in Prompt B)
- Trip write functions (fixed in Prompt A)
- The driver-side accept flow (fixed in Prompt C)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Fix RequestStatus transitions in passenger/page.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The type RequestStatus currently has 'idle' | 'requesting' | ... — you extended it
in Prompt A to include 'accepted' and 'on-trip'.

Wire those new values to trip status changes.
In the existing subscribeToTrip effect (which already watches trip status changes):

  When trip.status === 'accepted': setRequestStatus('accepted')
  When trip.status === 'active': setRequestStatus('on-trip')
  When trip.status in ['completed','cancelled','rejected','expired']: setRequestStatus('idle')

These assignments reflect real state transitions in the UI.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Fix handleBusSelect: only set requestStatus after sendTripRequest succeeds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current bug: requestStatus is set to 'requesting' immediately, before the network call.

Find handleBusSelect. Refactor to:

  const handleBusSelect = async (bus: Bus) => {
    if (!userLocation) {
      toast.error('Enable location to request a ride');
      return;
    }
    if (!pickupLocation) {
      // Guide the user to set a pickup point first
      setSelectedBus(bus);
      toast.info('Tap the map to set your pickup point');
      return;
    }

    setSelectedBus(bus);
    // Do NOT set requestStatus yet

    try {
      const result = await sendTripRequest({
        driverId: bus.driverId,
        pickupLocation,
        passengerLocation: userLocation,
      });
      if (result?.tripId) {
        setActiveTripId(result.tripId);
        setRequestStatus('requesting'); // Only set AFTER success
      }
    } catch (err) {
      console.error('[handleBusSelect] trip request failed', err);
      toast.error('Failed to send request. Please try again.');
      setSelectedBus(null); // Reset selection on failure
    }
  };

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Remove the "HAIL NOW" button when no pickup is set
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the floating "HAIL {busNumber} NOW" button that appears when selectedBus is non-null.
Replace the rendering condition:

  Before: show button when selectedBus is set
  After: show button only when selectedBus is set AND pickupLocation is set

  When selectedBus is set but pickupLocation is null, show a bottom-sheet guide instead:
    <div className="fixed bottom-20 left-0 right-0 mx-4 bg-background border rounded-xl p-4 z-50
                    flex items-center gap-3 text-sm shadow-lg">
      <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      <span>Tap the map to set your pickup point, or use your current location</span>
      <Button size="sm" variant="outline"
              onClick={() => userLocation && setPickupLocation(userLocation)}>
        Use my location
      </Button>
    </div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — Add 5-minute passenger-side request timeout
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The driver panel has a 90-second timer. The passenger needs a corresponding timeout
in case the driver never responds (e.g., driver went offline).

Add to app/passenger/page.tsx:

  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When requestStatus changes to 'requesting', start a 5-minute timeout
  useEffect(() => {
    if (requestStatus === 'requesting' && activeTripId) {
      requestTimeoutRef.current = setTimeout(async () => {
        // Auto-cancel if still in 'requesting' state after 5 minutes
        await updateTripStatus(activeTripId, 'expired');
        setRequestStatus('idle');
        setSelectedBus(null);
        setActiveTripId(null);
        toast.error('Request timed out — no driver responded');
      }, 5 * 60 * 1000);
    } else {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    }
    return () => {
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
    };
  }, [requestStatus, activeTripId]);

Import updateTripStatus from lib/firebaseDb.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — Coordinate validation guard on request creation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In app/api/trip-requests/create/route.ts (or wherever the trip request is created):

Add at the top of the handler, before any Firebase writes:

  function isValidCoord(lat: unknown, lng: unknown): boolean {
    return (
      typeof lat === 'number' && typeof lng === 'number' &&
      isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  }

  if (!isValidCoord(body.pickupLocation?.lat, body.pickupLocation?.lng)) {
    return NextResponse.json({ error: 'Invalid pickup coordinates' }, { status: 400 });
  }
  if (!isValidCoord(body.passengerLocation?.lat, body.passengerLocation?.lng)) {
    return NextResponse.json({ error: 'Invalid passenger coordinates' }, { status: 400 });
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — Keep the two flows separate (do NOT merge them yet)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The handleBookBus (seat reservation) and handleBusSelect (hailing) flows are currently
two separate systems. Leave them separate for now. Just ensure they cannot both trigger
on the same action.

Audit app/passenger/page.tsx:
  - Find where handleBookBus and handleBusSelect are both wired to UI events
  - Confirm they are triggered by different UI paths (e.g., different buttons or modes)
  - If they share a trigger, separate them cleanly

Add a comment above each: // BOOKING FLOW (seat reservation) or // HAILING FLOW (on-demand)
so future engineers know these are intentionally separate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- [ ] Tapping a driver with no pickup set shows the pickup guide, not the HAIL button
- [ ] If sendTripRequest throws a network error, selectedBus resets to null and an error toast shows
- [ ] requestStatus = 'accepted' after driver accepts (verify via React DevTools)
- [ ] requestStatus = 'on-trip' after driver starts trip
- [ ] requestStatus = 'idle' after trip completes
- [ ] If no driver responds for 5 minutes, passenger sees timeout toast and state resets
- [ ] POST to trip-requests/create with lat: 999 returns HTTP 400
- [ ] npx tsc --noEmit: zero errors
- [ ] npm run lint: zero new errors

MANUAL TEST STEPS:
1. Open passenger page with location enabled. Tap a driver WITHOUT setting pickup:
   → should see "Tap the map to set your pickup point" guide, NOT the HAIL button
2. Set pickup point, then tap the driver → HAIL button should appear
3. Disable network on passenger's device after sending request:
   → request should not hang indefinitely (the 5-minute timeout catches it)
4. Have driver reject the request → passenger should see a toast and state should reset to idle
5. Send a request, wait 5+ minutes with driver not responding → passenger sees timeout message

ROLLBACK:
All changes in this prompt are defensive — they fix broken behavior or add guards.
If anything breaks, revert app/passenger/page.tsx changes. The only side effect is
that requestStatus transitions may revert to the old (incomplete) behavior.
```

---

## 10. Final Recommendation

### Refactor or extend?
**Extend, not rewrite.** The core architecture is sound. The real-time GPS layer, booking lifecycle, OSRM integration, and notification infrastructure are all working and should be preserved. The gaps are architectural incompleteness — missing write functions, missing UI panels, visibility that was never wired — not fundamental design errors.

### What must stay
- `useLiveLocation`, `useProximityHandshake`, `useAccidentDetection` hooks — solid, keep exactly
- OSRM integration in `lib/routing/osrm.ts` — it works; Prompt D just wires it to the UI
- Booking flow (seat reservation, NFT, SMS) — complete and functional, do not touch
- Auth, ZK, Solana layers — leave alone

### What must be extended (not rewritten)
- `lib/firebaseDb.ts` — add write functions (Prompt A); existing reads stay
- `database.rules.json` — scope reads to participants (Prompt B); additive rule changes
- `app/driver/page.tsx` — add TripRequestPanel rendering (Prompt C); existing code stays
- `app/passenger/page.tsx` — add radius filter, ETA effects, location gating (Prompts B, D, E, F); mostly additive

### What must be created new
- `components/driver/TripRequestPanel.tsx` — does not exist at all
- `tripLocations/{tripId}/{role}` Firebase path — new path, new write/subscribe functions

### The smallest safe first step
Run Prompt A first. It is purely additive, has zero risk of breaking anything, and every other prompt depends on the write functions it creates. Once `updateTripStatus`, `publishTripLocation`, and `subscribeTripLocation` exist in `lib/firebaseDb.ts`, every subsequent prompt has a stable foundation to build on.

Then Prompt B Part A (Firebase rules) — deploy and test in the Firebase Rules Playground before touching any application code. Rules changes are reversible in seconds. An application bug that relies on over-permissive rules is harder to debug.

The critical integration test: after Prompts C and E are both deployed, run the full flow end-to-end on two real devices. That is the moment where both sides first see each other live simultaneously. If that works, the rest is polish.
