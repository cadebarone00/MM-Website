# The Maroon: App-first architecture

**Status:** decided by the owner on 2026-11-24. **Everyone who writes code for The Maroon follows this**: people (Cade, Cam) and agents (Claude, Codex, any other). Read this before building anything. If a request seems to go against it, ask the owner first.

---

## 1. The decision in one paragraph

The Maroon is a **native phone app** (iPhone first, then Android), built with **Expo (React Native)** in the `mobile/` folder, so it feels perfectly smooth. Players do everything in the app. The **website** (Next.js) becomes the **desktop companion**: organizer and admin tools, public live pages, marketing, and the dev simulator. **One shared server and database** (the Next.js `/api` routes + Supabase) serve both. The **Apple Watch** app is native Swift and plugs into the phone app.

**Why:** the current phone app (Capacitor) shows web pages inside an app shell, so it never feels fully native. Expo draws real iPhone and Android screens and still lets us write TypeScript/React and reuse all our logic.

---

## 2. What goes where

| Part | Folder | What it's for | Who uses it |
|---|---|---|---|
| **Phone app** | `mobile/` | Every player-facing screen: Play, Golf Trips, scoring, Profile, friends, Tourneys, Leagues, sign-up, settings, Pick'ems, Fantasy, Wagers | Players (everyone) |
| **Server** | `app/api/` | All data in and out. The app's routes are `app/api/app/*` | The app and the website |
| **Shared logic** | `lib/` | Scoring, leaderboards, games, drafts, handicaps, rules, data loading. Pure TypeScript, no web-only code | The server, the website, and (later) the app |
| **Database** | `supabase/` | Supabase tables, policies, SQL files | The server |
| **Desktop website** | `app/` (pages), `components/` | Desktop companion: organizer/admin tools, The Maroon Live + TV mode, marketing / "Get the app", sign-in email links, support | Organizers, admins, spectators, new visitors |
| **Dev simulator** | `app/dev/`, `lib/dev/` | Previewing and rehearsing, for development only | Cade, Cam, agents |
| **Apple Watch** | inside the phone app's native project (later) | Small companion: round summary, quick scoring, leaderboard | Players with a watch |
| **Old phone app** | `capacitor-web/`, `ios/`, `android/`, `*.app.tsx` files | Keeps shipping on TestFlight **until** the Expo app replaces it. Bug fixes only, no new features | Current testers |

---

## 3. Rules for everyone writing code

