# Simulators base + Scoring Simulator (Play) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable simulator base (`npm run sim`, front door, phones, log, checks, reset) and the Scoring Simulator's three Play scenarios. Trip, Tourney and League scenarios get their own later plans on this base.

**Architecture:** `npm run sim` starts the fake Supabase (`scripts/fake-supabase.mjs`, the real SQL files in PGlite) on 3007, a second `next dev` on 3006 (build folder `.next-sim`) pointed at it, and a front door on 3005. The front door signs each `<person>.localhost:3005` host in as a pretend person, proxies everything else to 3006, and serves `/__sim/*` (status, scenario, reset, log, checks). The `/dev` page **Simulators → Scoring** (on 3001) frames the phones and polls the log and checks.

**Tech Stack:** Node + `tsx` for the scripts, `@electric-sql/pglite`, Next.js 15 (`next dev`), React, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-22-simulators-scoring-design.md`

## Global Constraints

- It never touches a real database. `SUPABASE_URL` for the sim app is always the fake's URL.
- No scoring rule is re-implemented. Checks only **read** tables (and run one change inside a rolled-back transaction to prove a lock).
- Any fake-Supabase call it can't answer shows **red** in the log.
- Dev only. `start.ts` exits with a message when `NODE_ENV=production`. `/dev/simulators/*` calls `notFound()` outside development.
- Ports 3005 (front door), 3006 (sim app), 3007 (fake). If one is busy, exit with "Port N is in use", never kill anything. Two agents share this tree: no stash, checkout or reset, and never stop processes this script didn't start.
- On Windows, stop the child `next dev` with `taskkill /pid <pid> /T /F`, as `scripts/test-golf-trip-create-browser.mjs` does.
- Sim app env: `SUPABASE_URL=<fake url>`, `SUPABASE_ANON_KEY=test-anon`, `SUPABASE_SERVICE_ROLE_KEY=test-service`, `NEXT_BUILD_OUTPUT=.next-sim`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set to empty strings (no realtime: the app polls), `MAROON_ACCOUNT_ENFORCEMENT` unset.
- Session cookie name: `sb-localhost-auth-token` (from the fake's `sessionCookie`).
- Look: maroon / cream, Spectral font (Barlow only for tiny ALL-CAPS labels).
- **Commit steps only happen when the owner says to commit.** Otherwise skip them and list the files at the end. The other agent also commits on this tree.

## Review Focus

1. **`npm run sim` isn't running** → the Simulators page shows "Start the simulator: run `npm run sim` in the terminal" plus Check again, and no broken frames (Task 6 test: `consoleState` with a failed status → `"not-running"`).
2. **A phone keeps the last run's round in its own browser storage after Reset** → `/__sim/login` clears that host's `localStorage` and `sessionStorage` before redirecting (Task 4 test: the login response body contains `localStorage.clear()`).
3. **Someone opens `cade.localhost:3005/__sim/login?as=cam`** → refused with 400, no cookie (Task 4 test).
4. **A port is already taken by the other agent's server** → clear message, exit code 1, nothing killed (Task 5 test: `checkPortsFree` returns the busy port).
5. **The sim app calls a Supabase endpoint the fake doesn't support** → a red "unsupported" log entry (Task 1 test: an `onCall` with `ok:false, unsupported:true`).

---

### Task 1: Fake Supabase can snapshot, restore and report every call

**Files:**
- Modify: `scripts/fake-supabase.mjs`
- Create: `lib/dev/sim/migrations.ts`
- Test: `lib/dev/sim/fakeSupabase.test.ts`

**Interfaces:**
- Produces: `startFakeSupabase({ port, root?, migrations?, loadDataDir?, onCall? })`. It is unchanged for existing callers (the defaults keep today's behaviour), and its result adds:
  - `dump(): Promise<Blob>`: PGlite `dumpDataDir()`
  - `restoreTokens(): Promise<void>`: rebuilds the token map from `auth.users`. Tokens stay `test-token-${id}`, so cookies survive a restore.
- `onCall(entry: { at: string; kind: "rpc" | "table" | "auth" | "unsupported"; name: string; ok: boolean; error?: string })` runs for every request.
- `SIM_MIGRATIONS: string[]` in `lib/dev/sim/migrations.ts` = `MIGRATIONS` plus, in order, `shared_rounds.sql`, `shared_round_scorekeeper.sql`, `shared_round_delete.sql`, `join_codes.sql`. If `join_codes.sql` needs another file first, add it just before and note why in a comment.

- [ ] **Step 1: Write the failing tests**
  - `test("sim database installs every file and has the Play functions")`: start with `migrations: SIM_MIGRATIONS` and port `0`. Assert that `create_shared_round`, `delete_shared_round`, `leave_shared_round` and `save_player_round` exist in `pg_proc`.
  - `test("dump then restore keeps users and their tokens")`: `addUser({name:"cam"})`, `dump()`, close, start again with `loadDataDir`, `restoreTokens()`. Then `GET /auth/v1/user` with that token returns 200 and the same id.
  - `test("every call is reported, unsupported ones as not ok")`: POST `/rest/v1/rpc/create_shared_round` (ok:true, kind "rpc"); GET `/storage/v1/x` (kind "unsupported", ok:false).
- [ ] **Step 2:** `npx tsx --test lib/dev/sim/fakeSupabase.test.ts`. Expected: FAIL (options are ignored).
- [ ] **Step 3:** Implement the options in `startFakeSupabase`. When `loadDataDir` is given, skip the migrations. Make the listen port reflect the actual port when `0` is passed (`server.address().port`) in `url`.
- [ ] **Step 4:** Run the new test and the existing `npm run test:browser:golf-trip` callers' import (`node -e "import('./scripts/fake-supabase.mjs')"`). Expected: PASS, and no change for the old callers.
- [ ] **Step 5:** Commit `scripts/fake-supabase.mjs lib/dev/sim/migrations.ts lib/dev/sim/fakeSupabase.test.ts`. Message: "Simulator: fake Supabase snapshots, restores and reports calls".

### Task 2: Pretend people and the three Play scenarios

**Files:**
- Create: `lib/dev/sim/types.ts`, `lib/dev/sim/people.ts`, `lib/dev/sim/scenarios/play.ts`, `lib/dev/sim/scenarios.ts`
- Test: `lib/dev/sim/scenarios.test.ts`

**Interfaces:**
- `types.ts`:
  - `SimDb = { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }`
  - `SimPerson = { key: string; name: string; id: string; token: string }`
  - `SimPhone = { person: string; label: string; startPath: string }`
  - `SimScenario = { id: string; simulator: "scoring"; feature: "Play" | "Trip" | "Tourney" | "League"; label: string; seed(fake: SimFake): Promise<SimSeeded>; checks: SimCheck[] }`
  - `SimSeeded = { people: SimPerson[]; phones: SimPhone[]; refs: Record<string, string> }`
  - `SimFake = { db: SimDb; addUser(o: { name: string }): Promise<{ id: string; token: string }> }`
  - `SimCheck = { id: string; label: string; run(db: SimDb, seeded: SimSeeded): Promise<SimCheckResult> }`
  - `SimCheckResult = { status: "pass" | "fail" | "waiting"; detail: string }`
- `people.ts`: `PEOPLE = { cam: "Cam", cade: "Cade", jake: "Jake" }` and `addPeople(fake, keys: string[]): Promise<SimPerson[]>`. The person `key` is also the host subdomain.
- `scenarios/play.ts` exports three `SimScenario`s. Each seeds through `create_shared_round` (and for friends, `answer_shared_round_invite`). Each phone's `startPath` is `/rounds/new?round=<id>`, and `refs.round = <id>`. Course: `ref "sim:stevens-park"`, name "Stevens Park Golf Course", place "Dallas, TX", par `[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4]`.
  - `play-solo`: label "Play: solo", Cam only, tee `{ name: "Blue", rating: 70.4, slope: 124 }`, `countForHandicap: true`, holes "18", no game.
  - `play-friends`: label "Play: with friends", Cam host, Cade joined, Jake **invited** (his phone accepts the invite), guest `{ id: "g0", name: "Uncle Rob", handicap: null }`, game `{ id: "skins", net: false, birdiesDouble: false }`, same rated tee.
  - `play-unrated`: label "Play: tee with no rating", Cam only, tee `{ name: "Blue", rating: null, slope: null }`.
  - `datePlayed` = today, `YYYY-MM-DD`.
- `scenarios.ts`: `SCENARIOS: SimScenario[]` and `scenarioById(id: string): SimScenario | undefined`.

- [ ] **Step 1: Write the failing tests**
  - `test("each Play scenario seeds one live round hosted by Cam, with its phones on it")`. For each Play scenario: seed on a fresh fake (SIM_MIGRATIONS). Assert `shared_rounds` has 1 live row with host = Cam's id, and that every phone's `startPath` contains `refs.round`.
  - `test("with friends: Cade joined, Jake invited, one guest")`: check the `shared_round_players` statuses and `setup->'guests'` length 1.
  - `test("scenario ids are unique and findable")`.
- [ ] **Step 2:** Run it. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the files.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit. Message: "Simulator: pretend people and Play scenarios".

### Task 3: Play checks

**Files:**
- Create: `lib/dev/sim/checks/play.ts` (attach the checks to the scenarios in `scenarios/play.ts`)
- Test: `lib/dev/sim/checks.test.ts`

**Interfaces:**
- Consumes: `SimCheck`, `SimSeeded` (Task 2).
- Produces the check ids below, for every Play scenario. `players` = the accounts that are `joined` (plus the host).
  - `linked`: "Card linked to the round". pass when the `shared_rounds` row `refs.round` exists with the right host. If the round is gone and `deleted` passes, the detail is "Round deleted".
  - `saved`: "Scores saved". waiting at 0 rows; pass with detail "`<n>` holes saved (`<names>`)" from `shared_round_holes` plus `shared_round_guest_holes`.
  - `ended`: "Submitted and locked". waiting while live. When ended, run `set_shared_round_strokes(host, round, host, 1, 3)` inside `begin; … rollback;`: pass if it errors, fail if it succeeds.
  - `profile-once`: "On each player's profile, once". For each of `players`, count `player_rounds where profile_id = $1 and source = 'personal' and source_key like '%' || round || '%'`. waiting if any is 0 and the round is live; pass if every count = 1; fail if any count > 1, or any is 0 after `ended`.
  - `handicap`: "Handicap". waiting until saved. Otherwise pass with detail "Counts · differential `<d>`" or "Not counted: `<not_counted_reason>`". For `play-unrated` the expected result is "not counted", so it passes when not counted and fails when counted. For the others it's the reverse.
  - `play-friends` also has `guest`: "Guest never reaches a profile", pass when the `player_rounds` count for this round = number of `players`.
  - All Play scenarios also have `deleted`: "Delete round removes everything". waiting while the round exists. pass when there are 0 rows in `shared_rounds`, `shared_round_players`, `shared_round_holes`, `shared_round_guest_holes` and `shared_round_picks` for the round.

- [ ] **Step 1: Write the failing tests** (seed `play-friends` on a fresh fake)
  - `test("a fresh round: linked passes, everything else waits")`.
  - `test("scores entered, host submits for everyone: all pass")`. Write strokes via `set_shared_round_strokes`, call `save_player_round` for Cam and Cade with keys built by `playerRoundId("personal", id, round)` and a built round (use `personalRound` from `lib/platform/personalRound.ts`), then `update_shared_round(..., true)`. Expect linked, saved, ended, profile-once, handicap and guest to be pass.
  - `test("delete round: deleted passes, linked says Round deleted")`.
  - `test("unrated tee: handicap passes only when not counted")`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the checks (read-only SQL, except the rolled-back lock attempt).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit. Message: "Simulator: Play scoring checks".

### Task 4: Front door (sign-in as, proxy, log, /__sim API)

**Files:**
- Create: `lib/dev/sim/frontDoor.ts` (pure helpers), `scripts/sim/frontDoor.ts` (the http server)
- Test: `lib/dev/sim/frontDoor.test.ts`, `scripts/sim/frontDoor.test.ts` (add `scripts/**/*.test.ts` to nothing; run it explicitly in the steps and in Task 7's script)

**Interfaces:**
- `lib/dev/sim/frontDoor.ts`:
  - `personFromHost(host: string): string | null`: `"cam.localhost:3005"` → `"cam"`. Plain `localhost` → null.
  - `loginPage(next: string): string`: an HTML page whose script runs `localStorage.clear(); sessionStorage.clear(); location.replace(<next JSON>)`. `next` must start with `/` and not `//`, otherwise use `/`.
  - `type LogEntry = { n: number; at: string; person: string | null; kind: "api" | "rpc" | "table" | "auth" | "unsupported" | "note"; text: string; ok: boolean }`
  - `class SimLog { add(e: Omit<LogEntry,"n"|"at">): void; since(n: number): LogEntry[] }`, holding the newest 2000 entries.
