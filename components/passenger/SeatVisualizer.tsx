'use client';

import React from 'react';
import { Bus } from '@/lib/types';
import { formatTimeAgo } from '@/lib/seatManagement';

interface SeatVisualizerProps {
    bus: Bus;
    compact?: boolean;
}

export default function SeatVisualizer({ bus, compact = false }: SeatVisualizerProps) {
    // Generate seat grid representation
    const generateSeatGrid = () => {
        const seats = [];
        const total = bus.capacity;
        const onlineBooked = bus.onlineBookedSeats || 0;
        const offlineOccupied = bus.offlineOccupiedSeats || 0;
        const available = bus.availableSeats || 0;

        // Add online booked seats (blue)
        for (let i = 0; i < onlineBooked; i++) {
            seats.push({ type: 'online', emoji: '🟦' });
        }

        // Add offline occupied seats (yellow)
        for (let i = 0; i < offlineOccupied; i++) {
            seats.push({ type: 'offline', emoji: '🟨' });
        }

        // Add available seats (white/empty)
        for (let i = 0; i < available; i++) {
            seats.push({ type: 'available', emoji: '⚪' });
        }

        return seats;
    };

    const seats = generateSeatGrid();
    const lastUpdate = bus.lastSeatUpdate ? formatTimeAgo(bus.lastSeatUpdate) : 'Just now';

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-0.5">
                    {seats.map((seat, idx) => (
                        <span key={idx} className="text-xs sm:text-sm">
                            {seat.emoji}
                        </span>
                    ))}
                </div>
                <span className="text-xs text-slate-500 font-medium">
                    {bus.availableSeats}/{bus.capacity}
                </span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Seat Grid */}
            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 shadow-inner">
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 justify-center">
                    {seats.map((seat, idx) => (
                        <div
                            key={idx}
                            className={`h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg text-lg transition-transform hover:scale-110 cursor-default ${seat.type === 'available' ? 'bg-slate-800/50 border border-slate-700 hover:bg-slate-700' : seat.type === 'online' ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-yellow-500/20 border border-yellow-500/30' }`}
                            title={
                                seat.type === 'online'
                                    ? 'Online Booked'
                                    : seat.type === 'offline'
                                        ? 'Offline Occupied'
                                        : 'Available'
                            }
                        >
                            {seat.emoji}
                        </div>
                    ))}
                </div>
            </div>

            {/* Seat Statistics */}
            <div className="grid grid-cols-3 gap-3 text-center text-xs sm:text-sm">
                <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20">
                    <div className="text-2xl font-bold text-blue-400">
                        {bus.onlineBookedSeats || 0}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-blue-300/70 font-semibold mt-1">Online</div>
                </div>
                <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20">
                    <div className="text-2xl font-bold text-yellow-400">
                        {bus.offlineOccupiedSeats || 0}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-yellow-300/70 font-semibold mt-1">Offline</div>
                </div>
                <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
                    <div className="text-2xl font-bold text-emerald-400">
                        {bus.availableSeats || 0}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-300/70 font-semibold mt-1">Available</div>
                </div>
            </div>

            {/* Last Update */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <p>Updated {lastUpdate}</p>
            </div>

            {/* Legend */}
            <div className="border-t border-slate-800 pt-3 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">🟦</span>
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Online</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">🟨</span>
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Offline</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">⚪</span>
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Empty</span>
                </div>
            </div>
        </div>
    );
}
