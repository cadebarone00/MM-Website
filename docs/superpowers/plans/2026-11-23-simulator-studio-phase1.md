# Simulator Studio, Phase 1 (Play) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/dev → Simulators → Scoring`, the owner builds a Play round (1 to 4 named players, a host, a sample course, Skins or none, and an optional guest) and presses Create. The real phones then play the round themselves on their real screens, step by step. The instructions sit on the left, and the phones sit on the right, scaled to fit.

**Architecture:** This reuses the built simulator (`npm run sim`, the fake Supabase, the front door, the checks and the log).
- **The front door** gains a phone **driver script**, a **custom setup** endpoint and HTML injection.
- **The pure modules in `lib/dev/sim/studio/`** hold the grid math, the setup model, the step generation and a transport-agnostic **runner**.
- **Two transports deliver steps:** iframe `postMessage` from the console, and Playwright `page.evaluate` in the end-to-end test.
- **The console** is rebuilt as the Studio layout.

**Tech Stack:** Next.js 15 / React, Node `node:http`, PGlite fake, `esbuild` (already present, bundles the driver), Playwright (already a dev dependency; tests only), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-23-simulator-studio-design.md` (approved 2026-11-23). It builds on `docs/superpowers/specs/2026-11-22-simulators-scoring-design.md`.

## Global Constraints

- Everything the existing simulator promises still holds:
  - It never touches a real database.
  - It never re-implements a scoring rule.
  - Calls it can't answer show red.
  - It is dev only, on ports 3005 (door), 3006 (app) and 3007 (fake), with the `.next-sim` build folder.
  - It never stops processes it didn't start.
  - On Windows, stop processes with a `taskkill /T /F` tree.
  - The owner's dev server is on 3001. Never touch it.
- **No faked results.** Every step acts on the real screen through the driver. A step that can't find its target stops with status `failed` and a plain message naming the phone, the target and what the screen showed. Nothing is done behind the scenes instead.
- **No simulator UI inside the phone screens.** The tap ripple is the only visible effect, and it fades within 400 ms.
- The driver is served only by the front door at `/__sim/driver.js`. The real app never imports it. It acts only on messages whose `event.origin` is `http://localhost:3001` or whose `event.source === window`.
- `data-sim="…"` attributes may be added to real components only where a label is ambiguous or a screen has no distinguishing text. They are inert. Each one added is listed in the task report.
- Scores come from a seeded random generator, and the seed is shown in the setup. The same seed gives the same strokes.
- Sample courses only. No real course search; the GolfCourseAPI key stays blank.
- Look: maroon / cream, the Spectral font, and Barlow only for tiny ALL-CAPS labels.
- **Never commit, stash, checkout or reset.** Leave everything uncommitted. The owner commits only when asked, and another agent edits this tree.

## Review Focus

1. **The owner taps a phone by hand mid-run**, so the next step's starting screen isn't there. The runner stops with "<Name>'s phone isn't on <expected>. Tap it there or press Skip", and never taps blindly (Task 5 test: a `waitFor` precondition fails, and the runner state becomes `stopped` with that message).
2. **A phone fully reloads during a step.** The driver re-announces `ready`, and the runner retries that step's remaining actions once, then fails (Task 5 test: transport returns `reloaded` → retry → second `reloaded` → `failed`).
3. **Two buttons share a label** (e.g. many "+" or "Next"). The driver refuses to guess and fails with "2 matches for …" unless the target is narrowed by `within` (Task 3 test).
4. **The window is very narrow or very short.** The phones still all fit with no scroll; the scale floor is 0.2 (Task 1 test: 8 phones in 600 × 400 → scale ≥ 0.2, and every frame is inside the area).
5. **The sim is restarted while the Studio is open.** The Studio shows the start card. It does not resume a stale script on the new rehearsal (Task 6 test: status error → runner reset, steps cleared).

---

### Task 1: Phone grid that fits the area

**Files:**
- Create: `lib/dev/sim/studio/grid.ts`
- Test: `lib/dev/sim/studio/grid.test.ts`

**Interfaces:**
- Produces: `fitPhones(count: number, area: { width: number; height: number }, opts?: { phone?: { width: number; height: number }; gap?: number; label?: number; minScale?: number }): { columns: number; rows: number; scale: number; frame: { width: number; height: number } }`
- Defaults: phone 390 × 844, gap 16, label (name strip under each phone) 28 px, minScale 0.2.
- The result picks the column count (1..count) that gives the largest scale where `columns × frame.width + gaps ≤ width` and `rows × (frame.height + label) + gaps ≤ height`. Scale is capped at 1.

