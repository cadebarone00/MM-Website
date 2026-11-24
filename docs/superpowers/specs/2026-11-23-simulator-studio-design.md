# Simulator Studio: build-your-own rehearsal, phones that play themselves (design)

Owner request 2026-11-23. Status: **APPROVED by owner 2026-11-23.** Replaces the layout of the Scoring Simulator built on 2026-11-23 (`2026-11-22-simulators-scoring-design.md`), and keeps all of its engine: `npm run sim`, the fake Supabase, the front door, Reset, the checks and the log.

## Why

The owner wants to rehearse a whole round, and later a whole trip, the way it really happens. **Instructions on the left. Real phones on the right that play themselves, step by step**, as if 4 (or 8) people were holding them. No simulator controls inside the phone screens. He also wants to **build the rehearsal himself**: pick Play or Trip, choose how many players, name them, pick the course or trip details, then press Play. Nobody has used scoring for real yet. This is the dress rehearsal.

## Goals

- **Studio layout** on `/dev → Simulators → Scoring`:
  - **Left panel:** setup, then the step list, then Checks and the log (collapsible).
  - **Right area:** phones only.
- **Phones fit the area.** All phones are always visible with no scrolling, scaled down evenly:
  - 1 phone is large, 2 sit side by side, 4 make a 2 × 2 box, 8 make a 4 × 2 grid.
  - It recalculates when the window is resized.
  - Each phone screen shows **only the real app**. The person's name and role (Host, Organizer, Player) sit **under** the phone, outside the screen.
- **Setup form (Play, Phase 1):**
  - Number of players: 1 to 4.
  - A name for each player: a drop-down of pretend names (Cam, Cade, Jake, Rob, …) or typed. Each becomes a pretend finished account.
  - Who hosts.
  - A course, from a **sample course list** of a few real courses with real ratings/slopes and one with no rating.
  - Game: none / Skins.
  - Optional guest.
  - **Create** builds a fresh rehearsal from this setup. It replaces the fixed scenario picker. The three old scenarios become **presets** that fill the form.
- **Phones play themselves.** The step list is a real story: "Cam starts a round at Stevens Park", "Cam invites Cade, Jake and Rob", "Jake accepts", "Hole 1: everyone's score goes in", … "Cam submits". The controls are:
  - **Next step**, which runs one step.
  - **Play all**, which runs the rest at a watchable speed with a speed control.
  - **Pause**.
  - **Fast-forward to step N**.

  Each step **taps and types on the real screen** of the right phone: the button visibly presses and digits appear. It is exactly what a person would do. The current step is highlighted, and finished steps get a tick.
- **Take over any time.** Tapping a phone yourself always works. Pause, play a few holes by hand, then press Next. Before each step, the next step re-checks what's on that phone's screen. If the screen isn't what it expects, it stops and says so in plain words (for example "Jake's phone isn't on the invite card. Tap it there or press Skip").
- **A step that can't find its button stops in red.** It shows which phone, which button, and what the screen showed. It never fakes the result behind the scenes.

## Phase 2 (own design + plan, after Phase 1 ships)

