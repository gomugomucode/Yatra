'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import { User2, Bus, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft, ChevronLeft } from 'lucide-react';
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
  try {
    userData = await getUserProfile(uid);
  } catch { }

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

  if (isSignIn && hasProfile) {
    window.location.assign(role === 'driver' ? '/driver' : '/passenger');
    return 'dashboard';
  }

  if (hasProfile) {
    window.location.assign(role === 'driver' ? '/driver' : '/passenger');
    return 'dashboard';
  }

  window.location.assign(`/auth/profile?role=${selectedRole}`);
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
  const [isSignUp, setIsSignUp] = useState(searchParams.get('isSignUp') === 'true');
  const [loading, setLoading] = useState<'idle' | 'google' | 'email'>('idle');
  const isSigningInRef = useRef(false);

  const roleInUrl = searchParams.get('role') as Role | null;

  useEffect(() => {
    if (roleInUrl === 'driver' || roleInUrl === 'passenger') {
      setSelectedRole(roleInUrl);
    }
  }, [roleInUrl]);

  useEffect(() => {
    if (authLoading || !currentUser || pathname !== '/auth') return;
    if (isSigningInRef.current) return;
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

  const handleGoogleSignIn = async () => {
    if (loading !== 'idle') return;
    isSigningInRef.current = true;
    setLoading('google');
    try {
      const cred = await signInWithGoogle();
      const user = cred.user;
      const idToken = await user.getIdToken(true);
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
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmail(email, password);
        const idToken = await userCredential.user.getIdToken();
        await resolvePostLoginRedirect(userCredential.user.uid, selectedRole, idToken, setRole, router, false);
      } else {
        userCredential = await signInWithEmail(email, password);
        const idToken = await userCredential.user.getIdToken();
        await resolvePostLoginRedirect(userCredential.user.uid, selectedRole, idToken, setRole, router, true);
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
    <div className="min-h-screen bg-white flex flex-col md:flex-row">
      
      {/* Left side: Visuals (Desktop only) */}
      <div className="hidden md:flex md:w-1/2 bg-slate-50 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px]" />
        
        <div className="relative z-10 max-w-lg">
          <Link href="/" className="inline-flex items-center gap-2 mb-12">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
              <Bus className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900">Yatra</span>
          </Link>
          
          <h2 className="text-5xl font-black text-slate-900 leading-tight mb-6">
            The future of <br />
            <span className="text-orange-500">Nepal's transit.</span>
          </h2>
          <p className="text-xl text-slate-600 font-medium leading-relaxed mb-12">
            Join thousands of passengers and drivers moving smarter every day. 
            Real-time tracking, secure payments, and verified identity.
          </p>
          
          <div className="space-y-6">
            {[
              { icon: <ShieldCheck className="w-6 h-6 text-orange-500" />, text: "ZK-Verified Secure Identity" },
              { icon: <Bus className="w-6 h-6 text-orange-500" />, text: "Real-time Live GPS Tracking" },
              { icon: <Loader2 className="w-6 h-6 text-orange-500" />, text: "Instant Paperless Booking" }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                {item.icon}
                <span className="font-bold text-slate-700">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side: Auth Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-12 flex justify-between items-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <Bus className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-black tracking-tight text-slate-900">Yatra</span>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm" className="font-bold text-slate-600">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            </Link>
          </div>

          <div className="mb-10">
            <h1 className="text-3xl font-black text-slate-900 mb-2">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </h1>
            <p className="text-slate-600 font-medium">
              {isSignUp 
                ? 'Join Yatra and start your journey today.' 
                : 'Enter your credentials to access your portal.'}
            </p>
          </div>

          {/* Role Selector */}
          <div className="flex p-1 rounded-2xl bg-slate-100 mb-8">
            <button
              onClick={() => setSelectedRole('passenger')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${selectedRole === 'passenger' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-700'}`}
            >
              <User2 className="w-4 h-4" /> Passenger
            </button>
            <button
              onClick={() => setSelectedRole('driver')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${selectedRole === 'driver' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-700'}`}
            >
              <Bus className="w-4 h-4" /> Driver
            </button>
          </div>

          <div className="space-y-6">
            <Button
              onClick={handleGoogleSignIn}
              disabled={isBusy}
              className="w-full h-14 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-bold border-2 border-slate-100 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              {loading === 'google' ? <Loader2 className="w-5 h-5 animate-spin" /> : (
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
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-black text-slate-600">
                <span className="bg-white px-4">OR USE EMAIL</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                <Input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 pl-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-orange-500/50 focus:ring-orange-500/10 transition-all font-medium"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 pl-12 pr-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-orange-500/50 focus:ring-orange-500/10 transition-all font-medium"
                />
                <button 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-orange-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              onClick={handleEmailAuth}
              disabled={isBusy || !email || !password}
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-lg shadow-xl shadow-orange-200 transition-all active:scale-[0.98]"
            >
              {loading === 'email' ? <Loader2 className="w-6 h-6 animate-spin" /> : (isSignUp ? 'Create Account' : 'Sign In')}
            </Button>

            <div className="text-center pt-4">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm font-bold text-slate-600 hover:text-orange-500 transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em]">
              Secured by Groth16 & ZK-Proofs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-orange-500" /></div>}>
      <AuthContent />
    </Suspense>
  );
}
