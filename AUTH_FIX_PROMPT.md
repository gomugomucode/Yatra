# Fix Yatra Auth Flow — Signup Stuck + Sign-in Redirecting to Profile

## The Problem (3 bugs creating one broken flow)

**Bug 1 — Profile save gets stuck at "Creating your Profile..."**
The "Complete driver/passenger profile" button calls an API route to save the profile, but either:
- The API call fails silently (Firebase RTDB permission denied error is swallowed — see `lib/contexts/AuthContext.tsx:86-89`)
- OR the API succeeds but the post-save redirect logic checks `userData` which hasn't reloaded from Firebase yet (race condition)
- OR the API succeeds but `checkProfileCompletion()` returns false because it doesn't check all the fields that were just saved

**Bug 2 — Sign-in redirects to profile setup instead of dashboard**
After signing in with correct credentials, the user goes to `/auth/profile` instead of `/driver` or `/passenger` because:
- The role cookie is not set correctly during sign-in
- OR `checkProfileCompletion()` in `lib/types.ts` is missing fields (it only checks `name + vehicleNumber + licenseNumber` for drivers, missing `vehicleType`, `capacity`, `route`)
- OR `AuthContext` hasn't loaded `userData` from Firebase when the redirect decision is made

**Bug 3 — Google OAuth new users skip profile entirely**
`handleGoogleSignIn` in `app/auth/page.tsx:162-163` always passes `isSignIn=true`, so new Google users never see the profile form.

## Your Task

Fix all three bugs in this exact order. Do NOT rewrite the auth system. Make targeted fixes to existing files.

## Files to Inspect First (read before changing anything)

```
cat lib/types.ts | grep -A 20 "checkProfileCompletion"
cat app/auth/profile/page.tsx | head -250
cat app/auth/page.tsx | grep -A 30 "handleGoogleSignIn\|resolvePostLoginRedirect\|handleEmailSubmit"
cat lib/contexts/AuthContext.tsx | grep -A 20 "onAuthStateChanged\|userData\|setUserData"
cat app/api/auth/register/route.ts
cat app/api/sessionLogin/route.ts | head -50
cat middleware.ts
```

## Fix 1 — Fix checkProfileCompletion() in lib/types.ts

Find the `checkProfileCompletion()` function. It currently only checks a subset of driver fields.

**Problem:** A driver who fills out ALL profile fields still fails the completion check because `vehicleType`, `capacity`, or `route` are not checked. This causes infinite redirect to profile setup.

**Fix:** The function must check ONLY the fields that are actually saved during profile creation. Read `app/auth/profile/page.tsx` to see exactly which fields the form saves, then make `checkProfileCompletion()` check exactly those fields and no others.

For drivers, the minimum complete profile is: `name` exists and is non-empty.
For passengers, the minimum complete profile is: `name` exists and is non-empty.

Do NOT add fields that are optional (like wallet address, emergency contact, photos). Those should not block dashboard access.

Make the function lenient — it should return `true` if the user has a `name` and a `role`. Everything else is progressive enhancement, not a gate.

```typescript
// The fix should look approximately like this:
export function checkProfileCompletion(userData: any, role: string): boolean {
  if (!userData) return false;
  if (!userData.name || userData.name.trim() === '') return false;
  // Role must exist
  if (!role) return false;
  // That's it. Don't gate on optional fields.
  return true;
}
```

## Fix 2 — Fix the profile save handler in app/auth/profile/page.tsx

Find the function that runs when the user clicks "Complete driver/passenger profile". It likely:
1. Calls an API route (like `/api/auth/register`) to save the profile
2. Waits for the response
3. Tries to redirect to the dashboard

**Problem 1: Silent failure.** If the API call fails, the loading state is never cleared. Add a try/catch with explicit error handling:

```typescript
try {
  const response = await fetch('/api/auth/register', { ... });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    toast.error(errorData.error || 'Failed to save profile');
    setIsLoading(false); // CRITICAL — clear loading state on failure
    return;
  }
  // Success path continues below
} catch (error) {
  console.error('Profile save failed:', error);
  toast.error('Network error — please try again');
  setIsLoading(false); // CRITICAL — clear loading state on failure
  return;
}
```

**Problem 2: Race condition on redirect.** After the API call succeeds, the code probably checks `userData` from AuthContext to decide where to redirect. But `userData` hasn't reloaded from Firebase yet — the API just wrote to RTDB and the `onValue` listener in AuthContext hasn't fired yet.

**Fix:** After a successful profile save, do NOT rely on `userData` from context. Instead, directly set the role cookie and redirect:

```typescript
// After successful API response:

// 1. Set the role cookie explicitly (in case it wasn't set)
document.cookie = `role=${role}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;

// 2. Wait a beat for Firebase to sync (crude but effective)
await new Promise(resolve => setTimeout(resolve, 500));

// 3. Force redirect to the correct dashboard
const destination = role === 'driver' ? '/driver' : '/passenger';
router.push(destination);

// 4. Clear loading AFTER redirect is initiated
setIsLoading(false);
```

Do NOT call `checkProfileCompletion()` after profile save — you just saved the profile, you know it's complete.

## Fix 3 — Fix sign-in redirect in app/auth/page.tsx

Find the `resolvePostLoginRedirect()` function or wherever the post-login redirect is decided.

**Problem:** When a user signs in (not signs up), the code should:
1. Check if profile is complete → if yes, go to dashboard
2. If profile is incomplete → go to profile setup

But right now it always goes to profile setup because either:
- `userData` is null when the redirect fires (AuthContext hasn't loaded yet)
- `checkProfileCompletion()` returns false (fixed above)

**Fix:** In the sign-in success handler, wait for `userData` to be available before redirecting:

```typescript
// After successful sign-in (email or Google):

