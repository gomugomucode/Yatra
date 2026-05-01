'use client';
import { cn } from '@/lib/utils';

type StatusType = 'online' | 'offline' | 'busy' | 'sos';

interface StatusChipProps {
  status: StatusType;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const styles = {
    online: "bg-emerald-50 text-emerald-700 border-emerald-100",
    offline: "bg-slate-100 text-slate-600 border-slate-200",
    busy: "bg-orange-50 text-orange-700 border-orange-100",
    sos: "bg-red-50 text-red-700 border-red-200",
  };

  const labels = {
    online: "Online",
    offline: "Offline",
    busy: "In Trip",
    sos: "SOS",
  };

  return (
    <div className={cn(
      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 shadow-sm",
      styles[status],
      className
    )}>
      {status === 'online' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
      {labels[status]}
    </div>
  );
}
