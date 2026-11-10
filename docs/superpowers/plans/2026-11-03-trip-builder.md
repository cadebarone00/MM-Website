# Trip Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Golf Trip creation into "Trip Builder": a fun one-question-per-screen wizard with a first-time tour, a "Your trip is ready" finish, a trip-wide invite link that opens a join-this-trip sign-up page, Players in Settings → General, and first-visit coach marks.

**Architecture:** Keep the existing wizard skeleton (`SetupSheet` + `SetupStepForm` + the sessionStorage draft in `lib/platform/golfTripDraft.ts` + `POST /api/golf-trips`). Re-order and add step pages under `app/golf-trips/new/*`, loosen `golfTripPayloadFromBody` for skipped steps, and after create push the wizard's competition answers into the existing trip setup store (`PUT /api/golf-trips/[tripId]/setup`). The join link is one new SQL file + thin server/API/page layers that mirror the existing per-person invite flow (`golf_trip_invitations.sql`, `app/golf-trips/invite/[token]`).

**Tech Stack:** Next.js App Router, React, TypeScript, CSS modules, Supabase (service-role RPCs), PGlite for SQL tests, `node:test` via `npm test`, Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-11-03-trip-builder-design.md`

## Global Constraints

- Create look: cream top, fixed-height maroon sheet rising from the bottom, Back + Next pinned at the bottom; no step number/name in the cream. Screens never jump or resize between data states (fixed-layout rule).
- Trip name, destination and dates are required. Every step after the dates screen's dates is skippable ("Skip for now"); skipped things are set later in Settings. No checklist, badge or reminder for skipped steps.
- Travel is one group answer: Flying / Driving / Mix. Per-traveler flights stay on the trip home.
- Formats = competition formats only, shown only when competing = Yes. Side games are not in the wizard.
- Tour (3 swipes + 5–7 slides) and coach marks show once per account; Settings has "Watch the Golf Trips tour" and "Show tips again" for everyone.
- Invite link joins instantly and **lasts 30 minutes**; organizer can remove people and Reset link. Share uses the phone's native share sheet (Web Share API on web).
- Claude never runs SQL in any Supabase project; the owner runs `supabase/golf_trip_join_links.sql`. Every SQL file must be safe to run twice.
- Another agent works in this same tree: never `git stash`, `checkout`, `reset`, or revert files you didn't change. Uncommitted wizard work (`TripDatesField`, `TripWizardArt`, `DateRangePicker`, …) is kept and built on.
- Commit only when the owner says to; each task's "Commit" step means "stage these files and ask the owner".
- Every new screen sub-state is a Conditional on its page in the `/dev` simulator (`lib/dev/simulatorRoutes.ts`).
- Web + dev simulator first; Capacitor native create is out of scope (known cookie/same-origin blocker).

## Review Focus

1. **Back through branches.** Competing = No → Back from Where-are-you-playing returns to People, not Teams; Formats is skipped both ways. → test in Task 6 (`wizardRoute` tests).
2. **Landing mid-wizard with no basics** (refresh in a new tab, deep link to `/golf-trips/new/format`): send them to `/golf-trips/new`, never a broken step or a Create error. → Task 6 (`firstMissingStep`).
3. **Dates changed after rounds were picked** (trip shortened so a golf day falls outside): the rounds screen drops/clamps out-of-range days before Create, so Create never fails with "Every golf day has to fall within the trip dates." → Task 6 (`clampRoundsToDates`).
4. **Opening a join link you can't use**: already on the trip, you're the organizer, the link was reset, the link is past its 30 minutes, or you were removed and come back. Each shows a clear message or just opens the trip. → Tasks 1 and 3.
5. **No native share available** (desktop browser, share sheet cancelled, storage blocked): Share falls back to copy and says "Link copied"; a cancelled share shows nothing; a blocked localStorage never re-shows the tour in a loop within the session. → Tasks 4 and 8.

---

### Task 1: Join-link database (`supabase/golf_trip_join_links.sql`)

**Files:**
- Create: `supabase/golf_trip_join_links.sql`
- Test: `lib/platform/golfTripJoinLinksDatabase.test.ts` (copy the setup/helpers style of `lib/platform/golfTripInvitationsDatabase.test.ts`: `database()`, `profile()`, `sqlFile()` from `./testDatabase.ts`; load `golf_trips.sql`, `golf_trip_invitations.sql`, then this file twice)

**Interfaces:**
- Produces (all `security definer`, `search_path = public`, execute granted to `service_role` only, revoked from `public, anon, authenticated`):
  - columns `golf_trips.join_code text` (unique, nullable, check `join_code ~ '^[A-Za-z0-9_-]{24,64}$'`) and `golf_trips.join_code_expires_at timestamptz`. **A link lasts 30 minutes** (owner decision 2026-11-03).
  - `golf_trip_join_code(p_profile uuid, p_trip uuid, p_new_code text) returns jsonb` — any trip member: returns `{ code, expiresAt }` for the current code if it still has **more than 5 minutes** left; otherwise stores `p_new_code` with `expires_at = now() + interval '30 minutes'` and returns that. Non-member → `null`. (The 5-minute margin means nobody is handed a link that dies before their friend taps it.)
  - `reset_golf_trip_join_code(p_profile uuid, p_trip uuid, p_new_code text) returns jsonb` — organizer only (else `raise ... errcode '42501'`); replaces the code with a fresh 30-minute one.
  - `get_golf_trip_join_preview(p_profile uuid, p_code text) returns jsonb` — `{ tripId, tripName, destination, startDate, endDate, organizerName, status: 'member' | 'open' | 'expired' }`, or `null` for an unknown/replaced code. `expired` when `now() >= join_code_expires_at` (a member still gets `member`). Never returns member emails.
  - `join_golf_trip_by_code(p_profile uuid, p_code text) returns jsonb` — `{status:'joined', tripId}` (inserts a `golf_trip_members` row: `profile_id = p_profile`, `display_name/email` from `profiles`, `role 'member'`, `invitation_status 'accepted'`, `claimed_at now()`), `{status:'already_member', tripId}`, `{status:'expired'}`, or `{status:'not_found'}`. Missing profile → `42501`. A concurrent duplicate (`unique_violation`) returns `already_member`. Expiry is checked inside the same statement that inserts.

- [ ] **Step 1: Write the failing tests** — one `test()` each:
  - `runs twice without error` (setup loads the file twice).
  - `member gets one stable code`: organizer calls `golf_trip_join_code(org, trip, A)` → code `A`, `expiresAt` ≈ now + 30 min; again with `B` → still `A`; an accepted member gets `A`.
  - `30-minute expiry`: set `join_code_expires_at = now() - interval '1 second'` → preview `status 'expired'`, join → `{status:'expired'}` and no member row added; `golf_trip_join_code(org, trip, D)` now returns `D`.
  - `5-minute margin`: set expiry to `now() + interval '4 minutes'` → `golf_trip_join_code(…, E)` returns `E`; set to `now() + interval '10 minutes'` → returns the current code unchanged.
  - `non-member gets null` for `golf_trip_join_code`.
  - `only the organizer can reset`: member `reset_…` rejects; organizer reset with `C` returns `C`; `get_golf_trip_join_preview(x, A)` is now `null`.
  - `preview`: stranger with code → `status 'open'`, `tripName 'Pinehurst'`, has no `email` key anywhere; organizer → `status 'member'`.
  - `join`: stranger → `joined`; `get_golf_trip` lists them with `invitationStatus 'accepted'`; second call → `already_member`; organizer → `already_member`; unknown code → `not_found`.
  - `removed member can rejoin until reset`: `remove_golf_trip_member` then join → `joined`; after organizer reset, old code → `not_found`.
  - `profile-less caller is refused` (random uuid) → rejects.
  - `anon/authenticated cannot execute` (check `has_function_privilege('authenticated', 'join_golf_trip_by_code(uuid,text)', 'execute')` is false).

- [ ] **Step 2: Run to verify it fails**
  Run: `npx tsx --test lib/platform/golfTripJoinLinksDatabase.test.ts`
  Expected: FAIL (file `golf_trip_join_links.sql` not found).

- [ ] **Step 3: Write `supabase/golf_trip_join_links.sql`** with a header comment in the style of `golf_trip_invitations.sql` (what it adds, that it's safe to re-run, that it needs `golf_trips.sql` + `golf_trip_invitations.sql` first). Use `add column if not exists`, `create unique index if not exists`, `create or replace function`, and drop/re-add the check constraint so re-runs are safe.

- [ ] **Step 4: Run to verify it passes** — same command. Expected: all PASS. Also run `npx tsx --test lib/platform/golfTripInvitationsDatabase.test.ts` → still PASS.

- [ ] **Step 5: Commit** `supabase/golf_trip_join_links.sql lib/platform/golfTripJoinLinksDatabase.test.ts` — "Golf Trips: trip-wide join link SQL (not run in prod)".

---

### Task 2: Join-link server helpers + API routes

**Files:**
- Create: `lib/platform/golfTripJoinLinks.ts`, `lib/platform/golfTripJoinLinks.test.ts`
- Modify: `lib/platform/golfTripsServer.ts` (add four functions next to `getGolfTripInvitation` / `acceptGolfTripInvitation`)
- Create: `app/api/golf-trips/[tripId]/join-link/route.ts`, `app/api/golf-trips/join/[code]/route.ts`

**Interfaces:**
- Consumes: Task 1 RPC names and shapes.
- Produces:
  - `isJoinCode(value: unknown): value is string` — `/^[A-Za-z0-9_-]{24,64}$/`
  - `newJoinCode(): string` — 24 random bytes, base64url (32 chars)
  - `golfTripJoinPath(code: string): string` → `/golf-trips/join/${code}`
  - `type JoinPreview = { tripId: string; tripName: string; destination: string; startDate: string; endDate: string; organizerName: string | null; status: "member" | "open" | "expired" }`
  - `joinPreviewFromJson(value: unknown): JoinPreview | null`
  - `type JoinLink = { code: string; url: string; expiresAt: string }`
  - `type JoinResult = { status: "joined" | "already_member"; tripId: string } | { status: "expired" | "not_found" }`
  - `joinResultFromJson(value: unknown): JoinResult` (anything malformed → `not_found`)
  - server: `getGolfTripJoinLink(tripId: string): Promise<{ status: "ok"; link: JoinLink } | { status: "signed-out" | "not-found" | "unavailable" }>` (`unavailable` when the RPC doesn't exist yet, i.e. SQL not run — log once, don't throw)
  - server: `resetGolfTripJoinLink(tripId: string): Promise<{ status: "ok"; link: JoinLink } | { status: "signed-out" | "forbidden" | "not-found" | "unavailable" }>`
  - server: `getGolfTripJoinPreview(code: string): Promise<JoinPreview | null>`
  - server: `joinGolfTripByCode(code: string): Promise<JoinResult | { status: "signed-out" | "no-profile" }>` — initialize a missing profile exactly like `acceptGolfTripInvitation` does.
  - `GET /api/golf-trips/[tripId]/join-link` → `200 JoinLink` (url = absolute from request origin + `golfTripJoinPath`) | 401 | 404 | 503 `{ error: "Invite links aren't switched on yet." }`
  - `POST /api/golf-trips/[tripId]/join-link` (reset) → `200 JoinLink` | 401 | 403 `{ error: "Only the organizer can reset the link." }` | 404 | 503
  - `POST /api/golf-trips/join/[code]` → `200 JoinResult` | 400 (bad code) | 401

- [ ] **Step 1: Write failing tests** in `golfTripJoinLinks.test.ts`: `isJoinCode` accepts `newJoinCode()` output and rejects `""`, `"short"`, `"a".repeat(65)`, `"has space…"`; `newJoinCode()` twice differs; `golfTripJoinPath("abc")` === `"/golf-trips/join/abc"`; `joinPreviewFromJson` returns `null` for `null`, `{}`, and status `"weird"`, and passes a full valid object through; `joinResultFromJson({status:"joined",tripId:UUID})` round-trips, `{status:"joined"}` (no id) → `{status:"not_found"}`.
- [ ] **Step 2: Run** `npx tsx --test lib/platform/golfTripJoinLinks.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the lib file, the four server functions (service-role client, `getCurrentProfile`/`tripProfileId` as existing helpers do), and both routes (mirror `app/api/golf-trips/[tripId]/setup/route.ts` for auth/404 handling).
- [ ] **Step 4: Run** the unit test → PASS; `npx tsc --noEmit` → no errors; `npx eslint lib/platform/golfTripJoinLinks.ts app/api/golf-trips` → clean.
- [ ] **Step 5: Commit** — "Golf Trips: join-link server + API".

