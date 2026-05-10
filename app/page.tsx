'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  motion,
  AnimatePresence,
  useTransform,
  useMotionValue,
  useSpring,
  MotionValue,
} from 'framer-motion';
import Lenis from 'lenis';
import { ArrowRight, ChevronDown } from 'lucide-react';
import TextPressure from '@/components/landing/TextPressure';
import { useAuth } from '@/lib/contexts/AuthContext';
import { subscribeToBuses } from '@/lib/firebaseDb';

// ─── Design constants ────────────────────────────────────────────────────────
const CYAN       = '#00D4AA';
const CHARCOAL   = '#1A1A1A';
const RUST       = '#C4501A';
const WHITE      = '#FAFAFA';
const DARK_GREEN = '#1A5E3A';

const PLAYFAIR = 'var(--font-playfair)';
const MONO     = 'var(--font-jetbrains-mono)';

// ─── Nepal map data ──────────────────────────────────────────────────────────
const NEPAL_PATH = `M 60,140 L 80,130 L 110,125 L 140,120 L 160,115 L 190,110
  L 220,108 L 250,105 L 280,100 L 310,98 L 340,95 L 370,90 L 400,88
  L 430,85 L 460,82 L 490,80 L 510,78 L 530,80 L 550,82 L 565,88
  L 570,100 L 560,112 L 545,118 L 530,125 L 510,130 L 490,135
  L 465,140 L 440,145 L 415,150 L 390,155 L 360,158 L 330,160
  L 300,162 L 270,165 L 240,163 L 210,158 L 180,155 L 150,152
  L 120,148 L 90,145 L 65,142 Z`;

const NEPAL_ROUTES = [
  { id: 'r1', d: 'M 80,138 Q 200,125 350,110 Q 450,98 555,90' },
  { id: 'r2', d: 'M 100,142 Q 220,132 360,118 Q 460,108 545,100' },
  { id: 'r3', d: 'M 120,145 Q 250,135 380,125 Q 470,115 540,108' },
  { id: 'r4', d: 'M 150,148 Q 280,140 400,132 Q 500,124 555,118' },
];

const NEPAL_CITIES = [
  { x: 100, y: 140, name: 'Dhangadhi',  primary: false },
  { x: 185, y: 132, name: 'Nepalganj',  primary: false },
  { x: 260, y: 130, name: 'Butwal',     primary: true  },
  { x: 320, y: 118, name: 'Pokhara',    primary: false },
  { x: 390, y: 112, name: 'Kathmandu',  primary: true  },
  { x: 470, y: 100, name: 'Biratnagar', primary: false },
  { x: 535, y: 95,  name: 'Ilam',       primary: false },
];

// ─── Transformation phases ───────────────────────────────────────────────────
type PhaseKey = 'FOLK' | 'SHIFT' | 'CODE' | 'PROTOCOL';

const PHASES: Record<PhaseKey, { badge: string; title: string; body: string; isTech: boolean }> = {
  FOLK: {
    badge: '01 · HERITAGE SYSTEM',
    title: 'Hand-written\nledgers.\nShouted routes.',
    body: 'Thousands of buses across Nepal, zero data. Drivers kept records in notebooks. Fares settled in cash at the window. Generations of passengers, none of it recorded.',
    isTech: false,
  },
  SHIFT: {
    badge: '02 · TRANSFORMATION',
    title: 'Every journey\nbecomes a\nsignal.',
    body: 'GPS pings, seat confirmations, driver check-ins — each action converted into protocol data. The bus does not change. Its relationship to the ledger does.',
    isTech: false,
  },
  CODE: {
    badge: '03 · PROTOCOL LAYER',
    title: 'The bus\nbecomes\na node.',
    body: 'DRIVER_REPUTATION: 98.4\nZK_PROOF: VALID ✓\nROUTES_VERIFIED: 1,247\n\nEach vehicle submits zero-knowledge proofs. Each fare settles on Solana. Immutable. Trustless.',
    isTech: true,
  },
  PROTOCOL: {
    badge: '04 · DEPIN NETWORK',
    title: "Nepal's roads,\ntokenized.",
    body: 'A self-sustaining transit mesh. No central operator. No paper tickets. No gatekeepers. Just protocol, physics, and the open road.',
    isTech: false,
  },
};

// ─── Grain overlay ───────────────────────────────────────────────────────────
function Grain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[200] overflow-hidden"
      style={{ opacity: 0.038 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        style={{ animation: 'grain 0.6s steps(1) infinite' }}
      >
        <filter id="grain-f">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-f)" />
      </svg>
    </div>
  );
}

// ─── Nepal map SVG ────────────────────────────────────────────────────────────
function NepalMap({
  routeColor = RUST,
  mapOpacity = 0.06,
  animated = false,
}: {
  routeColor?: string;
  mapOpacity?: number;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="40 75 540 100"
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: `drop-shadow(0 0 12px ${routeColor}22)` }}
    >
      <defs>
        {NEPAL_ROUTES.map((r) => (
          <linearGradient key={`lg-${r.id}`} id={`lg-${r.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={routeColor} stopOpacity="0" />
            <stop offset="40%"  stopColor={routeColor} stopOpacity="1" />
            <stop offset="60%"  stopColor={routeColor} stopOpacity="1" />
            <stop offset="100%" stopColor={routeColor} stopOpacity="0" />
          </linearGradient>
        ))}
        <filter id="dot-glow">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Nepal silhouette */}
      <path
        d={NEPAL_PATH}
        fill={`rgba(26,26,26,${mapOpacity * 1.5})`}
        stroke={`${routeColor}`}
        strokeWidth="0.8"
        strokeOpacity={mapOpacity * 8}
      />

      {/* Route lines */}
      {NEPAL_ROUTES.map((r, i) => (
        <g key={r.id}>
          <path d={r.d} fill="none" stroke={routeColor} strokeWidth="0.5" opacity={mapOpacity * 5} />
          {animated && (
            <path
              d={r.d}
              fill="none"
              stroke={`url(#lg-${r.id})`}
              strokeWidth="1.8"
              strokeDasharray="50 220"
              style={{
                animation: `routeFlow 4s linear infinite`,
                animationDelay: `${i * 1.1}s`,
              }}
            />
          )}
        </g>
      ))}

      {/* City dots */}
      {NEPAL_CITIES.map((c) => (
        <g key={c.name} opacity={mapOpacity * 12} filter="url(#dot-glow)">
          {c.primary && (
            <circle
              cx={c.x} cy={c.y} r="5"
              fill="none"
              stroke={routeColor}
              strokeWidth="0.8"
              opacity="0.5"
              style={{ animation: `cityPulse 3s ease-out infinite`, animationDelay: `${NEPAL_CITIES.indexOf(c) * 0.5}s` }}
            />
          )}
          <circle cx={c.x} cy={c.y} r="2" fill={routeColor} />
        </g>
      ))}
    </svg>
  );
}

// ─── Scroll-linked image sequence ────────────────────────────────────────────
const FRAME_COUNT = 121;
const frameSrc = (i: number) =>
  `/frames/frame_${String(i + 1).padStart(3, '0')}.jpg`;

type RICWindow = Window & { requestIdleCallback: (cb: () => void, o?: object) => void };
const ric = (cb: () => void, timeout: number) =>
  'requestIdleCallback' in window
    ? (window as RICWindow).requestIdleCallback(cb, { timeout })
    : setTimeout(cb, 16);

// Phase 1: load 5 keyframes immediately so any scroll position has a nearby frame.
// Phase 2: fill all remaining frames in chunks of 16 during idle time.
function preloadChunked(count: number, src: (i: number) => string, target: HTMLImageElement[]) {
  const keyframes = [0, Math.round(count * 0.25), Math.round(count * 0.5), Math.round(count * 0.75), count - 1];
  keyframes.forEach(k => { const img = new window.Image(); img.src = src(k); target[k] = img; });

  let i = 0;
  const next = () => {
    const end = Math.min(i + 16, count);
    for (; i < end; i++) {
      if (!target[i]) { const img = new window.Image(); img.src = src(i); target[i] = img; }
    }
    if (i < count) ric(next, 150);
  };
  ric(next, 80);
}

