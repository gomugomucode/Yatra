'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Copy,
  Wallet,
  PlusCircle,
  History,
  Receipt,
  Gift,
  HelpCircle,
  LogOut,
  ExternalLink,
  Ticket,
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
import { subscribeToBookings } from '@/lib/firebaseDb';
import { Booking } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';

const SOLSCAN_TX = 'https://solscan.io/tx/';

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return '0x00...000';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function mockCarbonCredits(booking: Booking): number {
  const fare = booking.fare ?? 0;
  return Math.min(5, Math.round((fare / 50) * 1.2 * 10) / 10);
}

function isLongDistance(booking: Booking): boolean {
  return (booking.fare ?? 0) >= 200 || (booking.route?.length ?? 0) > 20;
}

interface YatraProfileDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function YatraProfileDrawer({ open: controlledOpen, onOpenChange }: YatraProfileDrawerProps = {}) {
  const router = useRouter();
  const { currentUser, userData, signOut } = useAuth();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [bookingsWithReceipts, setBookingsWithReceipts] = useState<Booking[]>([]);

  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? onOpenChange : setInternalOpen;

  const wallet = userData?.walletAddress || userData?.solanaWallet;
  const displayName = userData?.name || currentUser?.email?.split('@')[0] || 'Rider';
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!currentUser || !open) return;
    // Inside useEffect for subscribeToBookings
    const unsubscribe = subscribeToBookings(currentUser.uid, 'passenger', (data) => {
      // 1. Filter only for rides that have an NFT minted
      const withReceipts = data.filter((b) => b.receipt && b.receipt.status === 'minted');

      // 2. Sort by newest first
      const sorted = [...withReceipts].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setBookingsWithReceipts(sorted);
    });
    return () => unsubscribe();
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

  const explorerUrl = (txSignature: string) =>
    txSignature.startsWith('http') ? txSignature : `${SOLSCAN_TX}${txSignature}`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 rounded-full bg-[#0b0f1a] border border-slate-700 text-cyan-300 hover:bg-slate-800"
          >
            <span className="text-sm font-bold">{initial}</span>
          </Button>
        </SheetTrigger>
      )}
      <SheetContent
        side="right"
        /* z-[10000] makes it sit on top of any Map, Zoom buttons, or popups */
        className="w-full max-w-md border-l border-cyan-500/30 bg-[#0f172a] p-0 flex flex-col overflow-hidden z-[10000] shadow-[0_0_50px_rgba(0,0,0,1)]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Yatra Profile</SheetTitle>
        </SheetHeader>

        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex flex-col h-full max-h-screen overflow-y-auto custom-scrollbar"
        >
          {/* Profile Card - Using a much lighter background for contrast */}
          <div className="p-6 bg-slate-800/40 border-b border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-cyan-500/40 ring-2 ring-white/10">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xl text-white tracking-tight">{displayName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center rounded-full bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-0.5 text-[10px] font-bold text-cyan-400 tracking-widest uppercase">
                    PASSENGER
                  </span>
                </div>
              </div>
            </div>            {wallet && (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-black/40 border border-slate-800 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                <span className="text-xs font-medium text-slate-400">Connected Wallet</span>
                <span className="text-xs font-mono text-cyan-400 ml-auto">{truncateAddress(wallet)}</span>
              </div>
            )}
          </div>

          {/* Digital wallet */}
          <div className="p-6 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" />
              Digital Wallet
            </h3>
            <div className="rounded-xl bg-[#161e2d] border border-slate-800 p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Balance</span>
                <span className="text-white font-bold text-base">0.00 SOL · 0 YTR</span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 border-slate-700 bg-slate-800/50 text-slate-200 hover:bg-slate-700"
                  onClick={handleCopyAddress}
                  disabled={!wallet}
                >
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/10"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-2" />
                  Add Funds
                </Button>
              </div>
            </div>
          </div>

          {/* Recent Journey NFTs - With Solid Card background */}
          <div className="p-6 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
              <Ticket className="w-3.5 h-3.5" />
              Recent Journey NFTs
            </h3>
            <div className="overflow-x-auto pb-2 -mx-1 flex gap-4 snap-x snap-mandatory">
              {bookingsWithReceipts.length === 0 ? (
                <div className="w-full py-8 text-center rounded-xl bg-slate-900/50 border border-dashed border-slate-800">
                  <p className="text-xs text-slate-500 uppercase tracking-tighter">No tickets minted yet</p>
                </div>
              ) : (
                bookingsWithReceipts.map((booking) => {
                  const carbon = mockCarbonCredits(booking);
                  const longDistance = isLongDistance(booking);
                  return (
                    <div
                      key={booking.id}
                      className={`flex-shrink-0 w-48 snap-center rounded-xl border p-4 bg-[#1c2537] shadow-lg ${longDistance ? 'border-amber-500/50' : 'border-cyan-500/40'
                        }`}
                    >
                      <p className="text-[10px] text-slate-400 font-bold uppercase">MAR 06, 2026</p>
                      <p className="text-sm font-bold text-white mt-1 truncate">Butwal ➔ KTM</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-400">+{carbon}kg CO₂</span>
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Action list */}
          <div className="p-6 flex-1 bg-[#0b0f1a]">
            <nav className="space-y-2">
              {[
                {
                  label: 'Trip History',
                  icon: History,
                  // Shows all completed rides, not just NFTs
                  onClick: () => {
                    const historyText = bookingsWithReceipts.length > 0
                      ? `You have ${bookingsWithReceipts.length} completed trips.`
                      : "No trip history found yet.";
                    toast({ title: "Trip History", description: historyText });
                    // Logic: You can use setView('history') here if you build a sub-view
                  }
                },
                {
                  label: 'Payment Receipts',
                  icon: Receipt,
                  // Opens the latest minted NFT on Solscan
                  onClick: () => {
                    const latest = bookingsWithReceipts[0];
                    if (latest?.receipt?.explorerLink) {
                      window.open(latest.receipt.explorerLink, '_blank');
                    } else {
                      toast({ title: "No Receipts", description: "Complete a ride to see blockchain receipts." });
                    }
                  }
                },
                {
                  label: 'Refer & Earn',
                  icon: Gift,
                  // Copies a real referral link using the User's UID
                  onClick: () => {
                    const refCode = currentUser?.uid.slice(0, 6).toUpperCase();
                    navigator.clipboard.writeText(`Join Yatra with my code: ${refCode}`);
                    toast({ title: "Referral Copied!", description: `Share code ${refCode} with friends.` });
                  }
                },
                {
                  label: 'Help Center',
                  icon: HelpCircle,
                  onClick: () => window.open('https://yatra-support.com', '_blank')
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all group"
                >
                  <item.icon className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-slate-800">
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
