'use client';

import { FormEvent, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type WaitlistFormProps = {
  compact?: boolean;
  className?: string;
};

export default function WaitlistForm({ compact = false, className = '' }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'duplicate'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage("You're on the list. Keep an eye on your inbox.");
        setEmail('');
        setName('');
        return;
      }

      if (response.status === 409) {
        setStatus('duplicate');
        setMessage('This email is already registered.');
        return;
      }

      setStatus('error');
      setMessage(data.error || 'Unable to join the waitlist right now.');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full py-6 text-center ${className}`}
      >
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-2xl font-serif text-white mb-3">Spot Secured</h3>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-[250px] mx-auto">{message}</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full ${className}`}>
      <div className={`flex flex-col gap-5 ${compact ? 'md:flex-row md:items-end' : ''}`}>
        
        <div className={`flex flex-col gap-2 text-left ${compact ? 'flex-1' : ''}`}>
          {!compact && <label htmlFor="name" className="text-xs font-medium text-zinc-400 ml-1">Full Name</label>}
          <input
            id="name"
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="John Doe"
            className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-zinc-600 transition-all hover:bg-white/10 focus:border-amber-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>

        <div className={`flex flex-col gap-2 text-left ${compact ? 'flex-1' : ''}`}>
          {!compact && <label htmlFor="email" className="text-xs font-medium text-zinc-400 ml-1">Email Address <span className="text-amber-500">*</span></label>}
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="john@example.com"
            className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-zinc-600 transition-all hover:bg-white/10 focus:border-amber-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className={`group relative h-12 rounded-xl bg-amber-500 px-8 text-sm font-semibold text-black transition-all hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-amber-500 ${compact ? '' : 'mt-2 w-full'}`}
        >
          <span className="flex items-center justify-center gap-2">
            {status === 'loading' ? (
              <>
                <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                {compact ? 'Join Waitlist' : 'Join the Waitlist'}
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </span>
        </button>

      </div>

      <AnimatePresence>
        {(status === 'error' || status === 'duplicate') && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-4 text-sm text-red-400 text-center font-medium bg-red-400/10 py-2 rounded-lg border border-red-400/20">
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}