- [ ] **Step 1: Write the failing tests**
  - `test("1 phone is as large as fits, never above 1")`: in 1600 × 1000, scale = min(1, (1000 − 28) / 844) ≈ 1.0 → capped at 1. In 800 × 600, scale = (600 − 28) / 844.
  - `test("4 phones make a 2×2 box in a wide-enough area")`: 1200 × 1000 gives columns 2, rows 2.
  - `test("8 phones make 4×2 on a wide screen")`: 1600 × 900 gives columns 4, rows 2.
  - `test("every frame is inside the area for 1,2,3,4,6,8 phones")`: for areas 1600×900, 1000×800 and 600×400, `columns*frame.width + (columns-1)*gap ≤ width` and the same for the height.
  - `test("very small area keeps the 0.2 floor")`: 8 phones in 600 × 400 gives scale ≥ 0.2.
  - `test("count 0 gives columns 0")`.
- [ ] **Step 2:** Run `npx tsx --test lib/dev/sim/studio/grid.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `fitPhones`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** No commit (owner rule).

### Task 2: Setup model, presets, sample courses, seeded scores

**Files:**
- Create: `lib/dev/sim/studio/setup.ts`, `lib/dev/sim/studio/courses.ts`, `lib/dev/sim/studio/random.ts`
- Test: `lib/dev/sim/studio/setup.test.ts`

**Interfaces:**
- `random.ts`: `seededRandom(seed: number): () => number` (mulberry32, values in [0,1)).
- `courses.ts`: `SAMPLE_COURSES: SampleCourse[]`, where `SampleCourse = { ref: string; name: string; place: string; par: number[]; tees: { name: string; rating: number | null; slope: number | null }[] }`.
  - It must include `ref "sim:stevens-park"`, "Stevens Park Golf Course", "Dallas, TX", with the par `[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4]` and the tee Blue 70.4 / 124 (the same as `scenarios/play.ts`; import or move it, don't duplicate).
  - It also includes 1 or 2 more real courses with real ratings, and one course whose only tee has `rating: null, slope: null`.
- `setup.ts`:
  - `type StudioSetup = { kind: "play"; players: { key: string; name: string }[]; host: string; course: string; tee: string; game: "none" | "skins"; guest: string | null; seed: number }`. `players` has 1 to 4 entries. `key` is a lowercase subdomain-safe slug, unique. `host` is one of the keys.
  - `PLAYER_NAMES: string[]`, the drop-down list: Cam, Cade, Jake, Rob, Tyler, Luke, Matt, Sam.
  - `validateSetup(s: StudioSetup): string | null` returns the first plain-English problem or null. Problems: 0 or more than 4 players; duplicate names or keys; host not a player; unknown course or tee; bad seed.
  - `keyFor(name: string, taken: string[]): string`, a slug plus a number if taken.
  - `PRESETS: { id: "play-solo" | "play-friends" | "play-unrated" | "play-fourball"; label: string; setup: StudioSetup }[]`. The first three mirror the old scenarios (friends = Cam host, Cade, Jake, guest Uncle Rob, Skins). `play-fourball` is Cam host, Cade, Jake, Rob, Stevens Park Blue, Skins, no guest.
  - `strokesFor(setup: StudioSetup, course: SampleCourse): Record<string, number[]>`. For each player key plus `"guest"` when there is a guest, 18 strokes, each = par + an offset in {−1,0,0,0,1,1,2} from `seededRandom(seed)`, minimum 1. The same seed gives the same output.

- [ ] **Step 1: Write the failing tests**
  - `test("presets are valid")`: every preset passes `validateSetup` and returns null.
  - `test("validate catches each problem")`: one test case per problem listed above, each returning a non-null string.
  - `test("keyFor makes unique slugs")`: `keyFor("Uncle Rob", ["unclerob"])` gives `"unclerob2"`.
  - `test("same seed same strokes, different seed different")`.
  - `test("strokes are par-based and ≥ 1")`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 3: The phone driver (actions + ready handshake), served and injected by the front door

**Files:**
- Create: `lib/dev/sim/driver/actions.ts` (pure DOM actions, no imports), `lib/dev/sim/driver/client.ts` (message glue + ripple), `lib/dev/sim/driver/types.ts`
- Modify: `scripts/sim/frontDoor.ts`, which serves `/__sim/driver.js` (an esbuild bundle of `client.ts`, built once at startup and cached) and injects `<script src="/__sim/driver.js" defer></script>` into proxied `text/html` responses for person hosts (status 200, before `</head>`, decompressing and re-encoding when the upstream is compressed, or asking upstream for `accept-encoding: identity` on HTML document requests).
- Test: `scripts/sim/driver.test.ts` (Playwright chromium, headless, `page.setContent`), plus `scripts/sim/frontDoor.test.ts` additions.

**Interfaces:**
- `types.ts`:
  - `Target = { text?: string; label?: string; sim?: string; role?: "button" | "link" | "input" | "any"; within?: Target }`
    - `text` = the trimmed visible text, an exact match.
    - `label` = the aria-label or the associated `<label>` text, an exact match.
    - `sim` = the `data-sim` value.
  - `DriverAction = { kind: "go"; path: string } | { kind: "tap"; target: Target } | { kind: "type"; target: Target; text: string } | { kind: "waitFor"; target: Target; timeoutMs?: number } | { kind: "absent"; target: Target; timeoutMs?: number }`
  - `DriverResult = { ok: true } | { ok: false; reason: "not-found" | "ambiguous" | "disabled" | "timeout"; message: string; seen: string }`. `seen` is the first 200 chars of the visible text of the page or `within` root.
  - `DriverMessage`:
    - to the phone: `{ sim: "act"; id: string; action: DriverAction }`
    - from the phone: `{ sim: "ready"; path: string }`, `{ sim: "done"; id: string; result: DriverResult }`
- `actions.ts`: `runAction(doc: Document, action: DriverAction): Promise<DriverResult>`.
  - `tap` fails `ambiguous` when more than 1 visible element matches, and `disabled` when the match is disabled.
  - `type` sets the value through the native setter and dispatches `input`/`change`, so React sees it.
  - `waitFor` and `absent` poll every 100 ms, with a default of 8000 ms.
  - `go` sets `location.href` (the result arrives as the next `ready`).
- `client.ts`:
  - On load it posts `{sim:"ready", path}` to `window.parent` (`"*"` target origin; the message holds no secrets).
  - It handles `act` messages only from an allowed origin or self.
  - It shows a 400 ms maroon ripple at the tapped element's centre.

- [ ] **Step 1: Write the failing tests** (Playwright, one `browser` per file)
  - `test("tap finds a button by text and clicks it")`: the page has a button whose onclick writes to `document.title`.
  - `test("two matches is ambiguous unless within narrows it")`: Review Focus 3.
  - `test("type updates a React-style controlled input")`: an input with an `input` listener records the value.
  - `test("waitFor times out with what the page showed")`: reason `timeout`, and `seen` contains page text.
  - `test("disabled button is reported, not clicked")`.
  - Front door: `test("HTML pages for a person host get the driver script tag; JSON and /_next files don't")` and `test("/__sim/driver.js is served as JavaScript")`.
- [ ] **Step 2:** Run `npx tsx --test scripts/sim/driver.test.ts scripts/sim/frontDoor.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS. Add `scripts/sim/driver.test.ts` to the `test:sim` script before the front door tests.

