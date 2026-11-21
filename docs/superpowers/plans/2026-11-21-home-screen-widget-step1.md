# Home Screen Widget, Step 1 (snapshot + /dev previews) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested TypeScript "widget snapshot" that decides what the home screen widget shows (live round, next thing, or nothing), plus a `/dev` preview of every size × state on iPhone and Android.

**Architecture:** One pure module, `lib/notifications/widget.ts`, turns a list of the person's rounds into a list of timed snapshots (one per moment the words change). Steps 2–3 hand these to Swift and Kotlin unchanged. A dev-only page draws them on a fake home screen, chosen by simulator conditionals. No database, no SQL, no native code in this step.

**Tech Stack:** TypeScript, Next.js app router (dev page), CSS modules, `node:test` via `npm test`.

**Spec:** `project_specs.md` → "Home screen widget: "What's next" for iPhone + Android".

## Global Constraints

- Dev pages 404 outside local dev, like the other `/dev/notifications/*` pages. Same `robots: { index: false, follow: false }` metadata.
- Wording matches the Live Activity: score with `formatToPar()`, holes with `thruLabel()`, clock with `teeClock()`, match text with `opponentLabel()` (all in `lib/notifications/format.ts`).
- Tee times are trip-local wall times `"YYYY-MM-DDTHH:mm"` and are compared only with each other (same rule as `minutesUntil()`).
- Every link goes through `safeAppLink()`. Nothing = `/rounds/new`.
- Fonts: what the widget draws is our app's look (Spectral, with Barlow only for tiny ALL-CAPS labels). Phone-drawn chrome (clock, Android widget label) uses the system stand-ins already in `lib/fonts/notifications`.
- Fixed layout: each size is one fixed box in every state. Nothing grows or shifts between Nothing / Coming up / Live.
- Do not touch other agents' uncommitted files beyond the lines named here (`lib/dev/simulator.ts`, `lib/dev/simulatorRoutes.ts`). Never stash, checkout, or reset.

## Review Focus

- **Two live rounds at once** (a trip round + a solo round, e.g. a stale one never submitted): the one with the newest `updatedAt` wins. Test in Task 1.
- **A tee time in the past with no live data** (round never started in the app): it stays "next" with "Now" until tee time + 60 min, then drops off. Test in Task 1.
- **No tee time set** (`teeTime: null`, not live): never chosen as next, and never shown in the upcoming list. Test in Task 1.
- **Long course / trip names** (24+ letters): the snapshot keeps the full text, and the preview clips it with an ellipsis inside the fixed box. Checked on screen in Task 3 with the long sample.
- **Crossing midnight / the year** (`2026-12-31T23:30` → `2027-01-01T08:00`): "Tomorrow" is still right. Test in Task 1.

---

### Task 1: Widget snapshot (pure TypeScript)

**Files:**
- Create: `lib/notifications/widget.ts`
- Test: `lib/notifications/widget.test.ts`

**Interfaces:**
- Consumes: `LiveRoundActivity` (`lib/notifications/types.ts`); `formatToPar`, `thruLabel`, `teeClock`, `opponentLabel`, `safeAppLink` (`format.ts`).
- Produces:
```ts
export type WidgetSource = "trip" | "solo" | "league" | "tournament";
/** One round the person has, from any part of the app. */
export type WidgetItem = {
  id: string;
  source: WidgetSource;
  /** Trip / league / tournament name; "Your round" for solo. */
  groupName: string;
  /** Short course name (courseDisplayName). */
  course: string;
  /** Trip-local "YYYY-MM-DDTHH:mm", or null when not set. */
  teeTime: string | null;
  /** In-app path opened on tap (scorecard while live, else the round / trip). */
  link: string;
  /** Present only while the round is live (state "live"). */
  live: LiveRoundActivity | null;
  /** My group while live, me first. */
  group?: { name: string; toPar: number; thru: number }[];
  /** While live: holes finished, oldest first. */
  holes?: { hole: number; par: number; strokes: number }[];
};
export type WidgetState = "nothing" | "next" | "live";
export type WidgetSnapshot = {
  /** Trip-local time this snapshot starts showing. */
  at: string;
  state: WidgetState;
  link: string;
  eyebrow: string;  // "LIVE · PINEHURST NO. 2" | "NEXT · TEE TIME" | "THE MAROON"
  title: string;    // course | course | "No rounds yet"
  line1: string;    // "+3 · Thru 12" | "Sat 8:40" | "Tap to start one"
  line2: string;    // "2 UP vs White" (or groupName when no match) | "In 2 days" / "Tomorrow" / "Today" / "Now" | ""
  /** Medium/Large while live: up to 4 rows, me first. */
  group: { name: string; score: string; thru: string }[];
  /** Medium shows 2, Large shows 4. Never includes the main item. */
  upcoming: { title: string; when: string; link: string }[]; // when = "Sat 8:40"
  /** Large while live: last 3 holes played. */
  holes: { hole: number; par: number; strokes: number }[];
  lock: { circle: string; rect: [string, string]; inline: string };
};
export function whenLabel(teeTime: string, nowLocal: string): string;
export function pickWidgetItem(items: WidgetItem[], nowLocal: string): { item: WidgetItem; state: "next" | "live" } | null;
export function buildWidgetSnapshot(items: WidgetItem[], nowLocal: string): WidgetSnapshot;
export function widgetTimeline(items: WidgetItem[], nowLocal: string): WidgetSnapshot[];
```

