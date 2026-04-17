'use client';

import { getFirebaseApp } from './firebase';

export async function getPushTokenFromBrowser(): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') return null;
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn('[Push] NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing; skipping token registration.');
    return null;
  }

  const [{ getMessaging, getToken, isSupported }] = await Promise.all([
    import('firebase/messaging'),
  ]);

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const messaging = getMessaging(getFirebaseApp());

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  return token || null;
}