// 1. Wait for AuthContext to load userData
// The onAuthStateChanged listener in AuthContext will fire and set userData
// We need to wait for that before checking profile completion

// Option A (preferred): use the API response to check if profile exists
const sessionResponse = await fetch('/api/sessionLogin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken }),
});
const sessionData = await sessionResponse.json();

// If the API can tell us the user has a complete profile, redirect directly
// If not, add a short delay then check:
await new Promise(resolve => setTimeout(resolve, 800));

// Now userData should be loaded in AuthContext
// Use the updated checkProfileCompletion()
```

**Alternative simpler fix:** In `resolvePostLoginRedirect()`, if `isSignIn` is true and the redirect URL is provided in the query params, go there directly without checking profile completion. The middleware will catch incomplete profiles if needed:

```typescript
function resolvePostLoginRedirect(isSignIn: boolean, role: string): string {
  // If signing in (not signing up), trust the redirect param or go to dashboard
  if (isSignIn) {
    const redirect = searchParams.get('redirect');
    if (redirect) return redirect;
    return role === 'driver' ? '/driver' : '/passenger';
  }
  // If signing up, always go to profile setup
  return `/auth/profile?role=${role}`;
}
```

## Fix 4 — Fix Google OAuth new user detection in app/auth/page.tsx

Find `handleGoogleSignIn`. It currently does:
```typescript
// BROKEN: always treats Google sign-in as existing user
resolvePostLoginRedirect(true, role);
```

Fix:
```typescript
const result = await signInWithPopup(auth, googleProvider);
const isNewUser = result?.user?.metadata?.creationTime === result?.user?.metadata?.lastSignInTime;
// Or use: getAdditionalUserInfo(result)?.isNewUser

resolvePostLoginRedirect(!isNewUser, role);
// isNewUser=true → isSignIn=false → goes to profile setup
// isNewUser=false → isSignIn=true → goes to dashboard
```

## Fix 5 — Fix silent permission denied in AuthContext

In `lib/contexts/AuthContext.tsx`, find the `onAuthStateChanged` callback where it subscribes to the user's Firebase RTDB profile.

**Problem:** If the RTDB read fails (permission denied), the error is caught and `setUserData(null)` is called with `setLoading(false)`. This makes every downstream check think the user has no profile.

**Fix:** Add explicit error logging and a retry:

```typescript
// In the RTDB subscription error handler:
catch (error: any) {
  console.error('[AuthContext] Failed to load user profile:', error.message);
  if (error.code === 'PERMISSION_DENIED') {
    console.error('[AuthContext] Firebase RTDB permission denied for user:', user.uid);
    // The user exists in Auth but has no RTDB record yet
    // This happens during signup before profile save completes
    // Set a flag so the profile page knows to wait
    setUserData({ uid: user.uid, role: null } as any);
  } else {
    setUserData(null);
  }
  setLoading(false);
}
```

## Fix 6 — Make role cookie httpOnly (security fix, do while you're here)

In `app/api/sessionLogin/route.ts`, find where the role cookie is set.
Change `httpOnly: false` to `httpOnly: true`.

The middleware reads this server-side so httpOnly works fine.
The only client-side code that reads `role` from cookies is in `AuthContext` —
change that to read `role` from `userData` instead of from the cookie.

## Verification Steps (do these after all fixes)

### Test 1 — New driver signup
1. Go to landing page, click Driver
2. Sign up with a new email and password
3. Click "Continue to Profile Setup"
4. Fill in name, vehicle type, license number, vehicle number
5. Click "Complete driver profile"
6. **Expected:** redirects to /driver within 2 seconds
7. **Check Firebase console:** user exists in Auth AND in Realtime DB under users/{uid}

### Test 2 — Existing driver sign-in
1. Go to landing page, click Driver
2. Sign in with the email from Test 1
3. **Expected:** redirects directly to /driver (NOT to /auth/profile)

### Test 3 — New passenger signup
1. Go to landing page, click Passenger
2. Sign up with a different email
3. Fill in name only (wallet and emergency contact are optional)
4. Click "Complete passenger profile"
5. **Expected:** redirects to /passenger within 2 seconds

### Test 4 — Existing passenger sign-in
1. Sign in with the email from Test 3
2. **Expected:** redirects directly to /passenger

### Test 5 — Google OAuth new user
1. Sign up with Google (use an account that has never used Yatra)
2. **Expected:** goes to profile setup, NOT directly to dashboard

### Test 6 — Google OAuth existing user
1. Sign in with the same Google account from Test 5
2. **Expected:** goes directly to dashboard

## What NOT to change

- Do NOT change the ZK prover or verifier (separate fix)
- Do NOT change the Solana minting code
- Do NOT change the booking system
- Do NOT change the driver dashboard or passenger dashboard
- Do NOT change the map components
- Do NOT change middleware.ts routing logic (the middleware is correct — the problem is in the data it reads, not the routing logic itself)
- Do NOT change Firebase security rules in this fix
- Do NOT add new API routes

## Order of operations

1. Fix `checkProfileCompletion()` in `lib/types.ts` FIRST — this unblocks everything else
2. Fix the profile save handler in `app/auth/profile/page.tsx` — this fixes the stuck button
3. Fix `resolvePostLoginRedirect()` in `app/auth/page.tsx` — this fixes sign-in going to profile
4. Fix Google OAuth in `app/auth/page.tsx` — this fixes new Google users
5. Fix AuthContext error handling — this prevents silent failures
6. Fix role cookie httpOnly — security improvement while you're in the file

After each fix, run `npx tsc --noEmit` to verify no type errors.
After all fixes, run the 6 verification tests above.
