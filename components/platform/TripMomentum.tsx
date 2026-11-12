"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import toggleStyles from "./GolfTripCompetition.module.css";
import notificationStyles from "./GolfTripNotifications.module.css";
import { countdownParts } from "@/lib/platform/momNotifications";
import { draftWhenLabel } from "@/lib/platform/teamDraft";
import { homeDraftTeamsReady, homeDraftHasSchedule } from "@/lib/platform/homeDraft";
import { matchDraftTimeError } from "@/lib/platform/draftSchedule";
import { draftBoard, teamDraftSize, type TeamDraft } from "@/lib/platform/teamDraft";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import styles from "./TripMomentum.module.css";
import { useDevSetup } from "@/lib/dev/tripSetupStore";
import { readJustCreatedAll, useJustCreatedVersion } from "@/lib/dev/justCreatedStore";
import { useSavedTripSetup } from "./SavedTripSetupProvider";
import { matchDraftRounds, type MatchDraftPlayer } from "@/lib/platform/matchDraft";
import type { MomRound } from "@/lib/platform/momNotifications";
import { matchDraftPreviewData } from "@/lib/dev/matchDraftPreview";
import { draftSimFixture } from "@/lib/dev/draftSim";
import { TripMatchDraftRoom } from "./TripMatchDraftRoom";
import { TripDraftRoom, type DraftRoomPlayer, type LiveDraftRoom } from "./TripDraftRoom";
import { useTeamDraft } from "@/lib/platform/useTeamDraft";
import { draftBoardFor, draftRoomPlayersFrom, type DraftCaptains } from "@/lib/platform/teamDraftPicks";

