'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bus, User2, Loader2, Upload, Camera, MapPin, Shield, Phone, Mail, CreditCard, CheckCircle2, ArrowRight, Wallet, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getFirebaseApp } from '@/lib/firebase';
import { createUserProfile } from '@/lib/firebaseDb';
import { VEHICLE_TYPES, DEFAULT_LOCATION } from '@/lib/constants';
import { Driver, VehicleTypeId, checkProfileCompletion } from '@/lib/types';
import { getDatabase, ref, set as rtdbSet } from 'firebase/database';
import { formatCommitment, isValidLicense, isValidSolana } from '@/lib/zk/prover';

const driverSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  vehicleType: z.enum(['bus', 'others', 'taxi', 'bike']),
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  licenseNumber: z.string().min(1, 'License number is required'),
  licenseFrontImage: z.string().optional(),
  licenseBackImage: z.string().optional(),
  solanaWallet: z.string().min(32, 'Valid Solana wallet is required').max(44),
  birthYear: z.number().min(1920, 'Birth year must be 1920 or later').max(2005, 'Drivers must be 21+'),
  route: z.string().min(1, 'Route is required'),
  capacity: z.number().min(1).max(100),
  profileImage: z.string().optional(),
  vehicleImage: z.string().optional(),
});

const passengerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  emergencyContact: z.string().min(10, 'Emergency contact must be at least 10 digits').optional().or(z.literal('')),
  solanaWallet: z.string().optional().or(z.literal('')),
});

type DriverFormData = z.infer<typeof driverSchema>;
type PassengerFormData = z.infer<typeof passengerSchema>;

const resizeImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, role, userData, loading, setRole } = useAuth();
  const { toast } = useToast();
  const driverProfile = useMemo(
    () => (userData?.role === 'driver' ? (userData as Driver) : null),
    [userData]
  );
  const existingBadge = driverProfile?.verificationBadge;

  // ── 1. ALL HOOKS MUST BE AT THE TOP ──
  // These must run every single time, regardless of auth state.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [vehiclePreview, setVehiclePreview] = useState<string | null>(null);
  const [licenseFrontPreview, setLicenseFrontPreview] = useState<string | null>(null);
  const [licenseBackPreview, setLicenseBackPreview] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [verificationState, setVerificationState] = useState<'idle' | 'generating' | 'verifying'>('idle');
  const [verificationCommitment, setVerificationCommitment] = useState<string | null>(null);

  const driverForm = useForm<DriverFormData>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      name: '',
      vehicleType: 'bus',
      vehicleNumber: '',
      licenseNumber: '',
      licenseFrontImage: '',
      licenseBackImage: '',
      solanaWallet: '',
      birthYear: 1995,
      route: '',
      capacity: 40,
    },
  });

  const passengerForm = useForm<PassengerFormData>({
    resolver: zodResolver(passengerSchema),
    defaultValues: {
      name: '',
      email: '',
      emergencyContact: '',
      solanaWallet: '',
    },
  });

  // ── 2. DERIVED STATE & MEMOIZED VALUES ──
  const roleFromUrl = searchParams.get('role') as 'driver' | 'passenger' | null;
  const reverify = searchParams.get('reverify') === 'true';
  const effectiveRole = roleFromUrl || role;

  // ── 3. EFFECTS (Logic that runs after render) ──

  // Sync role from URL into context
  useEffect(() => {
    if (currentUser && !role && roleFromUrl && (roleFromUrl === 'driver' || roleFromUrl === 'passenger')) {
      setRole(roleFromUrl);
    }
  }, [currentUser, role, roleFromUrl, setRole]);

  // Safe redirect guard
  useEffect(() => {
    if (!loading && currentUser && userData && !isSubmitting) {
      if (checkProfileCompletion(userData) && !reverify) {
        // Use window.location.assign for a clean break from the auth flow
        window.location.assign(userData.role === 'driver' ? '/driver' : '/passenger');
      }
    }
  }, [currentUser, userData, loading, isSubmitting, reverify]);

  // Redirect to role selection if no valid role is found after auth resolves
  useEffect(() => {
    if (!loading && !effectiveRole) {
      router.push('/auth');
    }
  }, [loading, effectiveRole, router]);

  // ── 4. CONDITIONAL RENDERING (Only after all hooks are declared) ──

  if (loading || (!currentUser && !isSubmitting)) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: '#00D4AA', margin: '0 auto 12px' }} />
          <p style={{ color: '#64748B', fontSize: '0.9rem' }}>Syncing authentication...</p>
        </div>
      </div>
    );
  }

  // If auth is done but no role is found, rendering is deferred to the effect above
  if (!effectiveRole) {
    return null;
  }

  // ── 5. HANDLERS ──

  const handleImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'profileImage' | 'vehicleImage' | 'licenseFrontImage' | 'licenseBackImage'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.size > 5 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'File too large', description: 'Image must be less than 5MB' });
        return;
      }

      const resized = await resizeImage(file);
      driverForm.setValue(field, resized);

      if (field === 'profileImage') setProfilePreview(resized);
      else if (field === 'vehicleImage') setVehiclePreview(resized);
      else if (field === 'licenseFrontImage') setLicenseFrontPreview(resized);
      else setLicenseBackPreview(resized);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to process image.' });
    }
  };

  const handleDriverSubmit = async (data: DriverFormData) => {
    if (!currentUser) return;
    try {
      setIsSubmitting(true);
      setCurrentStep(3);

      // 1. Destructure to pull out fields that we will redefine or that conflict
      // 'formCapacity' avoids name collision with our calculated 'capacity' variable
      const { name, capacity: formCapacity, birthYear, ...restOfData } = data;

      const vehicleTypeData = VEHICLE_TYPES.find((v) => v.id === data.vehicleType);
      const finalCapacity = vehicleTypeData?.capacity || formCapacity;

      const idToken = await currentUser.getIdToken();
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          role: 'driver',
          userData: {
            ...restOfData,
            name,
            capacity: finalCapacity
          },
        }),
      });

      if (!registerRes.ok) {
        const errData = await registerRes.json().catch(() => ({}));
        throw new Error(`Register failed: ${(errData as { error?: string }).error || registerRes.status}`);
      }

      const freshToken = await currentUser.getIdToken(true);

      const sessionRes = await fetch('/api/sessionLogin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: freshToken, role: 'driver' }),
      });
      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        throw new Error(`Session failed: ${(errData as { error?: string }).error || sessionRes.status}`);
      }

      setRole('driver');

      setVerificationState('generating');
      const { generateDriverProof } = await import('@/lib/zk/prover');
      const zkResult = await generateDriverProof({
        licenseNumber: data.licenseNumber.trim(),
        birthYear,
      });
      setVerificationCommitment(zkResult.commitment);

      await createUserProfile(currentUser.uid, {
        ...restOfData,
        phone: currentUser.phoneNumber || '',
        name,
        role: 'driver',
        capacity: finalCapacity,
        isApproved: false,
        solanaWallet: data.solanaWallet,
      });

      const rtdb = getDatabase(getFirebaseApp());
      const nowIso = new Date().toISOString();
      await rtdbSet(ref(rtdb, `buses/${currentUser.uid}`), {
        id: currentUser.uid,
        driverId: currentUser.uid,
        driverName: name,
        busNumber: data.vehicleNumber,
        route: data.route,
        capacity: finalCapacity,
        isActive: false,
        vehicleType: data.vehicleType,
        availableSeats: finalCapacity,
        lastSeatUpdate: nowIso,
        currentLocation: {
          lat: DEFAULT_LOCATION.lat,
          lng: DEFAULT_LOCATION.lng,
          timestamp: nowIso
        }
      });

      setVerificationState('verifying');
      const verifyRes = await fetch('/api/solana/verify-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: currentUser.uid,
          driverName: name,
          vehicleType: data.vehicleType,
          driverWalletAddress: data.solanaWallet.trim(),
          zkProof: zkResult.proof,
          zkPublicSignals: zkResult.publicSignals,
          licenseNumber: data.licenseNumber.trim(),
        }),
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error((verifyData as { error?: string }).error || 'Driver verification failed');
      }

      toast({ title: 'Success!', description: 'Profile verified and created.' });
      document.cookie = `role=driver; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.assign('/driver');
    } catch (error) {
      console.error('[driver-submit]', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setVerificationState('idle');
      setIsSubmitting(false);
    }
  };

  // ... (JSX continues below)

  const handlePassengerSubmit = async (data: PassengerFormData) => {
    if (!currentUser) return;

    try {
      setIsSubmitting(true);
      const idToken = await currentUser.getIdToken();

      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          role: 'passenger',
          userData: { name: data.name, email: data.email, emergencyContact: data.emergencyContact, solanaWallet: data.solanaWallet }
        }),
      });

      if (!registerRes.ok) {
        const errorData = await registerRes.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || 'Registration API failed');
      }

      // Refresh token to get 'passenger' claim
      const freshToken = await currentUser.getIdToken(true);

      await fetch('/api/sessionLogin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: freshToken, role: 'passenger' }),
      });

      setRole('passenger');

      await createUserProfile(currentUser.uid, {
        phone: currentUser.phoneNumber || '',
        name: data.name,
        email: data.email || null,
        role: 'passenger',
        emergencyContact: data.emergencyContact || null,
        solanaWallet: data.solanaWallet || null,
      });

      toast({ title: 'Success!', description: 'Profile created.' });
      document.cookie = `role=passenger; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.assign('/passenger');
    } catch (error) {
      console.error('Error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create profile.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  const C = '#00D4AA'; const CD = '#009E7F'; const CL = '#E6FBF5';
  const INK = '#0F172A'; const MUTED = '#64748B'; const BORDER = '#E2E8F0'; const SURF = '#F8FAFC';

  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', background: SURF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: 48, height: 48, color: C, margin: '0 auto 12px' }} className="animate-spin" />
          <p style={{ color: MUTED, fontSize: '0.9rem' }}>Loading your profile...</p>
        </div>
      </div>
    );
  }

  // effectiveRole is guaranteed valid here (guarded by effect + early return above)

  const isDriver = effectiveRole === 'driver';

  const baseInput: React.CSSProperties = {
    height: 52, paddingLeft: 46, paddingRight: 16, borderRadius: 12,
    background: SURF, border: `1.5px solid ${BORDER}`, color: INK,
    fontSize: '0.9rem', width: '100%', outline: 'none', fontFamily: 'inherit',
  };

  const sectionHeader = (icon: React.ReactNode, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: C, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontWeight: 800, fontSize: '1.05rem', color: INK }}>{title}</span>
    </div>
  );

  const fieldError = (msg: string | undefined) => msg ? (
    <p style={{ fontSize: '0.78rem', color: '#EF4444', marginTop: 4 }}>{msg}</p>
  ) : null;

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, ${CL} 0%, ${SURF} 55%, #EFF6FF 100%)`, position: 'relative' }}>
      {/* Decorative circles */}
      <div style={{ position: 'fixed', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: `${C}18`, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', background: '#3B82F618', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 48px' }}>
        {/* Top bar */}
        <div style={{ width: '100%', maxWidth: 640, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus style={{ width: 18, height: 18, color: 'white' }} />
            </div>
            <span style={{ fontWeight: 900, fontSize: '1.1rem', color: INK, letterSpacing: '-0.02em' }}>YATRA</span>
          </div>
          <div style={{ padding: '4px 12px', borderRadius: 20, background: isDriver ? CL : '#EFF6FF', border: `1.5px solid ${isDriver ? C : '#3B82F6'}`, fontSize: '0.7rem', fontWeight: 800, color: isDriver ? CD : '#2563EB', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {isDriver ? 'Driver Setup' : 'Passenger Setup'}
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ width: '100%', maxWidth: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
          {(['Authentication', 'Profile', 'Complete'] as const).map((label, i) => {
            const step = i + 1;
            const done = currentStep > step;
            const active = currentStep === step;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: done || active ? C : '#F1F5F9', border: `2px solid ${done || active ? C : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                    {done
                      ? <CheckCircle2 style={{ width: 18, height: 18, color: 'white' }} />
                      : <span style={{ fontSize: '0.8rem', fontWeight: 800, color: active ? 'white' : MUTED }}>{step}</span>}
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: active || done ? CD : MUTED, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
                </div>
                {i < 2 && <div style={{ width: 48, height: 2, background: currentStep > step ? C : BORDER, margin: '0 6px', marginBottom: 18, transition: 'background 0.3s' }} />}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ width: '100%', maxWidth: 640 }}>
          {currentStep === 1 ? (
            /* Step 1: Auth complete */
            <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: `linear-gradient(135deg, ${C}, ${CD})`, padding: '32px 32px 28px', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 style={{ width: 40, height: 40, color: 'white' }} />
                </div>
                <h1 style={{ color: 'white', fontWeight: 900, fontSize: '1.5rem', marginBottom: 8 }}>You&apos;re in!</h1>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem' }}>Authentication successful — let&apos;s build your {isDriver ? 'driver' : 'passenger'} profile.</p>
              </div>
              <div style={{ padding: '28px 32px 32px', textAlign: 'center' }}>
                <p style={{ color: MUTED, fontSize: '0.875rem', marginBottom: 24, lineHeight: 1.6 }}>
                  Signed in as <strong style={{ color: INK }}>{currentUser.email}</strong>.<br />
                  Your profile takes about 2 minutes to complete.
                </p>
                <button
                  onClick={() => setCurrentStep(2)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 12, background: C, border: 'none', color: 'white', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.15s' }}
                  className="active:scale-95"
                >
                  Continue to Profile Setup
                  <ArrowRight style={{ width: 18, height: 18 }} />
                </button>
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'center', gap: 24 }}>
                  {[['🔒', 'ZK Verified'], ['⚡', '0.4s Settlement'], ['🚌', '847+ Buses']].map(([icon, label]) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1rem', marginBottom: 2 }}>{icon}</div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : isDriver ? (
            /* Driver form */
            <form onSubmit={driverForm.handleSubmit(handleDriverSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Personal card */}
              <div style={{ background: 'white', borderRadius: 20, padding: '24px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                {sectionHeader(<User2 style={{ width: 18, height: 18, color: 'white' }} />, 'Personal Information')}

                {/* Profile photo */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Profile Photo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 80, height: 80, borderRadius: 16, background: SURF, border: `1.5px solid ${BORDER}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {profilePreview
                          ? <img src={profilePreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <User2 style={{ width: 32, height: 32, color: MUTED }} />}
                      </div>
                    </div>
                    <label htmlFor="profileImage" style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ padding: '12px 16px', borderRadius: 12, background: SURF, border: `1.5px dashed ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Upload style={{ width: 18, height: 18, color: C, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: INK }}>Upload your photo</p>
                          <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2 }}>Max 5MB · JPG, PNG</p>
                        </div>
                      </div>
                      <input id="profileImage" type="file" accept="image/*" onChange={(e) => handleImageChange(e, 'profileImage')} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="driverName" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Full Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User2 style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: MUTED, pointerEvents: 'none' }} />
                    <input id="driverName" {...driverForm.register('name')} placeholder="Enter your full name" style={baseInput} />
                  </div>
                  {fieldError(driverForm.formState.errors.name?.message)}
                </div>
              </div>

              {/* Vehicle card */}
              <div style={{ background: 'white', borderRadius: 20, padding: '24px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                {sectionHeader(<Bus style={{ width: 18, height: 18, color: 'white' }} />, 'Vehicle Information')}

                {/* Vehicle type */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Vehicle Type <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <Select value={driverForm.watch('vehicleType')} onValueChange={(v) => driverForm.setValue('vehicleType', v as VehicleTypeId)}>
                    <SelectTrigger style={{ height: 52, borderRadius: 12, background: SURF, border: `1.5px solid ${BORDER}`, color: INK, fontSize: '0.9rem' }}>
                      <SelectValue placeholder="Select vehicle type" />
                    </SelectTrigger>
                    <SelectContent style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12 }}>
                      {VEHICLE_TYPES.map((type) => (
                        <SelectItem key={type.id} value={type.id} style={{ color: INK }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.2rem' }}>{type.icon}</span>
                            <span>{type.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Vehicle photo */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vehicle Photo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 96, height: 64, borderRadius: 12, background: SURF, border: `1.5px solid ${BORDER}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {vehiclePreview
                        ? <img src={vehiclePreview} alt="Vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Bus style={{ width: 28, height: 28, color: MUTED }} />}
                    </div>
                    <label htmlFor="vehicleImage" style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ padding: '12px 16px', borderRadius: 12, background: SURF, border: `1.5px dashed ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Upload style={{ width: 18, height: 18, color: C, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: INK }}>Upload vehicle photo</p>
                          <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2 }}>Clear exterior shot</p>
                        </div>
                      </div>
                      <input id="vehicleImage" type="file" accept="image/*" onChange={(e) => handleImageChange(e, 'vehicleImage')} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>

                {/* Vehicle number + Wallet */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label htmlFor="vehicleNumber" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Plate No. <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <CreditCard style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                      <input id="vehicleNumber" {...driverForm.register('vehicleNumber')} placeholder="Lu 1 Pa 2345" style={baseInput} />
                    </div>
                    {fieldError(driverForm.formState.errors.vehicleNumber?.message)}
                  </div>
                  <div>
                    <label htmlFor="driverCapacity" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Capacity <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User2 style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                      <input id="driverCapacity" type="number" {...driverForm.register('capacity', { valueAsNumber: true })} min={1} max={100} style={baseInput} />
                    </div>
                    {fieldError(driverForm.formState.errors.capacity?.message)}
                  </div>
                </div>

                {/* Solana wallet */}
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="driverWallet" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Solana Wallet <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Wallet style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                    <input id="driverWallet" {...driverForm.register('solanaWallet')} placeholder="Solana wallet address" style={baseInput} />
                  </div>
                  {fieldError(driverForm.formState.errors.solanaWallet?.message)}
                </div>

                {/* Route */}
                <div>
                  <label htmlFor="route" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Primary Route <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                    <input id="route" {...driverForm.register('route')} placeholder="e.g., Butwal Main Route" style={baseInput} />
                  </div>
                  {fieldError(driverForm.formState.errors.route?.message)}
                </div>
              </div>

              {/* License card */}
              <div style={{ background: 'white', borderRadius: 20, padding: '24px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                {sectionHeader(<Shield style={{ width: 18, height: 18, color: 'white' }} />, 'License Documents')}

                {/* License number */}
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="licenseNumber" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    License Number <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Shield style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                    <input id="licenseNumber" {...driverForm.register('licenseNumber')} placeholder="Your license number" style={baseInput} />
                  </div>
                  {fieldError(driverForm.formState.errors.licenseNumber?.message)}
                </div>

                {/* License images */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {([
                    { id: 'licenseFrontImage', label: 'Front Side', preview: licenseFrontPreview } as const,
                    { id: 'licenseBackImage', label: 'Back Side', preview: licenseBackPreview } as const,
                  ] as const).map(({ id, label, preview }) => (
                    <div key={id}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
                      <label htmlFor={id} style={{ cursor: 'pointer', display: 'block' }}>
                        <div style={{ height: 80, borderRadius: 12, background: SURF, border: `1.5px dashed ${BORDER}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {preview
                            ? <img src={preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ textAlign: 'center' }}>
                                <Camera style={{ width: 20, height: 20, color: C, margin: '0 auto 4px' }} />
                                <p style={{ fontSize: '0.7rem', color: MUTED }}>Upload {label.toLowerCase()}</p>
                              </div>}
                        </div>
                        <input id={id} type="file" accept="image/*" onChange={(e) => handleImageChange(e, id)} style={{ display: 'none' }} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* ZK Security card */}
              <div style={{ background: CL, borderRadius: 20, padding: '24px 24px', border: `1.5px solid ${C}40` }}>
                {sectionHeader(<Lock style={{ width: 18, height: 18, color: 'white' }} />, 'ZK Security Verification')}
                <p style={{ fontSize: '0.82rem', color: CD, marginBottom: 20, lineHeight: 1.6 }}>
                  Your license and birth year stay private. Yatra generates a zero-knowledge proof on this device before any server verification.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {/* Birth year */}
                  <div>
                    <label htmlFor="birthYear" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: CD, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Birth Year <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Shield style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: CD, pointerEvents: 'none' }} />
                      <input id="birthYear" type="number" min={1920} max={2005} {...driverForm.register('birthYear', { valueAsNumber: true })} placeholder="e.g., 1995" style={{ ...baseInput, background: 'white', borderColor: `${C}60` }} />
                    </div>
                    {fieldError(driverForm.formState.errors.birthYear?.message)}
                  </div>

                  {/* Checklist */}
                  <div style={{ background: 'white', borderRadius: 12, padding: '12px 14px' }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 800, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Checklist</p>
                    {[
                      [isValidLicense(driverForm.watch('licenseNumber') || ''), 'Valid license'],
                      [isValidSolana(driverForm.watch('solanaWallet') || ''), 'Valid wallet'],
                      [(driverForm.watch('birthYear') || 0) <= 2005, 'Age 21+'],
                      [!!driverForm.watch('licenseFrontImage') && !!driverForm.watch('licenseBackImage'), 'License photos'],
                    ].map(([ok, label]) => (
                      <div key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: '0.75rem', color: ok ? C : BORDER, fontWeight: 800 }}>{ok ? '✓' : '○'}</span>
                        <span style={{ fontSize: '0.78rem', color: ok ? CD : MUTED, fontWeight: ok ? 700 : 500 }}>{String(label)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Verification status */}
                <div style={{ background: 'white', borderRadius: 12, padding: '12px 14px', marginBottom: existingBadge || verificationCommitment ? 12 : 0 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 800, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Verification Status</p>
                  {existingBadge ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C }}>
                      <CheckCircle2 style={{ width: 16, height: 16 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Verified — badge active</span>
                    </div>
                  ) : verificationState === 'verifying' || verificationState === 'generating' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#D97706' }}>
                      <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                        {verificationState === 'generating' ? 'Generating ZK proof...' : 'Verifying on-chain...'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: MUTED }}>
                      <Shield style={{ width: 16, height: 16, color: '#D97706' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Awaiting verification</span>
                    </div>
                  )}
                </div>

                {(verificationCommitment || existingBadge?.zkCommitment) && (
                  <div style={{ background: 'white', borderRadius: 12, padding: '10px 14px' }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 800, color: '#D97706', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>ZK Commitment</p>
                    <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#92400E', wordBreak: 'break-all' }}>
                      {formatCommitment(existingBadge?.zkCommitment || verificationCommitment || '')}
                    </p>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ width: '100%', height: 56, borderRadius: 14, background: isSubmitting ? MUTED : C, border: 'none', color: 'white', fontWeight: 800, fontSize: '1rem', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
                className="active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 style={{ width: 20, height: 20 }} className="animate-spin" />
                    {verificationState === 'generating' ? 'Generating ZK Proof...' : verificationState === 'verifying' ? 'Verifying Badge...' : 'Creating Profile...'}
                  </>
                ) : (
                  <>
                    <CheckCircle2 style={{ width: 20, height: 20 }} />
                    Verify &amp; Complete Driver Profile
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Passenger form */
            <form onSubmit={passengerForm.handleSubmit(handlePassengerSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Main card with gradient header */}
              <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
                {/* Gradient header */}
                <div style={{ background: `linear-gradient(135deg, ${C}, ${CD})`, padding: '22px 24px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User2 style={{ width: 22, height: 22, color: 'white' }} />
                    </div>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Step 2 of 3</p>
                      <h2 style={{ color: 'white', fontWeight: 900, fontSize: '1.15rem', lineHeight: 1.2 }}>Rider Profile</h2>
                    </div>
                  </div>
                  {/* Perks row */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[['🗺️', 'Live Bus Tracking'], ['🎫', 'NFT Trip Tickets'], ['📍', 'Real-time Location']].map(([icon, label]) => (
                      <div key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)' }}>
                        <span style={{ fontSize: '0.75rem' }}>{String(icon)}</span>
                        <span style={{ fontSize: '0.68rem', color: 'white', fontWeight: 700, letterSpacing: '0.02em' }}>{String(label)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fields */}
                <div style={{ padding: '24px' }}>
                  {/* Name */}
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="passName" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: MUTED, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Full Name <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User2 style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                      <input id="passName" {...passengerForm.register('name')} placeholder="Your full name" style={baseInput} />
                    </div>
                    {fieldError(passengerForm.formState.errors.name?.message)}
                  </div>

                  {/* Email */}
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="passEmail" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: MUTED, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Email <span style={{ fontSize: '0.7rem', fontWeight: 500, textTransform: 'none', color: MUTED }}>— optional</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                      <input id="passEmail" type="email" {...passengerForm.register('email')} placeholder="your@email.com" style={baseInput} />
                    </div>
                    {fieldError(passengerForm.formState.errors.email?.message)}
                  </div>

                  {/* Emergency contact */}
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="emergencyContact" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: MUTED, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Emergency Contact <span style={{ fontSize: '0.7rem', fontWeight: 500, textTransform: 'none', color: MUTED }}>— optional</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                      <input id="emergencyContact" {...passengerForm.register('emergencyContact')} placeholder="+977 98XXXXXXXX" style={baseInput} />
                    </div>
                    {fieldError(passengerForm.formState.errors.emergencyContact?.message)}
                  </div>

                  {/* Solana wallet */}
                  <div style={{ marginBottom: 0 }}>
                    <label htmlFor="passWallet" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: MUTED, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Solana Wallet <span style={{ fontSize: '0.7rem', fontWeight: 500, textTransform: 'none', color: MUTED }}>— optional, for NFT tickets</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <CreditCard style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MUTED, pointerEvents: 'none' }} />
                      <input id="passWallet" {...passengerForm.register('solanaWallet')} placeholder="9xQe... (Phantom / Solflare)" style={baseInput} />
                    </div>
                    {fieldError(passengerForm.formState.errors.solanaWallet?.message)}
                    <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 5, paddingLeft: 4 }}>
                      Connect a Solana wallet to receive on-chain trip receipts and NFT badges.
                    </p>
                  </div>
                </div>
              </div>

              {/* What happens next */}
              <div style={{ background: 'white', borderRadius: 16, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 800, color: MUTED, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 14 }}>What happens next</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { icon: <MapPin style={{ width: 14, height: 14, color: 'white' }} />, title: 'Find nearby buses', desc: 'See live bus locations on your map' },
                    { icon: <Bus style={{ width: 14, height: 14, color: 'white' }} />, title: 'Hail a ride', desc: 'Tap to signal the bus from your stop' },
                    { icon: <Wallet style={{ width: 14, height: 14, color: 'white' }} />, title: 'Instant settlement', desc: 'ZK-verified trip receipt in 0.4 seconds' },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: C, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {icon}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: INK }}>{title}</p>
                        <p style={{ fontSize: '0.75rem', color: MUTED, marginTop: 1 }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Privacy note */}
              <div style={{ background: CL, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, border: `1px solid ${C}35` }}>
                <Shield style={{ width: 16, height: 16, color: CD, flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: '0.78rem', color: CD, lineHeight: 1.6 }}>
                  <strong style={{ color: INK }}>Your data stays yours.</strong> Encrypted end-to-end. ZK-proofs verify your trips without exposing personal details.
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ width: '100%', height: 56, borderRadius: 14, background: isSubmitting ? MUTED : `linear-gradient(135deg, ${C}, ${CD})`, border: 'none', color: 'white', fontWeight: 800, fontSize: '1rem', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s', boxShadow: isSubmitting ? 'none' : `0 4px 16px ${C}50` }}
                className="active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <><Loader2 style={{ width: 20, height: 20 }} className="animate-spin" />Creating your profile...</>
                ) : (
                  <><CheckCircle2 style={{ width: 20, height: 20 }} />Start Riding with Yatra</>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 40, height: 40, color: '#00D4AA' }} className="animate-spin" />
      </div>
    }>
      <ProfilePageContent />
    </Suspense>
  );
}

