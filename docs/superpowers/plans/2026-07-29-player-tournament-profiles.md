# Player Tournament Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the existing per-player tournament scorecard page into a golf-app-style "Player Tournament Profile," add a new horizontal leaderboard scroll strip on both the website home page and the Scorekeeper player portal, and make every player avatar/name in tournament context (leaderboard rows, match displays) a link into that profile.

**Architecture:** Almost entirely `MM-Website` work, reusing the existing live/static data split (`useLiveTournament` for the current season, static `Tournament` objects for past years) and existing route (`app/leaderboard/[slug]/players/[player]/page.tsx`). One task touches `MM-Scorekeeper` to add the portal-side strip, sourced from Scorekeeper's own already-existing public `/api/live-feed` route (proxied under `/portal/api/live-feed`) — no new backend endpoint needed anywhere in this plan.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS 4 with `@theme` design tokens (`maroon-700`, `gold-400`, `ink-900`, `cream-50`, etc. — see `app/globals.css`).

## Global Constraints

- Use existing Tailwind design tokens (`maroon-700`, `gold-400`, `ink-900`, `cream-50`, `score-under/even/over`, etc.) — never raw hex — except inside `components/ui/Avatar.tsx`, which already uses raw hex for its ring shadow and is not being changed here.
- Player route params are the roster short name lowercased (e.g. `"cade"`), consistent everywhere already: `app/leaderboard/[slug]/players/[player]/page.tsx`, `app/teams/stats/players/[player]/page.tsx`, `ScorecardRow`'s hole links. Every new link in this plan uses `player.toLowerCase()` the same way — never `PlayerProfile.slug` (the longer `"cade-barone"` form used only for `avatarSrc`/`fullName` lookups).
- No frontend test runner exists in `MM-Website` (confirmed: no vitest/jest, no `.test.ts`/`.spec.ts` files). Each task's verification step is `npx tsc --noEmit` plus `npm run lint`; the final task is a manual browser walkthrough.
- All MM-Website file paths are relative to `C:\Users\Owner\Documents\GitHub\MM-Website`. The one MM-Scorekeeper task's paths are relative to `C:\Users\Owner\Documents\GitHub\MM-Scorekeeper`.
- Video stays a styled placeholder — no real video wiring in this plan (explicitly out of scope per the design spec).
- The Teams bio page (`app/teams/stats/players/[player]/page.tsx`) is not modified except that other pages now link to it more often — its own content/route is untouched.

---

### Task 1: `HoleStrip` component

**Files:**
- Create: `components/scorecard/HoleStrip.tsx`

**Interfaces:**
- Consumes: `RoundScorecard` (`@/lib/data`), `Team` (`@/lib/data/types`).
- Produces: `HoleStrip({ round: RoundScorecard, tournamentSlug: string, player: string, currentHole?: number })` — a horizontally-scrollable row of 18 circular hole buttons. Consumed by Task 4.

- [ ] **Step 1: Create the component**

`components/scorecard/HoleStrip.tsx`:
```tsx
import Link from "next/link";
import type { RoundScorecard } from "@/lib/data";

/**
 * A tap-through row of every hole in a round, modeled on the circular hole
 * picker Scorekeeper's own host tools already use. The "current" hole is
 * the last one with a posted score — not selectable UI state, just a
 * read of the data, so it advances automatically as scores come in.
 */
export function HoleStrip({
  round,
  tournamentSlug,
  player,
}: {
  round: RoundScorecard;
  tournamentSlug: string;
  player: string;
}) {
  const playedHoles = round.holes.filter((h) => h.score > 0);
  const currentHole = playedHoles.length > 0 ? playedHoles[playedHoles.length - 1].hole : null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {round.holes.map((hole) => {
        const isCurrent = hole.hole === currentHole;
        const isPlayed = hole.score > 0;
        return (
          <Link
            key={hole.hole}
            href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}/${round.round}/${hole.hole}`}
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-condensed text-sm font-bold transition-colors",
              isCurrent
                ? "border-maroon-700 bg-maroon-700 text-white"
                : isPlayed
                  ? "border-ink-200 bg-ink-100 text-ink-700"
                  : "border-ink-200 bg-white text-ink-400",
            ].join(" ")}
          >
            {hole.hole}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (unconsumed so far, but must parse clean).

- [ ] **Step 3: Commit**

```bash
git add components/scorecard/HoleStrip.tsx
git commit -m "feat: add HoleStrip 18-hole tap-through component"
```

---

### Task 2: `PlayerProfileHeader` component

**Files:**
- Create: `components/scorecard/PlayerProfileHeader.tsx`

**Interfaces:**
- Consumes: `Avatar` (`@/components/ui/Avatar`), `Team` (`@/lib/data/types`).
- Produces: `PlayerProfileHeader({ backHref, backLabel, displayName, avatarSrc, team, editionLabel, bio, bioHref, live, position, total, thru })` — the new header replacing the duplicated header markup in both the static and live player-scorecard pages. Consumed by Tasks 5 and 6.

- [ ] **Step 1: Create the component**

