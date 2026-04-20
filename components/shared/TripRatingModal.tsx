'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';

interface TripRatingModalProps {
  open: boolean;
  role: 'passenger' | 'driver';
  targetName?: string;
  onSubmit: (stars: number, comment: string) => Promise<void>;
  onSkip: () => void;
}

export default function TripRatingModal({ open, role, targetName, onSubmit, onSkip }: TripRatingModalProps) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const displayName = targetName || (role === 'passenger' ? 'Driver' : 'Passenger');
  const label = role === 'passenger' ? 'your driver' : 'your passenger';

  async function handleSubmit() {
    if (stars === 0) return;
    setLoading(true);
    try {
      await onSubmit(stars, comment);
    } finally {
      setLoading(false);
      setStars(0);
      setComment('');
    }
  }

  function handleSkip() {
    setStars(0);
    setComment('');
    onSkip();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate your trip</DialogTitle>
          <DialogDescription>
            How was your experience with {label}, {displayName}?
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-2 py-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`w-8 h-8 ${n <= (hovered || stars) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
              />
            </button>
          ))}
        </div>

        <Textarea
          placeholder="Leave a comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={handleSkip} disabled={loading}>
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={stars === 0 || loading}>
            {loading ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
