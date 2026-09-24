# Broadcast Visual Redesign — Round 1: TV Scenes

## Status

**Design only — nothing in this document has been built.** Per `CLAUDE.md`
Rule 2: no code until this file is reviewed and approved.

This is Round 1 of a two-round visual redesign, decided 2026-09-04 by
decomposing a broader "make the leaderboard look like a real TV backdrop"
request. **Round 1 (this document):** the `/broadcast` scene components.
**Round 2 (separate, later spec):** the public site's `/leaderboard` pages.
Explicitly out of scope for both rounds: the home page's leaderboard teaser
cards (`QuickLeaderboardCard`, `LiveLeaderboardStripSection`) — left as-is
until/unless the home page itself is redesigned.

Direction was confirmed via the visual-companion browser tool: two mockups
were shown (a "stage-lit/cinematic" full-bleed vignette treatment, and a
"crisp graphic blocks" hard-edged treatment); the user chose the stage-lit
direction, confirmed it holds up when applied to Match Play's two-sided
layout, and confirmed the same look should apply everywhere in scope (not a
lighter-touch public-site version).

## Goal

Replace the current "cream card floating on a background" look across every
`/broadcast` scene and broadcast-adjacent overlay with a full-bleed, dark,
stage-lit broadcast-graphics treatment — the frame itself is the TV graphic,
not a card sitting on top of a backdrop. Modeled on modern golf broadcast
packages (Golf Channel / PGA Tour Live): dark canvas, glowing accents, bold
condensed scoreboard typography, real broadcast score-coloring conventions.

## Correction from the approved mockup

