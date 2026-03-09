'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BusFront, Users, MapPin, Clock, Navigation, Smartphone, ArrowRight, Zap, Star } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import YatraHero from '@/components/YatraHero';
import { subscribeToBuses } from '@/lib/firebaseDb';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { LottieAnimation } from '@/components/landing/LottieAnimation';

export default function Home() {
  const { currentUser, signOut } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [onlineBuses, setOnlineBuses] = useState<number | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToBuses((buses) => {
      const activeCount = buses.filter((bus) => (bus as any).isActive || (bus as any).locationSharingEnabled).length;
      setOnlineBuses(activeCount);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRoleSwitch = async (role: 'driver' | 'passenger') => {
    if (currentUser) {
      await signOut();
      // Explicitly set the redirect to match the role to clear stale params
      const targetRedirect = role === 'driver' ? '/driver' : '/passenger';
      window.location.href = `/auth?role=${role}&redirect=${targetRedirect}&switch_role=true`;
    }
  };
  return (
    <div className="min-h-screen premium-dark-web3">

      {/* ═══ HERO — Hyper-Modern Transit Cockpit ═══ */}
      <YatraHero
        currentUser={isClient && !!currentUser}
        onRoleSwitch={handleRoleSwitch}
      />

      {/* Flow light-streak guiding to next section */}
      <div className="flow-streak-wrapper">
        <div className="flow-streak-line" />
      </div>

      {/* ═══ FEATURES — Animated Bento Cards ═══ */}
      <div className="relative bg-slate-950 py-24 md:py-32 overflow-hidden">
        {/* Background ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Section Header */}
          <div className="text-center mb-20">
            <div className="inline-block mb-6">
              <span className="px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-sm font-semibold text-cyan-400 tracking-widest uppercase">
                Core Technology
              </span>
            </div>
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight">
              Sovereign Transit. Engineered for Nepal.
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Three pillars of a transit revolution — powered by satellite, blockchain, and cryptographic identity.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Card 1: Real-Time GPS ── */}
            <ScrollReveal delay={0}>
              <div className="bento-card p-8">
                {/* Corner brackets */}
                <div className="bento-corner bento-corner-tl" />
                <div className="bento-corner bento-corner-tr" />
                <div className="bento-corner bento-corner-bl" />
                <div className="bento-corner bento-corner-br" />

                {/* Animation scene — Lottie or fallback */}
                <div className="relative z-10 mb-8 flex justify-center">
                  <LottieAnimation
                    type="gps"
                    fallback={
                      <div className="gps-scene">
                        {/* Orbit ring with satellite */}
                        <div className="gps-orbit">
                          <div className="gps-satellite" />
                        </div>
                        {/* Globe */}
                        <div className="gps-globe" />
                        {/* Laser beam */}
                        <div className="gps-beam" />
                        {/* Moving location dot */}
                        <div className="gps-dot" />
                        {/* Extra concentric rings */}
                        <div className="absolute inset-0 rounded-full border border-cyan-400/10 scale-75 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: '50%', height: '50%', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px solid rgba(0,245,255,0.08)' }} />
                      </div>
                    }
                  />
                </div>

                {/* Text */}
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.9)]" style={{ animation: 'liveDot 1.2s ease-in-out infinite' }} />
                    <span className="text-xs font-bold text-cyan-400 tracking-widest uppercase">Live · 3s refresh</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Real-Time GPS</h3>
                  <p className="text-slate-400 leading-relaxed">
                    A satellite network beams pinpoint signals to a moving dot in Butwal. Know exactly where your bus is — updated every 3 seconds with sub-10m accuracy.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* ── Card 2: Solana Integration ── */}
            <ScrollReveal delay={0.1}>
              <div className="bento-card p-8" style={{ background: 'linear-gradient(135deg, rgba(10, 5, 30, 0.95) 0%, rgba(15, 5, 40, 0.90) 100%)', borderColor: 'rgba(153, 69, 255, 0.15)' }}>
                <div className="bento-corner bento-corner-tl" style={{ borderColor: 'rgba(153,69,255,0.35)' }} />
                <div className="bento-corner bento-corner-tr" style={{ borderColor: 'rgba(153,69,255,0.35)' }} />
                <div className="bento-corner bento-corner-bl" style={{ borderColor: 'rgba(153,69,255,0.35)' }} />
                <div className="bento-corner bento-corner-br" style={{ borderColor: 'rgba(153,69,255,0.35)' }} />

                {/* Animation scene — Lottie or fallback */}
                <div className="relative z-10 mb-8 flex justify-center">
                  <LottieAnimation
                    type="blockchain"
                    fallback={
                      <div className="solana-scene">
                        {/* Holographic shield rings */}
                        <div className="solana-shield">
                          <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Outer rotating dashes */}
                            <circle cx="80" cy="80" r="72" stroke="rgba(153,69,255,0.3)" strokeWidth="1" strokeDasharray="6 4" />
                            <circle cx="80" cy="80" r="60" stroke="rgba(20,241,149,0.2)" strokeWidth="0.5" strokeDasharray="3 8" />
                            {/* Shield shape */}
                            <path d="M80 16 L116 32 L116 72 Q116 100 80 120 Q44 100 44 72 L44 32 Z"
                              stroke="rgba(153,69,255,0.5)" strokeWidth="1.5" fill="rgba(153,69,255,0.04)"
                              strokeLinejoin="round" />
                            {/* Inner glow lines */}
                            <path d="M80 24 L110 38 L110 70 Q110 94 80 112 Q50 94 50 70 L50 38 Z"
                              stroke="rgba(20,241,149,0.2)" strokeWidth="0.5" fill="none" strokeLinejoin="round" />
                          </svg>
                        </div>
                        {/* Solana logo */}
                        <div className="solana-shield" style={{ animation: 'none' }}>
                          <span className="solana-logo">◎</span>
                        </div>
                        {/* Floating crypto hashes */}
                        {[
                          { text: 'a8f2...c91b', left: '2%', bottom: '30%', delay: '0s', dur: '4s' },
                          { text: 'f19d...4e72', right: '0%', bottom: '50%', delay: '1.5s', dur: '5s' },
                          { text: '3b7a...8f01', left: '5%', bottom: '10%', delay: '0.8s', dur: '3.5s' },
                          { text: '9c4f...2a88', right: '2%', bottom: '15%', delay: '2.2s', dur: '4.5s' },
                        ].map((h, i) => (
                          <div
                            key={i}
                            className="solana-hash"
                            style={{
                              left: h.left,
                              right: h.right,
                              bottom: h.bottom,
                              animationDelay: h.delay,
                              animationDuration: h.dur,
                            }}
                          >
                            {h.text}
                          </div>
                        ))}
                      </div>
                    }
                  />
                </div>

                {/* Text */}
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#9945ff', boxShadow: '0 0 8px rgba(153,69,255,0.9)' }} />
                    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#9945ff' }}>Solana · Sub-second finality</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Solana Integration</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Every booking is a cryptographic transaction on Solana. Lightning-fast, tamper-proof, and secured inside a holographic shield of zero-knowledge proofs.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* ── Card 3: ZK-Civic Identity ── */}
            <ScrollReveal delay={0.2}>
              <div className="bento-card p-8" style={{ background: 'linear-gradient(135deg, rgba(5, 20, 10, 0.95) 0%, rgba(5, 25, 15, 0.90) 100%)', borderColor: 'rgba(34, 197, 94, 0.15)' }}>
                <div className="bento-corner bento-corner-tl" style={{ borderColor: 'rgba(34,197,94,0.35)' }} />
                <div className="bento-corner bento-corner-tr" style={{ borderColor: 'rgba(34,197,94,0.35)' }} />
                <div className="bento-corner bento-corner-bl" style={{ borderColor: 'rgba(34,197,94,0.35)' }} />
                <div className="bento-corner bento-corner-br" style={{ borderColor: 'rgba(34,197,94,0.35)' }} />

                {/* Animation scene */}
                <div className="relative z-10 mb-8">
                  <div className="zk-scene">
                    {/* Face wireframe SVG */}
                    <div className="zk-face">
                      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                        {/* Outer face outline */}
                        <ellipse cx="80" cy="82" rx="38" ry="46"
                          stroke="rgba(0,245,255,0.6)" strokeWidth="1.5"
                          className="zk-face-path" />
                        {/* Eyes */}
                        <ellipse cx="66" cy="74" rx="6" ry="4"
                          stroke="rgba(0,245,255,0.5)" strokeWidth="1"
                          className="zk-face-path" style={{ animationDelay: '0.3s' }} />
                        <ellipse cx="94" cy="74" rx="6" ry="4"
                          stroke="rgba(0,245,255,0.5)" strokeWidth="1"
                          className="zk-face-path" style={{ animationDelay: '0.5s' }} />
                        {/* Nose */}
                        <path d="M80 78 L76 90 L80 92 L84 90 Z"
                          stroke="rgba(0,245,255,0.35)" strokeWidth="1" fill="none"
                          className="zk-face-path" style={{ animationDelay: '0.7s' }} />
                        {/* Mouth */}
                        <path d="M69 102 Q80 110 91 102"
                          stroke="rgba(0,245,255,0.4)" strokeWidth="1" fill="none"
                          className="zk-face-path" style={{ animationDelay: '0.9s' }} />
                        {/* Face grid lines */}
                        <line x1="80" y1="36" x2="80" y2="128"
                          stroke="rgba(0,245,255,0.1)" strokeWidth="0.5"
                          strokeDasharray="3 5" className="zk-face-path" style={{ animationDelay: '1.1s' }} />
                        <line x1="42" y1="82" x2="118" y2="82"
                          stroke="rgba(0,245,255,0.1)" strokeWidth="0.5"
                          strokeDasharray="3 5" className="zk-face-path" style={{ animationDelay: '1.2s' }} />
                        {/* Corner scan brackets */}
                        <path d="M30 20 L30 35 M30 20 L45 20" stroke="rgba(0,245,255,0.4)" strokeWidth="1.5" />
                        <path d="M130 20 L130 35 M130 20 L115 20" stroke="rgba(0,245,255,0.4)" strokeWidth="1.5" />
                        <path d="M30 140 L30 125 M30 140 L45 140" stroke="rgba(0,245,255,0.4)" strokeWidth="1.5" />
                        <path d="M130 140 L130 125 M130 140 L115 140" stroke="rgba(0,245,255,0.4)" strokeWidth="1.5" />
                      </svg>
                    </div>
                    {/* Scanning sweep line */}
                    <div className="zk-scan-line" />
                    {/* Verified checkmark */}
                    <div className="zk-check">
                      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
                        {/* Outer circle */}
                        <circle cx="60" cy="60" r="50" stroke="rgba(34,197,94,0.5)" strokeWidth="1.5"
                          style={{ filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.6))' }} />
                        <circle cx="60" cy="60" r="40" stroke="rgba(34,197,94,0.25)" strokeWidth="0.5" />
                        {/* Checkmark */}
                        <path d="M32 60 L52 80 L88 40"
                          stroke="#22c55e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                          className="zk-check-path"
                          style={{ filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.9))' }} />
                      </svg>
                    </div>
                    {/* "IDENTITY VERIFIED" label */}
                    <div className="zk-verified-text">IDENTITY VERIFIED</div>
                  </div>
                </div>

                {/* Text */}
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.9)' }} />
                    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#22c55e' }}>ZK-Proof · Privacy-first</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">ZK-Civic Identity</h3>
                  <p className="text-slate-400 leading-relaxed">
                    A facial recognition wireframe scans and converts into a digital light checkmark. Your identity is verified without ever revealing your private data.
                  </p>
                </div>
              </div>
            </ScrollReveal>

          </div>{/* /Bento Grid */}
        </div>
      </div>

      {/* Flow light-streak between sections */}
      <div className="flow-streak-wrapper">
        <div className="flow-streak-line" />
      </div>

      {/* How It Works */}
      <div className="relative bg-gradient-to-b from-slate-950 to-slate-900 py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight">
              The Yatra Ecosystem: Connect. Authenticate. Move.
            </h2>
            <p className="text-xl text-slate-400">
              Three steps to never miss your bus again
            </p>
          </div>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="flex-shrink-0">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full animate-pulse"></div>
                  <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center">
                    <span className="text-6xl font-black text-white">1</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-3xl font-bold text-white mb-3">Driver Goes Online</h3>
                <p className="text-xl text-slate-400 leading-relaxed">
                  Bus driver opens the app and starts sharing their location. That's all they need to do.
                </p>
              </div>
            </div>

            {/* Connector */}
            <div className="flex justify-center">
              <div className="w-1 h-16 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-12">
              <div className="flex-shrink-0">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full animate-pulse delay-300"></div>
                  <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center">
                    <span className="text-6xl font-black text-white">2</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 text-center md:text-right">
                <h3 className="text-3xl font-bold text-white mb-3">You See the Bus</h3>
                <p className="text-xl text-slate-400 leading-relaxed">
                  The bus appears on your map instantly. Watch it move in real-time as it approaches.
                </p>
              </div>
            </div>

            {/* Connector */}
            <div className="flex justify-center">
              <div className="w-1 h-16 bg-gradient-to-b from-purple-500 to-green-500 rounded-full"></div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="flex-shrink-0">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full animate-pulse delay-700"></div>
                  <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center">
                    <span className="text-6xl font-black text-white">3</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-3xl font-bold text-white mb-3">Tap to Book</h3>
                <p className="text-xl text-slate-400 leading-relaxed">
                  Click the bus icon on the map. You're booked. The driver gets notified immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flow light-streak into final CTA */}
      <div className="flow-streak-wrapper">
        <div className="flow-streak-line" />
      </div>

      {/* Final CTA */}
      <div className="relative bg-slate-900 py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10"></div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-12">
            <div className="flex justify-center gap-2 mb-8">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-8 h-8 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight leading-tight">
              Start tracking buses
              <br />
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                right now
              </span>
            </h2>
            <p className="text-2xl text-slate-300 mb-12">
              Free. Simple. Built for Butwal.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            {/* We wrap everything in isClient to prevent the Hydration Error.
      The server will render 'null' initially, and the client will fill it in 
      once the browser is ready, ensuring the URLs match perfectly.
  */}
            {isClient ? (
              currentUser ? (
                <>
                  <Button
                    size="lg"
                    onClick={() => handleRoleSwitch('passenger')}
                    className="group w-full sm:w-auto h-20 px-12 text-xl font-bold rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-2xl shadow-cyan-500/50 transition-all duration-300 hover:scale-105"
                  >
                    <Users className="w-7 h-7 mr-3" />
                    Get Started Now
                    <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-2 transition-transform" />
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => handleRoleSwitch('driver')}
                    variant="outline"
                    className="w-full sm:w-auto h-20 px-12 text-xl font-bold rounded-2xl bg-white/5 border-2 border-white/30 text-white hover:bg-white/10 backdrop-blur-sm transition-all duration-300"
                  >
                    <BusFront className="w-7 h-7 mr-3" />
                    Join as Driver
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth?role=passenger&redirect=/passenger">
                    <Button
                      size="lg"
                      className="group w-full sm:w-auto h-20 px-12 text-xl font-bold rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-2xl shadow-cyan-500/50 transition-all duration-300 hover:scale-105"
                    >
                      <Users className="w-7 h-7 mr-3" />
                      Get Started Now
                      <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-2 transition-transform" />
                    </Button>
                  </Link>

                  <Link href="/auth?role=driver&redirect=/driver">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto h-20 px-12 text-xl font-bold rounded-2xl bg-white/5 border-2 border-white/30 text-white hover:bg-white/10 backdrop-blur-sm transition-all duration-300"
                    >
                      <BusFront className="w-7 h-7 mr-3" />
                      Join as Driver
                    </Button>
                  </Link>
                </>
              )
            ) : (
              /* Placeholder to maintain layout height while hydrating */
              <div className="h-20 w-full" />
            )}
          </div>

          <p className="text-slate-500 mt-12 text-sm">
            No credit card required • No app download • Works everywhere
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative bg-slate-950 border-t border-slate-800/60 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="relative inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-slate-900/80 border border-cyan-500/30 shadow-[0_0_30px_rgba(56,189,248,0.30)]">
                <span className="relative inline-flex h-3 w-3">
                  <span
                    className={`absolute inset-0 rounded-full ${onlineBuses && onlineBuses > 0 ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    style={{
                      boxShadow:
                        onlineBuses && onlineBuses > 0
                          ? '0 0 10px rgba(52,211,153,0.95)'
                          : '0 0 0 rgba(15,23,42,0)',
                    }}
                  />
                  {onlineBuses && onlineBuses > 0 && (
                    <span className="absolute inset-0 rounded-full bg-emerald-400/60 animate-ping" />
                  )}
                </span>
                <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-200">
                  Live in Nepal
                </span>
                <span className="tech-mono text-sm text-cyan-300">
                  {onlineBuses === null ? '···' : `${onlineBuses} buses online`}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-600">
              Real-time counts from active drivers across Nepal.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}