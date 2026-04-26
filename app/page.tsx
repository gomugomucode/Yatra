'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import WaitlistForm from '@/components/shared/WaitlistForm';
import TripReceiptCard from '@/components/shared/TripReceiptCard';

type ProblemMetric = { title: string; subtitle: string; value: number; suffix?: string };

const problemMetrics: ProblemMetric[] = [
  { title: 'No live tracking', subtitle: 'Passengers wait blind, no ETA, no GPS', value: 82, suffix: '%' },
  { title: 'Unverified drivers', subtitle: 'No credential system. Anyone can claim to be licensed.', value: 64, suffix: '%' },
  { title: 'Paper tickets lost forever', subtitle: 'No proof of travel, no recourse, no history', value: 91, suffix: '%' },
];

const steps = [
  {
    number: '01',
    label: '~instant',
    title: 'Verify driver',
    body: 'Driver onboards with a ZK-Civic proof. Their license and credentials are verified on-chain without exposing raw documents.',
    tech: 'Groth16 ZKP · Civic',
  },
  {
    number: '02',
    label: 'realtime',
    title: 'Board & track',
    body: 'Passenger opens Yatra, sees the bus live on a Leaflet map. Seat availability syncs in milliseconds via Firebase.',
    tech: 'Firebase RTDB · Leaflet.js',
  },
  {
    number: '03',
    label: '< 400ms',
    title: 'Trip confirmed',
    body: 'When you board, one wallet signature mints your Soulbound NFT receipt on Solana. Non-transferable. Immutable. Yours.',
    tech: 'Token-2022 · Solana',
  },
  {
    number: '04',
    label: 'same block',
    title: 'Receipt on-chain',
    body: 'Your NFT logs route, driver, timestamp, and seat. Verifiable forever. No paper. No fraud.',
    tech: 'Soulbound · Anchor',
  },
];

const builtOnStack = [
  { name: 'Solana', src: '/brand-logos/solana.svg' },
  { name: 'Firebase', src: '/brand-logos/firebase.svg' },
  { name: 'Civic', src: '/brand-logos/civicrm.svg' },
  { name: 'Leaflet', src: '/brand-logos/leaflet.svg' },
  { name: 'Next.js', src: '/brand-logos/nextdotjs.svg' },
  { name: 'Jito', src: null },
] as const;

