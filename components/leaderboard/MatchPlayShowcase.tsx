"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Radio } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TrophyBadge } from "@/components/ui/TrophyBadge";
import { ResultChevron } from "@/components/match/ResultChevron";
import { defendingChampion, defendingIndividualChampion, fmtPt, pastTournaments } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

type BoardOption = "live" | "2026" | "2025" | "2024";

type SessionGroup = {
  id: string;
  label: string;
  meta: string;
  matches: RealMatch[];
};

const LIVE_START_LABEL = "9:30 AM CST on January 6";

const tournamentsByYear = new Map(pastTournaments.map((tournament) => [String(tournament.year), tournament]));

function groupSessions(tournament: Tournament): SessionGroup[] {
  const groups: SessionGroup[] = [];

  tournament.matches.forEach((match) => {
    const id = `${match.day}-${match.session}-${match.format}`;
    const existing = groups.find((group) => group.id === id);
    if (existing) {
      existing.matches.push(match);
      return;
    }

    groups.push({
      id,
      label: `Session ${groups.length + 1} - ${match.format}`,
      meta: `Day ${match.day} - ${match.session}`,
      matches: [match],
    });
  });

  return groups;
}

type SessionStatus = { sessionNumber: number; kind: "live" | "tee-time" | "awaiting"; teeTime?: string };

function currentSessionStatus(tournament: Tournament): SessionStatus {
  const sessions = groupSessions(tournament);
  if (sessions.length === 0) return { sessionNumber: 1, kind: "awaiting" };

  const activeIndex = sessions.findIndex((session) => session.matches.some((match) => matchStatus(match) !== "final"));
  const index = activeIndex === -1 ? sessions.length - 1 : activeIndex;
  const session = sessions[index];
  const started = session.matches.some((match) => matchStatus(match) === "live" || matchStatus(match) === "final");

  if (started) return { sessionNumber: index + 1, kind: "live" };

  const teeTime = session.matches.find((match) => match.teeTimeCst)?.teeTimeCst;
  if (teeTime) return { sessionNumber: index + 1, kind: "tee-time", teeTime };

  return { sessionNumber: index + 1, kind: "awaiting" };
}

function matchLeader(match: RealMatch): Team | "tie" {
  if (match.leader) return match.leader;
  if (match.maroonPts > match.whitePts) return "maroon";
  if (match.whitePts > match.maroonPts) return "white";
  return "tie";
}

function matchStatus(match: RealMatch) {
  return match.status ?? "final";
}

function matchLabel(match: RealMatch) {
  const leader = matchLeader(match);
  const status = matchStatus(match);
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining;

  if (status === "scheduled") return "VS";
  if (leader === "tie") return "AS";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

function centralDateLabel() {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st" : day % 10 === 2 && day % 100 !== 12 ? "nd" : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";

  return `${month} ${day}${suffix} ${year}`;
}

function optionLabel(option: BoardOption) {
  return option === "live" ? "LIVE" : option;
}

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

function MatchCard({ match, defendingChampion, tournamentSlug }: { match: RealMatch; index: number; defendingChampion: string | null; tournamentSlug: string }) {
  const leader = matchLeader(match);
  const status = matchStatus(match);
  const label = matchLabel(match);

  return (
    <article className="relative min-h-[74px] overflow-hidden rounded-lg border border-gold-300 bg-cream-50 shadow-xl sm:min-h-[130px] lg:min-h-[190px]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-maroon-700 via-gold-400 to-ink-900" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,110,0.22),transparent_42%)]" />
      <div className="relative flex h-full flex-col p-2 sm:p-4 lg:p-5">
        <div className="min-h-[12px] text-center font-condensed text-[9px] font-black uppercase tracking-wide text-ink-500 sm:min-h-[24px] sm:text-xs">{match.teeTimeCst}</div>
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] sm:gap-3 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)]">
          <TeamStack players={match.maroonPlayers} team="maroon" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
          <div className="flex justify-center">
            {status === "final" ? (
              <ResultChevron winner={leader}>{label}</ResultChevron>
            ) : status === "scheduled" ? (
              <span className="flex h-[28px] w-full items-center justify-center font-condensed text-xs font-black uppercase text-gold-700 sm:h-[44px] sm:text-lg">{label}</span>
            ) : (
              <span
                className={[
                  "flex h-[28px] w-full items-center justify-center rounded-full border bg-white font-condensed text-xs font-black uppercase shadow-lg sm:h-[44px] sm:text-base",
                  leader === "maroon" ? "border-maroon-300 text-maroon-700" : leader === "white" ? "border-ink-300 text-ink-900" : "border-gold-400 text-gold-700",
                ].join(" ")}
              >
                {label}
              </span>
            )}
          </div>
          <TeamStack players={match.whitePlayers} team="white" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
        </div>
      </div>
    </article>
  );
}

