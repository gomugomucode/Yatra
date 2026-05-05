'use client';

import { MapPin, Bus as BusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NotificationToastProps {
  title: string;
  message: string;
  distanceMeters?: number;
  onViewMap?: () => void;
}

export function NotificationToast({
  title,
  message,
  distanceMeters,
  onViewMap,
}: NotificationToastProps) {
  const distanceText =
    typeof distanceMeters === 'number'
      ? distanceMeters >= 1000
        ? `${(distanceMeters / 1000).toFixed(1)} km away`
        : `${Math.round(distanceMeters)} m away`
      : null;

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        <BusIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-sm font-black text-foreground">{title}</div>
        <div className="text-xs text-foreground/90">{message}</div>
        {distanceText && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-bold">
            <MapPin className="h-3 w-3" />
            <span>{distanceText}</span>
          </div>
        )}
        {onViewMap && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 min-h-9 px-3 text-[11px] font-black rounded-lg border-border bg-card hover:bg-surface-soft"
            onClick={onViewMap}
          >
            View on Map
          </Button>
        )}
      </div>
    </div>
  );
}


