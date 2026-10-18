"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import toggleStyles from "./GolfTripCompetition.module.css";
import notificationStyles from "./GolfTripNotifications.module.css";
import { countdownParts } from "@/lib/platform/momNotifications";
import { draftWhenLabel } from "@/lib/platform/teamDraft";
import { matchDraftTimeError } from "@/lib/platform/draftSchedule";
import { draftBoard, type TeamDraft } from "@/lib/platform/teamDraft";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import styles from "./TripMomentum.module.css";
import { useDevSetup } from "@/lib/dev/tripSetupStore";
import { readJustCreatedAll, useJustCreatedVersion } from "@/lib/dev/justCreatedStore";
import { useSavedTripSetup } from "./SavedTripSetupProvider";
import { matchDraftRounds, type MatchDraftPlayer } from "@/lib/platform/matchDraft";
import type { MomRound } from "@/lib/platform/momNotifications";
import { matchDraftPreviewData } from "@/lib/dev/matchDraftPreview";
import { TripMatchDraftRoom } from "./TripMatchDraftRoom";
import { TripDraftRoom, type DraftRoomPlayer } from "./TripDraftRoom";

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
export function TripDraftWidget({ draft, startAt, editHref, players = [], scope = "default", rounds = [], playedThrough = 0, teamNames = ["Team A","Team B"] }: {
  draft?: TeamDraft; startAt?: string; editHref?: string; players?: DraftRoomPlayer[]; scope?: string; rounds?: MomRound[]; playedThrough?: number; teamNames?: string[];
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
  const assignments = setup.teamPicks as Record<number, number> | undefined;
  const submitted = setup.submittedTeams as number[][] | undefined;
  let matchPlayers: MatchDraftPlayer[] = players.flatMap((player,index) => {
    const picked = submitted ? submitted.findIndex(team => team.includes(index)) : assignments ? assignments[index] : player.team === "A" ? 0 : player.team === "B" ? 1 : -1;
    return picked === 0 || picked === 1 ? [{ ...player, id: String(index), team: picked === 0 ? "A" as const : "B" as const }] : [];
  });
  let team = draft;
  let matchRounds = matchDraftRounds(setup,rounds,players.length,playedThrough);
  if (process.env.NODE_ENV === "development" && simulator?.state.dualDraftMomentum) {
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

  }
  const fixtureTeamsReady = process.env.NODE_ENV === "development" && simulator?.state.dualDraftMomentum && simulator.state.matchDraftPreview && simulator.state.matchDraftPreview !== "off";
  const teamsReady = (fixtureTeamsReady || matchPlayers.length === players.length && players.length > 1) && (["A","B"] as const).every(side=>matchPlayers.some(player=>player.team===side));
  const board = draftBoard(team,now) ?? (team?.selection === "Draft" && (!teamsReady || !team.date || !team.time) ? {when:team.date ? draftWhenLabel(team.date,team.time) : null,target:team.date ? team.date+"T"+(team.time||"00:00") : null} : null);
  const next = [...matchRounds].filter(round=>!round.locked && !matchDraftTimeError(team ?? {},round.date,round.time)).sort((a,b)=>(a.date ? a.date+"T"+(a.time||"00:00") : "9999").localeCompare(b.date ? b.date+"T"+(b.time||"00:00") : "9999"))[0];
  const names = setup.teamNames as string[] | undefined ?? teamNames;
  return <>
    {board && team && <section className={styles.draftWidget} aria-label="Upcoming team draft"><DraftStrip draft={team} board={board} now={now} editHref={editHref} players={players}/></section>}
    {!board && teamsReady && next && <section className={styles.draftWidget} aria-label="Upcoming match draft"><DraftStrip draft={{teamType:"2 Teams",selection:"Draft",date:next.date||"",time:next.time||"",type:"Snake"}} board={{when:next.when,target:next.date ? next.date+"T"+(next.time||"00:00") : null}} now={now} editHref={editHref} players={players} matchRound={next.number} matchLabel={next.course+" - "+next.format+" - "+next.type} onOpen={()=>setOpenRound(next.key)}/></section>}
    {openRound && <TripMatchDraftRoom modal rounds={matchRounds} players={matchPlayers} initialRound={openRound} teamNames={names} canEdit={!!editHref && !saved?.readOnly && teamsReady && !board} onClose={()=>setOpenRound(null)}/>}
  </>;
}

export function TripMomentum({ events, fallback }: { events: MomentumEvent[]; fallback: ReactNode }) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  return <section id="momentum" className={styles.momentum} aria-label="Momentum">{events.length ? <HighlightStrip events={events} turn={seconds === null ? 0 : Math.floor(seconds / 10)} /> : fallback}</section>;
}

/** Before the draft: Team Draft · day and time (Edit for the organizer), then the countdown with Draft Room. */
function DraftStrip({ draft, board, now, editHref, players, matchRound, matchLabel, onOpen }: { players: DraftRoomPlayer[]; draft: TeamDraft; board: { when: string | null; target: string | null }; now: string | null; editHref?: string; matchRound?: number; matchLabel?: string; onOpen?: () => void }) {
  const zone = useSyncExternalStore(subscribe, zoneName, () => "");
  const [roomOpen, setRoomOpen] = useState(false);
  const reached = !!(matchRound && board.target && now && now >= board.target);
  const parts = reached ? {days:0,hours:0,minutes:0,seconds:0} : board.target && now ? countdownParts(board.target, now.length === 16 ? `${now}:00` : now) : null;
  const units = [["Days", parts?.days], ["Hrs", parts?.hours], ["Mins", parts?.minutes], ["Secs", parts?.seconds]] as const;
  return <div className={styles.draft}>
    <div className={styles.draftTop}>
      <span className={styles.draftTitle}>{matchRound ? `Match Draft · Round ${matchRound}` : "Team Draft"}</span>
      <span className={styles.draftWhen} role="status">{matchRound ? board.when : draftWhen(draft, board, zone)}</span>
      {editHref && <Link href={editHref} className={styles.edit}>Edit</Link>}
    </div>
    {matchLabel && <p className={styles.matchLabel}>{matchLabel}</p>}
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
      <button type="button" className={styles.room} onClick={onOpen ?? (() => setRoomOpen(true))}>{matchRound ? "Match Room" : "Draft Room"}</button>
    </div>
    {roomOpen && <TripDraftRoom players={players} draftType={draft.method ?? "Captain's Picks"} draftOrder={draft.type} countdown={parts} when={draftWhen(draft, board, zone).replace(` · ${draft.type}`, "")} onClose={() => setRoomOpen(false)} />}
  </div>;
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
