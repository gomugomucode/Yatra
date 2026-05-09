'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import Image from 'next/image';
import { User2, Bus, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, MapPin, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  signInWithEmail,
  createUserWithEmail,
  signInWithGoogle,
} from '@/lib/firebase';
import { getUserProfile } from '@/lib/firebaseDb';
import { checkProfileCompletion } from '@/lib/types';

// ─── Light-mode design tokens ─────────────────────────────────────────────────
const CYAN       = '#00D4AA';
const CYAN_DARK  = '#009E7F';
const CYAN_LIGHT = '#E6FBF5';
const INK        = '#0F172A';
const MUTED      = '#64748B';
const BORDER     = '#E2E8F0';
const SURFACE    = '#F8FAFC';
const MONO       = 'var(--font-jetbrains-mono)';
const PLAYFAIR   = 'var(--font-playfair)';

type Role = 'driver' | 'passenger';

const mapFirebaseError = (err: unknown): string => {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/email-already-in-use':   return 'This email is already registered. Please sign in instead.';
      case 'auth/invalid-email':          return 'Invalid email address format.';
      case 'auth/user-not-found':         return 'No account found with this email. Please sign up first.';
      case 'auth/wrong-password':         return 'Incorrect password. Please try again.';
      case 'auth/weak-password':          return 'Password should be at least 6 characters.';
      case 'auth/invalid-credential':     return 'Invalid email or password. Please check your credentials.';
      case 'auth/popup-closed-by-user':   return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':          return 'Popup was blocked. Please allow popups and try again.';
      default:                            return err.message;
    }
  }
  return 'Something went wrong. Please try again.';
};

async function resolvePostLoginRedirect(
  uid: string,
  selectedRole: Role,
  idToken: string,
  setRole: (r: Role | null) => void,
  router: ReturnType<typeof useRouter>,
  isSignIn: boolean = false
): Promise<'dashboard' | 'profile'> {
  let userData: Record<string, unknown> | null = null;
  try { userData = await getUserProfile(uid); } catch { }

  const hasProfile = userData != null && checkProfileCompletion(userData);
  const role = hasProfile ? (userData!.role as Role) : selectedRole;

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

  if (isSignIn || hasProfile) {
    window.location.assign(role === 'driver' ? '/driver' : '/passenger');
    return 'dashboard';
  }

  window.location.assign(`/auth/profile?role=${selectedRole}`);
  return 'profile';
}

