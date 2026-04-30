'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Copy,
  Wallet,
  PlusCircle,
  History,
  HelpCircle,
  LogOut,
  ShieldCheck,
  Star,
  Activity,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Driver, Booking } from '@/lib/types';
import { getDatabase, ref, get } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase';
import { subscribeToBookings } from '@/lib/firebaseDb';

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return '0x00...000';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

interface DriverProfileDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DriverProfileDrawer({ open: controlledOpen, onOpenChange }: DriverProfileDrawerProps = {}) {
  const router = useRouter();
  const { currentUser, userData, signOut } = useAuth();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [reputationScore, setReputationScore] = useState<number>(0);
  const [totalTrips, setTotalTrips] = useState<number>(0);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);

  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? onOpenChange : setInternalOpen;

  const driverProfile = userData?.role === 'driver' ? (userData as Driver) : null;
  const wallet = driverProfile?.solanaWallet;
  const displayName = driverProfile?.name || currentUser?.email?.split('@')[0] || 'Driver';
  const initial = displayName.charAt(0).toUpperCase();
  const isZkVerified = !!driverProfile?.verificationBadge?.ageVerified;

  useEffect(() => {
    if (!currentUser || !open) return;
    
    // Fetch Reputation Score from Firebase
    const fetchReputation = async () => {
      try {
        const db = getDatabase(getFirebaseApp());
        const repRef = ref(db, `reputation/drivers/${currentUser.uid}`);
        const snap = await get(repRef);
        if (snap.exists()) {
          const data = snap.val();
          setReputationScore(data.score || 0);
          setTotalTrips(data.completedTrips || 0);
        }
      } catch (error) {
        console.error('Failed to fetch reputation', error);
      }
    };
    
    fetchReputation();

    // Subscribe to driver's recent bookings for the history slider
    const unsubscribeBookings = subscribeToBookings(currentUser.uid, 'driver', (data) => {
      const sorted = [...data].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecentBookings(sorted.slice(0, 10));
    });

    return () => unsubscribeBookings();
  }, [currentUser, open]);

  const handleCopyAddress = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    toast({ title: 'Copied', description: 'Wallet address copied to clipboard.' });
  };

  const handleLogOut = async () => {
    await signOut();
    router.replace('/auth');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10 rounded-full bg-[#0b0f1a] border border-slate-200 text-cyan-300 hover:bg-slate-100 shadow-md"
          >
            <span className="text-sm font-bold">{initial}</span>
          </Button>
        </SheetTrigger>
      )}
      <SheetContent
        side="right"
        className="w-full max-w-md border-l border-emerald-500/30 bg-[#0f172a] p-0 flex flex-col overflow-hidden z-[10000] shadow-[0_0_50px_rgba(0,0,0,1)]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Driver Profile</SheetTitle>
        </SheetHeader>

        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex flex-col h-full max-h-screen overflow-y-auto custom-scrollbar"
        >
          {/* Profile Card */}
          <div className="p-6 bg-slate-100/40 border-b border-slate-200/50">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-emerald-500/40 ring-2 ring-white/10">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xl text-white tracking-tight">{displayName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 tracking-widest uppercase">
                    DRIVER
                  </span>
                  {isZkVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 tracking-widest uppercase">
                      <ShieldCheck className="w-3 h-3" /> ZK Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
            {wallet && (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/40 border border-slate-100 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                <span className="text-xs font-medium text-slate-600">Connected Wallet</span>
                <span className="text-xs font-mono text-emerald-400 ml-auto">{truncateAddress(wallet)}</span>
              </div>
            )}
          </div>

          {/* TRRL Performance Dashboard */}
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
              <Award className="w-3.5 h-3.5" />
              Reputation & Performance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-[#161e2d] to-[#0f172a] border border-slate-100 p-4 flex flex-col justify-center relative overflow-hidden group hover:border-yellow-500/30 transition-colors">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-yellow-500/5 rounded-full blur-xl group-hover:bg-yellow-500/10 transition-all"></div>
                <div className="flex items-center gap-2 mb-1 relative z-10">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs text-slate-600 uppercase tracking-wider font-semibold">TRRL Score</span>
                </div>
                <div className="text-2xl font-black text-white relative z-10">{reputationScore}<span className="text-sm text-slate-600 font-medium">/1000</span></div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-[#161e2d] to-[#0f172a] border border-slate-100 p-4 flex flex-col justify-center relative overflow-hidden group hover:border-cyan-500/30 transition-colors">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all"></div>
                <div className="flex items-center gap-2 mb-1 relative z-10">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-600 uppercase tracking-wider font-semibold">Total Trips</span>
                </div>
                <div className="text-2xl font-black text-white relative z-10">{totalTrips}</div>
              </div>
            </div>
          </div>

          {/* Recent Trips Slider */}
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              Recent Trips
            </h3>
            <div className="overflow-x-auto pb-2 -mx-1 flex gap-4 snap-x snap-mandatory custom-scrollbar">
              {recentBookings.length === 0 ? (
                <div className="w-full py-8 text-center rounded-xl bg-slate-50/50 border border-dashed border-slate-100">
                  <p className="text-xs text-slate-600 uppercase tracking-tighter">No trips completed yet</p>
                </div>
              ) : (
                recentBookings.map((booking) => {
                  const fare = booking.fare || 0;
                  const date = new Date(booking.timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                  return (
                    <div
                      key={booking.id}
                      className="flex-shrink-0 w-48 snap-center rounded-xl border p-4 bg-gradient-to-br from-[#1c2537] to-[#0f172a] shadow-lg border-emerald-500/30 hover:border-emerald-500/60 transition-colors"
                    >
                      <p className="text-[10px] text-slate-600 font-bold uppercase">{date}</p>
                      <p className="text-sm font-bold text-white mt-1 truncate">{booking.passengerName || 'Passenger'}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[12px] font-black text-emerald-400">रु {fare}</span>
                        <div className="bg-emerald-500/10 text-emerald-400 p-1 rounded-md">
                           <History className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Digital wallet */}
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" />
              Digital Wallet
            </h3>
            <div className="rounded-xl bg-[#161e2d] border border-slate-100 p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Balance</span>
                <span className="text-white font-bold text-base">0.00 USDC · 0 SOL</span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 border-slate-200 bg-slate-100/50 text-slate-200 hover:bg-slate-700"
                  onClick={handleCopyAddress}
                  disabled={!wallet}
                >
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-2" />
                  Cash Out
                </Button>
              </div>
            </div>
          </div>

          {/* Action list */}
          <div className="p-6 flex-1 bg-[#0b0f1a]">
            <nav className="space-y-2">
              {[
                {
                  label: 'Trip History',
                  icon: History,
                  onClick: () => {
                    const historyText = totalTrips > 0
                      ? `You have completed ${totalTrips} trips.`
                      : "No trip history found yet.";
                    toast({ title: "Trip History", description: historyText });
                  }
                },
                {
                  label: 'Help & Support',
                  icon: HelpCircle,
                  onClick: () => window.open('https://yatra-support.com', '_blank')
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-100/50 hover:text-white transition-all group"
                >
                  <item.icon className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <Button
                variant="ghost"
                className="w-full justify-start gap-4 px-4 h-12 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
                onClick={handleLogOut}
              >
                <LogOut className="w-4 h-4" />
                <span className="font-bold">Log Out</span>
              </Button>
            </div>
          </div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
