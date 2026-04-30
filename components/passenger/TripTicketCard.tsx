'use client';

import { ExternalLink, CheckCircle2, Ticket, Bus, Bike, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Booking } from '@/lib/types';

function getVehicleEmoji(vehicleType?: string): string {
    switch (vehicleType) {
        case 'bus': return '🚌';
        case 'bike': return '🚲';
        case 'taxi': return '🚕';
        default: return '🎫';
    }
}

function formatTime(isoString: string) {
    return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function TripTicketCard({ booking }: { booking: Booking }) {
    const { receipt, route, fare, vehicleType, timestamp } = booking;
    const emoji = getVehicleEmoji(vehicleType);
    const hasReceipt = !!receipt;

    const handleOpenExplorer = () => {
        if (receipt?.explorerLink) {
            window.open(receipt.explorerLink, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${hasReceipt ? 'border-purple-500/30 bg-gradient-to-br from-slate-900 via-purple-950/20 to-slate-900 shadow-lg shadow-purple-500/10' : 'border-slate-800 bg-slate-50/40' }`}
        >
            {/* Decorative ticket-hole strip */}
            {hasReceipt && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 via-blue-500 to-cyan-500" />
            )}

            <div className="p-4 pl-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl" role="img" aria-label="vehicle">{emoji}</span>
                        <div>
                            <p className="font-bold text-white text-sm">{route || 'Trip'}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {typeof timestamp === 'string' || timestamp instanceof Date
                                    ? new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : 'Unknown date'
                                }
                            </p>
                        </div>
                    </div>

                    {/* Fare */}
                    {fare > 0 && (
                        <span className="text-sm font-bold text-emerald-400 shrink-0">रु {fare}</span>
                    )}
                </div>

                {/* Receipt Section */}
                {hasReceipt ? (
                    <div className="mt-4 space-y-3">
                        {/* Verified badge */}
                        <div className="flex items-center gap-2">
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] px-2 py-0.5 font-semibold uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Verified on Solana
                            </Badge>
                            <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px] px-2 py-0.5 uppercase tracking-widest">
                                Soulbound NFT
                            </Badge>
                        </div>

                        {/* Mint address */}
                        <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800 font-mono text-[11px] text-slate-500 flex items-center justify-between gap-2">
                            <span className="truncate">
                                {receipt.mintAddress.slice(0, 8)}...{receipt.mintAddress.slice(-8)}
                            </span>
                            <Ticket className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        </div>

                        {/* Minted at */}
                        {receipt.mintedAt && (
                            <p className="text-[11px] text-slate-500">
                                Minted: {formatTime(receipt.mintedAt)}
                            </p>
                        )}

                        {/* Explorer button */}
                        <Button
                            onClick={handleOpenExplorer}
                            className="w-full h-10 text-xs font-bold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/20 tracking-wide"
                        >
                            <ExternalLink className="w-3.5 h-3.5 mr-2" />
                            ⭐ Blockchain Receipt
                        </Button>
                    </div>
                ) : (
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-600">
                        <Ticket className="w-3.5 h-3.5" />
                        <span>Receipt will appear after dropoff</span>
                    </div>
                )}
            </div>
        </div>
    );
}
