"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, Check, ChevronDown, Shuffle } from "lucide-react";
import { GolfTeeSheet } from "./GolfTripMatch";
import { Wheel as VerticalWheel } from "./TeeTimePicker";
import wheelStyles from "./TeeTimePicker.module.css";
import { DEFAULT_TIMING, randomTeeSheet, roundTeeSheet, scoreTeeSheet, teeSlot, teeTimeLabel, type CodeTournament, type TeeSheet, type TeeStart, type TeeTiming } from "@/lib/platform/codeTournaments";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import styles from "./CodeTournament.module.css";

const EVERY = [7, 8, 9, 10, 12, 15];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const DIGITS = Array.from({ length: 10 }, (_, i) => String(i));

/**
 * The first tee time on vertical wheels (like the golf schedule's): the hour, the minutes' tens and ones (each on its
 * own wheel), and AM / PM. `value` and `onChange` are "HH:MM" (24-hour).
 */
function FirstTeeWheels({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const [h, m] = value.split(":").map(Number);
  const parts = { hour: (h % 12 || 12) - 1, tens: Math.floor((m || 0) / 10), ones: (m || 0) % 10, period: h < 12 ? 0 : 1 };
  const set = (change: Partial<typeof parts>) => {
    const next = { ...parts, ...change };
    onChange(`${String(((next.hour + 1) % 12) + (next.period ? 12 : 0)).padStart(2, "0")}:${next.tens}${next.ones}`);
  };
  return <div className={`${wheelStyles.wheels} ${styles.timeWheels}`}>
    <span className={wheelStyles.band} aria-hidden />
    <VerticalWheel label="Hour" values={HOURS} index={parts.hour} onIndex={(hour) => set({ hour })} />
    <span className={styles.firstTeeColon} aria-hidden>:</span>
    <VerticalWheel label="Minutes, tens" values={DIGITS.slice(0, 6)} index={parts.tens} onIndex={(tens) => set({ tens })} />
    <VerticalWheel label="Minutes, ones" values={DIGITS} index={parts.ones} onIndex={(ones) => set({ ones })} />
    <VerticalWheel label="AM or PM" values={["AM", "PM"]} index={parts.period} onIndex={(period) => set({ period })} />
  </div>;
}
const STARTS: { value: TeeStart; label: string }[] = [{ value: "1", label: "Hole 1" }, { value: "1&10", label: "Holes 1 & 10" }, { value: "shotgun", label: "Shotgun" }];

/** How a saved sheet was started: one time with holes beyond 1 / 10 = shotgun; any group off 10 = 1 & 10; else off 1. */
function startOf(sheet: TeeSheet): TeeStart {
  const { groups } = sheet;
  if (groups.length > 1 && groups.every((g) => g.time === groups[0].time) && groups.some((g) => g.hole !== 1 && g.hole !== 10)) return "shotgun";
  return groups.some((g) => g.hole === 10) ? "1&10" : "1";
}

/** A dropdown that matches the page: the choice on a pill, then a dark list with a gold check on the current one. */
function Dropdown<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={ref} className={styles.dropdown}>
    <button type="button" className={styles.dropdownButton} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
      <span>{options.find((o) => o.value === value)?.label ?? ""}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <ul className={styles.dropdownList} role="listbox" aria-label={label}>
      {options.map((o) => <li key={String(o.value)}><button type="button" role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
        {o.label}{o.value === value && <Check size={15} aria-hidden="true" />}</button></li>)}
    </ul>}
  </div>;
}

/** A tournament round's Tee Sheet tab: each group's tee time, starting hole and players (the organizer edits it in Settings). */
export function CodeTournamentTeeSheet({ t, round, match }: { t: CodeTournament; round: number; match: GolfMatchPreview }) {
  const golfer = (id: string) => match.leaderboard[t.players.findIndex((p) => p.profileId === id)]?.golfer;
  const groups = roundTeeSheet(t, round).groups.map((g) => ({ time: teeTimeLabel(g.time), hole: g.hole, golfers: g.players.map(golfer).filter((x) => x !== undefined) }));
  return <GolfTeeSheet match={match} groups={groups} />;
}

/**
 * Tournament Settings → Tee Sheet: set the first tee time, minutes between groups and 1 / 1 & 10 starts (re-times every
 * group), randomize the pairings or order them by score (worst first, leaders last), move a player to another group, and change any one group's time or hole. Save sends it
 * to everyone.
 */
