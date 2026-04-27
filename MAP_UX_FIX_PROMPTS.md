# Yatra — Map & Ride UX Fix Prompts
> Source: RIDE_FLOW_PROMPTS.md audit + live screenshot analysis
> Execute in order. Each prompt is independent and safe.

---

## Current UX Problems (from screenshot + audit)

1. **Driver popup card blocks the entire map** — tapping a driver opens a white card that covers half the viewport. User cannot see other drivers or interact with the map while it is open.

2. **Green pickup circle sits on top of driver pins** — the large green circle (pickup radius) visually hides driver markers beneath it. User cannot tap drivers near their pickup point.

3. **No clear sequential flow** — the user can tap drivers, see ETA pills, and see a HAIL button all at once. There is no guided step: "first pick a driver → then set pickup → then hail." Everything is visible simultaneously.

4. **ETA pill shows before any request is sent** — "ETA 1 min" appears the moment a driver is tapped, before the passenger has decided to hail. This is confusing — ETA should only show after the driver accepts.

5. **Driver card shows raw data ("DISTANCE 0.01 KM")** — not useful for ride-hailing. The user needs: driver name, vehicle type, rating. Distance is secondary.

6. **TripRequestPanel hidden behind SOS bar (z-50 vs z-1200)** — driver cannot tap Accept.

7. **subscribeToTripRequests reads entire /trips node** — broken with scoped Firebase rules. Drivers never receive requests.

8. **No rejection/expiry feedback** — passenger UI silently resets when driver rejects.

9. **Proximity alert fires during 'requesting' state** — "YOUR RIDE IS HERE" shows before driver accepts.

10. **Dual route lines render simultaneously** — internal routeGeoJSON and external activeRoute overlap.

---

## Proposed Clean Flow

```
PASSENGER OPENS APP
  ↓
Map shows their location (blue dot) + nearby driver pins (small, tappable)
No pickup circle yet. No ETA. No cards.
  ↓
PASSENGER TAPS A DRIVER PIN
  ↓
Small bottom sheet slides up (not a popup ON the map):
  "🚌 Micro Bus · BA-1-KHA-1234"
  "⭐ 4.8 · 234 trips"
  [Set Pickup & Hail →] button
  ↓
PASSENGER TAPS [Set Pickup & Hail]
  ↓
If pickup is already set (auto-set to current location): send request immediately
If pickup is NOT set: show "Tap the map to set pickup" mode
  ↓
REQUEST SENT → "Waiting for driver..." banner
  ↓
DRIVER ACCEPTS → ETA card appears, route polyline draws
```

---

## Prompt 1 — Fix the Two Blockers (Driver Cannot Receive or Accept Trips)

```
You are a senior Firebase + Next.js engineer fixing two critical blockers in Yatra.
These two bugs prevent ANY real ride from working. Fix both in one pass.

BLOCKER 1 — Driver never sees trip requests
FILE: lib/firebaseDb.ts (subscribeToTripRequests function, around line 202-237)

PROBLEM: The function calls onValue(ref(db, 'trips'), ...) which reads the entire
/trips node. The current database.rules.json has participant-only child rules but
no top-level .read on trips. Firebase RTDB silently returns nothing.

FIX: Change the subscription to use a query filtered by driverId:

  Find the line:
    const tripRequestsRef = ref(db, 'trips');
    const unsubscribe = onValue(tripRequestsRef, (snapshot) => { ... });

  Replace with:
    import { query, orderByChild, equalTo } from 'firebase/database';
    
    const tripsRef = ref(db, 'trips');
    const driverQuery = query(tripsRef, orderByChild('driverId'), equalTo(busId));
    const unsubscribe = onValue(driverQuery, (snapshot) => { ... });

  The existing database.rules.json already has .indexOn: ["driverId"] on trips,
  so this query will work with the scoped rules.

  Keep the rest of the callback (the snapshot.forEach logic) exactly as-is.

BLOCKER 2 — Driver cannot tap Accept button (hidden behind SOS bar)
FILE: components/driver/TripRequestPanel.tsx

PROBLEM: The panel uses z-50 but the SOS bar uses z-1200. The Accept/Reject
buttons are physically covered.

FIX: Find the outer container div/motion.div. Change:
  - z-50 → z-[1300]
  - pb-6 → pb-24  (96px clears the SOS bar height with margin)

DO NOT TOUCH:
- The countdown timer logic
- The three-phase rendering
- Any handler props
- Any other files

ACCEPTANCE CRITERIA:
- [ ] Driver goes online → passenger sends request → TripRequestPanel slides up within 3s
- [ ] Accept and Reject buttons are fully visible and tappable on mobile
- [ ] The SOS bar remains visible below the panel
- [ ] npx tsc --noEmit: zero errors
```

