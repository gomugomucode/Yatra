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
  const [completedTrips, setCompletedTrips] = useState<number>(0);
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
          setTotalTrips(data.totalTrips || 0);
          setCompletedTrips(data.completedTrips || 0);
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
            className="w-11 h-11 min-w-11 min-h-11 rounded-full bg-card border border-border text-foreground hover:bg-surface-soft shadow-md"
          >
            <span className="text-sm font-bold">{initial}</span>
          </Button>
        </SheetTrigger>
      )}
      <SheetContent
        side="right"
        className="w-full max-w-md border-l border-border bg-card p-0 flex flex-col overflow-hidden z-[10000] shadow-2xl"
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
          <div className="p-6 bg-surface-soft border-b border-border">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-emerald-200 ring-2 ring-white">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xl text-foreground tracking-tight">{displayName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 tracking-widest uppercase">
                    DRIVER
                  </span>
                  {isZkVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-black text-blue-700 tracking-widest uppercase">
                      <ShieldCheck className="w-3 h-3" /> ZK Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-black text-red-700 tracking-widest uppercase">
                      Unverified
                    </span>
                  )}
                </div>
              </div>
            </div>
            {wallet && (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-card border border-border px-4 py-3 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-muted-foreground">Connected Wallet</span>
                <span className="text-xs font-mono font-bold text-emerald-700 ml-auto">{truncateAddress(wallet)}</span>
              </div>
            )}
            {!isZkVerified && (
              <Button
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-xl"
                onClick={() => {
                  setOpen(false);
                  router.push('/auth/profile?role=driver');
                }}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                Verify Identity via ZK
              </Button>
            )}
          </div>

          {/* TRRL Performance Dashboard */}
          <div className="p-6 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <Award className="w-3.5 h-3.5" />
              Reputation & Performance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-soft border border-border p-4 flex flex-col justify-center relative overflow-hidden group hover:border-yellow-500 transition-colors">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-yellow-500/5 rounded-full blur-xl group-hover:bg-yellow-500/10 transition-all"></div>
                <div className="flex items-center gap-2 mb-1 relative z-10">
                  <Star className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">TRRL Score</span>
                </div>
                <div className="text-2xl font-black text-foreground relative z-10">{reputationScore}<span className="text-sm text-muted-foreground font-bold">/1000</span></div>
              </div>
              <div className="rounded-xl bg-surface-soft border border-border p-4 flex flex-col justify-center relative overflow-hidden group hover:border-cyan-500 transition-colors">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all"></div>
                <div className="flex items-center gap-2 mb-1 relative z-10">
                  <Activity className="w-4 h-4 text-cyan-600" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Completion</span>
                </div>
                <div className="text-2xl font-black text-foreground relative z-10">
                  {totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 100) : 0}%
                </div>
              </div>
            </div>
          </div>

          {/* Recent Trips Slider */}
          <div className="p-6 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              Recent Trips
            </h3>
            <div className="overflow-x-auto pb-2 -mx-1 flex gap-4 snap-x snap-mandatory custom-scrollbar">
              {recentBookings.length === 0 ? (
                <div className="w-full py-8 text-center rounded-xl bg-section/40 border border-dashed border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-tighter">No trips completed yet</p>
                </div>
              ) : (
                recentBookings.map((booking) => {
                  const fare = booking.fare || 0;
                  const date = new Date(booking.timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                  return (
                    <div
                      key={booking.id}
                      className="flex-shrink-0 w-48 snap-center rounded-xl border p-4 bg-card shadow-md border-border hover:border-primary transition-colors"
                    >
                      <p className="text-[10px] text-muted-foreground font-black uppercase">{date}</p>
                      <p className="text-sm font-bold text-foreground mt-1 truncate">{booking.passengerName || 'Passenger'}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[12px] font-black text-emerald-700">रु {fare}</span>
                        <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg">
                           <History className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Digital wallet */}
          <div className="p-6 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" />
              Digital Wallet
            </h3>
            <div className="rounded-xl bg-surface-soft border border-border p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground font-bold">Balance</span>
                <span className="text-foreground font-black text-base">0.00 USDC · 0 SOL</span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-11 min-h-11 border-border bg-card text-foreground hover:bg-surface-soft font-bold"
                  onClick={handleCopyAddress}
                  disabled={!wallet}
                >
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-2" />
                  Cash Out
                </Button>
              </div>
            </div>
          </div>

          {/* Action list */}
          <div className="p-6 flex-1 bg-background">
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
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold text-muted-foreground hover:bg-surface-soft hover:text-foreground transition-all group"
                >
                  <item.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-border">
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
