'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bus } from '@/lib/types';
import { VEHICLE_TYPE_MAP } from '@/lib/constants';
import { MapPin, Plus, Minus, Cpu } from 'lucide-react';

interface DriverPanelProps {
	bus: Bus;
	onLocationToggle: (enabled: boolean) => void;
	locationEnabled: boolean;
	onAddOfflinePassenger?: () => void;
	onRemoveOfflinePassenger?: () => void;
}

/** Returns an array of seat states for the dot grid */
function buildSeatStates(bus: Bus): ('free' | 'online' | 'offline')[] {
	const total = bus.capacity || 40;
	const online = bus.onlineBookedSeats || 0;
	const offline = bus.offlineOccupiedSeats || 0;
	return Array.from({ length: total }, (_, i) => {
		if (i < online) return 'online';
		if (i < online + offline) return 'offline';
		return 'free';
	});
}

const DOT_COLOR: Record<'free' | 'online' | 'offline', { bg: string; shadow: string }> = {
	free: { bg: '#22c55e', shadow: '0 0 4px rgba(34,197,94,0.6)' },
	online: { bg: '#3b82f6', shadow: '0 0 4px rgba(59,130,246,0.6)' },
	offline: { bg: '#eab308', shadow: '0 0 4px rgba(234,179,8,0.6)' },
};

export default function DriverPanel({
	bus,
	onLocationToggle,
	locationEnabled,
	onAddOfflinePassenger,
	onRemoveOfflinePassenger,
}: DriverPanelProps) {
	const vehicleType = VEHICLE_TYPE_MAP[bus.vehicleType];
	const seatStates = useMemo(() => buildSeatStates(bus), [bus]);

	const free = seatStates.filter(s => s === 'free').length;
	const online = seatStates.filter(s => s === 'online').length;
	const offline = seatStates.filter(s => s === 'offline').length;

	return (
		<div className="space-y-5">
			{/* ── Vehicle ID Card ── */}
			<div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">

				{/* Header bar */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
					<div className="flex items-center gap-2">
						<Cpu className="w-3.5 h-3.5 text-cyan-600" />
						<span className="text-[10px] font-black tracking-widest text-cyan-600 uppercase">Vehicle Status Report</span>
					</div>
					<Badge variant="outline"
						className={`text-[10px] px-2 py-0 font-bold ${bus.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
						{bus.isActive ? 'ACTIVE' : 'INACTIVE'}
					</Badge>
				</div>

				<div className="p-4 space-y-3">
					{/* Vehicle Number — monospace license plate */}
					<div className="flex items-center justify-between">
						<span className="text-xs text-slate-600 uppercase tracking-wider">Plate No.</span>
						<span
							className="font-mono text-base font-bold tracking-widest text-slate-900 px-3 py-1 rounded-lg border border-slate-200 bg-slate-100"
							style={{ letterSpacing: '0.15em' }}
						>
							{bus.busNumber}
						</span>
					</div>

					{vehicleType && (
						<div className="flex items-center justify-between">
							<span className="text-xs text-slate-600 uppercase tracking-wider">Type</span>
							<Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-600 gap-1">
								<span>{vehicleType.icon}</span>
								<span>{vehicleType.name}</span>
							</Badge>
						</div>
					)}

					<div className="flex items-center justify-between">
						<span className="text-xs text-slate-600 uppercase tracking-wider">Route</span>
						<span className="text-sm font-bold text-cyan-700">{bus.route}</span>
					</div>

					<div className="flex items-center justify-between">
						<span className="text-xs text-slate-600 uppercase tracking-wider">Operator</span>
						<span className="text-sm font-bold text-slate-900">{bus.driverName}</span>
					</div>
				</div>
			</div>

			{/* ── Seat Dashboard ── */}
			<div className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-white">
				<p className="text-[10px] font-bold tracking-widest text-slate-600 uppercase">Capacity Dashboard</p>

				{/* Stat counters */}
				<div className="grid grid-cols-3 gap-2">
					{[
						{ label: 'Free', value: free, color: '#059669', bg: '#ecfdf5', border: '#d1fae5' },
						{ label: 'Online', value: online, color: '#1d4ed8', bg: '#eff6ff', border: '#dbeafe' },
						{ label: 'Offline', value: offline, color: '#b45309', bg: '#fffbeb', border: '#fef3c7' },
					].map(stat => (
						<div key={stat.label} className="rounded-xl border p-3 text-center transition-all"
							style={{ background: stat.bg, borderColor: stat.border }}>
							<div className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</div>
							<div className="text-[10px] uppercase tracking-widest mt-0.5 font-bold" style={{ color: stat.color }}>
								{stat.label}
							</div>
						</div>
					))}
				</div>

				{/* Dot Grid */}
				<div className="flex flex-wrap gap-1.5">
					{seatStates.map((state, i) => (
						<div
							key={i}
							className="w-3 h-3 rounded-full transition-all duration-300"
							style={{ background: DOT_COLOR[state].bg, boxShadow: DOT_COLOR[state].shadow }}
						/>
					))}
				</div>

				{/* Legend */}
				<div className="flex items-center gap-4 text-[10px] text-slate-600">
					<span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Free</span>
					<span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Online</span>
					<span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Offline</span>
				</div>

				{/* Add / Remove Buttons — 3D pressed style */}
				<div className="flex gap-3">
					<button
						onClick={onAddOfflinePassenger}
						disabled={!onAddOfflinePassenger}
						className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl text-sm font-black text-emerald-700 bg-emerald-50 border-2 border-emerald-100 transition-all active:scale-95 disabled:opacity-30 shadow-sm"
					>
						<Plus className="w-4 h-4" /> Add Offline
					</button>
					<button
						onClick={onRemoveOfflinePassenger}
						disabled={!onRemoveOfflinePassenger || offline === 0}
						className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl text-sm font-black text-red-700 bg-red-50 border-2 border-red-100 transition-all active:scale-95 disabled:opacity-30 shadow-sm"
					>
						<Minus className="w-4 h-4" /> Remove
					</button>
				</div>
			</div>

			{/* ── Location Sharing ── */}
			<div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-cyan-100 bg-cyan-50/30">
				<div className="flex items-center gap-3">
					<MapPin className={`w-4 h-4 ${locationEnabled ? 'text-cyan-600' : 'text-slate-400'}`} />
					<span className="text-sm text-slate-600 font-bold">Share Location</span>
				</div>
				<Switch checked={locationEnabled} onCheckedChange={onLocationToggle}
					className="data-[state=checked]:bg-cyan-500" />
			</div>
		</div>
	);
}
