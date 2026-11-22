"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, plannedRounds, shortTripDate, type GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { CourseSearchBar } from "./TripScheduleCoursePicker";
import { SetupStepForm } from "./SetupStepForm";
import styles from "./CreateTournament.module.css";

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/** A round's course: picked from the search (ref = its handle, so its scorecard loads when the trip is created) or a typed name. */
type RoundCourse = { name: string; ref: string; place: string; par: string } | null;
const fromDraft = (draft: GolfTripDraft, n: number): RoundCourse => {
  const name = draft[`round${n}Course`]?.trim() ?? "";
  return name ? { name, ref: draft[`round${n}CourseRef`] ?? "", place: draft[`round${n}CoursePlace`] ?? "", par: draft[`round${n}CoursePar`] ?? "" } : null;
};

/**
 * Golf Trip questionnaire, step 4 (Courses). One row per round planned on the Golf step: date, round number and
 * course. Typing drops down the course search (OpenGolfAPI, same as Trip Settings); a picked course's scorecard pars
 * are set when the trip is created (lib/platform/tripCreateCoursesServer.ts). Optional, so Next is always on.
 */
export function GolfTripCoursesStep() {
  const draftText = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const draft = useMemo(() => parseGolfTripDraft(draftText), [draftText]);
  const rounds = useMemo(() => plannedRounds(draft), [draft]);

  return <SetupStepForm step="courses" skip={{}}>
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
              <RoundCourseField number={round.number} initial={fromDraft(draft, round.number)} />
            </div>)}
          </div>
        : <p className={styles.sectionNote}>No rounds planned yet. Go Back to add golf days.</p>}
    </div>
  </SetupStepForm>;
}

/** One round's course: the search box until a course is chosen, then the course with an × to choose again. The hidden
 *  fields are what Next saves into the draft. */
function RoundCourseField({ number, initial }: { number: number; initial: RoundCourse }) {
  const [course, setCourse] = useState<RoundCourse>(initial);
  const field = (key: string, value: string) => <input type="hidden" name={`round${number}${key}`} value={value} />;
  // Return in the search box searches; it must not submit the step (Next).
  return <div className={styles.courseCell} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    {field("Course", course?.name ?? "")}{field("CourseRef", course?.ref ?? "")}{field("CoursePlace", course?.place ?? "")}{field("CoursePar", course?.par ?? "")}
    {course
      ? <div className={styles.coursePicked}>
          <span><strong>{course.name}</strong>{(course.place || !course.ref) && <small>{course.ref ? course.place : "No scorecard"}</small>}</span>
          <button type="button" aria-label={`Change round ${number} course`} onClick={() => setCourse(null)}><X size={16} aria-hidden="true" /></button>
        </div>
      : <CourseSearchBar roundLabel={`round ${number}`}
          onPick={(picked) => setCourse({ name: picked.name, ref: picked.ref, place: picked.place, par: picked.par === null ? "" : String(picked.par) })}
          onUseTyped={(name) => setCourse({ name: name.slice(0, 200), ref: "", place: "", par: "" })} />}
  </div>;
}
