# Trip Builder — design

Status: approved by owner 2026-11-03. Builder check done; owner answered the invite-link and formats questions.
Mockups from the conversation: `.superpowers/brainstorm/1689-1793715354/content/trip-builder-flow.html` and `learn-screen-v2.html` (not committed; for reference only).

## Intent

"Trip Builder" is the new name and shape for creating a Golf Trip. Today's questionnaire (`/tournaments/create/golf-trip` → `/golf-trips/new/...` → Review) works but feels like a form. The owner wants it to feel **easy and fun**, like a polished app onboarding: one clear question per screen, a pull toward learning what Golf Trips can do, and help that points at real buttons after the trip exists.

Success = an organizer who has never used Golf Trips can go from "Welcome" to a created trip with an invite link in hand in a couple of minutes, skip anything they don't know yet, and then find out where everything lives without reading anything long.

## Goals

- A step-by-step wizard covering the trip's basics, travel mode, people, competition, courses/rounds, formats and lodging.
- Every step after name, destination and dates can be skipped ("Skip for now"); skipped things are simply set later in Settings.
- An optional, first-time-only intro: 3 quick swipe pages on the Learn screen, plus a fuller 5–7 slide tutorial if they tap **Learn about Golf Trips**.
- After create: a finish screen, then the invite link.
- On the trip home, first-visit-only **coach marks** (bubbles pointing at real buttons, "Got it / Next").
- Everyone on a trip can find and copy the invite link in Settings → General → Players.

## Non-goals

- No "finish setting up" checklist, badge, or reminders for skipped steps (owner: "skipped steps are forgotten, and editable in the settings").
- No per-traveler flight/travel entry in the wizard — that stays on the trip home (owner decision 2026-10-01).
- No join approval queue — invite link joins instantly (my call, owner did not object).
- No new course-data source; use whatever course picker exists today.
- No database changes beyond the trip join link (below) and remembering "has seen the tour / tips".
- No side games (skins, predictions, match picks) in the wizard.

## Anti-goals (would be a failure even if it works)

- The tutorial or coach marks showing up every time, or blocking someone who just wants to make a trip.
- Screens that jump or resize as answers change (fixed-layout rule).
- A long scrolling form dressed up as a wizard.

## Constraints

- Keep the existing create look: cream top, fixed-height maroon sheet rising from the bottom, Back + Next pinned at the bottom, no step number/name in the cream (owner, 2026-10-01). Maroon-900 fade, curved sheet with depth.
- Mobile-first (V2.0 is phone-only iOS/Android via Capacitor); must also render in the web dev environment.
- Build on the current wizard code in `app/golf-trips/new/*`, `SetupSheet`, `SetupStepForm`, the sessionStorage draft, and the existing `create_golf_trip` save path. There is uncommitted in-progress work on these files (`TripDatesField`, `TripWizardArt`, `DateRangePicker`, etc.) — owner said build on top of it; don't revert or stash it.
- Each sub-state of a screen goes into the `/dev` simulator as a Conditional on that page (approved pattern).
- No SQL is run by Claude; any SQL file is written and handed to the owner.

## The flow (as decided)

1. **Welcome** — "Welcome to Golf Trips" + **Get Started**. (Replaces/merges the current "Let's go golfing" page.)
2. **Learn or skip** *(first time only)* — a phone drawn inside the screen, ~75% of the height, showing real app pages with sample data. The inner phone has **3 basic swipe pages**. Its bottom ~20% fades into a strong **Learn about Golf Trips** button with a smaller **Skip for now** under it — designed to pull people toward Learn.
3. **Full tutorial** *(only if they tap Learn)* — 5–7 slides, same phone-in-phone look, each showing a real page we've built (with sample data) plus a gold outline + short callout explaining one feature. Ends where Skip goes.
4. **Trip name + destination.** (Name required; destination uses existing Google Places search.)
5. **Trip dates + "How's everyone getting there?"** — one group answer (Flying / Driving / Mix). Each person's own flights are added on trip home later.
6. **How many people? Are you all competing?** — Yes / No / Skip for now.
   - **6b. Competition mini-wizard** *(only on Yes)* — team structure: 2 Teams, Pairs, individual, etc. Skippable.
7. **Where are you playing?** — number of rounds, then a course for each round. Skippable.
8. **Formats** — competition formats only (Stroke Play, Best Ball, Scramble, Match Play, etc.). **Shown only if they said Yes to competing** in step 6. Offers a few **suggested setups** to pick from, plus **Make your own**, which lets them piece rounds/formats together or leave it for later. Skippable. (Comes after courses so formats can be per round.) Side games (skins, predictions) are **not** part of Trip Builder; the tutorial explains them instead.
9. **Lodging** — *my suggestion, kept because the current wizard has it; owner hasn't cut it.* Skippable. Last step's button is **Create Trip**.
10. **Your trip is ready** — same look as the "Email confirmed" screen (`AuthLinkResultPreview`): dark maroon, gold M that draws itself with the burst, centred title, one gold button **Invite your crew**.
11. **Invite pop-up** — the trip's link with Copy / Share / Done (reuse/restyle `GolfTripInviteDialog`). **Share opens the phone's own share sheet** (Apple / Google native UI, so it can go by text, email, etc.; Web Share API on web). Done → trip home.

