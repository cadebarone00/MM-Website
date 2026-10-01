"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Minus, Plus } from "lucide-react";
import { readGolfTripDraft, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import { SetupStepForm } from "./SetupStepForm";
import styles from "./CreateTournament.module.css";

/** Without trip dates (Trip Basics skipped), golf days still go up to this. */
const FALLBACK_MAX_DAYS = 14;

interface GolfDay { date: string; rounds: 1 | 2 }

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};
function draftDateRange(): string {
  const draft = readGolfTripDraft();
  return `${draft.startDate ?? ""}|${draft.endDate ?? ""}`;
}

/**
 * Golf Trip questionnaire, step 3 (Golf). How many golf days (− / +); each day opens a row to pick its date
 * (from Trip Basics) and 1 or 2 rounds. Then one row per round: date, round number and course. Course is typed
 * for now (a course search API comes later) and is optional. Next needs at least one golf day.
 */
export function GolfTripGolfStep() {
  // Trip Basics' dates from the draft (empty while rendering on the server).
  const range = useSyncExternalStore(subscribeNever, draftDateRange, () => "|");
  const dates = useMemo(() => { const [start, end] = range.split("|"); return tripDates(start, end); }, [range]);
  const [days, setDays] = useState<GolfDay[]>([]);

  const maxDays = dates.length || FALLBACK_MAX_DAYS;
  const addDay = () => setDays((current) => current.length >= maxDays ? current
    : [...current, { date: dates[current.length] ?? "", rounds: 1 }]);
  const removeDay = () => setDays((current) => current.slice(0, -1));
  const updateDay = (index: number, change: Partial<GolfDay>) =>
    setDays((current) => current.map((day, i) => i === index ? { ...day, ...change } : day));

  const rounds = days.flatMap((day, dayIndex) => Array.from({ length: day.rounds }, () => ({ day, dayIndex })))
    .map((round, index) => ({ ...round, number: index + 1 }));

  return <SetupStepForm nextHref="/golf-trips/new/travel" backHref="/golf-trips/new/players" complete={days.length > 0}>
    <div className={styles.fields}>
      <div className={styles.counter}>
        <span className={styles.fieldLabel} id="golf-days-label">How many golf days?</span>
        <div className={styles.counterControls} role="group" aria-labelledby="golf-days-label">
          <button type="button" className={styles.counterButton} onClick={removeDay} disabled={days.length === 0} aria-label="One less golf day">
            <Minus size={20} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <output className={styles.counterValue} aria-live="polite">{days.length}</output>
          <button type="button" className={styles.counterButton} onClick={addDay} disabled={days.length >= maxDays} aria-label="One more golf day">
            <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
        <input type="hidden" name="golfDays" value={days.length} />
      </div>

      {days.length > 0 && <div className={styles.dayList}>
        {days.map((day, index) => <div key={index} className={styles.dayRow}>
          <span className={styles.dayName}>Day {index + 1}</span>
          {dates.length > 0
            ? <select className={`${styles.input} ${styles.compact}`} name={`day${index + 1}Date`} value={day.date}
                aria-label={`Day ${index + 1} date`} onChange={(event) => updateDay(index, { date: event.target.value })}>
                {dates.map((date) => <option key={date} value={date}>{shortTripDate(date)}</option>)}
              </select>
            : <span />}
          <div className={styles.circles} role="radiogroup" aria-label={`Day ${index + 1} rounds`}>
            {([1, 2] as const).map((count) => <label key={count} className={styles.circle}>
              <input type="radio" className={styles.circleInput} name={`day${index + 1}Rounds`} value={count}
                checked={day.rounds === count} onChange={() => updateDay(index, { rounds: count })} />
              <span aria-hidden="true">{count}</span>
              <span className={styles.srOnly}>{count === 1 ? "1 round" : "2 rounds"}</span>
            </label>)}
          </div>
        </div>)}
      </div>}

      {days.length > 0 && <section className={styles.courses} aria-labelledby="courses-heading">
        <div>
          <h3 id="courses-heading" className={styles.sectionTitle}>Do you know where you&apos;re playing?</h3>
          <p className={styles.sectionNote}>Don&apos;t worry, this can be added later.</p>
        </div>
        <div className={styles.roundTable}>
          <div className={`${styles.roundRow} ${styles.roundHead}`} aria-hidden="true">
            <span>Date</span><span>Round</span><span>Course</span>
          </div>
          {rounds.map(({ day, dayIndex, number }) => <div key={number} className={styles.roundRow}>
            <span className={styles.roundDate}>{day.date ? shortTripDate(day.date) : `Day ${dayIndex + 1}`}</span>
            <span className={styles.roundNumber}>{number}</span>
            <input className={`${styles.input} ${styles.compact}`} type="text" name={`round${number}Course`}
              placeholder="Search courses" autoComplete="off" aria-label={`Round ${number} course`} />
          </div>)}
        </div>
      </section>}
    </div>
  </SetupStepForm>;
}