Rules (from the spec, plus the builder calls recorded in Review Focus):
- **Pick:** any item with `live?.state === "live"` wins. Among several, the newest `live.updatedAt` wins. Otherwise, take items with a `teeTime` where `now < teeTime + 60 min`, and the soonest `teeTime` wins. Otherwise null.
- **whenLabel:** `now >= teeTime` → "Now". Same calendar date → "Today". Next date → "Tomorrow". Otherwise "In N days" (calendar days between the dates).
- **line1 (next):** `"<Ddd> <teeClock>"` with a three-letter weekday from the tee date (e.g. "Sat 8:40").
- **lock:** live → circle `formatToPar`, rect `[course, "<score> · <thru>"]`, inline `"<score> thru <n>"`. Next → circle `teeClock`, rect `[course, line1]`, inline `"<course> <teeClock>"`. Nothing → circle `""`, rect `["The Maroon", "No rounds yet"]`, inline `""`.
- **Timeline:** entry 0 at `nowLocal`, then one entry at each moment the words can change, within the next 48 hours: each midnight before the main item's tee date, the tee time ("Now"), and tee + 60 min (the next pick). Rebuilt from the same `items` at that time. Max 8 entries, consecutive duplicates dropped (same content apart from `at`). Live rounds return only entry 0, because the app saves a new snapshot as scores come in.

- [ ] **Step 1: Write the failing tests** in `widget.test.ts`, using `item()` / `live()` helpers like `format.test.ts`:
  - `"nothing: empty list → No rounds yet, links to /rounds/new"`: `state === "nothing"`, `title === "No rounds yet"`, `line1 === "Tap to start one"`, `link === "/rounds/new"`.
  - `"next: soonest tee time wins"`: items at `2026-11-28T08:40` and `2026-11-25T09:00`, now `2026-11-21T10:00` → title is the 25th's course, `line1 === "Tue 9:00"`, `line2 === "In 4 days"`, `upcoming.length === 1`.
  - `"live beats an earlier tee time"`, and `"two live rounds → newest updatedAt"`.
  - `"live text"`: toPar 3, thru 12, match `2 UP` vs `["White"]` → `eyebrow === "LIVE · PGA WEST"`, `line1 === "+3 · Thru 12"`, `line2 === "2 UP vs White"`, `lock.circle === "+3"`.
  - `"whenLabel"`: Today / Tomorrow / In 3 days / Now, plus `whenLabel("2027-01-01T08:00", "2026-12-31T23:30") === "Tomorrow"`.
  - `"past tee time stays Now for 60 min, then drops"`: tee `08:40`, now `09:30` → `line2 === "Now"`. Now `09:41` → state `"nothing"`.
  - `"no tee time is never next or upcoming"`.
  - `"timeline: midnight + tee + after"`: tee `2026-11-22T08:40`, now `2026-11-21T20:00` → `at` values `["2026-11-21T20:00", "2026-11-22T00:00", "2026-11-22T08:40", "2026-11-22T09:40"]`, `line2` = Tomorrow, Today, Now, then state nothing.
  - `"timeline: live returns one entry"`.
  - `"links pass through safeAppLink"`: an item link `"https://evil.example"` → snapshot link equals `safeAppLink` of it.
- [ ] **Step 2: Run** `npx tsx --test lib/notifications/widget.test.ts`. Expected: FAIL, cannot find `./widget.ts`.
- [ ] **Step 3: Implement** `widget.ts` with the signatures and rules above. Reuse `format.ts` helpers. Do date math on the `"YYYY-MM-DDTHH:mm"` strings as UTC wall times (same trick as `wallMinutes` in `format.ts`).
- [ ] **Step 4: Run** the same command. Expected: all pass. Then `npm test` passes, apart from the already-known `accessPolicy` coverage failure (PUT `/api/account/links` + `/preferences`).
- [ ] **Step 5: Commit** (only these two files)
```bash
git add lib/notifications/widget.ts lib/notifications/widget.test.ts
git commit -m "Widget: snapshot of the live or next round for the home screen widget"
```

### Task 2: Sample data + simulator choices

**Files:**
- Create: `lib/dev/sampleWidget.ts`
- Modify: `lib/dev/simulator.ts` (state type next to `wallpaper`, validation next to the `wallpaper` check)
- Modify: `lib/dev/simulatorRoutes.ts` (Notifications group block, about lines 203–221)
- Test: `lib/dev/simulator.test.ts`

