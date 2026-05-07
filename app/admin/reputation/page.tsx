'use client';

import { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ShieldCheck, ShieldAlert, Star, Activity, Car, Award } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { DriverReputationView } from '@/lib/sdk';

export default function AdminReputationPage() {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchType, setSearchType] = useState<'driverId' | 'pubkey'>('driverId');
    const [loading, setLoading] = useState(false);
    const [reputation, setReputation] = useState<DriverReputationView | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setLoading(true);
        try {
            const url = new URL('/api/admin/reputation', window.location.origin);
            url.searchParams.set(searchType, searchQuery.trim());

            const response = await fetch(url.toString());
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch reputation');
            }

            setReputation(data.reputation);
        } catch (error: any) {
            toast({
                title: 'Lookup Failed',
                description: error.message,
                variant: 'destructive'
            });
            setReputation(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-8 max-w-5xl mx-auto">
                <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">Driver Reputation</h1>
                    <p className="text-muted-foreground">Lookup on-chain TRRL metrics and ZK identity verification status.</p>
                </div>

                {/* Search Panel */}
                <div className="bg-surface-soft border border-border rounded-xl p-6 shadow-sm">
                    <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                                Search By
                            </label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={searchType === 'driverId' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('driverId')}
                                    className={`flex-1 ${searchType === 'driverId' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}`}
                                >
                                    Driver ID
                                </Button>
                                <Button
                                    type="button"
                                    variant={searchType === 'pubkey' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('pubkey')}
                                    className={`flex-1 ${searchType === 'pubkey' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}`}
                                >
                                    Solana Pubkey
                                </Button>
                            </div>
                        </div>
                        <div className="flex-[2]">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                                Identifier
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder={searchType === 'driverId' ? 'Enter Firebase UID' : 'Enter Wallet Address'}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-card h-10 border-border"
                                />
                                <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold h-10">
                                    <Search className="w-4 h-4 mr-2" />
                                    {loading ? 'Searching...' : 'Search'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Results Panel */}
                {reputation && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-border bg-surface-soft flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold text-foreground mb-1">Driver: {reputation.driverId}</h2>
                                <p className="text-sm text-muted-foreground font-mono">{reputation.driverPubkey || 'No Wallet Linked'}</p>
                            </div>
                            {reputation.zkVerified ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-black text-blue-700 tracking-widest uppercase">
                                    <ShieldCheck className="w-4 h-4" /> ZK Verified
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-black text-red-700 tracking-widest uppercase">
                                    <ShieldAlert className="w-4 h-4" /> Unverified Identity
                                </span>
                            )}
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Score Card */}
                            <div className="bg-surface-soft border border-border rounded-xl p-5 flex flex-col justify-center items-center text-center">
                                <Award className="w-8 h-8 text-yellow-500 mb-2" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">TRRL Score</span>
                                <div className="text-4xl font-black text-foreground">{reputation.score || 0}</div>
                            </div>

                            {/* Trips Card */}
                            <div className="bg-surface-soft border border-border rounded-xl p-5 flex flex-col justify-center items-center text-center">
                                <Car className="w-8 h-8 text-cyan-500 mb-2" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Trips</span>
                                <div className="text-4xl font-black text-foreground">{reputation.totalTrips || 0}</div>
                            </div>

                            {/* Completion Card */}
                            <div className="bg-surface-soft border border-border rounded-xl p-5 flex flex-col justify-center items-center text-center">
                                <Activity className="w-8 h-8 text-emerald-500 mb-2" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Completion</span>
                                <div className="text-4xl font-black text-foreground">
                                    {reputation.totalTrips > 0 ? Math.round((reputation.completedTrips / reputation.totalTrips) * 100) : 0}%
                                </div>
                            </div>

                            {/* Rating Card */}
                            <div className="bg-surface-soft border border-border rounded-xl p-5 flex flex-col justify-center items-center text-center">
                                <Star className="w-8 h-8 text-purple-500 mb-2" />
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Avg Rating</span>
                                <div className="text-4xl font-black text-foreground">
                                    {reputation.avgRatingX100 ? (reputation.avgRatingX100 / 100).toFixed(1) : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {reputation.reputationPDA && (
                            <div className="p-6 border-t border-border bg-surface-soft">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Blockchain Anchors</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
                                        <span className="text-sm font-medium text-muted-foreground">Reputation PDA</span>
                                        <span className="text-sm font-mono text-cyan-600">{reputation.reputationPDA}</span>
                                    </div>
                                    {reputation.lastSolanaTx && (
                                        <div className="flex justify-between items-center bg-card p-3 rounded-lg border border-border">
                                            <span className="text-sm font-medium text-muted-foreground">Last Anchor TX</span>
                                            <a 
                                                href={`https://solscan.io/tx/${reputation.lastSolanaTx}?cluster=devnet`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="text-sm font-mono text-cyan-600 hover:underline"
                                            >
                                                {reputation.lastSolanaTx.slice(0, 16)}...
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
