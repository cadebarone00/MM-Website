import type { NextConfig } from "next";

const SCOREKEEPER_ORIGIN =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3002"
    : "https://maroon-masters-scorekeeper.vercel.app";

const nextConfig: NextConfig = {
  serverExternalPackages: ["lightningcss", "@tailwindcss/oxide"],
  async rewrites() {
    return [
      // Split into an exact match and a one-or-more wildcard (rather than a
      // single /:path* rule) so the bare "/portal" case never builds a
      // destination URL with a trailing slash. With :path* matching zero
      // segments, the destination becomes ".../portal/", which trips the
      // scorekeeper's own trailing-slash redirect back to "/portal" — a
      // relative Location header that gets resolved against this domain
      // instead of the scorekeeper's, causing an infinite redirect loop.
      {
        source: "/portal",
        destination: `${SCOREKEEPER_ORIGIN}/portal`,
      },
      {
        source: "/portal/:path+",
        destination: `${SCOREKEEPER_ORIGIN}/portal/:path+`,
      },
    ];
  },
};

export default nextConfig;
