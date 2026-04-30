'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
      if (checkProfileCompletion(userData)) {
        // Use window.location.assign for a clean break from the auth flow
        window.location.assign(userData.role === 'driver' ? '/driver' : '/passenger');
      }
    }
  }, [currentUser, userData, loading, isSubmitting]);

  // ── 4. CONDITIONAL RENDERING (Only after all hooks are declared) ──

  if (loading || (!currentUser && !isSubmitting)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-400 mx-auto mb-4" />
          <p className="text-slate-500">Syncing authentication...</p>
        </div>
      </div>
    );
  }

  // If auth is done but no role is found, go back to selection
  if (!effectiveRole) {
    router.push('/auth');
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
      window.location.assign('/passenger');
    } catch (error) {
      console.error('Error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create profile.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-400 mx-auto mb-4" />
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // No role — user arrived at /auth/profile without going through the landing page.
  // Just send them back to pick a role. No toast in the render path.
  if (!effectiveRole || (effectiveRole !== 'driver' && effectiveRole !== 'passenger')) {
    router.push('/auth');
    return null;
  }

  const isDriver = effectiveRole === 'driver';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500 to-sky-500 mb-6 shadow-2xl shadow-orange-500/30">
              {isDriver ? (
                <Bus className="w-10 h-10 text-white" />
              ) : (
                <User2 className="w-10 h-10 text-white" />
              )}
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
              {currentStep === 1 ? 'Welcome!' : `${isDriver ? 'Driver' : 'Passenger'} Profile`}
            </h1>
            <p className="text-xl text-slate-500">
              {currentStep === 1
                ? 'Authentication successful! Let\'s set up your profile'
                : isDriver
                  ? 'Complete your profile to start accepting rides'
                  : 'Complete your profile to start booking rides'}
            </p>
          </div>

          {/* Progress Steps */}
          <div className="mb-12">
            <div className="flex items-center justify-center gap-4 max-w-2xl mx-auto">
              {/* Step 1: Authentication Complete */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold transition-all ${currentStep >= 1 ? 'bg-gradient-to-br from-orange-500 to-sky-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-500' }`}>
                  {currentStep > 1 ? <CheckCircle2 className="w-6 h-6" /> : '1'}
                </div>
                <span className={`text-sm font-medium hidden sm:inline transition-colors ${currentStep >= 1 ? 'text-white' : 'text-slate-500' }`}>
                  Authentication
                </span>
              </div>

              <div className={`w-16 h-1 rounded-full transition-colors ${currentStep >= 2 ? 'bg-gradient-to-r from-orange-500 to-sky-500' : 'bg-slate-700' }`}></div>

              {/* Step 2: Personal Details */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold transition-all ${currentStep >= 2 ? 'bg-gradient-to-br from-orange-500 to-sky-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-500' }`}>
                  {currentStep > 2 ? <CheckCircle2 className="w-6 h-6" /> : '2'}
                </div>
                <span className={`text-sm font-medium hidden sm:inline transition-colors ${currentStep >= 2 ? 'text-white' : 'text-slate-500' }`}>
                  Personal Details
                </span>
              </div>

              <div className={`w-16 h-1 rounded-full transition-colors ${currentStep >= 3 ? 'bg-gradient-to-r from-orange-500 to-sky-500' : 'bg-slate-700' }`}></div>

              {/* Step 3: Go! */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold transition-all ${currentStep >= 3 ? 'bg-gradient-to-br from-orange-500 to-sky-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-700 text-slate-500' }`}>
                  3
                </div>
                <span className={`text-sm font-medium hidden sm:inline transition-colors ${currentStep >= 3 ? 'text-white' : 'text-slate-500' }`}>
                  Go!
                </span>
              </div>
            </div>
          </div>

          {/* Main Card */}
          {currentStep === 1 ? (
            /* Step 1: Authentication Complete */
            <Card className="bg-slate-50/80 backdrop-blur-xl border-slate-700/50 shadow-2xl">
              <CardContent className="p-12 text-center">
                <div className="mb-8">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 mb-6 shadow-2xl shadow-green-500/50">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-4">
                    Authentication Complete!
                  </h2>
                  <p className="text-lg text-slate-500 max-w-md mx-auto mb-8">
                    You&apos;ve successfully signed in. Now let&apos;s set up your {isDriver ? 'driver' : 'passenger'} profile to get started.
                  </p>
                </div>

                <button
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-sky-500 hover:from-orange-400 hover:to-sky-400 text-white font-semibold shadow-lg shadow-orange-500/30 transition-all duration-300 hover:scale-105"
                >
                  <span>Continue to Profile Setup</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </CardContent>
            </Card>
          ) : (
            /* Step 2 & 3: Profile Form */
            <Card className="bg-slate-50/80 backdrop-blur-xl border-slate-700/50 shadow-2xl">
              <CardContent className="p-8 md:p-12">
                {isDriver ? (
                  <form onSubmit={driverForm.handleSubmit(handleDriverSubmit)} className="space-y-8">
                    {/* Personal Information */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-sky-500 flex items-center justify-center">
                          <User2 className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Personal Information</h2>
                      </div>

                      {/* Profile Image */}
                      <div className="space-y-3">
                        <Label className="text-slate-300 text-sm font-medium">Profile Picture</Label>
                        <div className="flex items-center gap-6">
                          <div className="relative group">
                            <div className="w-28 h-28 rounded-3xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl">
                              {profilePreview ? (
                                <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <User2 className="w-12 h-12 text-slate-600" />
                                </div>
                              )}
                            </div>
                            <label htmlFor="profileImage" className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded-3xl cursor-pointer transition-opacity">
                              <Camera className="w-8 h-8 text-white" />
                            </label>
                            <input
                              id="profileImage"
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageChange(e, 'profileImage')}
                              className="hidden"
                            />
                          </div>
                          <div className="flex-1">
                            <label htmlFor="profileImage" className="block">
                              <div className="px-6 py-4 bg-slate-800 border-2 border-dashed border-slate-700 hover:border-orange-400 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex items-center gap-3">
                                  <Upload className="w-5 h-5 text-slate-500 group-hover:text-orange-300 transition-colors" />
                                  <div>
                                    <p className="text-sm font-medium text-slate-300">Upload your photo</p>
                                    <p className="text-xs text-slate-500 mt-1">Max 5MB • JPG, PNG</p>
                                  </div>
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Name */}
                      <div className="space-y-3">
                        <Label htmlFor="name" className="text-slate-300 text-sm font-medium">
                          Full Name <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <User2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="name"
                            {...driverForm.register('name')}
                            placeholder="Enter your full name"
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {driverForm.formState.errors.name && (
                          <p className="text-sm text-red-400 flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-red-400"></span>
                            {driverForm.formState.errors.name.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Vehicle Information */}
                    <div className="space-y-6 pt-8 border-t border-slate-800">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-sky-500 flex items-center justify-center">
                          <Bus className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Vehicle Information</h2>
                      </div>

                      {/* Vehicle Type */}
                      <div className="space-y-3">
                        <Label className="text-slate-300 text-sm font-medium">
                          Vehicle Type <span className="text-red-400">*</span>
                        </Label>
                        <Select
                          value={driverForm.watch('vehicleType')}
                          onValueChange={(value) =>
                            driverForm.setValue('vehicleType', value as VehicleTypeId)
                          }
                        >
                          <SelectTrigger className="h-14 bg-slate-800 border-slate-700 text-white rounded-xl focus:border-orange-400 focus:ring-orange-400/20">
                            <SelectValue placeholder="Select vehicle type" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {VEHICLE_TYPES.map((type) => (
                              <SelectItem key={type.id} value={type.id} className="text-white hover:bg-slate-700">
                                <span className="flex items-center gap-2">
                                  <span className="text-2xl">{type.icon}</span>
                                  <span>{type.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Vehicle Image */}
                      <div className="space-y-3">
                        <Label className="text-slate-300 text-sm font-medium">Vehicle Photo</Label>
                        <div className="flex items-center gap-6">
                          <div className="relative group">
                            <div className="w-32 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl">
                              {vehiclePreview ? (
                                <img src={vehiclePreview} alt="Vehicle" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Bus className="w-10 h-10 text-slate-600" />
                                </div>
                              )}
                            </div>
                            <label htmlFor="vehicleImage" className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                              <Camera className="w-6 h-6 text-white" />
                            </label>
                            <input
                              id="vehicleImage"
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageChange(e, 'vehicleImage')}
                              className="hidden"
                            />
                          </div>
                          <div className="flex-1">
                            <label htmlFor="vehicleImage" className="block">
                              <div className="px-6 py-4 bg-slate-800 border-2 border-dashed border-slate-700 hover:border-sky-400 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex items-center gap-3">
                                  <Upload className="w-5 h-5 text-slate-500 group-hover:text-sky-300 transition-colors" />
                                  <div>
                                    <p className="text-sm font-medium text-slate-300">Upload vehicle photo</p>
                                    <p className="text-xs text-slate-500 mt-1">Clear photo of your vehicle</p>
                                  </div>
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Two Column Grid */}
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Vehicle Number */}
                        <div className="space-y-3">
                          <Label htmlFor="vehicleNumber" className="text-slate-300 text-sm font-medium">
                            Vehicle Number <span className="text-red-400">*</span>
                          </Label>
                          <div className="relative">
                            <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <Input
                              id="vehicleNumber"
                              {...driverForm.register('vehicleNumber')}
                              placeholder="e.g., Lu 1 Pa 2345"
                              className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                            />
                          </div>
                          {driverForm.formState.errors.vehicleNumber && (
                            <p className="text-sm text-red-400">
                              {driverForm.formState.errors.vehicleNumber.message}
                            </p>
                          )}
                        </div>

                        {/* Solana Wallet */}
                        <div className="space-y-3">
                          <Label htmlFor="solanaWallet" className="text-slate-300 text-sm font-medium">
                            Solana Wallet Address <span className="text-red-400">*</span>
                          </Label>
                          <div className="relative">
                            <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <Input
                              id="solanaWallet"
                              {...driverForm.register('solanaWallet')}
                              placeholder="Solana wallet address"
                              className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                            />
                          </div>
                          {driverForm.formState.errors.solanaWallet && (
                            <p className="text-sm text-red-400">
                              {driverForm.formState.errors.solanaWallet.message}
                            </p>
                          )}
                        </div>

                        {/* License Number */}
                        <div className="space-y-3">
                          <Label htmlFor="licenseNumber" className="text-slate-300 text-sm font-medium">
                            License Number <span className="text-red-400">*</span>
                          </Label>
                          <div className="relative">
                            <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <Input
                              id="licenseNumber"
                              {...driverForm.register('licenseNumber')}
                              placeholder="Your license number"
                              className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                            />
                          </div>
                          {driverForm.formState.errors.licenseNumber && (
                            <p className="text-sm text-red-400">
                              {driverForm.formState.errors.licenseNumber.message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* License images */}
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label className="text-slate-300 text-sm font-medium">License Front</Label>
                          <div className="flex items-center gap-4">
                            <div className="relative group">
                              <div className="w-32 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl">
                                {licenseFrontPreview ? (
                                  <img src={licenseFrontPreview} alt="License front" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <CreditCard className="w-9 h-9 text-slate-600" />
                                  </div>
                                )}
                              </div>
                              <label htmlFor="licenseFrontImage" className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                                <Camera className="w-6 h-6 text-white" />
                              </label>
                              <input
                                id="licenseFrontImage"
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageChange(e, 'licenseFrontImage')}
                                className="hidden"
                              />
                            </div>
                            <label htmlFor="licenseFrontImage" className="flex-1 block">
                              <div className="px-4 py-4 bg-slate-800 border-2 border-dashed border-slate-700 hover:border-orange-400 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex items-center gap-3">
                                  <Upload className="w-5 h-5 text-slate-500 group-hover:text-orange-300 transition-colors" />
                                  <div>
                                    <p className="text-sm font-medium text-slate-300">Upload front side</p>
                                    <p className="text-xs text-slate-500 mt-1">Photo must be clear and readable</p>
                                  </div>
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-slate-300 text-sm font-medium">License Back</Label>
                          <div className="flex items-center gap-4">
                            <div className="relative group">
                              <div className="w-32 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl">
                                {licenseBackPreview ? (
                                  <img src={licenseBackPreview} alt="License back" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <CreditCard className="w-9 h-9 text-slate-600" />
                                  </div>
                                )}
                              </div>
                              <label htmlFor="licenseBackImage" className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                                <Camera className="w-6 h-6 text-white" />
                              </label>
                              <input
                                id="licenseBackImage"
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageChange(e, 'licenseBackImage')}
                                className="hidden"
                              />
                            </div>
                            <label htmlFor="licenseBackImage" className="flex-1 block">
                              <div className="px-4 py-4 bg-slate-800 border-2 border-dashed border-slate-700 hover:border-orange-400 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex items-center gap-3">
                                  <Upload className="w-5 h-5 text-slate-500 group-hover:text-orange-300 transition-colors" />
                                  <div>
                                    <p className="text-sm font-medium text-slate-300">Upload back side</p>
                                    <p className="text-xs text-slate-500 mt-1">Include renewal/authority details</p>
                                  </div>
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Route */}
                      <div className="space-y-3">
                        <Label htmlFor="route" className="text-slate-300 text-sm font-medium">
                          Primary Route <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="route"
                            {...driverForm.register('route')}
                            placeholder="e.g., Butwal Main Route"
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {driverForm.formState.errors.route && (
                          <p className="text-sm text-red-400">
                            {driverForm.formState.errors.route.message}
                          </p>
                        )}
                      </div>

                      {/* Driver verification */}
                      <div className="space-y-4 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20">
                            <Lock className="w-6 h-6 text-white" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-xl font-bold text-white">Driver Security Verification</h3>
                            <p className="text-sm text-slate-300">
                              This step is required before your driver dashboard unlocks. Your license and birth year stay private while Yatra verifies a zero-knowledge proof and mints your badge.
                            </p>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <Label htmlFor="birthYear" className="text-slate-300 text-sm font-medium">
                              Birth Year <span className="text-red-400">*</span>
                            </Label>
                            <div className="relative">
                              <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                              <Input
                                id="birthYear"
                                type="number"
                                min={1920}
                                max={2005}
                                {...driverForm.register('birthYear', { valueAsNumber: true })}
                                placeholder="e.g., 1995"
                                className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-amber-500 focus:ring-amber-500/20"
                              />
                            </div>
                            {driverForm.formState.errors.birthYear && (
                              <p className="text-sm text-red-400">
                                {driverForm.formState.errors.birthYear.message}
                              </p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-amber-300">
                              <Sparkles className="w-4 h-4" />
                              <span className="text-sm font-semibold">Verification checklist</span>
                            </div>
                            <ul className="mt-3 space-y-2 text-sm text-slate-300">
                              <li className={`flex items-center gap-2 ${isValidLicense(driverForm.watch('licenseNumber') || '') ? 'text-emerald-300' : ''}`}>
                                <span className="text-xs">{isValidLicense(driverForm.watch('licenseNumber') || '') ? '✓' : '•'}</span>
                                Valid driver license
                              </li>
                              <li className={`flex items-center gap-2 ${isValidSolana(driverForm.watch('solanaWallet') || '') ? 'text-emerald-300' : ''}`}>
                                <span className="text-xs">{isValidSolana(driverForm.watch('solanaWallet') || '') ? '✓' : '•'}</span>
                                Valid Solana wallet
                              </li>
                              <li className={`flex items-center gap-2 ${(driverForm.watch('birthYear') || 0) <= 2005 ? 'text-emerald-300' : ''}`}>
                                <span className="text-xs">{(driverForm.watch('birthYear') || 0) <= 2005 ? '✓' : '•'}</span>
                                Age 21+ eligibility
                              </li>
                              <li className={`flex items-center gap-2 ${!!driverForm.watch('licenseFrontImage') && !!driverForm.watch('licenseBackImage') ? 'text-emerald-300' : ''}`}>
                                <span className="text-xs">{!!driverForm.watch('licenseFrontImage') && !!driverForm.watch('licenseBackImage') ? '✓' : '•'}</span>
                                License front and back uploaded
                              </li>
                              <li className="flex items-center gap-2 text-slate-500">
                                <span className="text-xs">•</span>
                                Proof is generated on this device before server verification
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Verification status</p>
                          {existingBadge ? (
                            <div className="flex items-center gap-2 text-emerald-300">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-sm font-semibold">Verified</span>
                              <span className="text-xs text-slate-500">Minted badge is active.</span>
                            </div>
                          ) : verificationState === 'verifying' ? (
                            <div className="flex items-center gap-2 text-amber-300">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm font-semibold">Verifying on-chain...</span>
                            </div>
                          ) : verificationState === 'generating' ? (
                            <div className="flex items-center gap-2 text-amber-300">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm font-semibold">Generating ZK proof...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-300">
                              <Shield className="w-4 h-4 text-amber-300" />
                              <span className="text-sm font-semibold">Awaiting verification</span>
                            </div>
                          )}
                        </div>

                        {(verificationCommitment || existingBadge?.zkCommitment) && (
                          <div className="rounded-2xl border border-amber-500/20 bg-slate-950/60 p-4">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80 mb-2">Latest ZK commitment</p>
                            <p className="font-mono text-sm text-amber-200 break-all">
                              {formatCommitment(existingBadge?.zkCommitment || verificationCommitment || '')}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Capacity */}
                      <div className="space-y-3">
                        <Label htmlFor="capacity" className="text-slate-300 text-sm font-medium">
                          Vehicle Capacity <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <User2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="capacity"
                            type="number"
                            {...driverForm.register('capacity', { valueAsNumber: true })}
                            min={1}
                            max={100}
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {driverForm.formState.errors.capacity && (
                          <p className="text-sm text-red-400">
                            {driverForm.formState.errors.capacity.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-6">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-16 text-lg font-bold rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-sky-500 hover:from-amber-400 hover:via-orange-400 hover:to-sky-400 shadow-2xl shadow-orange-500/30 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                            {verificationState === 'generating'
                              ? 'Generating ZK Proof...'
                              : verificationState === 'verifying'
                                ? 'Verifying Driver Badge...'
                                : 'Creating Your Profile...'}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-6 h-6 mr-3" />
                            Verify and Complete Driver Profile
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={passengerForm.handleSubmit(handlePassengerSubmit)} className="space-y-8">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-sky-500 flex items-center justify-center">
                          <User2 className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Your Information</h2>
                      </div>

                      {/* Name */}
                      <div className="space-y-3">
                        <Label htmlFor="name" className="text-slate-300 text-sm font-medium">
                          Full Name <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <User2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="name"
                            {...passengerForm.register('name')}
                            placeholder="Enter your full name"
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {passengerForm.formState.errors.name && (
                          <p className="text-sm text-red-400 flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-red-400"></span>
                            {passengerForm.formState.errors.name.message}
                          </p>
                        )}
                      </div>

                      {/* Email */}
                      <div className="space-y-3">
                        <Label htmlFor="email" className="text-slate-300 text-sm font-medium">
                          Email Address <span className="text-slate-500 text-xs">(Optional)</span>
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="email"
                            type="email"
                            {...passengerForm.register('email')}
                            placeholder="your.email@example.com"
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {passengerForm.formState.errors.email && (
                          <p className="text-sm text-red-400">
                            {passengerForm.formState.errors.email.message}
                          </p>
                        )}
                      </div>

                      {/* Emergency Contact */}
                      <div className="space-y-3">
                        <Label htmlFor="emergencyContact" className="text-slate-300 text-sm font-medium">
                          Emergency Contact <span className="text-slate-500 text-xs">(Optional)</span>
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="emergencyContact"
                            {...passengerForm.register('emergencyContact')}
                            placeholder="+977 98XXXXXXXX"
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {passengerForm.formState.errors.emergencyContact && (
                          <p className="text-sm text-red-400">
                            {passengerForm.formState.errors.emergencyContact.message}
                          </p>
                        )}
                      </div>

                      {/* Solana Wallet */}
                      <div className="space-y-3">
                        <Label htmlFor="solanaWallet" className="text-slate-300 text-sm font-medium">
                          Solana Wallet Address <span className="text-slate-500 text-xs">(Optional, for Trip Tickets)</span>
                        </Label>
                        <div className="relative">
                          <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <Input
                            id="solanaWallet"
                            {...passengerForm.register('solanaWallet')}
                            placeholder="e.g., 9xQe... (Phantom Wallet)"
                            className="h-14 pl-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:border-orange-400 focus:ring-orange-400/20"
                          />
                        </div>
                        {passengerForm.formState.errors.solanaWallet && (
                          <p className="text-sm text-red-400">
                            {passengerForm.formState.errors.solanaWallet.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Info Box */}
                    <div className="p-6 rounded-2xl bg-orange-500/10 border border-orange-400/20">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-orange-300" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-white font-semibold mb-2">Your Privacy Matters</h3>
                          <p className="text-sm text-slate-500 leading-relaxed">
                            Your information is encrypted and secure. We only use it to provide you with the best service.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-16 text-lg font-bold rounded-2xl bg-gradient-to-r from-orange-500 to-sky-500 hover:from-orange-400 hover:to-sky-400 shadow-2xl shadow-orange-500/30 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                            Creating Your Profile...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-6 h-6 mr-3" />
                            Complete Passenger Profile
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-400 mx-auto mb-4" />
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    }>
      <ProfilePageContent />
    </Suspense>
  );
}