`components/scorecard/PlayerProfileHeader.tsx`:
```tsx
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { Team } from "@/lib/data/types";

const BIO_TRUNCATE_CHARS = 220;

function truncateBio(bio: string): string {
  if (bio.length <= BIO_TRUNCATE_CHARS) return bio;
  const cut = bio.slice(0, BIO_TRUNCATE_CHARS);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px] px-4">
      <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{value}</span>
      <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
    </div>
  );
}

export function PlayerProfileHeader({
  backHref,
  backLabel,
  displayName,
  avatarSrc,
  team,
  editionLabel,
  bio,
  bioHref,
  live,
  position,
  total,
  thru,
}: {
  backHref: string;
  backLabel: string;
  displayName: string;
  avatarSrc: string | null;
  team: Team;
  editionLabel: string;
  bio: string | null;
  bioHref: string;
  live: boolean;
  position: number | null;
  total: number | null;
  thru: string | null;
}) {
  return (
    <div className="mb-6">
      <Link
        href={backHref}
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        ← {backLabel}
      </Link>

      <div className="flex items-start gap-4 mt-4 mb-4 flex-wrap">
        <Avatar name={displayName} src={avatarSrc} size="xl" team={team} className="h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]" />
        <div className="min-w-0">
          {live && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-score-under/10 px-2 py-0.5 mb-1 font-condensed text-3xs font-bold uppercase tracking-wide text-score-under">
              ● Watch Live
            </span>
          )}
          <div className="font-condensed text-3xs font-bold uppercase tracking-eyebrow text-gold-700">Official Score Card</div>
          <h1 className="m-0 font-sans text-[28px] font-extrabold text-ink-900 sm:text-[32px]">{displayName}</h1>
          <span className={["font-condensed text-xs font-semibold tracking-wide uppercase", team === "maroon" ? "text-maroon-600" : "text-ink-500"].join(" ")}>
            {team === "maroon" ? "Team Maroon" : "Team White"} · {editionLabel}
          </span>
        </div>
      </div>

      {bio && (
        <p className="font-sans text-sm leading-relaxed text-ink-600 max-w-[640px]">
          {truncateBio(bio)}{" "}
          <Link href={bioHref} className="font-semibold text-maroon-700 hover:underline whitespace-nowrap">
            Full Bio →
          </Link>
        </p>
      )}

      {(position != null || total != null || thru != null) && (
        <div className="flex divide-x divide-ink-100 mt-4 bg-cream-50 border border-ink-100 rounded-md w-fit">
          {position != null && <Stat label="Position" value={String(position)} />}
          {total != null && <Stat label="Total" value={total === 0 ? "E" : total > 0 ? `+${total}` : String(total)} />}
          {thru != null && <Stat label="Thru" value={thru} />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/scorecard/PlayerProfileHeader.tsx
git commit -m "feat: add PlayerProfileHeader component"
```

---

### Task 3: `RoundVideoPlaceholder` component

**Files:**
- Create: `components/scorecard/RoundVideoPlaceholder.tsx`

**Interfaces:**
- Produces: `RoundVideoPlaceholder({ roundLabel: string })`. Consumed by Task 4.

- [ ] **Step 1: Create the component**

`components/scorecard/RoundVideoPlaceholder.tsx`:
```tsx
import { Video } from "lucide-react";

/** Styled "coming soon" placeholder — no real video wiring in this project. */
export function RoundVideoPlaceholder({ roundLabel }: { roundLabel: string }) {
  return (
    <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink-200 bg-ink-50 py-10 text-center">
      <Video size={28} className="text-ink-300" />
      <p className="m-0 font-sans text-sm text-ink-400">{roundLabel} highlights coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/scorecard/RoundVideoPlaceholder.tsx
git commit -m "feat: add RoundVideoPlaceholder component"
```

---

### Task 4: Wire `HoleStrip` and `RoundVideoPlaceholder` into `PlayerScorecardView`

**Files:**
- Modify: `components/scorecard/PlayerScorecardView.tsx` (full file)

**Interfaces:**
- Consumes: `HoleStrip` (Task 1), `RoundVideoPlaceholder` (Task 3).
- No prop signature change — `PlayerScorecardView`'s existing `{ scorecard, tournamentSlug }` props are unchanged, so every existing caller keeps working with no edits.

- [ ] **Step 1: Replace the file**

`components/scorecard/PlayerScorecardView.tsx`:
```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ScorecardRow } from "./ScorecardRow";
import { CourseInfoHeader } from "./CourseInfoHeader";
import { RoundStatsBar } from "./RoundStatsBar";
import { ScorecardLegend } from "./ScorecardLegend";
import { HoleStrip } from "./HoleStrip";
import { RoundVideoPlaceholder } from "./RoundVideoPlaceholder";
import type { PlayerScorecard } from "@/lib/data";

export function PlayerScorecardView({ scorecard, tournamentSlug }: { scorecard: PlayerScorecard; tournamentSlug: string }) {
  const [round, setRound] = useState(String(scorecard.rounds[0].round));
  const active = scorecard.rounds.find((r) => String(r.round) === round) ?? scorecard.rounds[0];

  return (
    <div>
      <div className="relative mb-3 inline-block w-full sm:w-auto">
        <select
          value={round}
          onChange={(e) => setRound(e.target.value)}
          className="w-full appearance-none rounded-sm border border-ink-200 bg-white py-2 pl-3 pr-9 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-900 sm:w-auto sm:text-sm"
        >
          {scorecard.rounds.map((r) => (
            <option key={r.round} value={String(r.round)}>
              Round {r.round} – {r.course}
              {r.format ? ` (${r.format})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
      </div>

      <div className="mb-4">
        <HoleStrip round={active} tournamentSlug={tournamentSlug} player={scorecard.player} />
      </div>

      <RoundStatsBar round={active} />
      <div className="overflow-x-auto">
        <CourseInfoHeader round={active} />
        <ScorecardRow round={active} tournamentSlug={tournamentSlug} player={scorecard.player} team={scorecard.team} />
      </div>

      <div className="mt-3 sm:mt-5">
        <ScorecardLegend />
      </div>

      <RoundVideoPlaceholder roundLabel={`Round ${active.round}`} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/scorecard/PlayerScorecardView.tsx
git commit -m "feat: add hole strip and video placeholder to PlayerScorecardView"
```

---

### Task 5: Use `PlayerProfileHeader` on the static (past-year) player page

**Files:**
- Modify: `app/leaderboard/[slug]/players/[player]/page.tsx` (full file)

**Interfaces:**
- Consumes: `PlayerProfileHeader` (Task 2).

Static past-tournament pages never show the "Watch Live" badge (`live={false}` always). Position/Total come from sorting `tournament.individualLeaderboard` by `toPar`, exactly like `LeaderboardTable` already does. Thru comes from the player's last-played round's played-hole count, or `null` if they have no scorecard.

- [ ] **Step 1: Replace the file**

`app/leaderboard/[slug]/players/[player]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { LivePlayerScorecard } from "@/components/scorecard/LivePlayerScorecard";
import { pastTournaments, nextTournament, getTournament, getPlayerScorecard, playersOf } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) =>
    playersOf(t).map(({ name }) => ({ slug: t.slug, player: name.toLowerCase() }))
  );
}

