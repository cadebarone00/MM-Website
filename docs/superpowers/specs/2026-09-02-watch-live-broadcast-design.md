# Watch Live Broadcast — Automated Golf Broadcast System Master Specification

## Status

**Approved 2026-09-04.** All open decisions below are resolved (see §45).
Phase 1 gets its own implementation plan under `docs/superpowers/plans/`,
built the same way every other Tiger Center phase has been (own
worktree/branch, subagent-driven development) — see
[[tiger-center-build-phasing]].

This document was produced by digesting a long-form product brief for an
"Automated Golf Broadcast System" and grounding every architectural choice in
this repository as it exists today (inspected 2026-09-02, `main` branch).
Anything the brief assumed that doesn't fit this codebase's actual
architecture has been adapted, and the reason is called out inline. Anything
that can't be determined from the repo is marked **UNKNOWN — REQUIRES
CONFIRMATION**.

---

## 1. Executive Summary

Add a self-running, TV-style golf broadcast — **Watch Live Broadcast** — that
turns the tournament's existing live data (scores, match state, roster,
eventually shot video) into a continuously playing program at
`/broadcast/[year]`, with no camera operator and no manual step required to
keep it running. It rotates through leaderboard/match-play "scenes"
automatically, updates instantly when a score lands (no refresh), and — from
Phase 5 onward — can be taken over by a host from a dedicated Tiger Center
control screen. It is built entirely as an extension of the stack already
running this site: Next.js Route Handlers, Supabase Postgres + Realtime +
Storage/RLS, no new servers, no new languages, no new hosting.

## 2. Product Vision

A continuously running broadcast, embeddable on the website, full-screened on
a TV or projector, or (later) piped into OBS/YouTube, that *presents*
tournament state the way ESPN/Golf Channel presents a golf event — without a
human directing every cut. It never becomes the source of truth for anything;
it only shows what the existing scoring/match system already knows.

## 3. Goals

- A `/broadcast/[year]` page that runs unattended for hours, rotating
  Individual Leaderboard → Match Play → Current Matches → repeat.
- Live score entry (already real-time via Supabase, see §9) reflected on the
  broadcast within roughly a second, no page refresh.
- An event/queue/priority system so that important moments (a match won, a
  new leader) can interrupt or overlay the rotation without the screen ever
  looking chaotic when several things happen close together.
- A path — not a build requirement yet — to shot video, overlays, a
  soundtrack, a host control room, and eventually a shot tracer and
  OBS/streaming output, without re-architecting what ships first.
- Every automated decision eventually overridable by a host; every host
  action eventually revertible to automatic.

## 4. Non-Goals (for the foreseeable roadmap, not just V1)