- **Trip setup:**
  - 4 to 8 players, named the same way.
  - The trip name and location.
  - The format: matches, individual, or both.
  - Which player is the **Organizer** (plus an optional separate organizer who doesn't play).
  - Round 1's course from the sample list.
- **The trip script:** the organizer sets up the round, groups and attesters, then each group plays and attests, and the organizer finishes. 8 phones appear in a 4 × 2 grid.
- This uses the Trip checks from the already-planned Trip scenarios.
- **Phase 3+:** drafts, match selection, corrections, Tourneys and Leagues, one at a time on the same base.

## Non-goals (Phase 1)

- Trips, Tourneys and Leagues, which are Phase 2+.
- Real course search. It would spend the free daily course lookups (the sim blanks that key). The sample list is used instead.
- Real phones, the iPhone app build, push and email.
- Recording or exporting a run as video.

## Anti-goals

- **No faked results.** Every step goes through the real screen the way a person would. A step that can't do that stops in red.
- **No simulator UI inside the phone screens.**
- Still never touches a real database, never re-implements a scoring rule, and nothing reaches production.

## Approaches considered (for "phones play themselves")

1. **A remote control inside each phone (chosen by owner).** The front door adds a small script to the app pages it serves to the phones (simulator only). The left panel sends it steps ("tap the button labelled Accept", "type 4 into hole 1 for Jake") with `postMessage`. It presses the real buttons in the owner's own Chrome, side by side, and the owner can take over any time. Cost: steps find things by their on-screen label, so renaming a button means updating a step.
2. **A robot browser (Playwright).** Very reliable, but the phones would live in a separate robot window instead of the /dev page. That splits the instructions from the phones. Rejected.
3. **Run steps behind the scenes and refresh the phones.** Simple, but you never see anything being tapped. Rejected by the owner.

## How it works

- **The phone driver script.** In each HTML page the front door proxies to a phone, it inserts one `<script src="/__sim/driver.js">` before `</body>` (or `</head>`). It is served only by the front door, so the real app never contains it.
  - It listens for `postMessage` from the control page origin (`http://localhost:3001`) only.
  - It answers with what it did or why it couldn't.
  - It knows a few actions:
    - `tap` (by visible text / aria-label / `data-sim` hook)
    - `type` (into a field found by its label)
    - `waitFor` (text or element appears, with a timeout)
    - `read` (does the screen show X)
  - Each action shows a brief tap ripple so the owner sees what was pressed.
  - Where a label is ambiguous (e.g. 18 identical "+" buttons), the builder may add a `data-sim="…"` attribute to the real component. That is an inert, harmless attribute; keep these rare.
- **Steps are data.** A script is a list of `{ phone, say, actions[] }`. "say" is the plain sentence shown on the left. Scripts are **generated from the setup**: players, host, invitees, guest, course holes, and a score per player per hole. Scores are pretend, chosen randomly within a sensible range from the course pars. They are only the typed numbers; nothing is computed from scoring rules.
- **Create.** It sends the setup to the front door (`POST /__sim/custom`). The door builds a scenario on the fly from the same seed pieces:
  - pretend people with the chosen names and usernames
  - the chosen sample course loaded into the fake course library
  - friendships if the invite search needs them

  **Unlike the old presets**, it does **not** pre-create the round, because the phones do that themselves in step 1. It then snapshots, so Reset works as before.
- **Checks** stay the same (linked, saved, locked, profile-once, card matches, handicap, guest, deleted) and apply to whatever round the phones create. The door finds "the round" as the newest shared round hosted by the chosen host after Create.
- **The phone grid** is pure layout math: the number of columns and the scale chosen to fit N phone frames of 390 × 844 into the area. It is unit tested for 1, 2, 3, 4, 6 and 8.

## Constraints

- Everything from the existing simulator design still holds: dev only, its own ports and build folder, never stopping others' processes, Windows-safe, no commits unless the owner says.
- The driver script only accepts messages from the control page origin, and only exists on the front door (3005).

## Done = (Phase 1)

- Build a 4-ball in the setup form (4 named players, host, course, Skins) and press **Create**. 4 phones appear in a 2 × 2 box, scaled to fit, showing only the app.
- **Play all** plays the whole round on the real screens: start, invite, accepts, 18 holes of scores, submit. Every Check goes green, and the log shows each request.
- Pause, tap a few holes by hand, then resume with Next: it continues from what's on screen, or stops with a plain message.
- A broken step (a renamed button) stops in red with which phone, which button and what it saw.
- Resizing the window rescales the phones with no scrolling. 1, 2, 3 and 4 phones all fit.
- Presets: the old three scenarios fill the form.
- Tests: layout math, script generation (from setup to steps), the driver's actions (in a jsdom test page), the custom-setup seed, and one automated run that plays a generated 4-ball through the driver end to end (headless Chrome is allowed in this test only). The full test suite and type check pass. Checked in Chrome by the controller.

## Answers to the builder check (2026-11-23)

These are the controller's calls unless marked otherwise.

- **Course pick through real taps:**
  - Play's course search (`/api/courses/search`) tries **The Maroon course library first**. The GolfCourseAPI part fails quietly with the key blanked (`Promise.allSettled`).
  - So Create seeds the sample courses into the fake course library (and whatever `/api/rounds/course/<ref>` reads). The host phone then types the course name and taps the result.
  - If that read path needs something the fake doesn't support, extend the fake. Don't add a seed shortcut.
- **Skins / games:** the host phone taps through the real **GamePicker** in PlayRound (Skins plus its toggles). Other players do nothing for the game. The builder reads PlayRound for the exact screens.
- **Invites:** the steps use whatever the real invite search does (`/api/account/search`).
  - If it needs friendships, Create seeds them.
  - Invitees open **Home**, where the invite card is, with a `go` action. They don't wait for a push.
- **Driver actions** add `go` (open a path) and a **ready handshake**: the driver posts "ready" after every page load. A step waits for "ready" before acting. A full reload mid-step re-runs that step's remaining actions once, then stops in red if it still fails.
- **Score entry:** use the real score input exactly as PlayRound builds it (keypad, steppers or fields, with or without auto-advance). One hole = as many actions as a person would need.
- **Scores:**
  - They come from a **seeded random generator**, the seed shown in the setup.
  - The same seed gives the same round, so runs repeat exactly.
- **Which round the checks follow:** the newest shared round whose host is the chosen host, created after Create. If the owner deletes it and starts another by hand, the checks follow the new one.
- **`data-sim` markers** may be added to real components wherever a label is ambiguous or a screen has no distinguishing text. They are inert attributes. Keep them few and list them in the plan.
- **End-to-end test:** Playwright is already a dev dependency (`package.json`). Use it, headless, for that test only.
- **Old presets:** they fill the form. `/__sim/scenario` stays for the existing tests.

## Left to the builder

- The exact look of the left panel and the step list (maroon / cream, Spectral; Barlow only for tiny ALL-CAPS labels).
- The tap ripple style.
- The default speed.
- Which few `data-sim` hooks are needed.
- The sample course list (2 to 4 real courses with ratings, plus one unrated).
- How the door marks HTML responses for injection: only `text/html` 200 responses, without breaking streaming.
