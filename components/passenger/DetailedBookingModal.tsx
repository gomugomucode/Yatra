'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Bus,
    Car,
    Bike,
    CreditCard,
    Banknote,
    Smartphone,
    CheckCircle,
    ArrowRight,
    ArrowLeft,
    Share2,
    ChevronDown,
    MapPin,
    Navigation,
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateFareFromLocations } from '@/lib/utils/fareCalculator';
import { VehicleTypeId } from '@/lib/types';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getDatabase, ref, get } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase';
import { useEffect } from 'react';
import { getRoute } from '@/lib/routing/osrm';


// --- Data ---
const NEPALI_CITIES = [
    { id: 'butwal', name: 'Butwal', lat: 27.7006, lng: 83.4484 },
    { id: 'kathmandu', name: 'Kathmandu', lat: 27.7172, lng: 85.3240 },
    { id: 'pokhara', name: 'Pokhara', lat: 28.2096, lng: 83.9856 },
    { id: 'lalitpur', name: 'Lalitpur', lat: 27.6644, lng: 85.3188 },
    { id: 'bharatpur', name: 'Bharatpur', lat: 27.6744, lng: 84.4300 },
    { id: 'janakpur', name: 'Janakpur', lat: 26.7271, lng: 85.9229 },
    { id: 'biratnagar', name: 'Biratnagar', lat: 26.4525, lng: 87.2717 },
    { id: 'dharan', name: 'Dharan', lat: 26.8126, lng: 87.2831 },
    { id: 'nepalgunj', name: 'Nepalgunj', lat: 28.0500, lng: 81.6167 },
];

const VEHICLE_TYPES = [
    { id: 'bus', name: 'Bus', icon: <Bus className="w-5 h-5" /> },
    { id: 'taxi', name: 'Taxi', icon: <Car className="w-5 h-5" /> },
    { id: 'bike', name: 'Bike', icon: <Bike className="w-5 h-5" /> },
];

const PAYMENT_METHODS = [
    { id: 'esewa', name: 'eSewa', icon: <Smartphone className="w-5 h-5 text-green-500" /> },
    { id: 'khalti', name: 'Khalti', icon: <Smartphone className="w-5 h-5 text-purple-500" /> },
    { id: 'mobile_banking', name: 'Mobile Banking', icon: <CreditCard className="w-5 h-5 text-blue-500" /> },
    { id: 'cash', name: 'Cash on Board', icon: <Banknote className="w-5 h-5 text-emerald-500" /> },
];

interface DetailedBookingModalProps {
    currentLocation?: { lat: number; lng: number; address?: string } | null;
}

