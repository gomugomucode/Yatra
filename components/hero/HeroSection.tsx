// // name=components/hero/HeroSection.tsx
// 'use client'

// import { motion } from 'framer-motion'
// import { HeroText } from './HeroText'
// import { SplineBackground } from './SplineBackground'

// const containerVariants = {
//   hidden: { opacity: 0 },
//   visible: {
//     opacity: 1,
//     transition: { staggerChildren: 0.2, delayChildren: 0.3 },
//   },
// }

// export function HeroSection() {
//   return (
//     <section className="relative min-h-screen w-full overflow-hidden bg-[#050505]">
//       {/* Background */}
//       <SplineBackground />

//       {/* Gradient Overlays */}
//       <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]/40 z-5" />
//       <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(0,194,255,0.08),transparent)]" />

//       {/* Content */}
//       <motion.div
//         className="relative z-10 flex items-center justify-center min-h-screen px-8"
//         variants={containerVariants}
//         initial="hidden"
//         animate="visible"
//       >
//         <div className="max-w-[800px] w-full">
//           <HeroText />
//         </div>
//       </motion.div>

//       {/* Scroll Indicator */}
//       <motion.div
//         className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
//         animate={{ y: [0, 8, 0] }}
//         transition={{ repeat: Infinity, duration: 2 }}
//       >
//         <div className="text-center">
//           <p className="text-xs text-white/40 uppercase tracking-[0.08em] mb-2">Scroll to explore</p>
//           <div className="w-6 h-10 border border-white/20 rounded-full flex items-center justify-center mx-auto">
//             <motion.div
//               className="w-1 h-2 bg-white/40 rounded-full"
//               animate={{ y: [0, 4, 0] }}
//               transition={{ repeat: Infinity, duration: 2 }}
//             />
//           </div>
//         </div>
//       </motion.div>
//     </section>
//   )
// }



// name=components/hero/HeroSection.tsx

'use client'

import { motion } from 'framer-motion'
import { HeroText } from './HeroText'
import { SplineBackground } from './SplineBackground'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.3 },
  },
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-[#050505]">
      {/* Background */}
      <SplineBackground />

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]/40 z-5" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(0,194,255,0.08),transparent)]" />

      {/* Content */}
      <motion.div
        className="relative z-10 flex items-center justify-center min-h-screen px-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="max-w-[800px] w-full">
          <HeroText />
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <div className="text-center">
          <p className="text-xs text-white/40 uppercase tracking-[0.08em] mb-2">Scroll to explore</p>
          <div className="w-6 h-10 border border-white/20 rounded-full flex items-center justify-center mx-auto">
            <motion.div
              className="w-1 h-2 bg-white/40 rounded-full"
              animate={{ y: [0, 4, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  )
}