The mockup shown during brainstorming used gold to mean "under par." **This
site already has a real, meaningful, site-wide score-color convention** —
`--color-score-under` (#c8102e, red), `--color-score-even` (#1e4d3a, dark
green), `--color-score-over` (#1a1513, near-black) — used by
`components/ui/ScoreBadge.tsx` everywhere else scores appear (scorecards,
tables, hole detail). Introducing a second, conflicting meaning for gold
specifically inside broadcast scenes would break that consistency for no
reason. **This round keeps red/green/near-black for score values everywhere
scores are rendered — the same colors as every other page on the site** —
and demotes gold to a pure accent color (dividers, watermark, leader-row
glow, live-indicator ring) with no score meaning attached. This is also more
authentic to the brief: red-for-under-par is the actual convention real golf
broadcasts (PGA Tour, Golf Channel) use, not a stylization.

## Visual System (applies to every component below)

**Color** — no new tokens; every value below already exists in
`app/globals.css`:
- Canvas: a radial vignette from `--color-maroon-700` (`#500001`) at the
  center-top toward `--color-maroon-900` (`#240001`) at the edges, darkening
  further toward `#0d0000`-equivalent (i.e. `--color-maroon-900` layered
  under a black-tinted radial falloff — implemented as a CSS
  `radial-gradient`, not a new color token).
- Score values: `--color-score-under` / `--color-score-even` /
  `--color-score-over` via `ScoreBadge` (reused component, not reimplemented
  — see below).
- Team markers: `--color-maroon-500` (Team Maroon dot, with a subtle glow
  via `box-shadow`), `--color-ink-100`/`--color-cream-100`-range (Team White
  dot — true white is invisible on a dark background too, so White's marker
  becomes a light warm off-white, not `#fff`).
- Accent/prestige (not score meaning): `--color-gold-300`/`--color-gold-400`
  for hairline dividers, the leader-row glow, watermark stroke, and the
  "LIVE"/"FINAL" status label.
- Body text on dark: `--color-cream-50`/`--color-cream-100` range for names
  and primary text; `--color-ink-400`-range for secondary/muted text (thru
  count, team labels).

**Type** — no new fonts; every family already loads in this app
(`--font-serif` / Spectral, `--font-sans` + `--font-condensed` / Barlow +
Barlow Condensed):
- `font-serif` italic stays the wordmark treatment ("The Maroon Masters"),
  now rendered small and restrained (an eyebrow, not the dominant element —
  the watermark carries the brand mark at scale instead, see Signature).
- `font-condensed` uppercase, wide tracking stays every label/eyebrow
  ("Individual Leaderboard", "Live", "Round 3", team names) — pushed to
  larger scale and heavier weight than today for the new full-bleed canvas.
- Score values keep `ScoreBadge`'s existing `font-score` class untouched.

**Layout/structure:**
- No card, no `rounded-2xl`/`shadow-2xl` container. Each scene's root is a
  full-viewport (`min-h-screen w-full`) dark canvas; content sits directly
  on it with generous padding (`px-10 py-10`-equivalent, scaled by scene).
- A hairline `--color-gold-400`/30%-opacity divider replaces the current
  solid maroon-900 header bar — the header becomes part of the dark canvas,
  not a separate colored strip.
- Rows lose their alternating cream/cream-100 background banding (that
  device only made sense on a light card) — replaced by a thin
  `border-bottom` hairline (`rgba(255,255,255,.06)`-equivalent) between
  rows, consistent with real broadcast lower-third row dividers.

**Signature element** (the one thing every scene shares, carried over from
the approved mockup): a large, low-opacity, outline-only "MM" or full
wordmark watermark anchored to one corner of the frame — an etched-glass
effect (`-webkit-text-stroke` at ~10-15% gold opacity, no fill), present on
every scene so the whole `/broadcast` experience reads as one consistent
"set" rather than a series of unrelated screens.

## Component-by-Component Changes

### `components/broadcast/scenes/IndividualLeaderboardScene.tsx`

- Root: full-bleed vignette canvas (no card, no `bg-gradient-maroon` +
  centered-card wrapper).
- Watermark anchored bottom-right, behind the row list (`z-index` below
  content).
- Header: "Individual Leaderboard" eyebrow (`font-condensed`, larger than
  today) + "Live"/"Final" status on a hairline-divided row, no colored
  header bar.
- Rows: rank number (`font-condensed`, bold, muted `--color-ink-400`-range,
  not maroon-600 — it's no longer sitting on cream), team dot (maroon glow /
  off-white), player name (`font-sans` bold uppercase, cream-toned), then
  `<ScoreBadge value={r.toPar} size="lg" />` in place of the current
  hand-rolled `pillBg`/`scoreLabel` pill — **reuses the real component
  instead of a second implementation of the same red/green/black logic**,
  fixing the duplication this design already flagged as a risk in an
  earlier round.
- Leader ticker (bottom trophy-gradient bar): replaced by a subtle gold-glow
  highlight on the leader's own row (`background:
  linear-gradient(90deg, gold-at-8%-opacity, transparent)` behind that one
  row) rather than a separate colored bar — one graphic device (the glow),
  reused for "this row matters" rather than two different ones (pill +
  separate ticker bar).
- Empty state ("No scores posted yet…") keeps its message, restyled for the
  dark canvas (cream-toned text, no cream background block).

### `components/broadcast/scenes/MatchPlayScene.tsx`

- Same canvas/watermark/header treatment as above.
- Rows: two-sided layout unchanged structurally (rank, Maroon side, status,
  White side) but restyled: team dots instead of the current colored
  round-dot-only-on-name-row, status column (`statusLabel()` output — "2
  UP", "3 & 2", "AS", "Final") in `font-condensed` bold with the same
  gold-glow treatment the mockup showed for live/notable status, dimmed
  (muted ink tone, no glow) once `state === "Final"`.
- Footer team-total bar (currently `bg-gradient-trophy`): replaced by the
  same hairline-divider + bold `font-condensed` totals directly on the dark
  canvas, Maroon total in `--color-maroon-400`-range (readable on dark,
  distinct from body cream), White total in cream-toned text — no separate
  colored bar.
- `statusLabel()`'s existing tie-handling ("Halved"/"All Square") is
  unaffected by this restyle — purely a visual pass on an already-correct
  function, not a logic change.

### `components/broadcast/scenes/HoldingScene.tsx`

- Already dark (`bg-[color:var(--color-maroon-900)]`) — smallest change of
  the three. Gains the same radial vignette (currently flat maroon-900) and
  the watermark, for consistency with the other two scenes. Wordmark/venue/
  date text treatment stays essentially as-is (it already matches the new
  system's restrained-serif-eyebrow + bold display-text pattern).

### `components/broadcast/EventOverlay.tsx` / `EventTakeover.tsx` (from the prior round)

- Built last round using the *old* cream-card visual language
  (`bg-[color:var(--color-maroon-900)]` pill for `EventOverlay`;
  cream-card-with-trophy-footer for `EventTakeover`). Restyled to match this
  round's system so nothing looks visually inconsistent once the scenes
  themselves change: `EventOverlay`'s lower-third banner gets the hairline/
  gold-glow treatment instead of a solid maroon pill; `EventTakeover`'s
  full-screen card becomes the same canvas-plus-watermark treatment as the
  scenes, with `matchResultLabel()`'s text in large `font-condensed` bold
  rather than inside a cream card. No logic changes — `matchResultLabel`,
  `closedMarginLabel`, `teamLabel`, `marginLabel` (Phase 4a, already shipped
  and correct) are reused exactly as they are; only the JSX/class names
  change.

### `components/broadcast/OverlayLayer.tsx` (host-manual announcement, Phase 1)

- Same lower-third hairline/gold-glow treatment as `EventOverlay`, for the
  same "everything on `/broadcast` is one consistent set" reason. No
  behavior change (still reads `overlayText`/`overlayExpiresAt` off
  `broadcast_state`, still self-dismisses).

## Explicitly Unchanged

- All data-fetching, Realtime subscriptions, rotation timing, the event
  queue, and every hook built in prior rounds (`useAutoScene`,
  `useLiveBroadcastData`, `useLiveBroadcastState`, `useBroadcastQueue`) —
  this round touches **JSX and Tailwind classes only**, never the
  `lib/broadcast/*` logic layer.
- `statusLabel()`, `matchResultLabel()`, `closedMarginLabel()`, `teamLabel()`,
  `marginLabel()` — all correct, all reused as-is.
- `ScoreBadge`, `--color-score-*` tokens — reused, not modified.

## Testing Strategy

Purely presentational change to already-tested components — no new logic,
so no new unit tests. Verification is `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and a manual visual walkthrough: open `/broadcast`, confirm
all three scenes render on the dark canvas with the watermark and correct
score coloring; trigger a `MATCH_STATE_CHANGED` overlay and a `MATCH_WON`/
`ROUND_FINAL` takeover (or use `?preview=1&scene=...`) and confirm they
match the new system; post a host announcement from Broadcast Controls and
confirm `OverlayLayer` matches too.

## Acceptance Criteria

1. All three scenes (`IndividualLeaderboardScene`, `MatchPlayScene`,
   `HoldingScene`) render full-bleed on a dark vignette canvas with no
   cream card, and share the same watermark treatment.
2. Every place a to-par score renders uses `ScoreBadge` with the existing
   red/green/near-black convention — verified identical to how scores
   render elsewhere on the site (e.g. a scorecard), not a new color scheme.
3. `EventOverlay`, `EventTakeover`, and `OverlayLayer` visually match the
   redesigned scenes — no component looks like it belongs to the old
   cream-card system once this ships.
4. No change to `npm test` results, `tsc`, or any `lib/broadcast/*` file.

## Explicitly Out of Scope (this round)

The public site's `/leaderboard` pages (Round 2, separate spec). The home
page's leaderboard teaser cards (deferred indefinitely per this session's
scope decision). Any new event kinds, host controls, or data-layer changes.