export default function DetailedBookingModal({ currentLocation }: DetailedBookingModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { userData } = useAuth();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [originDropdownOpen, setOriginDropdownOpen] = useState(false);
    const [destDropdownOpen, setDestDropdownOpen] = useState(false);

    // Form state
    const [vehicleType, setVehicleType] = useState('bus');
    const [passengers, setPassengers] = useState(1);
    const [origin, setOrigin] = useState(currentLocation ? '__current__' : '');
    const [destination, setDestination] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [osrmDistance, setOsrmDistance] = useState<number | null>(null);
    const [fareLoading, setFareLoading] = useState(false);


    const originCities = currentLocation
        ? [{ id: '__current__', name: currentLocation.address || 'Current Location', lat: currentLocation.lat, lng: currentLocation.lng }, ...NEPALI_CITIES]
        : NEPALI_CITIES;
    const selectedOrigin = originCities.find(c => c.id === origin);
    const selectedDest = NEPALI_CITIES.find(c => c.id === destination);
    const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicleType);
    
    // Async route-based fare calculation
    useEffect(() => {
        if (!selectedOrigin || !selectedDest) {
            setOsrmDistance(null);
            return;
        }

        let isMounted = true;
        setFareLoading(true);

        getRoute(
            selectedOrigin.lat,
            selectedOrigin.lng,
            selectedDest.lat,
            selectedDest.lng
        ).then(route => {
            if (!isMounted) return;
            if (route) {
                setOsrmDistance(route.distance);
            } else {
                setOsrmDistance(null); // Fallback to Haversine handled in utility
            }
            setFareLoading(false);
        }).catch(err => {
            console.error('[BookingModal] Route fetch error:', err);
            if (isMounted) setFareLoading(false);
        });

        return () => { isMounted = false; };
    }, [selectedOrigin?.id, selectedDest?.id]);

    const estimatedTotal = useMemo(() => {
        if (!selectedOrigin || !selectedDest || !selectedVehicle) return 0;
        return calculateFareFromLocations(
            { lat: selectedOrigin.lat, lng: selectedOrigin.lng },
            { lat: selectedDest.lat, lng: selectedDest.lng },
            vehicleType as VehicleTypeId,
            passengers,
            osrmDistance || undefined
        );
    }, [selectedOrigin, selectedDest, vehicleType, passengers, osrmDistance]);


    const handleNext = () => {
        if (step === 1) {
            if (!origin) {
                toast.error('Please select an origin city');
                return;
            }
            if (!destination) {
                toast.error('Please select a destination city');
                return;
            }
            if (origin === destination) {
                toast.error('Origin and destination cannot be the same');
                return;
            }
        }
        setStep(prev => prev + 1);
    };

    const handleBack = () => setStep(prev => prev - 1);

    const handleConfirm = async () => {
        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }
        
        setLoading(true);
        try {
            // Find a bus to assign this booking to (Placeholder: pick first active bus)
            const db = getDatabase(getFirebaseApp());
            const busesSnap = await get(ref(db, 'buses'));
            const buses = busesSnap.exists() ? Object.values(busesSnap.val()) : [];
            const activeBus = (buses as any[]).find(b => b.isActive && b.vehicleType === vehicleType);
            
            if (!activeBus) {
                toast.error(`No active ${vehicleType}s found on this route. Please try later.`);
                setLoading(false);
                return;
            }

            const response = await fetch('/api/bookings/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingData: {
                        busId: activeBus.id,
                        passengerName: userData?.name || 'Quick Passenger',
                        phoneNumber: userData?.phone || 'N/A',
                        pickupLocation: {
                            lat: selectedOrigin!.lat,
                            lng: selectedOrigin!.lng,
                            address: selectedOrigin!.name,
                        },
                        dropoffLocation: {
                            lat: selectedDest!.lat,
                            lng: selectedDest!.lng,
                            address: selectedDest!.name,
                        },
                        numberOfPassengers: passengers,
                        paymentMethod,
                        vehicleType,
                        status: 'pending',
                    }
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create booking');
            }

            toast.success('Booking Confirmed!');
            setStep(4);
        } catch (error: any) {
            console.error('Booking failed:', error);
            toast.error(error.message || 'Booking failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        setTimeout(() => { 
            setStep(1); 
            setOrigin('');
            setDestination(''); 
            setPaymentMethod(''); 
        }, 400);
    };

    const handleShare = async () => {
        const shareText = `I'm traveling from ${selectedOrigin?.name} to ${selectedDest?.name} via Yatra! Track my ride.`;
        if (navigator.share) {
            try { await navigator.share({ title: 'My Yatra Trip', text: shareText, url: window.location.href }); }
            catch { /* ignored */ }
        } else {
            navigator.clipboard.writeText(shareText + ' ' + window.location.href);
            toast.success('Trip details copied to clipboard!');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    className="bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary/90 text-white text-xs font-black shadow-md rounded-xl"
                >
                    <MapPin className="w-3.5 h-3.5 mr-1.5" />
                    Book Ride
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[440px] bg-card border border-border text-foreground rounded-3xl p-6 shadow-2xl">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                        {step === 1 && (<><Navigation className="w-5 h-5 text-primary" /> Select Route</>)}
                        {step === 2 && (<><CreditCard className="w-5 h-5 text-primary" /> Payment Method</>)}
                        {step === 3 && (<><CheckCircle className="w-5 h-5 text-primary" /> Confirm Booking</>)}
                        {step === 4 && (<><CheckCircle className="w-5 h-5 text-emerald-400" /> Booking Confirmed!</>)}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Multi-step ride booking flow for selecting destination, payment method, and confirmation.
                    </DialogDescription>
                </DialogHeader>

                <div>
                    {/* ─── Step 1: Destination & Vehicle ─── */}
                    {step === 1 && (
                        <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">

                            {/* Origin Dropdown */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Where are you now?
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => { setOriginDropdownOpen(o => !o); setDestDropdownOpen(false); }}
                                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left transition-all ${origin ? 'bg-primary-soft border-primary/30 text-primary-hover' : 'bg-surface-soft border-border text-muted-foreground' } hover:border-primary/60 focus:outline-none focus:border-primary`}
                                    >
                                        <span className="flex items-center gap-2 font-medium">
                                            <Navigation className={`w-4 h-4 ${origin ? 'text-primary' : 'text-muted-foreground'}`} />
                                            {selectedOrigin?.name || 'Select origin city...'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${originDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {originDropdownOpen && (
                                        <div className="absolute z-50 mt-2 w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                                            <div className="max-h-52 overflow-y-auto">
                                                {originCities.map((city) => (
                                                    <button
                                                        key={`origin-${city.id}`}
                                                        type="button"
                                                        onClick={() => { setOrigin(city.id); setOriginDropdownOpen(false); }}
                                                        className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${origin === city.id ? 'bg-primary-soft text-primary-hover' : 'text-muted-foreground hover:bg-surface-soft' }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {origin === city.id && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
                                                            {origin !== city.id && <span className="w-3.5 shrink-0" />}
                                                            {city.name}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Destination Dropdown */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                    Where are you going?
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => { setDestDropdownOpen(o => !o); setOriginDropdownOpen(false); }}
                                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left transition-all ${destination ? 'bg-primary-soft border-primary/30 text-primary-hover' : 'bg-surface-soft border-border text-muted-foreground' } hover:border-primary/60 focus:outline-none focus:border-primary`}
                                    >
                                        <span className="flex items-center gap-2 font-medium">
                                            <MapPin className={`w-4 h-4 ${destination ? 'text-primary' : 'text-muted-foreground'}`} />
                                            {selectedDest?.name || 'Select destination city...'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${destDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {destDropdownOpen && (
                                        <div className="absolute z-50 mt-2 w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                                            <div className="max-h-52 overflow-y-auto">
                                                {NEPALI_CITIES.map((city) => (
                                                    <button
                                                        key={`dest-${city.id}`}
                                                        type="button"
                                                        onClick={() => { setDestination(city.id); setDestDropdownOpen(false); }}
                                                        className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${destination === city.id ? 'bg-primary-soft text-primary-hover' : 'text-muted-foreground hover:bg-surface-soft' }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {destination === city.id && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
                                                            {destination !== city.id && <span className="w-3.5 shrink-0" />}
                                                            {city.name}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Vehicle Type */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Vehicle Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {VEHICLE_TYPES.map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => setVehicleType(v.id)}
                                            className={`flex flex-col items-center gap-2 py-3 px-2 rounded-2xl border-2 transition-all ${vehicleType === v.id ? 'border-primary bg-primary-soft text-primary-hover' : 'border-border bg-surface-soft text-muted-foreground hover:border-slate-300' }`}
                                        >
                                            <span>{v.icon}</span>
                                            <span className="text-xs font-bold">{v.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Passengers */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Passengers</label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setPassengers(num)}
                                            className={`flex-1 h-11 min-h-11 rounded-xl text-sm font-black border-2 transition-all ${passengers === num ? 'border-primary bg-primary-soft text-primary-hover' : 'border-border bg-card text-muted-foreground hover:border-slate-300' }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Trip Summary */}
                            <div className="bg-surface-soft rounded-2xl p-4 border border-border space-y-2">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Trip Summary</p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Vehicle</span>
                                    <span className="font-semibold text-foreground capitalize">{selectedVehicle?.name}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Passengers</span>
                                    <span className="font-semibold text-foreground">{passengers}</span>
                                </div>
                                {selectedOrigin && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">From</span>
                                        <span className="font-bold text-foreground">{selectedOrigin.name}</span>
                                    </div>
                                )}
                                {selectedDest && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">To</span>
                                        <span className="font-bold text-primary-hover">{selectedDest.name}</span>
                                    </div>
                                )}
                                <div className="border-t border-border pt-2 flex justify-between items-center mt-1">
                                    <span className="text-sm font-black text-foreground">Estimated Total</span>
                                    <span className={`text-xl font-black ${fareLoading ? 'animate-pulse text-muted-foreground' : 'text-primary-hover'}`}>
                                        रु {fareLoading ? '--' : estimatedTotal}
                                    </span>
                                </div>

                            </div>
                        </div>
                    )}

                    {/* ─── Step 2: Payment ─── */}
                    {step === 2 && (
                        <div className="space-y-3 animate-in slide-in-from-right-4 fade-in duration-300">
                            {PAYMENT_METHODS.map(method => (
                                <button
                                    key={method.id}
                                    type="button"
                                    onClick={() => setPaymentMethod(method.id)}
                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${paymentMethod === method.id ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-slate-300' }`}
                                >
                                    <div className="p-2 rounded-xl bg-surface-soft border border-border">{method.icon}</div>
                                    <div className="flex-1">
                                        <p className="font-black text-foreground text-sm">{method.name}</p>
                                        <p className="text-xs text-muted-foreground">{method.id === 'cash' ? 'Pay directly to driver' : 'Secure digital payment'}</p>
                                    </div>
                                    {paymentMethod === method.id && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                                </button>
                            ))}
                            <div className="bg-primary-soft/60 border border-primary/20 rounded-2xl p-3 text-center mt-2">
                                <p className="text-sm text-primary-hover font-bold">
                                    Total to Pay: <span className="font-black text-lg">रु {estimatedTotal}</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ─── Step 4: Confirmed ─── */}
                    {step === 4 && (
                        <div className="flex flex-col items-center gap-5 py-4 animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-200">
                                <CheckCircle className="w-8 h-8 text-emerald-600" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-black text-foreground">Booking Confirmed!</h3>
                                <p className="text-muted-foreground text-sm mt-1">Your ride from <span className="text-foreground font-bold">{selectedOrigin?.name}</span> to <span className="text-primary-hover font-bold">{selectedDest?.name}</span> is scheduled.</p>
                            </div>
                            <div className="bg-card p-4 rounded-2xl shadow-md border border-border">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=YATRA-${Date.now()}-${selectedOrigin?.id}-${selectedDest?.id}`}
                                    alt="Booking QR Code"
                                    className="w-44 h-44"
                                />
                            </div>
                            <p className="text-center text-muted-foreground text-xs max-w-[200px]">Show this QR code to the driver when boarding.</p>
                            <Button variant="outline" onClick={handleShare} className="w-full border-border text-muted-foreground hover:text-foreground hover:bg-surface-soft rounded-xl font-bold">
                                <Share2 className="w-4 h-4 mr-2" /> Share Trip Details
                            </Button>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-row gap-2 sm:justify-between mt-5">
                    {step > 1 && step < 4 && (
                        <Button variant="ghost" onClick={handleBack} className="flex-1 sm:flex-none text-muted-foreground hover:text-foreground font-bold">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                    )}

                    {step === 1 && (
                        <Button
                            onClick={handleNext}
                            className={`flex-1 h-12 text-sm font-black rounded-2xl text-white transition-all duration-300 ${origin && destination && origin !== destination ? 'bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary/90 shadow-md animate-pulse-subtle' : 'bg-slate-100 text-slate-500 cursor-not-allowed' }`}
                            style={{
                                animation: origin && destination && origin !== destination ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                            }}
                        >
                            Next Step <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}

                    {step === 2 && (
                        <Button
                            onClick={handleConfirm}
                            disabled={loading}
                            className="flex-1 h-12 text-sm font-bold rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-lg shadow-emerald-500/20"
                        >
                            {loading ? 'Processing...' : `Confirm & Pay रु ${estimatedTotal}`}
                        </Button>
                    )}

                    {step === 4 && (
                        <Button onClick={handleClose} className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold">
                            Close
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>

            {/* Pulse glow animation */}
            <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.25); }
          50% { box-shadow: 0 0 0 8px rgba(6, 182, 212, 0); }
        }
      `}</style>
        </Dialog>
    );
}
