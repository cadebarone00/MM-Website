# Watch Live Player + Broadcast Playlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/watch-live`'s embedded broadcast render at the real 16:9 broadcast's exact proportions, add player chrome (fullscreen + volume), and add a host-controlled "Broadcast Playlist" (upload songs, play, loop one/all) whose audio that player controls.

**Architecture:** Reuses this codebase's existing anchor-timestamp sync pattern (the same one `lib/broadcast/rotation.ts` uses for scene rotation) so playback stays in sync across every open tab with no persistent server process — clients derive "which track, how far into it" from a stored start time. Uploads reuse the existing presigned-R2-URL sign/confirm flow already built for shot video. New API routes are host-only (`requireHost()`), same as every other Tiger Center route.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Realtime, service-role writes / anon-key public reads), Cloudflare R2 (`lib/r2/client.ts`), `node:test` for unit tests (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md`

## Global Constraints

- Every new host route uses `requireHost()` and returns `{ ok: false, error }` with a matching status code on failure, `{ ok: true, ... }` on success — the exact shape every existing Tiger Center route already uses.
- `broadcast_playlist_tracks.season_year` allows `2024–2034` (matches `broadcast_display_year`'s range, not `broadcast_state`'s — a Tiger previewing an old year can test music too).
- No new environment variables — reuse `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` already configured for shot video.
- Music starts/stops with Go Live/End Broadcast — no independent on/off switch.
- `npx tsc --noEmit` and `npm run build` must both pass before any task is considered done.

---

## Task 1: Database schema + shared types

**Files:**
- Modify: `supabase/schema.sql` (append after line 1155, the end of the file)
- Modify: `lib/broadcast/types.ts`

**Interfaces:**
- Produces: `BroadcastState` gains `audioTrackId: string | null`, `audioStartedAt: string | null`, `audioLoopMode: "one" | "all"`. New `AudioLoopMode = "one" | "all"` type export.

- [ ] **Step 1: Append the migration to `supabase/schema.sql`**

Add at the end of the file:

```sql

-- === Watch Live Broadcast: Playlist ========================================
-- See docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md.
-- Host-uploaded audio for /watch-live's player, tied to Go Live/End
-- Broadcast (no separate on/off switch). Same season_year-scoped,
-- public-read/service-role-write convention as every broadcast_* table.

create table if not exists broadcast_playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2024 and 2034),
  title text not null,
  storage_path text not null,
  duration_seconds numeric not null check (duration_seconds > 0),
  uploaded_at timestamptz not null default now()
);
create index if not exists broadcast_playlist_tracks_season_idx on broadcast_playlist_tracks (season_year, uploaded_at);

alter table broadcast_playlist_tracks enable row level security;
drop policy if exists broadcast_playlist_tracks_select_all on broadcast_playlist_tracks;
create policy broadcast_playlist_tracks_select_all on broadcast_playlist_tracks for select using (true);

-- Which track anchors playback, when it started (offset 0), and whether it
-- loops alone or cycles through the whole playlist — every client derives
-- "which track, how far into it" from these via
-- lib/broadcast/playlistPlayback.ts's playlistTickAt(), the same anchor-
-- timestamp approach broadcast_state.scene_started_at already uses for
-- scene rotation.
alter table broadcast_state add column if not exists audio_track_id uuid references broadcast_playlist_tracks(id) on delete set null;
alter table broadcast_state add column if not exists audio_started_at timestamptz;
alter table broadcast_state add column if not exists audio_loop_mode text not null default 'all' check (audio_loop_mode in ('one', 'all'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_playlist_tracks'
  ) then
    alter publication supabase_realtime add table broadcast_playlist_tracks;
  end if;
end $$;
```

- [ ] **Step 2: Extend `BroadcastState` in `lib/broadcast/types.ts`**

Change:
```ts
export interface BroadcastState {
  seasonYear: number;
  currentScene: BroadcastScene;
  sceneStartedAt: string; // ISO timestamp
  automationMode: BroadcastAutomationMode;
  paused: boolean;
  tournamentLive: boolean;
  overlayText: string | null;
  overlayExpiresAt: string | null; // ISO timestamp; null whenever overlayText is null
}
```
to:
```ts
export type AudioLoopMode = "one" | "all";

export interface BroadcastState {
  seasonYear: number;
  currentScene: BroadcastScene;
  sceneStartedAt: string; // ISO timestamp
  automationMode: BroadcastAutomationMode;
  paused: boolean;
  tournamentLive: boolean;
  overlayText: string | null;
  overlayExpiresAt: string | null; // ISO timestamp; null whenever overlayText is null
  audioTrackId: string | null;
  audioStartedAt: string | null; // ISO timestamp; null whenever audioTrackId is null
  audioLoopMode: AudioLoopMode;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: New errors at every place that constructs a `BroadcastState` literal without the three new fields (at minimum `lib/broadcast/state.ts` and `app/broadcast/page.tsx`'s `previewPayload`). That's expected — Task 3 fixes `state.ts`; add the fields to `previewPayload` right now since it's a one-line fix not worth its own task:

In `app/broadcast/page.tsx`, inside `previewPayload`'s returned `state` object, add:
```ts
      audioTrackId: null,
      audioStartedAt: null,
      audioLoopMode: "all",
```

Run `npx tsc --noEmit` again — only `lib/broadcast/state.ts` should still error, which Task 3 fixes.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql lib/broadcast/types.ts app/broadcast/page.tsx
git commit -m "feat(broadcast): playlist schema + BroadcastState audio fields"
```

