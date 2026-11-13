import type { CapacitorConfig } from "@capacitor/cli";

// The Maroon iPhone app (project_specs.md "The Maroon as a real iPhone app"). The app's screens are packaged inside it:
// `npm run build:app` builds them into capacitor-web/ and copies them into the Xcode project — it never opens the
// website, and gets its data from the live server with its own login.
// MAROON_APP_DEV=1 (`npm run dev:app` + `npx cap run ios`): the Xcode simulator loads the app build's dev server on
// this Mac instead, so changes show without rebuilding. Never used for TestFlight builds.
const dev = process.env.MAROON_APP_DEV === "1";

const config: CapacitorConfig = {
  appId: "site.themaroon.app",
  appName: "The Maroon",
  webDir: "capacitor-web",
  ...(dev ? { server: { url: "http://localhost:3002", cleartext: true } } : {}),
};

export default config;