export function TeeSheetEditor({ t, round, sheet, holes, onCancel, onSave }: { t: CodeTournament; round: number; sheet: TeeSheet; holes: number; onCancel: () => void; onSave: (sheet: TeeSheet) => Promise<void> }) {
  const [draft, setDraft] = useState(sheet);
  const [timing, setTiming] = useState<TeeTiming>(() => ({ ...DEFAULT_TIMING, first: sheet.groups[0]?.time || DEFAULT_TIMING.first, start: holes >= 18 || startOf(sheet) === "shotgun" ? startOf(sheet) : "1" }));
  const [saving, setSaving] = useState(false);
  const ids = sheet.groups.flatMap((g) => g.players);
  const byScore = scoreTeeSheet(t, round, ids, timing, holes);
  const name = (id: string) => t.players.find((p) => p.profileId === id)?.name ?? "Player";
  // New timing: every group gets its slot in order (players stay put).
  const retime = (next: TeeTiming) => { setTiming(next); setDraft((d) => ({ groups: d.groups.map((g, i) => ({ ...g, ...teeSlot(i, next, holes) })) })); };
  const setGroup = (i: number, change: Partial<TeeSheet["groups"][number]>) => setDraft((d) => ({ groups: d.groups.map((g, k) => k === i ? { ...g, ...change } : g) }));
  // Move a player to group `to` (= groups.length: a new group at the next slot); a group left empty goes away.
  const move = (id: string, to: number) => setDraft((d) => {
    const groups = d.groups.map((g) => ({ ...g, players: g.players.filter((p) => p !== id) }));
    if (to >= groups.length) groups.push({ ...teeSlot(groups.length, timing, holes), players: [] });
    groups[to].players.push(id);
    return { groups: groups.filter((g) => g.players.length) };
  });

  return <section className={styles.teeEditor} aria-label="Edit tee sheet">
    {/* One card: First tee and Every on matching vertical wheels, then where the groups start. */}
    <div className={`${styles.teeTimes} ${timing.start === "shotgun" ? styles.teeTimesShotgun : ""}`}>
      <div className={styles.teeField}><span>First tee</span>
        <FirstTeeWheels value={timing.first} onChange={(first) => retime({ ...timing, first })} /></div>
      {/* A shotgun sends every group off at once, so there's no gap between times. */}
      {timing.start !== "shotgun" && <div className={styles.teeField}><span>Every</span>
        <div className={`${wheelStyles.wheels} ${styles.timeWheels}`}>
          <span className={wheelStyles.band} aria-hidden />
          <VerticalWheel label="Minutes between tee times" values={EVERY.map(String)} index={Math.max(EVERY.indexOf(timing.every), 0)} onIndex={(i) => retime({ ...timing, every: EVERY[i] })} />
          <span className={styles.timeUnit} aria-hidden>min</span>
        </div></div>}
      <div className={`${styles.teeField} ${styles.teeStart}`}><span>Start on</span>
        <Dropdown label="Start on" value={timing.start} options={STARTS.filter((s) => holes >= 18 || s.value !== "1&10")} onChange={(start) => retime({ ...timing, start })} /></div>
    </div>
    <div className={styles.organizer}>
      <button type="button" className={styles.organizerButton} onClick={() => setDraft(randomTeeSheet(ids, timing, holes))}><Shuffle size={14} aria-hidden="true" /> Randomize pairings</button>
      {/* Worst score off first, the leaders last; needs scores from an earlier round. */}
      <button type="button" className={styles.organizerButton} disabled={!byScore} onClick={() => byScore && setDraft(byScore)}><ArrowDownWideNarrow size={14} aria-hidden="true" /> By score</button>
    </div>
    <ol className={styles.teeGroups}>
      {draft.groups.map((g, i) => <li key={i} className={styles.teeGroup}>
        <div className={styles.teeGroupHead}>
          <b>Group {i + 1}</b>
          <input type="time" aria-label={`Group ${i + 1} tee time`} value={g.time} onChange={(e) => setGroup(i, { time: e.target.value })} />
          <Dropdown label={`Group ${i + 1} starting hole`} value={g.hole} options={Array.from({ length: holes }, (_, h) => ({ value: h + 1, label: `Hole ${h + 1}` }))} onChange={(hole) => setGroup(i, { hole })} />
        </div>
        <ul className={styles.teePlayers}>
          {g.players.map((id) => <li key={id}><span>{name(id)}</span>
            <select aria-label={`Move ${name(id)}`} value={i} onChange={(e) => move(id, Number(e.target.value))}>
              {draft.groups.map((_, k) => <option key={k} value={k}>Group {k + 1}</option>)}
              <option value={draft.groups.length}>New group</option>
            </select></li>)}
        </ul>
      </li>)}
    </ol>
    <div className={styles.organizer}>
      <button type="button" className={styles.organizerButton} onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="button" className={`${styles.organizerButton} ${styles.teeSave}`} disabled={saving} onClick={async () => { setSaving(true); await onSave(draft); setSaving(false); }}>{saving ? "Saving…" : "Save tee sheet"}</button>
    </div>
  </section>;
}