---

### Task 3: "Join this trip" page

**Files:**
- Create: `app/golf-trips/join/[code]/page.tsx`, `components/platform/GolfTripJoinLink.tsx`, `components/platform/GolfTripJoinLink.module.css`
- Create: `lib/platform/joinPageState.ts`, `lib/platform/joinPageState.test.ts`
- Modify: `lib/dev/simulatorRoutes.ts` (page + Conditionals)

**Interfaces:**
- Consumes: Task 2 `isJoinCode`, `getGolfTripJoinPreview`, `golfTripJoinPath`, `POST /api/golf-trips/join/[code]`; `withReturnTo` from `lib/auth/returnTo`; `getCurrentProfile`.
- Produces: `joinPageState(preview: JoinPreview | null, signedIn: boolean): "invalid" | "expired" | "signed-out" | "member" | "open"`.

Page (server): `robots: noindex`. Invalid/unknown code → "This invite link isn't working anymore. Ask the organizer for a new one." Expired (non-member) → "This invite link expired. Invite links last 30 minutes — ask anyone on the trip to send a new one." A person who signs up and comes back after the 30 minutes gets the expired message (accepted; they ask for a fresh link). Otherwise the trip card (name, destination, date range via `tripDateRange`, "Organized by …"). Signed-out → primary **Sign up to join** (`withReturnTo("/signup", golfTripJoinPath(code))`) and secondary **I already have an account** (`withReturnTo("/login/email", …)`). Open + signed in → **Join trip** → POST → `router.replace(golfTripUrl(tripId))`. Member → **Open trip**. Use the dark maroon look of `GolfTripInviteResponse` (reuse its CSS where it fits).

