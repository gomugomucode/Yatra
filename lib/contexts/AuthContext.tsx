'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, ConfirmationResult } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { getFirebaseAuth, signInWithPhone } from '@/lib/firebase';
import { getUserProfile, subscribeToUserProfile } from '@/lib/firebaseDb';
import Cookies from 'js-cookie';
import { UserProfile } from '@/lib/types';

type Role = 'driver' | 'passenger' | 'admin' | null;

interface AuthContextValue {
  currentUser: User | null;
  role: Role;
  loading: boolean;
  profileReady: boolean;
  setRole: (role: Role) => void;
  signInWithPhone: (phone: string, role: Role) => Promise<ConfirmationResult>;
  verifyOTP: (confirmationResult: ConfirmationResult, code: string, role: Role) => Promise<void>;
  signOut: () => Promise<void>;
  userData: UserProfile | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<Role>(() => {
    // Initialize from cookie if available
    if (typeof window !== 'undefined') {
      return Cookies.get('role') as Role || null;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);

  // ...

  const [userData, setUserData] = useState<UserProfile | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);

      // Clean up previous profile subscription if any
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (user) {
        setProfileReady(false);
        // Safety timeout: If profile doesn't load in 5s, stop loading anyway
        const safetyTimeout = setTimeout(() => {
          console.warn('[Auth] Profile load timed out, forcing app load');
          setLoading(false);
          setProfileReady(true);
        }, 5000);

        try {
          // Force-refresh the token so any custom claims set by the server
          // (e.g. role: 'driver') are included before we read from the DB.
          // This prevents the 'messy' dashboard flash where userData is
          // loaded with stale permissions.
          await user.getIdToken(true);

          // Subscribe to user data from Realtime Database
          // This ensures we get updates immediately when profile is created
          profileUnsubscribe = subscribeToUserProfile(user.uid, (data) => {
            clearTimeout(safetyTimeout); // Clear timeout on success
            if (data) {
              setUserData(data);
              if (data.role) {
                setRoleState(data.role);
                Cookies.set('role', data.role, { expires: 7 });
              }
            } else {
              // Profile doesn't exist yet
              setUserData(null);
            }
            setLoading(false);
            setProfileReady(true);
          });
        } catch (err: any) {
          clearTimeout(safetyTimeout);
          // Gracefully handle Permission denied - this can happen during initial sign-in
          // before the server sets up the user profile
          if (err?.message?.includes('Permission denied') || err?.message?.includes('PERMISSION_DENIED')) {
            console.warn('[Auth] Permission denied reading profile, will retry after profile creation');
          } else {
            console.error('[Auth] Failed to subscribe to user profile', err);
          }
          setLoading(false);
          setProfileReady(true);
        }
      } else {
        setUserData(null);
        setRoleState(null);
        Cookies.remove('role');
        setLoading(false);
        setProfileReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
    };
  }, []);

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    if (newRole) {
      Cookies.set('role', newRole, { expires: 7 });
    } else {
      Cookies.remove('role');
    }
  };

  const handleSignInWithPhone = async (phone: string, userRole: Role): Promise<ConfirmationResult> => {
    if (!userRole) {
      throw new Error('Role is required');
    }
    return await signInWithPhone(phone, 'recaptcha-container');
  };

  const isFirestoreOfflineError = (err: unknown): err is FirebaseError => {
    return (
      err instanceof FirebaseError &&
      (err.code === 'unavailable' ||
        err.message.toLowerCase().includes('client is offline'))
    );
  };

  const handleVerifyOTP = async (
    confirmationResult: ConfirmationResult,
    code: string,
    userRole: Role
  ): Promise<void> => {
    if (!userRole) {
      throw new Error('Role is required');
    }

    const cred = await confirmationResult.confirm(code);
    const user = cred.user;
    const idToken = await user.getIdToken(true);

    // Check if user exists in Realtime Database first
    let userData: any = null;
    try {
      userData = await getUserProfile(user.uid);
    } catch (err) {
      if (isFirestoreOfflineError(err)) {
        console.warn('[Auth] Realtime DB lookup failed (offline). Continuing login.');
      } else {
        throw err;
      }
    }

    const userExists = userData !== null;

    if (!userExists) {
      // New user - set role temporarily for profile page, but don't create session yet
      setRole(userRole);
      Cookies.set('role', userRole, { expires: 1 }); // Temporary, expires in 1 day
      return; // Let the auth page handle redirect to profile
    }

    const resolvedRole = (userData?.role as Role) || userRole;

    // Existing user - create session and set role using the profile's actual role
    const response = await fetch('/api/sessionLogin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, role: resolvedRole }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error || 'Failed to create session');
    }

    setRole(resolvedRole);
    setUserData(userData || null);
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    try {
      await fetch('/api/sessionLogout', { method: 'POST' });
    } catch {
      // ignore
    }
    await auth.signOut();
    setRole(null);
    setUserData(null);
    Cookies.remove('role');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        loading,
        profileReady,
        setRole,
        signInWithPhone: handleSignInWithPhone,
        verifyOTP: handleVerifyOTP,
        signOut,
        userData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};