- `scripts/sim/frontDoor.ts`: `startFrontDoor({ port, appPort, fake, controlOrigin = "http://localhost:3001" }): Promise<{ close(): Promise<void>; log: SimLog }>`. The routes:
  - `GET /__sim/login?as=<key>&next=<path>`: 400 if `as` ≠ the host's person or isn't in the current scenario. Otherwise `Set-Cookie: sb-localhost-auth-token=<value>; Path=/; SameSite=Lax` from `fake.sessionCookie(user)`, and the `loginPage(next)` body.
  - `GET /__sim/status` → `{ ok: true, scenario: id | null, phones: SimPhone[], people: {key,name}[] }`.
  - `POST /__sim/scenario {id}` → restore the clean base snapshot, `seed`, take the scenario snapshot. Returns the status.
  - `POST /__sim/reset` → restore the scenario snapshot (`loadDataDir` and `restoreTokens`), log a "note", return the status.
  - `GET /__sim/log?since=<n>` → `LogEntry[]`.
  - `GET /__sim/checks` → `{ id, label, status, detail }[]` for the current scenario.
  - Every `/__sim/*` response carries `Access-Control-Allow-Origin: <controlOrigin>`, and an OPTIONS preflight is answered.
  - Everything else is proxied to `http://localhost:<appPort>` with method, headers and body unchanged and `Host` set to `localhost:<appPort>`. That includes websocket `upgrade` (live reload). Each `/api/*` response is logged as `kind "api"`, text `"<METHOD> <path> → <status>"`, ok = status < 400.
  - The fake's `onCall` goes into the same `SimLog`. kind `unsupported` is always `ok:false`.
  - Snapshots: the reset path closes the fake and starts it again on the same port. Pass the fake in as a holder `{ current }` so the proxy never caches a closed one.