1. **New player-facing features go in `mobile/`.** Don't build new player screens on the website or in `*.app.tsx` files. If you're unsure whether something is "player-facing", ask the owner.
2. **The website only gets desktop-companion work**: organizer/admin tools, live/TV pages, marketing, sign-in/support flows, and the dev simulator.
3. **Logic lives in `lib/`, not in screens.** Write it as plain TypeScript (no `window`, `document`, CSS or Next.js imports) so the website, the server and the app can all use it.
4. **The app talks to the server only through `/api/app/*`**, with `Authorization: Bearer <token>`. The app never reads the database directly for anything private. New data the app needs = a new or extended `/api/app/*` route that both the app and the website can share.
5. **The app's server address is `https://www.themaroon.site`.** The bare domain redirects there, and a redirect drops the login header.
6. **Rebuild one area at a time** (section 4). Each area gets its own short spec in `project_specs.md`, the owner approves it, it gets built, and it's checked on a real phone in Expo Go before the next area starts.
7. **Match the website's look.** Same colors (maroon + cream + gold), Spectral font, 16px side gutter, gold-ring avatars, the standard 85% slide-up sheet with the maroon X, the standard search look. These become shared building blocks in `mobile/src/components/` (Step 0), and every screen uses them instead of making its own.
8. **Never commit secrets.** `mobile/.env` (Supabase URL + public key + server address) is git-ignored; `mobile/.env.example` is the template.
9. **Commit your own work, and only your own.** Several people and agents work in this folder at the same time. Never stash, reset or check out over someone else's uncommitted files.
10. **Every new spec says its side.** Each feature spec in `project_specs.md` starts with one line: `**Side:** App` / `Website` / `Server` (or a mix, e.g. `App + Server`). The owner checks it when approving, before any code is written.
11. **Freeze = no moving target.** From 2026-11-24 the website's player screens and the Capacitor app (`*.app.tsx`) get **bug fixes only**. New player behavior is added to `mobile/` only. If a fix to an old screen changes what players see, note it in that area's checklist (rule 12) so the rebuild includes it.
12. **"Nothing missing" checklist for every area.** Before rebuilding an area, list everything the current version does: every screen, button, state (loading, empty, error, signed-out, the /dev simulator's Conditionals), message and rule. The list goes in the area's spec and the owner approves it. The area is **done** only when every line works in the new app, checked on a real phone side by side with the old app.
13. **Same brain, same results.** Behavior (scoring, leaderboards, games, handicaps, permissions) comes from the shared `lib/` code and `/api` routes, never re-written inside a screen. Same inputs must give the same results in the app and on the website.

---

## 3b. Automatic checks (GitHub, every push and pull request)

`.github/workflows/app-first.yml` runs:
- **App-first guard** (`node scripts/check-app-first.mjs`): **fails** if a new `*.app.tsx` screen is added to the frozen Capacitor app; **warns** if a new website page appears outside the desktop-companion folders (admin, portal, dashboard, dev, broadcast, tap-in, t, watch, watch-live, website, auth, login, signup, password pages, account, contact, sponsorship, merchandise, videos, the-maroon, schedule). The files that existed on 2026-11-24 are listed in `scripts/app-first-baseline.json`. Adding to that list needs the owner's OK.
- **Expo app tests + type check:** `npm ci`, `npm test` and `npx tsc --noEmit` in `mobile/`.

A red X on GitHub means stop and fix before merging. Optional (owner's call): GitHub → Settings → Branches → protect `main` and require these checks to pass before merging.

---

## 4. Rebuild order (approved 2026-11-24)

| # | Area | Contents | Status |
|---|---|---|---|
| 1 (setup) | **Bare app** | Expo project, sign in, five tabs, real Profile name, sign out | ✅ Done (commit `a181b633`), phone-checked |
| 0 | **Building blocks** | Buttons, cards, avatars, slide-up sheet, search, page headers, tab bar | ✅ Done 2026-11-24 (look tuned as screens arrive) |
| 1 | **Play** | Play home, start / join a round, scoring, live leaderboard | ✅ Done 2026-11-24 (look tuned later) |
| 2 | **Golf Trips** | List, join, create wizard, trip page (all tabs), scoring, drafts, settings, flights, import | |
| 3 | **Profile** | Profile, edit, friends, search golfers, other profiles, settings, delete account | ✅ Built 2026-11-25 (3a–3d); Delete account phone-checked |
| 4 | **Sign up + onboarding** | Sign up, forgot password, Google / Apple sign-in, onboarding | ✅ Built 2026-11-25, sign-up phone-checked (Google / Apple wait until switched on for the app) |
| 5 | **Tourneys** | Join, create, Studio, live, invites, request access, My Tournaments | |
| 6 | **Leagues** | List, join, create, league page | ✅ Built 2026-11-25 (5a + 5b), not phone-checked |
| 7 | **Review existing code** | Pick'ems, Fantasy, Wagers, Watch Live, Schedule, Contact are not needed in the Expo rebuild; review existing code and possible removal | |
| 8 | **Swap it in** | EAS Build → TestFlight replaces the Capacitor app, then Android / Google Play | |
| — | **Apple Watch** | Swift watch app, designed first in the /dev simulator. Any time after Play | |

Update the Status column when an area is done.

---

## 5. How to run the app

1. One-time setup: sign in to the **same free Expo account** on the computer (`npx expo login`) and in the **Expo Go** app on the iPhone.
2. `cd mobile`, then **`npx expo start --go`** (the `--go` matters since 2026-11-25: `expo-dev-client` is installed, so plain `npx expo start` makes a QR code for the development build, which the iPhone camera can't open). Then open the project from inside the **Expo Go** app (Development servers, or Enter URL manually). If the phone can't find the computer, use **`npx expo start --go --tunnel`**. This PC also has a WSL network address that Expo may advertise instead of the Wi-Fi one. Press `s` in a running Expo terminal to switch between Expo Go and the development build.
3. Changes show on the phone in about a second (Fast Refresh).
4. Checks before calling anything done: `npm test` and `npx tsc --noEmit` inside `mobile/`, plus the area's spec checklist on a real phone.
5. Add packages with `npx expo install <package>` (it picks versions that match the Expo SDK), never plain `npm install`. Some native features (maps, widgets, Live Activities, the watch) don't run in Expo Go and need an EAS "development build". Plan for that in the area's spec.
6. **EAS is set up (2026-11-25).** The Expo project id is in `mobile/app.json` (`extra.eas.projectId`, owner `cadebarone00`), and `mobile/eas.json` has the `development` / `preview` / `production` profiles. The development build is **"The Maroon (Dev)"**, app id `site.themaroon.app.dev` (`mobile/app.config.js`), so it installs next to the TestFlight app. Production uses `site.themaroon.app`, the same id as the current Capacitor TestFlight app, so the first Expo production build **replaces** it. Don't run `eas build` / `eas submit` for production without Cade. Builds need the Apple login that owns the paid developer team.
7. **Phone notifications (Expo app Step 6, project_specs.md).** Day-to-day testing is in Expo Go on an iPhone. Expo Go on Android can't receive them. In the app: Settings → Notifications → Phone notifications → Allow → Send a test notification. Server: `lib/notifications/pushServer.ts` → `sendPush({ to, kind, values })`, with each kind from `lib/notifications/catalog.ts`. `supabase/push_devices.sql` is **run in production**. To add a type, call `sendPush` where its change already saves on the server, then add the tap target to `mobile/src/lib/pushRoutes.ts`. Notifications reach real users once they're in a production (TestFlight) build.

---

## 6. Open items (decide when they come up)

- **Previewing app screens in the /dev simulator.** The simulator is a website, so it shows website screens only. Options when we get there: Expo's web preview of `mobile/`, or previewing on the phone.
- **Sharing `lib/` code with `mobile/`.** Step 1 doesn't import from `lib/` yet. The first area that needs shared logic (Play scoring) decides how (direct import vs. a shared package).
- **Website features already planned for players** (for example the "Insights" stats dashboard spec of 2026-11-24): check them against rule 1 before building, and decide whether they belong in the app, the desktop website, or both.

## Where we are + to-do list

- **Built, not phone-checked yet:** Golf Trips 2b (Trip Builder); Profile 3a–3c and Settings; Leagues 5a–5b (needs `supabase/leagues.sql` in production; not confirmed it was run). Parts 2c and 2d are still being built and are not complete.
- **2026-11-24 owner instruction for this push:** Write each part's checklist, record routine choices as “Codex's call”, and build without pausing for an approval between parts. Ask before running SQL, deleting or renaming important files, pushing to GitHub, or making a decision that changes real data or website behavior. Phone checks remain outstanding until performed.
- **Next:** Golf Trips 2c (the trip page + Home tab), then 2d (the Golf tab + trip scoring with Player & Attest), 2e (Team Draft + Match Selection), 2f (Venue, Itinerary, My Travel, Flights), and 2g (Trip Settings, Import past trip). Then Profile → Sign-up/onboarding → Tourneys → Leagues → EAS Build to TestFlight → Android. Part 2c is in progress locally and is not complete.
- **Owner decision 2026-11-24:** Skip Pick'ems, Fantasy, Wagers, Watch Live, Schedule and Contact in the native rebuild. Their existing code remains in the repository; review its use and dependencies and consider removal later. Do not delete or rename important files without Cade's approval.
- **Waiting on Cade:**
  - Phone-check 2b (the Trip Builder).
  - Scoring sheet: one player per row, or two across (currently two across)?
  - Apple Watch: should a group's scorer enter everyone's scores on the watch, or only their own?
- **Apple Watch plan:** A native Swift watch app. Home shows a profile snapshot and upcoming/live/past rounds, or a prompt to play; rounds pop up while playing. Score and leaderboard cover Play, Trips, Tourneys and Leagues. Design it first in the /dev simulator's Apple Watch view (208×248). It can start any time after Play.
- **Later:**
  - The tour's phone pictures (after 2c).
  - Lock-screen push notifications.
  - App links so invite texts open the app (with EAS).
  - Previewing app screens in the /dev simulator.
  - Decide whether the “Insights” website spec belongs in the app or on the website.
  - Tune the look by changing the building blocks.
