'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
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
} from 'lucide-react';
import { toast } from 'sonner';

// --- Data ---
const NEPALI_CITIES = [
    { id: 'butwal', name: 'Butwal', basePrice: 150 },
    { id: 'kathmandu', name: 'Kathmandu', basePrice: 1200 },
    { id: 'pokhara', name: 'Pokhara', basePrice: 800 },
    { id: 'lalitpur', name: 'Lalitpur', basePrice: 1150 },
    { id: 'bharatpur', name: 'Bharatpur', basePrice: 600 },
    { id: 'janakpur', name: 'Janakpur', basePrice: 900 },
    { id: 'biratnagar', name: 'Biratnagar', basePrice: 1500 },
    { id: 'dharan', name: 'Dharan', basePrice: 1400 },
    { id: 'nepalgunj', name: 'Nepalgunj', basePrice: 1100 },
];

const VEHICLE_TYPES = [
    { id: 'bus', name: 'Bus', icon: <Bus className="w-5 h-5" />, multiplier: 1 },
    { id: 'taxi', name: 'Taxi', icon: <Car className="w-5 h-5" />, multiplier: 3 },
    { id: 'bike', name: 'Bike', icon: <Bike className="w-5 h-5" />, multiplier: 0.8 },
];

const PAYMENT_METHODS = [
    { id: 'esewa', name: 'eSewa', icon: <Smartphone className="w-5 h-5 text-green-500" /> },
    { id: 'khalti', name: 'Khalti', icon: <Smartphone className="w-5 h-5 text-purple-500" /> },
    { id: 'mobile_banking', name: 'Mobile Banking', icon: <CreditCard className="w-5 h-5 text-blue-500" /> },
    { id: 'cash', name: 'Cash on Board', icon: <Banknote className="w-5 h-5 text-emerald-500" /> },
];