---

## Prompt 2 — Replace Driver Popup Card with a Compact Bottom Sheet

```
You are a senior React + UI engineer working on Yatra's passenger map.

PROBLEM: When a passenger taps a driver pin on the map, a large white popup card
appears ON the map (see the Leaflet Popup). It blocks half the viewport, covers
other driver pins, and shows raw data like "DISTANCE 0.01 KM" that is not useful
for deciding whether to hail this driver.

GOAL: Replace the map popup with a slim bottom sheet that slides up from below
the map, keeping the map fully visible and tappable.

TARGET FILES:
- app/passenger/page.tsx (handle driver selection, render bottom sheet)
- components/map/LeafletMap.tsx (remove or disable the Leaflet Popup on driver markers)

STEP 1 — Remove the Leaflet Popup from driver markers

In LeafletMap.tsx, find where driver/bus markers are rendered. Each marker
likely has a <Popup> child that shows the "Driver / ACTIVE NOW / DISTANCE / ETA" card.

Remove or comment out the <Popup> component inside the driver marker.
Keep the marker itself and its onClick handler — we still need to detect taps.

The onClick should call a prop like onDriverSelect(driverId) which the parent
(passenger/page.tsx) already handles via handleBusSelect or a similar function.

STEP 2 — Create a compact bottom sheet in passenger/page.tsx

When selectedBus is non-null AND requestStatus is 'idle', render a slim
fixed-bottom card:

  {selectedBus && requestStatus === 'idle' && (
    <div className="fixed bottom-0 left-0 right-0 z-[500] px-4 pb-6 
                    pointer-events-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl 
                      border border-slate-200 dark:border-slate-700 p-4
                      flex items-center gap-4">
        
        {/* Driver info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚌</span>
            <span className="font-semibold text-sm truncate">
              {selectedBus.busNumber || 'Driver'}
            </span>
            <span className="text-xs text-emerald-500 font-medium">● Online</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedBus.vehicleType || 'Micro Bus'} · {selectedBus.route || 'Local'}
          </div>
        </div>

        {/* Hail button */}
        <Button
          size="sm"
          className="bg-emerald-500 hover:bg-emerald-600 text-white 
                     rounded-full px-5 h-10 font-semibold text-sm
                     flex items-center gap-2 flex-shrink-0"
          disabled={hailLoading}
          onClick={() => handleBusSelect(selectedBus)}
        >
          {hailLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent 
                            rounded-full animate-spin" />
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              Hail
            </>
          )}
        </Button>
      </div>

      {/* Dismiss: tap outside or swipe down */}
      <button
        className="absolute -top-8 left-1/2 -translate-x-1/2 
                   w-10 h-1 bg-slate-300 rounded-full"
        onClick={() => setSelectedBus(null)}
        aria-label="Dismiss"
      />
    </div>
  )}

STEP 3 — Remove or hide the old HAIL button

Find any existing "HAIL {busNumber} NOW" button that renders separately from
the bottom sheet above. Remove it — the new bottom sheet replaces it.

Also remove any floating driver info card that duplicates the bottom sheet content.

STEP 4 — Add loading state

Add state: const [hailLoading, setHailLoading] = useState(false);

In handleBusSelect (or wherever sendTripRequest is called):
  setHailLoading(true);
  try { await sendTripRequest(...); } 
  catch { toast.error('Failed to send request'); setSelectedBus(null); }
  finally { setHailLoading(false); }

DO NOT TOUCH:
- The Leaflet map container or tile layers
- The pickup/dropoff circle markers
- The route polyline rendering
- Auth, booking, or Solana code
- The driver dashboard

ACCEPTANCE CRITERIA:
- [ ] Tapping a driver pin does NOT open a map popup — map stays fully visible
- [ ] A slim bottom card slides up showing driver name, vehicle type, and Hail button
- [ ] Tapping Hail shows a spinner, sends the request, then transitions to "Waiting..."
- [ ] Tapping elsewhere on the map (not a pin) dismisses the bottom card
- [ ] Other driver pins remain tappable while the bottom card is showing
- [ ] No duplicate "HAIL NOW" buttons exist
- [ ] npx tsc --noEmit: zero errors
```

