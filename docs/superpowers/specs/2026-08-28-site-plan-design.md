# Maroon Masters — Site Plan

## Purpose

This is the product/UX plan for the whole platform under the new architecture
(`docs/superpowers/specs/2026-08-28-native-live-platform-design.md`): what
exists under each of the three access tiers, how they connect, and how a
single score entry turns into a dozen things updating at once, live. It's the
shared reference every later phase's spec gets written against, so The
Website, The Player Portal, and The Tiger Center feel like one product, not
three different apps stitched together — which is exactly the seam that made
the old MM-Scorekeeper feel separate from the site in the first place.

## The three tiers, at a glance

| | Who | Gets |
|---|---|---|
| **Fan** | Anyone who signs up | The Website only |
| **Player** | Signed up + claimed a roster slot | The Website **and** The Player Portal (fork screen switches between them) |
| **Tiger** | The host account | The Tiger Center only — no fork screen, no Website access, straight there on login |

---

## The Website

Everything public already lives here — this plan doesn't rebuild it, it
defines how it starts *reacting* to live data instead of sitting static
between tournaments. Current structure, kept:

- **Home** — hero, highlights, quick cards
- **Leaderboard** — team + individual, per year
- **Teams** — rosters, rankings, career stats
- **History** — every past edition
- **Schedule** — match schedule, per year
- **Wagers** — MM Coins markets (team futures, player futures, matches, fourballs, props, portfolio)
- **Fantasy**, **Merchandise**, **Sponsorship**, **The Vault**, **My Team**, **Settings** — existing account-menu pages
- Bottom tabs (mobile): Home / Leaderboard / Teams / More — unchanged

**What's new here isn't pages, it's life.** During a live tournament:
- The leaderboard strip and full leaderboard update the instant a confirmed
  score lands — no refresh, no delay.
- A player's public scorecard page fills in hole-by-hole as their round
  happens, not after.
- Match status (Scheduled → Live → Final, "Thru 7") reflects real state
  in real time — this is the `orchestration.py`-ported logic from the
  architecture spec surfacing directly in the UI fans already look at.
- Career stats (`/teams/stats`) quietly grow the moment a tournament wraps —
  no one has to publish anything.

Nothing about Wagers/Fantasy's own rules change here — they already read
whatever the current live data source is; they just start reading a faster,
more accurate one.

## The Player Portal

Reached via `/portal` after a player logs in and picks "Player Portal" at the
fork screen (fork screen also offers "The Website"). Four areas:

1. **Home / Dashboard** — a snapshot on arrival: today's round if one's live
   or upcoming, current standing, quick links into the other three areas.
   This is the natural home for "your match right now" the way MM-Scorekeeper's
   player app opened straight into.
2. **My Profile** — full self-service editing of everything in
   `PlayerProfile` (bio, hometown, handicap, socials, photo, all of it) —
   this is the piece that's been completely missing since the old app was
   disconnected, and the thing you originally asked to get back. Edits a
   player submits here go to Tiger for a quick approve/reject (matches the
   old profile-edit-review flow) before they go live on their public page.
3. **My Scorecard / Live Scoring** — during a live round: enter your own
   hole scores, see your partner's, confirm each other's before a hole locks
   in. Outside a live round: your scorecards from past rounds this trip.
4. **My Stats** — personal career numbers, same data that feeds the public
   Stats tab, just framed around "you" instead of the whole field.

## The Tiger Center

Reached only by the host account, immediately on login — "the game
controller." Five areas, matching what MM-Scorekeeper's Admin already did,
carried forward:

1. **Dashboard** — tournament-wide status at a glance: which round is live,
   who hasn't submitted, anything needing attention (pending profile edits,
   unresolved score conflicts).
2. **Pairings & Rounds** — set matchups per round (Maroon vs. White, format,
   tee times), start a round (locks it open for scoring), reset one if
   needed. This is the piece that actually drives what players see in their
   Portal and what fans see on The Website — the top of the whole chain.
3. **Players** — invite new players, remove a never-scored player, review
   and approve/reject submitted profile edits.
4. **Courses** — the shared course library (see architecture spec): add a
   course once, reuse it any year; set which course a given round is played
   on.
5. **Live Score Override** — direct hole-by-hole edit access for any player's
   any round, for when something needs a correction outside the normal
   player-confirms-partner flow.

## The moment a score becomes public — one input, everywhere at once

This is the core interaction the whole platform is built around, worth
spelling out end to end as the example you gave:

1. Drew makes a 3 on hole 4. He enters it in **My Scorecard** (Player Portal).
2. His round partner sees Drew's entry pending and confirms it matches their
   own count.
3. The instant it's confirmed, Supabase pushes the change out — no polling,
   no delay (this is what Realtime buys, spelled out in the architecture spec).
4. Everything watching that data updates on its own: the public leaderboard's
   position for Drew, his live scorecard page, the match's Thru-N and
   win/loss margin, Tiger Center's live view, and — once his round ends —
   his career stats.

One input. Everything downstream reacts. Nothing has a "publish" button
anywhere in this chain.

## Visual direction

The old MM-Scorekeeper had its own visual language, separate from the site's.
Under this plan there's one design system: Player Portal and Tiger Center
use the site's existing maroon/white palette, typography, and component
patterns (`components/portal/`, `components/ui/`) — not ported wholesale from
MM-Scorekeeper's look. MM-Scorekeeper's screens are a *functional* reference
(what fields exist, what actions are needed) — the actual look gets designed
fresh, matching the rest of the site, when each area's own spec is written.
That's a deliberate follow-up step (the `frontend-design` pass), not decided
screen-by-screen in this document.

## Suggested build order

Not a commitment, a starting recommendation for when implementation planning
begins:

1. **Data foundation** — the Supabase schema + TypeScript scoring/orchestration
   port, with nothing user-facing yet (this is what makes everything else
   possible).
2. **Tiger Center: Pairings & Rounds** — Tiger needs to be able to set up a
   round before anyone can score one.
3. **Player Portal: My Scorecard / Live Scoring** — the actual live-input
   loop, the highest-value piece.
4. **The Website: live reactivity** — leaderboard/scorecard/stats start
   reading the new source instead of the Sheet.
5. **Player Portal: My Profile** — profile self-editing, independent of the
   scoring loop, can land whenever.
6. **Tiger Center: Players, Courses, Live Score Override** — the remaining
   admin tools.

Each of these becomes its own spec → plan → build cycle when its turn comes,
same process as everything so far.