- [ ] **Step 1: Write the failing tests**
  - Pure: `personFromHost` cases; `loginPage("//evil")` redirects to `/`; `loginPage` contains `localStorage.clear()`; `SimLog` keeps the newest 2000 entries and `since`.
  - Server (with a tiny upstream `http.createServer` answering 200 on `/api/x` and 500 on `/api/y`, and a real fake on port 0):
    - `test("login as the host's own person sets the cookie; as someone else is refused")`
    - `test("proxied api calls are logged with person and status")`: `/api/x` ok, `/api/y` not ok.
    - `test("scenario then reset returns to the seeded start")`: pick `play-solo`, insert a hole, reset, holes = 0.
    - `test("/__sim responses allow the control page origin")`.
- [ ] **Step 2:** `npx tsx --test lib/dev/sim/frontDoor.test.ts scripts/sim/frontDoor.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement (only `node:http`, no new dependency).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit. Message: "Simulator: front door".

### Task 5: `npm run sim`

**Files:**
- Create: `scripts/sim/start.ts`, `lib/dev/sim/ports.ts`
- Modify: `package.json` (`"sim": "tsx scripts/sim/start.ts"`), `.gitignore` (`.next-sim/`), `next.config.ts` (dev only: `allowedDevOrigins: ["*.localhost"]` if `next dev` blocks the proxied hosts' dev resources; leave it out if it doesn't)
- Test: `lib/dev/sim/ports.test.ts`

**Interfaces:**
- `checkPortsFree(ports: number[]): Promise<number | null>`: the first busy port, or null.
- `start.ts`: exits when `NODE_ENV=production`. Runs `checkPortsFree([3005, 3006, 3007])` and exits 1 with "Port N is in use (maybe the other agent's server). Stop it or change SIM ports." Then it starts the fake (`SIM_MIGRATIONS`), takes the base snapshot, spawns `next dev -p 3006` with the Global Constraints env, and starts the front door. It prints:
  `Simulator ready → open http://localhost:3001/dev and pick Simulators → Scoring`
  On Ctrl+C it stops only its own children (taskkill tree on Windows).