**Interfaces:**
- Consumes: `WidgetItem` from Task 1; `SAMPLE_TEAM_STEPS.live` from `lib/dev/sampleNotifications.ts`.
- Produces:
```ts
export const WIDGET_SIZES = ["small", "medium", "large", "lock"] as const;
export const WIDGET_STATES = ["nothing", "next", "live", "long"] as const; // long = live with 24+ letter names
export const WIDGET_PHONES = ["ios", "android"] as const;
export const WIDGET_SAMPLE_NOW = "2026-11-21T10:00";
export function sampleWidgetItems(state: (typeof WIDGET_STATES)[number]): WidgetItem[];
// SimulatorState additions:
widgetSize?: "small" | "medium" | "large" | "lock";
widgetState?: "nothing" | "next" | "live" | "long";
widgetPhone?: "ios" | "android";
```
- Samples: "next" = a Golf Trip round at Pinehurst No. 2 `2026-11-23T08:40` plus 3 more upcoming (a league round, a solo round, a tournament round). "live" = the same trip, live, +3 thru 12, 2 UP vs White, group of 4, last 3 holes. "long" = "Live" with course "Bandon Dunes Sheep Ranch Links" and trip name "Annual Fall Pacific Northwest Classic".

- [ ] **Step 1: Write the failing test** in `simulator.test.ts`: `"widget simulator choices validate"`. A state with `widgetSize: "large", widgetState: "long", widgetPhone: "android"` is accepted, `widgetSize: "huge"` is rejected (the same assertion style the file already uses for `wallpaper`). Also `simulatorPages()` contains `/dev/notifications/widget` in group `"Notifications"`, with conditions in sections `"Size"`, `"State"`, `"Phone"`.
- [ ] **Step 2: Run** `npx tsx --test lib/dev/simulator.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the sample file, the three state keys + checks, and register the page in the Notifications block with conditions `widget-size-*`, `widget-state-*`, `widget-phone-*` (labels "Small (square)", "Medium (rectangle)", "Large (big square)", "Lock screen"; "Nothing coming up", "Coming up", "Live round", "Live · long names"; "iPhone", "Android"). Order it after Live Activity, before In-app. Create a placeholder `app/dev/notifications/widget/page.tsx` that renders `null` so the route exists (Task 3 fills it).
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit** only the new files plus the hunks you added (`git add -p lib/dev/simulator.ts lib/dev/simulatorRoutes.ts`). Message: `Widget: dev samples and simulator choices`.

### Task 3: Widget preview page

**Files:**
- Create: `components/notifications/WidgetPreviews.tsx`, `components/notifications/WidgetPreviews.module.css`
- Modify: `app/dev/notifications/widget/page.tsx`

**Interfaces:**
- Consumes: `widgetTimeline`, `WidgetSnapshot` (Task 1); `sampleWidgetItems`, `WIDGET_SAMPLE_NOW` (Task 2); `useSimulator()` (`components/dev/SimulatorBridge`); the wallpaper classes in `NotificationPreviews.module.css` (import that module for `wallpaper` / `wallpaperDark` / `wallpaperLight`, the `simulator.state.wallpaper` choice).
- Produces: `export function WidgetPreviewScreen(): ReactNode`.

Layout: a phone home screen, the same frame size as `HomeScreen` in `NotificationPreviews.tsx`, with a 4-column app grid. The widget takes grid cells like a real phone: Small 2×2, Medium 4×2, Large 4×4. "Lock" draws the iPhone lock screen clock with the circle + rectangle widgets under it and the inline text above the time. Android = the same three boxes on the Android home look (`AndroidHome` style, rounder corners, the widget's name shown under it in Roboto), and the lock option shows a note "Android has no lock screen widgets". Under the phone, a strip shows the timeline's `at` + `line2` for each entry, so the countdown changes are visible.

Content per size follows the spec table: Small = eyebrow, title, line1, line2. Medium adds `group` (live) or 2 `upcoming` rows. Large adds `holes` (live, the last 3 as small hole / par / score boxes) or 4 `upcoming`. Maroon-900 widget background with cream text, Spectral for the score and title, Barlow caps for the eyebrow. Every text line is one line with `text-overflow: ellipsis`.

- [ ] **Step 1: Build** the component and page (`metadata` title `"Home screen widget | The Maroon"`, robots off).
- [ ] **Step 2: Verify on screen.** Run `npm run dev`. In the `/dev` simulator → Notifications → Home screen widget, click through all 4 sizes × 4 states × 2 phones. Expected: each size's box stays exactly the same in every state (no shift), long names end in "…", and taps link to the snapshot's `link` (hover shows it).
- [ ] **Step 3: Checks.** Run `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `npm test`. Expected: no new errors (only the known `accessPolicy` test failure).
- [ ] **Step 4: Commit** the three files. Message: `Widget: /dev preview of every size and state`.
- [ ] **Step 5: Update the spec.** Mark step 1 as built in `project_specs.md`'s widget section (one line) and commit that hunk only.
