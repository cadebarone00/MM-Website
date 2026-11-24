# Simulators group + Scoring Simulator: design

Owner request 2026-11-22. Status: **design, awaiting owner approval.** Nothing has been built.

## Why

Nobody has used scoring for real yet: not Play, Trips, Tourneys or Leagues. Before real golfers rely on it, the owner
wants a **dress rehearsal**. One person plays a whole round as every person involved (players, attester, organizer,
watcher) and sees where everything lands. The question it answers: "are the scorecards linked to the rounds, do they
save, do they reach the profile and handicap?" Today that can only be answered with real accounts on real phones.

The owner also wants the same kind of simulator for other things later (Sign-up, and the Trip, Tourney and League
onboarding). So this build makes a **reusable base** plus the **first simulator (Scoring)**.

## Goals

- A new **Simulators** group in the `/dev` simulator (localhost:3001/dev). Every simulator lives there.
- **Scoring Simulator**: several pretend phones side by side. Each runs the **real app** (real screens, real server
  routes, real SQL) signed in as a different pretend person. You tap through a full round.
- A **What happened** log (every request each phone made, with who and the result) and a **Checks** list (pass/fail,
  read straight from the database) under the phones.
- **Scenarios** (starting points) for each of Play, Trip, Tourney, League, plus **Reset**, which returns to the
  scenario's start in a few seconds.
- A base that the later simulators (Sign-up, Onboarding) plug into without rebuilding it.

## Non-goals (this build)

- Sign-up and Onboarding simulators. They come later, one at a time, on this base. Today's `/dev/signup-sim` stays
  where it is until then.
- Real phones, push notifications, emails, Live Activities. Emails and pushes are written to the log instead of sent.
- Realtime websockets. Phones use the app's existing fallback polling (about 10 s), and a **Refresh all phones**
  button is there for when you don't want to wait.
- GPS / maps imagery, the iPhone app build (Capacitor), and payments.
- Trip / Tourney / League no-show and replace. That feature isn't built yet; its scenario is added when it is.

## Anti-goals (would make this a failure even if it "works")

- **It never touches a real database** (prod or DEV Supabase). Only the in-memory one.
- **No copied scoring rules.** The simulator never re-implements a rule in JavaScript. If a rule is checked, it's the
  real SQL / real route doing it. A pass has to mean the real thing passes.
- **No silent gaps.** Any request the fake Supabase can't answer shows **red** in the log, never a quiet success.
- **Nothing reaches production.** It must not change how the real app behaves.

## Approaches considered

1. **Pretend server in the browser** (like the Sign-up Simulator). Fast, no setup. But the database rules would be
   pretend copies, so a pass could hide a real bug. Rejected: false confidence on a first rehearsal.
2. **Real app + local Supabase in Docker.** Tests everything, but needs Docker running every time, and setup and reset
   are slow. Kept as the later "final check on real phones" idea, not this build.
3. **Real database rules in an in-memory Postgres.** Owner picked this, then picked the **upgraded version** once we
   found `scripts/fake-supabase.mjs`: the real app (screens + server routes) runs against a fake Supabase front door
   that runs every real SQL file in PGlite. Only Supabase's HTTP layer and logins are faked. Cost: one command,
   `npm run sim`, before testing. **Chosen.**

## How it works

```
localhost:3001/dev  (your normal dev site)
  └ Simulators → Scoring    ← control page: phones (iframes) + scenario picker + log + checks
        │ frames
        ▼
cam.localhost:3005, cade.localhost:3005, org.localhost:3005 ...   ← one host per pretend person (own cookies)
        │
   sim front door (port 3005, scripts/sim/…)
        ├ /__sim/*  → sign in as, load scenario, reset, log, checks
        └ everything else → proxied to the sim copy of the app
                                   │
                        next dev -p 3006 (NEXT_BUILD_OUTPUT=.next-sim, SUPABASE_URL=fake)
                                   │
                        fake Supabase (port 3007, PGlite, every scoring SQL file)
```