- [ ] **Step 1: Write the failing test** `test("a busy port is reported, free ports give null")`: listen on a random port, expect it back; then close it and expect null.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `ports.ts` and `start.ts`, and add the script.
- [ ] **Step 4:** Run the test (PASS). Then run `npm run sim` in the background and check:
  - `curl http://localhost:3005/__sim/status` returns `{"ok":true,...}`.
  - `POST /__sim/scenario {"id":"play-solo"}`, then opening `http://cam.localhost:3005/__sim/login?as=cam&next=/rounds/new?round=<id>` in Chrome lands on the round screen with "Stevens Park Golf Course", not /login.
  - Stop it with Ctrl+C. Port 3006 is free afterwards.
- [ ] **Step 5:** Commit. Message: "Simulator: npm run sim".

### Task 6: Simulators → Scoring page

**Files:**
- Create: `app/dev/simulators/scoring/page.tsx`, `components/dev/simulators/SimulatorConsole.tsx`, `components/dev/simulators/SimulatorConsole.module.css`, `lib/dev/sim/console.ts`
- Modify: `lib/dev/simulatorRoutes.ts` (path `/dev/simulators/scoring`: label "Scoring", group "Simulators", `standalone: true`, `viewport: "desktop"`, `conditions: []`; put "Simulators" right after the four feature groups in `groupOrder`)
- Test: `lib/dev/sim/console.test.ts`, plus one assertion in `lib/dev/simulator.test.ts` (or its routes test) that the Simulators group lists Scoring.