- [ ] **Step 1: Failing test** `joinPageState`: `(null, true)` → `"invalid"`; `(expired, false)` → `"expired"`; `(expired, true)` → `"expired"`; `(open, false)` → `"signed-out"`; `(member preview, false)` → `"signed-out"`; `(member preview, true)` → `"member"`; `(open, true)` → `"open"`.
- [ ] **Step 2: Run** `npx tsx --test lib/platform/joinPageState.test.ts` → FAIL.
- [ ] **Step 3: Implement** helper, page, component. Add simulator page "Join this trip" in group "Golf Trip Onboarding" with Conditionals: Signed out · Signed in, not on trip · Already on trip · Link expired · Link not working.
- [ ] **Step 4: Verify** unit test PASS; `npm test` green; start `npm run dev`, open `/golf-trips/join/<anything-32-chars>` signed out → sees "isn't working" (SQL not in local DB unless the local stack has it) with no console errors. If the local Supabase stack is available, run the SQL there (local only, never prod) and click through sign-up → returns to the join page → Join → lands on trip home.
- [ ] **Step 5: Commit** — "Golf Trips: Join this trip page".

---

### Task 4: Native share + invite link card

**Files:**
- Modify: `package.json` / `package-lock.json` (add `@capacitor/share` matching `@capacitor/core` 8.x; run `npx cap sync` only if the owner asks — note it in the hand-off)
- Create: `lib/platform/shareLink.ts`, `lib/platform/shareLink.test.ts`
- Create: `components/platform/TripInviteLinkCard.tsx`, `components/platform/TripInviteLinkCard.module.css`

