'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type ReceiptState = 'idle' | 'boarding' | 'minting' | 'confirmed';

export default function TripReceiptCard() {
  const [state, setState] = useState<ReceiptState>('idle');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setState('confirmed');
      return;
    }

    let activeTimers: ReturnType<typeof setTimeout>[] = [];
    const runSequence = () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers = [];
      setState('idle');
      activeTimers.push(setTimeout(() => setState('boarding'), 900));
      activeTimers.push(setTimeout(() => setState('minting'), 1000));
      activeTimers.push(setTimeout(() => setState('confirmed'), 3000));
    };

    runSequence();
    const interval = setInterval(runSequence, 4000);

    return () => {
      clearInterval(interval);
      activeTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [reducedMotion]);

  const statusLabel = useMemo(() => {
    if (state === 'confirmed') return 'CONFIRMED';
    if (state === 'minting') return 'MINTING';
    if (state === 'boarding') return 'BOARDING';
    return 'READY';
  }, [state]);

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={reducedMotion ? undefined : { duration: 0.6 }}
      className="w-full rounded-2xl border border-sky-900/70 bg-[#0b1f3a] p-6 shadow-[0_24px_100px_rgba(0,0,0,0.45)]"
    >
      <p className="font-space-mono text-xs uppercase tracking-[0.18em] text-sky-200/60">NFT receipt</p>
      <h3 className="mt-3 font-serif text-2xl text-zinc-100">Trip Receipt · Kathmandu → Pokhara</h3>

      <div className="mt-6 space-y-3 text-sm text-zinc-300">
        <div className="flex items-center justify-between border-b border-sky-900/60 pb-2">
          <span>Driver</span>
          <span className="font-space-mono text-emerald-400">verified ✓</span>
        </div>
        <div className="flex items-center justify-between border-b border-sky-900/60 pb-2">
          <span>Seats</span>
          <span className="font-space-mono">3/20</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Status</span>
          <span className="flex items-center gap-2 font-space-mono text-xs">
            <motion.span
              className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400"
              animate={reducedMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={reducedMotion ? undefined : { duration: 1.2, repeat: Infinity }}
            />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-sky-900/60 bg-[#08172c]/80 p-3">
        <div className="mb-2 flex items-center gap-2">
          <svg
            viewBox="0 0 398 311"
            aria-hidden="true"
            className="h-3.5 w-auto"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="solanaGradient" x1="13%" y1="16%" x2="87%" y2="84%">
                <stop offset="0%" stopColor="#00FFA3" />
                <stop offset="100%" stopColor="#DC1FFF" />
              </linearGradient>
            </defs>
            <path
              d="M64.6 237.5c2.3-2.3 5.4-3.5 8.6-3.5h313.7c5.4 0 8.1 6.5 4.3 10.3L333.7 302c-2.3 2.3-5.4 3.5-8.6 3.5H11.4c-5.4 0-8.1-6.5-4.3-10.3l57.5-57.7zM64.6 8.5C66.9 6.2 70 5 73.2 5h313.7c5.4 0 8.1 6.5 4.3 10.3l-57.5 57.7c-2.3 2.3-5.4 3.5-8.6 3.5H11.4c-5.4 0-8.1-6.5-4.3-10.3L64.6 8.5zm269.1 114.4c-2.3-2.3-5.4-3.5-8.6-3.5H11.4c-5.4 0-8.1 6.5-4.3 10.3l57.5 57.7c2.3 2.3 5.4 3.5 8.6 3.5h313.7c5.4 0 8.1-6.5 4.3-10.3l-57.5-57.7z"
              fill="url(#solanaGradient)"
            />
          </svg>
          <span className="font-space-mono text-[11px] uppercase tracking-[0.16em] text-sky-200/70">
            Solana
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-900/70 bg-sky-950/50 px-2.5 py-1 font-space-mono text-[10px] uppercase tracking-[0.12em] text-sky-100/80">
            <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="6" r="5" fill="none" stroke="#7dd3fc" strokeWidth="1.2" />
              <path d="M3.5 7l1.5 1.5L8.5 4.5" fill="none" stroke="#7dd3fc" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Anchor
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-900/70 bg-sky-950/50 px-2.5 py-1 font-space-mono text-[10px] uppercase tracking-[0.12em] text-sky-100/80">
            <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="none" stroke="#38bdf8" strokeWidth="1.1" />
              <circle cx="6" cy="6" r="1.4" fill="#38bdf8" />
            </svg>
            Token-2022
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-900/70 bg-sky-950/50 px-2.5 py-1 font-space-mono text-[10px] uppercase tracking-[0.12em] text-sky-100/80">
            <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="none" stroke="#f59e0b" strokeWidth="1.1" />
              <path d="M4 3.8h2.4a1.3 1.3 0 1 1 0 2.6H4V3.8zm2.7 2.6h.2a1.2 1.2 0 1 1 0 2.4H4V6.4h2.7z" fill="#f59e0b" />
            </svg>
            Rust
          </span>
        </div>
        <AnimatePresence mode={reducedMotion ? 'sync' : 'wait'}>
          {state === 'confirmed' ? (
            <motion.p
              key="confirmed"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={reducedMotion ? undefined : { duration: 0.3 }}
              className="font-space-mono text-sm text-emerald-300"
            >
              Minting on Solana... → Confirmed ✓
            </motion.p>
          ) : (
            <motion.p
              key="minting"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={reducedMotion ? undefined : { duration: 0.3 }}
              className="font-space-mono text-sm text-amber-300"
            >
              Minting on Solana...
            </motion.p>
          )}
        </AnimatePresence>
        <p className="mt-2 font-space-mono text-xs text-sky-100/45">5f8k...A9mQ2sW4bV7YxR1eNk3</p>
      </div>
    </motion.article>
  );
}
