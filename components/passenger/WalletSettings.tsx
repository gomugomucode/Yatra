'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { CreditCard, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WalletSettings() {
    const { currentUser, userData } = useAuth();
    const { toast } = useToast();
    const { publicKey, signMessage, connected, disconnect } = useWallet();

    const [isVerifying, setIsVerifying] = useState(false);
    const [justVerified, setJustVerified] = useState(false);

    const savedWallet = userData?.solanaWallet;
    const connectedAddress = publicKey?.toBase58();

    // Auto-trigger verification when wallet connects and isn't already saved
    useEffect(() => {
        if (connected && connectedAddress && connectedAddress !== savedWallet) {
            handleVerify();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, connectedAddress]);

    const handleVerify = async () => {
        if (!currentUser || !publicKey || !signMessage) return;

        setIsVerifying(true);
        try {
            // 1. Get a nonce from the server
            const nonceRes = await fetch(`/api/auth/verify-wallet?uid=${currentUser.uid}`);
            if (!nonceRes.ok) throw new Error('Failed to get nonce');
            const { nonce } = await nonceRes.json();

            // 2. Sign the nonce with the connected wallet
            const messageBytes = new TextEncoder().encode(nonce);
            const signatureBytes = await signMessage(messageBytes);
            const signature = Buffer.from(signatureBytes).toString('base64');

            // 3. Send to server for Ed25519 verification
            const verifyRes = await fetch('/api/auth/verify-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: currentUser.uid,
                    walletAddress: publicKey.toBase58(),
                    signature,
                }),
            });

            if (!verifyRes.ok) {
                const data = await verifyRes.json();
                throw new Error(data.error || 'Verification failed');
            }

            setJustVerified(true);
            toast({ title: 'Wallet verified!', description: 'Your Phantom wallet is now linked. Trip NFTs will be sent to it.' });

        } catch (error: any) {
            console.error('[WalletSettings] verify error:', error);
            toast({
                variant: 'destructive',
                title: 'Verification failed',
                description: error.message || 'Please try again.',
            });
        } finally {
            setIsVerifying(false);
        }
    };

    const isVerified = !!savedWallet && (savedWallet === connectedAddress || justVerified);
    const hasUnverifiedConnection = connected && connectedAddress && connectedAddress !== savedWallet && !justVerified;

    return (
        <div className="space-y-4 mb-6">
            {!savedWallet && !connected && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-black text-yellow-700">No wallet linked</h4>
                        <p className="text-xs text-yellow-600 mt-1">
                            Connect your Phantom wallet to receive Trip Ticket NFTs for completed rides.
                        </p>
                    </div>
                </div>
            )}

            {isVerified && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                        <p className="text-xs font-black text-emerald-700">Wallet verified</p>
                        <p className="text-xs text-emerald-600 font-mono mt-0.5">
                            {savedWallet?.slice(0, 6)}...{savedWallet?.slice(-4)}
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    Solana Wallet
                </p>

                <div className="flex flex-col gap-2">
                    {/* Phantom connect button — styled by wallet adapter CSS */}
                    <WalletMultiButton
                        style={{
                            width: '100%',
                            justifyContent: 'center',
                            background: connected ? '#475569' : '#6366f1',
                            borderRadius: '0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: '900',
                            height: '2.75rem',
                        }}
                    />

                    {/* Manual re-verify if wallet changed */}
                    {hasUnverifiedConnection && (
                        <Button
                            onClick={handleVerify}
                            disabled={isVerifying}
                            size="sm"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl"
                        >
                            {isVerifying
                                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
                                : 'Verify ownership'}
                        </Button>
                    )}

                    {connected && savedWallet && savedWallet !== connectedAddress && !justVerified && (
                        <p className="text-xs text-amber-700 font-bold text-center">
                            Connected wallet differs from saved address. Click verify to update.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
