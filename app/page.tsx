'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  const { currentUser, signOut } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [onlineBuses, setOnlineBuses] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  const handleRoleSwitch = async (role: 'driver' | 'passenger') => {
    if (currentUser) {
      await signOut();
      const targetRedirect = role === 'driver' ? '/driver' : '/passenger';
      window.location.href = `/auth?role=${role}&redirect=${targetRedirect}&switch_role=true`;
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-orange-100 selection:text-orange-900">
      
      {/* ═══ NAVBAR ═══ */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Left: Logo */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <Bus className="text-white w-6 h-6" />
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-900">Yatra</span>
            </div>

            {/* Center: Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {['Home', 'Ride', 'Driver', 'Pricing', 'Support'].map((item) => (
                <Link 
                  key={item} 
                  href={item === 'Home' ? '/' : `/#${item.toLowerCase()}`}
                  className="text-sm font-semibold text-slate-600 hover:text-orange-500 transition-colors"
                >
                  {item}
                </Link>
              ))}
            </div>

            {/* Right: Auth CTAs */}
            <div className="hidden md:flex items-center gap-4">
              {isClient && currentUser ? (
                <>
                  <Link href={currentUser.role === 'driver' ? '/driver' : '/passenger'}>
                    <Button variant="ghost" className="font-bold text-slate-600">Dashboard</Button>
                  </Link>
                  <Button 
                    onClick={() => signOut()} 
                    variant="outline" 
                    className="rounded-full border-slate-200 font-bold"
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth">
                    <Button variant="ghost" className="font-bold text-slate-600">Login</Button>
                  </Link>
                  <Link href="/auth?isSignUp=true">
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full px-8 shadow-lg shadow-orange-200 transition-all hover:scale-105 active:scale-95">
                      Sign Up
                    </Button>
                  </Link>
                </>
              )}
            </div>

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
        {isMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-100 py-6 px-4 space-y-4 animate-in slide-in-from-top duration-300">
            {['Home', 'Ride', 'Driver', 'Pricing', 'Support'].map((item) => (
              <Link 
                key={item} 
                href={item === 'Home' ? '/' : `/#${item.toLowerCase()}`}
                className="block text-lg font-bold text-slate-900"
                onClick={() => setIsMenuOpen(false)}
              >
                {item}
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
        )}
      </nav>

      {/* ═══ HERO SECTION ═══ */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-white">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-50/50 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50/50 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 border border-orange-100 mb-8">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-sm font-bold text-orange-700 tracking-tight">Now Live in Butwal, Nepal</span>
              </div>
            </ScrollReveal>
            
            <ScrollReveal delay={100}>
              <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tight mb-8 leading-[0.95]">
                Move Smarter. <br />
                <span className="text-orange-500">Connect Better.</span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-2xl mx-auto font-medium">
                Real-time transit tracking and seamless booking for Nepal. 
                Experience safe, fast, and transparent travel at your fingertips.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Link href="/auth?role=passenger&redirect=/passenger" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto h-16 px-10 text-lg font-black rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-xl shadow-orange-200 transition-all hover:scale-105 active:scale-95 group">
                    Ride as Passenger
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/auth?role=driver&redirect=/driver" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto h-16 px-10 text-lg font-black rounded-2xl border-2 border-slate-200 text-slate-700 hover:bg-slate-50 transition-all hover:scale-105 active:scale-95">
                    Drive with Yatra
                  </Button>
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={400}>
              <div className="mt-16 flex items-center justify-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-slate-700" />
                  <span className="text-sm font-bold text-slate-900">Verified Drivers</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-slate-700" />
                  <span className="text-sm font-bold text-slate-900">Real-time GPS</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-slate-700" />
                  <span className="text-sm font-bold text-slate-900">Paperless Tickets</span>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES SECTION ═══ */}
      <section id="features" className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
              Engineered for Modern Transit
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              We've combined satellite technology and secure identity to bring you a travel experience like never before.
            </p>
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
              <ScrollReveal key={i} delay={i * 100}>
                <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-6">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-4">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="ride" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2">
              <ScrollReveal>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-8">
                  Travel simplified. <br />
                  <span className="text-orange-500">Three easy steps.</span>
                </h2>
                
                <div className="space-y-12">
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
                    <div key={i} className="flex gap-6">
                      <div className="text-4xl font-black text-orange-100 leading-none">{step.step}</div>
                      <div>
                        <h4 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h4>
                        <p className="text-slate-600">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollReveal>
            </div>
            
            <div className="lg:w-1/2 relative">
              <ScrollReveal delay={200}>
                <div className="rounded-[40px] overflow-hidden border-8 border-slate-100 shadow-2xl">
                  {/* Map Mockup / SVG */}
                  <div className="aspect-[4/5] bg-slate-50 relative">
                    <div className="absolute inset-0 bg-orange-100/10" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orange-500/5 rounded-full animate-pulse" />
                    <div className="absolute top-[40%] left-[30%] p-3 bg-white rounded-2xl shadow-xl flex items-center gap-3 border border-slate-100 animate-bounce duration-[3s]">
                      <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                        <Bus className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900">Bus #402</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">2 mins away</div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PASSENGER & DRIVER CTA BLOCKS ═══ */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
          {/* Passenger CTA */}
          <div className="flex-1 p-12 rounded-[40px] bg-white border-2 border-orange-500 flex flex-col justify-between hover:shadow-2xl hover:shadow-orange-100 transition-all duration-500">
            <div>
              <h3 className="text-4xl font-black text-slate-900 mb-4">Book a Ride in Seconds</h3>
              <p className="text-lg text-slate-600 mb-8 max-w-sm">
                Get where you need to go without the stress. Fast, safe, and transparent travel for everyone.
              </p>
            </div>
            <Link href="/auth?role=passenger&redirect=/passenger">
              <Button size="lg" className="h-16 px-10 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-xl shadow-orange-200">
                Book My First Ride
              </Button>
            </Link>
          </div>

          {/* Driver CTA */}
          <div className="flex-1 p-12 rounded-[40px] bg-slate-900 flex flex-col justify-between hover:shadow-2xl hover:shadow-slate-200 transition-all duration-500 group">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Earn with Yatra</span>
              </div>
              <h3 className="text-4xl font-black text-white mb-4">Maximize Your Earnings</h3>
              <p className="text-lg text-slate-400 mb-8 max-w-sm">
                Join our network of elite drivers. Lower commissions, flexible hours, and guaranteed passengers.
              </p>
            </div>
            <Link href="/auth?role=driver&redirect=/driver">
              <Button size="lg" variant="outline" className="h-16 px-10 text-lg font-bold rounded-2xl border-2 border-white/20 text-white hover:bg-white/10 transition-all">
                Start Driving Today
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-slate-50 border-t border-slate-100 pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-8">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                  <Bus className="text-white w-5 h-5" />
                </div>
                <span className="text-xl font-black tracking-tight text-slate-900">Yatra</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Modernizing Nepal's transit ecosystem with real-time tracking and secure identity.
              </p>
              <div className="flex items-center gap-3">
                <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${onlineBuses && onlineBuses > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${onlineBuses && onlineBuses > 0 ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                  </span>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">
                    {onlineBuses === null ? 'Checking...' : `${onlineBuses} Buses Active`}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Product</h5>
              <ul className="space-y-4">
                {['Ride', 'Drive', 'Track', 'Pricing', 'Safety'].map(item => (
                  <li key={item}><Link href="#" className="text-sm text-slate-500 hover:text-orange-500 transition-colors font-medium">{item}</Link></li>
                ))}
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Company</h5>
              <ul className="space-y-4">
                {['About Us', 'Careers', 'Press', 'Blog', 'Contact'].map(item => (
                  <li key={item}><Link href="#" className="text-sm text-slate-500 hover:text-orange-500 transition-colors font-medium">{item}</Link></li>
                ))}
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Support</h5>
              <ul className="space-y-4">
                {['Help Center', 'Safety Center', 'Terms', 'Privacy', 'Legal'].map(item => (
                  <li key={item}><Link href="#" className="text-sm text-slate-500 hover:text-orange-500 transition-colors font-medium">{item}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-sm text-slate-400 font-medium">
              © {new Date().getFullYear()} Yatra Technologies. All rights reserved.
            </p>
            <div className="flex gap-8">
              <Link href="#" className="text-slate-400 hover:text-slate-900 transition-colors">Twitter</Link>
              <Link href="#" className="text-slate-400 hover:text-slate-900 transition-colors">Facebook</Link>
              <Link href="#" className="text-slate-400 hover:text-slate-900 transition-colors">LinkedIn</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