function PlaceholderCard({ index }: { index: number }) {
  return (
    <article className="relative min-h-[100px] overflow-hidden rounded-lg border border-gold-300 bg-cream-50 p-3 shadow-xl sm:min-h-[170px] sm:p-4 lg:min-h-[236px] lg:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-maroon-700 via-gold-400 to-ink-900" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,110,0.24),transparent_46%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-condensed text-[9px] font-bold uppercase tracking-eyebrow text-gold-700 sm:text-[11px]">Live Match {index}</div>
            <h3 className="mt-1 font-sans text-sm font-black text-ink-900 sm:mt-2 sm:text-2xl">Fourball staging</h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-pill bg-white px-2 py-0.5 font-condensed text-[9px] font-bold uppercase tracking-wide text-maroon-700 shadow-sm sm:gap-2 sm:px-3 sm:py-1 sm:text-[11px]">
            <Radio size={11} className="sm:hidden" />
            <Radio size={13} className="hidden sm:block" />
            LIVE
          </span>
        </div>
        <p className="m-0 hidden max-w-[280px] font-sans text-sm leading-relaxed text-ink-500 sm:block">
          Waiting until {LIVE_START_LABEL} for the 2027 opening session. Once matches are created in the app, this card becomes live.
        </p>
      </div>
    </article>
  );
}

function useHeaderOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function measure() {
      const header = document.querySelector("header");
      setOffset(header ? header.getBoundingClientRect().height : 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return offset;
}

function flooredFill(real: number, otherReal: number, floor = 15): number {
  const a = Math.max(floor, real);
  const b = Math.max(floor, otherReal);
  if (a + b <= 100) return a;
  return (a / (a + b)) * 100;
}

type BadgeState = { kind: "undecided" } | { kind: "wins" | "retains"; team: Team; position: number };

function computeBadgeState(tournament: Tournament): BadgeState {
  const safeAvailable = tournament.pointsAvailable || 1;
  const half = tournament.pointsAvailable / 2;
  const defender = defendingChampion(tournament);

  if (tournament.maroonPts >= tournament.pointsToWin) {
    return { kind: "wins", team: "maroon", position: (tournament.maroonPts / safeAvailable) * 100 };
  }
  if (tournament.whitePts >= tournament.pointsToWin) {
    return { kind: "wins", team: "white", position: (tournament.whitePts / safeAvailable) * 100 };
  }
  if (defender === "maroon" && tournament.maroonPts >= half) {
    return { kind: "retains", team: "maroon", position: (tournament.maroonPts / safeAvailable) * 100 };
  }
  if (defender === "white" && tournament.whitePts >= half) {
    return { kind: "retains", team: "white", position: (tournament.whitePts / safeAvailable) * 100 };
  }
  return { kind: "undecided" };
}

function WinBadge({ state }: { state: BadgeState }) {
  if (state.kind === "undecided") return null;

  const isMaroon = state.team === "maroon";
  const fill = isMaroon ? "var(--color-maroon-700)" : "#fdfdfb";
  const textColor = isMaroon ? "#fff" : "var(--color-maroon-700)";
  const label = `${isMaroon ? "Maroon" : "White"} ${state.kind === "wins" ? "Wins" : "Retains"}`;

  return (
    <div
      className="absolute top-1/2 z-20 flex items-center justify-center"
      style={{ left: `${state.position}%`, transform: "translate(-50%, -50%)", width: 150, height: 65 }}
    >
      {state.kind === "wins" ? (
        <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <polygon points={isMaroon ? "0,22 30,0 100,0 100,44 30,44" : "100,22 70,0 0,0 0,44 70,44"} fill={fill} stroke="#b8945a" strokeWidth={3} />
        </svg>
      ) : (
        <div className="absolute inset-0 border-[3px]" style={{ background: fill, borderColor: "#b8945a", boxShadow: "0 0 12px rgba(201,168,110,0.6)" }} />
      )}
      <span
        className="relative font-sans text-[13px] font-extrabold uppercase tracking-wide"
        style={{ color: textColor, paddingLeft: isMaroon ? 6 : 0, paddingRight: isMaroon ? 0 : 6 }}
      >
        {label}
      </span>
    </div>
  );
}

export function PointsRibbon({ tournament }: { tournament: Tournament; live: boolean }) {
  const headerOffset = useHeaderOffset();
  const safeAvailable = tournament.pointsAvailable || 1;
  const realMaroon = Math.min(100, (tournament.maroonPts / safeAvailable) * 100);
  const realWhite = Math.min(100, (tournament.whitePts / safeAvailable) * 100);
  const maroonFill = flooredFill(realMaroon, realWhite);
  const whiteFill = flooredFill(realWhite, realMaroon);
  const stillAvailable = Math.max(0, tournament.pointsAvailable - tournament.maroonPts - tournament.whitePts);
  const badgeState = computeBadgeState(tournament);

  return (
    <div className="sticky z-40 w-screen ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]" style={{ top: headerOffset }}>
      <div className="relative flex h-[38px] w-full border-y border-gold-300 sm:h-[56px] lg:h-[77px]">
        <div className="absolute left-1/2 top-0 bottom-0 z-0 w-[2px]" style={{ background: "var(--color-gold-400)", boxShadow: "0 0 8px rgba(201,168,110,0.7)" }} />
        <div className="relative z-[1] overflow-hidden flex items-center justify-end pr-[10%]" style={{ width: `${maroonFill}%`, background: "var(--color-maroon-700)" }}>
          <div className="mm-shimmer-left" />
          <span className="mm-gold-num relative font-sans">{fmtPt(tournament.maroonPts)}</span>
        </div>
        <div className="flex-1 bg-cream-200" />
        <div className="relative z-[1] overflow-hidden flex items-center justify-start pl-[10%]" style={{ width: `${whiteFill}%`, background: "#fdfdfb" }}>
          <div className="mm-shimmer-right" />
          <span className="mm-gold-num-white relative font-sans">{fmtPt(tournament.whitePts)}</span>
        </div>
        <WinBadge state={badgeState} />
      </div>
      <div className="relative min-h-[22px] border-2 border-t-0 border-gold-400 bg-cream-100 sm:min-h-[32px] lg:min-h-[45px]">
        <span className="mm-team-fill-maroon absolute left-2 top-1/2 -translate-y-1/2 font-sans text-[11px] font-black sm:left-4 sm:text-[18px] lg:left-7 lg:text-[36px]">MAROON</span>
        {badgeState.kind === "undecided" && (
          <div className="absolute left-1/2 top-1/2 flex h-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap border border-ink-900 px-1 font-sans text-[6px] font-extrabold uppercase tracking-wide text-ink-900 sm:h-6 sm:border-2 sm:px-2 sm:text-[8px] lg:h-8 lg:px-3 lg:text-[11px]">
            Points Available {fmtPt(stillAvailable)}
          </div>
        )}
        <span className="mm-team-fill-white absolute right-2 top-1/2 -translate-y-1/2 font-sans text-[11px] font-black sm:right-4 sm:text-[18px] lg:right-7 lg:text-[36px]">WHITE</span>
      </div>

    </div>
  );
}

function SelectorButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-h-[30px] rounded-sm border px-2.5 font-condensed text-xs font-black uppercase tracking-wide shadow-sm transition-colors sm:min-h-[42px] sm:px-5 sm:text-sm",
        active ? "border-gold-400 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-gold-400 hover:bg-cream-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SessionDropdown({
  sessions,
  selected,
  onChange,
}: {
  sessions: SessionGroup[];
  selected?: SessionGroup;
  onChange: (session: SessionGroup) => void;
}) {
  return (
    <div className="group relative z-20 inline-block">
      <button
        type="button"
        className="inline-flex min-h-[30px] min-w-[140px] items-center justify-between gap-2 rounded-sm border border-gold-400 bg-white px-2.5 font-condensed text-[10px] font-black uppercase tracking-wide text-maroon-700 shadow-sm hover:bg-cream-50 sm:min-h-[42px] sm:min-w-[220px] sm:gap-3 sm:px-4 sm:text-xs"
      >
        {selected?.label ?? "Session"}
        <ChevronDown size={15} />
      </button>
      <div className="invisible absolute right-0 top-full w-[280px] pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-md border border-ink-100 bg-white shadow-xl">
          {sessions.map((session) => {
            const active = selected?.id === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onChange(session)}
                className={["block w-full border-b border-ink-100 px-4 py-3 text-left last:border-b-0", active ? "bg-maroon-50" : "hover:bg-cream-50"].join(" ")}
              >
                <span className="block font-condensed text-xs font-black uppercase tracking-wide text-ink-900">{session.label}</span>
                <span className="mt-1 block font-sans text-xs text-ink-400">{session.meta}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MatchPlayShowcase({
  liveTournament,
  defaultOption = "live",
}: {
  liveTournament: Tournament;
  defaultOption?: BoardOption;
}) {
  const [option, setOption] = useState<BoardOption>(defaultOption);
  const [sessionByYear, setSessionByYear] = useState<Record<string, string>>({});
  const selectedHistorical = option === "live" ? null : tournamentsByYear.get(option);
  const sessions = useMemo(() => (selectedHistorical ? groupSessions(selectedHistorical) : []), [selectedHistorical]);
  const selectedSession = selectedHistorical ? sessions.find((session) => session.id === sessionByYear[option]) ?? sessions[0] : undefined;
  const matches = selectedHistorical ? selectedSession?.matches ?? [] : liveTournament.matches;
  const liveWaiting = option === "live" && matches.length === 0;
  const liveSessionStatus = currentSessionStatus(liveTournament);
  const liveSessions = useMemo(() => groupSessions(liveTournament), [liveTournament]);
  const activeLiveSession = liveSessions[liveSessionStatus.sessionNumber - 1];
  const liveSessionSubmitted = Boolean(activeLiveSession && activeLiveSession.matches.length >= 3);
  const champion = defendingIndividualChampion(selectedHistorical ?? liveTournament);

  return (
    <div className="mb-5 sm:mb-10">
      <section className="rounded-lg border border-ink-100 bg-white/70 p-2 shadow-lg sm:p-4 lg:p-5">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b-2 border-ink-900 pb-2 sm:mb-5 sm:gap-4 sm:pb-4">
          {option === "live" ? (
            <div>
              <div className="font-condensed text-[9px] font-bold uppercase tracking-eyebrow text-gold-700 sm:text-[11px]">Match Play Leaderboard</div>
              {liveSessionSubmitted ? (
                <>
                  <div className="mt-1 font-sans text-xs font-extrabold uppercase text-ink-900 sm:text-sm">Session {liveSessionStatus.sessionNumber}</div>
                  <h2 className="m-0 flex items-center gap-2 font-sans text-lg font-black text-gold-700 sm:text-4xl">
                    {activeLiveSession?.matches[0]?.format ?? "Match Play"}
                    {liveSessionStatus.kind === "live" && <Radio size={20} className="text-score-under" />}
                  </h2>
                </>
              ) : (
                <>
                  <h2 className="m-0 font-sans text-base font-black text-ink-900 sm:text-3xl">{centralDateLabel()}</h2>
                  {liveSessionStatus.kind === "tee-time" && <p className="m-0 mt-1 font-sans text-xs text-ink-500 sm:text-sm">{liveSessionStatus.teeTime} Tee Time</p>}
                  {liveSessionStatus.kind === "awaiting" && <p className="m-0 mt-1 font-sans text-xs text-ink-500 sm:text-sm">Awaiting Match Groupings</p>}
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="font-condensed text-[9px] font-bold uppercase tracking-eyebrow text-gold-700 sm:text-[11px]">Match Play Leaderboard</div>
              <h2 className="m-0 font-sans text-base font-black text-ink-900 sm:text-3xl">{option} Match Sessions</h2>
            </div>
          )}
          {option === "live" && (
            <Link
              href="/history"
              className="ml-auto inline-flex max-w-[320px] items-center rounded-sm border border-gold-400 bg-white px-2 py-1 text-right font-condensed text-[9px] font-black uppercase tracking-wide text-maroon-700 shadow-sm transition-colors hover:bg-cream-50 sm:px-4 sm:py-2 sm:text-xs"
            >
              2027 Tournament Starts on January 6th 2027, Check Out Past Tournaments
            </Link>
          )}
          {option !== "live" && (
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              {(["2026", "2025", "2024"] as BoardOption[]).map((item) => (
                <SelectorButton key={item} active={option === item} onClick={() => setOption(item)}>
                  {optionLabel(item)}
                </SelectorButton>
              ))}
              {selectedHistorical && <SessionDropdown sessions={sessions} selected={selectedSession} onChange={(session) => setSessionByYear((current) => ({ ...current, [option]: session.id }))} />}
            </div>
          )}
        </div>

        {liveWaiting ? (
          <div className="grid gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
            {[1, 2, 3].map((item) => (
              <PlaceholderCard key={item} index={item} />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
            {matches.map((match, index) => (
              <MatchCard key={match.id} match={match} index={index + 1} defendingChampion={champion} tournamentSlug={(selectedHistorical ?? liveTournament).slug} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}





