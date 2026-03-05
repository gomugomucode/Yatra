'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Nepal outline path (simplified but recognizable shape)
const NEPAL_PATH = `M 60,140 L 80,130 L 110,125 L 140,120 L 160,115 L 190,110
  L 220,108 L 250,105 L 280,100 L 310,98 L 340,95 L 370,90 L 400,88
  L 430,85 L 460,82 L 490,80 L 510,78 L 530,80 L 550,82 L 565,88
  L 570,100 L 560,112 L 545,118 L 530,125 L 510,130 L 490,135
  L 465,140 L 440,145 L 415,150 L 390,155 L 360,158 L 330,160
  L 300,162 L 270,165 L 240,163 L 210,158 L 180,155 L 150,152
  L 120,148 L 90,145 L 65,142 Z`;

// Transit route paths across Nepal
const ROUTES = [
    { id: 'r1', d: 'M 80,138 Q 200,125 350,110 Q 450,98 555,90', color: '#00f5ff', delay: 0 },
    { id: 'r2', d: 'M 100,142 Q 220,132 360,118 Q 460,108 545,100', color: '#7c3aed', delay: 0.6 },
    { id: 'r3', d: 'M 120,145 Q 250,135 380,125 Q 470,115 540,108', color: '#06b6d4', delay: 1.2 },
    { id: 'r4', d: 'M 150,148 Q 280,140 400,132 Q 500,124 555,118', color: '#8b5cf6', delay: 1.8 },
];

// City dots on the Nepal map
const CITIES = [
    { x: 100, y: 140, name: 'Dhangadhi' },
    { x: 185, y: 132, name: 'Nepalganj' },
    { x: 260, y: 130, name: 'Butwal' },
    { x: 320, y: 118, name: 'Pokhara' },
    { x: 390, y: 112, name: 'Kathmandu' },
    { x: 470, y: 100, name: 'Biratnagar' },
    { x: 535, y: 95, name: 'Ilam' },
];

interface ParticleData {
    id: number;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
}

