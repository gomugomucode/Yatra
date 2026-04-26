'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Shield, ShieldCheck, Loader2, ExternalLink,
    Wallet, Lock, Eye, EyeOff, CheckCircle2, ChevronRight
} from 'lucide-react';
import { Driver } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import { formatCommitment } from '@/lib/zk/prover';

interface VerificationPanelProps {
    driver: Driver;
    onVerificationSuccess: () => void;
}

type Step = 'credentials' | 'proof' | 'mint';

/**
 * 3-step ZK Civic Identity verification panel.
 * Corrected for Age >= 21 requirement in 2026 (Birth Year <= 2005).
 */
export default function VerificationPanel({ driver, onVerificationSuccess }: VerificationPanelProps) {
    const { toast } = useToast();

    // Step state
    const [step, setStep] = useState<Step>('credentials');
    const [isGeneratingProof, setIsGeneratingProof] = useState(false);
    const [isMinting, setIsMinting] = useState(false);

    // Step 1 inputs — stay in browser
    const [licenseNumber, setLicenseNumber] = useState('');
    const [birthYear, setBirthYear] = useState('');
    const [walletAddress, setWalletAddress] = useState(driver.solanaWallet || '');
    const [showLicense, setShowLicense] = useState(false);

    // Step 2 outputs — ZK proof (safe to send to server)
    const [zkProof, setZkProof] = useState<object | null>(null);
    const [zkPublicSignals, setZkPublicSignals] = useState<string[] | null>(null);
    const [zkCommitment, setZkCommitment] = useState('');

    // Validation errors
    const [errors, setErrors] = useState<Record<string, string>>({});

    // ── Field validation ──────────────────────────────────────────────────────
    const validate = (): boolean => {
        const { validateDriverData } = require('@/lib/zk/prover');
        const { isValid, errors: validationErrors } = validateDriverData({
            licenseNumber,
            vehicleNumber: '', // Not needed for this specific step but required by helper
            solanaWallet: walletAddress,
            birthYear
        });
        
        // Map specific errors back to local state
        const e: Record<string, string> = {};
        if (validationErrors.licenseNumber) e.license = validationErrors.licenseNumber;
        if (validationErrors.birthYear) e.birthYear = validationErrors.birthYear;
        if (validationErrors.solanaWallet) e.wallet = validationErrors.solanaWallet;
        
        setErrors(e);
        return isValid;
    };

    // ── Step 2: Generate ZK Proof (client-side) ───────────────────────────────
    const handleGenerateProof = async () => {
        if (!validate()) return;
        setIsGeneratingProof(true);
        try {
            const { generateDriverProof } = await import('@/lib/zk/prover');

            const result = await generateDriverProof({
                licenseNumber: licenseNumber.trim(),
                birthYear: parseInt(birthYear),
            });

            setZkProof(result.proof);
            setZkPublicSignals(result.publicSignals);
            setZkCommitment(result.commitment);
            setStep('proof');

            toast({
                title: '🔐 ZK Proof Generated!',
                description: 'Your credentials were verified locally. Zero data was sent to the server.',
                duration: 4000,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Proof generation failed';
            toast({ title: 'Proof Failed', description: msg, variant: 'destructive' });
        } finally {
            setIsGeneratingProof(false);
        }
    };

    // ── Step 3: Send proof to server, mint badge ──────────────────────────────
    const handleMint = async () => {
        if (!zkProof || !zkPublicSignals) return;
        setIsMinting(true);
        try {
            const res = await fetch('/api/solana/verify-driver', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driverId: driver.id,
                    driverName: driver.name,
                    vehicleType: driver.vehicleType,
                    driverWalletAddress: walletAddress.trim(),
                    zkProof,
                    zkPublicSignals,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Verification failed');

            toast({
                title: '🎉 Blockchain Verification Complete!',
                description: `ZK-verified badge minted. Commitment anchored on Solana.`,
                duration: 6000,
            });

            onVerificationSuccess();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Minting failed';
            toast({ title: 'Minting Failed', description: msg, variant: 'destructive' });
        } finally {
            setIsMinting(false);
        }
    };

    // ── Already verified ──────────────────────────────────────────────────────
    if (driver.verificationBadge) {
        const badge = driver.verificationBadge;
        return (
            <div className="space-y-3">
                {/* Shield + title */}
                <div className="flex items-center gap-4">
                    {/* Rotating shield SVG */}
                    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                        <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(16,185,129,0.08)' }} />
                        <svg viewBox="0 0 56 56" className="w-14 h-14 absolute">
                            <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(16,185,129,0.3)" strokeWidth="1"
                                strokeDasharray="6 3">
                                <animateTransform attributeName="transform" type="rotate"
                                    from="0 28 28" to="360 28 28" dur="6s" repeatCount="indefinite" />
                            </circle>
                        </svg>
                        <ShieldCheck className="w-7 h-7 text-emerald-400 relative z-10" />
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm">ZK Civic Identity Verified</p>
                        <p className="text-[11px] text-emerald-400/80 mt-0.5">Groth16 ZK-SNARK · Soulbound Badge</p>
                    </div>
                </div>

                {/* Data cards — deep-sea blue gradient */}
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: 'Age ≥ 21', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                        { label: 'License Valid', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                    ].map(item => (
                        <div key={item.label}
                            className="flex items-center gap-2 px-3 py-3 rounded-xl border border-blue-500/20"
                            style={{
                                background: 'linear-gradient(135deg, rgba(30,58,138,0.4) 0%, rgba(15,23,42,0.9) 100%)',
                                boxShadow: '0 0 12px rgba(59,130,246,0.08)',
                            }}
                        >
                            <span className="text-emerald-400">{item.icon}</span>
                            <span className="text-xs text-blue-200 font-semibold">{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* ZK Commitment — terminal green */}
                {badge.zkCommitment && (
                    <div className="rounded-xl p-3 border border-slate-800"
                        style={{ background: '#060e0a' }}>
                        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">ZK Commitment · On-Chain</p>
                        <p className="font-mono text-[11px] break-all"
                            style={{ color: '#4ade80', textShadow: '0 0 8px rgba(74,222,128,0.5)' }}>
                            {formatCommitment(badge.zkCommitment)}
                        </p>
                    </div>
                )}

                <a href={badge.explorerLink} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    <ExternalLink className="w-3 h-3" /> View Soulbound Badge on Explorer
                </a>
            </div>
        );
    }

    const steps = [
        { id: 'credentials', label: '1. Credentials' },
        { id: 'proof', label: '2. ZK Proof' },
        { id: 'mint', label: '3. Mint Badge' },
    ];

    return (
        <Card className="border-slate-800/60" style={{ background: 'rgba(11,14,20,0.9)' }}>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    {/* Spinning shield icon */}
                    <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 40 40" className="w-10 h-10 absolute">
                            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth="1" strokeDasharray="4 2">
                                <animateTransform attributeName="transform" type="rotate"
                                    from="0 20 20" to="360 20 20" dur="5s" repeatCount="indefinite" />
                            </circle>
                        </svg>
                        <Lock className="w-5 h-5 text-blue-400 relative z-10" />
                    </div>
                    <div>
                        <CardTitle className="text-base font-bold text-white">ZK Civic Identity</CardTitle>
                        <CardDescription className="text-slate-500 text-xs">
                            Prove eligibility without revealing personal data
                        </CardDescription>
                    </div>
                </div>

                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-800/60">
                    {steps.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-1 flex-1">
                            <div className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-all ${step === s.id
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : (steps.findIndex(x => x.id === step) > i)
                                    ? 'text-emerald-400'
                                    : 'text-slate-600'
                                }`}>
                                {steps.findIndex(x => x.id === step) > i ? '✓ ' : ''}{s.label}
                            </div>
                            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />}
                        </div>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {step === 'credentials' && (
                    <>
                        <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
                            <p className="text-xs text-blue-300 flex items-start gap-2">
                                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>
                                    Your license and birth year <strong>never leave this device</strong>.
                                </span>
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400">License Number (Private)</label>
                            <div className="relative">
                                <input
                                    type={showLicense ? 'text' : 'password'}
                                    value={licenseNumber}
                                    onChange={e => { setLicenseNumber(e.target.value); setErrors(prev => ({ ...prev, license: '' })); }}
                                    placeholder="e.g. BA-12-PA-3456"
                                    className={`w-full bg-slate-800/70 border rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 transition-all ${errors.license ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700 focus:ring-blue-500/30'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowLicense(!showLicense)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                >
                                    {showLicense ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {errors.license && <p className="text-xs text-red-400">{errors.license}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400">Birth Year (Private — proves age ≥ 21)</label>
                            <input
                                type="number"
                                value={birthYear}
                                onChange={e => { setBirthYear(e.target.value); setErrors(prev => ({ ...prev, birthYear: '' })); }}
                                placeholder="e.g. 1995"
                                min={1920}
                                max={2005}
                                className={`w-full bg-slate-800/70 border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 transition-all ${errors.birthYear ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700 focus:ring-blue-500/30'}`}
                            />
                            {errors.birthYear && <p className="text-xs text-red-400">{errors.birthYear}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                <Wallet className="w-3.5 h-3.5" /> Phantom Wallet (Devnet)
                            </label>
                            <input
                                type="text"
                                value={walletAddress}
                                onChange={e => { setWalletAddress(e.target.value); setErrors(prev => ({ ...prev, wallet: '' })); }}
                                placeholder="Solana Wallet Address"
                                className={`w-full bg-slate-800/70 border rounded-lg px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 transition-all ${errors.wallet ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700 focus:ring-blue-500/30'}`}
                            />
                            {errors.wallet && <p className="text-xs text-red-400">{errors.wallet}</p>}
                        </div>

                        <Button
                            onClick={handleGenerateProof}
                            disabled={isGeneratingProof}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold"
                        >
                            {isGeneratingProof ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating ZK Proof...</>
                            ) : (
                                <><Lock className="w-4 h-4 mr-2" /> Generate ZK Proof</>
                            )}
                        </Button>
                    </>
                )}

                {step === 'proof' && (
                    <>
                        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                <p className="text-sm font-bold text-emerald-300">ZK Proof Generated!</p>
                            </div>
                            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Your ZK Commitment</p>
                                <p className="font-mono text-[11px] text-blue-300 break-all">{formatCommitment(zkCommitment)}</p>
                            </div>
                        </div>

                        <Button
                            onClick={() => setStep('mint')}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-semibold"
                        >
                            Continue to Mint Badge <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </>
                )}

                {step === 'mint' && (
                    <>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 space-y-3">
                            <p className="text-xs text-slate-400">
                                The ZK proof will be verified server-side. If valid, a soulbound badge is minted to your wallet.
                            </p>
                        </div>

                        <Button
                            onClick={handleMint}
                            disabled={isMinting}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold"
                        >
                            {isMinting ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Minting...</>
                            ) : (
                                <><Shield className="w-4 h-4 mr-2" /> Mint Verified Badge</>
                            )}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}