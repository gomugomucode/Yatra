import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/driver', '/passenger'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const session = request.cookies.get('session')?.value;
  const role = request.cookies.get('role')?.value as 'driver' | 'passenger' | undefined;

  // Redirect unauthenticated access to protected routes
  if (isProtected && !session) {
    const loginUrl = new URL('/auth', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Simple role-based gating (client still enforces finer-grain checks)
  if (pathname.startsWith('/driver') && role && role !== 'driver') {
    return NextResponse.redirect(new URL('/passenger', request.url));
  }

  if (pathname.startsWith('/passenger') && role && role !== 'passenger') {
    return NextResponse.redirect(new URL('/driver', request.url));
  }

  // Allow role switching - if user wants to switch roles, let them through to auth page
  if (pathname === '/auth' && session && role) {
    const switchRole = request.nextUrl.searchParams.get('switch_role');

    if (switchRole === 'true') {
      return NextResponse.next();
    }

    const target = role === 'driver' ? '/driver' : '/passenger';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/auth', '/driver/:path*', '/passenger/:path*'],
};
