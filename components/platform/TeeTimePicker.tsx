"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import styles from "./TeeTimePicker.module.css";

const ROW = 44;
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const PERIODS = ["AM", "PM"];
type Parts = { hour: number; minute: number; period: number };

/** "HH:MM" (24-hour) → wheel positions, and back. */
function toParts(time: string): Parts {
  const [hours, minutes] = time.split(":").map(Number);
  return { hour: (hours % 12 || 12) - 1, minute: Math.min(59, Math.max(0, minutes || 0)), period: hours < 12 ? 0 : 1 };
}
function toTime({ hour, minute, period }: Parts): string {
  return `${String(((hour + 1) % 12) + (period === 1 ? 12 : 0)).padStart(2, "0")}:${MINUTES[minute]}`;
}
function timeLabel(time: string): string {
  const { hour, minute, period } = toParts(time);
  return `${HOURS[hour]}:${MINUTES[minute]} ${PERIODS[period]}`;
}

/** One scroll wheel: the row that settles in the middle band is the chosen value. */
function Wheel({ label, values, index, onIndex }: { label: string; values: string[]; index: number; onIndex: (index: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const startIndex = useRef(index);
  useEffect(() => { ref.current?.scrollTo({ top: startIndex.current * ROW }); }, []);
  const scrollTo = (next: number) => ref.current?.scrollTo({ top: Math.max(0, Math.min(values.length - 1, next)) * ROW, behavior: "smooth" });
  return <div ref={ref} className={styles.wheel} role="listbox" aria-label={label} tabIndex={0}
    onScroll={() => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const next = Math.max(0, Math.min(values.length - 1, Math.round((ref.current?.scrollTop ?? 0) / ROW)));
        if (next !== index) onIndex(next);
      }, 80);
    }}
    onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); scrollTo(index + 1); }
      if (event.key === "ArrowUp") { event.preventDefault(); scrollTo(index - 1); }
    }}>
    {values.map((value, at) => <div key={value} role="option" aria-selected={at === index} className={styles.item} data-selected={at === index} onClick={() => scrollTo(at)}>{value}</div>)}
  </div>;
}

/**
 * Golf Schedule → tee time: a sheet that slides up from the bottom, headed by the course, date and round. Group boxes run across
 * the top (Group 1, 2, ...) with an Add Group box at the end. The wheels pick a time; Set gives it to the selected group and stays
 * open; SAVE (top right) saves every group's time and closes. Times are "HH:MM" (24-hour); a new group has none until set.
 */
export function TeeTimePicker({ course, date, round, value, onSave, onClose, fixedGroups, startGroup = 0 }: {
  course: string; date: string; round: number; value?: string[]; onSave: (times: string[]) => void; onClose: () => void;
  /** Matches rounds: exactly this many groups (one per set of matches), no Add Group; SAVE keeps unset ones as "" so each
   *  group stays in its place. `startGroup` opens on that group. */
  fixedGroups?: number; startGroup?: number;
}) {
  const [groups, setGroups] = useState<(string | null)[]>(() => fixedGroups
    ? Array.from({ length: fixedGroups }, (_, index) => value?.[index] || null)
    : value?.length ? value : [null]);
  const [selected, setSelected] = useState(fixedGroups ? Math.min(startGroup, fixedGroups - 1) : 0);
  // X: the sheet slides down and away (100 ms), then closes.
  const [leaving, setLeaving] = useState(false);
  // The wheels start from the group's own time, else the group before it, else 8:00 AM.
  const startFor = (index: number, list = groups) => toParts(list[index] ?? list.slice(0, index).filter(Boolean).at(-1) ?? "08:00");
  const [parts, setParts] = useState<Parts>(() => startFor(fixedGroups ? Math.min(startGroup, fixedGroups - 1) : 0));
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const choose = (index: number, list = groups) => { setSelected(index); setParts(startFor(index, list)); };
  const change = (field: keyof Parts, next: number) => setParts(current => ({ ...current, [field]: next }));
  const setTime = () => setGroups(current => current.map((time, index) => index === selected ? toTime(parts) : time));
  const addGroup = () => { const next = [...groups, null]; setGroups(next); choose(next.length - 1, next); };
  // SAVE keeps every group that has a set time (fixed groups keep their places, unset ones as "").
  const save = () => onSave(fixedGroups ? groups.map(time => time ?? "") : groups.filter((time): time is string => !!time));
  return <div className={styles.overlay} onClick={onClose}>
    <div className={`${styles.sheet} ${leaving ? styles.leaving : ""}`} role="dialog" aria-modal="true" aria-label="Tee time" onClick={event => event.stopPropagation()}
      onAnimationEnd={() => { if (leaving) onClose(); }}>
      <button type="button" className={styles.closeX} aria-label="Close tee time" onClick={() => setLeaving(true)}><X size={20} strokeWidth={2.25} aria-hidden /></button>
      <button type="button" className={styles.saveAll} onClick={save}>SAVE</button>
      <h2 className={styles.title}>{course}</h2>
      <p className={styles.detail}>{date}</p>
      <p className={styles.detail}>Round {round}</p>
      <div className={styles.groups} role="group" aria-label="Groups">
        {groups.map((time, index) => <div key={index} className={styles.groupSlot}>
          <span className={styles.groupLabel}>Group {index + 1}</span>
          <button type="button" className={styles.groupBox} aria-pressed={index === selected} aria-label={`Group ${index + 1}: ${time ? timeLabel(time) : "no time set"}`} onClick={() => choose(index)}>
            {time ? <strong>{timeLabel(time)}</strong> : <small>Set time</small>}
          </button>
        </div>)}
        {!fixedGroups && <div className={styles.groupSlot}>
          <span className={styles.groupLabel}>Add Group</span>
          <button type="button" className={`${styles.groupBox} ${styles.addGroup}`} aria-label="Add group" onClick={addGroup}><Plus size={18} strokeWidth={2.5} aria-hidden /></button>
        </div>}
      </div>
      <div className={styles.wheels}>
        <span className={styles.band} aria-hidden />
        {/* Keyed by group so the wheels jump to the chosen group's time. */}
        <Wheel key={`h-${selected}`} label="Hour" values={HOURS} index={parts.hour} onIndex={next => change("hour", next)} />
        <Wheel key={`m-${selected}`} label="Minute" values={MINUTES} index={parts.minute} onIndex={next => change("minute", next)} />
        <Wheel key={`p-${selected}`} label="AM or PM" values={PERIODS} index={parts.period} onIndex={next => change("period", next)} />
      </div>
      <button type="button" className={styles.save} onClick={setTime}>Set</button>
    </div>
  </div>;
}