export default function YatraHero({
    currentUser,
    onRoleSwitch,
}: {
    currentUser: boolean;
    onRoleSwitch: (role: 'driver' | 'passenger') => void;
}) {
    const [mounted, setMounted] = useState(false);
    const [particles, setParticles] = useState<ParticleData[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        setMounted(true);
        // Generate particles after mount to avoid SSR mismatch
        setParticles(
            Array.from({ length: 30 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 3 + 1,
                duration: Math.random() * 6 + 4,
                delay: Math.random() * 5,
                opacity: Math.random() * 0.5 + 0.1,
            }))
        );
    }, []);

    return (
        <section className="yatra-hero relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
            {/* Deep space background */}
            <div className="yatra-bg absolute inset-0" />

            {/* Grid overlay */}
            <div className="yatra-grid absolute inset-0" />

            {/* Floating particles */}
            {mounted && particles.map((p) => (
                <div
                    key={p.id}
                    className="yatra-particle absolute rounded-full"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        opacity: p.opacity,
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                    }}
                />
            ))}

            {/* Radial glows */}
            <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full yatra-glow-cyan opacity-20 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full yatra-glow-purple opacity-15 blur-[100px] pointer-events-none" />

            {/* ───────────── CONTENT ───────────── */}
            <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-10 pb-20 flex flex-col items-center gap-10">

                {/* Live Badge */}
                <div className={`yatra-badge transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                    <span className="yatra-live-dot" />
                    <span className="text-xs font-bold tracking-[0.2em] text-cyan-300 uppercase">Now Live in Butwal</span>
                    <span className="yatra-badge-chip">BETA</span>
                </div>

                {/* YATRA Typography — Custom SVG Logotype (Cyan → Purple) */}
                <div className={`text-center transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <h1 className="inline-block w-full max-w-[min(90vw,420px)]" aria-label="YATRA">
                        <svg
                            viewBox="0 0 320 80"
                            className="w-full max-w-[min(90vw,420px)] h-auto mx-auto"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <linearGradient id="yatra-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#00F2FF" />
                                    <stop offset="50%" stopColor="#22d3ee" />
                                    <stop offset="100%" stopColor="#7000FF" />
                                </linearGradient>
                            </defs>
                            <text
                                x="50%"
                                y="62"
                                textAnchor="middle"
                                fontSize="72"
                                fontWeight="900"
                                letterSpacing="-0.03em"
                                fill="url(#yatra-gradient)"
                                style={{ filter: 'drop-shadow(0 0 40px rgba(0, 242, 255, 0.35))' }}
                                fontFamily="var(--font-outfit), system-ui, sans-serif"
                            >
                                YATRA
                            </text>
                        </svg>
                    </h1>
                    <p className="yatra-subtitle">Nepal's Transit, Tokenized.</p>
                    <p className="yatra-body mt-3">
                        Real-time tracking meets Solana-powered security.{' '}
                        <span className="text-cyan-400">Experience the movement.</span>
                    </p>
                </div>

                {/* Nepal Map + 3D Bus showcase */}
                <div className={`yatra-cockpit-wrapper transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>

                    {/* Glassmorphic cockpit panel */}
                    <div className="yatra-cockpit">

                        {/* Top HUD */}
                        <div className="flex items-center justify-between mb-3 px-1">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                <span className="text-[10px] font-mono text-cyan-400/80 tracking-widest uppercase">Transit Network — LIVE</span>
                            </div>
                            <div className="flex gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-400/80" />
                                <div className="w-2 h-2 rounded-full bg-yellow-400/80" />
                                <div className="w-2 h-2 rounded-full bg-red-400/80" />
                            </div>
                        </div>

                        {/* Nepal SVG Map */}
                        <div className="relative">
                            <svg
                                viewBox="40 75 540 100"
                                className="w-full h-auto"
                                style={{ filter: 'drop-shadow(0 0 20px rgba(0,245,255,0.25))' }}
                            >
                                <defs>
                                    {/* Glow filter */}
                                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                        <feMerge>
                                            <feMergeNode in="coloredBlur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                    <filter id="strongGlow">
                                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                        <feMerge>
                                            <feMergeNode in="coloredBlur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>

                                    {/* Animated dash offset for route veins */}
                                    {ROUTES.map((r) => (
                                        <linearGradient key={`g-${r.id}`} id={`grad-${r.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={r.color} stopOpacity="0" />
                                            <stop offset="40%" stopColor={r.color} stopOpacity="0.9" />
                                            <stop offset="60%" stopColor={r.color} stopOpacity="0.9" />
                                            <stop offset="100%" stopColor={r.color} stopOpacity="0" />
                                        </linearGradient>
                                    ))}

                                    {/* Nepal fill gradient */}
                                    <linearGradient id="nepalFill" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#0c1836" stopOpacity="0.9" />
                                        <stop offset="100%" stopColor="#07101f" stopOpacity="0.95" />
                                    </linearGradient>
                                </defs>

                                {/* Nepal outline filled */}
                                <path
                                    d={NEPAL_PATH}
                                    fill="url(#nepalFill)"
                                    stroke="rgba(0,245,255,0.4)"
                                    strokeWidth="1"
                                    filter="url(#glow)"
                                />

                                {/* Transit veins — animated lines */}
                                {ROUTES.map((r) => (
                                    <g key={r.id}>
                                        {/* Base dim line */}
                                        <path d={r.d} fill="none" stroke={r.color} strokeWidth="0.8" strokeOpacity="0.15" />
                                        {/* Animated glow line */}
                                        <path
                                            d={r.d}
                                            fill="none"
                                            stroke={`url(#grad-${r.id})`}
                                            strokeWidth="1.5"
                                            strokeDasharray="60 200"
                                            filter="url(#glow)"
                                            style={{
                                                animation: `transitVein 4s linear infinite`,
                                                animationDelay: `${r.delay}s`,
                                            }}
                                        />
                                    </g>
                                ))}

                                {/* City dots */}
                                {CITIES.map((c) => (
                                    <g key={c.name}>
                                        {/* Ripple ring */}
                                        <circle cx={c.x} cy={c.y} r="5" fill="none" stroke="rgba(0,245,255,0.4)"
                                            strokeWidth="0.8"
                                            style={{ animation: 'cityRipple 3s ease-out infinite', animationDelay: `${CITIES.indexOf(c) * 0.4}s` }}
                                        />
                                        {/* Core dot */}
                                        <circle cx={c.x} cy={c.y} r="2" fill="#00f5ff" filter="url(#strongGlow)" />
                                        {/* Label */}
                                        <text x={c.x} y={c.y - 6} textAnchor="middle"
                                            fontSize="4" fill="rgba(0,245,255,0.7)" fontFamily="monospace">
                                            {c.name}
                                        </text>
                                    </g>
                                ))}

                                {/* Moving bus dot along route */}
                                <circle r="3" fill="#ffffff" filter="url(#strongGlow)">
                                    <animateMotion dur="6s" repeatCount="indefinite">
                                        <mpath href="#busRoute" />
                                    </animateMotion>
                                </circle>
                                <path id="busRoute" d={ROUTES[0].d} fill="none" />
                            </svg>

                            {/* Floating 3D Isometric Bus */}
                            <div className="yatra-bus-wrapper">
                                <div className="yatra-bus">
                                    {/* Bus top face */}
                                    <div className="bus-top" />
                                    {/* Bus front face */}
                                    <div className="bus-front">
                                        <div className="bus-windshield" />
                                        <div className="bus-headlights">
                                            <div className="bus-light" />
                                            <div className="bus-light" />
                                        </div>
                                    </div>
                                    {/* Bus side face */}
                                    <div className="bus-side">
                                        <div className="bus-windows">
                                            {[0, 1, 2, 3].map((i) => (
                                                <div key={i} className="bus-window" />
                                            ))}
                                        </div>
                                        <div className="bus-door" />
                                    </div>
                                    {/* Holographic circuitry inside */}
                                    <div className="bus-circuit-overlay" />
                                </div>
                                {/* Hover shadow */}
                                <div className="yatra-bus-shadow" />
                            </div>
                        </div>

                        {/* Bottom status bar */}
                        <div className="flex items-center justify-between mt-3 px-1">
                            <div className="flex gap-3">
                                {['12 Buses Online', '847 Rides Today', 'Solana Mainnet'].map((label) => (
                                    <span key={label} className="text-[9px] font-mono text-cyan-400/60 bg-cyan-400/5 border border-cyan-400/10 rounded px-2 py-0.5">
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className="text-[9px] font-mono text-green-400/70">◉ ALL SYSTEMS GO</div>
                        </div>
                    </div>
                </div>

                {/* CTA Buttons */}
                <div className={`flex flex-col sm:flex-row gap-4 items-center transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    {currentUser ? (
                        <>
                            <button
                                onClick={() => onRoleSwitch('passenger')}
                                className="yatra-btn-primary group"
                                id="launch-app-btn"
                            >
                                <span className="yatra-btn-aura" />
                                <span className="relative z-10 flex items-center gap-3">
                                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span className="text-xl font-bold tracking-wide">यात्री (Passenger)</span>
                                </span>
                            </button>
                            <button
                                onClick={() => onRoleSwitch('driver')}
                                className="yatra-btn-driver group"
                                id="driver-console-btn"
                            >
                                <span className="relative z-10 flex items-center gap-3">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                    </svg>
                                    <span className="text-xl font-bold tracking-wide">चालक (Driver)</span>
                                </span>
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/auth?role=passenger" id="launch-app-link" className="w-full sm:w-auto">
                                <button className="yatra-btn-primary w-full group">
                                    <span className="yatra-btn-aura" />
                                    <span className="relative z-10 flex items-center justify-center gap-3">
                                        <svg className="w-6 h-6 text-cyan-400 group-hover:animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span className="text-2xl font-black">यात्री</span>
                                    </span>
                                </button>
                            </Link>
                            <Link href="/auth?role=driver" id="driver-console-link" className="w-full sm:w-auto">
                                <button className="yatra-btn-driver w-full group">
                                    <span className="relative z-10 flex items-center justify-center gap-3">
                                        <svg className="w-6 h-6 text-purple-400 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        <span className="text-2xl font-black">चालक</span>
                                    </span>
                                </button>
                            </Link>
                        </>
                    )}
                </div>
                {/* Solana + ZK Trust Bar */}
                <div className={`yatra-trust-bar transition-all duration-700 delay-400 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                    {[
                        { icon: '◎', label: 'Solana-Powered', color: '#9945FF' },
                        { icon: '⓪', label: 'ZK Verified IDs', color: '#00f5ff' },
                        { icon: '▲', label: 'Groth16 Proofs', color: '#7c3aed' },
                        { icon: '●', label: 'Firebase Real-time', color: '#06b6d4' },
                    ].map((item) => (
                        <div key={item.label} className="yatra-trust-item">
                            <span style={{ color: item.color }}>{item.icon}</span>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom fade into next section */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
        </section>
    );
}