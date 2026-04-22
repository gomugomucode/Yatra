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
      console.error('[sessionLogin] Firebase Admin SDK not configured:', e);
      return NextResponse.json(
        { error: 'Authentication service unavailable' },
        { status: 500 }
      );
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