export default async function PlayerScorecardPage({ params }: { params: Promise<{ slug: string; player: string }> }) {
  const { slug, player } = await params;

  if (slug === nextTournament.slug) {
    return (
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
        <LivePlayerScorecard tournamentSlug={slug} player={player} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const entry = playersOf(tournament).find((p) => p.name.toLowerCase() === player.toLowerCase());
  if (!entry) notFound();

  const scorecard = getPlayerScorecard(tournament, entry.name);
  const displayName = getPlayerDisplayName(entry.name);
  const avatar = getPlayerAvatar(entry.name);

  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standing = ranked.find((p) => p.player.toLowerCase() === player.toLowerCase());
  const position = standing ? ranked.indexOf(standing) + 1 : null;
  const total = standing?.toPar ?? null;
  const lastRound = scorecard?.rounds[scorecard.rounds.length - 1];
  const playedCount = lastRound?.holes.filter((h) => h.score > 0).length ?? 0;
  const thru = lastRound == null ? null : playedCount >= lastRound.holes.length ? "F" : String(playedCount);

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <PlayerProfileHeader
        backHref={`/leaderboard/${slug}`}
        backLabel={`Back to ${tournament.editionLabel} Leaderboard`}
        displayName={displayName}
        avatarSrc={avatar}
        team={entry.team}
        editionLabel={tournament.editionLabel}
        bio={null}
        bioHref={`/teams/stats/players/${player.toLowerCase()}`}
        live={false}
        position={position}
        total={total}
        thru={thru}
      />

      {scorecard ? (
        <PlayerScorecardView scorecard={scorecard} tournamentSlug={slug} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">
            Hole-by-hole scorecard detail wasn&rsquo;t reliably recorded in the source data for this tournament and isn&rsquo;t available yet.
          </p>
        </div>
      )}
    </div>
  );
}
```

Note: `bio` is passed as `null` here deliberately — past-tournament `Tournament`/`playersOf` data doesn't carry a `PlayerProfile` (bio only exists on the current roster's `PlayerProfile` records via `lib/data/players/*.ts`, looked up by `getPlayerProfile`). Task 6 (the live page) does have bio available. If a past player also has a current `PlayerProfile` entry, a future enhancement could look it up via `getPlayerProfile(entry.name)?.bio` — out of scope here per the "no unrelated changes" constraint; leave as `null` (the header already handles `bio == null` by omitting that paragraph entirely).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/leaderboard/[slug]/players/[player]/page.tsx"
git commit -m "feat: use PlayerProfileHeader on the static player scorecard page"
```

---

### Task 6: Use `PlayerProfileHeader` on the live player page

**Files:**
- Modify: `components/scorecard/LivePlayerScorecard.tsx` (full file)

**Interfaces:**
- Consumes: `PlayerProfileHeader` (Task 2), `getPlayerProfile` (`@/lib/data/players`, for the live bio text — the current roster DOES have `PlayerProfile` records), `isLiveNow` (`@/lib/data`).

- [ ] **Step 1: Replace the file**

`components/scorecard/LivePlayerScorecard.tsx`:
```tsx
"use client";

import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { PlayerScorecardView } from "./PlayerScorecardView";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament, isLiveNow } from "@/lib/data";
import { getPlayerAvatar, getPlayerProfile } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

export function LivePlayerScorecard({ tournamentSlug, player }: { tournamentSlug: string; player: string }) {
  const { tournament, loading, payload } = useLiveTournament(DETAIL_POLL_MS);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const team: Team = tournament.roster.maroon.some((n) => n.toLowerCase() === player.toLowerCase()) ? "maroon" : "white";
  const displayName =
    [...tournament.roster.maroon, ...tournament.roster.white].find((n) => n.toLowerCase() === player.toLowerCase()) ?? player;
  const scorecard = tournament.scorecards?.find((s) => s.player.toLowerCase() === player.toLowerCase());
  const profile = getPlayerProfile(player);

  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standing = ranked.find((p) => p.player.toLowerCase() === player.toLowerCase());
  const position = standing ? ranked.indexOf(standing) + 1 : null;
  const total = standing?.toPar ?? null;
  const lastRound = scorecard?.rounds[scorecard.rounds.length - 1];
  const playedCount = lastRound?.holes.filter((h) => h.score > 0).length ?? 0;
  const thru = lastRound == null ? null : playedCount >= lastRound.holes.length ? "F" : String(playedCount);

  return (
    <div>
      <PlayerProfileHeader
        backHref={`/leaderboard/${tournamentSlug}`}
        backLabel={`Back to ${nextTournament.editionLabel} Leaderboard`}
        displayName={displayName}
        avatarSrc={getPlayerAvatar(player)}
        team={team}
        editionLabel={nextTournament.editionLabel}
        bio={profile?.bio ?? null}
        bioHref={`/teams/stats/players/${player.toLowerCase()}`}
        live={isLiveNow()}
        position={position}
        total={total}
        thru={thru}
      />

      {scorecard && scorecard.rounds.length > 0 ? (
        <PlayerScorecardView scorecard={scorecard} tournamentSlug={tournamentSlug} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">No rounds posted for {displayName} yet - check back once play begins.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/scorecard/LivePlayerScorecard.tsx
git commit -m "feat: use PlayerProfileHeader on the live player scorecard page"
```

---

### Task 7: Leaderboard rows navigate instead of expanding

**Files:**
- Modify: `components/ui/LeaderboardRow.tsx` (full file)
- Modify: `components/leaderboard/LeaderboardTable.tsx` (full file)
- Modify: `components/recap/LeaderboardSection.tsx` — one prop addition, not a full rewrite.

**Interfaces:**
- Produces (changed): `LeaderboardRow` drops `expanded`/`onToggle`; gains `href?: string`. When `href` is set, the row renders as a `<Link>`; the chevron is removed entirely (there's no expanded state left to indicate).
- Produces (changed): `LeaderboardTable` no longer owns expand/collapse state or renders `PlayerScorecardView` inline; it passes each row's Tournament Profile URL as `href`.
- `components/recap/LeaderboardSection.tsx` is a third, previously-missed caller of `LeaderboardRow` (a condensed recap variant, read-only today — no `expanded`/`onToggle` passed, so it isn't broken by their removal). For UX consistency with the full leaderboard table now being clickable, it gains `href` too.

- [ ] **Step 1: Replace `LeaderboardRow.tsx`**

```tsx
import Link from "next/link";
import { Avatar } from "./Avatar";
import { ScoreBadge } from "./ScoreBadge";
import { TrophyBadge } from "./TrophyBadge";
import { WinnerBadge } from "./WinnerBadge";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

interface LeaderboardRowProps {
  pos?: number;
  name?: string;
  team?: Team;
  avatar?: string | null;
  total?: number;
  highlight?: boolean;
  header?: boolean;
  href?: string;
  defendingChampion?: boolean;
  isWinner?: boolean;
}

const GRID_COLS = "grid-cols-[44px_minmax(0,1fr)]";

export function LeaderboardRow({
  pos,
  name = "",
  team = "maroon",
  avatar = null,
  total = 0,
  highlight = false,
  header = false,
  href,
  defendingChampion = false,
  isWinner = false,
}: LeaderboardRowProps) {
  const displayName = getPlayerDisplayName(name);
  const avatarSrc = avatar ?? getPlayerAvatar(name);
  const isMaroon = team === "maroon";
  const panelClasses = isMaroon
    ? "border-maroon-700 bg-gradient-to-r from-maroon-800 via-maroon-700 to-maroon-600 text-cream-50 shadow-[0_6px_16px_rgba(80,0,1,0.18)]"
    : "border-ink-200 bg-gradient-to-r from-white via-cream-50 to-ink-50 text-ink-900 shadow-[0_6px_16px_rgba(36,0,1,0.08)]";
  const teamText = isMaroon ? "text-gold-200" : "text-maroon-700";

  const playerCell = (
    <span className="flex items-center gap-2 min-w-0 w-full sm:gap-3">
      <span className="sm:hidden">
        <Avatar name={displayName} src={avatarSrc} size="xs" team={team} />
      </span>
      <span className="hidden sm:inline-flex">
        <Avatar name={displayName} src={avatarSrc} size="sm" team={team} />
      </span>
      <span className="flex flex-col min-w-0">
        <span className={["font-sans font-semibold text-xs whitespace-nowrap overflow-hidden text-ellipsis inline-flex items-center gap-[6px] sm:text-sm", isMaroon ? "text-cream-50" : "text-ink-900"].join(" ")}>
          {displayName}
          {defendingChampion && <TrophyBadge count={1} />}
          {isWinner && <WinnerBadge />}
        </span>
        <span className={["font-condensed text-[8px] tracking-wide uppercase sm:text-[10px]", teamText].join(" ")}>
          {team === "maroon" ? "Maroon" : "White"}
        </span>
      </span>
    </span>
  );

  if (header) {
    return (
      <div
        className={[
          "grid items-center gap-2 py-1 pr-4 font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 border-b border-gold-200 bg-cream-50 sm:gap-3 sm:py-2",
          GRID_COLS,
        ].join(" ")}
      >
        <span className="text-center">Pos</span>
        <span className="grid grid-cols-[minmax(0,1fr)_56px] items-center sm:grid-cols-[minmax(0,1fr)_72px]">
          <span className="pl-3">Player</span>
          <span className="text-center">Total</span>
        </span>
      </div>
    );
  }

  const rowContent = (
    <>
      <span className="font-condensed font-bold text-sm text-ink-900 text-center tabular-nums sm:text-md">{pos}</span>

      <span className={["grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2 rounded-md border px-2 py-1 sm:grid-cols-[minmax(0,1fr)_72px] sm:gap-3 sm:px-3 sm:py-[9px]", panelClasses].join(" ")}>
        {playerCell}
        <span className="flex items-center justify-center">
          <ScoreBadge
            value={total}
            size="sm"
            chip
            className={isMaroon ? "bg-cream-50 text-maroon-700" : "bg-maroon-50 text-maroon-700"}
          />
        </span>
      </span>
    </>
  );

  const rowClasses = [
    "grid items-center gap-2 px-2 py-[3px] border-b border-ink-100 transition-colors duration-200 sm:gap-3 sm:px-3 sm:py-[8px]",
    GRID_COLS,
    highlight ? "bg-gold-200/35" : "bg-transparent",
    href ? "cursor-pointer hover:bg-cream-50" : "",
  ].join(" ");

  if (href) {
    return (
      <Link href={href} className={rowClasses}>
        {rowContent}
      </Link>
    );
  }

  return <div className={rowClasses}>{rowContent}</div>;
}
```

- [ ] **Step 2: Replace `LeaderboardTable.tsx`**

```tsx
"use client";

import { useState } from "react";
import { LeaderboardRow } from "@/components/ui/LeaderboardRow";
import { defendingIndividualChampion } from "@/lib/data";
import type { Tournament, Team } from "@/lib/data/types";

type Filter = "all" | Team;

const filters: [Filter, string][] = [
  ["all", "All Players"],
  ["maroon", "Team Maroon"],
  ["white", "Team White"],
];

export function LeaderboardTable({ tournament }: { tournament: Tournament }) {
  const [filter, setFilter] = useState<Filter>("all");
  const champion = defendingIndividualChampion(tournament);

  const sorted = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const ranked = sorted.map((p, i) => ({ ...p, pos: i + 1 }));
  const rows = ranked.filter((p) => filter === "all" || p.team === filter);

  return (
    <div>
      <div className="flex gap-1.5 mb-3 sm:gap-2 sm:mb-5">
        {filters.map(([v, l]) => {
          const on = filter === v;
          return (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={[
                "font-sans text-[11px] font-semibold px-3 py-1 rounded-pill border-[1.5px] transition-all duration-150 cursor-pointer sm:text-[13px] sm:px-[18px] sm:py-[7px]",
                on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-white text-ink-700",
              ].join(" ")}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div className="bg-cream-50 border border-gold-400 rounded-lg overflow-hidden shadow-lg">
        <LeaderboardRow header />
        {rows.map((p) => (
          <LeaderboardRow
            key={p.player}
            pos={p.pos}
            name={p.player}
            team={p.team}
            total={p.toPar}
            highlight={p.pos === 1}
            href={`/leaderboard/${tournament.slug}/players/${p.player.toLowerCase()}`}
            defendingChampion={champion != null && p.player === champion}
            isWinner={tournament.individualChampion === p.player}
          />
        ))}
      </div>

      <p className="font-sans text-xs text-ink-400 mt-3">
        Total score to par across the tournament. <span className="text-score-under font-semibold">Red</span> = under par ·{" "}
        <span className="text-score-even font-semibold">Green</span> = even ·{" "}
        <span className="text-score-over font-semibold">Black</span> = over par. Click a player to see their round-by-round scorecard.
      </p>
    </div>
  );
}
```

Note: `getPlayerScorecard` is no longer imported/used in `LeaderboardTable.tsx` since the inline expand is gone — do not leave it imported.

- [ ] **Step 3: Add `href` to `LeaderboardSection.tsx`'s rows**

In `components/recap/LeaderboardSection.tsx`, add the `href` prop to the `<LeaderboardRow>` call inside `top.map(...)`:
```tsx
<LeaderboardRow
  key={player.player}
  pos={index + 1}
  name={player.player}
  team={player.team}
  total={player.toPar}
  highlight={index === 0}
  href={`/leaderboard/${tournament.slug}/players/${player.player.toLowerCase()}`}
  defendingChampion={champion != null && player.player === champion}
  isWinner={tournament.individualChampion === player.player}
/>
```
(only the added `href` line changes; everything else in the file stays the same).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/LeaderboardRow.tsx components/leaderboard/LeaderboardTable.tsx components/recap/LeaderboardSection.tsx
git commit -m "feat: leaderboard rows navigate to the Tournament Profile instead of expanding"
```

---

### Task 8: Match displays link to player profiles

**Files:**
- Modify: `components/match/MatchRow.tsx` (full file)
- Modify: `components/recap/MatchesSection.tsx` (full file)
- Modify: `components/leaderboard/MatchPlayShowcase.tsx` — only the `TeamStack` function and its two call sites in `MatchCard`/`MatchCard`'s caller (`MatchPlayShowcase`'s render), not the whole file.

**Interfaces:**
- Produces (changed): `MatchRow` gains a required `tournamentSlug: string` prop.
- Produces (changed): `MatchPlayShowcase`'s internal `TeamStack` gains a required `tournamentSlug: string` prop; `MatchCard` gains and forwards it.

Both `MatchesSection` (which renders `MatchRow`, used in tournament recap views) and `MatchPlayShowcase` (which renders its own `MatchCard`/`TeamStack`, used on the live and year leaderboard pages) show player avatars/names in match context — both get the same click-through treatment.

- [ ] **Step 1: Replace `MatchRow.tsx`**

```tsx
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TrophyBadge } from "@/components/ui/TrophyBadge";
import { ResultChevron } from "@/components/match/ResultChevron";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Team } from "@/lib/data/types";

function matchStatus(match: RealMatch) {
  if (match.status) return match.status;
  return "final";
}

function matchLeader(match: RealMatch): Team | "tie" {
  if (match.leader) return match.leader;
  if (match.maroonPts > match.whitePts) return "maroon";
  if (match.whitePts > match.maroonPts) return "white";
  return "tie";
}

function liveLabel(match: RealMatch) {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const hasMatchPlayMargin = match.margin != null;
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining ?? null;

  if (status === "scheduled") return match.teeTimeCst ?? "VS";
  if (leader === "tie") return "AS";
  if (!hasMatchPlayMargin) return "Won";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

function labelColor(match: RealMatch) {
  const leader = matchLeader(match);
  if (leader === "maroon") return "border-maroon-200 bg-maroon-50 text-maroon-700";
  if (leader === "white") return "border-ink-200 bg-white text-ink-900";
  return "border-ink-300 bg-ink-100 text-ink-900";
}

function TeamSide({
  players,
  team,
  defendingChampion,
  tournamentSlug,
}: {
  players: string[];
  team: Team;
  defendingChampion: string | null;
  tournamentSlug: string;
}) {
  const isMaroon = team === "maroon";
  const top = players[0];
  const bottom = players[1];

  return (
    <div className={["flex min-w-0 flex-col gap-1", isMaroon ? "items-end" : "items-start"].join(" ")}>
      {top && (
        <Link href={`/leaderboard/${tournamentSlug}/players/${top.toLowerCase()}`} className="flex flex-col items-inherit gap-1 hover:opacity-80 transition-opacity">
          <Avatar name={getPlayerDisplayName(top)} src={getPlayerAvatar(top)} size="sm" team={team} />
          <span className="truncate font-sans text-sm font-semibold text-ink-900 inline-flex items-center gap-[6px]">
            {getPlayerDisplayName(top)}
            {defendingChampion === top && <TrophyBadge count={1} />}
          </span>
        </Link>
      )}
      {bottom && (
        <Link href={`/leaderboard/${tournamentSlug}/players/${bottom.toLowerCase()}`} className="flex flex-col items-inherit gap-1 hover:opacity-80 transition-opacity">
          <span className="truncate font-sans text-sm font-semibold text-ink-900 inline-flex items-center gap-[6px]">
            {getPlayerDisplayName(bottom)}
            {defendingChampion === bottom && <TrophyBadge count={1} />}
          </span>
          <Avatar name={getPlayerDisplayName(bottom)} src={getPlayerAvatar(bottom)} size="sm" team={team} />
        </Link>
      )}
    </div>
  );
}

export function MatchRow({
  match,
  defendingChampion = null,
  tournamentSlug,
}: {
  match: RealMatch;
  index?: number;
  defendingChampion?: string | null;
  tournamentSlug: string;
}) {
  const status = matchStatus(match);
  const centerLabel = status === "scheduled" ? "VS" : liveLabel(match);

  return (
    <div className="border-b border-ink-100 bg-white px-4 py-4 last:border-b-0">
      <div className="grid min-h-[84px] grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)] items-center gap-3">
        <TeamSide players={match.maroonPlayers} team="maroon" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
        <div className="flex justify-center">
          {status === "final" ? (
            <ResultChevron winner={matchLeader(match)}>{centerLabel}</ResultChevron>
          ) : (
            <span className={["inline-flex min-h-[44px] min-w-[62px] items-center justify-center rounded-pill border px-3 font-condensed text-lg font-extrabold uppercase tracking-wide", labelColor(match)].join(" ")}>
              {centerLabel}
            </span>
          )}
        </div>
        <TeamSide players={match.whitePlayers} team="white" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
      </div>
    </div>
  );
}
```

Note: `items-inherit` isn't a real Tailwind utility — use the parent's alignment directly instead. Replace `className="flex flex-col items-inherit gap-1 hover:opacity-80 transition-opacity"` on both `Link`s with `className={["flex flex-col gap-1 hover:opacity-80 transition-opacity", isMaroon ? "items-end" : "items-start"].join(" ")}` so each link matches its side's alignment (mirroring the outer `TeamSide` div's own `isMaroon ? "items-end" : "items-start"` logic).

- [ ] **Step 2: Update `MatchesSection.tsx`** — pass `tournamentSlug`

In `components/recap/MatchesSection.tsx`, change the `MatchRow` render call:
```tsx
<MatchRow key={match.id} match={match} index={index + 1} defendingChampion={champion} tournamentSlug={tournament.slug} />
```
(only this one line changes — `tournament` is already the function's own prop, already in scope).

- [ ] **Step 3: Update `MatchPlayShowcase.tsx`** — thread `tournamentSlug` into `TeamStack`

In `components/leaderboard/MatchPlayShowcase.tsx`:

Replace the `TeamStack` function signature and its two avatar+name blocks to link out, matching the same pattern as `MatchRow`'s `TeamSide` above:
```tsx
function TeamStack({
  players,
  team,
  defendingChampion,
  tournamentSlug,
}: {
  players: string[];
  team: Team;
  defendingChampion: string | null;
  tournamentSlug: string;
}) {
  const top = players[0];
  const bottom = players[1];

  return (
    <div className={["flex min-w-0 flex-col gap-0.5 sm:gap-1", team === "maroon" ? "items-start" : "items-end"].join(" ")}>
      {top && (
        <Link href={`/leaderboard/${tournamentSlug}/players/${top.toLowerCase()}`} className="flex flex-col gap-0.5 sm:gap-1 hover:opacity-80 transition-opacity" style={{ alignItems: team === "maroon" ? "flex-start" : "flex-end" }}>
          <span className="sm:hidden">
            <Avatar name={getPlayerDisplayName(top)} src={getPlayerAvatar(top)} size="xs" team={team} />
          </span>
          <span className="hidden sm:inline-flex">
            <Avatar name={getPlayerDisplayName(top)} src={getPlayerAvatar(top)} size="sm" team={team} />
          </span>
          <span className="truncate font-sans text-xs font-extrabold text-ink-900 inline-flex items-center gap-[6px] sm:text-sm">
            {getPlayerDisplayName(top)}
            {defendingChampion === top && <TrophyBadge count={1} />}
          </span>
        </Link>
      )}
      {bottom && (
        <Link href={`/leaderboard/${tournamentSlug}/players/${bottom.toLowerCase()}`} className="flex flex-col gap-0.5 sm:gap-1 hover:opacity-80 transition-opacity" style={{ alignItems: team === "maroon" ? "flex-start" : "flex-end" }}>
          <span className="truncate font-sans text-xs font-extrabold text-ink-900 inline-flex items-center gap-[6px] sm:text-sm">
            {getPlayerDisplayName(bottom)}
            {defendingChampion === bottom && <TrophyBadge count={1} />}
          </span>
          <span className="sm:hidden">
            <Avatar name={getPlayerDisplayName(bottom)} src={getPlayerAvatar(bottom)} size="xs" team={team} />
          </span>
          <span className="hidden sm:inline-flex">
            <Avatar name={getPlayerDisplayName(bottom)} src={getPlayerAvatar(bottom)} size="sm" team={team} />
          </span>
        </Link>
      )}
    </div>
  );
}
```

Then update `MatchCard` (the sole caller of `TeamStack`) to accept and forward `tournamentSlug`:
```tsx
function MatchCard({ match, defendingChampion, tournamentSlug }: { match: RealMatch; index: number; defendingChampion: string | null; tournamentSlug: string }) {
```
and inside its JSX, both `<TeamStack players={match.maroonPlayers} team="maroon" defendingChampion={defendingChampion} />` and the white-team equivalent each gain ` tournamentSlug={tournamentSlug}`.

Finally, at the two places inside `MatchPlayShowcase`'s own render where `<MatchCard key={match.id} match={match} index={index + 1} defendingChampion={champion} />` is called (inside the `matches.map(...)` in the final `return`), add ` tournamentSlug={(selectedHistorical ?? liveTournament).slug}`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/match/MatchRow.tsx components/recap/MatchesSection.tsx components/leaderboard/MatchPlayShowcase.tsx
git commit -m "feat: link match-display player avatars/names to their Tournament Profile"
```

---

### Task 9: `LeaderboardStrip` component (MM-Website)

**Files:**
- Create: `components/leaderboard/LeaderboardStrip.tsx`

**Interfaces:**
- Consumes: `IndividualStanding`/`Tournament` types, `Avatar`, `ScoreBadge`, `getPlayerAvatar`/`getPlayerDisplayName`.
- Produces: `LeaderboardStrip({ tournament: Tournament })` — horizontally scrollable ranked-player strip. Consumed by Task 10.

- [ ] **Step 1: Create the component**

`components/leaderboard/LeaderboardStrip.tsx`:
```tsx
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Tournament } from "@/lib/data/types";

function posLabel(index: number, ranked: { toPar: number }[]): string {
  const pos = index + 1;
  const tied = ranked.filter((p) => p.toPar === ranked[index].toPar).length > 1;
  return `${tied ? "T" : ""}${pos}`;
}

function scoreLabel(toPar: number): string {
  return toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar);
}

/** Ranked player-strip, winner first, horizontally scrollable (native scroll — touch swipe on mobile, trackpad/shift-scroll on desktop). */
export function LeaderboardStrip({ tournament }: { tournament: Tournament }) {
  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);

  if (ranked.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto px-4 py-4 sm:px-7">
      {ranked.map((entry, i) => (
        <Link
          key={entry.player}
          href={`/leaderboard/${tournament.slug}/players/${entry.player.toLowerCase()}`}
          className="flex shrink-0 flex-col items-center gap-1 w-16 text-center hover:opacity-80 transition-opacity"
        >
          <span className="relative inline-flex">
            <Avatar name={getPlayerDisplayName(entry.player)} src={getPlayerAvatar(entry.player)} size="lg" team={entry.team} />
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-maroon-700 px-1.5 py-0.5 font-score text-[10px] font-bold text-white shadow">
              {scoreLabel(entry.toPar)}
            </span>
          </span>
          <span className="font-sans text-[11px] font-semibold text-ink-900 truncate w-full">
            {posLabel(i, ranked)}. {getPlayerDisplayName(entry.player).split(" ").pop()}
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/LeaderboardStrip.tsx
git commit -m "feat: add LeaderboardStrip horizontal scroll component"
```

---

### Task 10: Show `LeaderboardStrip` on the home page

**Files:**
- Create: `components/home/LiveLeaderboardStripSection.tsx`
- Modify: `app/page.tsx` (full file)

**Interfaces:**
- Consumes: `LeaderboardStrip` (Task 9), `useLiveTournament` (`@/lib/hooks/useLiveTournament`), `isLiveNow`/`getNextTournamentStatus` (`@/lib/data`).

The strip only shows when there's a live/current tournament — hidden entirely in the off-season, per the spec. `useLiveTournament` is a client hook, so this needs its own small client wrapper (the home page itself, `app/page.tsx`, is a server component today and should stay one).

- [ ] **Step 1: Create the client wrapper**

`components/home/LiveLeaderboardStripSection.tsx`:
```tsx
"use client";

import { LeaderboardStrip } from "@/components/leaderboard/LeaderboardStrip";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";

/** Hidden entirely outside the live tournament window — no empty strip in the off-season. */
export function LiveLeaderboardStripSection() {
  const { tournament } = useLiveTournament();
  if (getNextTournamentStatus() !== "live") return null;
  return <LeaderboardStrip tournament={tournament} />;
}
```

- [ ] **Step 2: Insert it into the home page**

`app/page.tsx`:
```tsx
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";

export default function Home() {
  return (
    <div>
      <VideoHero />
      <LiveLeaderboardStripSection />
      <HomeDashboard />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/home/LiveLeaderboardStripSection.tsx app/page.tsx
git commit -m "feat: show the leaderboard strip below the home page hero during a live tournament"
```

---

### Task 11: Leaderboard strip on the Scorekeeper player portal

**Files (in `C:\Users\Owner\Documents\GitHub\MM-Scorekeeper`):**
- Create: `lib/playerAvatars.ts`
- Create: `lib/websiteOrigin.ts`
- Create: `components/player/PortalLeaderboardStrip.tsx`
- Modify: `components/PlayerDashboard.tsx` — insert the strip below `PortalHero`.

**Interfaces:**
- Produces: `WEBSITE_ORIGIN: string` (dev → `http://localhost:3001`, prod → the deployed website), `getPlayerAvatarUrl(name: string): string | null`.
- Produces: `PortalLeaderboardStrip()` — fetches `/portal/api/live-feed` on mount and every 20s (matching `PlayerDashboard`'s existing `LIVE_REFRESH_MS` cadence), renders the same visual strip pattern as the website's, linking each player out to their website profile URL.

**Important — deliberate, documented duplication:** MM-Scorekeeper has no player photos or avatar-slug mapping of its own (per the design spec's approved decision, photos are not duplicated as image files — but the *name-to-URL mapping* has to live somewhere, since Scorekeeper's data only has short roster names like `"Cade"`, not the `"cade-barone"` slugs MM-Website's photo paths use). `lib/playerAvatars.ts` is a small, explicitly-labeled mirror of MM-Website's `lib/data/players/*.ts` roster (name + slug pairs only, no image data) that must be kept in sync by hand when the roster changes. Any player not in this list falls back to no photo (the portal's `Avatar`-equivalent already has an icon fallback — see below).

- [ ] **Step 1: Create the website-origin constant**

`lib/websiteOrigin.ts`:
```ts
/** The public marketing site — source of truth for player photos, linked to (not duplicated) from the portal. */
export const WEBSITE_ORIGIN =
  process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://maroon-masters-website.vercel.app";
```

- [ ] **Step 2: Create the avatar-slug mirror**

`lib/playerAvatars.ts`:
```ts
import { WEBSITE_ORIGIN } from "./websiteOrigin";

/**
 * Mirrors MM-Website's lib/data/players/*.ts roster (name -> avatar slug
 * only, no image data — the actual photo files live only in MM-Website).
 * Keep this list in sync by hand whenever a player is added or renamed
 * over there; a name missing here just falls back to no photo.
 */
const PLAYER_AVATAR_SLUGS: Record<string, string> = {
  cade: "cade-barone",
  cam: "cam-latto",
  collin: "collin-ross",
  dalton: "dalton-spriggs",
  drew: "drew-weisser",
  hugo: "hugo-moebel",
  jackson: "jackson-collins",
  kyle: "kyle-schnabel",
  luke: "luke-sherrell",
  nate: "nate-wojciechowski",
  pete: "pete-peabody",
  peyton: "peyton-vos",
  quez: "quez-currier",
};

export function getPlayerAvatarUrl(name: string): string | null {
  const slug = PLAYER_AVATAR_SLUGS[name.trim().toLowerCase()];
  return slug ? `${WEBSITE_ORIGIN}/players/${slug}/avatar.png` : null;
}
```

- [ ] **Step 3: Create the strip component**

`components/player/PortalLeaderboardStrip.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { getPlayerAvatarUrl } from "@/lib/playerAvatars";
import { WEBSITE_ORIGIN } from "@/lib/websiteOrigin";
import type { IndividualStanding } from "@/lib/types";

const REFRESH_MS = 20000;

function posLabel(index: number, ranked: IndividualStanding[]): string {
  const pos = index + 1;
  const tied = ranked.filter((p) => p.toPar === ranked[index].toPar).length > 1;
  return `${tied ? "T" : ""}${pos}`;
}

function scoreLabel(toPar: number): string {
  return toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar);
}

/**
 * Same visual pattern as the website's LeaderboardStrip, sourced from this
 * app's own already-public `/api/live-feed` route (no new backend work) and
 * linking each player out to their profile on the live website.
 */
export function PortalLeaderboardStrip() {
  const [standings, setStandings] = useState<IndividualStanding[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/portal/api/live-feed", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setStandings(data.individualLeaderboard ?? data.leaderboard ?? []);
      } catch {
        // Non-critical; leave whatever was already loaded.
      }
    }

    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const ranked = [...standings].sort((a, b) => a.toPar - b.toPar);
  if (ranked.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto px-4 py-4">
      {ranked.map((entry, i) => {
        const avatarUrl = getPlayerAvatarUrl(entry.player);
        return (
          <a
            key={entry.player}
            href={`${WEBSITE_ORIGIN}/leaderboard/2027/players/${entry.player.toLowerCase()}`}
            className="flex shrink-0 flex-col items-center gap-1 w-16 text-center active:opacity-80"
          >
            <span className="relative inline-flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full bg-stone-200 text-stone-500 font-condensed font-bold">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- cross-origin photo on MM-Website, next/image can't optimize a remote host that isn't configured here.
                <img src={avatarUrl} alt={entry.player} className="h-full w-full object-cover" />
              ) : (
                entry.player.charAt(0).toUpperCase()
              )}
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-[#500001] px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                {scoreLabel(entry.toPar)}
              </span>
            </span>
            <span className="text-[11px] font-semibold text-stone-800 truncate w-full">
              {posLabel(i, ranked)}. {entry.player}
            </span>
          </a>
        );
      })}
    </div>
  );
}
```

Note: the profile URL is hardcoded to the `2027` tournament slug (`nextTournament.slug` on the website side) since Scorekeeper only ever represents the current live tournament — there's no past-tournament concept in this app, unlike the website.

- [ ] **Step 4: Insert into `PlayerDashboard.tsx`**

In `components/PlayerDashboard.tsx`, add the import:
```tsx
import { PortalLeaderboardStrip } from "./player/PortalLeaderboardStrip";
```
and insert `<PortalLeaderboardStrip />` immediately after the closing `</PortalHero>` tag and before the `<div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">` block, so the main view's JSX becomes:
```tsx
      <PortalHero images={PORTAL_HERO_IMAGES}>
        {matches.length > 0 ? (
          <MyMatchBox matches={matches} viewerPlayerFirst={session.playerFirst} />
        ) : (
          <PortalGreeting displayName={session.displayName} />
        )}
      </PortalHero>

      <PortalLeaderboardStrip />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
```
(only these lines change — everything else in the file stays exactly as it is).

- [ ] **Step 5: Type-check**

Run (from `C:\Users\Owner\Documents\GitHub\MM-Scorekeeper`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/playerAvatars.ts lib/websiteOrigin.ts components/player/PortalLeaderboardStrip.tsx components/PlayerDashboard.tsx
git commit -m "feat: add leaderboard strip to the player portal, linking out to player profiles"
```

---

### Task 12: Full manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Start both dev servers**

`MM-Website`: `npm run dev` (port 3001). `MM-Scorekeeper`: `npm run dev` (port 3002).

- [ ] **Step 2: Production build sanity check**

Run in both repos: `npm run build`. Expected: both succeed with no type/lint errors.

- [ ] **Step 3: Walk the website**

- Home page (`localhost:3001`): confirm the leaderboard strip shows below the hero (it will only render once the live tournament window opens per `getNextTournamentStatus`; if today's date is before `nextTournament.liveAt`, temporarily confirm via the `/leaderboard/2027` page instead, or use browser devtools to fake the date, then revert — do not change `nextTournament.liveAt` itself).
- `/leaderboard/2027` (or the current live slug): confirm clicking a row navigates to that player's Tournament Profile instead of expanding a dropdown; confirm the new header (avatar, Watch Live badge, bio + Full Bio link, Position/Total/Thru), round selector, hole strip (tap a hole → hole-detail page), and video placeholder all render.
- Click "Full Bio →" and confirm it lands on the existing `/teams/stats/players/[player]` bio page, completely unchanged.
- On the same leaderboard page, confirm the match-play cards' player names/avatars are clickable into their profiles.
- Visit a past tournament (e.g. `/leaderboard/2026-palm-springs`): confirm the static player page shows the same new header style (no Watch Live badge, no bio paragraph since past-year bio is `null` by design), round selector, and hole strip.
- Visit `/history` or wherever `MatchesSection`/`MatchRow` renders and confirm those player links work too.

- [ ] **Step 4: Walk the portal**

Log in to the player portal (`localhost:3002`, or via `localhost:3001/portal`) and confirm the leaderboard strip appears below the hero, shows real standings, and tapping a player opens their profile on the website (new tab/navigation, cross-origin).

- [ ] **Step 5: Final commit (only if Step 3/4 turned up fixes)**

If the walkthrough required any fixes, stage and commit them individually. If nothing needed fixing, this task ends at Step 4 with no commit.
