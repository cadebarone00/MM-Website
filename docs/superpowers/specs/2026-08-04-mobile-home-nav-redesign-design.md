# Mobile Home & Navigation Redesign — Design Spec

## Vision

Clean up the mobile (`<lg`) experience so it reads like a native sports-app
shell — Masters-app-style bottom nav, a compact top header, a horizontally
scrollable leaderboard strip right under the hero, and a single-panel
Highlights/Teams/Schedule toggle in place of today's cramped two-column
block. Desktop is unchanged except where explicitly noted. This round is
pure frontend/layout — no new backend, no real authentication. The
Sign Up/Login/Log Out buttons introduced here are styled placeholders only;
wiring them to real accounts is a separate future spec (see "Explicitly out
of scope").

## Header (mobile only, `<lg`)

Single row, flush to the very top of the viewport (no gap above it,
matching the bottom nav's flush-to-bottom treatment). Three zones:

- **Left:** Instagram icon, then immediately to its right either the
  countdown text (idle) or "Live Now" (swapped in during a live
  tournament) — same swap condition `Header.tsx` already uses
  (`isLiveNow()`), just relocated into this single row.
- **Center:** the Maroon Masters wordmark, horizontally centered,
  bottom-aligned within the row.
- **Right:** the account/person icon — now always rendered (logged in or
  not), always tappable, opens the new Account menu (below).

The "Defending Champions" info bar (`Header.tsx:110-127`) is removed
entirely on mobile, regardless of live/idle state — its "Live Now" copy
moves into the header's left zone instead. Desktop header is untouched.

## Bottom nav (`MobileTabBar`)

Stays fixed flush to the bottom edge exactly as today (no change to its
position). Icon/label content shrinks slightly and top-aligns within the
bar (padding added above the icons instead of vertically centering them),
so the tappable row reads as clearly separate from the phone's bottom
edge/home-indicator — without moving or floating the bar itself.

## Two separate full-screen menus

These are independent overlays, each triggered from a different place,
never merged:

- **More** (bottom-nav "More" button, existing `MorePanel`) — unchanged
  trigger and full-screen-on-mobile shape, maroon background/white text.
  Holds general site pages outside the 3 main tabs (Home/Leaderboard/Teams):
  today's `Schedule` and `History`, plus room for future misc pages. If a
  **player** account is signed in (`useAccountSession().kind === "player"`),
  a `Portal` item appears as the last row, linking to `/portal`. Hidden for
  plain user accounts and when signed out.
- **Account menu** (new, top-right person icon) — full-screen overlay,
  personal to the signed-in account holder:
  - "Welcome" (signed out) or "Welcome, {first name}" (signed in) at the
    top.
  - Vertical list: My Team, Fantasy, The MM Vault, Merchandise, Settings.
  - Thin divider.
  - Sponsorship Opportunities, Learn More About the Players.
  - Bottom row: **Sign Up | Login** side by side when signed out, or a
    single full-width **Log Out** button when signed in. None of these
    buttons perform real auth yet (see out-of-scope) — Sign Up/Login/Log
    Out are visually complete but inert (or link to a "coming soon" stub)
    until the accounts spec lands.

## Hero (mobile only)

`VideoHero`'s `<video>` swaps to a static placeholder image on mobile;
desktop keeps the video exactly as today. Placeholder image:
`/teams/maroon/collage/02-swing-pose.jpg`.

## New leaderboard strip (mobile home, under hero)

A horizontally scrollable strip directly under the hero, reusing the
existing `LeaderboardStrip` component (avatar + score badge top-right,
"T5 Barone"-style position+lastname label). Today this only renders during
a live tournament window (`LiveLeaderboardStripSection`); this instance
always renders on the home screen instead, seeded with **2026** data
(`latestCompleted`) as the placeholder so the layout is visibly populated,
and swapping to live 2027 data automatically once the live feed has
entries — same live-else-fallback pattern the quick cards already use.
Once a tournament completes, its data stays up as the fallback (matching
how `latestCompleted` already behaves elsewhere on the site), so this
strip won't go blank between tournaments.

## Highlights / Teams / Schedule toggle (mobile home)

Replaces the entire current two-column block (`HighlightsRail` + the 3
stacked quick cards) on mobile only — desktop keeps today's 2-column
layout unchanged. A 3-way toggle, defaulting to **Highlights**, each tab
filling the section edge-to-edge (no columns):

- **Highlights** — today's `HighlightsRail` content/behavior (including
  its "More Highlights" full-screen expansion), just full-width now
  instead of the narrow left column.
- **Teams** — condensed team score (e.g. "17–16", from `maroonPts`/
  `whitePts`) plus a summary of matches, mirroring the Teams tab's match
  list in miniature (adapted from `TeamMatchesBoard`/`LeaderboardBoard`'s
  team view).
- **Schedule** — the current round/day/session info, adapted from
  `QuickScheduleCard`'s existing logic, condensed to full width.

## Media section

No layout change to `SocialsSection`. Clicking a reel or a video now shows
a plain `window.confirm()` ("You're leaving The Maroon Masters — continue
to Instagram?" / "...to view all videos?") before navigating out. Cancel
keeps the user on the page.

## Footer

`Footer` is hidden entirely below `lg` — the bottom nav is the mobile
footer and is always visible, so there's no separate footer to render on
mobile. Desktop `Footer` unchanged.

## New placeholder pages

Seven empty stub pages (title + "Coming soon"), just enough to make the
Account menu's links real destinations instead of dead ends:
`/my-team`, `/fantasy`, `/vault`, `/merchandise`, `/settings`,
`/sponsorship`, `/players` (Learn About the Players). No content beyond a
heading and placeholder copy — what each page actually contains is future
work.

## Explicitly out of scope

- **The accounts system.** Sign-up/login pages, Supabase setup, session
  creation, the player-invite/approval flow (Tiger approving "I am a
  Player" requests), and email notifications to Tiger. This spec only
  builds the inert UI shells (Sign Up/Login/Log Out buttons, the Account
  menu itself) that a future accounts spec will wire up.
- **`/portal`.** Does not exist yet and is not built in this round. The
  `More` menu's conditional `Portal` link is added now (gated on
  `useAccountSession`, which already exists), but the destination page
  itself is out of scope here.
- **Real content for the 7 placeholder pages** — stubs only.
- Any change to `/leaderboard`, `/teams`, `/schedule`, `/history` pages
  themselves — this spec only touches the home page, header, and nav
  shell.
- Any change to the desktop layout beyond what's explicitly called out
  above (header, hero, and the Highlights/Teams/Schedule section are all
  mobile-only changes; desktop keeps its current 2-column home layout,
  video hero, and header).
