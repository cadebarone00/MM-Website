/**
 * This app build's number. The TestFlight upload (.github/workflows/testflight.yml) sets NEXT_PUBLIC_APP_BUILD to the
 * same number it gives Xcode's Build number, so the "Update The Maroon" check (/api/app/version) and Apple agree.
 * A local build (`npm run build:app`) is build 1.
 */
export const APP_BUILD = Number.parseInt(process.env.NEXT_PUBLIC_APP_BUILD ?? "", 10) || 1;
