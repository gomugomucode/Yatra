import WaitlistForm from '@/components/waitlist/WaitlistForm';

export default function IntroSection() {
  return (
    <section className="py-24 px-4 text-center bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Hero title */}
      <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
        Yatra – Seamless Bus Ride Booking
      </h1>
      {/* Tagline */}
      <p className="text-xl md:text-2xl text-zinc-300 max-w-2xl mx-auto mb-8">
        Book, track, and ride buses in real‑time across Nepal. No app download required – just a secure web experience.
      </p>
      {/* Brief intro paragraph */}
      <div className="max-w-3xl mx-auto text-left text-zinc-400 mb-8 space-y-4">
        <p>
          Yatra combines satellite‑level GPS, Solana‑backed authentication, and zero‑knowledge identity verification to give you a premium, privacy‑first transit experience.
        </p>
        <p>
          • Real‑time bus locations
          <br />• Cryptographic driver identity
          <br />• Instant ride confirmation with no credit‑card required
        </p>
      </div>
      {/* Waitlist form */}
      <WaitlistForm />
    </section>
  );
}
