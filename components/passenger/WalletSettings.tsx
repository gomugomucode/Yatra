'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, CheckCircle2, CreditCard, Link2, Wallet } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';

function truncateAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function WalletSettings() {
    const { currentUser, userData } = useAuth();
    const { toast } = useToast();
    const { publicKey, connected, connect, select, signMessage, wallets } = useWallet();
    const [isVerifying, setIsVerifying] = useState(false);

    const verifiedWallet = userData?.walletAddress || userData?.solanaWallet || '';
    const walletVerifiedAt = userData?.walletVerifiedAt;
    const connectedWallet = publicKey?.toBase58() || '';
    const isWalletMissing = !verifiedWallet;
    const isVerifiedConnectedWallet = !!connectedWallet && connectedWallet === verifiedWallet;
    const phantomWalletName = useMemo(
        () => wallets.find((entry) => entry.adapter.name.toLowerCase().includes('phantom'))?.adapter.name,
        [wallets]
    );

    const handleConnect = async () => {
        try {
            if (!connected && phantomWalletName) {
                select(phantomWalletName);
            }
            await connect();
        } catch (error) {
            console.error('Wallet connect failed:', error);
            toast({
                variant: 'destructive',
                title: 'Wallet connection failed',
                description: 'Please open Phantom and try again.',
            });
        }
    };

    const handleVerify = async () => {
        if (!currentUser) return;
        if (!publicKey || !connected) {
            toast({
                variant: 'destructive',
                title: 'Connect a wallet first',
                description: 'Connect Phantom to verify wallet ownership.',
            });
            return;
        }
        if (!signMessage) {
            toast({
                variant: 'destructive',
                title: 'Signing unavailable',
                description: 'This wallet does not support message signing.',
            });
            return;
        }

        setIsVerifying(true);
        try {
            const nonceResponse = await fetch('/api/auth/verify-wallet');
            const noncePayload = await nonceResponse.json();

            if (!nonceResponse.ok || !noncePayload.nonce) {
                throw new Error(noncePayload.error || 'Failed to fetch wallet nonce');
            }

            const messageBytes = new TextEncoder().encode(noncePayload.nonce);
            const signature = await signMessage(messageBytes);

            const verifyResponse = await fetch('/api/auth/verify-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: publicKey.toBase58(),
                    nonce: noncePayload.nonce,
                    signature: Array.from(signature),
                }),
            });
            const verifyPayload = await verifyResponse.json();

            if (!verifyResponse.ok) {
                throw new Error(verifyPayload.error || 'Failed to verify wallet signature');
            }

            toast({
                title: 'Wallet verified',
                description: 'Your passenger wallet is now linked for trip receipt NFTs.',
            });
        } catch (error) {
            console.error('Error verifying wallet:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to verify wallet. Please try again.',
            });
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="space-y-4 mb-6">
            {isWalletMissing && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-yellow-500">Missing Solana Wallet</h4>
                        <p className="text-xs text-yellow-400/80 mt-1">
                            Connect and verify a wallet below to receive Trip Ticket NFTs for your completed rides.
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl space-y-3">
                <Label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-cyan-400" />
                    Passenger Wallet
                </Label>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <Wallet className="w-4 h-4 text-cyan-400 shrink-0" />
                            <span className="text-sm text-slate-200 truncate">
                                {connectedWallet
                                    ? `Connected: ${truncateAddress(connectedWallet)}`
                                    : verifiedWallet
                                        ? `Verified: ${truncateAddress(verifiedWallet)}`
                                        : 'No wallet connected'}
                            </span>
                        </div>
                        {isVerifiedConnectedWallet && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verified
                            </span>
                        )}
                    </div>
                    {walletVerifiedAt && (
                        <p className="text-xs text-slate-500">
                            Verified on {new Date(walletVerifiedAt).toLocaleString()}
                        </p>
                    )}
                    {!verifiedWallet && (
                        <p className="text-xs text-slate-500">
                            Connect a wallet to receive your trip receipt NFT after dropoff.
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={handleConnect}
                        className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                    >
                        <Link2 className="w-4 h-4 mr-2" />
                        {connected ? 'Wallet Connected' : 'Connect Phantom'}
                    </Button>
                    <Button
                        onClick={handleVerify}
                        disabled={isVerifying || !connected}
                        className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-semibold"
                    >
                        {isVerifying ? 'Verifying...' : 'Verify Wallet'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