### Task 4: Custom setup endpoint (Create)

**Files:**
- Create: `lib/dev/sim/studio/seedSetup.ts`
- Modify: `scripts/sim/frontDoor.ts` (`POST /__sim/custom`, plus status), `lib/dev/sim/checks/play.ts` only if needed so the checks can follow a round found at check time, and `scripts/fake-supabase.mjs` to support the course-library reads Play's real course search and scorecard routes make, if they are unsupported today.
- Test: `lib/dev/sim/studio/seedSetup.test.ts`, plus `scripts/sim/frontDoor.test.ts` additions.

**Interfaces:**
- Consumes: `StudioSetup`, `SAMPLE_COURSES` (Task 2), `addPeople`-style seeding (`lib/dev/sim/people.ts`), and the fake (`startFakeSupabase` result).
- `seedSetup(fake: SimFake, setup: StudioSetup): Promise<SimSeeded>`
  - It creates one finished account per player with `display_name = name` and `username = key`, plus friendships between every pair if the real invite search (`/api/account/search`, read its query) needs them.
  - It inserts the setup's sample course into whatever tables the real course search (`lib/platform/golfGps/repository/courseLibrarySearch.ts`: `golf_courses` with embedded `golf_course_external_ids` and `golf_holes`) and the scorecard route (`app/api/rounds/course/[ref]/route.ts`) read, so typing the name and tapping it works on the real screen.
  - It does **not** create a round.
  - `phones` gives every player a `startPath` of `"/"`. `refs` = `{ host: <host id> }`.