---

## Prompt 3 — Fix Pickup Circle Blocking Driver Pins

```
You are a senior Leaflet map engineer working on Yatra.

PROBLEM: The green pickup circle is rendered with a high z-index and large radius,
visually covering driver pins near the pickup location. Users cannot tap drivers
that are beneath the circle.

TARGET FILE: components/map/LeafletMap.tsx

FIX 1 — Make the pickup circle non-interactive (clicks pass through to pins below):

Find where the pickup Circle is rendered (around the pickupLocation block).
Add these pathOptions:

  <Circle
    center={[pickupLocation.lat, pickupLocation.lng]}
    radius={80}
    pathOptions={{
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.08,      // ← very light fill (was likely 0.2+)
      weight: 1.5,            // ← thinner border (was likely 3+)
      interactive: false,     // ← CRITICAL: clicks pass through to markers below
    }}
  />

FIX 2 — Same for the pickup Marker — lower its z-index:

Find the pickup Marker. If it uses a custom icon, add:
  zIndexOffset={-100}  // ensures it renders BELOW driver markers

If the Marker has a Popup, remove the Popup — the pickup point doesn't need one.

  <Marker
    position={[pickupLocation.lat, pickupLocation.lng]}
    icon={pickupIcon}
    zIndexOffset={-100}
    interactive={false}  // no need to click the pickup pin
  />

FIX 3 — Add dropoff marker (currently missing from the map):

Find where pickupLocation is rendered. After it, add:

  {dropoffLocation && (
    <>
      <Circle
        center={[dropoffLocation.lat, dropoffLocation.lng]}
        radius={60}
        pathOptions={{
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1.5,
          interactive: false,
        }}
      />
      <Marker
        position={[dropoffLocation.lat, dropoffLocation.lng]}
        icon={createLocationIcon('#2563eb')}
        zIndexOffset={-100}
        interactive={false}
      />
    </>
  )}

FIX 4 — Ensure driver markers have higher z-index:

Find where bus/driver markers are rendered. Add:
  zIndexOffset={100}  // above pickup/dropoff markers

This ensures drivers are always tappable, even near the pickup point.

DO NOT TOUCH:
- Route polyline rendering
- Passenger marker ("P" circle on driver map)
- The map tile layer or container
- Any subscription or data logic

ACCEPTANCE CRITERIA:
- [ ] Pickup circle is visible but very light — driver pins beneath it are tappable
- [ ] Tapping a driver pin near the pickup point correctly selects that driver
- [ ] Dropoff location (if set) shows as a blue pin on the map
- [ ] Driver pins render above pickup/dropoff pins visually
- [ ] npx tsc --noEmit: zero errors
```

---

## Prompt 4 — Fix ETA Timing and Rejection Feedback

```
You are a senior Next.js engineer fixing three UX timing bugs in Yatra's passenger flow.

TARGET FILE: app/passenger/page.tsx

FIX 1 — No feedback when driver rejects or request expires (around lines 296-308)

Find the subscribeToTrip callback. There is a block that checks if trip.status
is in ['completed', 'cancelled', 'rejected', 'expired'] and resets state.
Currently it resets silently with no toast.

Add BEFORE the setRequestStatus('idle') line:

  if (trip.status === 'rejected') {
    toast({ title: "Driver couldn't accept", description: "Try another driver nearby." });
  } else if (trip.status === 'expired') {
    toast({ title: "No response", description: "Request timed out. Try again." });
  } else if (trip.status === 'cancelled' && trip.cancelledBy !== currentUser?.uid) {
    toast({ title: "Trip cancelled by driver" });
  }

FIX 2 — Proximity handshake fires before driver accepts (around line 107)

Find the useProximityHandshake call. The `enabled` prop currently includes
requestStatus === 'requesting'. Change to:

  enabled: ['accepted', 'on-trip'].includes(requestStatus) && !!hailedDriverId,

This prevents "YOUR RIDE IS HERE" from firing while the driver hasn't accepted yet.

FIX 3 — ETA pill shows before request is sent

Find the ETA overlay card rendering (around lines 1104-1119). It currently shows
whenever etaToPickup or etaToDestination is non-null.

Add an additional condition:

  {(etaToPickup !== null || etaToDestination !== null) 
   && ['accepted', 'on-trip'].includes(requestStatus) && (
    <div className="...">
      ...
    </div>
  )}

This hides the ETA card during 'idle' and 'requesting' states. ETA only
appears after the driver accepts.

FIX 4 — ETA null guard when dropoff is not set (around line 411)

Change:
  const target = isActive ? dropoffLocation : pickupLocation;
To:
  const target = isActive ? (dropoffLocation ?? pickupLocation) : pickupLocation;

This prevents ETA from disappearing during active trips when no dropoff was set.

DO NOT TOUCH:
- The two-phase ETA fetch logic itself (OSRM calls are correct)
- The route polyline rendering
- Any driver-side code
- Auth or booking code

ACCEPTANCE CRITERIA:
- [ ] Driver rejects → passenger sees "Driver couldn't accept" toast, map resets
- [ ] Request times out → passenger sees "No response" toast
- [ ] No "YOUR RIDE IS HERE" alert before driver accepts
- [ ] No ETA pill visible before driver accepts
- [ ] ETA shows correctly after driver accepts
- [ ] Active trip with no dropoff set still shows ETA (using pickup as fallback)
- [ ] npx tsc --noEmit: zero errors
```

