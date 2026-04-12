// name=components/hero/SplineBackground.tsx
'use client'
s
import dynamic from 'next/dynamic'
import { Suspense, useState } from 'react'

const Spline = dynamic(
  () => import('@splinetool/react-spline/next'),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 bg-[#050505]">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-[rgba(0,194,255,0.03)] to-transparent" />
      </div>
    ),
  }
)

// ✅ Dark theme, optimized for performance
const SPLINE_SCENE_URL = "https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode"

export function SplineBackground() {
  const [loadError, setLoadError] = useState(false)

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <Suspense fallback={<div className="w-full h-full bg-[#050505]" />}>
        <div className="w-full h-full">
          <Spline
            scene={SPLINE_SCENE_URL}
            className="w-full h-full opacity-60"
            onLoad={() => {
              console.log('✓ Spline scene loaded successfully')
              setLoadError(false)
            }}
            onError={() => {
              console.error('✗ Spline failed to load')
              setLoadError(true)
            }}
          />
        </div>
      </Suspense>

      {/* Vignette overlays - Creates smooth fade to dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]/80 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/50 via-transparent to-[#050505]/50 pointer-events-none" />

      {/* Fallback if Spline fails */}
      {loadError && (
        <div className="absolute inset-0 bg-gradient-to-br from-[rgba(0,194,255,0.05)] via-[#050505] to-[#050505] flex items-center justify-center">
          <p className="text-white/40 text-sm">Loading scene...</p>
        </div>
      )}
    </div>
  )
}




// // Dark Vault/Safe Theme - Works perfectly
// const SPLINE_URLS = {
//   // Option A: Dark Minimal Scene (Recommended for your project)
//   darkVault: "https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode",
  
//   // Option B: Dark Abstract Particles
//   darkParticles: "https://prod.spline.design/mKfK8XfQ1y0U_zf5/scene.splinecode",
  
//   // Option C: Dark Geometric Shapes
//   darkGeometric: "https://prod.spline.design/qpqL2fH7X9mK0nB2/scene.splinecode",
  
//   // Option D: Cyberpunk Dark Room
//   cyberpunk: "https://prod.spline.design/7dL3pQ9rS2xK1vB8/scene.splinecode",
// }