- Round binding: the checks resolve `round` at check time as the newest `shared_rounds` row with `host = refs.host`. Before one exists, every check is `waiting` with "No round yet".
- The checks for a custom setup are the Play checks (linked, saved, ended, profile-once, card-matches, handicap, deleted, plus guest when the setup has a guest). For handicap, `expectCounted` = whether the chosen tee has a rating.
- `POST /__sim/custom { setup }` (Origin rule as for other POSTs):
  - It runs `validateSetup`; a problem returns 400 with `{ error }`.
  - It restores the clean base, seeds, snapshots (Reset returns here), and returns status.
  - Status adds `setup` and `roles: Record<key, "Host" | "Player">`.

- [ ] **Step 1: Write the failing tests**
  - `test("seeding a four-ball makes 4 accounts, no round, the course is searchable")`: the course name is found by calling the same query function the search route uses, against the fake.
  - `test("checks wait with 'No round yet' until the host starts one")`, then they bind to the round the host creates via `create_shared_round`.
  - Front door: `test("POST /__sim/custom rejects an invalid setup with its message")` and `test("custom then reset returns to no round")`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests plus the existing sim tests. Expected: PASS.

### Task 5: Step generation + runner

**Files:**
- Create: `lib/dev/sim/studio/script.ts`, `lib/dev/sim/studio/runner.ts`
- Modify: real Play components, only to add the few `data-sim` hooks needed (`components/platform/PlayRound.tsx`, `components/platform/GolfTripScoring.tsx`, `components/platform/RoundInvites.tsx`, `components/platform/TripScheduleCoursePicker.tsx`). List each in the report.
- Test: `lib/dev/sim/studio/script.test.ts`, `lib/dev/sim/studio/runner.test.ts`

**Interfaces:**
- `SimStep = { id: string; phone: string; say: string; expect?: Target; actions: DriverAction[] }`. `expect` is the precondition, checked with `waitFor` (2000 ms) before acting.
- `playScript(setup: StudioSetup, course: SampleCourse): SimStep[]`. Generate the steps by **reading the real screens**:
  - PlayRound `SetupStep`: course search → tee → the players page (invite each player by typing their name and tapping the result, plus the guest) → the game page (GamePicker → Skins) → review → Start.
  - Each invitee: `go "/"` → the invite card → Join.
  - Scoring with `GolfTripScoring`: open Scoring, then for each hole the host enters every player's strokes from `strokesFor` and taps Next hole, as a person would. Use the real input method.
  - Host Card → Submit & Save.
  - The `say` lines are plain English, e.g. "Cam starts a round at Stevens Park Golf Course", "Jake accepts the invite", "Hole 7: Cam 5, Cade 4, Jake 6, Rob 5", "Cam submits the round".
- `runner.ts`:
  - `type Transport = { act(phone: string, action: DriverAction): Promise<DriverResult | { reloaded: true }>; ready(phone: string, timeoutMs: number): Promise<boolean> }`
  - `createRunner(steps: SimStep[], transport: Transport, opts?: { delayMs?: number }): Runner`
  - `Runner = { state(): RunnerState; next(): Promise<void>; playAll(): Promise<void>; pause(): void; skip(): void; jumpTo(index: number): Promise<void>; setDelay(ms: number): void; subscribe(fn: (s: RunnerState) => void): () => void }`
  - `RunnerState = { index: number; status: "idle" | "running" | "paused" | "stopped" | "failed" | "done"; message: string | null; done: string[] }`
  - Before each step: if `expect` isn't met, set status `stopped` with message `"<Name>'s phone isn't on <expect description>. Tap it there or press Skip"`.
  - A `reloaded` result: wait for ready, then retry the remaining actions once; a second reload or a failure sets `failed` with the driver message.
  - `go` actions resolve when `ready` arrives.
  - `jumpTo` plays the steps up to the index at zero delay.

- [ ] **Step 1: Write the failing tests**
  - Script:
    - `test("four-ball script: host start, 3 invite accepts, 18 hole steps, submit")`: check the step count and the order of `phone`s.
    - `test("hole steps type the seeded strokes")`: the typed text equals `strokesFor`.
    - `test("solo has no invite steps; guest is added on the players page")`.
    - `test("every say is plain English with names, no ids")`.
  - Runner, with a fake transport:
    - `test("next runs one step")`
    - `test("playAll runs to done")`
    - `test("pause stops between steps")`
    - `test("unmet expect stops with the take-over message")`: Review Focus 1.
    - `test("reload retries once then fails")`: Review Focus 2.
    - `test("a driver failure stops in failed with the driver's message")`
    - `test("skip moves past a stopped step")`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Verify the generated script against the live screens. Run `npm run sim`, then drive one phone with a quick Playwright script through the steps for a solo round. Adjust the targets or add `data-sim` hooks until a solo round reaches Submit. Stop only your own sim.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 6: Studio console