**Interfaces:**
- Produces:
  - `type ShareOutcome = "shared" | "copied" | "cancelled" | "failed"`
  - `shareLink(input: { title: string; text: string; url: string }, deps?: { native?: (i) => Promise<void>; webShare?: (i) => Promise<void>; copy?: (text: string) => Promise<void> }): Promise<ShareOutcome>` — order: native (when `Capacitor.isNativePlatform()`) → `navigator.share` → clipboard. An `AbortError` / "Share canceled" → `"cancelled"` (no fallback). Default deps are wired inside; tests inject.
  - `<TripInviteLinkCard tripId: string; tripName: string; canReset: boolean />` — fetches `GET /api/golf-trips/[tripId]/join-link`; shows the link, **Copy**, **Share**, and (when `canReset`) **Reset link** with a Cancel/Reset confirm (no browser `confirm()`); status line "Link copied" / "Shared" ; small note "Works for 30 minutes"; 503 → "Invite links aren't switched on yet." **Re-fetch the link right before every Copy/Share** (the server hands back the same link if it has >5 min left, else a fresh one), and re-fetch when the shown link's `expiresAt` passes, so nobody copies a dead link. Fixed height in every state (loading reserves the same box).

- [ ] **Step 1: Failing tests** for `shareLink`: native present → calls native, returns `"shared"`; no native, webShare present → `"shared"`; webShare throws `{name:"AbortError"}` → `"cancelled"` and copy NOT called; no native/webShare → copy called with the url, `"copied"`; copy throws → `"failed"`.
- [ ] **Step 2: Run** `npx tsx --test lib/platform/shareLink.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files; share text: title = trip name, text = `Join ${tripName} on The Maroon`.
- [ ] **Step 4: Run** test → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — "Golf Trips: native share + invite link card".

---

### Task 5: Players in Settings → General, link at the top

**Files:**
- Modify: `components/platform/GolfTripSettingsPreview.tsx` (`GENERAL_CARDS`, `ORGANIZER_SECTIONS`, the `playersOpen` panel, the General card render)
- Modify: `components/platform/SavedTripSettingsWorkspace.tsx` (pass `tripId`/`tripName` so the Players panel can render `TripInviteLinkCard`)
- Test: `lib/dev/simulator.test.ts` or a new `components/platform/settingsSections.test.ts` (see step 1)

**Interfaces:**
- Consumes: Task 4 `TripInviteLinkCard`.
- Produces: exported constants `GENERAL_CARDS` (now starts with `"Players"`) and `ORGANIZER_SECTIONS` (Overview no longer contains `"Players"`), so tests can import them.

Behaviour: "Players" is the first General card for everyone. Opening it shows `TripInviteLinkCard` at the very top (saved trip: real `tripId`, `canReset = isOrganizer`; `/dev` preview: a sample link, no fetch), then the existing Players content. When `livePanels && !livePanels.isOrganizer`, every edit control in the Players panel (stepper, remove, role changes) is hidden or disabled — read-only list. Organizer view unchanged apart from location.

- [ ] **Step 1: Failing test**: `GENERAL_CARDS[0] === "Players"`; no `ORGANIZER_SECTIONS` group contains `"Players"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Keep the General grid's fixed card size (replace one "Place holder" so the grid count doesn't change).
- [ ] **Step 4: Verify** test PASS; `npm test` green; in `npm run dev` open `/dev/tournament/settings` (organizer) and a member account in the simulator: Players is in General, link at top, member sees no edit buttons, no layout shift while the link loads. Phone + desktop widths.
- [ ] **Step 5: Commit** — "Trip Settings: Players moves to General with the invite link on top".

