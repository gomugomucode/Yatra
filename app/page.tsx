// name=app/page.tsx
'use client'

import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { motion } from 'framer-motion'

export default function HomePage() {
  return (
    <>
      <Navbar />
      
      <main className="relative overflow-x-hidden bg-[#050505]">
        {/* Background Layers */}
        <div className="bg-grid fixed inset-0 z-0 pointer-events-none" />
        <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(0,102,255,0.12),transparent)]" />

        {/* Hero Section */}
        <motion.section
          className="relative z-10 min-h-screen flex items-center justify-center px-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-center max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88] animate-pulse" />
              <span className="font-mono-custom text-[11px] tracking-[0.08em] text-white/50 uppercase">
                Live on Solana Mainnet
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="font-display font-extrabold leading-[1.05] tracking-[-0.02em] mb-6 text-5xl md:text-6xl"
            >
              Every Rupee.
              <br />
              <span className="text-[#00C2FF]">On-Chain. In Real Time.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="max-w-2xl text-base font-light leading-[1.8] text-white/45 mb-10"
            >
              Nepal's fiscal transparency protocol — every government budget transaction verified, immutable, and publicly auditable on the Solana blockchain.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="flex items-center gap-4 flex-wrap justify-center"
            >
              <button className="px-8 py-3.5 bg-[#00C2FF] text-[#050505] rounded-md font-mono-custom text-xs font-bold tracking-[0.08em] uppercase hover:shadow-[0_0_30px_rgba(0,194,255,0.5)] transition-all">
                Explore Budget Data
              </button>
              <button className="px-8 py-3.5 border border-white/10 rounded-md text-white/50 font-mono-custom text-xs tracking-[0.08em] uppercase hover:border-[#00C2FF] hover:text-[#00C2FF] transition-all">
                View Audit Trail →
              </button>
            </motion.div>
          </div>
        </motion.section>

        {/* Features Section */}
        <section className="relative z-10 max-w-[1200px] mx-auto px-8 py-24">
          <div className="mb-12">
            <p className="font-mono-custom text-[11px] tracking-[0.15em] text-[#00C2FF] uppercase mb-2">
              // Why Drishti
            </p>
            <h2 className="font-display text-4xl font-bold text-white">
              The Protocol Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '🔐', title: 'Immutable Records', desc: 'Tamper-proof transactions on blockchain' },
              { icon: '⚡', title: 'Real-Time Settlement', desc: 'Instant finality, no delays' },
              { icon: '📊', title: 'Public Auditability', desc: 'Complete transparency for citizens' },
              { icon: '🌐', title: 'Decentralized', desc: 'No single point of failure' },
              { icon: '💰', title: 'Cost-Efficient', desc: 'Sub-cent transaction fees' },
              { icon: '🛡️', title: 'Military-Grade Security', desc: 'Ed25519 cryptography' },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="glass-card p-6"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/60">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}