// A one-second clock; the server has no clock (null), so nothing time-based flashes a placeholder while loading.
const subscribe = (tick: () => void) => { const id = window.setInterval(tick, 1000); return () => window.clearInterval(id); };
const nowSeconds = () => Math.floor(Date.now() / 1000);
const pad = (value: number) => String(value).padStart(2, "0");
const localStamp = (seconds: number) => {
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const shiftStamp = (stamp: string, seconds: number) => new Date(Date.parse(`${stamp.length === 16 ? `${stamp}:00` : stamp}Z`) + seconds * 1000).toISOString().slice(0, 19);
/** The device's short time zone name ("CDT"), shown after the draft time. */
const zoneName = () => new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find(part => part.type === "timeZoneName")?.value ?? "";

// Push reminder opt-ins per trip (preview: kept on this device until reminders are saved with the trip).
const REMINDER_KEY = "golfTripDraftReminder";
const REMINDER_EVENT = "golf-trip-draft-reminder";
const readRaw = () => { try { return window.localStorage.getItem(REMINDER_KEY) ?? "{}"; } catch { return "{}"; } };
const parseReminders = (raw: string): Record<string, boolean> => { try { return JSON.parse(raw) as Record<string, boolean>; } catch { return {}; } };
const subscribeReminders = (change: () => void) => {
  window.addEventListener("storage", change); window.addEventListener(REMINDER_EVENT, change);
  return () => { window.removeEventListener("storage", change); window.removeEventListener(REMINDER_EVENT, change); };
};

/** Existing team draft and next match draft occupy separate Home cards. */
export function TripDraftWidget({ draft, startAt, editHref, players = [], scope = "default", rounds = [], playedThrough = 0, teamNames = ["Team A","Team B"], fallback = null, headingClassName, onTeamsComplete }: {
  onTeamsComplete?: (players: MatchDraftPlayer[]) => void;
  headingClassName?: string;
  draft?: TeamDraft; startAt?: string; editHref?: string; players?: DraftRoomPlayer[]; scope?: string; rounds?: MomRound[]; playedThrough?: number; teamNames?: string[];
  /** Shown instead when there is no team draft or match draft card. */
  fallback?: ReactNode;
}) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  const simulator = useSimulator();
  const [loadedAt] = useState(nowSeconds);
  const now = seconds === null ? null : startAt ? shiftStamp(startAt, seconds - loadedAt) : localStamp(seconds);
  const dev = useDevSetup(scope);
  const saved = useSavedTripSetup();
  const version = useJustCreatedVersion();
  const setup = saved?.values ?? (scope === "empty" ? readJustCreatedAll(version) : dev);
  const [openRound, setOpenRound] = useState<string | null>(null);
  const sourceKey = JSON.stringify([scope, players, setup, draft, simulator?.state]);
  const [completed, setCompleted] = useState<{ key: string; players: MatchDraftPlayer[] } | null>(null);
  const assignments = setup.teamPicks as Record<number, number> | undefined;
  const submitted = setup.submittedTeams as number[][] | undefined;
  let matchPlayers: MatchDraftPlayer[] = players.flatMap((player,index) => {
    const picked = submitted ? submitted.findIndex(team => team.includes(index)) : assignments ? assignments[index] : player.team === "A" ? 0 : player.team === "B" ? 1 : -1;
    return picked === 0 || picked === 1 ? [{ ...player, id: String(index), team: picked === 0 ? "A" as const : "B" as const }] : [];
  });
  let team = draft;
  let matchRounds = matchDraftRounds(setup,rounds,players.length,playedThrough);
  // Simulator Home → Team Draft / Match Selection pages: a sample draft, roster and round (lib/dev/draftSim.ts).
  const sim = process.env.NODE_ENV === "development" && simulator ? draftSimFixture(simulator.state, startAt ?? localStamp(loadedAt)) : null;
  if (sim) {
    team = sim.team;
    players = sim.players;
    matchPlayers = sim.matchPlayers;
    matchRounds = sim.matchRounds;
  } else if (process.env.NODE_ENV === "development" && simulator?.state.dualDraftMomentum) {
    const base = startAt ?? localStamp(loadedAt);
    const future = (by: number): TeamDraft => {
      const target = shiftStamp(base,by);
      return {teamType:"2 Teams",selection:"Draft",date:target.slice(0,10),time:target.slice(11,16),type:"Snake",method:"Captain's Picks"};
    };
    team = future(simulator.state.matchDraftPreview && simulator.state.matchDraftPreview !== "off" ? -3600 : 86400);
    const method = simulator.state.matchDraftPreview;
    const fixture = matchDraftPreviewData(matchPlayers,rounds.map(round=>round.course),base,method && method !== "off" ? method : "Response");
    matchPlayers = fixture.players;
    matchRounds = fixture.rounds;
    if (!method || method === "off") {
      players = fixture.players.map(player => ({ name: player.name, handicap: player.handicap }));
      matchPlayers = [];
    }

  }
  // Pairs / 3-Ball / 4-Ball: captains set in Settings → Players ("index:name" keys by team) sit in spot 1 of their team.
  const captainKeys = setup.teamCaptains as Record<string, string> | undefined;
  if (!sim && captainKeys && teamDraftSize(team?.teamType)) players = players.map(player => {
    const captainOf = Object.entries(captainKeys).find(([, key]) => key.slice(key.indexOf(":") + 1) === player.name)?.[0];
    return captainOf === undefined ? player : { ...player, captain: true, teamIndex: Number(captainOf) };
  });
  if (completed?.key === sourceKey) matchPlayers = completed.players;
  const teamsReady = homeDraftTeamsReady(players.length, matchPlayers);
  const board = !teamsReady && team?.teamType && team.selection === "Draft"
    ? draftBoard(team, now) ?? { when: team.date ? draftWhenLabel(team.date, team.time) : null, target: team.date ? team.date + "T" + (team.time || "00:00") : null } : null;
  const next = [...matchRounds].filter(round => !round.locked).sort((a,b)=>(a.date ? a.date+"T"+(a.time||"00:00") : "9999").localeCompare(b.date ? b.date+"T"+(b.time||"00:00") : "9999"))[0];
  const blockedReason = !teamsReady ? "Complete the team draft first." : next ? matchDraftTimeError(team ?? {}, next.date, next.time) : null;
  const roomPlayers = players.map((player, index) => {
    const picked = matchPlayers.find(item => item.id === String(index));
    return picked ? { ...player, team: picked.team, teamIndex: picked.team === "A" ? 0 : 1 } : player;
  });
  const names = setup.teamNames as string[] | undefined ?? teamNames;
  // A saved trip's team draft is live: picks are saved on the server and final (simulator samples stay in the room).
  const liveTripId = !sim && !(process.env.NODE_ENV === "development" && simulator?.state.dualDraftMomentum) && saved?.tripId && team?.selection === "Draft" ? saved.tripId : null;
  // Simulator "Match Room open": open the sample round's room (again whenever the sample changes; closed when it's off).
  const simMatchRoom = simulator?.state.draftSim === "match" && sim?.roomKey ? sim.roomKey : null;
  const [seenSimRoom, setSeenSimRoom] = useState<string | null>(null);
  if (simMatchRoom !== seenSimRoom) { setSeenSimRoom(simMatchRoom); setOpenRound(simMatchRoom ? sim?.matchRounds[0]?.key ?? null : null); }
  return <>
    {board && team && <section aria-label="Upcoming team draft"><h2 className={headingClassName}>Team Draft</h2><div className={styles.draftWidget}><DraftStrip canEdit={!!editHref && !saved?.readOnly} draft={team} board={board} now={now} editHref={editHref} players={roomPlayers} onComplete={team.teamType === "2 Teams" ? result => { setCompleted({ key: sourceKey, players: result }); onTeamsComplete?.(result); } : undefined} simRoomKey={simulator?.state.draftSim === "team" ? sim?.roomKey : null} keepKey={simulator?.state.draftSim === "team" ? sim?.sampleKey : undefined} liveTripId={liveTripId}/></div></section>}
    {next && <section aria-label="Upcoming match selection"><h2 className={headingClassName}>Match Selection</h2><div className={styles.draftWidget}><DraftStrip draft={{teamType:"2 Teams",selection:"Draft",date:next.date||"",time:next.time||"",type:"Snake"}} board={{when:next.when,target:next.date ? next.date+"T"+(next.time||"00:00") : null}} now={now} editHref={editHref} players={players} matchRound={next.number} matchLabel={next.course+" - "+next.format+" - "+next.type} blockedReason={blockedReason} onOpen={()=>{ if (!blockedReason) setOpenRound(next.key); }}/></div></section>}
    {!board && !next && fallback}
    {openRound && teamsReady && !blockedReason && <TripMatchDraftRoom key={seenSimRoom ?? openRound} modal rounds={matchRounds} players={matchPlayers} initialRound={openRound} teamNames={names} canEdit={!!editHref && !saved?.readOnly && teamsReady && !blockedReason} onClose={()=>setOpenRound(null)}/>}
  </>;
}

