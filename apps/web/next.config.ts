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
};

export default nextConfig;
