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
            className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${hasReceipt ? 'border-purple-200 bg-white shadow-md' : 'border-slate-200 bg-slate-50' }`}
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
                            <p className="font-black text-slate-900 text-sm">{route || 'Trip'}</p>
                            <p className="text-xs text-slate-600 mt-0.5">
                                {typeof timestamp === 'string' || timestamp instanceof Date
                                    ? new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : 'Unknown date'
                                }
                            </p>
                        </div>
                    </div>

                    {/* Fare */}
                    {fare > 0 && (
                        <span className="text-sm font-black text-emerald-600 shrink-0">रु {fare}</span>
                    )}
                </div>

                {/* Receipt Section */}
                {hasReceipt ? (
                    <div className="mt-4 space-y-3">
                        {/* Verified badge */}
                        <div className="flex items-center gap-2">
                            <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-2 py-0.5 font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                                <CheckCircle2 className="w-3 h-3" />
                                Verified on Solana
                            </Badge>
                            <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 text-[10px] px-2 py-0.5 font-black uppercase tracking-widest shadow-sm">
                                Soulbound NFT
                            </Badge>
                        </div>

                        {/* Mint address */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 font-mono text-[11px] text-slate-600 flex items-center justify-between gap-2">
                            <span className="truncate">
                                {receipt.mintAddress.slice(0, 8)}...{receipt.mintAddress.slice(-8)}
                            </span>
                            <Ticket className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        </div>

                        {/* Minted at */}
                        {receipt.mintedAt && (
                            <p className="text-[11px] text-slate-600">
                                Minted: {formatTime(receipt.mintedAt)}
                            </p>
                        )}

                        {/* Explorer button */}
                        <Button
                            onClick={handleOpenExplorer}
                            className="w-full h-10 text-xs font-black bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-md tracking-wide text-white"
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