function AuthContent() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const { setRole, currentUser, loading: authLoading, userData, role } = useAuth();
  const { toast }    = useToast();

  const [selectedRole, setSelectedRole] = useState<Role>('passenger');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp,     setIsSignUp]     = useState(searchParams.get('isSignUp') === 'true');
  const [loading,      setLoading]      = useState<'idle' | 'google' | 'email'>('idle');
  const isSigningInRef = useRef(false);

  const roleInUrl = searchParams.get('role') as Role | null;

  useEffect(() => {
    if (roleInUrl === 'driver' || roleInUrl === 'passenger') setSelectedRole(roleInUrl);
  }, [roleInUrl]);

  useEffect(() => {
    if (authLoading || !currentUser || pathname !== '/auth') return;
    if (isSigningInRef.current) return;
    if (userData === undefined) return;

    if (userData === null) {
      router.replace(`/auth/profile?role=${role || selectedRole}`);
      return;
    }

    if (checkProfileCompletion(userData)) {
      const targetRole = userData.role || role || selectedRole;
      router.replace(targetRole === 'driver' ? '/driver' : '/passenger');
    } else {
      router.replace(`/auth/profile?role=${userData.role || role || selectedRole}`);
    }
  }, [authLoading, currentUser, userData, role, selectedRole, router, pathname]);

  const handleGoogleSignIn = async () => {
    if (loading !== 'idle') return;
    isSigningInRef.current = true;
    setLoading('google');
    try {
      const cred      = await signInWithGoogle();
      const user      = cred.user;
      const idToken   = await user.getIdToken(true);
      const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
      await resolvePostLoginRedirect(user.uid, selectedRole, idToken, setRole, router, !isNewUser);
      toast({ title: 'Welcome to Yatra' });
    } catch (err: unknown) {
      isSigningInRef.current = false;
      toast({ variant: 'destructive', title: 'Sign-in failed', description: mapFirebaseError(err) });
    } finally {
      setLoading('idle');
    }
  };

  const handleEmailAuth = async () => {
    if (loading !== 'idle' || !email || !password) return;
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Weak password', description: 'At least 6 characters required.' });
      return;
    }
    isSigningInRef.current = true;
    setLoading('email');
    try {
      if (isSignUp) {
        const cred    = await createUserWithEmail(email, password);
        const idToken = await cred.user.getIdToken();
        await resolvePostLoginRedirect(cred.user.uid, selectedRole, idToken, setRole, router, false);
      } else {
        const cred    = await signInWithEmail(email, password);
        const idToken = await cred.user.getIdToken();
        await resolvePostLoginRedirect(cred.user.uid, selectedRole, idToken, setRole, router, true);
      }
    } catch (err: unknown) {
      isSigningInRef.current = false;
      toast({ variant: 'destructive', title: 'Authentication failed', description: mapFirebaseError(err) });
    } finally {
      setLoading('idle');
    }
  };

  const isBusy = loading !== 'idle';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #E6FBF5 0%, #F8FAFC 55%, #EFF6FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', position: 'relative', overflow: 'hidden' }}>

      {/* Background decoration */}
      <div style={{ position: 'fixed', top: -120, right: -120, width: 480, height: 480, borderRadius: '50%', background: `${CYAN}0C`, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -80, left: -80, width: 360, height: 360, borderRadius: '50%', background: `${CYAN}08`, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: '55%', left: '5%', width: 120, height: 120, borderRadius: '50%', background: `${CYAN}06`, pointerEvents: 'none' }} />

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 460, borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.10), 0 4px 16px rgba(0,212,170,0.08)', position: 'relative', zIndex: 1 }}>

        {/* ── Card header: CYAN gradient brand strip ── */}
        <div style={{ background: `linear-gradient(135deg, ${CYAN} 0%, ${CYAN_DARK} 100%)`, padding: '36px 36px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ position: 'absolute', bottom: -40, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', top: '30%', right: '15%', width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />

          {/* Nav row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, position: 'relative', zIndex: 1 }}>
            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <Image src="/yatra-logo.png" alt="Yatra" width={32} height={32} style={{ borderRadius: 8 }} priority />
              <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.22em', fontWeight: 700 }}>YATRA</span>
            </Link>
            <Link href="/" style={{ fontFamily: MONO, fontSize: '9px', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.14em', textDecoration: 'none', transition: 'color 0.2s' }}>
              ← BACK
            </Link>
          </div>

          {/* Headline */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: '8px', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.28em', marginBottom: 12, fontWeight: 600 }}>
              YATRA PROTOCOL · NEPAL
            </div>
            <h1 style={{
              fontFamily: PLAYFAIR, fontWeight: 700, color: 'white',
              fontSize: 'clamp(2.2rem, 6vw, 3rem)',
              lineHeight: 0.92, letterSpacing: '-0.02em', marginBottom: 14,
              whiteSpace: 'pre-line',
            }}>
              {isSignUp ? 'Join\nYatra.' : 'Welcome\nback.'}
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, maxWidth: 320 }}>
              {isSignUp ? 'Create your account to start your journey across Nepal.' : 'Sign in to access your real-time dashboard.'}
            </p>
          </div>
        </div>

        {/* ── Card body: white form ── */}
        <div style={{ background: '#FFFFFF', padding: '28px 36px 36px' }}>

          {/* Mode badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 22, padding: '5px 12px', borderRadius: 20, background: CYAN_LIGHT }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: CYAN }} />
            <span style={{ fontFamily: MONO, fontSize: '9px', color: CYAN_DARK, letterSpacing: '0.2em', fontWeight: 700 }}>
              {isSignUp ? 'NEW ACCOUNT' : 'SIGN IN'}
            </span>
          </div>

          {/* Role selector */}
          <div style={{ display: 'flex', gap: 3, background: SURFACE, borderRadius: 12, padding: 4, marginBottom: 24, border: `1px solid ${BORDER}` }}>
            {(['passenger', 'driver'] as Role[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRole(r)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontFamily: MONO, fontSize: '10px', letterSpacing: '0.14em', fontWeight: 700,
                  transition: 'all 0.2s',
                  background: selectedRole === r ? '#FFFFFF' : 'transparent',
                  color:      selectedRole === r ? CYAN_DARK : MUTED,
                  boxShadow:  selectedRole === r ? `0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px ${BORDER}` : 'none',
                }}
              >
                {r === 'passenger' ? <User2 size={13} /> : <Bus size={13} />}
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Google */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isBusy}
              style={{
                width: '100%', height: 52,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                background: '#FFFFFF', border: `1.5px solid ${BORDER}`,
                borderRadius: 12, cursor: isBusy ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem', fontWeight: 600, color: INK,
                transition: 'all 0.2s',
                opacity: isBusy ? 0.6 : 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={e => { if (!isBusy) { e.currentTarget.style.borderColor = CYAN; e.currentTarget.style.boxShadow = `0 0 0 3px ${CYAN}1A`; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
            >
              {loading === 'google'
                ? <Loader2 size={16} className="animate-spin" style={{ color: CYAN }} />
                : (
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )
              }
              Continue with Google
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '2px 0' }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ fontSize: '0.72rem', color: MUTED, letterSpacing: '0.1em' }}>or use email</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            {/* Email */}
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none', zIndex: 1 }} />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ height: 52, paddingLeft: 46, borderRadius: 12, background: SURFACE, border: `1.5px solid ${BORDER}`, color: INK, fontSize: '0.9rem' }}
                className="placeholder:text-slate-400 focus-visible:ring-0 focus-visible:border-[#00D4AA] transition-colors"
              />
            </div>

            {/* Password */}
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none', zIndex: 1 }} />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ height: 52, paddingLeft: 46, paddingRight: 48, borderRadius: 12, background: SURFACE, border: `1.5px solid ${BORDER}`, color: INK, fontSize: '0.9rem' }}
                className="placeholder:text-slate-400 focus-visible:ring-0 focus-visible:border-[#00D4AA] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', padding: 4 }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={handleEmailAuth}
              disabled={isBusy || !email || !password}
              style={{
                width: '100%', height: 52, marginTop: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: (!email || !password || isBusy) ? `${CYAN}55` : CYAN,
                border: 'none', borderRadius: 12,
                cursor: (isBusy || !email || !password) ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.02em',
                boxShadow: (!email || !password || isBusy) ? 'none' : `0 6px 20px ${CYAN}40`,
                transition: 'all 0.2s',
              }}
            >
              {loading === 'email'
                ? <Loader2 size={16} className="animate-spin" />
                : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>

            {/* Toggle sign-up/sign-in */}
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: MUTED, transition: 'color 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = CYAN_DARK; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = MUTED; }}
              >
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <span style={{ color: CYAN_DARK, fontWeight: 700 }}>
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: MONO, fontSize: '8px', color: `${MUTED}60`, letterSpacing: '0.2em' }}>
              GROTH16 · ZK-PROOFS
            </p>
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { v: '847+', l: 'buses' },
                { v: '0.4s', l: 'settlement' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: MONO, fontSize: '0.75rem', fontWeight: 700, color: CYAN_DARK }}>{s.v}</div>
                  <div style={{ fontSize: '0.65rem', color: `${MUTED}80` }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F0FDF9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#00D4AA' }} />
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