**Reminder for the human running this:** the schema change must also be pasted into the Supabase SQL Editor and run once in production, same as every prior phase (see `supabase/schema.sql`'s own header comment).

---

## Task 2: Pure playlist timing calculator (TDD)

**Files:**
- Create: `lib/broadcast/playlistPlayback.ts`
- Test: `lib/broadcast/playlistPlayback.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports from other new files).
- Produces: `PlaylistTrackTiming { id: string; url: string; durationSeconds: number }`, `PlaylistTick { track: PlaylistTrackTiming; offsetSeconds: number }`, `playlistTickAt(tracks: PlaylistTrackTiming[], anchorTrackId: string, loopMode: "one" | "all", anchorMs: number, nowMs: number): PlaylistTick | null`. Task 10 (the audio hook) is the consumer.

- [ ] **Step 1: Write the failing tests**

Create `lib/broadcast/playlistPlayback.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { playlistTickAt, type PlaylistTrackTiming } from "./playlistPlayback.ts";

const tracks: PlaylistTrackTiming[] = [
  { id: "a", url: "https://example.com/a.mp3", durationSeconds: 100 },
  { id: "b", url: "https://example.com/b.mp3", durationSeconds: 50 },
  { id: "c", url: "https://example.com/c.mp3", durationSeconds: 75 },
];

test("returns null when the anchor track isn't in the list", () => {
  assert.equal(playlistTickAt(tracks, "missing", "all", 0, 0), null);
});

test("loop 'one' starts the anchor track at offset 0", () => {
  const tick = playlistTickAt(tracks, "b", "one", 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("loop 'one' wraps the anchor track's own duration, ignoring every other track", () => {
  const tick = playlistTickAt(tracks, "b", "one", 0, 125_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 25); // 125s elapsed % 50s duration
});

test("loop 'all' starts on the anchor track at offset 0", () => {
  const tick = playlistTickAt(tracks, "b", "all", 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("loop 'all' advances to the next track in list order once the anchor's duration elapses", () => {
  // anchor "a" (100s), 110s elapsed -> 10s into "b"
  const tick = playlistTickAt(tracks, "a", "all", 0, 110_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 10);
});

test("loop 'all' rotates so the anchor plays first, then wraps to the start of that rotation", () => {
  // anchor "c" (75s) -> rotated order is [c, a, b], total 225s. 230s elapsed wraps to 5s into "c" again.
  const tick = playlistTickAt(tracks, "c", "all", 0, 230_000);
  assert.equal(tick?.track.id, "c");
  assert.equal(tick?.offsetSeconds, 5);
});

test("every client with the same anchor/tracks/loopMode agrees, regardless of when it starts watching", () => {
  const laterAnchor = 1_000_000;
  const now = laterAnchor + 110_000;
  const a = playlistTickAt(tracks, "a", "all", laterAnchor, now);
  const b = playlistTickAt(tracks, "a", "all", 0, now - laterAnchor);
  assert.equal(a?.track.id, b?.track.id);
  assert.equal(a?.offsetSeconds, b?.offsetSeconds);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test lib/broadcast/playlistPlayback.test.ts`
Expected: FAIL — `playlistPlayback.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/broadcast/playlistPlayback.ts`:

```ts
// lib/broadcast/playlistPlayback.ts

/**
 * Fixed-order playlist timing, same philosophy as lib/broadcast/rotation.ts's
 * sceneAt() — every client with the same anchor/tracks/loopMode computes the
 * identical answer, so playback stays in sync across every open tab with no
 * server process ticking on its own (see the spec's "How playback stays in
 * sync" section).
 */
export interface PlaylistTrackTiming {
  id: string;
  url: string;
  durationSeconds: number;
}

export interface PlaylistTick {
  track: PlaylistTrackTiming;
  offsetSeconds: number;
}

/**
 * Which track is playing and how far into it, given a fixed anchor track,
 * when that anchor started (offset 0), and the current playlist (ordered by
 * upload time — callers pass tracks pre-sorted). "one" loops the anchor
 * track forever, ignoring the rest of the list. "all" plays the full list as
 * one continuous cycle, rotated so the anchor track plays first.
 */
export function playlistTickAt(
  tracks: PlaylistTrackTiming[],
  anchorTrackId: string,
  loopMode: "one" | "all",
  anchorMs: number,
  nowMs: number
): PlaylistTick | null {
  const anchorIndex = tracks.findIndex((t) => t.id === anchorTrackId);
  if (anchorIndex === -1) return null;

  const elapsedSeconds = Math.max(0, (nowMs - anchorMs) / 1000);

  if (loopMode === "one") {
    const track = tracks[anchorIndex];
    const duration = Math.max(1, track.durationSeconds);
    return { track, offsetSeconds: elapsedSeconds % duration };
  }

  const rotated = [...tracks.slice(anchorIndex), ...tracks.slice(0, anchorIndex)];
  const totalDuration = rotated.reduce((sum, t) => sum + Math.max(1, t.durationSeconds), 0);
  let cursor = elapsedSeconds % totalDuration;

  for (const track of rotated) {
    const duration = Math.max(1, track.durationSeconds);
    if (cursor < duration) return { track, offsetSeconds: cursor };
    cursor -= duration;
  }

  // Unreachable given the loop above covers the full cycle, but keeps the
  // return type total rather than possibly undefined.
  return { track: rotated[0], offsetSeconds: 0 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test lib/broadcast/playlistPlayback.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/playlistPlayback.ts lib/broadcast/playlistPlayback.test.ts
git commit -m "feat(broadcast): pure playlist timing calculator"
```

---

## Task 3: Server-side playlist read + broadcast_state select

**Files:**
- Create: `lib/broadcast/playlist.ts`
- Modify: `lib/broadcast/state.ts`
- Create: `app/api/broadcast/playlist/route.ts`

**Interfaces:**
- Consumes: `createSupabaseServiceRoleClient` (`@/lib/supabase/server`), `getBroadcastDisplayYear` (`@/lib/broadcast/displayYear`), `r2PublicUrl` (`@/lib/r2/client`).
- Produces: `PlaylistTrack { id: string; title: string; url: string; durationSeconds: number; uploadedAt: string }`, `getBroadcastPlaylist(overrideYear?: number): Promise<{ seasonYear: number; tracks: PlaylistTrack[] }>` — Tasks 10, 12 consume this shape (client-side via the new GET route, server-side via direct import in `page.tsx`).

- [ ] **Step 1: Create `lib/broadcast/playlist.ts`**

```ts
// lib/broadcast/playlist.ts
//
// Server-only (pulls in @/lib/supabase/server via next/headers) — only call
// from a Route Handler or Server Component, same rule as
// lib/broadcast/state.ts.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { r2PublicUrl } from "@/lib/r2/client";

export interface PlaylistTrack {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  uploadedAt: string; // ISO timestamp
}

/**
 * Every uploaded track for whichever year Broadcast Controls has picked
 * (`broadcast_display_year`), oldest-uploaded first — that upload order is
 * playback order for "loop all" (see lib/broadcast/playlistPlayback.ts).
 * `overrideYear` exists only for symmetry with getBroadcastLeaderboard/
 * getBroadcastMatchPlay; nothing calls it with one today since the
 * Playlist tab only shows once live, on the real published year.
 */
export async function getBroadcastPlaylist(overrideYear?: number): Promise<{ seasonYear: number; tracks: PlaylistTrack[] }> {
  const seasonYear = overrideYear ?? (await getBroadcastDisplayYear());
  const service = createSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("broadcast_playlist_tracks")
    .select("id, title, storage_path, duration_seconds, uploaded_at")
    .eq("season_year", seasonYear)
    .order("uploaded_at", { ascending: true });

  if (error) {
    console.error("broadcast_playlist_tracks read failed, returning empty playlist:", error.message);
    return { seasonYear, tracks: [] };
  }

  const tracks: PlaylistTrack[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    url: r2PublicUrl(row.storage_path),
    durationSeconds: Number(row.duration_seconds),
    uploadedAt: row.uploaded_at,
  }));

  return { seasonYear, tracks };
}
```

- [ ] **Step 2: Extend `getBroadcastPayload` in `lib/broadcast/state.ts`**

In the `.select(...)` call, change:
```ts
      .select("current_scene, scene_started_at, automation_mode, paused, tournament_live, overlay_text, overlay_expires_at")
```
to:
```ts
      .select("current_scene, scene_started_at, automation_mode, paused, tournament_live, overlay_text, overlay_expires_at, audio_track_id, audio_started_at, audio_loop_mode")
```

In the returned `state` object, add three fields (after `overlayExpiresAt`):
```ts
    audioTrackId: stateRow?.audio_track_id ?? null,
    audioStartedAt: stateRow?.audio_started_at ?? null,
    audioLoopMode: stateRow?.audio_loop_mode === "one" ? "one" : "all",
```

- [ ] **Step 3: Create the public GET route**

Create `app/api/broadcast/playlist/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getBroadcastPlaylist } from "@/lib/broadcast/playlist";

/** Public, unauthenticated — re-fetched by /watch-live's player whenever Realtime signals a broadcast_playlist_tracks change (see lib/broadcast/usePlaylistTracks.ts). */
export async function GET() {
  const payload = await getBroadcastPlaylist();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this was the last place still constructing an incomplete `BroadcastState`).

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/playlist.ts lib/broadcast/state.ts app/api/broadcast/playlist/route.ts
git commit -m "feat(broadcast): server-side playlist read + broadcast_state audio fields"
```

---

## Task 4: Host route — upload/sign

**Files:**
- Create: `app/api/portal/tiger/broadcast/playlist/upload/sign/route.ts`
- Test: `app/api/portal/tiger/broadcast/playlist/upload/sign/route.test.ts`

**Interfaces:**
- Produces: `POST` accepting `{ extension: string }`, returns `{ ok: true, url: string, storagePath: string }` or `{ ok: false, error: string }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/portal/tiger/broadcast/playlist/upload/sign/route.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/upload/sign rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/upload/sign", {
    method: "POST",
    body: JSON.stringify({ extension: ".mp3" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/upload/sign/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/portal/tiger/broadcast/playlist/upload/sign/route.ts`:

```ts
// app/api/portal/tiger/broadcast/playlist/upload/sign/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireHost } from "@/lib/portal/requireHost";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { createR2Client, R2_BUCKET } from "@/lib/r2/client";

const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg"];

/**
 * First half of the direct-to-storage upload flow for playlist tracks —
 * same two-step pattern as .../scorecards/video/sign, different bucket
 * prefix (playlist/{year}/{uuid}{ext}) so audio and shot video never
 * collide. Always acts on whichever year Broadcast Controls has picked,
 * same as every other broadcast_* host route.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { extension } = await request.json();
  if (typeof extension !== "string" || !ALLOWED_EXTENSIONS.includes(extension.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Unsupported audio file type." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const storagePath = `playlist/${seasonYear}/${randomUUID()}${extension.toLowerCase()}`;

  try {
    const r2 = createR2Client();
    const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }), { expiresIn: 300 });
    return NextResponse.json({ ok: true, url, storagePath });
  } catch (err) {
    console.error("playlist/upload/sign: failed to create R2 presigned URL", { storagePath, err });
    return NextResponse.json({ ok: false, error: "Could not prepare that upload." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/upload/sign/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/broadcast/playlist/upload/sign/route.ts app/api/portal/tiger/broadcast/playlist/upload/sign/route.test.ts
git commit -m "feat(broadcast): playlist upload/sign route"
```

---

## Task 5: Host route — upload/confirm

**Files:**
- Create: `app/api/portal/tiger/broadcast/playlist/upload/confirm/route.ts`
- Test: `app/api/portal/tiger/broadcast/playlist/upload/confirm/route.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks at the type level (writes directly to `broadcast_playlist_tracks`).
- Produces: `POST` accepting `{ title: string; storagePath: string; durationSeconds: number }`, returns `{ ok: true, track: { id, title, url, durationSeconds, uploadedAt } }` or `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/portal/tiger/broadcast/playlist/upload/confirm/route.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/upload/confirm rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/upload/confirm", {
    method: "POST",
    body: JSON.stringify({ title: "Song", storagePath: "playlist/2027/abc.mp3", durationSeconds: 180 }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/upload/confirm/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/portal/tiger/broadcast/playlist/upload/confirm/route.ts`:

```ts
// app/api/portal/tiger/broadcast/playlist/upload/confirm/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { r2PublicUrl } from "@/lib/r2/client";

/**
 * Second half of the direct-to-storage upload flow — called once the
 * browser has already PUT the file to R2 using the presigned URL from
 * .../upload/sign. Never touches the file itself, same as
 * .../scorecards/video/confirm. `durationSeconds` is measured client-side
 * (see BroadcastControlsPanel's playlist upload code) — no server-side
 * audio processing.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { title, storagePath, durationSeconds } = await request.json();
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof storagePath !== "string" ||
    !storagePath.startsWith("playlist/") ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("broadcast_playlist_tracks")
    .insert({ season_year: seasonYear, title: title.trim(), storage_path: storagePath, duration_seconds: durationSeconds })
    .select("id, title, storage_path, duration_seconds, uploaded_at")
    .single();

  if (error || !data) {
    console.error("playlist/upload/confirm: failed to insert track", error);
    return NextResponse.json({ ok: false, error: "Uploaded, but could not save it to the playlist." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    track: { id: data.id, title: data.title, url: r2PublicUrl(data.storage_path), durationSeconds: Number(data.duration_seconds), uploadedAt: data.uploaded_at },
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/upload/confirm/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/broadcast/playlist/upload/confirm/route.ts app/api/portal/tiger/broadcast/playlist/upload/confirm/route.test.ts
git commit -m "feat(broadcast): playlist upload/confirm route"
```

---

## Task 6: Host route — play

**Files:**
- Create: `app/api/portal/tiger/broadcast/playlist/play/route.ts`
- Test: `app/api/portal/tiger/broadcast/playlist/play/route.test.ts`

**Interfaces:**
- Produces: `POST` accepting `{ trackId: string }`, returns `{ ok: true }` or `{ ok: false, error }`. Sets `broadcast_state.audio_track_id`/`audio_started_at`.

- [ ] **Step 1: Write the failing test**

Create `app/api/portal/tiger/broadcast/playlist/play/route.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/play rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/play", {
    method: "POST",
    body: JSON.stringify({ trackId: "11111111-1111-1111-1111-111111111111" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/play/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/portal/tiger/broadcast/playlist/play/route.ts`:

```ts
// app/api/portal/tiger/broadcast/playlist/play/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

/**
 * Sets which track anchors playback and restarts it from the beginning
 * (offset 0) — see lib/broadcast/playlistPlayback.ts for how every client
 * derives its own playhead from this anchor. Does not touch audio_loop_mode
 * — a host can Play a different track without losing their loop-mode
 * choice.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { trackId } = await request.json();
  if (typeof trackId !== "string" || !trackId) {
    return NextResponse.json({ ok: false, error: "Missing trackId." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();

  const { data: track, error: trackError } = await service
    .from("broadcast_playlist_tracks")
    .select("id")
    .eq("id", trackId)
    .eq("season_year", seasonYear)
    .maybeSingle();
  if (trackError) console.error("playlist/play: failed to look up track", trackError);
  if (!track) {
    return NextResponse.json({ ok: false, error: "That track isn't in this year's playlist." }, { status: 404 });
  }

  const { error } = await service
    .from("broadcast_state")
    .upsert({ season_year: seasonYear, audio_track_id: trackId, audio_started_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) {
    console.error("playlist/play: failed to update broadcast_state", error);
    return NextResponse.json({ ok: false, error: "Could not start that track." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/play/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/broadcast/playlist/play/route.ts app/api/portal/tiger/broadcast/playlist/play/route.test.ts
git commit -m "feat(broadcast): playlist play route"
```

---

## Task 7: Host route — loop-mode

**Files:**
- Create: `app/api/portal/tiger/broadcast/playlist/loop-mode/route.ts`
- Test: `app/api/portal/tiger/broadcast/playlist/loop-mode/route.test.ts`

**Interfaces:**
- Produces: `POST` accepting `{ mode: "one" | "all" }`, returns `{ ok: true }` or `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/portal/tiger/broadcast/playlist/loop-mode/route.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/loop-mode rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/loop-mode", {
    method: "POST",
    body: JSON.stringify({ mode: "one" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/loop-mode/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/portal/tiger/broadcast/playlist/loop-mode/route.ts`:

```ts
// app/api/portal/tiger/broadcast/playlist/loop-mode/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { mode } = await request.json();
  if (mode !== "one" && mode !== "all") {
    return NextResponse.json({ ok: false, error: "Invalid loop mode." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("broadcast_state").upsert({ season_year: seasonYear, audio_loop_mode: mode, updated_at: new Date().toISOString() });
  if (error) {
    console.error("playlist/loop-mode: failed to update broadcast_state", error);
    return NextResponse.json({ ok: false, error: "Could not change loop mode." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/loop-mode/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/broadcast/playlist/loop-mode/route.ts app/api/portal/tiger/broadcast/playlist/loop-mode/route.test.ts
git commit -m "feat(broadcast): playlist loop-mode route"
```

---

## Task 8: Host route — delete

**Files:**
- Create: `app/api/portal/tiger/broadcast/playlist/delete/route.ts`
- Test: `app/api/portal/tiger/broadcast/playlist/delete/route.test.ts`

**Interfaces:**
- Produces: `POST` accepting `{ trackId: string }`, returns `{ ok: true }` or `{ ok: false, error }`. Deletes the R2 object, the DB row, and clears `broadcast_state.audio_track_id` if that track was playing.

- [ ] **Step 1: Write the failing test**

Create `app/api/portal/tiger/broadcast/playlist/delete/route.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/playlist/delete rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/playlist/delete", {
    method: "POST",
    body: JSON.stringify({ trackId: "11111111-1111-1111-1111-111111111111" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/delete/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/portal/tiger/broadcast/playlist/delete/route.ts`:

```ts
// app/api/portal/tiger/broadcast/playlist/delete/route.ts
import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { createR2Client, R2_BUCKET } from "@/lib/r2/client";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { trackId } = await request.json();
  if (typeof trackId !== "string" || !trackId) {
    return NextResponse.json({ ok: false, error: "Missing trackId." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();

  const { data: track, error: trackError } = await service
    .from("broadcast_playlist_tracks")
    .select("id, storage_path")
    .eq("id", trackId)
    .eq("season_year", seasonYear)
    .maybeSingle();
  if (trackError) console.error("playlist/delete: failed to look up track", trackError);
  if (!track) {
    return NextResponse.json({ ok: false, error: "That track isn't in this year's playlist." }, { status: 404 });
  }

  try {
    const r2 = createR2Client();
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: track.storage_path }));
  } catch (err) {
    console.error("playlist/delete: failed to delete R2 object, deleting the DB row anyway", { storagePath: track.storage_path, err });
  }

  const { error: deleteError } = await service.from("broadcast_playlist_tracks").delete().eq("id", trackId);
  if (deleteError) {
    console.error("playlist/delete: failed to delete track row", deleteError);
    return NextResponse.json({ ok: false, error: "Could not remove that track." }, { status: 500 });
  }

  // Stop playback cleanly if the deleted track was the one currently
  // anchoring it — otherwise every viewer keeps trying to play a URL that
  // no longer exists.
  const { error: stateError } = await service
    .from("broadcast_state")
    .update({ audio_track_id: null, audio_started_at: null, updated_at: new Date().toISOString() })
    .eq("season_year", seasonYear)
    .eq("audio_track_id", trackId);
  if (stateError) console.error("playlist/delete: failed to clear now-playing track", stateError);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/broadcast/playlist/delete/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/broadcast/playlist/delete/route.ts app/api/portal/tiger/broadcast/playlist/delete/route.test.ts
git commit -m "feat(broadcast): playlist delete route"
```

---

## Task 9: Stop music when the broadcast ends

**Files:**
- Modify: `app/api/portal/tiger/broadcast/live/route.ts`
- Test: `app/api/portal/tiger/broadcast/live/route.test.ts` (new — none exists today)

**Interfaces:**
- No new exports; behavior-only change to an existing route.

- [ ] **Step 1: Write the failing test**

Create `app/api/portal/tiger/broadcast/live/route.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/broadcast/live rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/broadcast/live", {
    method: "POST",
    body: JSON.stringify({ live: false }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/broadcast/live/route.test.ts`
Expected: FAIL — no test file existed before this task, so it can't yet have run; confirm it fails for the *right* reason first by temporarily checking it errors if `route.ts` were missing. Since `route.ts` already exists, this step instead just confirms the test passes immediately (the auth gate already exists) — **skip to Step 3 for the actual behavior change**, then re-run this test in Step 4 to confirm it still passes.

- [ ] **Step 3: Add the "stop music" behavior**

In `app/api/portal/tiger/broadcast/live/route.ts`, change the `!live` branch's upsert from:
```ts
    const { error } = await service.from("broadcast_state").upsert({ season_year: seasonYear, tournament_live: false, updated_at: new Date().toISOString() });
```
to:
```ts
    const { error } = await service
      .from("broadcast_state")
      .upsert({ season_year: seasonYear, tournament_live: false, audio_track_id: null, audio_started_at: null, updated_at: new Date().toISOString() });
```

Also update the file's top doc comment to mention this — after the existing sentence ending "...independent of live_active_season," add: "Also clears the playlist's now-playing track — music follows Go Live/End Broadcast, see the Watch Live Player + Broadcast Playlist spec."

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/broadcast/live/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/tiger/broadcast/live/route.ts app/api/portal/tiger/broadcast/live/route.test.ts
git commit -m "feat(broadcast): stop playlist music when broadcast ends"
```

---

## Task 10: Client hooks — live playlist tracks + audio playback

**Files:**
- Create: `lib/broadcast/usePlaylistTracks.ts`
- Create: `lib/broadcast/useLiveBroadcastAudio.ts`

**Interfaces:**
- Consumes: `PlaylistTrack` (`@/lib/broadcast/playlist`), `BroadcastState` (`@/lib/broadcast/types`), `playlistTickAt`/`PlaylistTrackTiming` (`@/lib/broadcast/playlistPlayback`), `createSupabaseBrowserClient` (`@/lib/supabase/client`).
- Produces: `usePlaylistTracks(seasonYear: number, initial: PlaylistTrack[]): PlaylistTrack[]`. `useLiveBroadcastAudio(state: BroadcastState, tracks: PlaylistTrack[]): { nowPlayingTitle: string | null; muted: boolean; setMuted: (muted: boolean) => void; volume: number; setVolume: (volume: number) => void }`. Task 11 (`BroadcastPlayer`) consumes both.

- [ ] **Step 1: Create `lib/broadcast/usePlaylistTracks.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";

/**
 * Keeps the playlist track list fresh with no page refresh — same
 * Realtime-then-refetch pattern as useLiveBroadcastData.ts. A track a host
 * just uploaded needs to show up (and be playable) for anyone already on
 * /watch-live without them reloading.
 */
export function usePlaylistTracks(seasonYear: number, initial: PlaylistTrack[]): PlaylistTrack[] {
  const [tracks, setTracks] = useState(initial);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/broadcast/playlist", { cache: "no-store" });
      if (res.ok) setTracks((await res.json()).tracks);
    } catch {
      // A missed refresh just means the list is briefly stale — never worth breaking the player over.
    }
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`broadcast-playlist-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_playlist_tracks", filter: `season_year=eq.${seasonYear}` }, reload)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [seasonYear, reload]);

  return tracks;
}
```

- [ ] **Step 2: Create `lib/broadcast/useLiveBroadcastAudio.ts`**

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { playlistTickAt, type PlaylistTrackTiming } from "./playlistPlayback";
import type { BroadcastState } from "./types";
import type { PlaylistTrack } from "./playlist";

/**
 * Drives the actual <audio> playback for the Broadcast Playlist (see
 * docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md).
 * No server round-trip keeps this ticking — every client independently
 * derives "which track, how far into it" from `state.audioStartedAt` via
 * playlistTickAt(), the same anchor-timestamp approach
 * lib/broadcast/rotation.ts's sceneAt() already uses for scene rotation.
 * `state`/`tracks` are expected to already be live (the caller owns
 * useLiveBroadcastState/usePlaylistTracks) — this hook only owns the
 * <audio> element and the mute/volume UI state.
 */
export function useLiveBroadcastAudio(state: BroadcastState, tracks: PlaylistTrack[]) {
  const [audio] = useState(() => (typeof window !== "undefined" ? new Audio() : null));
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const nowPlayingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!audio) return;

    if (!state.tournamentLive || !state.audioTrackId || !state.audioStartedAt) {
      audio.pause();
      audio.removeAttribute("src");
      nowPlayingIdRef.current = null;
      setNowPlayingId(null);
      return;
    }

    const timings: PlaylistTrackTiming[] = [...tracks].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    const anchorMs = new Date(state.audioStartedAt).getTime();
    const loopMode = state.audioLoopMode;
    const audioTrackId = state.audioTrackId;

    function applyTick() {
      const tick = playlistTickAt(timings, audioTrackId, loopMode, anchorMs, Date.now());
      if (!tick) return; // the anchor track isn't in `tracks` yet — a pending usePlaylistTracks refresh will retry this effect
      audio!.loop = loopMode === "one";
      if (audio!.src !== tick.track.url) {
        audio!.src = tick.track.url;
        audio!.currentTime = tick.offsetSeconds;
      }
      audio!.play().catch(() => {
        // Autoplay blocked until the viewer interacts (e.g. the mute button) — expected, not an error.
      });
      nowPlayingIdRef.current = tick.track.id;
      setNowPlayingId(tick.track.id);
    }

    applyTick();

    function onEnded() {
      if (loopMode === "one") return; // native audio.loop already handles this track looping itself
      applyTick(); // re-derive from elapsed time — lands at (approximately) the next track's start
    }
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [audio, state.tournamentLive, state.audioTrackId, state.audioStartedAt, state.audioLoopMode, tracks]);

  useEffect(() => {
    if (audio) audio.muted = muted;
  }, [audio, muted]);

  useEffect(() => {
    if (audio) audio.volume = volume;
  }, [audio, volume]);

  const nowPlayingTitle = tracks.find((t) => t.id === nowPlayingId)?.title ?? null;

  return { nowPlayingTitle, muted, setMuted, volume, setVolume };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/broadcast/usePlaylistTracks.ts lib/broadcast/useLiveBroadcastAudio.ts
git commit -m "feat(broadcast): live playlist tracks + audio playback hooks"
```

---

## Task 11: `BroadcastPlayer` — proportional scaling + fullscreen + volume

**Files:**
- Create: `components/watch-live/BroadcastPlayer.tsx`
- Modify: `components/watch-live/WatchLiveExperience.tsx`
- Modify: `app/watch-live/page.tsx`

**Interfaces:**
- Consumes: `useLiveBroadcastAudio` (Task 10), `BroadcastState` / `PlaylistTrack` types.
- Produces: `BroadcastPlayer({ state, tracks }: { state: BroadcastState; tracks: PlaylistTrack[] })` — a drop-in replacement for the raw `<iframe src="/broadcast">` currently in `WatchLiveExperience`.

- [ ] **Step 1: Create `components/watch-live/BroadcastPlayer.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { useLiveBroadcastAudio } from "@/lib/broadcast/useLiveBroadcastAudio";
import type { BroadcastState } from "@/lib/broadcast/types";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";

// The real /broadcast page is laid out for a real desktop/TV window (fixed
// rem/px sizing — see components/broadcast/scenes/*). Rendering it at this
// native size and scaling the whole box down uniformly (rather than letting
// it reflow inside a small responsive iframe) is what makes /watch-live
// look like a shrunk photo of the real broadcast instead of a differently
// laid-out mobile version. See the spec's "Proportions fix" section.
const NATIVE_WIDTH = 1920;
const NATIVE_HEIGHT = 1080;

export function BroadcastPlayer({ state, tracks }: { state: BroadcastState; tracks: PlaylistTrack[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const { nowPlayingTitle, muted, setMuted, volume, setVolume } = useLiveBroadcastAudio(state, tracks);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setScale(width / NATIVE_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  }

  function toggleMuted() {
    setMuted(!muted);
    if (muted && volume === 0) setVolume(1);
  }

  return (
    <div ref={containerRef} className="group relative aspect-video w-full overflow-hidden bg-ink-900">
      <div className="absolute left-0 top-0" style={{ width: NATIVE_WIDTH, height: NATIVE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <iframe className="h-full w-full border-0" src="/broadcast" title="Maroon Masters live broadcast" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" onClick={toggleMuted} aria-label={muted ? "Unmute" : "Mute"} className="text-white">
          {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const next = Number(e.target.value);
            setVolume(next);
            setMuted(next === 0);
          }}
          aria-label="Volume"
          className="w-20 accent-maroon-700 sm:w-28"
        />
        {nowPlayingTitle && <span className="flex-1 truncate font-condensed text-xs uppercase tracking-wide text-white/80">{nowPlayingTitle}</span>}
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="ml-auto text-white">
          {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `WatchLiveExperience.tsx`**

Replace the file's contents with (changes: takes `initialTracks` too; keeps the full `state` object instead of destructuring only `tournamentLive`; renders `<BroadcastPlayer>` instead of the raw iframe):

```tsx
"use client";

import Image from "next/image";
import { MessageCircle, Video } from "lucide-react";
import { useState } from "react";
import { RoundCountdown } from "@/components/ui/RoundCountdown";
import { useLiveBroadcastState } from "@/lib/broadcast/useLiveBroadcastState";
import { usePlaylistTracks } from "@/lib/broadcast/usePlaylistTracks";
import { BroadcastPlayer } from "./BroadcastPlayer";
import type { BroadcastState } from "@/lib/broadcast/types";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";

type Tab = "comments" | "highlights";

const tabs: { id: Tab; label: string }[] = [
  { id: "comments", label: "Comments" },
  { id: "highlights", label: "Highlights" },
];

/**
 * Set this to the YouTube video ID for the scheduled/live broadcast (not the
 * whole YouTube URL). Until it is set, the page retains the custom countdown
 * state rather than showing an inactive player.
 */
const YOUTUBE_LIVE_VIDEO_ID = process.env.NEXT_PUBLIC_YOUTUBE_LIVE_VIDEO_ID || null;

export function WatchLiveExperience({
  seasonYear,
  initialState,
  initialTracks,
}: {
  seasonYear: number;
  initialState: BroadcastState;
  initialTracks: PlaylistTrack[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("comments");
  // Same Realtime-then-refetch pattern /broadcast itself uses (see
  // useLiveBroadcastState.ts) — so ending the broadcast in Broadcast
  // Controls swaps this page back to the placeholder immediately, no
  // manual refresh needed.
  const state = useLiveBroadcastState(seasonYear, initialState);
  const tracks = usePlaylistTracks(seasonYear, initialTracks);

  return (
    <main>
      <section className="mx-auto w-full max-w-[1200px] bg-ink-900">
        {YOUTUBE_LIVE_VIDEO_ID ? (
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_LIVE_VIDEO_ID}?rel=0`}
            title="Maroon Masters live broadcast"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : state.tournamentLive ? (
          // Tiger has gone live (Broadcast Controls) — embed the real,
          // shared broadcast (auto-rotating leaderboard/match-play scenes;
          // see app/broadcast/page.tsx) instead of the pre-show placeholder,
          // scaled to the real 16:9 proportions with fullscreen/volume
          // chrome. No real camera video exists yet (that's Phase 3, not built).
          <BroadcastPlayer state={state} tracks={tracks} />
        ) : (
          <div className="relative aspect-video w-full overflow-hidden bg-ink-900">
            <Image src="/loading/mobile.png" alt="" fill priority sizes="100vw" className="object-cover lg:hidden" />
            <Image src="/loading/desktop.png" alt="" fill priority sizes="(max-width: 1200px) 100vw, 1200px" className="hidden object-cover lg:block" />
            <div className="absolute inset-0 flex items-center justify-center bg-maroon-900/20 px-4 text-center">
              <div className="flex flex-col items-center">
                <p className="mb-2 font-condensed text-xs font-bold uppercase tracking-eyebrow text-white sm:text-sm">Maroon Masters On The Range</p>
                <div className="inline-flex w-fit items-center justify-center rounded-sm border border-white/30 bg-maroon-900/75 px-3 py-2 text-cream-50 shadow-md">
                  <RoundCountdown className="text-center" />
                </div>
                <p className="mt-2 font-condensed text-xs font-bold uppercase tracking-eyebrow text-white sm:text-sm">January 5th 2027</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[720px] px-4 pb-12 pt-6 sm:px-7 sm:pt-8">
        <div className="flex justify-center border-b border-ink-200" role="tablist" aria-label="Watch live content">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative px-5 pb-3 font-condensed text-sm font-bold uppercase tracking-wide transition-colors",
                  selected ? "text-maroon-700" : "text-ink-400 hover:text-ink-700",
                ].join(" ")}
              >
                {tab.label}
                {selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
              </button>
            );
          })}
        </div>

        <div className="pt-8" role="tabpanel">
          {activeTab === "comments" ? <CommentsPanel /> : <HighlightsPanel />}
        </div>
      </section>
    </main>
  );
}

function CommentsPanel() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-ink-100 bg-white px-6 text-center shadow-xs">
      <MessageCircle size={22} className="text-maroon-700" aria-hidden="true" />
      <p className="m-0 font-serif text-lg font-semibold text-ink-900">Join the conversation</p>
      <p className="m-0 max-w-sm text-sm text-ink-500">Live comments will appear here during the broadcast.</p>
    </div>
  );
}

function HighlightsPanel() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-ink-100 bg-white px-6 text-center shadow-xs">
      <Video size={22} className="text-maroon-700" aria-hidden="true" />
      <p className="m-0 font-serif text-lg font-semibold text-ink-900">Broadcast highlights</p>
      <p className="m-0 max-w-sm text-sm text-ink-500">Key moments from the round will be collected here.</p>
    </div>
  );
}
```

- [ ] **Step 3: Update `app/watch-live/page.tsx` to also fetch the playlist**

```tsx
import { WatchLiveExperience } from "@/components/watch-live/WatchLiveExperience";
import { getBroadcastPayload } from "@/lib/broadcast/state";
import { getBroadcastPlaylist } from "@/lib/broadcast/playlist";

export const dynamic = "force-dynamic";

export default async function WatchLivePage() {
  const [{ seasonYear, state }, { tracks }] = await Promise.all([getBroadcastPayload(), getBroadcastPlaylist()]);
  return <WatchLiveExperience seasonYear={seasonYear} initialState={state} initialTracks={tracks} />;
}
```

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: exits 0, `/watch-live` still listed as a dynamic (ƒ) route.

- [ ] **Step 5: Commit**

```bash
git add components/watch-live/BroadcastPlayer.tsx components/watch-live/WatchLiveExperience.tsx app/watch-live/page.tsx
git commit -m "feat(watch-live): scaled broadcast player with fullscreen + volume"
```

---

## Task 12: Broadcast Controls — Playlist section

**Files:**
- Modify: `components/portal/tiger/BroadcastControlsPanel.tsx`

**Interfaces:**
- Consumes: the five host routes from Tasks 4–7 (`upload/sign`, `upload/confirm`, `play`, `loop-mode`, `delete`), `PlaylistTrack` type, `BroadcastState`'s `audioTrackId`/`audioLoopMode` fields.
- No new exports — this is UI added to an existing component.

- [ ] **Step 1: Extend the component's props and state**

`BroadcastControlsPanel` currently takes `{ initialDisplayYear, initialState, config }`. Add a fourth prop `initialTracks: PlaylistTrack[]` (its caller, `app/portal/admin/broadcast-controls/page.tsx`, is updated in Step 5).

At the top of `components/portal/tiger/BroadcastControlsPanel.tsx`, add imports:

```ts
import type { PlaylistTrack } from "@/lib/broadcast/playlist";
```

Change the function signature to:

```tsx
export function BroadcastControlsPanel({
  initialDisplayYear,
  initialState,
  initialTracks,
  config,
}: {
  initialDisplayYear: number;
  initialState: BroadcastState;
  initialTracks: PlaylistTrack[];
  config: BroadcastConfig;
}) {
```

Add local state near the existing `announcementText`/`announcementBusy` declarations:

```ts
  const [tracks, setTracks] = useState(initialTracks);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState<string | null>(null);
```

- [ ] **Step 2: Add the upload/play/loop-mode/delete handlers**

Add these functions inside the component, alongside `postAnnouncement`/`clearAnnouncement`:

```tsx
  async function uploadTrack(file: File) {
    setUploadBusy(true);
    setError(null);
    try {
      const extension = "." + (file.name.split(".").pop() ?? "mp3").toLowerCase();
      const signRes = await fetch("/api/portal/tiger/broadcast/playlist/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension }),
      });
      const signData = await signRes.json();
      if (!signData.ok) {
        setError(signData.error ?? "Could not prepare that upload.");
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signData.url);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (status ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
        xhr.send(file);
      });

      const durationSeconds = await new Promise<number>((resolve, reject) => {
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(probe.duration);
        probe.onerror = () => reject(new Error("Could not read that file's length."));
        probe.src = URL.createObjectURL(file);
      });

      const confirmRes = await fetch("/api/portal/tiger/broadcast/playlist/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, ""), storagePath: signData.storagePath, durationSeconds }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmData.ok) {
        setError(confirmData.error ?? "Uploaded, but could not save it to the playlist.");
        return;
      }
      setTracks((current) => [...current, confirmData.track]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function playTrack(trackId: string) {
    setPlaylistBusy(trackId);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not start that track.");
        return;
      }
      setState((current) => ({ ...current, audioTrackId: trackId, audioStartedAt: new Date().toISOString() }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function setLoopMode(mode: "one" | "all") {
    setPlaylistBusy(`loop-${mode}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/loop-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not change loop mode.");
        return;
      }
      setState((current) => ({ ...current, audioLoopMode: mode }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function deleteTrack(trackId: string) {
    setPlaylistBusy(`delete-${trackId}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not remove that track.");
        return;
      }
      setTracks((current) => current.filter((t) => t.id !== trackId));
      setState((current) => (current.audioTrackId === trackId ? { ...current, audioTrackId: null, audioStartedAt: null } : current));
    } finally {
      setPlaylistBusy(null);
    }
  }
```

- [ ] **Step 3: Add the Playlist section to the JSX**

Inside the `isLive` branch (the `else` side of `{!isLive ? (...) : (...)}`), immediately after the closing `</section>` of the existing Announcement `<section>`, add:

```tsx
          <section className="mt-8 rounded-lg border-2 border-stone-300 p-4">
            <h2 className="font-serif text-lg font-bold text-ink-900">Broadcast Playlist</h2>
            <p className="mt-1 font-sans text-xs text-ink-500">Plays on /watch-live while the broadcast is live. Stops automatically when you end the broadcast.</p>

            <label className="mt-3 inline-block cursor-pointer rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800">
              {uploadBusy ? "Uploading…" : "Upload Song"}
              <input
                type="file"
                accept="audio/*"
                disabled={uploadBusy}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadTrack(file);
                }}
              />
            </label>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={playlistBusy !== null}
                onClick={() => setLoopMode("one")}
                className={[
                  "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
                  state.audioLoopMode === "one" ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                ].join(" ")}
              >
                Loop One
              </button>
              <button
                type="button"
                disabled={playlistBusy !== null}
                onClick={() => setLoopMode("all")}
                className={[
                  "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
                  state.audioLoopMode === "all" ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                ].join(" ")}
              >
                Loop All
              </button>
            </div>

            {tracks.length === 0 ? (
              <p className="mt-4 font-sans text-sm text-ink-500">No songs uploaded yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {tracks.map((track) => {
                  const isPlaying = state.audioTrackId === track.id;
                  return (
                    <li key={track.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-stone-200 px-3 py-2">
                      <span className={["truncate font-sans text-sm", isPlaying ? "font-semibold text-maroon-700" : "text-ink-700"].join(" ")}>
                        {isPlaying ? "▶ " : ""}
                        {track.title}
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={playlistBusy !== null || isPlaying}
                          onClick={() => playTrack(track.id)}
                          className="rounded-lg border-2 border-stone-300 px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {playlistBusy === track.id ? "Starting…" : "Play"}
                        </button>
                        <button
                          type="button"
                          disabled={playlistBusy !== null}
                          onClick={() => deleteTrack(track.id)}
                          className="rounded-lg border-2 border-stone-300 px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {playlistBusy === `delete-${track.id}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
```

- [ ] **Step 4: Update the caller to pass `initialTracks`**

In `app/portal/admin/broadcast-controls/page.tsx`, find where `getBroadcastPayload`/`getBroadcastDisplayYear` (or equivalent) are read and `<BroadcastControlsPanel>` is rendered. Add:

```ts
import { getBroadcastPlaylist } from "@/lib/broadcast/playlist";
```

Fetch `{ tracks }` alongside whatever this page already fetches (mirror the `Promise.all` shape used in Task 11's `app/watch-live/page.tsx` if this page doesn't already batch its reads), and pass `initialTracks={tracks}` to `<BroadcastControlsPanel>`.

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add components/portal/tiger/BroadcastControlsPanel.tsx app/portal/admin/broadcast-controls/page.tsx
git commit -m "feat(broadcast): Playlist tab in Broadcast Controls"
```

---

## Task 13: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run every unit test**

Run: `npm test`
Expected: all tests pass, including every new `route.test.ts` and `playlistPlayback.test.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual walkthrough (requires the schema migration already run in Supabase — see Task 1's reminder)**

1. Open Broadcast Controls, go live, open its new Playlist section.
2. Upload a short audio file. Confirm it appears in the track list.
3. Press Play on it. Confirm `state.audioTrackId` is set (visible via the "▶" marker in the list).
4. Open `/watch-live` in a second tab/device. Confirm the video area matches `/broadcast`'s real proportions at different window widths (resize the browser).
5. Click the mute/volume icon — confirm audio starts (this is the required user gesture).
6. Click fullscreen — confirm the player fills the screen and the control bar still works.
7. Toggle Loop One vs Loop All in Broadcast Controls; confirm behavior differs as described in the spec.
8. Press End Broadcast. Confirm `/watch-live` reverts to the placeholder AND audio stops, with no manual refresh.
9. Delete the currently-playing track from Broadcast Controls (while live again). Confirm playback stops cleanly.

- [ ] **Step 5: Update the spec's status if anything diverged**

If any manual-walkthrough step behaved differently than described, update `docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md` to match reality (same convention this repo already follows — see that spec's own citation of the Watch Live Broadcast spec's "reconciled with shipped code" note).

- [ ] **Step 6: Final commit (only if Step 5 changed anything)**

```bash
git add docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md
git commit -m "docs: reconcile Watch Live Player + Broadcast Playlist spec with shipped code"
```