---

### Task 6: Wizard routing, draft keys and skips

**Files:**
- Create: `lib/platform/tripBuilderSteps.ts`, `lib/platform/tripBuilderSteps.test.ts`
- Modify: `lib/platform/golfTripCreate.ts`, `lib/platform/golfTripCreate.test.ts`
- Modify: `components/platform/SetupSheet.tsx` (`TRIP_WIZARD_STEPS` from `tripBuilderSteps`)
- Modify: `components/platform/SetupStepForm.tsx` (optional `onSkip` → "Skip for now" link above Back; computed next/back hrefs)

**Interfaces:**
- Produces:
  - `type TripBuilderStep = "basics" | "dates" | "players" | "teams" | "golf" | "courses" | "format" | "lodging"`
  - `TRIP_BUILDER_STEPS: readonly TripBuilderStep[]` in that order; `stepPath(step): string` (`basics` → `/golf-trips/new`, else `/golf-trips/new/${step}`)
  - `nextStep(step, draft: GolfTripDraft): TripBuilderStep | "create"` and `previousStep(step, draft): TripBuilderStep | "start"` — `teams` and `format` only when `draft.competing === "yes"`; `courses` skipped when `draft.golfSkipped === "1"`; `lodging` → `"create"`; `basics` → `"start"` (= `/tournaments/create/golf-trip`).
  - `firstMissingStep(draft): TripBuilderStep | null` — `basics` when name or destination missing, `dates` when dates missing; else null.
  - `clampRoundsToDates(draft): GolfTripDraft` — drops `dayNDate`/`roundNCourse` entries outside `tripDates(start,end)` and lowers `golfDays` to fit.
  - New draft keys (strings): `travelMode` `"flying"|"driving"|"mix"|""`, `competing` `"yes"|"no"|""`, `teamStructure` `"two-teams"|"pairs"|"individual"|""`, `formatPreset` (Task 7 id) | `"custom"` | `""`, `golfSkipped` `"1"|""`.
  - `golfTripPayloadFromBody` changes: `yourName/yourEmail` unchanged; `includesTournament` derived from `competing` (yes→yes, no→no, ""→undecided) when `includesTournament` is absent; `knowsFlights` from `travelMode` (flying→yes, driving→no, else undecided); `knowsTransportation` defaults to `"undecided"`; `knowsLodging` defaults to `"undecided"`; `golfDays` may be `0` when `golfSkipped === "1"` (rounds = []). Old drafts that still carry the old keys keep working.

- [ ] **Step 1: Failing tests** (`tripBuilderSteps.test.ts`): `nextStep("players", {competing:"no"})` → `"golf"`; `nextStep("players", {competing:"yes"})` → `"teams"`; `previousStep("golf", {competing:"no"})` → `"players"`; `previousStep("golf", {competing:"yes"})` → `"teams"`; `nextStep("courses", {competing:""})` → `"lodging"`; `nextStep("golf", {golfSkipped:"1", competing:"yes"})` → `"format"`; `nextStep("lodging", {})` → `"create"`; `firstMissingStep({})` → `"basics"`; `firstMissingStep({tripName:"A",destination:"B"})` → `"dates"`; `clampRoundsToDates` on a 5-day draft shortened to 2 days with `golfDays:"4"` → `golfDays "2"` and no `day3Date`.
  In `golfTripCreate.test.ts`: a draft with only basics + dates + `golfSkipped:"1"` + `golfDays:"0"` and none of the four plan answers → `ok`, `rounds: []`, all plans `"undecided"`; `travelMode:"flying"` → `flightPlan "yes"`; `competing:"no"` → `includesTournament "no"`; missing dates still fails with field `dates`.
- [ ] **Step 2: Run** both test files → FAIL.
- [ ] **Step 3: Implement**; `SetupStepForm` gets props `step: TripBuilderStep` (computes hrefs from the draft at submit time) while still accepting explicit `nextHref/backHref` for pages not yet moved; Skip writes the step's skip values (e.g. `competing:""`, `golfSkipped:"1"`) and navigates to `nextStep`. Each step page, on mount, redirects to `stepPath(firstMissingStep(draft))` when non-null and earlier than itself.
- [ ] **Step 4: Run** both tests → PASS; `npm test` green.
- [ ] **Step 5: Commit** — "Trip Builder: step order, skips, payload defaults".