export function TripMomentum({ events, fallback }: { events: MomentumEvent[]; fallback: ReactNode }) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  return <section id="momentum" className={styles.momentum} aria-label="Momentum">{events.length ? <HighlightStrip events={events} turn={seconds === null ? 0 : Math.floor(seconds / 10)} /> : fallback}</section>;
}

/** Before the draft: Team Draft · day and time (Edit for the organizer), then the countdown with Draft Room. */
function DraftStrip({ draft, board, now, editHref, players, matchRound, matchLabel, onOpen, onComplete, blockedReason, canEdit = false, simRoomKey = null, liveTripId = null, keepKey }: { keepKey?: string; liveTripId?: string | null; canEdit?: boolean; onComplete?: (players: MatchDraftPlayer[]) => void; blockedReason?: string | null; simRoomKey?: string | null; players: DraftRoomPlayer[]; draft: TeamDraft; board: { when: string | null; target: string | null }; now: string | null; editHref?: string; matchRound?: number; matchLabel?: string; onOpen?: () => void }) {
  const zone = useSyncExternalStore(subscribe, zoneName, () => "");
  const [roomOpen, setRoomOpen] = useState(false);
  // Simulator "Draft Room open": open the room (fresh) whenever the sample changes; close it when the sample says closed.
  const [seenSimRoom, setSeenSimRoom] = useState<string | null>(null);
  if (simRoomKey !== seenSimRoom) { setSeenSimRoom(simRoomKey); setRoomOpen(!!simRoomKey); }
  const scheduled = homeDraftHasSchedule(draft.date, draft.time);
  const reached = !!(scheduled && matchRound && board.target && now && now >= board.target);
  const parts = reached ? {days:0,hours:0,minutes:0,seconds:0} : scheduled && board.target && now ? countdownParts(board.target, now.length === 16 ? `${now}:00` : now) : null;
  const units = [["Days", parts?.days], ["Hrs", parts?.hours], ["Mins", parts?.minutes], ["Secs", parts?.seconds]] as const;
  const liveDraft = useTeamDraft(liveTripId, roomOpen);
  const live = liveTripId ? liveDraftRoom(liveDraft) : undefined;
  const closeRoom = () => { setRoomOpen(false); if (live && liveDraft.data?.draft.completedAt) window.location.reload(); }; // finished: Home picks up the saved teams
  return <div className={styles.draft}>
    <div className={styles.draftTop}>
      {!scheduled && editHref ? <Link href={editHref} className={styles.scheduleButton} aria-label={matchRound ? "Set match selection date and time" : "Set team draft date and time"}>No Date Set</Link>
        : <span className={styles.draftWhen} role="status">{scheduled ? `${draftWhenLabel(draft.date, draft.time)}${zone ? ` ${zone}` : ""}` : "No Date Set"}</span>}
      {scheduled && editHref && <Link href={editHref} className={styles.edit}>Edit</Link>}
    </div>
    {matchLabel && <p className={styles.matchLabel}>{matchRound ? `Round ${matchRound} - ${matchLabel}` : matchLabel}</p>}
    <div className={styles.draftBottom}>
      <div className={styles.countdown} role="timer" aria-label={parts ? `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until the draft` : "Countdown to the draft"}>
        {units.map(([label, value], index) => <div key={label} className={styles.unitWrap}>
          {index > 0 && <span className={styles.colon} aria-hidden>:</span>}
          <span className={styles.unit}>
            <span className={styles.digits} aria-hidden>{value === undefined ? "--" : pad(value)}</span>
            <span className={styles.label} aria-hidden>{label}</span>
          </span>
        </div>)}
      </div>
    </div>
    {blockedReason && <p className={styles.matchLabel} role="status">{blockedReason}</p>}
    <div className={styles.draftActions}>
      <button type="button" className={styles.room} disabled>Mock Draft</button>
      <button type="button" className={styles.room} disabled={!!blockedReason} onClick={onOpen ?? (() => setRoomOpen(true))}>Draft Room</button>
    </div>
    {roomOpen && <TripDraftRoom key={seenSimRoom ?? "room"} keepKey={keepKey} live={live} teamType={liveDraft.data?.settings.teamType ?? draft.teamType} canEdit={canEdit} onComplete={onComplete ? result => { onComplete(result); setRoomOpen(false); } : undefined}
      players={live && liveDraft.data ? draftRoomPlayersFrom(liveDraft.data) : players} draftType={liveDraft.data?.settings.method ?? draft.method ?? "Captain's Picks"} draftOrder={liveDraft.data?.settings.order ?? draft.type}
      countdown={parts} when={draftWhen(draft, board, zone).replace(` · ${draft.type}`, "")} onClose={closeRoom} />}
  </div>;
}

