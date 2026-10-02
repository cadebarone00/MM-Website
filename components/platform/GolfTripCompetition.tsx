"use client";

import { useId } from "react";
import { COMPETITION_FORMATS, type CompetitionFormat, type CompetitionRound, type CompetitionRoundChange } from "@/lib/platform/golfTripCompetitionPreview";
import styles from "./GolfTripCompetition.module.css";

function Toggle({ label, checked, mixed, disabled, onChange }: {
  label: string; checked: boolean; mixed?: boolean; disabled?: boolean; onChange: (value: boolean) => void;
}) {
  return <button type="button" role="checkbox" aria-label={label} aria-checked={mixed ? "mixed" : checked}
    disabled={disabled} className={styles.toggle} onClick={() => onChange(!checked)}>
    <span className={styles.track} data-on={checked || mixed}><span className={styles.thumb}>{mixed ? "−" : ""}</span></span>
    <span>{mixed ? "Mixed" : checked ? "On" : "Off"}</span>
  </button>;
}

/** Controlled views: the caller owns the single shared round configuration. */
export function GolfTripCompetition({ rounds, onChange }: {
  rounds: CompetitionRound[]; onChange?: (change: CompetitionRoundChange, id?: string) => void;
}) {
  const headingId = useId();
  const editable = rounds.filter(round => round.status !== "started");
  const organizer = onChange !== undefined;
  return <section className={`${styles.card} ${organizer ? styles.settings : ""}`} aria-labelledby={headingId}>
    <h2 id={headingId} className={styles.title}>{organizer ? "Organizer Competition Settings" : "Competition"}</h2>
    {onChange && <>
      <div className={styles.bulk}>
        {(["handicap", "nassau"] as const).map(field => {
          const all = editable.length > 0 && editable.every(round => round[field]);
          const mixed = !all && editable.some(round => round[field]);
          const label = field === "handicap" ? "Handicap All" : "Nassau All";
          return <div key={field} className={styles.bulkControl}><span>{label}</span>
            <Toggle label={label} checked={all} mixed={mixed} disabled={!editable.length} onChange={value => onChange({ [field]: value })} />
          </div>;
        })}
      </div>
      <p className={styles.note}>All toggles apply to future rounds. Started rounds are locked.</p>
    </>}
    <div className={styles.header} aria-hidden>{["Date", "Round", "Course", "Format", "Nassau", "Handicap"].map(label => <span key={label}>{label}</span>)}</div>
    <div className={styles.rounds}>
      {rounds.map(round => {
        const locked = round.status === "started";
        const prefix = `Round ${round.number}`;
        return <article key={round.id} className={styles.row} aria-label={prefix}>
          <div className={styles.cell}><span className={styles.label}>Date</span><time dateTime={round.date}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${round.date}T12:00:00Z`))}</time></div>
          <div className={styles.cell}><span className={styles.label}>Round</span><span>{round.number}</span></div>
          <div className={styles.cell}><span className={styles.label}>Course</span><span>{round.course}</span></div>
          <div className={styles.cell}><span className={styles.label}>Format</span>{onChange
            ? <div className={styles.choices} role="group" aria-label={`${prefix} format`}>
              {COMPETITION_FORMATS.map(format => <button key={format} type="button" className={styles.choice} aria-pressed={round.format === format} disabled={locked} onClick={() => onChange({ format: format as CompetitionFormat }, round.id)}>{format}</button>)}
            </div> : <span>{round.format}</span>}</div>
          {(["nassau", "handicap"] as const).map(field => <div key={field} className={styles.cell}>
            <span className={styles.label}>{field === "nassau" ? "Nassau" : "Handicap"}</span>
            {onChange ? <Toggle label={`${prefix} ${field}`} checked={round[field]} disabled={locked} onChange={value => onChange({ [field]: value }, round.id)} />
              : <span className={round[field] ? styles.enabled : styles.note}>{round[field] ? "On" : "Off"}</span>}
          </div>)}
          <p className={styles.status}>{locked ? "Started · Locked" : "Scheduled"}</p>
        </article>;
      })}
    </div>
    {!rounds.length && <p className={styles.note}>No competition rounds configured yet.</p>}
  </section>;
}
