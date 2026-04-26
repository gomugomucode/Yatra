import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif, Space_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import OfflineBanner from "@/components/shared/OfflineBanner";
import PwaBootstrap from "@/components/shared/PwaBootstrap";
import ClientWalletProvider from "@/components/providers/ClientWalletProvider";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const viewport: Viewport = {
  themeColor: "#05070A",
};

export const metadata: Metadata = {
  title: "YATRA",
  description: "Track your bus in real-time, book seats, and share your ride.",
  manifest: "/manifest.json",
  applicationName: "Yatra",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Yatra",
  },
  icons: {
    icon: [
      { url: "/icons/pwa-192.svg", type: "image/svg+xml" },
      { url: "/icons/pwa-512.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/pwa-192.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} ${spaceMono.variable} antialiased`}
      >
        <AuthProvider>
          <ClientWalletProvider>
            <PwaBootstrap />
            {children}
            <Toaster />
            <SonnerToaster richColors position="top-center" duration={5000} />
            <OfflineBanner />
          </ClientWalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
