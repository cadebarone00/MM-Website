# Navigation Restructure — Design Spec

## Vision

Replace the hamburger-menu navigation in `components/Header.tsx` with a
persistent, always-visible tab bar — bottom-fixed on mobile, top-fixed
(as today) on desktop — built around a simplified 4-item set instead of
today's 5 flat links.

## Nav items

`Home`, `Leaderboard`, `Teams`, `More` — replacing today's flat `Home /
Leaderboard / Teams / Schedule / History` (`Header.tsx:12-18`). `Schedule`
and `History` move into the `More` panel (below); they are not removed as
destinations, just relocated.

## Mobile (fixed bottom bar)

- Fixed to the bottom of the viewport, maroon background (`#500001`),
  white text/icons — same palette as the rest of the app's maroon
  surfaces.
- 4 tabs: Home, Leaderboard, Teams, More, each an icon + label. Active tab
  visually distinguished (e.g. brighter/filled icon or an underline —
  implementation detail for the plan, not a fixed requirement here).
- Tapping `More` opens a **full-screen** menu (overlay/sheet covering the
  whole viewport), containing `Schedule` and `History` for now — room
  left for more items later, not building anything beyond those two in
  this project.
- Replaces the hamburger button and its dropdown panel entirely on mobile
  viewports — the hamburger UI is removed, not just hidden.

## Desktop (top bar, unchanged position)

- Stays at the top of the page, in its current position — desktop does
  **not** move to a bottom bar.
- Same simplified 4-item set: Home, Leaderboard, Teams, More.
- `More` opens a panel that slides in from the **right edge**, **25% of
  the viewport width**, full height (top to bottom) — a drawer, not a
  dropdown — containing the same `Schedule` and `History` items as the
  mobile version.

## Navigation and back behavior

Every tab is a direct link to its destination (no nested confirmation
steps). The `More` panel/sheet closes via its own explicit close
affordance and (on mobile) swipe-to-dismiss where the platform supports
it, consistent with how back-navigation is expected to work everywhere
else in this project's related work.

## Explicitly out of scope

- Any additional items in the `More` panel beyond `Schedule` and
  `History` — the user described further ideas as "not building anything
  beyond those two yet."
- Any change to what `Home`, `Leaderboard`, or `Teams` link to — same
  destinations as today's existing nav entries.
- Changes to the player portal's own navigation (`PortalNav` in
  MM-Scorekeeper) — this spec is MM-Website's public site header only.