/** A saved draft as the room needs it: who may pick / start, and the one status line. */
function liveDraftRoom(liveDraft: ReturnType<typeof useTeamDraft>): LiveDraftRoom {
  const data = liveDraft.data;
  const captains = data ? Object.fromEntries(data.captains.flatMap((id, team) => id ? [[String(team), id]] : [])) as DraftCaptains : {};
  const board = data ? draftBoardFor(data.members, captains, data.settings, data.draft.picks) : null;
  const ready = !!data && !!board && !board.missingCaptains.length;
  const organizer = !!data?.viewer.isOrganizer;
  const status = !data ? "Loading the draft…" : data.draft.completedAt ? "Draft complete — the teams are saved."
    : !ready ? (organizer ? "Every team needs a captain first (Settings → Players)." : "Waiting for the organizer to set captains.")
    : !data.draft.startedAt ? (organizer ? "Tap Start team draft when everyone's ready." : "Waiting for the organizer to start the draft.") : "";
  return {
    started: !!data?.draft.startedAt && !data.draft.completedAt, busy: liveDraft.busy, message: liveDraft.message || status,
    canPick: team => ready && (organizer || data!.viewer.captainOf === team), canStart: ready && organizer,
    onPick: id => void liveDraft.pick(id), onStart: () => void liveDraft.start(),
  };
}

