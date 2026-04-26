import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toEmailKey = (email: string) => email.replace(/[.#$[\]/]/g, '_');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }

    const db = getAdminDb();
    const waitlistRef = db.ref('waitlist');
    const byEmailRef = db.ref(`waitlistByEmail/${toEmailKey(email)}`);
    const dedupeWrite = await byEmailRef.transaction((current) => {
      if (current) return current;
      return { reservedAt: Date.now(), email };
    });

    if (!dedupeWrite.committed) {
      return NextResponse.json({ error: 'This email is already on the waitlist.' }, { status: 409 });
    }

    const entryRef = waitlistRef.push();
    await entryRef.set({
      id: entryRef.key,
      email,
      name,
      createdAt: Date.now(),
      source: request.headers.get('origin') || 'direct',
    });

    await byEmailRef.update({ waitlistId: entryRef.key });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Waitlist POST failed', error);
    return NextResponse.json({ error: 'Unable to process request right now.' }, { status: 500 });
  }
}