**Files:**
- Modify: `components/dev/simulators/SimulatorConsole.tsx` (rebuilt as the Studio; it may split into `StudioSetupForm.tsx`, `StudioSteps.tsx` and `PhoneGrid.tsx` in `components/dev/simulators/`), `SimulatorConsole.module.css`, `app/dev/simulators/scoring/page.tsx` (pass `PRESETS` and `SAMPLE_COURSES` metadata; never PGlite), and `lib/dev/sim/console.ts` (iframe `Transport`).
- Test: `lib/dev/sim/console.test.ts` additions.

**Interfaces:**
- `iframeTransport(getFrame: (phone: string) => HTMLIFrameElement | null, origin: string): Transport`. It posts `act` messages to the frame's `contentWindow`, tracks `ready`/`done` by `event.source` and id, and resolves `{ reloaded: true }` when a `ready` arrives while an action is outstanding.
- **Layout:**
  - **Left (≈ 360 px):**
    1. **Setup**:
       - preset picker
       - Players: 1 to 4 rows, each with a name drop-down from `PLAYER_NAMES` or "Type a name…", plus a Host radio
       - Course + tee
       - Game (None / Skins)
       - Guest (optional name)
       - Seed (number, with "New seed")
       - **Create**
       - The `validateSetup` message shows inline, and Create is disabled while it's invalid.
    2. **Steps**: the list with the current step highlighted and ticks on finished ones; Next step, Play all, Pause, Skip, a speed slider (0 to 2000 ms between actions, default 600), and "Fast-forward to" on each step; the runner message in red when stopped or failed.
    3. **Checks** and **What happened**, each collapsible, as today.
  - **Right:** `fitPhones` grid measured with `ResizeObserver`. Each phone is an iframe scaled with `transform: scale()`, with the name and role **under** it. There are no controls inside the screen. Reload is a small icon in the name strip.
- **Behaviour:**
  - Create calls `POST /__sim/custom`, then reloads the phones through `phoneUrl(person, "/")` and builds the runner from `playScript`.
  - Reset reloads the phones and resets the runner to step 0.
  - Sim not running shows the start card, and the runner is discarded (Review Focus 5).

- [ ] **Step 1: Write the failing tests**
  - `test("iframeTransport resolves done for the matching id only")`
  - `test("a ready during an action resolves reloaded")`
  - `test("status error discards the runner")`: a pure helper `consoleReducer` or equivalent.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS. The tsc grep for the sim paths prints nothing.

### Task 7: End-to-end: a four-ball plays itself

**Files:**
- Create: `scripts/test-sim-studio.ts`
- Modify: `package.json`: `test:sim` also runs `tsx scripts/test-sim-studio.ts` after the Play runs.

**Interfaces:**
- It starts the sim (or reuses one on 3005, printing that it resets it) and launches Playwright chromium headless.
  - It calls `POST /__sim/custom` with the `play-fourball` preset.
  - It opens one page per player at `http://<key>.localhost:3005/__sim/login?as=<key>&next=/`.
  - It runs `playScript` through `createRunner` with a Playwright transport that delivers `act` via `page.evaluate(window.postMessage(…, "*"))` (self origin) and listens for `done`/`ready` through an exposed binding.
  - Then all checks must be `pass` except `deleted`, with no `unsupported` or failed log entries.
- It prints `✔ studio four-ball` and exits 0. It stops only what it started, on success and on failure.

- [ ] **Step 1:** Write the script.
- [ ] **Step 2:** Run `npm run test:sim`. Expected: the front door and driver tests pass, the 4 Play lines and `✔ studio four-ball` print, and it exits 0.

### Task 8: Record it

**Files:** `project_specs.md` (Simulator Studio section: status + Progress), `docs/app-workflow.md` (one entry, then `npm run docs:workflow` if the check is stale).

- [ ] **Step 1:** Write the progress notes in plain English: what's built, how to use it (`npm run sim`, then `/dev → Simulators → Scoring`, Setup, Create, Play all, take over), the seed, the sample courses, and that Phase 2 (Trip) is next.
- [ ] **Step 2:** Run the full `npm test`, the type check (ignore generated `.next*`, `out/` and `capacitor-web`), and `npm run test:sim`. Report the counts. Non-sim failures are reported, not fixed.