/** "Mon, Dec 20th @ 09:15 PM CDT · Snake", or "Draft date not set yet". */
function draftWhen(draft: TeamDraft, board: { when: string | null }, zone: string): string {
  return board.when ? `${board.when}${zone && board.when.includes("@") ? ` ${zone}` : ""} · ${draft.type}` : "Draft date not set yet";
}

/**
 * The header's Notifications panel, before a team draft: "Team Draft" with when it is, and a push reminder to turn on.
 * Nothing once the draft has started (or when teams aren't picked by draft).
 */
export function TeamDraftNotice({ draft, tripKey, startAt }: { draft?: TeamDraft; tripKey: string; startAt?: string }) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  const [loadedAt] = useState(nowSeconds);
  const now = seconds === null ? null : startAt ? shiftStamp(startAt, seconds - loadedAt) : localStamp(seconds);
  const zone = useSyncExternalStore(subscribe, zoneName, () => "");
  const remind = parseReminders(useSyncExternalStore(subscribeReminders, readRaw, () => "{}"))[tripKey] ?? false;
  const board = draftBoard(draft, now);
  if (!board || !draft) return null;
  const toggleReminder = () => {
    const next = { ...parseReminders(readRaw()), [tripKey]: !remind };
    try { window.localStorage.setItem(REMINDER_KEY, JSON.stringify(next)); } catch { /* storage blocked: the choice isn't kept */ }
    window.dispatchEvent(new Event(REMINDER_EVENT));
  };
  return <section className={`${notificationStyles.notifications} ${styles.notice}`} aria-label="Team Draft">
    <h2 className={notificationStyles.categoryTitle}>Team Draft</h2>
    <p>{draftWhen(draft, board, zone)}</p>
    <div className={notificationStyles.row}>
      <span className={notificationStyles.label}>Push reminder</span>
      <button type="button" role="switch" aria-checked={remind} aria-label="Push reminder for the team draft" className={toggleStyles.toggle} onClick={toggleReminder}>
        <span className={toggleStyles.track} data-on={remind}><span className={toggleStyles.thumb} /></span><span>{remind ? "On" : "Off"}</span>
      </button>
    </div>
  </section>;
}

/** During the trip: the newest highlights, one at a time — headline over its line ("Heating Up!" / "3 birdies in a row for Cam"). */
function HighlightStrip({ events, turn }: { events: MomentumEvent[]; turn: number }) {
  const shown = events.slice(0, 5);
  const event = shown[turn % shown.length];
  return <div key={shown.length > 1 ? turn : event.id} className={`${styles.highlight} ${shown.length > 1 ? styles.rotating : ""}`} role="status" aria-live="polite">
    <span className={styles.highlightTitle}>{event.title}</span>
    <span className={styles.highlightDetail}>{event.detail}</span>
  </div>;
}
