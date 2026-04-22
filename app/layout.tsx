import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono, Mukta } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import OfflineBanner from "@/components/shared/OfflineBanner";
import PwaBootstrap from "@/components/shared/PwaBootstrap";
import dynamic from "next/dynamic";

const WalletProviderWrapper = dynamic(
  () => import("@/components/providers/WalletProviderWrapper"),
  { ssr: false }
);

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
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
        className={`${outfit.variable} ${jetbrainsMono.variable} ${mukta.variable} antialiased font-sans`}
      >
        <AuthProvider>
          <WalletProviderWrapper>
            <PwaBootstrap />
            {children}
            <Toaster />
            <SonnerToaster richColors position="top-center" duration={5000} />
            <OfflineBanner />
          </WalletProviderWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
