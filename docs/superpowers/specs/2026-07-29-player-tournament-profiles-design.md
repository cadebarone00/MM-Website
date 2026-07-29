# Player Tournament Profiles — Design Spec

## Vision

Every player already has a bio profile (Teams page, `/teams/[player]` and
`/teams/stats/players/[player]`) — static info controlled by their account
data. This project adds a second, distinct profile: the **Player
Tournament Profile**, a live/historical scorecard page (round selector,
hole-by-hole strip, stats) redesigned to match a modern golf-app look, made
reachable from everywhere a player's identity shows up in tournament
context — the leaderboard, match displays, and a new horizontal
leaderboard strip on both the website's home page and the Scorekeeper
player portal.

**These are two separate, differentiated profiles.** The Tournament
Profile reuses and redesigns the *existing* scorecard route
(`app/leaderboard/[slug]/players/[player]/page.tsx`) — it is not a new
route from scratch, but it is a new *product surface*: a different URL,
different purpose (this tournament's live performance), and different
content from the bio profile. The bio profile's own page and content are
**not modified** by this project, except that the Tournament Profile gains
one outbound "Full Bio →" link pointing to it.

## 1. Player Tournament Profile page (redesign)

Applies to the existing live path (`LivePlayerScorecard` →
`PlayerScorecardView`) and static past-tournament path in
`app/leaderboard/[slug]/players/[player]/page.tsx`, plus the round/hole
sub-route. Both branches get the same new visual structure; the
live/static data-source split stays exactly as it works today.

**Header:**
- Back button (navigates to the leaderboard the player came from).
- Avatar (larger than today's `size="lg"`/60px header avatar — bump to a
  new hero size, e.g. 96–100px, sized between the existing `lg` and `xl`
  tokens or a new one added to `components/ui/Avatar.tsx`).
- Player name.
- "Watch Live" badge — shown only when the tournament is currently live
  (reuse the existing `isLiveNow()`-style status check already used
  elsewhere in the leaderboard code; hidden entirely for past-year static
  pages).
- "Official Score Card" eyebrow label.
- Bio blurb: the player's existing `PlayerProfile.bio` field (already
  authored per player, no new content work), truncated to a few lines,
  ending in a "Full Bio →" link to their existing `/teams/[player]` page.

**Stat row:** Position, Total (to par), Thru — sourced from the same
standings data already computed for the individual leaderboard
(`IndividualStanding`/live-feed payload for the live case, static
tournament data for past years).

**Round selector:** keep today's dropdown interaction
(`PlayerScorecardView`'s `<select>`), restyled to match the new visual
language — no behavior change, just a visual pass.

**Hole-by-hole strip (new):** a horizontally-laid-out row of 18 circular
hole markers, current/most-recently-played hole highlighted, modeled
visually on the circular hole-picker already used in Scorekeeper's host
tools (`HoleEntryView.tsx`) — maroon fill for the active hole, muted fill
for completed holes, plain outline for unplayed holes. Tapping a hole
navigates to the existing hole-detail route
(`[round]/[hole]`), the same destination today's per-hole score badges
already link to (`linkHoles` behavior in `ScorecardRow`) — this is a new
visual entry point to an existing destination, not new routing.

**Video section:** a styled "coming soon" placeholder below the hole
strip, tied to the selected round (not a specific hole) — e.g. "Round
highlights coming soon." No real video wiring in this project; matches
the existing hole-detail page's own placeholder philosophy
(`ShotVideoPanel`). Real video is an explicitly separate future project.

The hole-detail page itself (`[round]/[hole]/page.tsx` /
`LiveHoleDetail`) is untouched by this spec beyond gaining the new
entry point described above — its own placeholder video panel and "Hole
Overview" placeholder stay as they are.

## 2. Horizontal leaderboard scroll strip (new component)

A new, shared-in-spirit (implemented per-app, see below) component
showing every player in the individual leaderboard, ranked left to right
(current leader first), horizontally scrollable via native scroll
(`overflow-x-auto` — works for touch swipe on mobile and trackpad/shift-
scroll on desktop; no custom carousel JS).

**Each card:** circular avatar photo, a small rank/score badge overlaid
on the avatar (e.g. "-13", "T2"), name and rank label beneath (e.g. "1.
MOLINARI", "T2. KOEPKA") — visually adapted from the reference image to
this app's maroon/gold palette instead of red. Tapping a card navigates
to that player's Tournament Profile (section 1).

**Placement — MM-Website:** directly below `VideoHero` on the home page
(`app/page.tsx`), above the rest of `HomeDashboard`. Data: the same
live-leaderboard data source already powering
`/leaderboard/[slug]` (`useLiveTournament`). **Hidden entirely** when
there is no live/current tournament (off-season) rather than rendering an
empty strip.

**Placement — MM-Scorekeeper player portal:** directly below `PortalHero`
in `PlayerDashboard.tsx`'s main view (the greeting/My Match area shipped
in the prior portal-redesign project). Data: Scorekeeper's own backend
data (`HostData.individualLeaderboard` / equivalent player-facing read),
no cross-app fetch needed for the ranking data itself. Avatar images
reference the live MM-Website domain directly (absolute URL) — no photo
duplication into Scorekeeper, per the earlier decision in this project.
Tapping a card navigates **out** of the portal to the player's Tournament
Profile URL on the website (a normal outbound link, the reverse direction
of the portal's existing "Back To Website" link).

## 3. Entry-point wiring

- **Leaderboard rows** (`LeaderboardRow.tsx` / `LeaderboardTable.tsx`):
  replace today's expand-on-click (chevron rotates, inline scorecard
  drops down, state owned by the caller) with navigation to the Tournament
  Profile page. The whole row becomes a link; the chevron/expand affordance
  is removed since there's no longer an expanded state to show.
- **MatchRow** (`components/match/MatchRow.tsx`): each player's
  avatar+name (both team sides) becomes individually clickable into their
  own Tournament Profile, instead of being purely decorative/non-
  interactive as it is today.

## Explicitly out of scope

- Any change to the Teams bio profile page/route/content, beyond the one
  new outbound "Full Bio →" link added *from* the Tournament Profile.
- Real video wiring (cross-app fetch of Scorekeeper's uploaded shot
  videos) — placeholder only, this round.
- Hole photos ("Hole photos coming soon" on the hole-detail page) — unrelated
  pre-existing placeholder, untouched.
- Any change to MM-Scorekeeper's host-side tools (`HoleEntryView`,
  `EditScoresPanel`) — referenced only as a visual pattern to mirror.
