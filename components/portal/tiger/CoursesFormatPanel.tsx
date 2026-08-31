// components/portal/tiger/CoursesFormatPanel.tsx
"use client";

import { useState } from "react";
import type { LiveCourse, LiveRoundState, MatchFormat, TournamentSettings } from "@/lib/live/types";
import { AddCourseForm } from "./AddCourseForm";

const FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

export function CoursesFormatPanel({
  initialSettings,
  initialRounds,
  initialCourses,
}: {
  initialSettings: TournamentSettings;
  initialRounds: LiveRoundState[];
  initialCourses: LiveCourse[];
}) {
  // null (never configured yet) shows a blank placeholder instead of
  // defaulting to a real number like 8 — picking "8" from a dropdown that
  // already shows "8" fires no onChange event at all (the browser only
  // fires change when the value actually changes), so nothing would ever
  // save on first setup. Every option is a real value once one is chosen,
  // since roundCount then reflects a real, already-saved number.
  const [roundCount, setRoundCount] = useState<number | null>(initialSettings.roundCount);
  const [rounds, setRounds] = useState(initialRounds);
  const [courses, setCourses] = useState(initialCourses);
  const [addingCourseFor, setAddingCourseFor] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveRoundCount(count: number) {
    setRoundCount(count);
    const res = await fetch("/api/portal/tiger/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundCount: count }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function updateRound(round: number, patch: { date?: string; courseId?: string; format?: MatchFormat }) {
    setError(null);
    // An empty string from a cleared <input type="date"> means "no date
    // set" — normalize it to null so it matches how a blank date is
    // represented elsewhere in LiveRoundState, instead of sending "" to a
    // Postgres `date` column (which would 500).
    const date = patch.date === "" ? null : patch.date;
    const res = await fetch("/api/portal/tiger/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, ...patch, date }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setRounds((current) =>
      current.map((r) => {
        if (r.round !== round) return r;
        return {
          ...r,
          date: patch.date !== undefined ? (date ?? null) : r.date,
          courseId: patch.courseId ?? r.courseId,
          format: patch.format ?? r.format,
        };
      })
    );
  }

  async function toggleLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, lock: "course", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setRounds((current) => current.map((r) => (r.round === round ? { ...r, courseLocked: value } : r)));
  }

  async function removeRound(round: number) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      setRemoveTarget(null);
      return;
    }
    setRounds((current) => current.filter((r) => r.round !== round));
    setRemoveTarget(null);
  }

  return (
    <div className="mt-6">
      <label className="font-sans text-sm font-semibold text-ink-700">
        Number of rounds:{" "}
        <select
          value={roundCount ?? ""}
          onChange={(e) => saveRoundCount(Number(e.target.value))}
          className="border-2 border-stone-300 rounded-lg px-2 py-1"
        >
          <option value="" disabled>
            Choose a number
          </option>
          {[6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-6 space-y-4">
        {rounds.map((round) => (
          <div key={round.round} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">Round {round.round}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleLock(round.round, !round.courseLocked)}
                  className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                >
                  {round.courseLocked ? "Unlock" : "Lock"}
                </button>
                {!round.courseLocked && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(round.round)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-600 underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="date"
                value={round.date ?? ""}
                disabled={round.courseLocked}
                onChange={(e) => updateRound(round.round, { date: e.target.value })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              />
              <select
                value={round.courseId ?? ""}
                disabled={round.courseLocked}
                onChange={(e) => updateRound(round.round, { courseId: e.target.value })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              >
                <option value="" disabled>
                  Choose a course
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={round.format ?? ""}
                disabled={round.courseLocked}
                onChange={(e) => updateRound(round.round, { format: e.target.value as MatchFormat })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              >
                <option value="" disabled>
                  Choose a format
                </option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {!round.courseLocked && (
              <button
                type="button"
                onClick={() => setAddingCourseFor(addingCourseFor === round.round ? null : round.round)}
                className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
              >
                {addingCourseFor === round.round ? "Cancel" : "Add Course"}
              </button>
            )}
            {addingCourseFor === round.round && (
              <AddCourseForm
                onSaved={(course) => {
                  setCourses((current) => [...current, course]);
                  setAddingCourseFor(null);
                }}
              />
            )}

            {removeTarget === round.round && (
              <div className="mt-3 rounded-lg bg-red-50 p-3">
                <p className="font-sans text-sm text-red-700">Remove Round {round.round}? This can&apos;t be undone.</p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => removeRound(round.round)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-700 underline"
                  >
                    Yes, remove it
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(null)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
