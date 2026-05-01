'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User2, Bus, Phone, Shield, Sparkles, Wallet, Calendar, AlertCircle, Lock as LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isValidLicense, isValidVehicle, isValidSolana } from '@/lib/zk/prover';

type Role = 'driver' | 'passenger';

interface OnboardingData {
  role: Role;
  name: string;
  phone: string;
  licenseNumber?: string;
  vehicleNumber?: string;
  solanaWallet?: string;
  zkProof?: object;
  zkPublicSignals?: string[];
  zkCommitment?: string;
}

interface YatraOnboardingWizardProps {
  initialRole: Role;
  onComplete: (data: OnboardingData) => void;
}

const containerVariants = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -40 },
};

const stepTransition = {
  duration: 0.45,
  ease: [0.22, 0.61, 0.36, 1] as const,
};

export function YatraOnboardingWizard({ initialRole, onComplete }: YatraOnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [solanaWallet, setSolanaWallet] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [zkResult, setZkResult] = useState<{
    proof: object;
    publicSignals: string[];
    commitment: string;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDriver = role === 'driver';

  const canGoNext =
    (step === 1 && !!role) ||
    (step === 2 && !!name.trim() && phone.replace(/\D/g, '').length >= 8) ||
    (step === 3 && (isDriver ? (
      isValidLicense(licenseNumber.trim()) && 
      isValidVehicle(vehicleNumber.trim()) && 
      isValidSolana(solanaWallet.trim()) &&
      parseInt(birthYear) <= 2005 &&
      !!zkResult
    ) : (
      !solanaWallet.trim() || isValidSolana(solanaWallet.trim())
    )));

  const handleGenerateProof = async () => {
    if (!isDriver) return;
    
    // Clear previous errors
    setErrors({});
    const newErrors: Record<string, string> = {};

    if (!isValidLicense(licenseNumber.trim())) newErrors.license = 'Invalid license format';
    if (!isValidVehicle(vehicleNumber.trim())) newErrors.vehicle = 'Invalid vehicle number';
    if (!isValidSolana(solanaWallet.trim())) newErrors.wallet = 'Invalid Solana address';
    const yr = parseInt(birthYear);
    if (isNaN(yr) || yr > 2005) newErrors.birthYear = 'Must be 21+ (born 2005 or earlier)';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsGeneratingProof(true);
    try {
      const { generateDriverProof } = await import('@/lib/zk/prover');
      const result = await generateDriverProof({
        licenseNumber: licenseNumber.trim(),
        birthYear: parseInt(birthYear),
      });

      setZkResult({
        proof: result.proof,
        publicSignals: result.publicSignals,
        commitment: result.commitment,
      });
    } catch (err) {
      console.error('Proof generation failed:', err);
      setErrors({ proof: err instanceof Error ? err.message : 'ZK-Proof generation failed' });
    } finally {
      setIsGeneratingProof(false);
    }
  };

  const handleNext = () => {
    if (!canGoNext) return;
    if (step === 3 || (!isDriver && step === 2)) {
      onComplete({
        role,
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        licenseNumber: isDriver ? licenseNumber.trim() : undefined,
        vehicleNumber: isDriver ? vehicleNumber.trim() : undefined,
        solanaWallet: solanaWallet.trim() || undefined,
        zkProof: zkResult?.proof,
        zkPublicSignals: zkResult?.publicSignals,
        zkCommitment: zkResult?.commitment,
      });
      return;
    }
    setStep((prev) => (prev === 1 ? 2 : 3));
  };

  const handleBack = () => {
    if (step === 1) return;
    if (step === 3 && !isDriver) {
      setStep(2);
      return;
    }
    setStep((prev) => (prev === 3 ? 2 : 1));
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Glow background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-24 right-0 w-72 h-72 bg-cyan-500/25 blur-3xl rounded-full" />
        <div className="absolute -bottom-24 left-0 w-72 h-72 bg-emerald-500/25 blur-3xl rounded-full" />
      </div>

      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-slate-50/60 px-4 py-1.5 shadow-[0_0_0_1px_rgba(8,47,73,0.4)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-semibold tracking-[0.18em] text-cyan-300 uppercase">
            Yatra Onboarding
          </span>
        </div>
        <h2 className="bg-gradient-to-r from-cyan-300 via-emerald-300 to-sky-400 bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">
          Tailored transit in three breaths
        </h2>
        <p className="max-w-md text-sm text-slate-300/80">
          Choose your role, set your identity, and (for drivers) lock your license into a secure zk vault.
        </p>

        {/* Progress indicator */}
        <div className="mt-3 flex items-center gap-3 text-xs font-medium text-slate-600">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-all ${ step === s ? 'bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-lg shadow-emerald-500/40' : s < step ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/50' : 'bg-slate-100 text-slate-600 border border-slate-600' }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s !== 3 && (
                <div
                  className={`h-px w-6 rounded-full ${ step > s ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-slate-700' }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white/90 via-slate-900/90 to-slate-950/90 shadow-[0_22px_80px_rgba(15,23,42,0.9)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(52,211,153,0.12),transparent_55%)] pointer-events-none" />

        <div className="relative z-10 p-6 md:p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                className="space-y-6"
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300">
                  Step 1 · Choose your cockpit
                </p>
                <h3 className="text-xl font-semibold text-white mb-2">Who are you riding as today?</h3>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Driver card */}
                  <button
                    type="button"
                    onClick={() => setRole('driver')}
                    className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${ role === 'driver' ? 'border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_25px_rgba(16,185,129,0.35)]' : 'border-slate-200/70 bg-slate-50/70 hover:border-emerald-400/50 hover:bg-slate-50' }`}
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-60 group-hover:opacity-100">
                      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/15 blur-2xl" />
                      <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-cyan-500/15 blur-2xl" />
                    </div>

                    <div className="relative z-10 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/40">
                        <Bus className="h-7 w-7 text-white" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Driver Cockpit</p>
                        <p className="text-xs text-slate-300/90">
                          Live fleet controls, accident SOS, cryptographic trip receipts.
                        </p>
                      </div>
                    </div>

                    {role === 'driver' && (
                      <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                        Selected
                      </div>
                    )}
                  </button>

                  {/* Passenger card */}
                  <button
                    type="button"
                    onClick={() => setRole('passenger')}
                    className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${ role === 'passenger' ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_25px_rgba(34,211,238,0.35)]' : 'border-slate-200/70 bg-slate-50/70 hover:border-cyan-400/50 hover:bg-slate-50' }`}
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-60 group-hover:opacity-100">
                      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/15 blur-2xl" />
                      <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-sky-500/15 blur-2xl" />
                    </div>

                    <div className="relative z-10 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500 shadow-lg shadow-cyan-500/40">
                        <User2 className="h-7 w-7 text-white" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Passenger Mode</p>
                        <p className="text-xs text-slate-300/90">
                          Hail nearby buses, see live ETAs, mint soulbound trip tickets.
                        </p>
                      </div>
                    </div>

                    {role === 'passenger' && (
                      <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-cyan-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                        Selected
                      </div>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                className="space-y-6"
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300">
                  Step 2 · Identity & contact
                </p>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Let&apos;s put a name to this cockpit.
                </h3>

                <div className="grid gap-5 md:grid-cols-2">
                  {/* Name field */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder=" "
                        className="peer h-14 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-11 text-sm text-white shadow-inner shadow-slate-900/60 placeholder-transparent outline-none transition-all focus:border-cyan-400/70 focus:bg-slate-50 focus:ring-2 focus:ring-cyan-500/20"
                      />
                      <User2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 peer-focus:text-cyan-300" />
                      <label
                        className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-2 text-[11px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-600 peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-cyan-300"
                      >
                        Full name
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      This is how we greet you on live tickets and alerts.
                    </p>
                  </div>

                  {/* Phone field */}
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-slate-600">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-200">
                          +977
                        </span>
                      </span>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder=" "
                        inputMode="tel"
                        className="peer h-14 rounded-2xl border border-slate-200/80 bg-slate-50/70 pl-24 pr-4 text-sm text-white shadow-inner shadow-slate-900/60 placeholder-transparent outline-none transition-all focus:border-emerald-400/70 focus:bg-slate-50 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <Phone className="pointer-events-none absolute left-[4.9rem] top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 peer-focus:text-emerald-300" />
                      <label
                        className="pointer-events-none absolute left-[5.8rem] top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-2 text-[11px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-600 peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-emerald-300"
                      >
                        Phone number
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Used for trip notifications and secure OTP sign-in.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && isDriver && (
              <motion.div
                key="step-3-driver"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                className="space-y-6"
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
                   Step 3 · Cryptographic Verification
                </p>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Secure your fleet identity.
                </h3>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    {/* License Input */}
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Input
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          placeholder=" "
                          className={`peer h-12 rounded-xl border bg-slate-50/50 px-11 text-sm text-white outline-none transition-all focus:ring-2 ${errors.license ? 'border-red-500/50 focus:ring-red-500/20' : 'border-slate-200 focus:border-emerald-500/60 focus:ring-emerald-500/20'}`}
                        />
                        <Shield className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
                        <label className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 rounded-full bg-white px-2 text-[10px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-emerald-300">
                          License Number
                        </label>
                      </div>
                      {errors.license && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.license}</p>}
                    </div>

                    {/* Vehicle Number */}
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Input
                          value={vehicleNumber}
                          onChange={(e) => setVehicleNumber(e.target.value)}
                          placeholder=" "
                          className={`peer h-12 rounded-xl border bg-slate-50/50 px-11 text-sm text-white outline-none transition-all focus:ring-2 ${errors.vehicle ? 'border-red-500/50 focus:ring-red-500/20' : 'border-slate-200 focus:border-cyan-500/60 focus:ring-cyan-500/20'}`}
                        />
                        <Bus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
                        <label className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 rounded-full bg-white px-2 text-[10px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-cyan-300">
                          Vehicle Number
                        </label>
                      </div>
                      {errors.vehicle && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.vehicle}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Birth Year */}
                      <div className="space-y-1.5">
                        <div className="relative">
                          <Input
                            type="number"
                            value={birthYear}
                            onChange={(e) => setBirthYear(e.target.value)}
                            placeholder=" "
                            className={`peer h-12 rounded-xl border bg-slate-50/50 px-11 text-sm text-white outline-none transition-all focus:ring-2 ${errors.birthYear ? 'border-red-500/50 focus:ring-red-500/20' : 'border-slate-200 focus:border-amber-500/60 focus:ring-amber-500/20'}`}
                          />
                          <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400" />
                          <label className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 rounded-full bg-white px-2 text-[10px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-amber-300">
                            Birth Year
                          </label>
                        </div>
                        {errors.birthYear && <p className="text-[10px] text-red-400">{errors.birthYear}</p>}
                      </div>

                      {/* Solana Wallet */}
                      <div className="space-y-1.5">
                        <div className="relative">
                          <Input
                            value={solanaWallet}
                            onChange={(e) => setSolanaWallet(e.target.value)}
                            placeholder=" "
                            className={`peer h-12 rounded-xl border bg-slate-50/50 px-11 text-sm text-white outline-none transition-all focus:ring-2 ${errors.wallet ? 'border-red-500/50 focus:ring-red-500/20' : 'border-slate-200 focus:border-purple-500/60 focus:ring-purple-500/20'}`}
                          />
                          <Wallet className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-400" />
                          <label className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 rounded-full bg-white px-2 text-[10px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-purple-300">
                            Solana Wallet
                          </label>
                        </div>
                        {errors.wallet && <p className="text-[10px] text-red-400">{errors.wallet}</p>}
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={handleGenerateProof}
                      disabled={isGeneratingProof || (!!zkResult && !errors.license && !errors.vehicle && !errors.wallet && !errors.birthYear)}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/20"
                    >
                      {isGeneratingProof ? (
                        <><Sparkles className="w-4 h-4 mr-2 animate-spin" /> Sealing Vault...</>
                      ) : zkResult ? (
                        <><Shield className="w-4 h-4 mr-2 text-emerald-400" /> Proof Ready</>
                      ) : (
                        <><LockIcon className="w-4 h-4 mr-2" /> Generate ZK Proof</>
                      )}
                    </Button>
                    {errors.proof && <p className="text-[10px] text-red-400 text-center">{errors.proof}</p>}
                  </div>

                  {/* zk-proof animation or status */}
                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-orange-50/40 p-5 flex flex-col justify-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5" />
                    
                    {zkResult ? (
                       <div className="relative z-10 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <Shield className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white uppercase tracking-wider">Proof Generated Locally</p>
                              <p className="text-[10px] text-emerald-400/70">Server verification happens during onboarding submit</p>
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-white/80 border border-slate-100 font-mono text-[9px] text-emerald-300/80 break-all">
                             <p className="text-slate-600 mb-1 uppercase tracking-tighter">Commitment Hash</p>
                             0x{zkResult.commitment}
                          </div>
                          <div className="flex gap-2">
                             <div className="px-2 py-1 rounded bg-emerald-500/10 text-[9px] text-emerald-400 border border-emerald-500/20">License Valid</div>
                             <div className="px-2 py-1 rounded bg-emerald-500/10 text-[9px] text-emerald-400 border border-emerald-500/20">Age 21+</div>
                          </div>
                       </div>
                    ) : (
                      <div className="relative z-10 text-center space-y-4 py-4">
                        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                          <Sparkles className={`w-6 h-6 ${isGeneratingProof ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-300">Identity Vault Ready</p>
                          <p className="text-[10px] text-slate-600 max-w-[180px] mx-auto">
                            Enter your credentials to generate a zero-knowledge proof.
                          </p>
                        </div>
                        {isGeneratingProof && (
                          <div className="w-32 mx-auto h-1 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-cyan-500"
                              animate={{ x: [-128, 128] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && !isDriver && (
              <motion.div
                key="step-3-passenger"
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                className="space-y-6"
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300">
                  Step 3 · Wallet & Ready
                </p>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Almost there, {name.split(' ')[0] || 'traveler'}.
                </h3>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Input
                        value={solanaWallet}
                        onChange={(e) => setSolanaWallet(e.target.value)}
                        placeholder=" "
                        className={`peer h-14 rounded-2xl border bg-slate-50/70 px-11 text-sm text-white outline-none transition-all focus:ring-2 ${errors.wallet ? 'border-red-500/50 focus:ring-red-500/20' : 'border-slate-200 focus:border-cyan-400 focus:ring-cyan-500/20'}`}
                      />
                      <Wallet className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
                      <label className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 rounded-full bg-white px-2 text-[11px] text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-[10px] peer-focus:text-cyan-300">
                        Solana Wallet Address
                      </label>
                    </div>
                    {errors.wallet && <p className="text-xs text-red-400">{errors.wallet}</p>}
                    <p className="text-[11px] text-slate-600">
                      We use this to mint your soulbound trip tickets and rewards.
                    </p>
                  </div>
                </div>

                <p className="max-w-md text-sm text-slate-300/90 mt-4">
                  We&apos;ll use your identity to keep you synced with live buses and boarding alerts.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer controls */}
          <div className="mt-8 flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1}
              onClick={handleBack}
              className="h-10 rounded-full border border-slate-200/80 bg-slate-50/70 px-4 text-xs font-medium text-slate-300 hover:bg-slate-100 disabled:opacity-40"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="h-11 rounded-full bg-gradient-to-r from-cyan-500 via-emerald-500 to-sky-500 px-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 shadow-[0_15px_40px_rgba(6,182,212,0.5)] transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:shadow-none"
            >
              {step === 3 || (!isDriver && step === 2) ? 'Finish onboarding' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