// ─── Bus SVG removed — replaced by scroll-linked frame sequence ──────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TransformBus({ progress }: { progress: MotionValue<number> }) {
  const folkOpacity = useTransform(progress, [0.18, 0.58], [1, 0]);
  const techOpacity = useTransform(progress, [0.28, 0.68], [0, 1]);

  return (
    <svg viewBox="0 0 480 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-xl">
      <defs>
        <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="window-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── FOLK LAYER ── */}
      <motion.g style={{ opacity: folkOpacity }}>
        {/* Roof rack */}
        <rect x="55" y="26" width="295" height="10" rx="3" fill="#6B2A00" opacity="0.9" />
        {[75, 120, 165, 210, 255, 295].map((x) => (
          <rect key={x} x={x} y="22" width="3.5" height="15" rx="1.5" fill="#5A2308" />
        ))}

        {/* Main roof */}
        <rect x="40" y="35" width="320" height="24" rx="7" fill="#8B3A0F" />

        {/* Roof stripe — gold */}
        <rect x="40" y="56" width="320" height="7" fill="#D4A017" opacity="0.9" />

        {/* Main body */}
        <rect x="10" y="60" width="390" height="95" rx="8" fill={RUST} />

        {/* Lower decorative band */}
        <rect x="10" y="130" width="390" height="16" fill="#8B3A0F" />
        {/* Diamond pattern on lower band */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <polygon
            key={i}
            points={`${28 + i * 42},130 ${42 + i * 42},138 ${28 + i * 42},146 ${14 + i * 42},138`}
            fill={i % 2 === 0 ? '#D4A017' : '#3A8B30'}
            opacity="0.85"
          />
        ))}

        {/* Side windows */}
        {[18, 78, 138, 198, 258].map((x) => (
          <g key={x}>
            <rect x={x} y="67" width="50" height="36" rx="4" fill="#AADCF0" opacity="0.85" />
            <rect x={x} y="67" width="50" height="36" rx="4" fill="none" stroke="#7A2A00" strokeWidth="1.5" />
          </g>
        ))}

        {/* Door */}
        <rect x="318" y="67" width="40" height="58" rx="4" fill="#8B3A0F" />
        <rect x="318" y="67" width="40" height="58" rx="4" fill="none" stroke="#6B2A00" strokeWidth="1.5" />
        <circle cx="353" cy="96" r="3" fill={RUST} />

        {/* Front section */}
        <rect x="395" y="50" width="52" height="108" rx="8" fill="#B04520" />
        {/* Windshield */}
        <rect x="401" y="58" width="38" height="44" rx="4" fill="#AADCF0" opacity="0.82" />
        <rect x="401" y="58" width="38" height="44" rx="4" fill="none" stroke="#7A2A00" strokeWidth="1.5" />
        {/* Headlights */}
        <ellipse cx="425" cy="120" rx="9" ry="6" fill="#FFF8C0" opacity="0.92" />
        <ellipse cx="425" cy="133" rx="6" ry="4" fill="#FF5722" opacity="0.8" />
        {/* Front bumper */}
        <rect x="395" y="154" width="52" height="7" rx="3" fill="#6B2A00" />

        {/* Wheel arches */}
        <ellipse cx="97"  cy="157" rx="32" ry="8" fill="#6B2A00" />
        <ellipse cx="315" cy="157" rx="32" ry="8" fill="#6B2A00" />

        {/* Wheels */}
        {[97, 315].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="168" r="26" fill="#1A1A1A" />
            <circle cx={cx} cy="168" r="17" fill="#272727" />
            <circle cx={cx} cy="168" r="8"  fill="#333" />
            <circle cx={cx} cy="168" r="3"  fill="#555" />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <line
                key={a}
                x1={cx + 4 * Math.cos((a * Math.PI) / 180)}
                y1={168 + 4 * Math.sin((a * Math.PI) / 180)}
                x2={cx + 16 * Math.cos((a * Math.PI) / 180)}
                y2={168 + 16 * Math.sin((a * Math.PI) / 180)}
                stroke="#444" strokeWidth="1.5"
              />
            ))}
          </g>
        ))}

        {/* Devanagari text */}
        <text x="420" y="105" textAnchor="middle" fill="#D4A017" fontSize="11" fontFamily="var(--font-mukta)" fontWeight="700" opacity="0.9">
          यात्रा
        </text>
      </motion.g>

      {/* ── TECH LAYER ── */}
      <motion.g style={{ opacity: techOpacity }}>
        {/* Dark roof */}
        <rect x="40" y="35" width="320" height="24" rx="7" fill="#0D0D0D" stroke={CYAN} strokeWidth="0.8" strokeOpacity="0.5" />

        {/* Dark body */}
        <rect x="10" y="60" width="390" height="95" rx="8" fill="#111111" />

        {/* Cyan body outline glow */}
        <rect x="10" y="60" width="390" height="95" rx="8" fill="none" stroke={CYAN} strokeWidth="1.5" filter="url(#cyan-glow)" />

        {/* HUD corner brackets */}
        <path d="M 10 60 L 10 78 M 10 60 L 28 60"   stroke={CYAN} strokeWidth="2"   />
        <path d="M 400 60 L 400 78 M 400 60 L 382 60" stroke={CYAN} strokeWidth="2"   />
        <path d="M 10 155 L 10 137 M 10 155 L 28 155"   stroke={CYAN} strokeWidth="2" />
        <path d="M 400 155 L 400 137 M 400 155 L 382 155" stroke={CYAN} strokeWidth="2" />

        {/* Circuit traces */}
        <path d="M 45 82 H 80 V 72 H 120 V 82 H 160" stroke={CYAN} strokeWidth="0.7" opacity="0.45" />
        <path d="M 200 82 H 240 V 92 H 280 V 82"      stroke={CYAN} strokeWidth="0.7" opacity="0.45" />
        <path d="M 45 118 H 390"                        stroke={CYAN} strokeWidth="0.5" strokeDasharray="4 8" opacity="0.25" />
        <path d="M 45 108 H 130 V 118"                  stroke={CYAN} strokeWidth="0.6" opacity="0.35" />
        <path d="M 290 108 H 370 V 118"                 stroke={CYAN} strokeWidth="0.6" opacity="0.35" />

        {/* Cyan bottom strip */}
        <rect x="10" y="149" width="390" height="4" rx="2" fill={CYAN} opacity="0.6" />

        {/* Cyan windows */}
        {[18, 78, 138, 198, 258].map((x) => (
          <g key={x}>
            <rect x={x} y="67" width="50" height="36" rx="4" fill={`${CYAN}18`} stroke={CYAN} strokeWidth="1" filter="url(#window-glow)" />
            <line x1={x + 25} y1="67" x2={x + 25} y2="103" stroke={CYAN} strokeWidth="0.5" opacity="0.4" />
          </g>
        ))}

        {/* Dark door */}
        <rect x="318" y="67" width="40" height="58" rx="4" fill={`${CYAN}10`} stroke={CYAN} strokeWidth="1" />

        {/* Front section tech */}
        <rect x="395" y="50" width="52" height="108" rx="8" fill="#0D0D0D" stroke={CYAN} strokeWidth="0.8" strokeOpacity="0.5" />
        <rect x="401" y="58" width="38" height="44" rx="4" fill={`${CYAN}22`} stroke={CYAN} strokeWidth="1" />

        {/* Headlights — cyan */}
        <ellipse cx="425" cy="120" rx="9" ry="6" fill={CYAN} opacity="0.8" filter="url(#cyan-glow)" />
        <ellipse cx="425" cy="133" rx="5" ry="3.5" fill={CYAN} opacity="0.4" />

        {/* GPS antenna */}
        <line x1="240" y1="35" x2="240" y2="12" stroke={CYAN} strokeWidth="1.5" />
        <circle cx="240" cy="9" r="5" fill={CYAN} filter="url(#cyan-glow)" />
        <circle cx="240" cy="9" r="9" fill="none" stroke={CYAN} strokeWidth="0.8" opacity="0.5" style={{ animation: 'cityPulse 2s ease-out infinite' }} />

        {/* Protocol text on bus */}
        <rect x="65" y="123" width="200" height="14" rx="3" fill={`${CYAN}15`} />
        <text x="165" y="133" textAnchor="middle" fill={CYAN} fontSize="7.5" fontFamily="var(--font-jetbrains-mono)" fontWeight="600">
          YATRA_PROTOCOL · v1.0 · BUTWAL
        </text>

        {/* Dark wheel covers */}
        {[97, 315].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="168" r="26" fill="#0D0D0D" stroke={CYAN} strokeWidth="1" />
            <circle cx={cx} cy="168" r="16" fill="none" stroke={CYAN} strokeWidth="0.5" opacity="0.4" />
            <circle cx={cx} cy="168" r="5"  fill={CYAN} opacity="0.6" filter="url(#cyan-glow)" />
          </g>
        ))}
      </motion.g>
    </svg>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ onlineBuses }: { onlineBuses: number | null }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { currentUser, role, signOut } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: scrolled ? 'rgba(250,250,250,0.82)' : 'rgba(250,250,250,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: scrolled ? '0.5px solid rgba(26,26,26,0.08)' : '0.5px solid transparent',
        transition: 'background 0.3s, border-color 0.3s',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3">
          <Image src="/yatra-logo.png" alt="Yatra" width={38} height={38} className="rounded-lg" priority />
          <span style={{ fontFamily: MONO, fontSize: '11px', color: CHARCOAL, letterSpacing: '0.2em', fontWeight: 700 }}>
            YATRA
          </span>
          {onlineBuses !== null && onlineBuses > 0 && (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full ml-1"
              style={{ background: `${CYAN}12`, border: `0.5px solid ${CYAN}50` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: CYAN, animation: 'pulse 2s infinite' }} />
              <span style={{ fontFamily: MONO, fontSize: '9px', color: CYAN, letterSpacing: '0.12em', fontWeight: 600 }}>
                {onlineBuses} LIVE
              </span>
            </div>
          )}
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-10">
          {[
            { label: 'OVERVIEW',   href: '#overview'    },
            { label: 'TRANSFORM',  href: '#transform'   },
            { label: 'DEPIN',      href: '#depin'       },
            { label: 'REPUTATION', href: '#reputation'  },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{ fontFamily: MONO, fontSize: '13px', color: DARK_GREEN, letterSpacing: '0.15em', textDecoration: 'none', transition: 'color 0.2s', fontWeight: 600 }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#0D3D24')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = DARK_GREEN)}
            >
              {label}
            </a>
          ))}
        </div>

        {/* Auth CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {isClient && currentUser ? (
            <>
              <Link href={role === 'driver' ? '/driver' : '/passenger'}>
                <button style={{ fontFamily: MONO, fontSize: '10px', background: 'none', color: `${CHARCOAL}70`, border: 'none', cursor: 'pointer', letterSpacing: '0.12em', padding: '6px 0' }}>
                  DASHBOARD
                </button>
              </Link>
              <button
                onClick={() => signOut()}
                style={{ fontFamily: MONO, fontSize: '10px', background: CHARCOAL, color: WHITE, border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', letterSpacing: '0.12em', fontWeight: 600 }}
              >
                LOGOUT
              </button>
            </>
          ) : (
            <>
              <Link href="/auth">
                <button style={{ fontFamily: MONO, fontSize: '10px', background: 'none', color: `${CHARCOAL}70`, border: 'none', cursor: 'pointer', letterSpacing: '0.12em', padding: '6px 0' }}>
                  LOGIN
                </button>
              </Link>
              <Link href="/auth?isSignUp=true">
                <button style={{ fontFamily: MONO, fontSize: '10px', background: CHARCOAL, color: WHITE, border: 'none', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', letterSpacing: '0.12em', fontWeight: 600 }}>
                  JOIN WAITLIST
                </button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2"
          onClick={() => setOpen(!open)}
          style={{ color: CHARCOAL, background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ background: 'rgba(250,250,250,0.98)', borderTop: '0.5px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}
          >
            <div className="px-6 py-6 space-y-1">
              {[
                { label: 'OVERVIEW',   href: '#overview'   },
                { label: 'TRANSFORM',  href: '#transform'  },
                { label: 'DEPIN',      href: '#depin'      },
                { label: 'REPUTATION', href: '#reputation' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="block py-3"
                  style={{ fontFamily: MONO, fontSize: '13px', color: DARK_GREEN, letterSpacing: '0.15em', textDecoration: 'none', fontWeight: 600 }}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </a>
              ))}
              <div className="pt-4" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                <Link href="/auth?isSignUp=true" onClick={() => setOpen(false)}>
                  <button style={{ width: '100%', padding: '14px', background: CHARCOAL, color: WHITE, border: 'none', borderRadius: '8px', fontFamily: MONO, fontSize: '11px', letterSpacing: '0.12em', cursor: 'pointer', fontWeight: 600 }}>
                    JOIN WAITLIST
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────
function HeroSection({ onlineBuses }: { onlineBuses: number | null }) {
  const containerV = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.4 } },
  };
  const itemV = {
    hidden:  { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 20 } },
  };

  return (
    <section id="overview" className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16" style={{ background: WHITE }}>
      {/* Nepal map watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.055 }}>
        <div className="w-full max-w-5xl px-8">
          <NepalMap routeColor={RUST} mapOpacity={1} animated={false} />
        </div>
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 max-w-5xl mx-auto px-6 py-24 w-full"
        variants={containerV}
        initial="hidden"
        animate="visible"
      >
        {/* Live badge */}
        <motion.div variants={itemV} className="mb-10">
          <div
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full"
            style={{ background: `${CYAN}10`, border: `1px solid ${CYAN}35` }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: CYAN, boxShadow: `0 0 8px ${CYAN}`, animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}
            />
            <span style={{ fontFamily: MONO, fontSize: '10px', color: CYAN, letterSpacing: '0.2em', fontWeight: 600 }}>
              LIVE — BUTWAL, NEPAL
            </span>
            {onlineBuses !== null && (
              <span style={{ fontFamily: MONO, fontSize: '9px', color: `${CYAN}80`, letterSpacing: '0.1em' }}>
                · {onlineBuses} BUSES ACTIVE
              </span>
            )}
          </div>
        </motion.div>

        {/* Interactive headline — TextPressure variable font */}
        <motion.div variants={itemV} className="mb-8 w-full">
          <div style={{ position: 'relative', height: 'clamp(64px, 9.5vw, 128px)' }}>
            <TextPressure
              text="Nepal's Transit,"
              fontFamily="Compressa VF"
              fontUrl="https://res.cloudinary.com/dr6lvwubh/raw/upload/v1529908256/CompressaPRO-GX.woff2"
              flex
              weight
              width
              italic
              textColor={CHARCOAL}
              minFontSize={36}
            />
          </div>
          <div style={{ position: 'relative', height: 'clamp(80px, 12vw, 160px)' }}>
            <TextPressure
              text="Reimagined."
              fontFamily="Compressa VF"
              fontUrl="https://res.cloudinary.com/dr6lvwubh/raw/upload/v1529908256/CompressaPRO-GX.woff2"
              flex
              weight
              width
              italic
              textColor={RUST}
              minFontSize={40}
            />
          </div>
        </motion.div>

        {/* Subline */}
        <motion.p
          variants={itemV}
          className="mb-14 max-w-xl"
          style={{ fontSize: '1.125rem', color: `${CHARCOAL}70`, lineHeight: 1.65, fontWeight: 400 }}
        >
          From the dusty roads of Butwal to the immutable ledger of the blockchain.
          Real-time transit tracking, ZK-verified identity, Solana settlement.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={itemV} className="flex flex-col sm:flex-row gap-4">
          <Link href="/auth?role=passenger&redirect=/passenger">
            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{
                fontFamily: MONO,
                fontSize: '11px',
                letterSpacing: '0.15em',
                fontWeight: 700,
                background: CHARCOAL,
                color: WHITE,
                border: 'none',
                padding: '16px 36px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              BOARD THE BUS
              <ArrowRight size={14} />
            </motion.button>
          </Link>
          <Link href="/auth?role=driver&redirect=/driver">
            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{
                fontFamily: MONO,
                fontSize: '11px',
                letterSpacing: '0.15em',
                fontWeight: 700,
                background: 'none',
                color: CHARCOAL,
                border: `1.5px solid ${CHARCOAL}30`,
                padding: '16px 36px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              DRIVE THE NETWORK
            </motion.button>
          </Link>
        </motion.div>

        {/* Trust bar */}
        <motion.div variants={itemV} className="mt-16 flex flex-wrap gap-8">
          {[
            { label: 'ZK-VERIFIED IDENTITY' },
            { label: 'SOLANA SETTLEMENT'    },
            { label: 'REAL-TIME GPS'        },
          ].map(({ label }) => (
            <span
              key={label}
              style={{ fontFamily: MONO, fontSize: '9px', color: `${CHARCOAL}45`, letterSpacing: '0.2em' }}
            >
              {label}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ opacity: 0.35 }}
      >
        <span style={{ fontFamily: MONO, fontSize: '8px', color: CHARCOAL, letterSpacing: '0.2em' }}>SCROLL</span>
        <ChevronDown size={14} color={CHARCOAL} />
      </motion.div>
    </section>
  );
}

// ─── Transformation section ───────────────────────────────────────────────────
function TransformSection() {
  const sectionRef     = useRef<HTMLElement>(null);
  const panelRef       = useRef<HTMLDivElement>(null);
  const frameImgRef    = useRef<HTMLImageElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const preloadRef     = useRef<HTMLImageElement[]>([]);
  const frameRef       = useRef(-1);
  const phaseRef       = useRef<PhaseKey>('FOLK');

  const [phase, setPhase]       = useState<PhaseKey>('FOLK');
  const [sectionH, setSectionH] = useState('400vh');

  useEffect(() => {
    const update = () => setSectionH(window.innerWidth < 768 ? '250vh' : '400vh');
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  const scrollProgress = useMotionValue(0);
  const bgColor = useTransform(
    scrollProgress,
    [0, 0.40, 0.65, 0.85, 1],
    [WHITE, WHITE, '#F5F0EC', '#F0F5F4', WHITE],
  );

  useEffect(() => {
    const section = sectionRef.current;
    const panel   = panelRef.current;
    if (!section || !panel) return;

    // Lazy-preload in idle-time chunks when section approaches
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && preloadRef.current.length === 0)
          preloadChunked(FRAME_COUNT, frameSrc, preloadRef.current);
      },
      { rootMargin: '350% 0px' }
    );
    observer.observe(section);

    // Cache geometry — reading offsetTop in every RAF tick forces layout reflow
    let sectionTop    = section.offsetTop;
    let sectionHeight = section.offsetHeight;
    const updateGeometry = () => {
      sectionTop    = section.offsetTop;
      sectionHeight = section.offsetHeight;
    };
    window.addEventListener('resize', updateGeometry, { passive: true });

    // Cache scrollY via scroll event — mobile compositor updates async
    let cachedScrollY = window.scrollY;
    const onScroll = () => { cachedScrollY = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });

    let displayV    = 0;
    let prevScrollV = 0;
    let lastTime    = 0;
    const AUTO_SPEED = 1 / (5 * 1000);

    let rafId: number | null = null;
    let active = false;

    const tick = (time: number) => {
      const dt = lastTime > 0 ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;

      const scrollY = cachedScrollY;
      const vh      = window.innerHeight;
      const maxScroll     = sectionHeight - vh;

      // JS-based sticky pin
      if (scrollY <= sectionTop) {
        panel.style.position = 'absolute';
        panel.style.top      = '0';
        panel.style.bottom   = '';
        // Reset when above section so auto restarts on re-entry
        displayV = 0; prevScrollV = 0;
      } else if (scrollY >= sectionTop + maxScroll) {
        panel.style.position = 'absolute';
        panel.style.top      = '';
        panel.style.bottom   = '0';
      } else {
        panel.style.position = 'fixed';
        panel.style.top      = '0';
        panel.style.bottom   = '';
      }

      const scrollV = maxScroll > 0
        ? Math.max(0, Math.min(1, (scrollY - sectionTop) / maxScroll))
        : 0;

      const inRange     = scrollY > sectionTop && scrollY < sectionTop + maxScroll;
      const isScrolling = Math.abs(scrollV - prevScrollV) > 0.0002;

      if (isScrolling) {
        // Snap directly to scroll — Lenis already smoothed it
        displayV = scrollV;
      } else if (inRange) {
        // Auto-play: constant linear speed, no lerp so it never lags
        displayV = Math.min(1, displayV + AUTO_SPEED * dt);
      }

      prevScrollV = scrollV;

      const v = displayV;
      const c = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(v * (FRAME_COUNT - 1))));

      if (c !== frameRef.current) {
        frameRef.current = c;
        const qf = preloadRef.current[c];
        if (frameImgRef.current && qf?.src) frameImgRef.current.src = qf.src;
      }
      if (progressBarRef.current)
        progressBarRef.current.style.height = `${v * 100}%`;

      scrollProgress.set(v);

      const newPhase: PhaseKey =
        c < Math.round(FRAME_COUNT * 0.25) ? 'FOLK'  :
        c < Math.round(FRAME_COUNT * 0.50) ? 'SHIFT' :
        c < Math.round(FRAME_COUNT * 0.75) ? 'CODE'  : 'PROTOCOL';

      if (newPhase !== phaseRef.current) {
        phaseRef.current = newPhase;
        setPhase(newPhase);
      }

      if (active) rafId = requestAnimationFrame(tick);
    };

    // Only run RAF when section is near the viewport
    const visObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { active = true; rafId = requestAnimationFrame(tick); }
        else { active = false; if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }
      },
      { rootMargin: '200px 0px' }
    );
    visObs.observe(section);

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      visObs.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateGeometry);
    };
  }, [scrollProgress]);

  const data = PHASES[phase];

  return (
    <section
      id="transform"
      ref={sectionRef}
      style={{ height: sectionH, position: 'relative' }}
    >
      {/* Panel starts absolute, becomes position:fixed while pinned, absolute again at end */}
      <motion.div
        ref={panelRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: bgColor,
        }}
      >
        {/* Progress rail */}
        <div
          className="absolute right-6 top-1/2 -translate-y-1/2 w-px hidden md:block"
          style={{ height: '140px', background: `${CHARCOAL}12`, zIndex: 10 }}
        >
          <div
            ref={progressBarRef}
            className="w-full"
            style={{ height: '0%', background: CHARCOAL }}
          />
          {(['FOLK', 'SHIFT', 'CODE', 'PROTOCOL'] as PhaseKey[]).map((p, i) => (
            <div
              key={p}
              className="absolute -left-1.5 w-3 h-3 rounded-full"
              style={{
                top: `${i * 33.3}%`,
                background: p === phase ? CHARCOAL : `${CHARCOAL}20`,
                border: `1.5px solid ${p === phase ? CHARCOAL : `${CHARCOAL}20`}`,
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        <div className="h-full max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-3 md:gap-14 py-4 md:py-20">
          {/* ── LEFT: Phase text ── */}
          <div className="w-full md:w-7/12 flex flex-col justify-center">
            <div
              className="mb-2 md:mb-8 inline-block"
              style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.22em', color: data.isTech ? CYAN : DARK_GREEN }}
            >
              {data.badge}
            </div>

            <AnimatePresence mode="wait">
              <motion.h2
                key={phase + '-title'}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  fontFamily: data.isTech ? MONO : PLAYFAIR,
                  fontSize: data.isTech ? 'clamp(1.6rem, 3vw, 2.6rem)' : 'clamp(2rem, 4vw, 3.4rem)',
                  fontWeight: 700,
                  lineHeight: data.isTech ? 1.15 : 0.95,
                  color: CHARCOAL,
                  letterSpacing: data.isTech ? '0.02em' : '-0.02em',
                  whiteSpace: 'pre-line',
                  marginBottom: '1.25rem',
                }}
              >
                {data.title}
              </motion.h2>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.p
                key={phase + '-body'}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                style={{
                  fontFamily: data.isTech ? MONO : 'inherit',
                  fontSize: data.isTech ? '0.82rem' : '1rem',
                  lineHeight: 1.75,
                  color: data.isTech ? CYAN : `${CHARCOAL}65`,
                  whiteSpace: 'pre-line',
                  letterSpacing: data.isTech ? '0.04em' : 'inherit',
                  maxWidth: '480px',
                }}
              >
                {data.body}
              </motion.p>
            </AnimatePresence>

            <div className="mt-4 md:mt-12 flex gap-3">
              {(['FOLK', 'SHIFT', 'CODE', 'PROTOCOL'] as PhaseKey[]).map((p) => (
                <div
                  key={p}
                  style={{
                    width: p === phase ? '28px' : '8px',
                    height: '2px',
                    borderRadius: '2px',
                    background: p === phase ? (data.isTech ? CYAN : CHARCOAL) : `${CHARCOAL}20`,
                    transition: 'width 0.4s ease, background 0.4s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT: Frame sequence ── */}
          <div className="w-full md:w-5/12 relative flex items-center justify-center">
            <div className="relative w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={frameImgRef}
                src={frameSrc(0)}
                alt="bus transformation"
                width={1176}
                height={780}
                className="w-full h-auto"
                style={{ display: 'block' }}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Taxi section ─────────────────────────────────────────────────────────────
const TAXI_FRAME_COUNT = 121;
const taxiFrameSrc = (i: number) =>
  `/frames-taxi/frame_${String(i + 1).padStart(3, '0')}.jpg`;

type TaxiPhaseKey = 'STREET' | 'CONNECT' | 'VERIFY' | 'MESH';

const TAXI_PHASES: Record<TaxiPhaseKey, { badge: string; title: string; body: string; isTech: boolean }> = {
  STREET: {
    badge: '01 · STREET ECONOMY',
    title: 'Hailed by hand.\nPaid in cash.\nNo record.',
    body: 'Kathmandu\'s taxis run on trust and muscle memory. No meter standards. No ride history. Fares negotiated at the window, disputes settled by argument.',
    isTech: false,
  },
  CONNECT: {
    badge: '02 · GOING DIGITAL',
    title: 'Every ride\nbecomes a\ndatapoint.',
    body: 'GPS-linked pickups, digital fare confirmation, passenger check-ins — each trip feeds the protocol. The taxi doesn\'t change. Its data does.',
    isTech: false,
  },
  VERIFY: {
    badge: '03 · ZERO-KNOWLEDGE',
    title: 'Identity\nproven.\nNever exposed.',
    body: 'DRIVER_ID: ZK_VERIFIED ✓\nLICENSE: ON-CHAIN\nFARE_SETTLED: 0.4s\n\nDrivers prove their credentials without revealing personal data. Passengers travel with verified certainty.',
    isTech: true,
  },
  MESH: {
    badge: '04 · RIDE NETWORK',
    title: "Nepal's taxis,\none protocol.",
    body: 'From Thamel to Patan, every cab a node. Reputation portable. Fares immutable. No dispatcher. No middleman. Just the city and the chain.',
    isTech: false,
  },
};

function TaxiSection() {
  const sectionRef     = useRef<HTMLElement>(null);
  const panelRef       = useRef<HTMLDivElement>(null);
  const frameImgRef    = useRef<HTMLImageElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const preloadRef     = useRef<HTMLImageElement[]>([]);
  const frameRef       = useRef(-1);
  const phaseRef       = useRef<TaxiPhaseKey>('STREET');

  const [phase, setPhase]       = useState<TaxiPhaseKey>('STREET');
  const [sectionH, setSectionH] = useState('400vh');

  useEffect(() => {
    const update = () => setSectionH(window.innerWidth < 768 ? '250vh' : '400vh');
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  const scrollProgress = useMotionValue(0);
  const bgColor = useTransform(
    scrollProgress,
    [0, 0.40, 0.65, 0.85, 1],
    [WHITE, WHITE, '#F0F5F4', '#F5F0EC', WHITE],
  );

  useEffect(() => {
    const section = sectionRef.current;
    const panel   = panelRef.current;
    if (!section || !panel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && preloadRef.current.length === 0)
          preloadChunked(TAXI_FRAME_COUNT, taxiFrameSrc, preloadRef.current);
      },
      { rootMargin: '350% 0px' }
    );
    observer.observe(section);

    let sectionTop    = section.offsetTop;
    let sectionHeight = section.offsetHeight;
    const updateGeometry = () => {
      sectionTop    = section.offsetTop;
      sectionHeight = section.offsetHeight;
    };
    window.addEventListener('resize', updateGeometry, { passive: true });

    let cachedScrollY = window.scrollY;
    const onScroll = () => { cachedScrollY = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });

    let displayV    = 0;
    let prevScrollV = 0;
    let lastTime    = 0;
    const AUTO_SPEED = 1 / (5 * 1000);

    let rafId: number | null = null;
    let active = false;

    const tick = (time: number) => {
      const dt = lastTime > 0 ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;

      const scrollY  = cachedScrollY;
      const vh       = window.innerHeight;
      const maxScroll = sectionHeight - vh;

      if (scrollY <= sectionTop) {
        panel.style.position = 'absolute';
        panel.style.top      = '0';
        panel.style.bottom   = '';
        displayV = 0; prevScrollV = 0;
      } else if (scrollY >= sectionTop + maxScroll) {
        panel.style.position = 'absolute';
        panel.style.top      = '';
        panel.style.bottom   = '0';
      } else {
        panel.style.position = 'fixed';
        panel.style.top      = '0';
        panel.style.bottom   = '';
      }

      const scrollV = maxScroll > 0
        ? Math.max(0, Math.min(1, (scrollY - sectionTop) / maxScroll))
        : 0;

      const inRange     = scrollY > sectionTop && scrollY < sectionTop + maxScroll;
      const isScrolling = Math.abs(scrollV - prevScrollV) > 0.0002;

      if (isScrolling) {
        displayV = scrollV;
      } else if (inRange) {
        displayV = Math.min(1, displayV + AUTO_SPEED * dt);
      }

      prevScrollV = scrollV;

      const v = displayV;
      const c = Math.max(0, Math.min(TAXI_FRAME_COUNT - 1, Math.round(v * (TAXI_FRAME_COUNT - 1))));

      if (c !== frameRef.current) {
        frameRef.current = c;
        const qt = preloadRef.current[c];
        if (frameImgRef.current && qt?.src) frameImgRef.current.src = qt.src;
      }
      if (progressBarRef.current)
        progressBarRef.current.style.height = `${v * 100}%`;

      scrollProgress.set(v);

      const newPhase: TaxiPhaseKey =
        c < Math.round(TAXI_FRAME_COUNT * 0.25) ? 'STREET'  :
        c < Math.round(TAXI_FRAME_COUNT * 0.50) ? 'CONNECT' :
        c < Math.round(TAXI_FRAME_COUNT * 0.75) ? 'VERIFY'  : 'MESH';

      if (newPhase !== phaseRef.current) {
        phaseRef.current = newPhase;
        setPhase(newPhase);
      }

      if (active) rafId = requestAnimationFrame(tick);
    };

    const visObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { active = true; rafId = requestAnimationFrame(tick); }
        else { active = false; if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }
      },
      { rootMargin: '200px 0px' }
    );
    visObs.observe(section);

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      visObs.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateGeometry);
    };
  }, [scrollProgress]);

  const data = TAXI_PHASES[phase];

  return (
    <section
      id="taxi-transform"
      ref={sectionRef}
      style={{ height: sectionH, position: 'relative' }}
    >
      <motion.div
        ref={panelRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: bgColor,
        }}
      >
        {/* Progress rail */}
        <div
          className="absolute left-6 top-1/2 -translate-y-1/2 w-px hidden md:block"
          style={{ height: '140px', background: `${CHARCOAL}12`, zIndex: 10 }}
        >
          <div
            ref={progressBarRef}
            className="w-full"
            style={{ height: '0%', background: CHARCOAL }}
          />
          {(['STREET', 'CONNECT', 'VERIFY', 'MESH'] as TaxiPhaseKey[]).map((p, i) => (
            <div
              key={p}
              className="absolute -left-1.5 w-3 h-3 rounded-full"
              style={{
                top: `${i * 33.3}%`,
                background: p === phase ? CHARCOAL : `${CHARCOAL}20`,
                border: `1.5px solid ${p === phase ? CHARCOAL : `${CHARCOAL}20`}`,
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        <div className="h-full max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-3 md:gap-14 py-4 md:py-20">
          {/* ── LEFT: Frame sequence ── */}
          <div className="w-full md:w-5/12 relative flex items-center justify-center">
            <div className="relative w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={frameImgRef}
                src={taxiFrameSrc(0)}
                alt="taxi transformation"
                width={1172}
                height={1764}
                className="h-[45vh] w-auto md:h-full md:max-h-[80vh]"
                style={{ display: 'block' }}
              />
            </div>
          </div>

          {/* ── RIGHT: Phase text ── */}
          <div className="w-full md:w-7/12 flex flex-col justify-center">
            <div
              className="mb-2 md:mb-8 inline-block"
              style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.22em', color: data.isTech ? CYAN : DARK_GREEN }}
            >
              {data.badge}
            </div>

            <AnimatePresence mode="wait">
              <motion.h2
                key={phase + '-title'}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  fontFamily: data.isTech ? MONO : PLAYFAIR,
                  fontSize: data.isTech ? 'clamp(1.6rem, 3vw, 2.6rem)' : 'clamp(2rem, 4vw, 3.4rem)',
                  fontWeight: 700,
                  lineHeight: data.isTech ? 1.15 : 0.95,
                  color: CHARCOAL,
                  letterSpacing: data.isTech ? '0.02em' : '-0.02em',
                  whiteSpace: 'pre-line',
                  marginBottom: '1.25rem',
                }}
              >
                {data.title}
              </motion.h2>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.p
                key={phase + '-body'}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                style={{
                  fontFamily: data.isTech ? MONO : 'inherit',
                  fontSize: data.isTech ? '0.82rem' : '1rem',
                  lineHeight: 1.75,
                  color: data.isTech ? CYAN : `${CHARCOAL}65`,
                  whiteSpace: 'pre-line',
                  letterSpacing: data.isTech ? '0.04em' : 'inherit',
                  maxWidth: '480px',
                }}
              >
                {data.body}
              </motion.p>
            </AnimatePresence>

            <div className="mt-4 md:mt-12 flex gap-3">
              {(['STREET', 'CONNECT', 'VERIFY', 'MESH'] as TaxiPhaseKey[]).map((p) => (
                <div
                  key={p}
                  style={{
                    width: p === phase ? '28px' : '8px',
                    height: '2px',
                    borderRadius: '2px',
                    background: p === phase ? (data.isTech ? CYAN : CHARCOAL) : `${CHARCOAL}20`,
                    transition: 'width 0.4s ease, background 0.4s ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Bike + Auto section (three-column) ──────────────────────────────────────
const BIKE_FRAME_COUNT = 121;
const AUTO_FRAME_COUNT = 121;
const bikeFrameSrc = (i: number) => `/frames-bike/frame_${String(i + 1).padStart(3, '0')}.jpg`;
const autoFrameSrc = (i: number) => `/frames-auto/frame_${String(i + 1).padStart(3, '0')}.jpg`;

type FleetPhaseKey = 'ORIGINS' | 'SIGNAL' | 'PROVEN' | 'FLEET';

const FLEET_PHASES: Record<FleetPhaseKey, { badge: string; title: string; body: string; isTech: boolean }> = {
  ORIGINS: {
    badge: '01 · STREET ORIGINS',
    title: 'Two wheels.\nThree wheels.\nOne city.',
    body: 'The bike weaves through Kathmandu traffic. The auto fills the gaps no bus can reach. Neither has a record. Neither has a score.',
    isTech: false,
  },
  SIGNAL: {
    badge: '02 · GOING ON-CHAIN',
    title: 'Every trip\nis now a\ntransaction.',
    body: 'GPS check-ins, fare confirmations, route completions — every movement becomes a verifiable data point. The city starts to have memory.',
    isTech: false,
  },
  PROVEN: {
    badge: '03 · PROTOCOL LAYER',
    title: 'Identity\nproven.\nReputation\nearned.',
    body: 'BIKE_NODE: ZK_VERIFIED ✓\nAUTO_NODE: ZK_VERIFIED ✓\nCOMBINED_ROUTES: 3,841\n\nTwo vehicle classes. One trust layer. Immutable on Solana.',
    isTech: true,
  },
  FLEET: {
    badge: '04 · THE NETWORK',
    title: "Nepal's full\nfleet.\nProtocolized.",
    body: 'Bus. Taxi. Bike. Auto. Every vehicle class a node. Every driver a verified participant. No gatekeepers. No paper. Just the open road and the chain.',
    isTech: false,
  },
};

function MobileCircle({ mobilePhase, suffix }: { mobilePhase: FleetPhaseKey; suffix: string }) {
  const d = FLEET_PHASES[mobilePhase];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {(['ORIGINS', 'SIGNAL', 'PROVEN', 'FLEET'] as FleetPhaseKey[]).map((p) => (
          <div key={p} style={{ width: p === mobilePhase ? '24px' : '6px', height: '2px', borderRadius: '2px', background: p === mobilePhase ? (d.isTech ? CYAN : CHARCOAL) : `${CHARCOAL}20`, transition: 'width 0.4s ease, background 0.4s ease' }} />
        ))}
      </div>
      <div style={{ width: 'clamp(140px, 46vw, 200px)', height: 'clamp(140px, 46vw, 200px)', borderRadius: '50%', border: `1.5px solid ${d.isTech ? CYAN : CHARCOAL}30`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center', background: d.isTech ? `${CYAN}06` : 'transparent', transition: 'border-color 0.4s, background 0.4s' }}>
        <div style={{ fontFamily: MONO, fontSize: '9px', color: d.isTech ? CYAN : `${CHARCOAL}50`, letterSpacing: '0.18em', marginBottom: '8px' }}>{d.badge}</div>
        <AnimatePresence mode="wait">
          <motion.div
            key={mobilePhase + '-' + suffix}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.35 }}
            style={{ fontFamily: d.isTech ? MONO : PLAYFAIR, fontSize: d.isTech ? '0.78rem' : '1rem', fontWeight: 700, color: d.isTech ? CYAN : CHARCOAL, lineHeight: 1.2, letterSpacing: d.isTech ? '0.04em' : '-0.01em', whiteSpace: 'pre-line' }}
          >
            {d.title}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function BikeAutoSection() {
  const sectionRef    = useRef<HTMLElement>(null);
  const panelRef      = useRef<HTMLDivElement>(null);
  const bikeImgRef    = useRef<HTMLImageElement>(null);
  const autoImgRef    = useRef<HTMLImageElement>(null);
  const bikeImgMobileRef = useRef<HTMLImageElement>(null);
  const autoImgMobileRef = useRef<HTMLImageElement>(null);
  const mobilePanelRef   = useRef<HTMLDivElement>(null);
  const mobileViewRef    = useRef<'bike' | 'auto'>('bike');
  const mobilePhaseRef   = useRef<FleetPhaseKey>('ORIGINS');
  const progressBarRef   = useRef<HTMLDivElement>(null);
  const bikePreload      = useRef<HTMLImageElement[]>([]);
  const autoPreload      = useRef<HTMLImageElement[]>([]);
  const bikeFrameRef     = useRef(-1);
  const autoFrameRef     = useRef(-1);
  const phaseRef         = useRef<FleetPhaseKey>('ORIGINS');

  const [phase, setPhase]             = useState<FleetPhaseKey>('ORIGINS');
  const [mobileView, setMobileView]   = useState<'bike' | 'auto'>('bike');
  const [mobilePhase, setMobilePhase] = useState<FleetPhaseKey>('ORIGINS');
  const sectionH = '400vh';

  const scrollProgress = useMotionValue(0);

  useEffect(() => {
    const section = sectionRef.current;
    const panel   = panelRef.current;
    if (!section || !panel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && bikePreload.current.length === 0) {
          preloadChunked(BIKE_FRAME_COUNT, bikeFrameSrc, bikePreload.current);
          setTimeout(() => preloadChunked(AUTO_FRAME_COUNT, autoFrameSrc, autoPreload.current), 800);
        }
      },
      { rootMargin: '350% 0px' }
    );
    observer.observe(section);

    let sectionTop    = section.offsetTop;
    let sectionHeight = section.offsetHeight;
    const updateGeometry = () => {
      sectionTop    = section.offsetTop;
      sectionHeight = section.offsetHeight;
    };
    window.addEventListener('resize', updateGeometry, { passive: true });

    let cachedScrollY = window.scrollY;
    const onScroll = () => { cachedScrollY = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });

    let displayV    = 0;
    let prevScrollV = 0;
    let lastTime    = 0;
    const AUTO_SPEED = 1 / (5 * 1000);

    let rafId: number | null = null;
    let active = false;

    const tick = (time: number) => {
      const dt = lastTime > 0 ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;

      const scrollY   = cachedScrollY;
      const vh        = window.innerHeight;
      const maxScroll = sectionHeight - vh;

      if (scrollY <= sectionTop) {
        panel.style.position = 'absolute';
        panel.style.top      = '0';
        panel.style.bottom   = '';
        displayV = 0; prevScrollV = 0;
      } else if (scrollY >= sectionTop + maxScroll) {
        panel.style.position = 'absolute';
        panel.style.top      = '';
        panel.style.bottom   = '0';
      } else {
        panel.style.position = 'fixed';
        panel.style.top      = '0';
        panel.style.bottom   = '';
      }

      const scrollV     = maxScroll > 0 ? Math.max(0, Math.min(1, (scrollY - sectionTop) / maxScroll)) : 0;
      const inRange     = scrollY > sectionTop && scrollY < sectionTop + maxScroll;
      const isScrolling = Math.abs(scrollV - prevScrollV) > 0.0002;

      if (isScrolling) {
        displayV = scrollV;
      } else if (inRange) {
        displayV = Math.min(1, displayV + AUTO_SPEED * dt);
      }

      prevScrollV = scrollV;
      const v = displayV;

      // Desktop: both sequences animate simultaneously
      const bc = Math.max(0, Math.min(BIKE_FRAME_COUNT - 1, Math.round(v * (BIKE_FRAME_COUNT - 1))));
      const ac = Math.max(0, Math.min(AUTO_FRAME_COUNT - 1, Math.round(v * (AUTO_FRAME_COUNT - 1))));

      if (bc !== bikeFrameRef.current) {
        bikeFrameRef.current = bc;
        const bq = bikePreload.current[bc];
        if (bikeImgRef.current && bq?.src) bikeImgRef.current.src = bq.src;
      }
      if (ac !== autoFrameRef.current) {
        autoFrameRef.current = ac;
        const aq = autoPreload.current[ac];
        if (autoImgRef.current && aq?.src) autoImgRef.current.src = aq.src;
      }
      if (progressBarRef.current)
        progressBarRef.current.style.height = `${v * 100}%`;

      scrollProgress.set(v);

      const newPhase: FleetPhaseKey =
        bc < Math.round(BIKE_FRAME_COUNT * 0.25) ? 'ORIGINS' :
        bc < Math.round(BIKE_FRAME_COUNT * 0.50) ? 'SIGNAL'  :
        bc < Math.round(BIKE_FRAME_COUNT * 0.75) ? 'PROVEN'  : 'FLEET';

      if (newPhase !== phaseRef.current) {
        phaseRef.current = newPhase;
        setPhase(newPhase);
      }

      // Mobile panel positioning
      const mp = mobilePanelRef.current;
      if (mp) {
        if (scrollY <= sectionTop) {
          mp.style.position = 'absolute'; mp.style.top = '0'; mp.style.bottom = '';
        } else if (scrollY >= sectionTop + maxScroll) {
          mp.style.position = 'absolute'; mp.style.top = ''; mp.style.bottom = '0';
        } else {
          mp.style.position = 'fixed'; mp.style.top = '0'; mp.style.bottom = '';
        }
      }
      // Mobile: bike plays v 0→0.5, auto plays v 0.5→1 (each gets full animation)
      const vBike = Math.min(1, v * 2);
      const bcM   = Math.round(vBike * (BIKE_FRAME_COUNT - 1));
      const bqm   = bikePreload.current[bcM];
      if (bikeImgMobileRef.current && bqm?.src) bikeImgMobileRef.current.src = bqm.src;
      const vAuto = Math.max(0, (v - 0.5) * 2);
      const acM   = Math.round(vAuto * (AUTO_FRAME_COUNT - 1));
      const aqm   = autoPreload.current[acM];
      if (autoImgMobileRef.current && aqm?.src) autoImgMobileRef.current.src = aqm.src;
      // Mobile phase: tracks the active panel's animation progress
      const activeMobileV = mobileViewRef.current === 'bike' ? vBike : vAuto;
      const mobileFrame   = Math.round(activeMobileV * (BIKE_FRAME_COUNT - 1));
      const newMobilePhase: FleetPhaseKey =
        mobileFrame < Math.round(BIKE_FRAME_COUNT * 0.25) ? 'ORIGINS' :
        mobileFrame < Math.round(BIKE_FRAME_COUNT * 0.50) ? 'SIGNAL'  :
        mobileFrame < Math.round(BIKE_FRAME_COUNT * 0.75) ? 'PROVEN'  : 'FLEET';
      if (newMobilePhase !== mobilePhaseRef.current) {
        mobilePhaseRef.current = newMobilePhase;
        setMobilePhase(newMobilePhase);
      }
      const newMobileView = v >= 0.5 ? 'auto' : 'bike';
      if (newMobileView !== mobileViewRef.current) {
        mobileViewRef.current = newMobileView;
        setMobileView(newMobileView);
      }

      if (active) rafId = requestAnimationFrame(tick);
    };

    const visObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { active = true; rafId = requestAnimationFrame(tick); }
        else { active = false; if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }
      },
      { rootMargin: '200px 0px' }
    );
    visObs.observe(section);

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      visObs.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateGeometry);
    };
  }, [scrollProgress]);

  const data = FLEET_PHASES[phase];

  return (
    <section
      id="fleet-transform"
      ref={sectionRef}
      style={{ height: sectionH, position: 'relative' }}
    >
      <motion.div
        ref={panelRef}
        className="hidden md:block"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100vh', overflow: 'hidden', background: WHITE }}
      >
        <div className="h-full max-w-7xl mx-auto px-6 flex flex-wrap md:flex-nowrap md:flex-row items-center gap-2 md:gap-8 py-3 md:py-16">

          {/* ── LEFT: Bike ── */}
          <div className="flex w-1/2 md:w-[38%] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={bikeImgRef}
              src={bikeFrameSrc(0)}
              alt="bike transformation"
              width={1080}
              height={1920}
              className="h-[30vh] w-auto md:h-auto md:max-h-[82vh]"
              style={{ display: 'block' }}
            />
          </div>

          {/* ── CENTRE: Circle text ── */}
          <div className="w-full md:w-[24%] flex flex-col items-center justify-center gap-2 md:gap-6 order-last md:order-none">
            {/* Phase dot rail */}
            <div className="flex gap-2">
              {(['ORIGINS', 'SIGNAL', 'PROVEN', 'FLEET'] as FleetPhaseKey[]).map((p) => (
                <div
                  key={p}
                  style={{
                    width: p === phase ? '24px' : '6px',
                    height: '2px',
                    borderRadius: '2px',
                    background: p === phase ? (data.isTech ? CYAN : CHARCOAL) : `${CHARCOAL}20`,
                    transition: 'width 0.4s ease, background 0.4s ease',
                  }}
                />
              ))}
            </div>

            {/* Circle */}
            <div
              style={{
                width: 'clamp(130px, 22vw, 280px)',
                height: 'clamp(130px, 22vw, 280px)',
                borderRadius: '50%',
                border: `1.5px solid ${data.isTech ? CYAN : CHARCOAL}30`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                textAlign: 'center',
                background: data.isTech ? `${CYAN}06` : 'transparent',
                transition: 'border-color 0.4s, background 0.4s',
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: '10px', color: data.isTech ? CYAN : `${CHARCOAL}50`, letterSpacing: '0.18em', marginBottom: '12px' }}>
                {data.badge}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.35 }}
                  style={{
                    fontFamily: data.isTech ? MONO : PLAYFAIR,
                    fontSize: data.isTech ? 'clamp(0.9rem, 1.8vw, 1.15rem)' : 'clamp(1.15rem, 2.2vw, 1.5rem)',
                    fontWeight: 700,
                    color: data.isTech ? CYAN : CHARCOAL,
                    lineHeight: 1.2,
                    letterSpacing: data.isTech ? '0.04em' : '-0.01em',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {data.title}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Body text below circle — hidden on mobile to save vertical space */}
            <AnimatePresence mode="wait">
              <motion.p
                key={phase + '-body'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                className="hidden md:block"
                style={{
                  fontFamily: data.isTech ? MONO : 'inherit',
                  fontSize: data.isTech ? '0.78rem' : '0.88rem',
                  lineHeight: 1.75,
                  color: data.isTech ? CYAN : `${CHARCOAL}70`,
                  textAlign: 'center',
                  letterSpacing: data.isTech ? '0.04em' : 'inherit',
                  whiteSpace: 'pre-line',
                  maxWidth: '220px',
                }}
              >
                {data.body}
              </motion.p>
            </AnimatePresence>

            {/* Progress rail */}
            <div
              className="hidden md:block"
              style={{ width: '1px', height: '80px', background: `${CHARCOAL}12`, position: 'relative', marginTop: '8px' }}
            >
              <div ref={progressBarRef} style={{ width: '100%', height: '0%', background: CHARCOAL }} />
            </div>
          </div>

          {/* ── RIGHT: Auto ── */}
          <div className="flex w-1/2 md:w-[38%] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={autoImgRef}
              src={autoFrameSrc(0)}
              alt="auto transformation"
              width={1080}
              height={1916}
              className="h-[30vh] w-auto md:h-auto md:max-h-[82vh]"
              style={{ display: 'block' }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── MOBILE: single JS-driven panel, switches at v=0.5 ── */}
      <div
        ref={mobilePanelRef}
        className="md:hidden"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100vh', overflow: 'hidden', background: WHITE }}
      >
        {/* Bike layout — visible during first half of scroll */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', gap: '16px', opacity: mobileView === 'bike' ? 1 : 0, transition: 'opacity 0.4s ease', pointerEvents: mobileView === 'bike' ? 'auto' : 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={bikeImgMobileRef} src={bikeFrameSrc(0)} alt="bike transformation" width={1080} height={1920} style={{ height: '46vh', width: 'auto', display: 'block' }} />
          <MobileCircle mobilePhase={mobilePhase} suffix="b" />
        </div>

        {/* Auto layout — visible during second half of scroll */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', gap: '16px', opacity: mobileView === 'auto' ? 1 : 0, transition: 'opacity 0.4s ease', pointerEvents: mobileView === 'auto' ? 'auto' : 'none' }}>
          <MobileCircle mobilePhase={mobilePhase} suffix="a" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={autoImgMobileRef} src={autoFrameSrc(0)} alt="auto transformation" width={1080} height={1916} style={{ height: '46vh', width: 'auto', display: 'block' }} />
        </div>
      </div>
    </section>
  );
}

// ─── DePIN section ────────────────────────────────────────────────────────────
function DePINSection() {
  const specs = [
    {
      index: '01',
      label: 'GPS LAYER',
      value: '<10m',
      unit: 'ACCURACY',
      desc: 'Sub-10 meter positioning with 3-second refresh. Every bus pinged, every second, without compromise.',
    },
    {
      index: '02',
      label: 'ZK LAYER',
      value: 'Groth16',
      unit: 'ALGORITHM',
      desc: 'Zero-knowledge proofs for driver identity. Personal data stays off-chain. Proof goes on-chain.',
    },
    {
      index: '03',
      label: 'SOLANA LAYER',
      value: '0.0000025',
      unit: 'SOL / TX',
      desc: 'Sub-second settlement. Near-zero fees. Purpose-built for Nepal\'s transit volume.',
    },
  ];

  return (
    <section id="depin" className="py-32" style={{ background: CHARCOAL }}>
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="mb-20"
        >
          <div className="mb-4" style={{ fontFamily: MONO, fontSize: '10px', color: DARK_GREEN, letterSpacing: '0.22em' }}>
            ARCHITECTURE
          </div>
          <h2
            style={{
              fontFamily: PLAYFAIR,
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              fontWeight: 700,
              color: WHITE,
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
            }}
          >
            The{' '}
            <span style={{ color: CYAN }}>DePIN</span>
            {' '}Layer.
          </h2>
        </motion.div>

        {/* Spec grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: `${WHITE}08` }}>
          {specs.map((s, i) => (
            <motion.div
              key={s.index}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.1 }}
              className="p-10 relative overflow-hidden group"
              style={{ background: '#0D0D0D' }}
            >
              {/* Index */}
              <div className="mb-6" style={{ fontFamily: MONO, fontSize: '9px', color: `${WHITE}30`, letterSpacing: '0.2em' }}>
                {s.index}
              </div>

              {/* Label */}
              <div className="mb-3" style={{ fontFamily: MONO, fontSize: '10px', color: CYAN, letterSpacing: '0.2em' }}>
                {s.label}
              </div>

              {/* Big value */}
              <div
                className="mb-2"
                style={{ fontFamily: MONO, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, color: WHITE, lineHeight: 1, letterSpacing: '-0.02em' }}
              >
                {s.value}
              </div>
              <div className="mb-6" style={{ fontFamily: MONO, fontSize: '9px', color: `${WHITE}40`, letterSpacing: '0.2em' }}>
                {s.unit}
              </div>

              {/* Description */}
              <p style={{ fontSize: '0.875rem', color: `${WHITE}55`, lineHeight: 1.7 }}>
                {s.desc}
              </p>

              {/* Hover accent */}
              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: CYAN, opacity: 0, transition: 'opacity 0.3s' }}
                onMouseEnter={(e) => { (e.currentTarget.style.opacity = '1'); }}
                onMouseLeave={(e) => { (e.currentTarget.style.opacity = '0'); }}
              />
            </motion.div>
          ))}
        </div>

        {/* Bottom metric row */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-px grid grid-cols-3 gap-px"
          style={{ background: `${WHITE}08` }}
        >
          {[
            { value: '847',    label: 'ACTIVE BUSES'   },
            { value: '12,431', label: 'ZK PROOFS TODAY' },
            { value: '₨ 2.4M', label: 'DAILY VOLUME'   },
          ].map((m) => (
            <div key={m.label} className="p-8 text-center" style={{ background: '#0D0D0D' }}>
              <div style={{ fontFamily: MONO, fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 700, color: WHITE, letterSpacing: '-0.02em' }}>
                {m.value}
              </div>
              <div className="mt-1" style={{ fontFamily: MONO, fontSize: '9px', color: `${WHITE}35`, letterSpacing: '0.2em' }}>
                {m.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Reputation section ───────────────────────────────────────────────────────
function HUDCard({ title, value, unit, status, delay = 0 }: {
  title:  string;
  value:  string;
  unit:   string | null;
  status: string;
  delay?: number;
}) {
  const cardRef    = useRef<HTMLDivElement>(null);
  const mouseX     = useMotionValue(0);
  const mouseY     = useMotionValue(0);
  const rotateX    = useSpring(useTransform(mouseY, [-0.5, 0.5],  [8, -8]),  { stiffness: 300, damping: 20 });
  const rotateY    = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8,  8]),  { stiffness: 300, damping: 20 });

  const handleMove = (e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width  - 0.5);
    mouseY.set((e.clientY - rect.top)  / rect.height - 0.5);
  };
  const handleLeave = () => { mouseX.set(0); mouseY.set(0); };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay }}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: 800,
      }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="p-8 rounded-2xl relative overflow-hidden cursor-default"
      whileHover={{ scale: 1.02 }}
    >
      {/* Card background */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{ background: WHITE, border: `1px solid ${CHARCOAL}10`, boxShadow: '0 4px 40px rgba(26,26,26,0.06)' }}
      />

      <div className="relative z-10">
        {/* Title */}
        <div className="mb-4" style={{ fontFamily: MONO, fontSize: '9px', color: `${CHARCOAL}50`, letterSpacing: '0.2em' }}>
          {title}
        </div>

        {/* Value */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 'clamp(2rem, 4vw, 3.5rem)',
            fontWeight: 700,
            color: CHARCOAL,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </div>
        {unit && (
          <div className="mt-1" style={{ fontFamily: MONO, fontSize: '9px', color: `${CHARCOAL}35`, letterSpacing: '0.15em' }}>
            {unit}
          </div>
        )}

        {/* Status chip — signal cyan only here */}
        <div
          className="mt-6 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: `${CYAN}12`, border: `1px solid ${CYAN}35` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: CYAN }} />
          <span style={{ fontFamily: MONO, fontSize: '8px', color: CYAN, letterSpacing: '0.15em', fontWeight: 600 }}>
            {status}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ReputationSection() {
  return (
    <section id="reputation" className="py-32" style={{ background: WHITE }}>
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="mb-4"
        >
          <div style={{ fontFamily: MONO, fontSize: '10px', color: DARK_GREEN, letterSpacing: '0.22em', marginBottom: '16px' }}>
            TRUST LAYER
          </div>
          <h2
            style={{
              fontFamily: PLAYFAIR,
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              fontWeight: 700,
              color: CHARCOAL,
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              marginBottom: '20px',
            }}
          >
            Reputation<br />
            <em>is</em> currency.
          </h2>
          <p style={{ fontSize: '1.0625rem', color: `${CHARCOAL}60`, maxWidth: '500px', lineHeight: 1.7 }}>
            Every driver builds a verifiable on-chain record. Every passenger travels with certainty.
            No operator can falsify the ledger.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6" style={{ perspective: '1000px' }}>
          <HUDCard
            title="DRIVER_REPUTATION_SCORE"
            value="98.4"
            unit="/ 100 · LIFETIME"
            status="VERIFIED"
            delay={0}
          />
          <HUDCard
            title="ZK_PROOF_STATUS"
            value="VALID"
            unit={null}
            status="LIVE · GROTH16"
            delay={0.08}
          />
          <HUDCard
            title="ROUTES_COMPLETED"
            value="1,247"
            unit="VERIFIED ON-CHAIN"
            status="ACTIVE NODE"
            delay={0.16}
          />
        </div>
      </div>
    </section>
  );
}

// ─── CTA section ──────────────────────────────────────────────────────────────
function CTASection({ onlineBuses }: { onlineBuses: number | null }) {
  return (
    <section className="py-40 relative overflow-hidden" style={{ background: '#0D0D0D' }}>
      {/* Nepal map background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
        <div className="w-full max-w-5xl">
          <NepalMap routeColor={CYAN} mapOpacity={1} animated />
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mb-5"
        >
          {onlineBuses !== null && onlineBuses > 0 && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
              style={{ background: `${CYAN}10`, border: `1px solid ${CYAN}30` }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: CYAN, animation: 'pulse 2s infinite' }} />
              <span style={{ fontFamily: MONO, fontSize: '9px', color: CYAN, letterSpacing: '0.2em' }}>
                {onlineBuses} BUSES LIVE RIGHT NOW
              </span>
            </div>
          )}
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="mb-6"
          style={{
            fontFamily: PLAYFAIR,
            fontSize: 'clamp(2.8rem, 7vw, 6rem)',
            fontWeight: 700,
            color: WHITE,
            lineHeight: 0.9,
            letterSpacing: '-0.02em',
          }}
        >
          The Protocol<br />
          <span style={{ color: CYAN }}>is Live.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
          className="mb-14"
          style={{ fontFamily: MONO, fontSize: '12px', color: `${WHITE}50`, letterSpacing: '0.1em', lineHeight: 1.8 }}
        >
          STOP GUESSING. START TRAVELING.<br />
          JOIN THE FUTURE OF DECENTRALIZED TRANSIT.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href="/auth?role=passenger&redirect=/passenger">
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', fontWeight: 700, background: CYAN, color: CHARCOAL, border: 'none', padding: '16px 36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              BOARD AS PASSENGER
              <ArrowRight size={14} />
            </motion.button>
          </Link>
          <Link href="/auth?role=driver&redirect=/driver">
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', fontWeight: 700, background: 'none', color: WHITE, border: `1.5px solid ${WHITE}25`, padding: '16px 36px', borderRadius: '8px', cursor: 'pointer' }}
            >
              DRIVE THE NETWORK
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-12" style={{ background: '#0D0D0D', borderTop: `0.5px solid ${WHITE}08` }}>
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Image src="/yatra-logo.png" alt="Yatra" width={28} height={28} className="rounded-md opacity-70" />
          <span style={{ fontFamily: MONO, fontSize: '9px', color: `${WHITE}30`, letterSpacing: '0.2em' }}>
            © {new Date().getFullYear()} YATRA TECHNOLOGIES · ENGINEERED FOR NEPAL
          </span>
        </div>
        <div className="flex items-center gap-8">
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: '9px', color: `${WHITE}30`, letterSpacing: '0.2em', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = `${WHITE}70`)}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = `${WHITE}30`)}
          >
            TWITTER
          </a>
          <a
            href="https://facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: '9px', color: `${WHITE}30`, letterSpacing: '0.2em', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = `${WHITE}70`)}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = `${WHITE}30`)}
          >
            FACEBOOK
          </a>
        </div>
      </div>
    </footer>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [onlineBuses, setOnlineBuses] = useState<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  // Lenis smooth scroll
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.08,
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Live bus count
  useEffect(() => {
    const unsub = subscribeToBuses((buses) => {
      const active = buses.filter(
        (b) => (b as any).isActive || (b as any).locationSharingEnabled
      ).length;
      setOnlineBuses(active);
    });
    return () => unsub();
  }, []);

  return (
    <div className="overflow-x-hidden" style={{ background: WHITE, color: CHARCOAL, position: 'relative' }}>
      <Grain />
      <Navbar onlineBuses={onlineBuses} />
      <HeroSection onlineBuses={onlineBuses} />
      <TransformSection />
      <TaxiSection />
      <BikeAutoSection />
      <DePINSection />
      <ReputationSection />
      <CTASection onlineBuses={onlineBuses} />
      <Footer />
    </div>
  );
}
