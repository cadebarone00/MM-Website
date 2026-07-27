import type { NextConfig } from "next";

const SCOREKEEPER_ORIGIN = "https://maroon-masters-scorekeeper.vercel.app";

const nextConfig: NextConfig = {
  serverExternalPackages: ["lightningcss", "@tailwindcss/oxide"],
  async rewrites() {
    return [
      {
        source: "/portal/:path*",
        destination: `${SCOREKEEPER_ORIGIN}/portal/:path*`,
      },
    ];
  },
};

export default nextConfig;
