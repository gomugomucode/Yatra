'use client';

import { getFirebaseApp } from './firebase';

export async function getPushTokenFromBrowser(): Promise<string | null> {
  try {
    if (typeof window === 'undefined') return null;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return null;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      return null;
    }

    const [{ getMessaging, getToken, isSupported }] = await Promise.all([
      import('firebase/messaging'),
    ]);

    const supported = await isSupported().catch(() => false);
    if (!supported) return null;

    // Standardize sw registration and handle errors
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch((err) => {
        if (err.name !== 'AbortError') console.debug('[Push] SW registration failed:', err);
        return null;
      });
      
    if (!registration) return null;

    const messaging = getMessaging(getFirebaseApp());

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    }).catch((err) => {
      if (err.name !== 'AbortError') console.debug('[Push] Token retrieval failed:', err);
      return null;
    });

    return token || null;
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.debug('[Push] Unexpected registration error:', err?.message || err);
    }
    return null;
  }
}