### The trip invite link (owner decision 2026-11-03)
- Each trip gets **one shareable link**. Tapping it opens a **simple "Join this trip" page**: shows the trip (name, destination, dates, organizer), then lets them **sign up** (or sign in if they have an account) and join the trip in one go.
- This page does not exist yet and is part of this work. Keep it minimal: reuse the existing sign-up/sign-in flow, then drop them on the trip home.
- Joining is instant (no approval). The organizer can remove people, and gets a **Reset link** option on the Players page so an old link stops working.
- Today the link only opens the trip page and joining needs per-person invites (`golf_trip_invitations.sql`). A trip-wide join token + join function is needed: Claude writes a new SQL file; **the owner runs it** in Supabase.
12. **Trip home + coach marks** *(first visit only)* — about 4 bubbles: settings wheel ("anything you skipped lives here"), Players + invite link, Golf tab / schedule, where scores get entered.

### Settings changes
- **Players** moves from Settings → Organizer → Overview to **Settings → General**, visible to every member.
- The **invite link with a Copy button sits at the very top** of the Players page, for everyone.
- Only the organizer can edit anything on Players (remove people, roles, etc.); others see it read-only.
- Settings also gets **Watch the Golf Trips tour** (replays steps 2–3) and **Show tips again** (re-arms the coach marks).

## Decided by the owner

Flow order steps 1–8 and 10–12; phone-in-phone Learn screen with fade into buttons; 3 swipes then optional 5–7 slide tutorial; tour is first-time only and replayable from Settings; coach marks (not toasts) for "where things are"; skipped steps live in Settings with no checklist; finish screen looks like Email confirmed; invite pop-up after create; Players in General with link at top, organizer-only edits; build on the in-progress wizard work; invite link opens a simple join-this-trip sign-up page, shared through the phone's native share sheet; Formats = competition formats with suggested setups + Make your own, side games excluded (explained in the tutorial).

## My calls (owner can override)

- Courses before Formats.
- Lodging kept as step 9.
- Travel question is a group answer only.
- Invite link joins instantly; organizer can remove people.
- Tour and coach marks use sample trip data ("Bandon 2027"-style), not the user's trip.
- Coach marks: show once, ~4 stops, "Show tips again" in Settings.
- Finish button label "Invite your crew".
- **Required fields:** trip name, destination and dates are required (the database needs them: `golf_trips.destination/start_date/end_date` are NOT NULL). Only the travel question on step 5 is skippable; everything from step 6 on is skippable.
- **Coach marks for everyone:** the organizer gets the "anything you skipped lives here" wording; members get member wording (e.g. "Your invite link is in Players"). "Seen" is once per account, not per trip. "Show tips again" shows for everyone.
- **Web/dev first:** this build works in the web app and dev simulator. Making create work inside the Capacitor native app (the known cookie/same-origin API blocker) is a separate piece of work, not part of Trip Builder.

## Left to the builder

- Exactly which app pages appear in the 3 swipes and the 5–7 slides, and their callout text (owner: "figure that out later"; pick from Home, Leaderboard, Scoring, Settings, Chat). Owner will refine after the first build.
- How "seen the tour" / "seen the tips" is remembered (per account is preferred so it follows them to a new phone; local storage is acceptable for the first version if that avoids SQL).
- Competition mini-wizard detail beyond team structure — map onto the competition settings that already exist (`GolfTripCompetition`, Team options "2 Teams, Pairs, 3-Ball, 4-Ball").
- Flights, Transportation and Review are out of Trip Builder (owner 2026-11-03): Review is not needed; flights and transportation will live in the Itinerary later.
- How the app pages are rendered inside the inner phone (live components with fixture data vs. scaled screenshots).
- The suggested format setups: owner thinks some already exist — look first; if none are found, propose 3–4 common trip setups and show the owner.
- Build order / phases.

## Open items

- None blocking. Revisit tutorial content and polish after the first build.

## Updates 2026-11-03 (after plan review)

- **Invite links last 30 minutes.** After that the link stops working; copying or sharing from Settings always hands out a fresh one (a link with less than 5 minutes left is replaced). The join page says the link expired and to ask for a new one.
- **Formats screen** (competing = Yes only), top to bottom: a **picture titled "The Maroon"** (no story; placeholder until the owner sends the photo) → **The Maroon Style** showcase with the tag "8 rounds · 3 Fourball · 3 Singles · 2 Alt Shot" → the **Both** card (picking it creates The Maroon Style setup: individual + team match play; rounds in order Fourball, Alt Shot, Fourball, Singles, Alt Shot, Fourball, Singles, Singles) → **Individual** and **Team** side by side → **Create Your Own** (mix and match per round).
- **Flights, Transportation, Review** are removed from Trip Builder.
