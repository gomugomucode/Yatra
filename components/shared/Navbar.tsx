'use client';
import { Bell, ShieldAlert, Bus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from './StatusChip';
import Link from 'next/link';

interface NavbarProps {
  title?: string;
  subtitle?: string;
  isOnline?: boolean;
  onSosClick?: () => void;
  showSos?: boolean;
  children?: React.ReactNode;
}

export function Navbar({
  title = "YATRA",
  subtitle = "Nepal's Transit",
  isOnline = false,
  onSosClick,
  showSos = false,
  children
}: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 w-full h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-100">
            <Bus className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-black text-slate-900 leading-none tracking-tight">
              {title}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 leading-none uppercase tracking-widest mt-1">
              {subtitle}
            </p>
          </div>
        </Link>
      </div>
      
      <div className="flex items-center gap-3">
        {isOnline && (
          <StatusChip status="online" />
        )}
        {children}
        {showSos && (
          <Button
            onClick={onSosClick}
            variant="destructive"
            className="h-10 px-4 bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-red-100 border-none"
          >
            <ShieldAlert className="w-4 h-4 mr-2" />
            SOS
          </Button>
        )}
      </div>
    </nav>
  );
}
