// components/portal/tiger/CoursesFormatPanel.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse, LiveRoundState, LiveTeeSet, MatchFormat, TournamentSettings } from "@/lib/live/types";

const FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

export function CoursesFormatPanel({
  year,
  initialSettings,
  initialRounds,
  initialCourses,
}: {
  year: number;
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
  const courses = initialCourses;
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveRoundCount(count: number) {
    setRoundCount(count);
    const res = await fetch("/api/portal/tiger/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, roundCount: count }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function updateRound(round: number, patch: { date?: string; courseId?: string; format?: MatchFormat; courseSetup?: { teeSetId: string; holeTeeSetIds: Record<string, string> } }) {
    setError(null);
    // An empty string from a cleared <input type="date"> means "no date
    // set" — normalize it to null so it matches how a blank date is
    // represented elsewhere in LiveRoundState, instead of sending "" to a
    // Postgres `date` column (which would 500).
    const date = patch.date === "" ? null : patch.date;
    const res = await fetch("/api/portal/tiger/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round, ...patch, date }),
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
          courseSetup: patch.courseSetup ? { teeSetId: patch.courseSetup.teeSetId, teeSetName: "", holes: r.courseSetup?.holes ?? [], rating: r.courseSetup?.rating ?? null, slope: r.courseSetup?.slope ?? null, holeTeeSetIds: patch.courseSetup.holeTeeSetIds } : patch.courseId ? null : r.courseSetup,
        };
      })
    );
  }

  function teeSetsFor(course: LiveCourse): LiveTeeSet[] {
    return course.teeSets?.length ? course.teeSets : [{ id: "standard", name: "Standard", holes: course.holes, rating: course.rating, slope: course.slope }];
  }

  async function saveCourseSetup(round: LiveRoundState, teeSetId: string, changedHole?: number, changedTeeSetId?: string) {
    const course = courses.find((entry) => entry.id === round.courseId);
    if (!course) return;
    const current = round.courseSetup?.teeSetId ?? teeSetId;
    const holeTeeSetIds = changedHole ? { ...(round.courseSetup?.holeTeeSetIds ?? Object.fromEntries(course.holes.map((hole) => [String(hole.number), current]))) } : Object.fromEntries(course.holes.map((hole) => [String(hole.number), teeSetId]));
    if (changedHole && changedTeeSetId) holeTeeSetIds[String(changedHole)] = changedTeeSetId;
    await updateRound(round.round, { courseId: course.id, courseSetup: { teeSetId, holeTeeSetIds } });
  }

  async function toggleLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round, lock: "course", value }),
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
      body: JSON.stringify({ year, round }),
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
      <p className="mb-4 rounded-sm border border-gold-300 bg-cream-100 px-3 py-2 font-sans text-sm text-ink-700">Courses are selected from the shared <Link href="/portal/admin/course-library" className="font-semibold text-maroon-700 underline">Course Library</Link>, so adding or editing a course never belongs to one season.</p>
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

            {!round.courseLocked && round.courseId && (() => {
              const course = courses.find((entry) => entry.id === round.courseId);
              if (!course) return null;
              const teeSets = teeSetsFor(course);
              const selectedTeeId = round.courseSetup?.teeSetId ?? teeSets[0]?.id;
              return <div className="mt-4 border-t border-gold-200 pt-3">
                <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-48 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Base tee set<select value={selectedTeeId} onChange={(event) => saveCourseSetup(round, event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-2 py-2 font-sans text-sm normal-case text-ink-900">{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}{tee.rating != null ? ` · ${tee.rating}/${tee.slope ?? "—"}` : ""}</option>)}</select></label><span className="font-sans text-xs text-ink-500">Choose a tee for the whole round, then adjust individual holes below.</span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{course.holes.map((hole) => <label key={hole.number} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Hole {hole.number}<select value={round.courseSetup?.holeTeeSetIds?.[String(hole.number)] ?? selectedTeeId} onChange={(event) => saveCourseSetup(round, selectedTeeId, hole.number, event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-1 py-1.5 font-sans text-xs normal-case text-ink-900">{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name} · {tee.holes.find((entry) => entry.number === hole.number)?.yards ?? "—"}</option>)}</select></label>)}</div>
              </div>;
            })()}

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