- Live camera video / real broadcast production hardware.
- AI-driven highlight detection — this is a **deterministic, configurable
  rules engine**, not a model (per the brief's own instruction, §21).
- Licensed commercial music streaming — the soundtrack (Phase 6, far out) is
  scoped around audio the tournament actually has rights to use.
- Rebuilding scoring, match-play, or leaderboard math inside the broadcast
  layer. It consumes `lib/live/scoring.ts` / `lib/live/orchestration.ts` and
  the existing leaderboard data functions — it never recomputes them.
- Guaranteeing frame-accurate sync across displays in V1 (see §34).

## 5. User Types

| Type | Access | Notes |
|---|---|---|
| **Viewer** | `/broadcast/[year]`, no login | Anyone: website embed, clubhouse TV, projector. Read-only, no controls, no navigation chrome. |
| **Player** | Unaffected by this system | Their score entry in the Player Portal is what *feeds* the broadcast; they have no broadcast-specific UI. |
| **Tiger (host)** | New "Broadcast" area inside Tiger Center (Phase 5), gated by `requireHost()` exactly like every other Tiger Center screen | Can force scenes, manage the queue, trigger graphics, switch Auto/Producer mode. |

## 6. User Experience

**Viewer:** opens a URL, sees a full-bleed 16:9-oriented program with no site
header/footer/nav, no scrollbars, smooth transitions, readable from across a
room. Nothing to click. If their connection blips, it recovers on its own
(§32–33) without them noticing more than a brief freeze.

**Host (Phase 5+):** opens Tiger Center → Broadcast, sees what's live, what's
next, the queue, and can either leave it alone (default: Auto Mode) or take
over a specific decision without breaking the automation for everything else
(Producer Mode / hybrid, §24–25).

## 7. Broadcast Lifecycle

```
Tournament has no live round  →  Holding Screen (standings / countdown to next round)
Round starts (live_round_state.started)  →  Auto rotation begins
        Individual Leaderboard → Match Play → Current Matches → repeat
Any relevant event fires  →  Rules Engine scores it  →  queued/overlaid/takeover/suppressed
Round ends  →  Round Final scene, then back to rotation or holding screen
Tournament completes (live_tournament_settings.completedAt)  →  Tournament Winner scene → Holding Screen
```

## 8. System Architecture

**No new backend service. No persistent Node process.** This is the single
biggest adaptation from the source brief, and it drives most of the design
below.

The brief's conceptual pipeline (Player App → Backend → DB → Tournament
Event → Broadcast Processor → Priority Engine → Queue → **Broadcast
Controller** → Broadcast Client) assumes a long-running "controller" process
that owns runtime state (current scene, timers, etc.). This repo deploys to
**Vercel** as serverless Next.js Route Handlers
(`maroon-masters-python-api`/`maroon-masters-scorekeeper` Vercel projects are
visible in the paused-service history — see [[tiger-center-build-phasing]]
context — confirming Vercel as the deploy target;
**UNKNOWN — REQUIRES CONFIRMATION**: exact plan tier/limits). There is no
place for a stateful "always-on" controller to live short of adding
infrastructure the brief itself says to avoid (§39: "avoid unnecessary
infrastructure and premature complexity").

**Resolution:** collapse "Broadcast Processor / Priority Engine / Queue /
Controller" into two things that already fit this codebase's proven pattern:

1. **A shared TypeScript module (`lib/broadcast/*`)**, called synchronously
   from inside the *existing* write paths (`app/api/portal/scoring/*`,
   `app/api/portal/tiger/matchboxes/*`, `app/api/portal/tiger/rounds/*`)
   right after a Supabase write succeeds. This module classifies the event,
   applies priority rules, and writes one row to `broadcast_events` (and
   updates `broadcast_state` if the event is a takeover). This *is* the
   "processor + priority engine + queue-writer" — it runs once, at write
   time, inside the same request, exactly like every other piece of
   business logic in this app (mirrors how `lib/live/orchestration.ts`
   already computes match state inline after a score write).
2. **Supabase Realtime**, already proven in `components/portal/ScoringPanel.tsx`
   (`.channel(...).on("postgres_changes", ...)`), pushes the new
   `broadcast_events`/`broadcast_state` rows to every subscribed
   `/broadcast` client. No custom WebSocket server.

The "Scene Manager" / rotation timer that the brief describes as
server-owned instead runs **client-side, in every `/broadcast` tab**, driven
by one authoritative fact from the server: `broadcast_state.scene_started_at`
(a timestamp) plus `broadcast_config`'s per-scene duration. Every client
computes "what should be on screen right now" from the same inputs, so two
`/broadcast` tabs opened seconds apart converge on the same scene without
either one being a "master" process. This is what makes §26/§34
(reconnection, multiple displays) cheap instead of requiring a new
synchronization service.

### Data flow — score update (concrete, this codebase)

```
Player Portal (ScoringPanel)
  → POST /api/portal/scoring/submit  [existing, unmodified scoring logic]
  → Supabase write: live_hole_scores
  → lib/broadcast/publish.ts: publishBroadcastEvent({ kind: "SCORE_POSTED", ... })
      → lib/broadcast/rules.ts classifies (birdie/eagle/ace/leader-change/etc.)
      → insert into broadcast_events (priority, payload, status)
      → if takeover-priority: update broadcast_state
  → Supabase Realtime fan-out (postgres_changes on broadcast_events / broadcast_state)
  → Every open /broadcast client's ConnectionManager receives the change
  → Local Scene Manager re-evaluates and re-renders
```

### Data flow — video upload (Phase 3+)

```
Host or Player uploads shot video
  → R2 (lib/r2/client.ts, same pattern as archived_shot_videos)
  → status: uploading → processing → available
  → insert into live_shot_videos (mirrors archived_shot_videos shape)
  → publishBroadcastEvent({ kind: "VIDEO_AVAILABLE", ... })
  → Host decides in Broadcast control tab (or auto-rules if configured): feature / queue / discard
  → broadcast_events row transitions queued → ready (once video confirmed playable) → playing → played
```

### Data flow — manual producer override (Phase 5+)

```
Host clicks "Play Now" in Tiger Center → Broadcast
  → POST /api/portal/tiger/broadcast/queue { action: "play_now", eventId, year }
  → requireHost() check
  → broadcast_state updated directly (priority 100, bypasses queue ordering)
  → Realtime fan-out → all clients cut immediately
```

### Data flow — normal rotation (client-local, no server call)

```
Scene A (duration from broadcast_config) → timer expires
  → check broadcast_events for anything queued/pending above rotation priority
  → none found → Scene B
  → repeat, wrapping to Scene A
```

## 9. Existing-System Integration (inspection findings)

Confirmed by reading the repo directly:

- **Frontend:** Next.js 16.2.9 (App Router), React 19.2.4, TypeScript 5,
  Tailwind CSS 4. `lucide-react` for icons.
- **Backend:** No separate backend — Next.js Route Handlers under `app/api/**`
  are the entire backend. Host-only routes live under `app/api/portal/tiger/**`
  and are gated with `requireHost()` (`lib/portal/requireHost.ts`); the same
  pattern (service-role key for writes) is used everywhere.
- **Database:** Supabase Postgres. Schema lives in `supabase/schema.sql`,
  hand-maintained (no ORM/migration tool detected — **UNKNOWN — REQUIRES
  CONFIRMATION** whether that stays true or a migration tool gets adopted
  before this ships). RLS pattern used everywhere: `select using (true)`
  (public read) with **no** insert/update policy — writes only happen via
  Route Handlers using the service-role key. This spec's tables follow the
  identical pattern.
- **Auth:** Supabase Auth. `profiles.is_host` flags the one host account.
  `requireHost()` / `requirePlayer()` (`lib/portal/*`) are the two guards
  every protected route already uses.
- **Real-time (already proven, not hypothetical):** Supabase Realtime
  `postgres_changes` channel subscriptions — see
  `components/portal/ScoringPanel.tsx:70-72`. This is the mechanism this
  spec reuses. A **separate, older** mechanism (`lib/hooks/useLiveTournament.ts`,
  10s polling against `/api/live-feed`) also exists but is explicitly being
  retired by `docs/superpowers/specs/2026-08-28-native-live-platform-design.md`
  in favor of Realtime — this spec builds on the *new* direction, not the
  polling one.
- **Scoring/match architecture:** `lib/live/scoring.ts` and
  `lib/live/orchestration.ts` are a TypeScript port of the old Python
  scoring engine — pure, unit-tested (`tsx --test`) functions operating on a
  `LiveTournamentSnapshot`. This spec never touches this logic, only reads
  its outputs.
- **Tournament model:** `live_*` tables are keyed by `season_year` (2027–2034,
  `check` constraint) as of the Master Settings phase
  (`docs/superpowers/specs/2026-09-01-tiger-center-master-settings-design.md`).
  `live_active_season` (singleton) says which year is currently live. **This
  spec's tables key off `season_year` the same way** — a broadcast is always
  scoped to one year, and "the live one" is whatever `live_active_season`
  says, not a hardcoded assumption.
- **Match-play model:** `LiveMatchBox` (`lib/live/types.ts`) has
  `state: "Scheduled"|"Armed"|"Live"|"Final"`, `format`, `maroonPlayers`/
  `whitePlayers`, `boxNumber`. This is what the Match Play scene reads.
- **Video:** No *live* video pipeline exists yet. What exists is
  **past-year, host-uploaded-after-the-fact** video via
  `archived_shot_videos` + Cloudflare R2 (`lib/r2/client.ts`), built for
  `docs/superpowers/specs/2026-08-30-tiger-center-scorecards-video-design.md`.
  There is no in-round/live shot-video upload today — `ShotVideoPanel` in
  the live scoring flow is described in memory as still a placeholder. The
  Video/Highlight phases of this spec (Phase 3+) are genuinely new
  territory, but they follow R2's already-established pattern exactly.
- **Design system:** `components/ui/*` (Badge, Button, Card, ScoreBadge,
  TeamBadge, TrophyBadge, WinnerBadge, Avatar, LeaderboardRow) plus
  `components/leaderboard/*` (LeaderboardBoard, IndividualLeaderboardTable,
  LeaderboardStrip, LiveLeaderboardContent) and `components/match/*`
  (MatchRow, ResultChevron) already render exactly the data this broadcast
  needs, in the site's maroon/white visual identity. **Broadcast scenes
  should restyle/reuse this data layer, not rebuild leaderboard/match
  rendering from scratch** — new, broadcast-specific presentational
  components consume the same data-fetching functions.
- **Testing:** `npm test` runs `tsx --test` over colocated `*.test.ts` files;
  Playwright is present for e2e (`playwright` devDependency) — no e2e specs
  were sampled in this pass; **UNKNOWN — REQUIRES CONFIRMATION** whether any
  currently exist/run in CI.
- **Deployment:** Vercel (inferred from paused sibling Vercel projects
  referenced in project history; the Vercel MCP connector is attached to
  this environment). **UNKNOWN — REQUIRES CONFIRMATION**: plan tier, any
  configured Vercel Cron usage today, function timeout limits in force.

## 10. Event Architecture

Two layers, kept deliberately separate (this is the brief's §32 principle,
made concrete):

- **Tournament facts** — raw, already exist: a hole score row, a match box's
  `state`, `live_round_state.started`. The scoring/match system never
  "publishes a broadcast event" describing meaning (no `BIRDIE`,
  no `NEW_LEADER`) — it only writes its own tables truthfully, as it already
  does today.
- **Broadcast events** — `lib/broadcast/publish.ts` exports
  `publishBroadcastEvent()`, called once from each write path *after* the
  underlying write succeeds, with the raw fact (`{ kind: "SCORE_POSTED",
  playerSlug, round, hole, score, matchBoxId? }`). Only this module decides
  what it means for television.

## 11. Event Taxonomy

Trimmed from the brief's larger candidate list — several proposed types
collapse into richer payloads on fewer event kinds, so the taxonomy doesn't
grow every time a new nuance (dormie, 2-UP, all-square) is wanted.

| Event kind | Raw or derived | Phase | Fires from |
|---|---|---|---|
| `SCORE_POSTED` | Raw | 2 | `submit` route, after a hole score is confirmed |
| `MATCH_STATE_CHANGED` | Raw (payload carries the specific status: AS, 2 UP, dormie, closed-out N&M) | 2 | `matchboxes` routes / orchestration recompute |
| `MATCH_WON` | Raw | 2 | orchestration detects `Final` |
| `ROUND_STARTED` / `ROUND_FINAL` | Raw | 2 | `rounds/start` route / round-completion check (this codebase says **round**, not "session" — the brief's "session" terminology maps 1:1 to this repo's existing `round`) |
| `LEADER_CHANGED` | **Derived** by rules engine from `SCORE_POSTED`, not published raw | 7 | rules engine, comparing new standings to prior |
| `HOLE_WON` | Derived, optional (overlay-only, low priority) | 4 | rules engine, from match-play hole result |
| Birdie / eagle / hole-in-one | **Derived classification** of `SCORE_POSTED` (par vs. score), not separate raw events — this is a deliberate deviation from the brief, directly serving its own §32 rule that scoring code shouldn't know broadcast vocabulary | 4/7 | rules engine |
| `VIDEO_AVAILABLE` | Raw | 3 | video processing completes (folds the brief's `VIDEO_UPLOADED`/`VIDEO_READY` into one lifecycle transition, see §19) |
| `VIDEO_FEATURED` | Raw (host action) | 3 | host control |
| `HIGHLIGHT_ADDED` | Raw (host action) | 3 | host control |
| `TOURNAMENT_WINNER` | Raw (host-triggered; automatic detection is a Phase-7+ refinement) | 4 | host control / `completedAt` |
| `MANUAL_BROADCAST_EVENT` | Raw (host action, arbitrary graphic/announcement) | 5 | Tiger Center → Broadcast |
| `SHOT_TRACER_READY` | Reserved, unused | 8 | future |

Dropped as separate raw types (folded into the above): `MATCH_ALL_SQUARE`,
`PLAYER_NEW_LEADER`, `PLAYER_POSITION_CHANGED`, `VIDEO_UPLOADED`,
`VIDEO_READY`.

## 12. Broadcast Queue

One table, `broadcast_events` (see §26 for full schema). No separate
"history" table — a played/expired/dismissed row *is* the history, filtered
by `status`. This directly follows §28's own instruction not to duplicate
data without a reason: a second table here would only ever hold a copy of
rows that already exist.

Ordering: query `broadcast_events where status in ('queued','ready') and
(expires_at is null or expires_at > now()) order by priority desc,
created_at asc`. The client (and the Route Handler for host actions) always
reads this same query — there is no separate in-memory queue to keep in
sync.

## 13. Priority Model

Configurable per season via `broadcast_config.priorities` (jsonb map, kind →
integer), seeded with defaults; a host never edits raw numbers, only reorders
a config list in a later phase's UI if ever needed. Default tiers:

| Priority | Event |
|---|---|
| 0 | Ambient rotation (no queued event) |
| 10 | Routine `SCORE_POSTED`, no notable classification — logged, never queued |
| 20 | `HOLE_WON` |
| 30 | Birdie |
| 40 | `LEADER_CHANGED`, `MATCH_STATE_CHANGED` (all-square/dormie/N-UP) |
| 50 | `VIDEO_FEATURED` |
| 60 | Eagle |
| 70 | `MATCH_WON` |
| 75 | `ROUND_FINAL` |
| 85 | `HIGHLIGHT_ADDED` (manually promoted) |
| 90 | Hole-in-one |
| 95 | `TOURNAMENT_WINNER` |
| 100 | `MANUAL_BROADCAST_EVENT` / host override — always preempts, bypasses normal ordering |

**Aging:** a `queued` event's *effective* priority for sort purposes is
`priority + min(30, minutes_waiting * 2)` — so a medium-priority event that's
been waiting a long time eventually surfaces rather than being starved by a
steady trickle of higher-priority ones. Purely a sort-time calculation, not
stored.

**Expiration:** every non-manual event gets a default `expires_at` (e.g. 10
minutes for an overlay-class event, 30 for a takeover-class one — exact
defaults live in `broadcast_config`, not hard-coded) — an event that becomes
stale before it's shown (e.g. `LEADER_CHANGED` superseded by a newer leader
change) is marked `expired`, not shown.

**Duplicate/related-event suppression:** before inserting, `publish.ts`
checks for an existing `pending`/`queued` row with the same `kind` +
`player_slug`/`match_box_id` + `round`/`hole` — if found, the new payload
replaces it in place (updates the existing row) rather than stacking
duplicates. A `MATCH_STATE_CHANGED` for the same match box supersedes
(expires) any earlier un-played `MATCH_STATE_CHANGED` for that same box.

**Emergency clear:** host action sets every `pending`/`queued`/`ready` row to
`dismissed` and returns to rotation — one Route Handler call (§27).

## 14. Rules Engine

`lib/broadcast/rules.ts` — pure, deterministic, unit-tested functions
(matching `lib/live/scoring.ts`'s own style exactly), no AI/ML per the
brief's explicit instruction (§21/§39). Each raw event kind maps to a rule
function: `(rawEvent, snapshot, config) => BroadcastEventDraft | null`. A
draft carries `{ priority, displayMode: "takeover"|"overlay"|"queue"|"log-only",
payload }`. Because these are plain functions over the existing
`LiveTournamentSnapshot` type, adding a new rule (e.g. "birdie by the
tournament leader gets bumped to overlay+takeover-adjacent priority," §21's
example) is a one-function change with a unit test, never a rewrite of
scoring logic.

## 15. Broadcast State Machine

Runs **client-side** in every `/broadcast` tab (see §8), reconciled against
server-authoritative `broadcast_state`:

States: `IDLE_ROTATION`, `EVENT_TAKEOVER`, `EVENT_OVERLAY` (composable with
`IDLE_ROTATION` or `EVENT_TAKEOVER`), `TRANSITIONING`.

```
IDLE_ROTATION:
  on scene-timer-expired → check queue → dequeue if anything ≥ rotation
    priority → TRANSITIONING → EVENT_TAKEOVER | EVENT_OVERLAY
  on overlay-priority event arrives mid-scene → EVENT_OVERLAY (scene
    underneath keeps running)
  on takeover-priority event arrives → wait for current scene's natural
    boundary UNLESS priority ≥ manual-override tier (100), which cuts
    immediately

EVENT_TAKEOVER:
  on event duration elapsed / video ended → TRANSITIONING → IDLE_ROTATION
    (or next queued event if the queue still has something above rotation
    priority)

EVENT_OVERLAY:
  on overlay duration elapsed → dismiss overlay, stay in underlying state
```

Authoritative server fields (`broadcast_state`, one row per `season_year`):
`current_scene`, `scene_started_at`, `active_event_id`, `automation_mode`
(`auto`|`producer`), `paused` (bool). Everything else (`previousScene`,
`transitionState`, local video/audio element state) is legitimately
client-local — recomputable, never a source of truth, and never persisted.

## 16. Scene Architecture

Reusable, full-canvas React components under `components/broadcast/scenes/`,
each rendered by a `SceneRenderer` that reads `broadcast_state.current_scene`.
Every scene declares: required data (which existing `lib/data`/`lib/live`
query it depends on), default duration (from `broadcast_config`), entrance/
exit transition, and fallback (what renders if its data is empty/loading —
never a blank screen).

## 17. Scene Specifications

V1 scenes (Phase 1):

- **Individual Leaderboard** — reuses `IndividualLeaderboardTable`'s data
  function, restyled full-screen. Auto-scrolls/paginates if the field
  doesn't fit (§18). Default 12s.
- **Match Play** — reuses `LiveMatchBox`/`MatchRow` data, one row per box:
  pairing, format, current hole, status (AS / N UP / N DN / dormie / N&M /
  FINAL). Default 12s.
- **Current Matches / Holding Screen** — venue/date/next-round info when no
  round is live (reuses `getNextTournament()`/`getVenueBySlug()` from
  `lib/data/index.ts`, Master Settings-aware per §9). Default 10s, or
  indefinite while genuinely idle.

Later-phase scenes (Phase 3–4): Featured Player, Shot Video, Featured
Highlight, Round Result (renamed from the brief's "Session Result" per this
repo's terminology), Match Result, Tournament Winner, Opening/Intro. Each
gets its own short design pass when its phase starts — not specified in
full detail here, per the brief's own instruction not to over-specify what
isn't being built yet.

## 18. Overlay Architecture

Two overlay categories, never more concurrently:

- **Persistent/status** (fixed corner: current leader strip, hole number,
  match status) — coexists with the active scene, updates in place, no
  entrance animation needed beyond a value change.
- **Moment/lower-third** (birdie, new leader, match won, tournament update)
  — slides in, holds a configurable duration (default from
  `broadcast_config.overlayDurationMs`), auto-dismisses. If a second moment
  overlay arrives while one is showing, it queues (does not stack) and plays
  immediately after, using the same priority-ordered queue as takeovers.

Overlays never appear during a video-class takeover except the persistent
status corner, which stays visible unless the video is explicitly
full-bleed (host-configurable per scene, later phase).

## 19. Video Architecture (Phase 3+, no live pipeline exists today — §9)

Lifecycle, trimmed from the brief's longer candidate list to match what this
codebase's existing `archived_shot_videos` pattern already needs:

```
uploading → processing → available → (host or rule) queued → ready → playing → played
```

`featured` and `highlight` are **tags**, not lifecycle states (a row can be
`played` *and* tagged `highlight` for later replay) — modeled as a
`live_shot_videos.tag` column (`null | 'featured' | 'highlight'`), not extra
lifecycle states, avoiding the state-explosion the brief's longer list risks.
`rejected`/`failed`/`archived` remain terminal statuses.

Failure handling (all Phase 3+, specified now so the schema doesn't need to
change later): failed upload/processing → `failed`, never enters the queue;
video removed mid-queue → row marked `dismissed`, broadcast silently skips
to next; playback error client-side → skip to next queued item within 2s,
log the failure (§32), never blocks rotation. Portrait video: letterboxed on
the 16:9 canvas, not cropped or rejected. No hard duration cap in V1 scope;
**UNKNOWN — REQUIRES CONFIRMATION**: whether Tiger wants a max-length
enforcement once real uploads start.

## 20. Highlight Architecture (Phase 3+)

A `highlight`-tagged `live_shot_videos` row can be replayed by the host at
any time (`POST /api/portal/tiger/broadcast/queue { action: "replay",
videoId }`) independent of whether it's still in the original event queue.
No separate "highlights" table — the tag on the existing video row is
sufficient (again, avoiding duplication per §28's own instruction).

## 21. Audio Architecture (Phase 6, currently no audio system exists at all)

`AudioManager` states: `NORMAL`, `DUCKED`, `VIDEO_AUDIO`, `MUTED`,
`CELEBRATION`, `PAUSED` — client-local only (never server state; each
viewer's device controls its own playback, browser autoplay restrictions
handled with a "tap to enable sound" gate on first load, same UX pattern
every embedded-video site uses). Playlist/volume/ducking config lives in
`broadcast_config.audio` (jsonb). **Hard constraint carried over from the
brief verbatim:** no assumption of licensed commercial music — the playlist
is whatever audio files the tournament has actual rights to use, referenced
by URL (R2, same bucket pattern as video). This phase is far enough out that
no schema commitment beyond that config field is made now.

## 22. Real-Time Architecture

Already answered in §8/§9 — Supabase Realtime `postgres_changes` on
`broadcast_state` and `broadcast_events`, scoped by `season_year`, using the
exact channel-subscription pattern already proven in `ScoringPanel.tsx`. No
new real-time infrastructure. `ConnectionManager` (client component) owns
reconnect/backoff and triggers a full state re-fetch (§33) on reconnect
rather than trusting it can resume mid-stream.

## 23. Host Broadcast Control (Phase 5)

New Tiger Center screen, `app/portal/admin/master-settings/[year]/broadcast/page.tsx`
— same route shape and `requireHost()` gate as every existing Tiger Center
page. Shows: Currently Live, Up Next, Event Queue, Recently Played, Available
Videos (once Phase 3 exists), Connection Status. Controls: Play Next, Play
Now, Skip, Replay, Return to Auto, Clear Queue, Pause/Resume Automation,
manual scene buttons, manual graphic triggers (birdie/eagle/new
leader/tournament winner/custom announcement).

## 24. Auto Mode

Default. `broadcast_state.automation_mode = 'auto'`. Rules engine output
drives the queue exactly as described in §12–15; no host input required.

## 25. Producer Mode

`broadcast_state.automation_mode = 'producer'` is **not** a global on/off —
it's a per-action override layer. A host action (Play Now, force scene) is
always honored immediately regardless of mode; setting `producer` mode only
*pauses automatic queue advancement* (rotation and rule-driven enqueuing
still happen — events keep landing in the queue — but nothing auto-plays
until the host acts or hits "Return to Auto"). This hybrid matches §15 of the
brief ("consider a hybrid model") and is the only mode design that doesn't
lose events that happened while a human had the wheel.

## 26. Database Schema

**Correction from initial drafting (confirmed against the real schema before
writing any SQL):** `docs/superpowers/specs/2026-09-01-tiger-center-master-settings-design.md`'s
`season_year` model is itself only a spec — it has not been built yet
(`supabase/schema.sql` has no `season_year` column anywhere, `live_tournament_settings`
is still today's actual singleton `id boolean primary key default true` row).
So these tables are built **singleton, matching today's real
`live_tournament_settings` shape** — not `season_year`-keyed. If/when Master
Settings ships, these get a `season_year` column retrofitted the exact same
way every other `live_*` table's Master Settings migration does (see that
spec's `alter table ... add column season_year integer` pattern) — this is a
deferred, not lost, requirement.

New tables, all following this repo's existing conventions exactly (`create
table if not exists`, RLS `select using (true)` + service-role-only writes,
no ORM). Every table below references *existing* tables by id/slug rather
than duplicating their data — the "why" for each is inline.

```sql
-- The whole rotation/priority/overlay/audio config. Singleton for now (see
-- note above) — one row, matching live_tournament_settings' own pattern.
-- Why a table and not hard-coded constants: the brief requires these be
-- configurable per tournament, not fixed at build time (§2, §13, §18, §21).
create table if not exists broadcast_config (
  id boolean primary key default true,
  scene_durations_ms jsonb not null default '{"individual_leaderboard":12000,"match_play":12000,"holding":10000}',
  priorities jsonb not null default '{}', -- overrides on top of the code defaults in §13
  overlay_duration_ms integer not null default 6000,
  audio jsonb not null default '{}', -- Phase 6+
  updated_at timestamptz not null default now(),
  constraint broadcast_config_singleton check (id)
);

-- The single authoritative "what's on screen right now." Singleton for now
-- (see note above). Why a table and not derived: every client must converge
-- on the same scene/timestamp without a shared process (§8) — this row IS
-- that shared clock.
create table if not exists broadcast_state (
  id boolean primary key default true,
  current_scene text not null default 'holding'
    check (current_scene in ('holding', 'individual_leaderboard', 'match_play')),
  scene_started_at timestamptz not null default now(),
  active_event_id uuid, -- references broadcast_events(id) once that table exists, Phase 2
  automation_mode text not null default 'auto' check (automation_mode in ('auto', 'producer')),
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint broadcast_state_singleton check (id)
);

alter table broadcast_config enable row level security;
alter table broadcast_state enable row level security;

-- Same "public read, service-role writes" pattern as every live_* table —
-- the /broadcast page has no login, and none of this is sensitive.
drop policy if exists broadcast_config_select_all on broadcast_config;
create policy broadcast_config_select_all on broadcast_config for select using (true);

drop policy if exists broadcast_state_select_all on broadcast_state;
create policy broadcast_state_select_all on broadcast_state for select using (true);

insert into broadcast_config (id) values (true) on conflict (id) do nothing;
insert into broadcast_state (id) values (true) on conflict (id) do nothing;
```

`broadcast_events` (the queue) is **not created yet** — it's Phase 2 work,
once there's a rules engine to write to it. Its shape stays as sketched in
the original draft of this section (`kind`, `priority`, `status`, references
to `live_match_boxes`/players/hole/`profiles`, timestamps) and will be added
with its own migration when Phase 2 starts, at which point `broadcast_state.active_event_id`
also gets its real foreign key.

**Deliberately not built now:** a separate `broadcast_history` table (§12 —
status filtering on the same table covers it); a separate `scene_configuration`
or `audio_configuration` table (§21 — folded into `broadcast_config` jsonb
until a phase actually needs relational structure there); `live_shot_videos`
(Phase 3 concern, schema sketched conceptually in §19 but not created until
that phase is scoped, per the brief's own "don't build what isn't being
built yet").

## 27. API Specification

All host-only endpoints follow the existing `app/api/portal/tiger/*`
convention exactly: `requireHost()` guard, `year` (season_year) required in
every request body (matching the precedent set by Master Settings' own
routes), service-role Supabase client for writes.

| Endpoint | Auth | Purpose | Request | Side effects | Realtime events |
|---|---|---|---|---|---|
| `GET /api/broadcast/[year]/state` | Public | Full hydration on load/reconnect (§33) | — | none | — |
| `POST /api/portal/tiger/broadcast/scene` | Host | Force a scene / return to auto | `{ year, scene? }` (omit `scene` = return to auto) | writes `broadcast_state` | `broadcast_state` update |
| `POST /api/portal/tiger/broadcast/queue` | Host | `play_next`\|`play_now`\|`skip`\|`replay`\|`clear`\|`pause`\|`resume` | `{ year, action, eventId? }` | writes `broadcast_events`/`broadcast_state` | both tables |
| `POST /api/portal/tiger/broadcast/graphic` | Host | Manual graphic/announcement | `{ year, kind: "MANUAL_BROADCAST_EVENT", payload }` | inserts `broadcast_events` at priority 100 | `broadcast_events` insert |
| `POST /api/portal/tiger/broadcast/config` | Host | Edit durations/priorities/audio config | `{ year, ...partial config }` | upserts `broadcast_config` | `broadcast_config` update |

Internal only (not an HTTP endpoint — a shared function called from existing
routes): `publishBroadcastEvent(rawEvent)` in `lib/broadcast/publish.ts`.

Errors: every host route 401s if `requireHost()` returns null (existing
pattern), 400 on an unrecognized `action`/malformed body, 404 on an unknown
`eventId`. No endpoint ever writes tournament/scoring data — a broadcast
route can only ever touch the four tables in §26.

## 28. WebSocket/Event Contracts

No custom WebSocket contract — the "event contract" is simply: subscribe to
Supabase Realtime `postgres_changes` on `broadcast_state` and
`broadcast_events`, filtered `season_year=eq.{year}`, exactly as
`ScoringPanel.tsx` already does for `live_hole_scores`. On any change,
re-fetch (or apply the changed row) and let the client state machine (§15)
re-evaluate. This is intentionally the same contract shape every other
real-time feature in this app already uses — no new client library, no new
concept for a future engineer to learn.

## 29. Frontend Architecture

```
app/broadcast/page.tsx                 — redirects to /broadcast/[live_active_season year] (§45)
app/broadcast/[year]/page.tsx          — no SiteChrome, no nav, full 16:9 canvas
components/broadcast/
  BroadcastStage.tsx                   — top-level: ConnectionManager + SceneRenderer + OverlayLayer + (later) AudioManager
  ConnectionManager.tsx                — Realtime subscribe/reconnect/backoff, triggers full-state re-fetch on reconnect
  SceneRenderer.tsx                    — reads broadcast_state.current_scene, mounts the right scene, owns TransitionManager
  TransitionManager.tsx                — cross-fade/cut logic between scenes
  scenes/
    IndividualLeaderboardScene.tsx     — wraps existing leaderboard data fetch, broadcast-styled
    MatchPlayScene.tsx                 — wraps existing match-box data fetch, broadcast-styled
    HoldingScene.tsx
    (Phase 3+) ShotVideoScene.tsx, FeaturedPlayerScene.tsx, ...
  overlays/
    OverlayLayer.tsx
    LowerThird.tsx
    StatusCorner.tsx
  AudioManager.tsx                     — Phase 6
```

Host control (Phase 5): `components/portal/tiger/BroadcastControlPanel.tsx`,
following the exact structural pattern of the existing
`components/portal/tiger/CoursesFormatPanel.tsx` / `MatchupsPanel.tsx`.

## 30. Backend Architecture

```
lib/broadcast/
  types.ts        — BroadcastEvent, BroadcastState, BroadcastConfig (mirrors lib/live/types.ts style)
  publish.ts       — publishBroadcastEvent(), called from existing scoring/match routes
  rules.ts         — one pure function per raw event kind → BroadcastEventDraft | null (§14)
  priority.ts      — default priority table + aging/expiry calculation (§13)
  queue.ts         — the single "next in queue" query (§12), used by both API routes and any server-side read
```

No `broadcast/controller`, `broadcast/websocket` folders — those
responsibilities don't exist as separate processes in this architecture
(§8). This is a deliberate, explained simplification of the brief's
suggested `backend/broadcast/{events,queue,controller,priorities,rules,
state,websocket,video,audio}` structure, collapsed to fit how this specific
codebase (serverless Route Handlers, no persistent process) actually works.

## 31. Permissions/Security

- Viewers: no auth, read-only, can only hit `GET /api/broadcast/[year]/state`
  and Realtime-subscribe (both public per RLS `select using (true)`).
- Host actions: `requireHost()` on every mutating route, identical to every
  other Tiger Center route today. No new permission concept introduced.
- No endpoint in this system can write to `live_hole_scores`, `live_match_boxes`,
  or any scoring table — enforced simply by scope (the broadcast Route
  Handlers' Supabase client never touches those tables), not by a runtime
  check, which is the same trust model the rest of this codebase uses.

## 32. Failure Handling

- Broadcast write failure (e.g. `publishBroadcastEvent` throws) is caught
  and logged, **never** allowed to fail the underlying scoring/match write
  it's attached to — the `try/catch` wraps only the broadcast call, placed
  after the scoring write has already succeeded and returned.
- Video/audio playback failure: skip to next queue item within ~2s,
  log, never blocks rotation (§19).
- Realtime disconnect: `ConnectionManager` shows a small "reconnecting"
  indicator (not a blank screen — last-known scene stays rendered),
  exponential backoff, full state re-fetch on reconnect (§33).
- Backend/DB restart: since no client-side state is authoritative, a
  `/broadcast` tab that briefly can't reach Supabase just holds its last
  rendered frame and resumes once Realtime reconnects.

## 33. State Recovery

On mount and on every reconnect, `/broadcast/[year]` calls
`GET /api/broadcast/[year]/state`, which returns
`broadcast_state` + the current `broadcast_events` queue +
`broadcast_config` in one payload — the client never assumes it can resume
a stream from where it left off. This directly answers §25/§33 of the
brief: **the server (Postgres, via these two tables) is authoritative**;
everything client-local (transition animation state, local video element
position) is disposable and rebuilt from that payload.

## 34. Multiple Broadcast Clients

V1: not explicitly synchronized frame-by-frame, but **effectively
synchronized** as a side effect of the architecture — every client computes
its scene from the same `scene_started_at` timestamp, so two displays opened
near the same time show the same thing within roughly a network round-trip
of each other. True frame-accurate sync (e.g. a shared video currentTime) is
explicitly out of scope until a phase asks for it — the architecture doesn't
block adding it later (a server-authoritative playback-position field could
be added to `broadcast_state` without a schema rewrite).

## 35. Performance Requirements

- Score-to-screen latency target: "essentially instantaneous" per the
  brief — in practice, whatever Supabase Realtime's own propagation delay
  is (typically sub-second) plus one client re-render. No polling fallback
  needed given Realtime is already proven in this codebase.
- Scene rotation must never visibly stall waiting on a query — every scene's
  data fetch has a loading/fallback state (§16), never a blank frame.
- **UNKNOWN — REQUIRES CONFIRMATION:** expected concurrent viewer count
  (affects whether Supabase Realtime's free/current tier connection limits
  are adequate) and expected video file sizes/bandwidth once Phase 3 lands
  (affects R2 bandwidth planning, though R2's egress-free model makes this
  low-risk per the existing comment in `lib/r2/client.ts`).

## 36. Logging/Observability

Every `broadcast_events` row **is** the audit log (§39 rule 9: "every
important broadcast action should be logged") — `source` (`system`/`host`),
`created_by`, and every timestamp column together answer "what played, when,
why, and who (if anyone) triggered it," queryable directly, no separate
logging table needed. Playback/connection failures (§32) get logged via
whatever this codebase's existing error-reporting mechanism is —
**UNKNOWN — REQUIRES CONFIRMATION**: no dedicated error-tracking service
(e.g. Sentry) was found in `package.json`; if none exists, failures should
at minimum `console.error` with enough context to find in Vercel's function
logs, matching the apparent current standard.

## 37. Testing Strategy

Matches this repo's existing testing convention exactly:

- `lib/broadcast/rules.ts` and `lib/broadcast/priority.ts`: unit tests via
  `tsx --test` (colocated `*.test.ts`), same style as `lib/live/scoring.test.ts`.
- API routes: colocated `route.test.ts` files, same style as the existing
  `app/api/portal/tiger/**/route.test.ts` files.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — the standard gate
  this repo already runs before calling any phase done (per
  `2026-09-01-tiger-center-master-settings-design.md`'s own Testing
  section).
- Manual walkthrough per phase (see §44 for Phase 1's).

## 38. Deployment Considerations

No new services, no new environment variables beyond what R2/Supabase
already require (Phase 3+ only reuses existing `R2_*` vars). Ships as part
of the normal Vercel deploy of this Next.js app. **UNKNOWN — REQUIRES
CONFIRMATION:** whether Supabase Realtime connection concurrency on the
current plan needs review before a real event with many simultaneous
`/broadcast` viewers.

## 39. Migration Strategy

No data migration needed to introduce this system — `broadcast_config`/
`broadcast_state` rows are created lazily (first write, matching the
"rows created lazily on first Save" pattern Master Settings already
established for `live_tournament_settings`) rather than pre-seeded for every
year 2027–2034.

## 40. Future Shot Tracer Integration

`SHOT_TRACER_READY` is reserved in the taxonomy (§11) and unused until
built. Nothing else about this architecture needs to change to accommodate
it later: it's a new raw event kind, a new rule in `rules.ts`, and a new
scene component — the queue/priority/state-machine layers don't know or
care what a scene renders.

## 41. Future Streaming/OBS Integration

`/broadcast/[year]` is a plain, chrome-free, full-canvas page today by
design (§6/§29) — exactly what an OBS Browser Source or a stream input
needs, with zero additional work required to *use* it that way once it
exists. No streaming infrastructure (RTMP ingest, YouTube API, etc.) is
built in any phase of this spec.

## 42. Edge Cases

- **No round live:** Holding Screen only; queue-driven events (which only
  arise from live scoring/match activity) simply don't fire.
- **Tournament switches years mid-broadcast** (host flips `live_active_season`
  via Master Settings while a `/broadcast/2027` tab is open): that tab keeps
  showing 2027 (it's a year-scoped URL, matching the Master Settings
  URL-per-year pattern) — it is **not** expected to silently follow the
  active-season flip. A `/broadcast` link intended to always show "whatever
  is live" is a distinct, later decision (§45).
- **Video deleted while queued** (Phase 3+): row marked `dismissed`,
  broadcast skips it silently (§19).
- **Duplicate rapid score corrections** (host edits a score twice quickly):
  suppression logic in §13 replaces the pending draft rather than queuing
  both.
- **Empty leaderboard/no roster yet:** scene shows its defined fallback
  (§16), never a blank/error screen.

## 43. Acceptance Criteria

See §37's V1 walkthrough plus, specifically: opening `/broadcast/2027` (or
whatever `live_active_season` is at test time) on one machine and entering a
score from a second, logged-in player device updates the broadcast's
leaderboard without a manual refresh, within a few seconds, and the
rotation continues uninterrupted afterward.

## 44. Phased Implementation Plan

Each phase becomes its own spec → plan → build cycle in
`docs/superpowers/plans/`, same process as every other Tiger Center phase
(own worktree/branch, subagent-driven development, `npm test` + `tsc
--noEmit` + `lint` + `build` gate before merge) — see
[[tiger-center-build-phasing]].

**Phase 1 — Broadcast Foundation** (this is V1, §45)
- Objective: prove the architecture end-to-end with the two existing
  leaderboard/match-play scenes and automatic rotation only.
- Backend: `broadcast_state`/`broadcast_config` tables + `GET
  /api/broadcast/[year]/state`. No queue/events yet — rotation only.
- Frontend: `/broadcast/[year]` page, `BroadcastStage`, `SceneRenderer`,
  `IndividualLeaderboardScene`, `MatchPlayScene`, `HoldingScene`,
  `TransitionManager`.
- Database: `broadcast_state`, `broadcast_config` (§26, minus
  `broadcast_events` — not needed until Phase 2).
- Testing: rotation-timing unit test, manual walkthrough (§45).
- Dependencies: none beyond what's already merged to `main`.
- Definition of Done: §43's acceptance criteria pass, using *existing*
  Realtime on `live_hole_scores` directly for the leaderboard scene's
  liveness (the `broadcast_events` queue isn't needed for a plain
  leaderboard re-render — it already updates live via the existing
  scoring Realtime subscription pattern).
- Risks: none significant — this phase deliberately touches no scoring
  logic.

**Phase 2 — Real-Time Event System**
- Adds `broadcast_events`, `lib/broadcast/publish.ts`, `lib/broadcast/rules.ts`
  (`SCORE_POSTED`, `MATCH_STATE_CHANGED`, `MATCH_WON`, `ROUND_STARTED`/
  `ROUND_FINAL` only), `lib/broadcast/priority.ts`, `lib/broadcast/queue.ts`.
  Wires `publishBroadcastEvent` into the existing scoring/matchbox routes.
  No visible change yet beyond the leaderboard/match scenes now being able
  to react to a takeover-priority event (still none configured to actually
  take over — that's Phase 4's graphics).
- Risks: this is the phase that touches existing write paths (§32's
  "never fail the underlying write" rule is the mitigation).

**Phase 3 — Video**
- `live_shot_videos` table, R2 upload path (mirrors `archived_shot_videos`),
  `ShotVideoScene`, host preview/play-now/queue/skip/replay, `VIDEO_AVAILABLE`/
  `VIDEO_FEATURED` events.
- Dependency: Phase 2 (queue must exist).

**Phase 4 — Production Graphics**
- Overlay components (`LowerThird`, `StatusCorner`), birdie/eagle/hole-in-one
  classification rules, `LEADER_CHANGED`/`HOLE_WON` derived events,
  `TOURNAMENT_WINNER` scene.
- Dependency: Phase 2.

**Phase 5 — Producer Controls**
- Tiger Center → Broadcast tab, all host actions from §23/§27, Auto/
  Producer mode (§24–25).
- Dependency: Phases 2–4 (needs real events/scenes/videos to control).

**Phase 6 — Audio**
- `AudioManager`, playlist config, ducking. Dependency: none technical, but
  sequenced last among "core" phases since it needs licensed/rights-cleared
  audio assets sourced first (a product decision, not engineering).

**Phase 7 — Intelligent Automation**
- Config-driven priority refinements (e.g. "birdie by the leader" bump),
  automatic highlight promotion rules, automatic `LEADER_CHANGED`/aging
  tuning based on real usage from Phases 1–6.

**Phase 8 — Advanced Production**
- Shot Tracer scene, replays/split-screens, OBS/streaming output,
  recording, recap generation. Each of these gets its own spec when its
  turn comes — intentionally not designed further here.

## 45. Open Questions

(Also restated at the very end as this document's required closing
deliverable, per the brief's §40 format.) All resolved 2026-09-04 — see
"Decisions I Need to Make" below.

## 46. Final Recommended Architecture

**Build this on exactly the stack already running the site — no new
services.** Supabase Postgres holds four new tables (`broadcast_config`,
`broadcast_state`, `broadcast_events`, and later `live_shot_videos`), all
`season_year`-scoped like the rest of the live tournament model, all
public-read/service-role-write like every other `live_*` table. Supabase
Realtime — already proven in this codebase — is the entire real-time layer;
no WebSocket server is written. There is no persistent "Broadcast
Controller" process; its two responsibilities split cleanly into (a) a
synchronous TypeScript module called from existing write paths at write
time (priority/queue decisions, made once, stored as a row) and (b) a
client-side state machine in every `/broadcast` tab that renders whatever
the authoritative `broadcast_state` row says, reconciled via Realtime. This
is the one deliberate, load-bearing departure from the source brief's
implied architecture, and it's the correct one for a Vercel-deployed
Next.js app with no persistent process to own runtime state. Everything
else in this document is a direct, unmodified translation of the brief's
requirements onto that foundation.

---

## V1 Build Boundary

**Build (Phase 1 only, matching the brief's own §37 V1 definition):**
`/broadcast/[year]` page; `broadcast_state`/`broadcast_config` tables;
automatic rotation between Individual Leaderboard, Match Play, and a Holding
Screen; live leaderboard updates via the *existing* Realtime subscription on
`live_hole_scores` (no new event/queue system needed for this alone).

**Do not build yet:** `broadcast_events`/the queue, any overlay, any video
scene, any host control screen, any audio, Shot Tracer, OBS output. All of
Phases 2–8 wait for Phase 1 to be reviewed working in the browser first.

## Decisions I Need to Make — RESOLVED 2026-09-04

1. **Route shape (§42):** `/broadcast/[year]` stays the year-pinned URL
   exactly as specced. **Adding a plain `/broadcast` route** (`app/broadcast/page.tsx`)
   that server-redirects to `/broadcast/[live_active_season's year]` — the
   "set it and forget it" URL for a clubhouse TV/projector that should
   always show whatever's currently live. Both routes ship in Phase 1 (it's
   a one-file addition on top of work already being done — no reason to
   defer it to a later phase). If `live_active_season` has no row yet
   (before Master Settings' first Save of a season), the redirect falls back
   to the Holding Screen's year-selection default — same "no live round"
   handling the Holding Screen already needs per §17/§42, no new fallback
   logic required.
2. **Max video length / enforcement policy (Phase 3, §19):** deferred —
   genuinely doesn't need an answer until Phase 3 is scoped, per the spec's
   own reasoning. Revisit then.
3. **Audio source (Phase 6, §21):** deferred — blocked on which tracks the
   tournament actually has rights to use, a product decision independent of
   engineering readiness. Revisit when Phase 6 starts.
4. **Expected concurrent viewers (§35):** confirmed **small — under 20**
   (a clubhouse TV or two plus a handful of phones). This is well within any
   Supabase Realtime tier's connection limits — **no tier review or action
   needed before go-live.**

## Questions/Unknowns — RESOLVED 2026-09-04

- **Migration approach for `broadcast_config`/`broadcast_state` (§26):**
  confirmed — **same hand-maintained `supabase/schema.sql` + manual paste
  into the Supabase SQL Editor pattern** used for every prior Tiger Center
  phase (Matchups, Courses & Format). No migration tool is being adopted.
  Phase 1's implementation plan and checklist call out this manual
  production step explicitly, the same way [[tiger-center-build-phasing]]
  records it for past phases — so a future session doesn't have to guess
  whether it was run.
- **Exact Vercel plan/limits (function timeouts, cron availability):** not
  blocking — Phase 1 adds no cron usage and its Route Handlers
  (`GET /api/broadcast/[year]/state`) are simple reads, well under any
  plan's default function timeout. Left as a non-blocking informational
  gap, not a re-opened decision.
- **Error-tracking service:** none exists in `package.json` today. Confirmed
  fallback stands as specced (§36): `console.error` with enough context to
  find in Vercel's function logs, matching this repo's current standard
  everywhere else. No action needed unless the project adopts one broadly
  (not scoped to this feature).
- **Playwright e2e in CI:** not sampled, not blocking — Phase 1's testing
  section (§37/§44) already only commits to unit tests + manual walkthrough,
  matching what every other Tiger Center phase has actually done. If e2e
  coverage becomes a project-wide initiative later, this feature picks it up
  then, not as a special case now.

## Phase 1 Implementation Checklist

*(For a coding agent, after this specification is approved — do not start
until then.)*

- [ ] `supabase/schema.sql`: add `broadcast_config`, `broadcast_state`
      (§26), RLS policies matching existing `live_*` convention. **Manual
      step:** paste the resulting `create table`/RLS statements into the
      Supabase SQL Editor in production after merge — same convention as
      Matchups/Courses & Format (§26 resolution) — and confirm it landed
      before calling this phase done (don't assume "merged" means "migrated,"
      per [[tiger-center-build-phasing]]).
- [ ] `lib/broadcast/types.ts`: `BroadcastState`, `BroadcastConfig` types.
- [ ] `app/api/broadcast/[year]/route.ts`: `GET` handler returning
      `{ state, config }` for that `season_year` (public, no auth).
- [ ] `app/broadcast/[year]/page.tsx`: no `SiteChrome`, fetches initial
      state server-side, renders `BroadcastStage`.
- [ ] `app/broadcast/page.tsx`: redirects to `/broadcast/[year]` for
      whatever `live_active_season` currently is (§45 decision 1); falls
      back to the Holding Screen's default year if no active season is set
      yet.
- [ ] `components/broadcast/BroadcastStage.tsx`,
      `ConnectionManager.tsx`, `SceneRenderer.tsx`, `TransitionManager.tsx`.
- [ ] `components/broadcast/scenes/IndividualLeaderboardScene.tsx`,
      `MatchPlayScene.tsx`, `HoldingScene.tsx` — each wraps an existing
      data-fetch function, broadcast-styled, with a defined fallback.
- [ ] Client-side rotation timer reading `broadcast_config.scene_durations_ms`
      and `broadcast_state.scene_started_at` (§15).
- [ ] `IndividualLeaderboardScene` subscribes to the existing
      `live_hole_scores` Realtime channel pattern (from `ScoringPanel.tsx`)
      scoped to the current round, so it updates live without touching
      `broadcast_events` at all in this phase.
- [ ] Unit tests for the rotation-timing calculation (`tsx --test`).
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.
- [ ] Manual walkthrough: open `/broadcast/[year]`, confirm rotation
      Individual Leaderboard → Match Play → Holding → repeat at configured
      durations; enter a score from a second device/tab in the Player
      Portal; confirm the leaderboard scene updates without a refresh;
      confirm rotation continues uninterrupted through and after the
      update; refresh the broadcast tab mid-rotation and confirm it
      resumes correctly from server state (§33) rather than resetting to
      scene one or breaking.
