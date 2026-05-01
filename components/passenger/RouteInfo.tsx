'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { MapPin, Clock, Users, ChevronRight } from 'lucide-react';

interface RouteInfoProps {
	route: typeof ROUTES[0];
	onRouteChange: (route: typeof ROUTES[0]) => void;
}

export default function RouteInfo({ route, onRouteChange }: RouteInfoProps) {
	const [estimatedDuration, setEstimatedDuration] = useState('Calculating...');
	const [activeBuses, setActiveBuses] = useState(0);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setEstimatedDuration(`${Math.floor(Math.random() * 60) + 30} minutes`);
		setActiveBuses(Math.floor(Math.random() * 5) + 1);
	}, []);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MapPin className="w-5 h-5" />
					Route Information
				</CardTitle>
				<CardDescription>Current route details and stops</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Route Selection */}
				<div className="space-y-2">
					<label className="text-sm font-medium">Select Route</label>
					<div className="flex flex-wrap gap-2">
						{ROUTES.map((routeOption) => (
							<Button
								key={routeOption.name}
								variant={route.name === routeOption.name ? 'default' : 'outline'}
								size="sm"
								onClick={() => onRouteChange(routeOption)}
								className="text-xs"
							>
								{routeOption.name}
							</Button>
						))}
					</div>
				</div>

				{/* Route Stats */}
				<div className="grid grid-cols-2 gap-3">
					<div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
						<div className="flex items-center gap-2">
							<Clock className="w-4 h-4 text-blue-600" />
							<span className="text-sm text-slate-600">Duration</span>
						</div>
						<p className="font-bold text-lg mt-1 text-slate-900">{estimatedDuration}</p>
					</div>
					<div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
						<div className="flex items-center gap-2">
							<Users className="w-4 h-4 text-emerald-600" />
							<span className="text-sm text-slate-600">Active Buses</span>
						</div>
						<p className="font-bold text-lg mt-1 text-slate-900">{activeBuses}</p>
					</div>
				</div>

				{/* Route Stops */}
				<div className="space-y-3">
					<h4 className="font-medium text-sm">Route Stops:</h4>
					<div className="space-y-2">
						{route.stops.map((stop, index) => (
							<div
								key={index}
								className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-100 rounded-lg"
							>
								<Badge variant="outline" className="shrink-0 font-bold bg-white">
									{index + 1}
								</Badge>
								<div className="flex-1">
									<p className="text-sm font-bold text-slate-900">{stop.name}</p>
									<p className="text-xs text-slate-500">
										{index === 0 ? 'Starting point' : 'Stop'}
									</p>
								</div>
								{index < route.stops.length - 1 && (
									<ChevronRight className="w-4 h-4 text-slate-400" />
								)}
							</div>
						))}
					</div>
				</div>

				{/* Additional Info */}
				<div className="pt-3 border-t border-slate-100">
					<div className="flex items-center justify-between text-sm">
						<span className="text-slate-600">Fare Range:</span>
						<span className="font-bold text-slate-900">रु 50 - रु 150</span>
					</div>
					<div className="flex items-center justify-between text-sm mt-2">
						<span className="text-slate-600">Frequency:</span>
						<span className="font-bold text-slate-900">Every 15-20 mins</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
