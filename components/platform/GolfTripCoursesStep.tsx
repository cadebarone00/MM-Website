"use client";

import { useMemo, useSyncExternalStore } from "react";
import { golfTripDraftSnapshot, parseGolfTripDraft, plannedRounds, shortTripDate } from "@/lib/platform/golfTripDraft";
import { SetupStepForm } from "./SetupStepForm";
import styles from "./CreateTournament.module.css";

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/**
 * Golf Trip questionnaire, step 4 (Courses). One row per round planned on the Golf step: date, round number and
 * course. Course is typed for now (a course search API comes later) and optional, so Next is always on.
 */
export function GolfTripCoursesStep() {
  const draft = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const rounds = useMemo(() => plannedRounds(parseGolfTripDraft(draft)), [draft]);

  return <SetupStepForm nextHref="/golf-trips/new/format" backHref="/golf-trips/new/golf">
    <div className={styles.fields}>
      <div>
        <h2 className={styles.sectionTitle}>Do you know where you&apos;re playing?</h2>
        <p className={styles.sectionNote}>Don&apos;t worry, this can be added later.</p>
      </div>
      {rounds.length > 0
        ? <div className={styles.roundTable}>
            <div className={`${styles.roundRow} ${styles.roundHead}`} aria-hidden="true">
              <span>Date</span><span>Round</span><span>Course</span>
            </div>
            {rounds.map((round) => <div key={round.number} className={styles.roundRow}>
              <span className={styles.roundDate}>{round.date ? shortTripDate(round.date) : `Day ${round.dayNumber}`}</span>
              <span className={styles.roundNumber}>{round.number}</span>
              <input className={`${styles.input} ${styles.compact}`} type="text" name={`round${round.number}Course`}
                placeholder="Search courses" autoComplete="off" aria-label={`Round ${round.number} course`} />
            </div>)}
          </div>
        : <p className={styles.sectionNote}>No rounds planned yet. Go Back to add golf days.</p>}
    </div>
  </SetupStepForm>;
}
