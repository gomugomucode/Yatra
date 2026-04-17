'use client';

import { useEffect } from 'react';

export default function PwaBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        // Pull updates in quickly for active driver sessions.
        registration.update().catch(() => undefined);
      } catch (error) {
        console.error('[PWA] Failed to register service worker:', error);
      }
    };

    register();
  }, []);

  return null;
}
