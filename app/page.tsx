'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  Bus,
  Users,
  ArrowRight,
  Star,
  MapPin,
  ShieldCheck,
  Smartphone,
  Clock,
  Menu,
  X,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Map
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';
import { subscribeToBuses } from '@/lib/firebaseDb';
import { ScrollReveal } from '@/components/ui/ScrollReveal';

export default function Home() {
  const { currentUser, role, signOut } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [onlineBuses, setOnlineBuses] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroScale = useTransform(scrollYProgress, [0, 0.25], [1, 0.965]);
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, -24]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToBuses((buses) => {
      const activeCount = buses.filter((bus) => (bus as any).isActive || (bus as any).locationSharingEnabled).length;
      setOnlineBuses(activeCount);
    });
    return () => unsubscribe();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] as any }
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden">

      {/* ═══ NAVBAR ═══ */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Left: Logo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <Image src="/yatra-logo.png" alt="Yatra" width={64} height={64} className="rounded-xl" priority />
            </motion.div>

            {/* Center: Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {[
                { label: 'Home', href: '/' },
                { label: 'Features', href: '/#features' },
                { label: 'Ride', href: '/#ride' },
                { label: 'Passenger', href: '/auth?role=passenger&redirect=/passenger' },
                { label: 'Driver', href: '/auth?role=driver&redirect=/driver' },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={item.href}
                    className="text-sm font-semibold text-slate-600 hover:text-orange-500 transition-colors relative group"
                  >
                    {item.label}
                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-500 transition-all group-hover:w-full" />
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Right: Auth CTAs */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden md:flex items-center gap-4"
            >
              {isClient && currentUser ? (
                <>
                  <Link href={role === 'driver' ? '/driver' : '/passenger'}>
                    <Button variant="ghost" className="font-bold text-slate-600 hover:bg-slate-50">Dashboard</Button>
                  </Link>
                  <Button
                    onClick={() => signOut()}
                    variant="outline"
                    className="rounded-full border-slate-200 font-bold hover:bg-slate-50 transition-all"
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth">
                    <Button variant="ghost" className="font-bold text-slate-600 hover:bg-slate-50">Login</Button>
                  </Link>
                  <Link href="/auth?isSignUp=true">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="relative"
                    >
                      <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full px-8 shadow-lg shadow-orange-200 transition-all">
                        Sign Up
                      </Button>
                      <motion.div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-full border border-orange-300/50"
                        animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.06, 0.3] }}
                        transition={{ duration: 2.6, repeat: Infinity }}
                      />
                    </motion.div>
                  </Link>
                </>
              )}
            </motion.div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-slate-600 hover:text-orange-500 transition-colors"
              >
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-b border-slate-100 overflow-hidden"
            >
              <div className="py-6 px-4 space-y-4">
                {[
                  { label: 'Home', href: '/' },
                  { label: 'Features', href: '/#features' },
                  { label: 'Ride', href: '/#ride' },
                  { label: 'Passenger', href: '/auth?role=passenger&redirect=/passenger' },
                  { label: 'Driver', href: '/auth?role=driver&redirect=/driver' },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="block text-lg font-bold text-slate-900 hover:text-orange-500 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="pt-4 border-t border-slate-100 flex flex-col gap-4">
                  <Link href="/auth" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 rounded-xl font-bold">Login</Button>
                  </Link>
                  <Link href="/auth?isSignUp=true" onClick={() => setIsMenuOpen(false)}>
                    <Button className="w-full h-12 bg-orange-500 text-white rounded-xl font-bold">Sign Up</Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ═══ HERO SECTION ═══ */}
      <section className="relative pt-24 pb-32 overflow-hidden bg-white">
        {/* Pulsing background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[700px] pointer-events-none">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-50/50 rounded-full blur-[120px]"
          />
          <motion.div
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-50/50 rounded-full blur-[100px]"
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ scale: heroScale, y: heroY }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div variants={itemVariants}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 border border-orange-100 mb-8 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-sm font-bold text-orange-700 tracking-tight">Now Live in Butwal, Nepal</span>
              </div>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="text-6xl md:text-8xl font-black text-slate-900 tracking-tight mb-8 leading-[0.95]"
            >
              Move Smarter. <br />
              <motion.span
                initial={{ backgroundPosition: '0% 50%' }}
                animate={{ backgroundPosition: '100% 50%' }}
                transition={{ duration: 5, repeat: Infinity, repeatType: "reverse" }}
                className="text-orange-500 bg-linear-to-r from-orange-500 via-orange-400 to-orange-600 bg-clip-text"
              >
                Connect Better.
              </motion.span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="text-xl md:text-2xl text-slate-600 mb-12 max-w-2xl mx-auto font-medium leading-relaxed"
            >
              Real-time transit tracking and seamless booking for Nepal.
              Experience safe, fast, and transparent travel at your fingertips.
            </motion.p>


            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-center justify-center gap-6"
            >
              <Link href="/auth?role=passenger&redirect=/passenger" className="w-full sm:w-auto">
                <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
                  <Button className="w-full sm:w-auto h-16 px-10 text-lg font-black rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-xl shadow-orange-200 transition-all group overflow-hidden relative">
                    <span className="relative z-10 flex items-center">
                      Ride as Passenger
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      animate={{ x: ['-120%', '120%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                    />
                  </Button>
                </motion.div>
              </Link>
              <Link href="/auth?role=driver&redirect=/driver" className="w-full sm:w-auto">
                <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
                  <Button variant="outline" className="w-full sm:w-auto h-16 px-10 text-lg font-black rounded-2xl border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all">
                    Drive with Yatra
                  </Button>
                </motion.div>
              </Link>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="mt-20 flex items-center justify-center gap-10 opacity-60 grayscale hover:grayscale-0 transition-all duration-700"
            >
              {[
                { icon: ShieldCheck, text: "Verified Drivers" },
                { icon: MapPin, text: "Real-time GPS" },
                { icon: Smartphone, text: "Paperless Tickets" }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <item.icon className="w-5 h-5 text-slate-700" />
                  <span className="text-sm font-bold text-slate-900 tracking-tight">{item.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══ FEATURES SECTION ═══ */}
      <section id="features" className="py-32 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-24">
            <ScrollReveal>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
                Engineered for Modern Transit
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto font-medium">
                We've combined satellite technology and secure identity to bring you a travel experience like never before.
              </p>
            </ScrollReveal>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Map className="w-8 h-8 text-orange-500" />,
                title: "Live GPS Tracking",
                desc: "Never wait at the stop again. See exactly where your bus is with sub-10m accuracy and 3s refresh rates."
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-orange-500" />,
                title: "Verified Identity",
                desc: "Safe travel starts with knowing your driver. Every Yatra driver undergoes rigorous verification."
              },
              {
                icon: <Smartphone className="w-8 h-8 text-orange-500" />,
                title: "One-Tap Booking",
                desc: "No more paper tickets or cash hassles. Book your seat in seconds and pay securely through the app."
              },
              {
                icon: <Clock className="w-8 h-8 text-orange-500" />,
                title: "Predictive ETA",
                desc: "Our algorithms calculate precise arrival times based on current traffic and route conditions."
              },
              {
                icon: <TrendingUp className="w-8 h-8 text-orange-500" />,
                title: "Dynamic Pricing",
                desc: "Transparent and fair pricing for both passengers and drivers, optimized for Nepal's transit market."
              },
              {
                icon: <CreditCard className="w-8 h-8 text-orange-500" />,
                title: "Secure Payments",
                desc: "Multiple payment options integrated seamlessly, ensuring fast and reliable transactions."
              }
            ].map((feature, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -8, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
                  whileTap={{ scale: 0.995 }}
                  className="group p-10 rounded-[32px] bg-white border border-slate-100 shadow-sm transition-all duration-500 relative overflow-hidden"
                >
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-8 group-hover:bg-orange-500 transition-colors duration-500">
                    <div className="group-hover:text-white transition-colors duration-500">
                      {feature.icon}
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4 group-hover:text-orange-600 transition-colors">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed font-medium opacity-80 group-hover:opacity-100 transition-opacity">
                    {feature.desc}
                  </p>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="ride" className="py-32 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-20">
            <div className="lg:w-1/2">
              <ScrollReveal direction="left">
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-10 leading-tight">
                  Travel simplified. <br />
                  <span className="text-orange-500">Three easy steps.</span>
                </h2>

                <div className="space-y-10">
                  {[
                    {
                      step: "01",
                      title: "Open the Map",
                      desc: "Instantly see all active buses near you. No account required to browse."
                    },
                    {
                      step: "02",
                      title: "Select your Bus",
                      desc: "Check available seats, driver ratings, and arrival times with one tap."
                    },
                    {
                      step: "03",
                      title: "Book and Ride",
                      desc: "Secure your seat, get your digital ticket, and enjoy the journey."
                    }
                  ].map((step, i) => (
                    <motion.div
                      key={i}
                      className="flex gap-8 group"
                      whileHover={{ x: 10 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <div className="text-5xl font-black text-orange-100 leading-none group-hover:text-orange-200 transition-colors">{step.step}</div>
                      <div>
                        <h4 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-orange-600 transition-colors">{step.title}</h4>
                        <p className="text-lg text-slate-600 font-medium opacity-80">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollReveal>
            </div>

            <div className="lg:w-1/2 relative">
              <ScrollReveal direction="right" delay={0.2}>
                <div className="relative p-2 bg-slate-100 rounded-[48px] shadow-2xl">
                  <div className="rounded-[40px] overflow-hidden border-4 border-white shadow-inner bg-white">
                    {/* Map Mockup */}
                    <div className="aspect-[4/5] bg-slate-50 relative group">
                      <div className="absolute inset-0 bg-orange-100/10" />
                      <motion.div
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.1, 0.2, 0.1]
                        }}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-orange-500 rounded-full"
                      />
                      <motion.div
                        className="absolute top-[40%] left-[30%] p-4 bg-white rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-100 z-10"
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                          <Bus className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-900 tracking-tight">Bus #402</div>
                          <div className="text-[11px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">2 mins away</div>
                        </div>
                      </motion.div>

                      {/* Decorative dots for map feel */}
                      <div className="absolute top-[20%] right-[20%] w-3 h-3 bg-slate-200 rounded-full" />
                      <div className="absolute bottom-[30%] left-[20%] w-3 h-3 bg-slate-200 rounded-full" />
                      <div className="absolute bottom-[10%] right-[40%] w-3 h-3 bg-slate-200 rounded-full" />
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PASSENGER & DRIVER CTA BLOCKS ═══ */}
      <section className="py-32 px-4 bg-slate-50/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
          {/* Passenger CTA */}
          <ScrollReveal direction="left" className="flex-1">
            <motion.div
              whileHover={{ scale: 1.01, y: -5 }}
              className="h-full p-14 rounded-[48px] bg-white border-2 border-orange-500 flex flex-col justify-between shadow-sm hover:shadow-2xl hover:shadow-orange-100/50 transition-all duration-500 relative overflow-hidden group"
            >
              <div className="relative z-10">
                <h3 className="text-4xl font-black text-slate-900 mb-6 leading-tight">Book a Ride in Seconds</h3>
                <p className="text-xl text-slate-600 mb-10 max-w-sm font-medium leading-relaxed opacity-80">
                  Get where you need to go without the stress. Fast, safe, and transparent travel for everyone.
                </p>
              </div>
              <Link href="/auth?role=passenger&redirect=/passenger" className="relative z-10">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button size="lg" className="h-16 px-10 text-lg font-black rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-xl shadow-orange-200 transition-all">
                    Book My First Ride
                  </Button>
                </motion.div>
              </Link>
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-orange-500/5 rounded-full group-hover:scale-150 transition-transform duration-700" />
            </motion.div>
          </ScrollReveal>

          {/* Driver CTA */}
          <ScrollReveal direction="right" className="flex-1">
            <motion.div
              whileHover={{ scale: 1.01, y: -5 }}
              className="h-full p-14 rounded-[48px] bg-white border-2 border-slate-200 flex flex-col justify-between shadow-sm hover:shadow-2xl hover:shadow-slate-100 transition-all duration-500 relative overflow-hidden group"
            >
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Earn with Yatra</span>
                </div>
                <h3 className="text-4xl font-black text-slate-900 mb-6 leading-tight">Maximize Your Earnings</h3>
                <p className="text-xl text-slate-600 mb-10 max-w-sm font-medium leading-relaxed opacity-80">
                  Join our network of elite drivers. Lower commissions, flexible hours, and guaranteed passengers.
                </p>
              </div>
              <Link href="/auth?role=driver&redirect=/driver" className="relative z-10">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button size="lg" variant="outline" className="h-16 px-10 text-lg font-black rounded-2xl border-2 border-slate-200 text-slate-900 hover:bg-slate-50 hover:border-slate-300 transition-all duration-500">
                    Start Driving Today
                  </Button>
                </motion.div>
              </Link>
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-slate-100 rounded-full group-hover:scale-150 transition-transform duration-700" />
            </motion.div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-white border-t border-slate-100 pt-28 pb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-slate-50 rounded-full blur-[100px] -mr-48 -mt-48 opacity-50" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-16 mb-24">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-8">
                <Image src="/yatra-logo.png" alt="Yatra" width={40} height={40} className="rounded-xl" />
              </div>
              <p className="text-slate-500 text-base leading-relaxed mb-8 font-medium opacity-80">
                Modernizing Nepal's transit ecosystem with real-time tracking and secure identity.
              </p>
              <div className="flex items-center gap-3">
                <div className="relative inline-flex items-center gap-3 px-4 py-2 rounded-full bg-slate-50 border border-slate-100 shadow-sm">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${onlineBuses && onlineBuses > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${onlineBuses && onlineBuses > 0 ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                  </span>
                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                    {onlineBuses === null ? 'Checking...' : `${onlineBuses} Buses Active`}
                  </span>
                </div>
              </div>
            </div>

            {[
              {
                title: 'Product',
                links: [
                  { label: 'Ride', href: '/auth?role=passenger&redirect=/passenger' },
                  { label: 'Drive', href: '/auth?role=driver&redirect=/driver' },
                  { label: 'Track', href: '/#ride' },
                ],
              },
              {
                title: 'Support',
                links: [
                  { label: 'Help Center', href: '/auth' },
                  { label: 'Safety Center', href: '/admin' },
                ],
              }
            ].map((col) => (
              <div key={col.title}>
                <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.25em] mb-8">{col.title}</h5>
                <ul className="space-y-5">
                  {col.links.map(item => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-base text-slate-600 hover:text-orange-500 transition-colors font-bold opacity-80 hover:opacity-100">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pt-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-sm text-slate-500 font-bold tracking-tight">
              © {new Date().getFullYear()} Yatra Technologies. Engineered for Nepal.
            </p>
            <div className="flex gap-10">
              <Link href="https://x.com" className="text-sm font-black text-slate-500 hover:text-orange-500 transition-colors tracking-widest uppercase">Twitter</Link>
              <Link href="https://facebook.com" className="text-sm font-black text-slate-500 hover:text-orange-500 transition-colors tracking-widest uppercase">Facebook</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
