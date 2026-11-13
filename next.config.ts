import type { NextConfig } from "next";

// Development only (`next dev`): the MAIN workspace's /dev simulator at this one local address may show this workspace's
// pages (the real sign-in screens, on maroon-auth-dev) in its phone. Builds for production keep X-Frame-Options SAMEORIGIN.
const devFrameParent = process.env.NODE_ENV === "development" ? "http://localhost:3001" : null;

// The iPhone / Android app build (`npm run build:app`, project_specs.md "The Maroon as a real iPhone app"): only the app's
// screens (`page.app.tsx` / `layout.app.tsx`, next to the website's own pages) become static files in capacitor-web/,
// which Capacitor packages into the Xcode project. No /api routes, middleware or server pages are in it; the app gets
// its data from the live server with its own login.
const appBuild = process.env.MAROON_APP_BUILD === "1";
const appConfig: NextConfig = {
  output: "export",
  distDir: "capacitor-web",
  pageExtensions: ["app.tsx", "app.ts"],
  trailingSlash: true,
  images: { unoptimized: true },
  // Its own type check (tsconfig.app.json), so the website build's generated route types don't get mixed in.
  typescript: { tsconfigPath: "tsconfig.app.json" },
  env: { NEXT_PUBLIC_MAROON_APP: "1" },
};

const nextConfig: NextConfig = appBuild ? appConfig : {
  distDir: process.env.NEXT_BUILD_OUTPUT || ".next",
  serverExternalPackages: ["lightningcss", "@tailwindcss/oxide"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Tells browsers to only ever reach this site over HTTPS, never HTTP.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Admin embeds real website pages on this origin; other origins cannot frame them.
          devFrameParent
            ? { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${devFrameParent}` }
            : { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Stops the browser from guessing a file's type in a way that can be tricked into running as script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limits how much of this site's URL is leaked to other sites when a link is clicked.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Admin's Live Scoring Page Editor puts this one page inside its own iframes to show two phones side by side.
        // Same-origin only, so the site-wide SAMEORIGIN above still blocks every other site from framing it.
        source: "/portal/admin/scoring-preview/mobile",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // The Admin portal's Broadcast Controls preview (and Mock Run) puts
        // /broadcast inside its own iframe (BroadcastPreview.tsx). Same-origin
        // only, so the site-wide SAMEORIGIN above still blocks every other site
        // from framing it.
        source: "/broadcast",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
