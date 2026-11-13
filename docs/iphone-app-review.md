# The Maroon iPhone / Android app (Capacitor, screens bundled) — feature review

Status: **review_required**. Built locally on `cam/explore-content` (Phase 1 and Phase 2 of project_specs.md "The Maroon as a real iPhone app"); not committed, not uploaded to TestFlight. Nothing here establishes legal compliance or authorizes release.

## What it is

- The website's own screens are built into the app (`npm run build:app`, a static export into `capacitor-web/`), with bundle ID `site.themaroon.app`. The app never opens the website as its interface.
- The app gets its data from the live server's API routes, signed in with its own Supabase session.
  - The session is kept in the iPhone Keychain or Android Keystore (`@aparajita/capacitor-secure-storage`).
  - It is sent as a Bearer token with `credentials: omit`, so no cookies are used.
- Server pages the app shows load through `/api/app/*` data routes. Those routes use the same loaders and the same access rules as the website pages (`lib/account/accessPolicy.ts`, category `active`). `/api/app/version` is public and returns only the oldest supported build number.
- CORS answers only the app's own origins (`capacitor://localhost` and `https://localhost`), and `http://localhost:3002` in development. It never allows credentials.

## Findings

- **Personal data / privacy.**
  - The app adds no new data collection, analytics, advertising identifiers or tracking.
  - On the device, it stores only the Supabase session (in the Keychain/Keystore) and the existing per-screen local drafts.
  - Signing out clears the stored session. Account deletion is reachable in the app (Settings → Delete account), as Apple requires for apps with account creation.
  - App Store privacy labels ("data linked to you": name, email, birthday, photos, golf scores and user content) still need to be written. **Follow-up.**
- **Security.**
  - Bearer identity goes through the existing verified boundary (`createSupabaseServerClient` with an `Authorization` header and `session_is_revoked`). No service-role key ships in the app.
  - The bundle contains only `NEXT_PUBLIC_*` values (the Supabase URL and anon key, which are already public on the website).
- **Platform rules (Apple / Google).**
  - Wagers and Fantasy are kept out of the app and not linked out of it (owner decision 2026-11-10). They must be decided before a public App Store release (guideline 5.3, gambling; age rating).
  - Sign-in is email only for TestFlight. If Google sign-in is added, Sign in with Apple is required (guideline 4.8). **Follow-up.**
  - The app is a full native-packaged experience rather than a thin website wrapper (guideline 4.2), but this still needs judgment at review.
  - Pages that exist only on the website open in the phone's browser.
  - An "Update The Maroon" screen appears only when the server's `MAROON_APP_MIN_BUILD` is set above the app's `APP_BUILD`. It never blocks use offline.
- **Minors.** Same sign-up age rules as the website (birthday after account creation). The App Store age rating questionnaire is not done yet. **Follow-up.**
- **Intellectual property / open source.**
  - The app icon and launch screen use The Maroon's own M mark (`public/brand/maroon-app-icon.svg`, `public/brand/maroon-m-white.svg`).
  - Capacitor and its plugins are MIT licensed. An open-source notices screen is not built yet. **Follow-up.**
- **Retention.** No change. The server keeps data as the website does.

## Not verified

- **Real device:** native build and run on a real iPhone. Blocked until a Mac that can run Xcode 26 is available.
  - Swipe-back, the keyboard and the Keychain on a device are therefore unverified.
  - It's also unverified that Capacitor serves the trailing-slash `index.html` pages and the `.txt` route data files.
- **Signed in:** a signed-in pass through every app screen with a real account and real tournament data. The pages are checked only to load on the app dev server.
- **Android:** an Android device or emulator run.
