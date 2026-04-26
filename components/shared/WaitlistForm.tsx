'use client';

import { FormEvent, useState } from 'react';

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
        setMessage("🎉 You're on the list!");
        setEmail('');
        setName('');
        return;
      }

      if (response.status === 409) {
        setStatus('duplicate');
        setMessage('This email is already on the waitlist.');
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
      <div className={`w-full rounded-2xl border border-amber-400/30 bg-[#0a203a]/80 p-6 text-center ${className}`}>
        <p className="text-sm font-medium text-amber-300">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full space-y-3 ${className}`}>
      <div className={`grid gap-2 md:gap-3 ${compact ? 'md:grid-cols-[1fr_1fr_auto]' : 'md:grid-cols-2'}`}>
        <input
          type="text"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          className="h-11 rounded-full border border-sky-900/70 bg-[#071629] px-4 text-sm text-zinc-100 placeholder:text-sky-100/40 transition-colors focus:border-amber-400 focus:outline-none"
        />
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="h-11 rounded-full border border-sky-900/70 bg-[#071629] px-4 text-sm text-zinc-100 placeholder:text-sky-100/40 transition-colors focus:border-amber-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="h-11 min-w-[132px] rounded-full bg-amber-500 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
        </button>
      </div>
      {(status === 'error' || status === 'duplicate') && (
        <p className="text-sm text-red-300">{message}</p>
      )}
    </form>
  );
}