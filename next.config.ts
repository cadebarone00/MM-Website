import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["lightningcss", "@tailwindcss/oxide"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Tells browsers to only ever reach this site over HTTPS, never HTTP.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Stops other sites from embedding this one in a hidden frame (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Stops the browser from guessing a file's type in a way that can be tricked into running as script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limits how much of this site's URL is leaked to other sites when a link is clicked.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
