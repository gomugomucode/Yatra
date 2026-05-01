'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Passenger, Bus } from '@/lib/types';
import { User, MapPin, Clock, CheckCircle, XCircle, Navigation } from 'lucide-react';
import { haversineDistance } from '@/lib/utils/geofencing';

interface PassengerListProps {
	passengers: Passenger[];
	selectedBus?: Bus | null;
	onPassengerPickup: (passengerId: string) => void;
	onPassengerDropoff: (passengerId: string) => void;
}

export default function PassengerList({
	passengers,
	selectedBus,
	onPassengerPickup,
	onPassengerDropoff,
}: PassengerListProps) {
	// Calculate distance & sort
	const passengersWithDistance = passengers.map(p => {
		if (!selectedBus?.currentLocation) return { ...p, distanceToPickup: null };
		const d = haversineDistance(
			selectedBus.currentLocation.lat,
			selectedBus.currentLocation.lng,
			p.pickupLocation.lat,
			p.pickupLocation.lng
		);
		return { ...p, distanceToPickup: d };
	});

	const sortedPassengers = [...passengersWithDistance].sort((a, b) => {
		if (a.status === 'waiting' && b.status !== 'waiting') return -1;
		if (a.status !== 'waiting' && b.status === 'waiting') return 1;
		return (a.distanceToPickup ?? Infinity) - (b.distanceToPickup ?? Infinity);
	});

	const waiting = sortedPassengers.filter(p => p.status === 'waiting').length;
	const onBoard = sortedPassengers.filter(p => p.status === 'picked').length;
	const dropped = sortedPassengers.filter(p => p.status === 'dropped').length;

	// Revenue color shifts cyan → emerald as count grows
	const revenue = passengers.length * 75;
	const revenueColor = revenue === 0
		? '#22d3ee'
		: revenue < 300
			? '#06b6d4'
			: revenue < 600
				? '#10b981'
				: '#059669';
	const revenueGlow = revenue === 0
		? 'none'
		: `0 0 ${Math.min(6 + passengers.length * 2, 20)}px ${revenueColor}80`;

	const getStatusBadge = (status: Passenger['status']) => {
		switch (status) {
			case 'waiting': return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[10px]">Waiting</Badge>;
			case 'picked': return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">On Board</Badge>;
			case 'dropped': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Dropped</Badge>;
		}
	};

	const getAvatarFallback = (name: string) =>
		name.split(' ').map(n => n[0]).join('').toUpperCase();

	return (
		<div className="space-y-4">
			{/* Stats row */}
			<div className="grid grid-cols-3 gap-2">
				{[
					{ label: 'Waiting', count: waiting, color: '#b45309', bg: '#fffbeb', border: '#fef3c7' },
					{ label: 'On Board', count: onBoard, color: '#1d4ed8', bg: '#eff6ff', border: '#dbeafe' },
					{ label: 'Dropped', count: dropped, color: '#047857', bg: '#ecfdf5', border: '#d1fae5' },
				].map(s => (
					<div key={s.label} className="rounded-xl p-3 text-center border"
						style={{ background: s.bg, borderColor: s.border }}>
						<p className="text-2xl font-black" style={{ color: s.color }}>{s.count}</p>
						<p className="text-[10px] uppercase tracking-widest font-bold mt-0.5" style={{ color: s.color, opacity: 0.7 }}>
							{s.label}
						</p>
					</div>
				))}
			</div>

			{/* Passenger Cards — slide-in from right */}
			<div className="space-y-3">
				{sortedPassengers.map((passenger, index) => (
					<div
						key={passenger.id}
						className={`rounded-2xl border p-4 transition-all duration-300 shadow-sm ${passenger.status === 'waiting' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}
						style={{
							animation: `slide-in-right 0.35s ease-out ${index * 60}ms both`,
						}}
					>
						<div className="flex items-start gap-3">
							<Avatar className="w-10 h-10 border-2 shrink-0"
								style={{ borderColor: passenger.status === 'waiting' ? '#eab30840' : '#1e293b' }}>
								<AvatarFallback className="text-xs font-bold"
									style={{ background: '#f8fafc', color: passenger.status === 'waiting' ? '#b45309' : '#475569' }}>
									{getAvatarFallback(passenger.name)}
								</AvatarFallback>
							</Avatar>

							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between mb-1.5">
									<p className="font-bold text-slate-900 text-sm truncate">{passenger.name}</p>
									{getStatusBadge(passenger.status)}
								</div>

								<div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
									{/* Distance */}
									{passenger.distanceToPickup != null && (
										<span className="flex items-center gap-1" style={{
											color: passenger.distanceToPickup < 100 ? '#34d399'
												: passenger.distanceToPickup < 500 ? '#fbbf24' : '#60a5fa'
										}}>
											<Navigation className="w-3 h-3" />
											{passenger.distanceToPickup < 1000
												? `${Math.round(passenger.distanceToPickup)}m`
												: `${(passenger.distanceToPickup / 1000).toFixed(1)}km`}
										</span>
									)}
									{/* Time */}
									<span className="flex items-center gap-1 text-slate-600">
										<Clock className="w-3 h-3" />
										{new Date(passenger.bookingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
									</span>
								</div>
							</div>
						</div>

						{/* Action Buttons — large, tactile */}
						<div className="flex gap-2 mt-3">
							{passenger.status === 'waiting' && (
								<button
									onClick={() => onPassengerPickup(passenger.id)}
									className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl font-black text-sm text-emerald-700 bg-emerald-100 border-2 border-emerald-200 active:scale-95 transition-transform shadow-md shadow-emerald-200/50"
								>
									<CheckCircle className="w-4 h-4" /> Confirm Pickup
								</button>
							)}
							{passenger.status === 'picked' && (
								<button
									onClick={() => onPassengerDropoff(passenger.id)}
									className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl font-black text-sm text-blue-700 bg-blue-100 border-2 border-blue-200 active:scale-95 transition-transform shadow-md shadow-blue-200/50"
								>
									<XCircle className="w-4 h-4" /> Confirm Dropoff
								</button>
							)}
						</div>
					</div>
				))}

				{/* Empty state */}
				{passengers.length === 0 && (
					<div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50/50">
						<div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100 bg-white">
							<User className="w-7 h-7 text-slate-700" />
						</div>
						<p className="text-slate-600 font-semibold text-sm">No passengers yet</p>
						<p className="text-xs text-slate-700 mt-1">Bookings will appear here in real-time</p>
					</div>
				)}
			</div>

			{/* Revenue counter — glows brighter as it grows */}
			{passengers.length > 0 && (
				<div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-100">
					<span className="text-xs text-slate-600 font-semibold uppercase tracking-widest">Est. Revenue</span>
					<span className="font-black text-xl font-mono transition-all duration-700"
						style={{ color: revenueColor, textShadow: revenueGlow }}>
						रु {revenue}
					</span>
				</div>
			)}

			{/* Slide-in animation keyframe */}
			<style jsx global>{`
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
		</div>
	);
}
