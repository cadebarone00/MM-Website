"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HandicapCourseOption, HandicapCourseTeeSet, HandicapHoleInput } from "@/lib/handicap/types";
import { HandicapHoleEntry } from "./HandicapHoleEntry";
import { HandicapRoundReview } from "./HandicapRoundReview";

export interface RoundSetup {
  course: HandicapCourseOption;
  teeSet: HandicapCourseTeeSet;
  datePlayed: string;
  teeTime: string;
}

type WizardState =
  | { step: "setup" }
  | { step: "holes"; setup: RoundSetup; initialHoles?: HandicapHoleInput[] }
  | { step: "review"; setup: RoundSetup; holes: HandicapHoleInput[] };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HandicapRoundWizard({ courses }: { courses: HandicapCourseOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ step: "setup" });
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [teeSetId, setTeeSetId] = useState(courses[0]?.teeSets[0]?.id ?? "");
  const [datePlayed, setDatePlayed] = useState(todayIso());
  const [teeTime, setTeeTime] = useState("");

  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;
  const selectedTeeSet = selectedCourse?.teeSets.find((t) => t.id === teeSetId) ?? null;

  if (courses.length === 0) {
    return <p className="font-sans text-sm text-ink-500">No courses are set up yet — ask Tiger to add one from the Course Library first.</p>;
  }

  if (state.step === "holes") {
    return (
      <HandicapHoleEntry
        teeSet={state.setup.teeSet}
        initialHoles={state.initialHoles}
        onBack={() => setState({ step: "setup" })}
        onComplete={(holes) => setState({ step: "review", setup: state.setup, holes })}
      />
    );
  }

  if (state.step === "review") {
    return (
      <HandicapRoundReview
        setup={state.setup}
        holes={state.holes}
        onBack={() => setState({ step: "holes", setup: state.setup, initialHoles: state.holes })}
        onSubmitted={() => router.push("/portal/scoring")}
      />
    );
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Submit a score</h1>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Course</span>
          <select
            value={courseId}
            onChange={(e) => {
              const nextCourse = courses.find((c) => c.id === e.target.value);
              setCourseId(e.target.value);
              setTeeSetId(nextCourse?.teeSets[0]?.id ?? "");
            }}
            className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Tee set</span>
          <select value={teeSetId} onChange={(e) => setTeeSetId(e.target.value)} className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm">
            {selectedCourse?.teeSets.map((teeSet) => (
              <option key={teeSet.id} value={teeSet.id}>{teeSet.name} · Rating {teeSet.rating} · Slope {teeSet.slope}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Date played</span>
          <input type="date" value={datePlayed} onChange={(e) => setDatePlayed(e.target.value)} className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Tee time (optional)</span>
          <input type="time" value={teeTime} onChange={(e) => setTeeTime(e.target.value)} className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm" />
        </label>

        <button
          type="button"
          disabled={!selectedCourse || !selectedTeeSet}
          onClick={() => {
            if (!selectedCourse || !selectedTeeSet) return;
            setState({ step: "holes", setup: { course: selectedCourse, teeSet: selectedTeeSet, datePlayed, teeTime } });
          }}
          className="mt-2 rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          Start round
        </button>
      </div>
    </div>
  );
}
