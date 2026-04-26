import type { Metadata } from 'next'
import WaitlistForm from '@/components/waitlist/WaitlistForm'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Join the Waitlist · Yatra',
  description: 'Be the first to ride with Yatra — Nepal\'s transit, tokenized on Solana.',
}

export default function WaitlistPage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-[#030712] text-zinc-100 antialiased selection:bg-amber-500/30">
      {/* Subtle Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-[#030712] to-[#030712]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

      <div className="relative z-10 w-full max-w-lg px-6 py-16 flex flex-col items-center text-center">
        {/* Navigation / Back to Home */}
        <Link href="/" className="mb-12 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 text-sm font-medium">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Home
        </Link>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-mono text-amber-400 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Early Access Waitlist
        </div>

        {/* Heading */}
        <h1 className="text-5xl md:text-6xl font-serif text-white mb-6 leading-tight tracking-tight">
          Transit, <br className="hidden sm:block" />
          <span className="text-zinc-500">tokenized.</span>
        </h1>

        <p className="text-zinc-400 text-base md:text-lg mb-10 max-w-md leading-relaxed">
          Yatra brings transparent, on-chain public transit to Nepal. Secure your spot on the waitlist.
        </p>

        {/* Form Container */}
        <div className="w-full relative">
          {/* Subtle glow behind the form */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-sky-500/10 to-amber-500/10 opacity-50 blur-xl"></div>
          
          <div className="relative rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
            <WaitlistForm />
          </div>
        </div>

        <p className="mt-10 text-xs font-mono text-zinc-600 flex items-center justify-center gap-4">
          <span>🇳🇵 Built for Nepal</span>
          <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
          <span>◎ Powered by Solana</span>
        </p>
      </div>
    </main>
  )
}
