'use client';
import { Bell, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from './StatusChip';

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
    <nav className="sticky top-0 z-50 w-full h-[56px] bg-y-surface border-b-[1.5px] border-y-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-y-primary flex items-center justify-center text-white font-black text-xs shadow-lg shadow-y-primary/20">
          Y
        </div>
        <div className="flex flex-col">
          <h1 className="text-[15px] font-black text-y-text1 leading-tight tracking-tight uppercase headline-transit">
            {title}
          </h1>
          <p className="text-[11px] font-bold text-y-text2 leading-tight uppercase tracking-wider">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isOnline && (
          <StatusChip status="online" />
        )}
        {children}
        {showSos && (
          <Button
            onClick={onSosClick}
            className="h-[38px] px-3 bg-y-red-bg border-[1.5px] border-y-red text-y-red-text hover:bg-y-red/10 font-black text-[11px] uppercase tracking-wider rounded-xl"
          >
            <ShieldAlert className="w-4 h-4 mr-1.5" />
            SOS
          </Button>
        )}
      </div>
    </nav>
  );
}