function CounterCard({ metric, reducedMotion }: { metric: ProblemMetric; reducedMotion: boolean }) {
  const [value, setValue] = useState(0);

  return (
    <motion.article
      onViewportEnter={() => {
        if (reducedMotion) {
          setValue(metric.value);
          return;
        }
        const duration = 900;
        const startedAt = performance.now();
        const tick = (time: number) => {
          const elapsed = time - startedAt;
          const progress = Math.min(1, elapsed / duration);
          setValue(Math.floor(progress * metric.value));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }}
      viewport={{ once: true, amount: 0.4 }}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7"
    >
      <div className="mb-5 h-1 w-12 rounded-full bg-amber-500" />
      <p className="font-space-mono text-3xl font-bold text-amber-400">
        {value}
        {metric.suffix}
      </p>
      <h3 className="mt-4 font-space-mono text-base text-zinc-100">{metric.title}</h3>
      <p className="mt-3 text-sm text-zinc-400">{metric.subtitle}</p>
    </motion.article>
  );
}

function RouteNetwork({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-80">
      <svg viewBox="0 0 640 420" className="h-full w-full">
        <defs>
          <linearGradient id="routeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="45%" stopColor="#7dd3fc" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {[
          'M40 300 C120 260, 190 220, 280 220 C380 220, 430 260, 600 250',
          'M60 340 C150 310, 250 320, 360 280 C460 245, 520 210, 600 160',
          'M80 120 C180 160, 240 170, 320 140 C420 95, 500 120, 590 90',
        ].map((d, index) => (
          <motion.path
            key={d}
            d={d}
            fill="none"
            stroke="url(#routeGlow)"
            strokeWidth={index === 1 ? 2.8 : 2.2}
            strokeLinecap="round"
            initial={reducedMotion ? { pathLength: 1, opacity: 0.5 } : { pathLength: 0.1, opacity: 0.2 }}
            animate={
              reducedMotion
                ? { pathLength: 1, opacity: 0.5 }
                : { pathLength: [0.1, 1, 0.1], opacity: [0.2, 0.85, 0.2] }
            }
            transition={
              reducedMotion
                ? undefined
                : { duration: 4.4 + index * 0.4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.25 }
            }
          />
        ))}

        {[
          { cx: 95, cy: 118 },
          { cx: 282, cy: 220 },
          { cx: 358, cy: 280 },
          { cx: 590, cy: 90 },
          { cx: 602, cy: 250 },
        ].map((dot) => (
          <motion.circle
            key={`${dot.cx}-${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r="4"
            fill="#7dd3fc"
            animate={reducedMotion ? undefined : { opacity: [0.4, 1, 0.4], r: [3.5, 5, 3.5] }}
            transition={reducedMotion ? undefined : { duration: 1.8, repeat: Infinity }}
          />
        ))}
      </svg>
    </div>
  );
}

export default function Home() {
  const reducedMotion = useReducedMotion();
  const isReducedMotion = Boolean(reducedMotion);

  return (
    <div className="min-h-screen bg-[#04101f] text-zinc-100 antialiased">
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:4px_4px]" />

      <header className="sticky top-0 z-50 border-b border-sky-900/60 bg-[#061730]/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <p className="font-serif text-xl">यात्री · Yatra</p>
          <div className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
            <a href="#how-it-works" className="scroll-mt-20 transition-colors hover:text-amber-400">How it works</a>
            <a href="#for-drivers" className="scroll-mt-20 transition-colors hover:text-amber-400">For Drivers</a>
            <a href="#for-passengers" className="scroll-mt-20 transition-colors hover:text-amber-400">For Passengers</a>
            <a href="#faq" className="scroll-mt-20 transition-colors hover:text-amber-400">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/auth?role=passenger&redirect=/passenger"
              className="inline-flex rounded-full border border-sky-800/80 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition-colors hover:border-sky-600 hover:text-white"
            >
              Passenger login
            </Link>
            <Link
              href="/auth?role=driver&redirect=/driver"
              className="inline-flex rounded-full border border-sky-800/80 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition-colors hover:border-sky-600 hover:text-white"
            >
              Driver login
            </Link>
          </div>
        </nav>
      </header>

      <section id="hero" className="scroll-mt-20 px-4 py-16 md:px-8 md:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-2 md:items-center md:gap-14 lg:gap-16">
          <motion.div
            initial={isReducedMotion ? false : { opacity: 0, y: 24 }}
            animate={isReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={isReducedMotion ? undefined : { duration: 0.6 }}
          >
            <div className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 font-space-mono text-xs text-amber-300">
              Live on Solana Devnet · Nepal Transit
            </div>
            <h1 className="mt-6 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">Your bus ride, verified on-chain.</h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-400 md:text-base">
              Yatra tokenizes every Nepal bus trip as a Soulbound NFT receipt, verifies driver identity with ZK proofs, and tracks your bus in real time — no paper tickets, no blind trust.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {/* <span className="inline-flex items-center rounded-full border border-sky-900/80 bg-sky-950/40 px-3 py-2 font-space-mono text-[11px] uppercase tracking-[0.12em] text-sky-200/80">
                Login
              </span> */}
              <Link
                href="/auth?role=passenger&redirect=/passenger"
                className="rounded-full border border-sky-800/80 bg-sky-950/50 px-4 py-2 text-xs font-medium text-sky-100 transition-colors hover:border-sky-600 hover:text-white"
              >
                Join as a Passenger 
              </Link>
              <Link
                href="/auth?role=driver&redirect=/driver"
                className="rounded-full border border-sky-800/80 bg-sky-950/50 px-4 py-2 text-xs font-medium text-sky-100 transition-colors hover:border-sky-600 hover:text-white"
              >
                Join as a Driver 
              </Link>
            </div>
            <div className="mt-8">
              <WaitlistForm compact />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {['< 400ms · Trip minted', 'ZK identity · No data exposed', 'Soulbound · Non-transferable'].map((pill) => (
                <span key={pill} className="rounded-full border border-sky-900/80 bg-sky-950/40 px-3 py-1.5 font-space-mono text-xs text-zinc-200">
                  {pill}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="relative"
            initial={isReducedMotion ? false : { opacity: 0, y: 24 }}
            animate={isReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={isReducedMotion ? undefined : { duration: 0.6, delay: 0.2 }}
          >
            <RouteNetwork reducedMotion={isReducedMotion} />
            <TripReceiptCard />
          </motion.div>
        </div>
      </section>

      <section id="problem" className="scroll-mt-20 border-y border-sky-950 bg-[#071a33]/70 px-4 py-20 md:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center font-serif text-4xl leading-tight tracking-tight md:text-5xl">Every Nepal bus ride is a leap of faith.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
            {problemMetrics.map((metric) => <CounterCard key={metric.title} metric={metric} reducedMotion={isReducedMotion} />)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 bg-[#051428]/40 px-4 py-20 md:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center font-serif text-4xl leading-tight tracking-tight md:text-5xl">Four layers. One seamless ride.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2 md:gap-5">
            {steps.map((step, index) => (
              <motion.article
                key={step.number}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6"
                initial={isReducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={isReducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={isReducedMotion ? undefined : { duration: 0.45, delay: index * 0.05 }}
                viewport={{ once: true, amount: 0.35 }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-space-mono text-sm text-amber-400">{step.number}</p>
                  <p className="font-space-mono text-xs uppercase text-zinc-500">{step.label}</p>
                </div>
                <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm text-zinc-400">{step.body}</p>
                <span className="mt-5 inline-block rounded-full border border-zinc-700 px-3 py-1 font-space-mono text-xs text-zinc-300">
                  {step.tech}
                </span>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 px-4 py-20 md:px-8 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
          <article id="for-passengers" className="scroll-mt-20 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h3 className="font-serif text-3xl">Passenger · यात्री</h3>
            <ul className="mt-5 space-y-3 text-zinc-300">
              {['Live bus location on map', 'Soulbound NFT receipt per trip', 'Proximity alerts when bus is near', 'Seat transparency (booked/available)'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm"><span className="text-amber-400">●</span><span>✓ {item}</span></li>
              ))}
            </ul>
          </article>

          <article id="for-drivers" className="scroll-mt-20 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h3 className="font-serif text-3xl">Driver · चालक</h3>
            <ul className="mt-5 space-y-3 text-zinc-300">
              {['ZK identity onboarding (no raw docs)', 'Route & seat management dashboard', 'On-chain trip logs auto-generated', 'SOS emergency alert button'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm"><span className="text-amber-400">●</span><span>✓ {item}</span></li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section id="comparison" className="scroll-mt-20 bg-[#051428]/35 px-4 py-20 md:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center font-serif text-4xl leading-tight tracking-tight md:text-5xl">The same trip, three different realities.</h2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="min-w-[700px] w-full text-sm">
              <thead className="bg-zinc-900">
                <tr className="text-left text-zinc-400">
                  <th className="px-4 py-3">Capability</th><th className="px-4 py-3">Yatra</th><th className="px-4 py-3">Traditional app</th><th className="px-4 py-3">Paper ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {[
                  ['Live GPS tracking', '✓', '◐', '✗'],
                  ['Driver verification', '✓', '◐', '✗'],
                  ['Trip receipt', '✓', '◐', '✗'],
                  ['Works offline', '✓', '◐', '✓'],
                  ['Fraud-proof', '✓', '✗', '✗'],
                ].map((row) => (
                  <tr key={row[0]}>
                    <td className="px-4 py-3 text-zinc-200">{row[0]}</td>
                    <td className="px-4 py-3 text-amber-400">{row[1]}</td>
                    <td className="px-4 py-3 text-zinc-400">{row[2]}</td>
                    <td className="px-4 py-3 text-zinc-600">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="built-on" className="scroll-mt-20 border-y border-sky-950 bg-[#081f3e]/60 px-4 py-16 md:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <p className="font-serif text-3xl">Standing on giants.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 font-space-mono text-zinc-300">
            {builtOnStack.map((logo) => (
              <span
                key={logo.name}
                className="inline-flex items-center gap-2 rounded-full border border-sky-900/70 bg-sky-950/40 px-3 py-1.5 text-xs tracking-[0.08em]"
              >
                {logo.src ? (
                  <Image
                    src={logo.src}
                    alt={`${logo.name} logo`}
                    width={14}
                    height={14}
                    className="h-3.5 w-3.5 invert brightness-0 opacity-80"
                  />
                ) : (
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-sky-400/70 text-[9px] leading-none text-sky-200">
                    J
                  </span>
                )}
                {logo.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 bg-[#041225]/35 px-4 py-20 md:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-serif text-4xl leading-tight tracking-tight md:text-5xl">FAQ</h2>
          <div className="mt-10 space-y-3">
            {[
              'Is my personal data safe with ZK verification?',
              "What if my wallet isn't connected when I board?",
              'Can I transfer or sell my NFT receipt?',
              'How accurate is the live bus tracking?',
              'Do drivers need crypto knowledge to use Yatra?',
            ].map((question) => (
              <details key={question} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <summary className="cursor-pointer list-none text-zinc-100 marker:content-none">{question}</summary>
                <p className="mt-3 text-sm text-zinc-400">
                  Yatra is built to be practical first: private by default, simple for non-crypto users, and verifiable on-chain for trust.
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="final-cta" className="scroll-mt-20 px-4 py-20 text-center md:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl rounded-3xl border border-sky-900/70 bg-[#0a203d]/80 p-8 md:p-12">
          <h2 className="font-serif text-4xl leading-tight tracking-tight md:text-6xl">Nepal&apos;s transit is going on-chain.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            Be the first to ride with Yatra. Join the waitlist — we&apos;ll notify you when we launch.
          </p>
          <div className="mx-auto mt-8 max-w-2xl">
            <WaitlistForm compact />
          </div>
          <p className="mt-6 text-sm text-zinc-500">🇳🇵 Built in Nepal · Powered by Solana</p>
        </div>
      </section>

      <footer className="border-t border-sky-950 px-4 py-10 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="font-serif text-2xl">यात्री · Yatra</p>
            <p className="mt-1 text-sm text-zinc-500">Nepal&apos;s Transit, Tokenized.</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-zinc-400">
            <Link href="/auth?role=passenger&redirect=/passenger" className="hover:text-amber-400">Passenger Login</Link>
            <Link href="/auth?role=driver&redirect=/driver" className="hover:text-amber-400">Driver Login</Link>
            <a href="https://github.com/gomugomucode/Yatra" target="_blank" rel="noreferrer" className="hover:text-amber-400">GitHub</a>
            <a href="https://x.com/TeamAparichit" target="_blank" rel="noreferrer" className="hover:text-amber-400">Twitter</a>
            <a href="https://solana.com/docs" target="_blank" rel="noreferrer" className="hover:text-amber-400">Docs</a>
          </div>
          <p className="text-sm text-zinc-500">© 2026 Yatra · Built by  TeamAparichit </p>
        </div>
      </footer>
    </div>
  );
}
