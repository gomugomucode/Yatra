import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["snarkjs"],
  transpilePackages: ['firebase', '@firebase/auth', '@firebase/app'],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;