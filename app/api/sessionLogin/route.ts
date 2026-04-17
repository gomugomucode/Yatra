import { NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const { idToken, role } = await request.json();

    if (!idToken || !role) {
      return NextResponse.json({ error: 'Missing idToken or role' }, { status: 400 });
    }

    let auth;
    try {
      auth = getFirebaseAdminAuth();
    } catch (e) {
      console.warn('[sessionLogin] Admin SDK not configured, using Dev Mode fallback.');
      // Dev Mode: Create a mock session if Admin SDK is missing
      const response = NextResponse.json({ status: 'ok', uid: 'dev-user', devMode: true });
      const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 days

      response.cookies.set('session', 'dev-session-token', {
        httpOnly: true,
        secure: false,
        path: '/',
        sameSite: 'lax',
        maxAge: expiresIn / 1000,
      });

      response.cookies.set('role', role, {
        httpOnly: true,
        secure: false,
        path: '/',
        sameSite: 'lax',
        maxAge: expiresIn / 1000,
      });

      return response;
    }

    const decoded = await auth.verifyIdToken(idToken);

    const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 days
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({ status: 'ok', uid: decoded.uid });

    const isProd = process.env.NODE_ENV === 'production';

    response.cookies.set('session', sessionCookie, {
      httpOnly: true,
      secure: isProd,
      path: '/',
      sameSite: 'lax',
      maxAge: expiresIn / 1000,
    });

    response.cookies.set('role', role, {
      httpOnly: true,
      secure: isProd,
      path: '/',
      sameSite: 'lax',
      maxAge: expiresIn / 1000,
    });

    return response;
  } catch (error) {
    console.error('[sessionLogin] error', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create session';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