- **`npm run sim`** (new script, e.g. `scripts/sim/start.mjs`) starts three things: the fake Supabase, a second
  `next dev` on 3006 with its **own build folder** (`.next-sim`, so it never clashes with the owner's or the other
  agent's dev server on 3001), and the small front door on 3005.
- **One host per person.** `*.localhost` always means this computer, and each host keeps its own cookies, so every
  phone is a different signed-in person. The front door's `/__sim/login?as=<person>` sets the session cookie the same
  way the browser tests do (`sessionCookie` in `fake-supabase.mjs`), then redirects to the page.
- **Framing.** In `next dev`, `next.config.ts` already lets localhost:3001 frame the app (`frame-ancestors`). The
  control page frames the 3005 hosts. The front door has to pass through the dev server's live-reload websocket.
- **The fake Supabase** gets a longer migration list for the simulator: every file scoring needs, in the order the
  database tests install them (shared rounds + scorekeeper + delete, join codes, golf trip scoring + realtime +
  corrections + round pars, player rounds, code tournaments, leagues, rounds_everywhere, maroon live). It keeps
  recording unsupported calls, and the log shows them red. When a scoring screen needs a read it doesn't support yet,
  the builder extends `fake-supabase.mjs` (it's test infrastructure only).
- **Reset** = after a scenario is seeded, keep a snapshot of the database (PGlite can dump and load its data). Reset
  loads the snapshot. If that turns out unreliable, rebuilding from the migrations is fine.
- **When `npm run sim` isn't running**, every Simulators page shows a plain card: "Start the simulator: run
  `npm run sim` in the terminal", plus a Check again button.

## Scenarios (Scoring)

Every pretend account is a **finished, Active account** (profile set up, username, birthday), so the app's onboarding gate never redirects a phone (my call). Each scenario is seeded by calling the **real database functions** (create trip, create round, invite, join and so
on), so seeding also exercises the creation path. Every person is a pretend account with a username. Course: one
sample course with a **rated tee** (for example rating 70.4 / slope 124), so handicap counting is testable. One
scenario uses an **unrated** tee to show "not counted".

| Scenario | Phones | What it starts with |
|---|---|---|
| Play: solo | 1 (Cam) | signed in, on Play, no round yet |
| Play: with friends | 3 (Cam host, Cade, Jake) + 1 guest | round started by Cam with Skins, Cade invited, Jake joins by code |
| Trip: round 1 | 4 players in one group (each also attests another, one-to-one) + Organizer + Watcher | saved trip, round 1 today, pars confirmed from the rated tee, groups and attesters set |
| Tourney: by code | 3 players + Organizer | code tourney, 2 rounds, gross, tee sheet set |
| League: week 1 | 2 group scorers + 2 players + Organizer | league with 2 groups, scorer in each, rated tee |
| Not counted | 1 | Play round on an unrated tee |

The control page has a scenario picker. Picking one resets to it and puts each phone on its starting page.

## Phones

- Phone-sized frames (about 390 × 844), side by side, scrolling sideways if they don't fit. Each has its person's name
  above it and a small address bar showing which page it's on, plus Back and Reload.
- A per-phone **Fill rest of holes** helper (my call: it saves tapping 18 holes on every test). It fills only through
  the phone's **real screen requests**, so it's the same as tapping.
- **Refresh all phones** reloads every frame.

## What happened (log)

The front door records every `/api/*` request: time, which person, method, path, status, and a short body. The fake
Supabase records every database function call, with its error message if it failed. The log merges both, newest at the
top, and can be filtered by person. Red: any failed request and any unsupported fake-Supabase call. Emails and pushes
the app tries to send show here as "would send …".

## Checks (Scoring)

Read-only SQL run by the front door (`/__sim/checks?scenario=…`), refreshed after each request. Each check shows
pass / fail / waiting. They read the **real tables**:
- **Card linked to the round:** the card / scorecard row exists and points to this scenario's round (shared round id,
  trip round, tourney round, league group).
- **Scores saved:** holes saved so far per player, which must match what the phone shows.
- **Submitted and locked:** after Submit, the card is marked submitted and a further score change is refused (the check
  attempts one and expects the error).
- **On the profile, once:** exactly one `player_rounds` row per player for this round, with the right source (P / T /
  C / L).
- **Handicap:** counted, or "not counted" with the reason. Each player's handicap index before and after.
- Scenario-specific: attester match blocks submit until scores agree (Trip, Tourney); a guest never reaches a profile
  (Play); every group player gets the round when the scorer submits (League); Delete round removes everything (Play).

## Base for later simulators

Shared pieces are built once: the start command, the front door, sign-in-as, scenarios registry (seed function +
phones + start pages + checks), reset snapshot, the log, the checks panel, the "not running" card. Each later
simulator = a new entry in the registry plus its checks. The Simulators group lists them. Scoring is the only one
in this build.

## Where things go

- `scripts/sim/` for the start command, front door and simulator migration list. It reuses `scripts/fake-supabase.mjs`.
- `lib/dev/sim/` for the scenarios registry, seed functions and checks (pure where possible, unit tested).
- `app/dev/simulators/scoring/` and `components/dev/simulators/` for the control page.
- `lib/dev/simulatorRoutes.ts` for the new **Simulators** group in the /dev list.
- `package.json` gets the `sim` script.

## Constraints

- Two agents share this working tree. Use its own ports (3005 to 3007) and build folder. Never stop processes it
  didn't start. Never stash, checkout or reset.
- Dev only: the start command refuses to run with `NODE_ENV=production`. `/dev/simulators/*` 404s outside development,
  like other dev pages.
- Windows (PowerShell / Git Bash): process start and stop must work there (see the `taskkill` tree kill in the browser
  tests).

## Done =

- `npm run sim` starts cleanly. The /dev **Simulators → Scoring** page shows the phones signed in as different people.
- Each scenario can be played start to finish by tapping the real screens. The log shows every request. All checks go
  green for the normal path, and the "Not counted" scenario shows its reason.
- Reset returns to the start in under about 10 seconds.
- No unsupported fake-Supabase calls in a full run of each scenario (or each one is fixed by extending the fake).
- Tests: unit tests for the scenarios registry and checks queries. One automated run per scenario (seed → a scripted
  round through the real API → checks all pass), so the simulator itself can't silently rot.
- The full test suite and type check pass. Checked in the browser.

## Left to the builder

Exact port numbers if 3005 to 3007 are taken. How the front door forwards websockets. Log storage size. The phone
frame look (keep the app's maroon / cream style and Spectral font). The exact order of the migration list (copy it from
the database tests).
