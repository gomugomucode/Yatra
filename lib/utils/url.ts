/**
 * Returns the base URL of the application.
 * Prioritizes NEXT_PUBLIC_APP_URL, then Vercel deployment URL, then localhost.
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback for local development
  return 'http://localhost:3000';
}
