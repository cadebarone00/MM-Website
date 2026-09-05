# Watch Live Player + Broadcast Playlist — Design Spec

## Goal

Two problems with `/watch-live` (the public fan-facing page — see
`components/watch-live/WatchLiveExperience.tsx`), fixed together because
the fix is one component:

1. When live, `/watch-live` embeds the real `/broadcast` page in an
   `<iframe>` (see `2026-09-04` prior session's fix). That iframe is sized
   with Tailwind's `aspect-video` on the *box*, but `/broadcast`'s scenes
   (`components/broadcast/scenes/*`) are laid out with fixed rem/px sizing
   meant for a real, large desktop/TV browser window. Squeezed into a small
   responsive box, that layout reflows instead of shrinking proportionally
   — different, not just smaller. Fix: render the broadcast at a fixed
   native size and scale the whole thing down uniformly, so `/watch-live`
   always looks like a shrunk photo of the real 16:9 broadcast.
2. Turn that video area into an actual player: a control bar with
   **Fullscreen** and **mute/volume**, plus (net new) a **Broadcast
   Playlist** so Tiger has actual audio to control from Broadcast Controls
   — uploaded songs, played while live, looping one song or the whole list.

## Background

`/broadcast` (`app/broadcast/page.tsx`, `components/broadcast/*`) has no
audio anywhere today — see
`docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md`, which
explicitly defers audio to "Phase 6" pending which tracks the tournament
has rights to use. This spec **is** that phase, scoped down to exactly
what was asked for: uploaded tracks a host controls from Broadcast
Controls, heard through `/watch-live`'s player.

Confirmed with the user (2026-09-04):
- Music starts/stops together with Go Live / End Broadcast — no separate
  on/off switch independent of `tournament_live`.
- Audio lives in `/watch-live`'s player only. `/broadcast` opened directly
  (a clubhouse TV/projector, not through `/watch-live`) stays silent for
  now — nothing here blocks adding that later by reusing the same hook.

## Data model additions

Same `season_year`-scoped, public-read/service-role-write convention as
every existing `broadcast_*` table (see `supabase/schema.sql`).

- **`broadcast_playlist_tracks`** — `id uuid pk`, `season_year int` (fk
  shape matches `broadcast_state`'s check, `between 2024 and 2034` — same
  range as `broadcast_display_year`, since a Tiger previewing 2026 should
  be able to test music too), `title text not null` (filename minus
  extension, editable later if ever needed — not now, YAGNI), `storage_path
  text not null`, `duration_seconds numeric not null`, `uploaded_at
  timestamptz not null default now()`. Playback order is `uploaded_at`
  ascending — no manual reordering in this pass.
- **`broadcast_state`** gains three columns (same table that already holds
  `current_scene`, `tournament_live`, etc.):
  - `audio_track_id uuid references broadcast_playlist_tracks(id) on delete
    set null` — the track playback is anchored to. `null` = no music
    selected/stopped.
  - `audio_started_at timestamptz` — when that anchor track began playing
    from its own beginning (offset 0). Same role as `scene_started_at`
    plays for scene rotation.
  - `audio_loop_mode text not null default 'all' check (audio_loop_mode in
    ('one', 'all'))`.
- RLS: `broadcast_playlist_tracks` gets the standard `for select using
  (true)` public-read policy, no write policy (service-role only, via host
  routes) — identical pattern to every other `broadcast_*` table.
- Realtime: add `broadcast_playlist_tracks` to the `supabase_realtime`
  publication (new tracks must appear in Broadcast Controls' list live);
  `broadcast_state`'s three new columns ride the table's existing Realtime
  publication for free.
- Ending the broadcast (existing `POST .../broadcast/live` with `live:
  false`) additionally sets `audio_track_id: null` — per the "music
  follows Go Live" decision, so `/watch-live` reliably goes silent the
  same moment it reverts to the pre-show placeholder.

## Storage

Reuses the exact pattern `lib/r2/client.ts` + the scorecards video sign/
confirm routes already established — same bucket account, new key prefix
(`playlist/{season_year}/{uuid}.{ext}`) so audio and shot video don't
collide. No new environment variables.

Track duration is captured **client-side at upload time**: before
uploading, the browser loads the file into a throwaway `<audio>` element,
reads `.duration` once `loadedmetadata` fires, and sends that number to
`.../playlist/confirm` alongside the storage path. No server-side audio
processing (no ffmpeg, no new service) — keeps this within "no new
servers."

## API routes (host-only, `requireHost()`, mirrors existing host routes)

All under `app/api/portal/tiger/broadcast/playlist/`:

| Route | Body | Effect |
|---|---|---|
| `upload/sign` | `{ seasonYear, extension }` | Presigned R2 PUT URL, mirrors `scorecards/video/sign` |
| `upload/confirm` | `{ seasonYear, title, storagePath, durationSeconds }` | Inserts `broadcast_playlist_tracks` row |
| `play` | `{ seasonYear, trackId }` | Sets `audio_track_id`, `audio_started_at: now()` on `broadcast_state` |
| `loop-mode` | `{ seasonYear, mode: "one" \| "all" }` | Sets `audio_loop_mode` |
| `delete` | `{ seasonYear, trackId }` | Deletes the R2 object + DB row; if it was the anchor track, also stops playback (`audio_track_id: null`) |

Every route 401s via `requireHost()` exactly like every existing Tiger
Center route — no new permission concept.

## Client architecture

### 1. Proportional scaling (`components/watch-live/BroadcastPlayer.tsx`, new)

A wrapper that:
- Renders a fixed `1920×1080` box containing the `/broadcast` iframe.
- Measures its own outer container's width via `ResizeObserver`.
- Applies `transform: scale(containerWidth / 1920)` with `transform-origin:
  top left` to the fixed box, and clips overflow on the outer container
  (`aspect-ratio: 16 / 9`).

This is a pure CSS/JS technique — no new dependency.

### 2. Player chrome

A control bar overlaid on `BroadcastPlayer`, shown on hover (desktop) or
always-on (touch), with:
- **Fullscreen** — native Fullscreen API (`requestFullscreen` /
  `exitFullscreen`) on the outer player container.
- **Mute/volume** — a mute-toggle icon plus a small volume slider revealed
  alongside it. Controls the `<audio>` element described below. Starts
  muted (browser autoplay policy requires a gesture before unmuted audio
  anyway — the first click here is that gesture).

### 3. Playlist playback (`lib/broadcast/useLiveBroadcastAudio.ts`, new hook)

Mirrors the existing `useLiveBroadcastState`/`useAutoScene` philosophy:
**no persistent server process** — every client independently computes
"which track, and how far into it" from timestamps, then a Realtime
subscription (same `postgres_changes` pattern on `broadcast_state`) keeps
it current when a host presses Play or changes loop mode.

- `loop_mode: "one"` — play `audio_track_id` with the native
  `audio.loop = true`; on (re)mount/track-change, seek once to
  `(now - audio_started_at) % duration_seconds` so someone joining
  mid-song hears the right spot, then let native looping take over.
- `loop_mode: "all"` — build the playlist ordered by `uploaded_at`,
  rotate it so `audio_track_id` is first, compute cumulative durations,
  and derive `elapsed_in_cycle = (now - audio_started_at) % total_duration`
  to find the current track + in-track offset. When the local `<audio>`
  element's `ended` event fires, advance to the next track in the rotated
  list client-side (no server write needed — every open tab derives the
  same answer independently from the same anchor timestamp, so they stay
  in sync with each other without coordinating).
- `audio_track_id === null` → hook returns "nothing playing"; the
  `<audio>` element is paused/unmounted.

This hook is used only by `WatchLiveExperience` for now (see Background —
`/broadcast` itself stays silent). It's written independent of where it's
called from, so wiring it into `/broadcast` later (clubhouse TV audio) is
a small follow-up, not a rewrite.

### 4. Broadcast Controls: Playlist tab

New tab in `components/portal/tiger/BroadcastControlsPanel.tsx` (or a new
sibling panel component if that file is already large — check at
implementation time):
- Upload button (file picker → sign → PUT to R2 → confirm, same 3-step
  flow `ScorecardEditor.tsx`'s video upload already follows).
- Track list, each row with a **Play** button (calls `.../playlist/play`).
- Loop-mode toggle (one/all).
- Delete (🗑) per track.

## Error handling

- Upload failures (sign, R2 PUT, or confirm) surface the same
  `setError(data.error ?? "...")` pattern every other Broadcast Controls
  action already uses — no new error UI pattern.
- If `/watch-live`'s audio fails to load (bad URL, network hiccup), the
  hook logs via `console.error` and leaves the player silent rather than
  throwing — broadcast failures must never break the page, same rule
  `getBroadcastPayload` already follows for state/config reads.
- A `broadcast_playlist_tracks` row whose R2 object is missing (deleted
  out-of-band) fails silently the same way — the `<audio>` element's own
  `error` event just skips to the next track in `"all"` mode, or leaves
  silence in `"one"` mode.

## Testing

- Manual walkthrough (same as Phase 1 of the broadcast system — no
  automated test harness for Realtime/timing behavior in this codebase
  yet): upload a track, press Play, confirm `/watch-live` plays it from
  the right spot on a second device/tab; toggle loop mode; End Broadcast
  and confirm audio stops; delete the currently-playing track and confirm
  it stops cleanly.
- `npx tsc --noEmit` and `npm run build` must both pass before calling this
  done, same as every other change in this repo.

## Definition of done

- `/watch-live`'s video area visually matches `/broadcast`'s real
  proportions at any screen size.
- Fullscreen and mute/volume both work on `/watch-live`.
- Tiger can upload a song in Broadcast Controls' new Playlist tab, press
  Play, and hear it (once unmuted) on `/watch-live` — synced to the right
  position for anyone who joins partway through.
- Loop-one and loop-all both behave as described.
- Ending the broadcast stops the music.
- `supabase/schema.sql` updated with the new table/columns, manual
  production migration step called out explicitly (same convention as
  every prior phase).