---

### Task 7: Step screens + format presets + saving competition answers

**Files:**
- Modify: `app/golf-trips/new/page.tsx` (name + destination only)
- Create: `app/golf-trips/new/dates/page.tsx` (`TripDatesField` + travel chips), `app/golf-trips/new/teams/page.tsx`
- Modify: `app/golf-trips/new/players/page.tsx` (create if missing: `PlayerCountSlider` + Are you all competing? Yes/No + Skip), `app/golf-trips/new/golf/page.tsx`, `app/golf-trips/new/courses/page.tsx`, `app/golf-trips/new/format/page.tsx`, `app/golf-trips/new/lodging/page.tsx` (last step: button **Create Trip** → runs the create request that `GolfTripReview` runs today)
- Remove from the Trip Builder flow (owner 2026-11-03: Review isn't needed; Flights + Transportation move to the Itinerary later): `flights`, `transportation`, `review`. Nothing in the wizard links to them and the simulator drops them. **Leave the three page files untouched** — they have uncommitted edits from the other agent; ask the owner before deleting them.
- Create: `lib/platform/tripFormatPresets.ts`, `lib/platform/tripFormatPresets.test.ts`
- Create: `lib/platform/tripBuilderSetup.ts`, `lib/platform/tripBuilderSetup.test.ts`
- Create: `lib/platform/useCreateGolfTrip.ts` (extract the create call + requestId handling from `components/platform/GolfTripReview.tsx`; `GolfTripReview` keeps working by using it)
- Modify: `lib/dev/simulatorRoutes.ts` (`steps` list → `TRIP_BUILDER_STEPS`; Conditionals: competing Yes / No; golf skipped)

**Interfaces:**
- Consumes: Task 6 everything.
- Produces:
  - `type FormatPreset = { id: string; name: string; blurb: string; formatForRound: (roundIndex: number, roundCount: number) => FormatName }` where `FormatName` is one of `savedTripSetup.ts`'s `formatNames` (export that list as `FORMAT_NAMES`).
  - `FormatPreset` also carries `types: { individual: string | null; team: string | null }` (the same shape as Settings' `localCompetitionType`) and `tag: string | null`.
  - `TRIP_FORMAT_PRESETS` (owner decision 2026-11-03), exactly three plus Create Your Own:
    - `maroon` **"The Maroon Style"** — the "Both" setup: individual Stroke Play **and** team match play (`types: { individual: "Stroke Play", team: "2 Teams" }`). Tag: **"8 rounds · 3 Fourball · 3 Singles · 2 Alt Shot"**. Round formats in order: `MAROON_ROUND_ORDER` (below). Fewer than 8 rounds → the first N; more than 8 → extra rounds are Singles.
    - `individual` **"Individual"** — `types: { individual: "Stroke Play", team: null }`; every round Stroke Play.
    - `team` **"Team"** — `types: { individual: null, team: "2 Teams" }`; every round Fourball (changeable per round in Settings).
    - UI-only **"Create Your Own"** (`formatPreset:"custom"`): a per-round picker from `FORMAT_NAMES` with "Decide later".
  - **Layout of the Formats screen (owner, 2026-11-03), top to bottom:**
    1. **The Maroon picture** — a photo/banner titled "The Maroon" (no story text). No image is in the repo yet: use a maroon-gradient placeholder box of the final size with the `MaroonMark` and "The Maroon" until the owner sends the picture; keep it a fixed-size slot so swapping in the photo changes nothing else.
    2. **The Maroon Style** — a showcase block (not a button) with the tag "8 rounds · 3 Fourball · 3 Singles · 2 Alt Shot", so people see what created the idea.
    3. **Both** — the selectable card right under it; picking it creates The Maroon Style setup (preset id `maroon`, label on the card "Both").
    4. **Individual** and **Team** side by side.
    5. **Create Your Own** — centered, same width as Both; mix and match a format per round (or "Decide later").
    The sheet's content scrolls inside the fixed maroon sheet if it doesn't fit; Back/Next stay pinned. Tapping a card selects it (gold border); nothing moves when one is picked.
  - `MAROON_ROUND_ORDER` = Fourball, Alternate Shot, Fourball, Singles, Alternate Shot, Fourball, Singles, Singles (owner OK'd 2026-11-03).
  - `tripBuilderSetupValues(draft: GolfTripDraft, rounds: SavedGolfTrip["rounds"]): SetupValues | null` — null when competing ≠ yes and nothing to save. Builds `compFormats` (one `roundFormat`-valid entry per round from the preset or custom picks) and the team keys for `teamStructure` (read how Settings → Team Competition stores "2 Teams" / "Pairs" in `GolfTripSettingsPreview.tsx` and write the same keys, so Settings opens showing the same choice).
  - After create succeeds: if `tripBuilderSetupValues` is non-null, `PUT /api/golf-trips/[tripId]/setup` with `{ values, revision: 0, writeId: crypto.randomUUID() }`. A failure (503/409/400) does not block the finish screen; it logs and the organizer can set it in Settings.

- [ ] **Step 1: Failing tests**: `tripFormatPresets` — `TRIP_FORMAT_PRESETS.map(p => p.id)` deep-equals `["maroon", "individual", "team"]`; every preset returns a value in `FORMAT_NAMES` for round counts 1–12; for 8 rounds `maroon` has exactly 3 `"Fourball"`, 3 `"Singles"`, 2 `"Alternate Shot"`; `maroon.tag === "8 rounds · 3 Fourball · 3 Singles · 2 Alt Shot"`; `maroon.types` has both non-null, `individual.types.team === null`, `team.types.individual === null`. `tripBuilderSetup` — `validSetup(tripBuilderSetupValues(draftWith(maroon, 3 rounds), rounds))` is `true`; the saved `localCompetitionType` equals `maroon.types`; `compFormats` has 3 entries; `competing:"no"` → `null`; `formatPreset:"custom"` with `round2Format:"Scramble"` → round 2 format `"Scramble"`, rounds left "Decide later" are omitted.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** libs, hook, and pages. Each page: one question, `SetupSheet wizardStep` from `TRIP_BUILDER_STEPS.indexOf`, Skip where the spec says. Copy: "What's the trip?", "When are you going?" / "How's everyone getting there?", "Who's coming?" / "Are you all competing?", "How do you want to compete?", "Where are you playing?", "What are you playing?", "Where are you staying?".
- [ ] **Step 4: Verify** tests PASS; `npm test` green; `npm run test:browser:golf-trip` updated to the new order (name → dates → players No → golf skip → lodging skip → Create) and passing; manual run in the simulator on iPhone 16 and Desktop: Back/Next/Skip on every screen, competing Yes path through Teams and Formats, no screen changes height.
- [ ] **Step 5: Commit** — "Trip Builder: new step screens, format presets, setup save".

---

### Task 8: Welcome, Learn screen, tutorial, "Your trip is ready", invite pop-up

**Files:**
- Modify: `app/tournaments/create/[type]/page.tsx` (Golf Trip branch → Welcome: "Welcome to Golf Trips" + **Get Started** → `/golf-trips/new/learn`)
- Create: `app/golf-trips/new/learn/page.tsx`, `app/golf-trips/new/tour/page.tsx`
- Create: `components/platform/tour/TourPhone.tsx` (+ `.module.css`) — inner phone frame (75% of screen height) rendering the real `GolfTripHome` with its `preview` prop and fixture data from `lib/platform/golfTripPreviewFixture.ts`, scaled with CSS `transform`, `pointer-events: none`, `inert`; optional `callout: { box: [x, y, w, h] in %; text: string }` drawing the gold outline + bubble.
- Create: `components/platform/tour/LearnScreen.tsx`, `components/platform/tour/TourSlides.tsx`, `lib/platform/tripTour.ts`, `lib/platform/tripTour.test.ts`
- Create: `components/platform/TripReadyScreen.tsx` (reuse `MaroonMark` + the draw/burst CSS from `components/dev/auth/AuthLinkResultPreview.module.css` — move shared rules into `components/platform/TripReadyScreen.module.css`, don't import a dev file from product code)
- Modify: `components/platform/GolfTripInviteDialog.tsx` (show the join link from `GET …/join-link` instead of the trip id link; Share via `shareLink`; buttons Copy / Share / Done; 503 → fall back to today's trip link + note)
- Modify: lodging "Create Trip" flow: success → `TripReadyScreen` → **Invite your crew** → `GolfTripInviteDialog` → Done → trip home
- Modify: `lib/dev/simulatorRoutes.ts` (Welcome, Learn, Tour, Ready pages + Conditionals: first time / already seen)

**Interfaces:**
- Produces:
  - `TOUR_SEEN_KEY = "maroon.golfTripTour.seen"`, `TIPS_SEEN_KEY = "maroon.golfTripTips.seen"` (value: JSON array of profile ids that have seen it — per account on this device; my call allowed by the spec)
  - `hasSeen(key: string, profileId: string, storage?: Pick<Storage, "getItem">): boolean`, `markSeen(key, profileId, storage?)`, `clearSeen(key, profileId, storage?)` — storage errors are swallowed; an in-memory set also records `markSeen` so a blocked storage doesn't loop the tour within the session.
  - `QUICK_SWIPES` (3) and `TOUR_SLIDES` (6) arrays of `{ title: string; body: string; navigation?: GolfTripNavigation; callout?: … }` in `lib/platform/tripTour.ts`. Swipes: Plan it in one place · Compete all trip long · Score live. Slides: Plan it in one place · Invite your crew · Compete all trip long · Live scoring · Side games (skins, predictions, match picks — explains them since they're not in the wizard) · Relive it.

Learn screen: inner phone with the 3 swipe pages (horizontal swipe + dots); bottom ~20% of the inner phone fades into **Learn about Golf Trips** (strong) and **Skip for now** (small, underneath). Learn → `/golf-trips/new/tour`; tour's last slide and Skip → `markSeen(TOUR_SEEN_KEY)` → `/golf-trips/new`. If `hasSeen`, Get Started goes straight to `/golf-trips/new`.

- [ ] **Step 1: Failing tests** `tripTour.test.ts`: fresh storage → `hasSeen` false; `markSeen` then `hasSeen` true for that profile, false for another; `clearSeen` → false; storage whose `getItem`/`setItem` throw → `markSeen` doesn't throw and `hasSeen` is then true (in-memory); `QUICK_SWIPES.length === 3`; `TOUR_SLIDES.length` between 5 and 7.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** all of the above.
- [ ] **Step 4: Verify** tests PASS; `npm test` green; manual simulator run: first time → Learn → Tour → basics; second time → Get Started skips Learn; Create → Ready (M draws, burst plays, reduced-motion = static) → Invite your crew → dialog Copy says "Link copied", Share on desktop Chrome falls back to copy → Done → trip home. No console errors.
- [ ] **Step 5: Commit** — "Trip Builder: welcome, tour, trip-ready screen, invite pop-up".

---

### Task 9: Coach marks on trip home + Settings replay

**Files:**
- Create: `components/platform/CoachMarks.tsx`, `components/platform/CoachMarks.module.css`, `lib/platform/coachMarks.ts`, `lib/platform/coachMarks.test.ts`
- Modify: `components/platform/GolfTripHome.tsx` (add `data-coach="settings" | "golf-tab" | "scoring"` to the settings link, Golf tab, scoring button; mount `<CoachMarks>` for saved trips when `!hasSeen(TIPS_SEEN_KEY, profileId)`)
- Modify: `components/platform/GolfTripSettingsPreview.tsx` (General: replace one more "Place holder" with **Watch the Golf Trips tour** → `clearSeen(TOUR_SEEN_KEY)` + go to `/golf-trips/new/tour?replay=1` (replay returns to the trip, not the wizard), and **Show tips again** → `clearSeen(TIPS_SEEN_KEY)` + back to trip home)
- Modify: `lib/dev/simulatorRoutes.ts` (Conditionals on trip Home: Tips — organizer first visit / member first visit / seen)

**Interfaces:**
- Produces:
  - `type CoachStop = { target: string; text: string }`
  - `coachStops(isOrganizer: boolean): CoachStop[]` — organizer: `settings` "Anything you skipped lives in Settings. Tap here to finish setting it up." · `settings` "Your invite link is in Settings → Players." · `golf-tab` "Your rounds, courses and leaderboard live here." · `scoring` "Enter scores here during a round." Member: same minus the first stop, second becomes "Grab the invite link in Settings → Players to bring a friend."
  - `<CoachMarks stops: CoachStop[]; onDone: () => void />` — dims the screen, rings the `[data-coach=target]` element, bubble with "Got it · n of N" / "Next"; skips stops whose target isn't on screen; Escape or tapping the dim ends the whole set (counts as seen). No browser dialogs.

- [ ] **Step 1: Failing tests** `coachMarks.test.ts`: `coachStops(true).length === 4`, first text starts "Anything you skipped"; `coachStops(false).length === 3` and no text contains "skipped"; every target is one of `settings | golf-tab | scoring`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** tests PASS; `npm test`, `npx tsc --noEmit`, `npx eslint` clean; `npm run build` passes; manual simulator: organizer first visit shows 4 stops then never again; member shows 3; Settings → Show tips again brings them back; Watch the tour replays and returns to the trip.
- [ ] **Step 5: Commit** — "Trip Builder: coach marks + replay in Settings".

---

### Task 10: Hand-off

- [ ] Update `project_specs.md` Trip Builder entry with "Built <date>", test counts, and "needs `supabase/golf_trip_join_links.sql` run in production".
- [ ] Update memory `trip-builder.md` with what's built / not run.
- [ ] Tell the owner, step by step, how to run `golf_trip_join_links.sql` (Supabase dashboard → SQL Editor → New query → paste → Run) and what it does in one sentence; and that `npx cap sync` is needed before the native share sheet works in the phone app.