---

## Prompt 5 — Fix Dual Route Lines and Stale Driver Pin

```
You are a senior Leaflet + React engineer working on Yatra.

TARGET FILE: components/map/LeafletMap.tsx

FIX 1 — Dual route rendering (two lines overlap during active trip)

The map renders BOTH an internal routeGeoJSON (from the proximity handshake)
AND an external activeRoute Polyline (from the passenger page ETA effect)
simultaneously during an active trip.

Find the internal routeGeoJSON rendering block (the GeoJSON glow + primary pair).
Gate it so it ONLY shows when activeRoute is NOT set:

  {routeGeoJSON && !activeRoute && (
    <>
      <GeoJSON ... />  {/* glow */}
      <GeoJSON ... />  {/* primary */}
    </>
  )}

The activeRoute Polyline block (around lines 512-521) stays as-is.

FIX 2 — Hailed driver pin vanishes when GPS lags

Find the subscribeToLiveUsers filter that removes stale drivers (30s threshold):

  if (now - lastSeen > 30000) return false;

Change to:

  if (now - lastSeen > 30000 && user.id !== hailedDriverId) return false;

This keeps the hailed driver visible even if their GPS briefly pauses.

Note: hailedDriverId needs to be available in this scope. If it's not passed
as a prop to LeafletMap, check if it's available via the component's existing
props (like focusBusId, selectedBusId, or similar). Use whatever prop identifies
the currently hailed driver.

DO NOT TOUCH:
- The activeRoute Polyline rendering
- The passenger marker rendering
- Pickup/dropoff markers (fixed in Prompt 3)
- Any data fetching or subscription logic

ACCEPTANCE CRITERIA:
- [ ] During an active trip: only ONE route line visible (the activeRoute Polyline)
- [ ] Before any trip: the internal routeGeoJSON shows correctly on driver selection
- [ ] Hailed driver pin stays visible even if their GPS update is 45 seconds old
- [ ] Non-hailed stale drivers still disappear after 30 seconds
- [ ] npx tsc --noEmit: zero errors
```

---

## Execution Order

```
Prompt 1 → FIRST (unblocks the entire driver flow — without this, nothing works)
Prompt 2 → SECOND (replaces the popup with a clean bottom sheet)
Prompt 3 → THIRD (makes driver pins tappable near pickup point)
Prompt 4 → FOURTH (fixes timing — ETA, rejection feedback, proximity)
Prompt 5 → FIFTH (visual cleanup — dual routes, stale pin)
```

Prompts 2 and 3 can be done in parallel. Prompts 4 and 5 can be done in parallel.
Prompt 1 must be done first — it is the only one that blocks real functionality.

---

## What These Prompts Do NOT Cover (intentionally deferred)

- Search UX (destination-first vs pickup-first) — needs product decision, not a code fix
- TrackingControls "GO ONLINE" button inside the map — low priority, cosmetic
- subscribeToTrip dependency on selectedDriverName — low priority, causes brief subscription gap
- useLiveLocation writing to old locations/{uid} path — low risk today
- Merging booking and trip-request flows — deliberate architectural decision to keep separate