**Interfaces:**
- `lib/dev/sim/console.ts` (pure):
  - `SIM_ORIGIN = "http://localhost:3005"`
  - `phoneUrl(person: string, path: string): string` → `http://<person>.localhost:3005/__sim/login?as=<person>&next=<encoded path>`
  - `consoleState(status: { ok: boolean } | "error"): "running" | "not-running"`
- The page: `notFound()` outside development. The console:
  - Fetches `/__sim/status`. When not running, it shows the card "Start the simulator: run `npm run sim` in the terminal" plus **Check again**.
  - Top bar: title "Scoring", scenario picker (from status/`SCENARIOS` labels, grouped Play / Trip / Tourney / League, with only Play for now), **Reset**, **Refresh all phones**.
  - Phones: one 390 × 844 iframe per `SimPhone`, side by side and scrolling sideways. Above each: the person's name and label, plus **Reload** (resets the iframe `src` to `phoneUrl`). Picking a scenario or Reset reloads every phone.
  - Under the phones: **Checks** (polled from `/__sim/checks` every 2 s, pass green / fail red / waiting grey, with each detail) and **What happened** (polled from `/__sim/log?since=n` every 1 s, newest first, person filter, red when `ok:false`).

- [ ] **Step 1: Write the failing tests:** `phoneUrl("cam","/rounds/new?round=1")` equals `"http://cam.localhost:3005/__sim/login?as=cam&next=%2Frounds%2Fnew%3Fround%3D1"`; `consoleState("error")` → "not-running"; the Simulators group contains a page labelled "Scoring".
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the page and the console.
- [ ] **Step 4:** Run the tests (PASS). Then, in Chrome on 3001 with `npm run sim` running: pick Simulators → Scoring → "Play: with friends". Three phones show Cam / Cade / Jake on the round. Jake accepts the invite. Cam enters 18 holes and taps Submit & Save. The checks go green, and the log shows each request. Reset brings back an empty round (no "Unfinished round" prompt). With `npm run sim` stopped, the page shows the start card.
- [ ] **Step 5:** Commit. Message: "Simulator: Simulators group and Scoring page".

### Task 7: One automated run per Play scenario

**Files:**
- Create: `scripts/test-sim-play.ts`
- Modify: `package.json` (`"test:sim": "tsx scripts/test-sim-play.ts"`)

**Interfaces:**
- Consumes: `start.ts`'s pieces (fake, front door, `next dev` spawn), or a running sim on 3005 when one is already up. It uses fetch with each person's cookie from `/__sim/login`.
- For each Play scenario it calls the real routes:
  - `play-solo` / `play-unrated`: POST `/api/rounds/shared/<id>` `strokes` for holes 1 to 18, then POST `/api/rounds/personal` with the scenario's setup, a full card and `startedAt = <id>`.
  - `play-friends`: Jake `join`, then the host writes strokes for Cam, Cade and the guest, then the personal submit.
  - A second `play-solo` run: `delete`.

  After each run, every check must be `pass`, the log must have no `ok:false` entries of kind `unsupported`, and the script exits 0.

- [ ] **Step 1:** Write the script with assertions (`node:assert`).
- [ ] **Step 2:** `npm run test:sim`. Expected: prints one line per scenario, "✔ play-solo / ✔ play-friends / ✔ play-unrated / ✔ play-solo delete", and exits 0.
- [ ] **Step 3:** Commit. Message: "Simulator: automated Play runs".

### Task 8: Record it

**Files:** `project_specs.md` (the Simulators section gets a Progress line), `docs/app-workflow.md` (one entry), the memory note `simulators-scoring.md` plus its MEMORY.md line.

- [ ] **Step 1:** Write the progress notes: what's built, the `npm run sim` command, Play only, and that Trip, Tourney and League come in the next plans.
- [ ] **Step 2:** Run the full `npm test` and the type check (ignore errors only in generated `.next*` / `out/` folders). Expected: PASS.
- [ ] **Step 3:** Commit only when the owner says to commit (owner rule; the other agent commits on this tree too).
