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
					{ label: 'Waiting', count: waiting, color: '#eab308', bg: 'rgba(234,179,8,0.07)', border: 'rgba(234,179,8,0.15)' },
					{ label: 'On Board', count: onBoard, color: '#3b82f6', bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.15)' },
					{ label: 'Dropped', count: dropped, color: '#10b981', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.15)' },
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
						className="rounded-2xl border p-4 transition-all duration-300"
						style={{
							background: passenger.status === 'waiting'
								? 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(11,14,20,0.9) 100%)'
								: 'rgba(11,14,20,0.6)',
							borderColor: passenger.status === 'waiting'
								? 'rgba(234,179,8,0.2)'
								: passenger.status === 'picked'
									? 'rgba(59,130,246,0.15)'
									: 'rgba(15,23,42,0.6)',
							// Slide-in from right via animation delay per card
							animation: `slide-in-right 0.35s ease-out ${index * 60}ms both`,
						}}
					>
						<div className="flex items-start gap-3">
							<Avatar className="w-10 h-10 border-2 shrink-0"
								style={{ borderColor: passenger.status === 'waiting' ? '#eab30840' : '#1e293b' }}>
								<AvatarFallback className="text-xs font-bold"
									style={{ background: '#0f172a', color: passenger.status === 'waiting' ? '#fbbf24' : '#94a3b8' }}>
									{getAvatarFallback(passenger.name)}
								</AvatarFallback>
							</Avatar>

							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between mb-1.5">
									<p className="font-bold text-white text-sm truncate">{passenger.name}</p>
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
									className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl font-bold text-sm text-emerald-300 border border-emerald-600/40 active:scale-95 transition-transform"
									style={{
										background: 'linear-gradient(180deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.08) 100%)',
										boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 0 rgba(0,0,0,0.35)',
									}}
								>
									<CheckCircle className="w-4 h-4" /> Confirm Pickup
								</button>
							)}
							{passenger.status === 'picked' && (
								<button
									onClick={() => onPassengerDropoff(passenger.id)}
									className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl font-bold text-sm text-blue-300 border border-blue-600/40 active:scale-95 transition-transform"
									style={{
										background: 'linear-gradient(180deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.08) 100%)',
										boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 0 rgba(0,0,0,0.35)',
									}}
								>
									<XCircle className="w-4 h-4" /> Confirm Dropoff
								</button>
							)}
						</div>
					</div>
				))}

				{/* Empty state */}
				{passengers.length === 0 && (
					<div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-100/50"
						style={{ background: 'rgba(11,14,20,0.5)' }}>
						<div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100"
							style={{ background: 'rgba(15,23,42,0.8)' }}>
							<User className="w-7 h-7 text-slate-700" />
						</div>
						<p className="text-slate-600 font-semibold text-sm">No passengers yet</p>
						<p className="text-xs text-slate-700 mt-1">Bookings will appear here in real-time</p>
					</div>
				)}
			</div>

			{/* Revenue counter — glows brighter as it grows */}
			{passengers.length > 0 && (
				<div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-100/40"
					style={{ background: 'rgba(11,14,20,0.7)' }}>
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