export default function DetailedBookingModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Form state
    const [vehicleType, setVehicleType] = useState('bus');
    const [passengers, setPassengers] = useState(1);
    const [destination, setDestination] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');

    const selectedCity = NEPALI_CITIES.find(c => c.id === destination);
    const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicleType);
    const estimatedTotal = selectedCity && selectedVehicle
        ? Math.round(selectedCity.basePrice * selectedVehicle.multiplier * passengers)
        : 0;

    const handleNext = () => {
        if (step === 1) {
            if (!destination) {
                toast.error('Please select a destination city');
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
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (paymentMethod !== 'cash') {
            toast.success(`Redirecting to ${PAYMENT_METHODS.find(p => p.id === paymentMethod)?.name}...`);
        } else {
            toast.success('Booking Confirmed! Pay cash on board.');
        }
        setLoading(false);
        setStep(4);
    };

    const handleClose = () => {
        setIsOpen(false);
        setTimeout(() => { setStep(1); setDestination(''); setPaymentMethod(''); }, 400);
    };

    const handleShare = async () => {
        const shareText = `I'm traveling to ${selectedCity?.name} via Yatra! Track my ride.`;
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
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 rounded-xl"
                >
                    <MapPin className="w-3.5 h-3.5 mr-1.5" />
                    Book Ride
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[440px] bg-white/90 backdrop-blur-md border border-slate-100/80 text-white rounded-3xl p-6 shadow-2xl shadow-black/60">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                        {step === 1 && (<><MapPin className="w-5 h-5 text-cyan-400" /> Choose Destination</>)}
                        {step === 2 && (<><CreditCard className="w-5 h-5 text-cyan-400" /> Payment Method</>)}
                        {step === 3 && (<><CheckCircle className="w-5 h-5 text-cyan-400" /> Confirm Booking</>)}
                        {step === 4 && (<><CheckCircle className="w-5 h-5 text-emerald-400" /> Booking Confirmed!</>)}
                    </DialogTitle>
                </DialogHeader>

                <div>
                    {/* ─── Step 1: Destination & Vehicle ─── */}
                    {step === 1 && (
                        <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">

                            {/* Where are you going? Dropdown */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
                                    Where are you going?
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setDropdownOpen(o => !o)}
                                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left transition-all ${destination ? 'bg-cyan-500/10 border-cyan-500/40 text-white' : 'bg-slate-50 border-slate-200 text-slate-600' } hover:border-cyan-500/60 focus:outline-none focus:border-cyan-500`}
                                    >
                                        <span className="flex items-center gap-2 font-medium">
                                            <MapPin className={`w-4 h-4 ${destination ? 'text-cyan-400' : 'text-slate-600'}`} />
                                            {selectedCity?.name || 'Select a city...'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Dropdown list */}
                                    {dropdownOpen && (
                                        <div className="absolute z-50 mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                                            <div className="max-h-52 overflow-y-auto">
                                                {NEPALI_CITIES.map((city) => (
                                                    <button
                                                        key={city.id}
                                                        type="button"
                                                        onClick={() => { setDestination(city.id); setDropdownOpen(false); }}
                                                        className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${destination === city.id ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-300 hover:bg-slate-100' }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {destination === city.id && (
                                                                <CheckCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                            )}
                                                            {destination !== city.id && (
                                                                <span className="w-3.5 shrink-0" />
                                                            )}
                                                            {city.name}
                                                        </span>
                                                        <span className="text-xs text-slate-600 font-mono">~रु {city.basePrice}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Vehicle Type */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Vehicle Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {VEHICLE_TYPES.map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => setVehicleType(v.id)}
                                            className={`flex flex-col items-center gap-2 py-3 px-2 rounded-2xl border-2 transition-all ${vehicleType === v.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200' }`}
                                        >
                                            <span>{v.icon}</span>
                                            <span className="text-xs font-bold">{v.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Passengers */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Passengers</label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setPassengers(num)}
                                            className={`flex-1 h-10 rounded-xl text-sm font-bold border-2 transition-all ${passengers === num ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-600' }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Trip Summary */}
                            <div className="bg-slate-50/60 rounded-2xl p-4 border border-slate-100 space-y-2">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600">Trip Summary</p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Vehicle</span>
                                    <span className="font-semibold text-white capitalize">{selectedVehicle?.name}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Passengers</span>
                                    <span className="font-semibold text-white">{passengers}</span>
                                </div>
                                {selectedCity && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Destination</span>
                                        <span className="font-semibold text-cyan-300">{selectedCity.name}</span>
                                    </div>
                                )}
                                <div className="border-t border-slate-100 pt-2 flex justify-between items-center mt-1">
                                    <span className="text-sm font-bold text-white">Estimated Total</span>
                                    <span className="text-xl font-black text-cyan-400">रु {estimatedTotal}</span>
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
                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${paymentMethod === method.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200' }`}
                                >
                                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">{method.icon}</div>
                                    <div className="flex-1">
                                        <p className="font-bold text-white text-sm">{method.name}</p>
                                        <p className="text-xs text-slate-600">{method.id === 'cash' ? 'Pay directly to driver' : 'Secure digital payment'}</p>
                                    </div>
                                    {paymentMethod === method.id && <CheckCircle className="w-5 h-5 text-cyan-500 shrink-0" />}
                                </button>
                            ))}
                            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-3 text-center mt-2">
                                <p className="text-sm text-cyan-300 font-medium">
                                    Total to Pay: <span className="font-black text-lg">रु {estimatedTotal}</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ─── Step 4: Confirmed ─── */}
                    {step === 4 && (
                        <div className="flex flex-col items-center gap-5 py-4 animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center border border-emerald-500/30">
                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white">Booking Confirmed!</h3>
                                <p className="text-slate-600 text-sm mt-1">Your ride to <span className="text-cyan-300 font-semibold">{selectedCity?.name}</span> is scheduled.</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-xl shadow-white/5">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=YATRA-${Date.now()}-${selectedCity?.id}`}
                                    alt="Booking QR Code"
                                    className="w-44 h-44"
                                />
                            </div>
                            <p className="text-center text-slate-600 text-xs max-w-[200px]">Show this QR code to the driver when boarding.</p>
                            <Button variant="outline" onClick={handleShare} className="w-full border-slate-200 text-slate-300 hover:text-white hover:bg-slate-100 rounded-xl">
                                <Share2 className="w-4 h-4 mr-2" /> Share Trip Details
                            </Button>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-row gap-2 sm:justify-between mt-5">
                    {step > 1 && step < 4 && (
                        <Button variant="ghost" onClick={handleBack} className="flex-1 sm:flex-none text-slate-300 hover:text-white">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                    )}

                    {step === 1 && (
                        <Button
                            onClick={handleNext}
                            className={`flex-1 h-12 text-sm font-bold rounded-2xl text-white transition-all duration-300 ${destination ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/30 animate-pulse-subtle' : 'bg-slate-100 text-slate-600 cursor-not-allowed' }`}
                            style={{
                                animation: destination ? 'pulse-glow 2s ease-in-out infinite' : 'none',
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
                        <Button onClick={handleClose} className="w-full h-12 rounded-2xl bg-slate-100 hover:bg-slate-700 text-white">
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
