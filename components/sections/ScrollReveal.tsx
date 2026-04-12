// name=components/sections/ScrollReveal.tsx
'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

interface ScrollRevealProps {
  children: React.ReactNode
  delay?: number
  direction?: 'up' | 'left' | 'right'
}

export function ScrollReveal({ 
  children, 
  delay = 0, 
  direction = 'up' 
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  const initial = {
    up: { opacity: 0, y: 32, filter: 'blur(6px)' },
    left: { opacity: 0, x: -24, filter: 'blur(4px)' },
    right: { opacity: 0, x: 24, filter: 'blur(4px)' },
  }[direction]

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={inView ? { opacity: 1, y: 0, x: 0, filter: 'blur(0px)' } : initial}
      transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}