import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bus, Driver } from '@/lib/types';
import { X, Navigation } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { haversineDistance } from '@/lib/utils/geofencing';
import { getDriverReputation, DriverRepData } from '@/lib/solana/trrl';

interface BookingPanelProps {
	pickupLocation: { lat: number; lng: number; address?: string } | null;
	dropoffLocation: { lat: number; lng: number; address?: string } | null;
	selectedBus: Bus | null;
	onBook: (bus: Bus, bookingData: {
		passengerName: string;
		phoneNumber: string;
		numberOfPassengers: number;
		paymentMethod: 'cash';
		status: 'hailing' | 'pending';
	}) => void;
	onReset: () => void;
	loading?: boolean;
}

export default function BookingPanel({
	pickupLocation,
	selectedBus,
	onBook,
	onReset,
	loading = false,
}: BookingPanelProps) {
	const [passengerName, setPassengerName] = useState('');
	const [phoneNumber, setPhoneNumber] = useState('');
	const [numberOfPassengers, setNumberOfPassengers] = useState(1);
	const [validationErrors, setValidationErrors] = useState<{
		name?: string;
		phone?: string;
		passengers?: string;
	}>({});
	const { toast } = useToast();
	const [driverRep, setDriverRep] = useState<DriverRepData | null>(null);
	const selectedRideBus = selectedBus as (Bus & { verificationBadge?: Driver['verificationBadge'] }) | null;

	// Fetch reputation when bus is selected
	useEffect(() => {
		if (selectedBus?.id) {
			getDriverReputation(selectedBus.id).then(setDriverRep).catch(console.error);
		} else {
			queueMicrotask(() => setDriverRep(null));
		}
	}, [selectedBus?.id]);

	const seatsUnavailable =
		!!selectedBus && (selectedBus.availableSeats ?? 0) <= 0;

	const requestedTooManySeats =
		!!selectedBus && numberOfPassengers > (selectedBus.availableSeats ?? 0);

	const busToPickupDistance = useMemo(() => {
		if (!selectedBus || !selectedBus.currentLocation || !pickupLocation) return null;

		return haversineDistance(
			selectedBus.currentLocation.lat,
			selectedBus.currentLocation.lng,
			pickupLocation.lat,
			pickupLocation.lng
		);
	}, [selectedBus, pickupLocation]);

	const handleBooking = (isHail: boolean = false) => {
		const errors: typeof validationErrors = {};

		if (!selectedBus) {
			toast({
				title: 'Select a bus first',
				description: 'Tap on a bus icon on the map to choose your bus.',
				variant: 'destructive',
			});
			return;
		}

		if (!pickupLocation) {
			toast({
				title: 'Location needed',
				description: 'Please wait for location or select on map.',
				variant: 'destructive',
			});
			return;
		}

		// For hailing, we can skip dropoff if not set
		// For full booking, we might want it, but let's be flexible for "hailing"

		if (!isHail) {
			if (!passengerName) errors.name = 'Name is required';
			if (!phoneNumber) errors.phone = 'Phone number is required';
		}

		if (requestedTooManySeats) {
			errors.passengers = `Only ${selectedBus?.availableSeats} seats available`;
		}

		setValidationErrors(errors);

		if (Object.keys(errors).length > 0) {
			return;
		}

		onBook(selectedBus, {
			passengerName: passengerName || 'Guest Passenger',
			phoneNumber: phoneNumber || 'N/A',
			numberOfPassengers,
			paymentMethod: 'cash',
			status: isHail ? 'hailing' : 'pending' // Differentiate hail vs book if needed, or just use pending
		});

		// Reset form
		if (!isHail) {
			setPassengerName('');
			setPhoneNumber('');
			setNumberOfPassengers(1);
		}
	};

	return (
		<Card className="bg-white border-slate-200 shadow-xl overflow-hidden">
			<CardHeader className="pb-4 bg-slate-50 border-b border-slate-200">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
							<Navigation className="w-5 h-5 text-emerald-400" />
						</div>
						<div>
							<CardTitle className="text-lg font-bold text-slate-900">Ride Request</CardTitle>
							<CardDescription className="text-slate-600 mt-1 flex flex-col gap-1">
								{selectedBus ? (
									<>
										<span>Bus {selectedBus.busNumber} Selected</span>
										<div className="flex items-center gap-2 mt-1">
											{selectedRideBus?.verificationBadge && (
												<span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-semibold w-fit border border-emerald-200">
													<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
													ZK Verified
												</span>
											)}
											{driverRep && (
												<span className="inline-flex items-center gap-1.5 text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full text-xs font-black w-fit border border-yellow-200">
													⭐ Score: {driverRep.score || 0}/1000
												</span>
											)}
										</div>
									</>
								) : 'Select a bus to hail'}
							</CardDescription>
						</div>
					</div>
					{selectedBus && (
						<Button
							variant="ghost"
							size="icon"
							onClick={onReset}
							className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900"
						>
							<X className="w-4 h-4" />
							<span className="sr-only">Cancel Selection</span>
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-6 pt-6">
				{/* Selected Bus Info & Hail Button */}
				{selectedBus ? (
					<div className="space-y-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
						{/* Quick Info */}
						<div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
							<div>
								<p className="text-xs text-slate-600 uppercase font-bold">ETA</p>
								<p className="text-lg font-bold text-emerald-600">
									{busToPickupDistance && busToPickupDistance < 1000
										? `${Math.round(busToPickupDistance)}m`
										: busToPickupDistance
											? `${(busToPickupDistance / 1000).toFixed(1)}km`
											: '--'}
								</p>
							</div>
							<div className="text-right">
								<p className="text-xs text-slate-600 uppercase font-bold">Seats</p>
								<p className="text-lg font-bold text-slate-900">{selectedBus.availableSeats}</p>
							</div>
						</div>

						{/* Optional Details Accordion */}
						<details className="group">
							<summary className="flex items-center justify-center gap-2 text-xs font-black text-slate-500 cursor-pointer hover:text-orange-600 transition-colors py-2 uppercase tracking-widest">
								<span>BOOK Now</span>
								<div className="w-4 h-4 transition-transform group-open:rotate-180">▼</div>
							</summary>
							<div className="pt-4 space-y-4 border-t border-slate-200 mt-2">
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="name" className="text-xs font-bold text-slate-600 uppercase tracking-wider">Name</Label>
										<Input
											id="name"
											placeholder="Your Name"
											value={passengerName}
											onChange={(e) => setPassengerName(e.target.value)}
											className={`bg-white border-slate-200 text-slate-900 h-10 ${validationErrors.name ? 'border-red-500' : ''}`}
										/>
										{validationErrors.name && <p className="text-xs text-red-500">{validationErrors.name}</p>}
									</div>
									<div className="space-y-2">
										<Label htmlFor="phone" className="text-xs font-bold text-slate-600 uppercase tracking-wider">Phone</Label>
										<Input
											id="phone"
											type="tel"
											placeholder="Phone Number"
											value={phoneNumber}
											onChange={(e) => setPhoneNumber(e.target.value)}
											className={`bg-white border-slate-200 text-slate-900 h-10 ${validationErrors.phone ? 'border-red-500' : ''}`}
										/>
										{validationErrors.phone && <p className="text-xs text-red-500">{validationErrors.phone}</p>}
									</div>
								</div>
								<div className="space-y-2">
									<Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Passengers</Label>
									<div className="flex flex-wrap gap-2">
										{Array.from({ length: 5 }).map((_, idx) => (
											<Button
												key={idx + 1}
												type="button"
												size="sm"
												variant={idx + 1 === numberOfPassengers ? 'default' : 'outline'}
												className={`h-8 w-8 p-0 font-black ${idx + 1 === numberOfPassengers ? 'bg-blue-600' : 'bg-white border-slate-200 text-slate-600'}`}
												onClick={() => setNumberOfPassengers(idx + 1)}
											>
												{idx + 1}
											</Button>
										))}
									</div>
								</div>

								<Button
									className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 mt-2"
									onClick={() => handleBooking(false)}
									disabled={loading || seatsUnavailable}
								>
									{loading ? 'Processing...' : 'Confirm Booking'}
								</Button>
							</div>
						</details>
					</div>
				) : (
					/* Empty State */
					<div className="text-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-orange-50">
						<div className="w-12 h-12 rounded-full bg-white border border-slate-100 flex items-center justify-center mx-auto mb-3">
							<Navigation className="w-6 h-6 text-slate-400" />
						</div>
						<p className="text-slate-600 font-medium mb-2">Select a Bus</p>
						<p className="text-xs text-slate-600 max-w-[200px] mx-auto">
							Tap any bus on the map to hail it instantly.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
