'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import { User2, Bus, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  signInWithEmail,
  createUserWithEmail,
  sendPasswordReset,
  signInWithGoogle,
} from '@/lib/firebase';
import { getUserProfile } from '@/lib/firebaseDb';
import { checkProfileCompletion } from '@/lib/types';

type Role = 'driver' | 'passenger';

const mapFirebaseError = (err: unknown): string => {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please sign in instead.';
      case 'auth/invalid-email':
        return 'Invalid email address format.';
      case 'auth/user-not-found':
        return 'No account found with this email. Please sign up first.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please check your credentials.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Popup was blocked. Please allow popups and try again.';
      default:
        return err.message;
    }
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Something went wrong. Please try again.';
};

/**
 * After Firebase login: resolves where to send the user.
 * - isSignIn=true + passenger role → always go to /passenger dashboard directly (skip profile setup).
 * - Sign-up or driver → check profile completion and redirect accordingly.
 */
async function resolvePostLoginRedirect(
  uid: string,
  selectedRole: Role,
  idToken: string,
  setRole: (r: Role | null) => void,
  router: ReturnType<typeof useRouter>,
  isSignIn: boolean = false
): Promise<'dashboard' | 'profile'> {
  let userData: any = null;
  try {
    userData = await getUserProfile(uid);
  } catch {
    // treat as new user
  }

  const hasProfile = userData != null && checkProfileCompletion(userData);
  const role = hasProfile ? (userData.role as Role) : selectedRole;

  const sessionRes = await fetch('/api/sessionLogin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, role }),
  });

  if (!sessionRes.ok) {
    const payload = await sessionRes.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error || 'Session creation failed');
  }

  setRole(role);

  // On sign-in, go directly to dashboard for both roles — no profile setup required.
  if (isSignIn) {
    const path = selectedRole === 'driver' ? '/driver' : '/passenger';
    router.replace(path);
    return 'dashboard';
  }

  if (hasProfile) {
    const path = role === 'driver' ? '/driver' : '/passenger';
    router.replace(path);
    return 'dashboard';
  }

  router.replace(`/auth/profile?role=${selectedRole}`);
  return 'profile';
}

function AuthContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setRole, currentUser, loading: authLoading, userData, role } = useAuth();
  const { toast } = useToast();

  const [selectedRole, setSelectedRole] = useState<Role>('passenger');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState<'idle' | 'google' | 'email'>('idle');

  // Sync role from URL query parameter
  const roleInUrl = searchParams.get('role') as Role | null;

  useEffect(() => {
    if (roleInUrl === 'driver' || roleInUrl === 'passenger') {
      setSelectedRole(roleInUrl);
    }
  }, [roleInUrl]);

  // Handle automatic redirection if already logged in
  useEffect(() => {
    if (authLoading || !currentUser || pathname !== '/auth') return;
    if (userData === undefined) return;

    if (userData === null) {
      const dest = role || selectedRole;
      router.replace(`/auth/profile?role=${dest}`);
      return;
    }

    if (checkProfileCompletion(userData)) {
      const targetRole = userData.role || role || selectedRole;
      router.replace(targetRole === 'driver' ? '/driver' : '/passenger');
    } else {
      const dest = userData.role || role || selectedRole;
      router.replace(`/auth/profile?role=${dest}`);
    }
  }, [authLoading, currentUser, userData, role, selectedRole, router, pathname]);

  const setRoleInUrl = (role: Role) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('role', role);
    router.replace(`/auth?${params.toString()}`, { scroll: false });
  };

  const handleGoogleSignIn = async () => {
    if (loading !== 'idle') return;
    setLoading('google');
    try {
      const cred = await signInWithGoogle();
      const user = cred.user;
      const idToken = await user.getIdToken(true);
      // Google sign-in: passengers go directly to dashboard (isSignIn=true)
      await resolvePostLoginRedirect(user.uid, selectedRole, idToken, setRole, router, true);
      toast({ title: 'Welcome to Yatra', description: 'You’re signed in.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Sign-in failed', description: mapFirebaseError(err) });
    } finally {
      setLoading('idle');
    }
  };

  const handleEmailAuth = async () => {
    if (loading !== 'idle' || !email || !password) return;
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Weak password', description: 'Password must be at least 6 characters.' });
      return;
    }
    setLoading('email');
    try {
      let userCredential;
      if (isSignUp) {
        // Sign-up: create account then go through profile setup
        userCredential = await createUserWithEmail(email, password);
        const idToken = await userCredential.user.getIdToken();
        await resolvePostLoginRedirect(userCredential.user.uid, selectedRole, idToken, setRole, router, false);
      } else {
        // Sign-in: passengers go directly to dashboard, drivers check profile
        userCredential = await signInWithEmail(email, password);
        const idToken = await userCredential.user.getIdToken();
        await resolvePostLoginRedirect(userCredential.user.uid, selectedRole, idToken, setRole, router, true);
      }
    } catch (err: unknown) {
      if (isSignUp && err instanceof FirebaseError && err.code === 'auth/email-already-in-use') {
        setIsSignUp(false);
        toast({ title: 'Account already exists', description: 'Switching to sign in mode.' });
      } else {
        toast({ variant: 'destructive', title: isSignUp ? 'Sign up failed' : 'Sign in failed', description: mapFirebaseError(err) });
      }
    } finally {
      setLoading('idle');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ variant: 'destructive', title: 'Email required', description: 'Enter your email address first.' });
      return;
    }
    try {
      await sendPasswordReset(email);
      toast({ title: 'Check your email', description: 'Password reset instructions sent.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Failed to send reset email', description: mapFirebaseError(err) });
    }
  };

  const isBusy = loading !== 'idle';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[480px] h-[480px] bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-slate-900/60 backdrop-blur-md px-4 py-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Secure Access</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Yatra <span className="text-emerald-400">Portal</span>
          </h1>
          <p className="text-slate-400 text-sm">
            {isSignUp ? 'Create your account to start moving.' : 'Welcome back! Please enter your details.'}
          </p>
        </div>

        {/* 🚦 ROLE INDICATOR / SELECTOR
            If role is in URL, we show a locked confirmation badge.
            If NO role is in URL, we show the switchable tabs. */}
        {roleInUrl ? (
          <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-slate-900/50 border border-emerald-500/20 backdrop-blur-md animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                {selectedRole === 'driver' ? (
                  <Bus className="w-5 h-5 text-emerald-400" />
                ) : (
                  <User2 className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Portal Access</p>
                <p className="text-sm font-bold text-white">
                  Yatra <span className="text-emerald-400 capitalize">{selectedRole}</span>
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="group flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
              Change
            </Link>
          </div>
        ) : (
          <div className="flex p-1 rounded-2xl bg-slate-900/60 border border-slate-700/60 backdrop-blur-md">
            <button
              type="button"
              onClick={() => { setSelectedRole('passenger'); setRoleInUrl('passenger'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${selectedRole === 'passenger'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <User2 className="w-4 h-4" /> Passenger
            </button>
            <button
              type="button"
              onClick={() => { setSelectedRole('driver'); setRoleInUrl('driver'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${selectedRole === 'driver'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Bus className="w-4 h-4" /> Driver
            </button>
          </div>
        )}

        {/* Auth Form Card */}
        <div className="rounded-3xl border border-slate-700/60 bg-slate-900/70 backdrop-blur-xl shadow-2xl p-6 space-y-6">
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isBusy}
            className="w-full h-12 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold border-0 shadow-md flex items-center justify-center gap-3"
          >
            {loading === 'google' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700/60" /></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest"><span className="bg-slate-900/70 px-4 text-slate-500 font-bold">Secure Email Login</span></div>
          </div>

          <div className="flex gap-2 p-1 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <button type="button" onClick={() => setIsSignUp(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!isSignUp ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>SIGN IN</button>
            <button type="button" onClick={() => setIsSignUp(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isSignUp ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>SIGN UP</button>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-11 rounded-xl bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-emerald-500/10"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pl-11 pr-11 rounded-xl bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-emerald-500/10"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-emerald-400 transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleEmailAuth}
            disabled={isBusy || !email || !password}
            className="w-full h-13 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold shadow-xl shadow-emerald-900/20 transition-all active:scale-[0.98]"
          >
            {loading === 'email' ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Create Yatra Account' : 'Sign In')}
          </Button>

          {!isSignUp && (
            <button type="button" onClick={handleForgotPassword} className="w-full text-xs text-slate-500 hover:text-emerald-400 transition-colors font-medium">
              Lost your password? <span className="text-emerald-500 underline underline-offset-4">Reset here</span>
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest font-bold">
          Protected by Groth16 Proofs & ZK-Identity
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-emerald-500" /></div>}>
      <AuthContent />
    </Suspense>
  );
}