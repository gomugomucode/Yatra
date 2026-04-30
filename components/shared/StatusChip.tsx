'use client';
import { cn } from '@/lib/utils';

type StatusType = 'online' | 'offline' | 'busy' | 'sos';

interface StatusChipProps {
  status: StatusType;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const styles = {
    online: "bg-y-teal-bg text-y-teal-text border-y-teal/20",
    offline: "bg-y-surface-2 text-y-text-2 border-y-border-strong",
    busy: "bg-y-amber-bg text-y-amber-text border-y-amber/20",
    sos: "bg-y-red-bg text-y-red-text border-y-red",
  };

  const labels = {
    online: "Online",
    offline: "Offline",
    busy: "In Trip",
    sos: "SOS",
  };

  return (
    <div className={cn(
      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border-[1.5px] flex items-center gap-1.5",
      styles[status],
      className
    )}>
      {status === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-y-teal animate-pulse" />}
      {labels[status]}
    </div>
  );
}
