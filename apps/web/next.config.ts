import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@recon/db",
    "@recon/auth",
    "@recon/events",
    "@recon/logger",
    "@recon/ui",
    "@recon/shared",
    "@recon/outreach",
  ],

  // Vercel deployment settings
  output: "standalone",

  // Ignore TypeScript/ESLint errors during build (CI handles these)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Mapbox GL requires client-side only
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
