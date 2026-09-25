// components/portal/tiger/CoursesFormatPanel.tsx
"use client";
import { availableTeeSets } from "@/lib/live/teeSets";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse, LiveSessionState, LiveTeeSet, MatchFormat, TournamentSettings } from "@/lib/live/types";

const FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

function matchTeeTimeLabels(format: MatchFormat | null): [string, string, string] {
  if (format === "Singles") return ["Match 1 & 2", "Match 3 & 4", "Match 5 & 6"];
  return ["Match 1", "Match 2", "Match 3"];
}

export function CoursesFormatPanel({
  year,
  initialSettings,
  initialSessions,
  initialCourses,
}: {
  year: number;
  initialSettings: TournamentSettings;
  initialSessions: LiveSessionState[];
  initialCourses: LiveCourse[];
}) {
  // null (never configured yet) shows a blank placeholder instead of
  // defaulting to a real number like 8 — picking "8" from a dropdown that
  // already shows "8" fires no onChange event at all (the browser only
  // fires change when the value actually changes), so nothing would ever
  // save on first setup. Every option is a real value once one is chosen,
  // since sessionCount then reflects a real, already-saved number.
  const [sessionCount, setSessionCount] = useState<number | null>(initialSettings.sessionCount);
  const [sessions, setSessions] = useState(initialSessions);
  const courses = initialCourses;
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveSessionCount(count: number) {
    setSessionCount(count);
    const res = await fetch("/api/portal/tiger/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, sessionCount: count }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function updateSession(session: number, patch: { date?: string; courseId?: string; format?: MatchFormat; courseSetup?: { teeSetId: string; holeTeeSetIds: Record<string, string> }; matchTeeTimes?: (string | null)[] }) {
    setError(null);
    // An empty string from a cleared <input type="date"> means "no date
    // set" — normalize it to null so it matches how a blank date is
    // represented elsewhere in LiveSessionState, instead of sending "" to a
    // Postgres `date` column (which would 500).
    const date = patch.date === "" ? null : patch.date;
    const res = await fetch("/api/portal/tiger/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session, ...patch, date }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setSessions((current) =>
      current.map((s) => {
        if (s.session !== session) return s;
        return {
          ...s,
          date: patch.date !== undefined ? (date ?? null) : s.date,
          courseId: patch.courseId ?? s.courseId,
          format: patch.format ?? s.format,
          courseSetup: patch.courseSetup ? { teeSetId: patch.courseSetup.teeSetId, teeSetName: "", holes: s.courseSetup?.holes ?? [], rating: s.courseSetup?.rating ?? null, slope: s.courseSetup?.slope ?? null, holeTeeSetIds: patch.courseSetup.holeTeeSetIds } : patch.courseId ? null : s.courseSetup,
          matchTeeTimes: patch.matchTeeTimes ?? s.matchTeeTimes,
        };
      })
    );
  }

  function teeSetsFor(course: LiveCourse): LiveTeeSet[] {
    return availableTeeSets(course.teeSets);
  }

  async function saveCourseSetup(session: LiveSessionState, teeSetId: string, changedHole?: number, changedTeeSetId?: string) {
    const course = courses.find((entry) => entry.id === session.courseId);
    if (!course) return;
    const current = session.courseSetup?.teeSetId ?? teeSetId;
    const holeTeeSetIds = changedHole ? { ...(session.courseSetup?.holeTeeSetIds ?? Object.fromEntries(course.holes.map((hole) => [String(hole.number), current]))) } : Object.fromEntries(course.holes.map((hole) => [String(hole.number), teeSetId]));
    if (changedHole && changedTeeSetId) holeTeeSetIds[String(changedHole)] = changedTeeSetId;
    await updateSession(session.session, { courseId: course.id, courseSetup: { teeSetId, holeTeeSetIds } });
  }

  function updateTeeTimeSlot(session: LiveSessionState, slot: number, value: string) {
    const next = [...session.matchTeeTimes];
    next[slot] = value === "" ? null : value;
    void updateSession(session.session, { matchTeeTimes: next });
  }

  async function toggleLock(session: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/sessions/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session, lock: "course", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setSessions((current) => current.map((s) => (s.session === session ? { ...s, courseLocked: value } : s)));
  }

  async function removeSession(session: number) {
    setError(null);
    const res = await fetch("/api/portal/tiger/sessions/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      setRemoveTarget(null);
      return;
    }
    setSessions((current) => current.filter((s) => s.session !== session));
    setRemoveTarget(null);
  }

  return (
    <div className="mt-6">
      <p className="mb-4 rounded-sm border border-gold-300 bg-cream-100 px-3 py-2 font-sans text-sm text-ink-700">Courses are selected from the shared <Link href="/portal/admin/course-library" className="font-semibold text-maroon-700 underline">Course Library</Link>, so adding or editing a course never belongs to one season.</p>
      <label className="font-sans text-sm font-semibold text-ink-700">
        Number of sessions:{" "}
        <select
          value={sessionCount ?? ""}
          onChange={(e) => saveSessionCount(Number(e.target.value))}
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
        {sessions.map((session) => (
          <div key={session.session} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">Session {session.session}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleLock(session.session, !session.courseLocked)}
                  className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                >
                  {session.courseLocked ? "Unlock" : "Lock"}
                </button>
                {!session.courseLocked && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(session.session)}
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
                value={session.date ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { date: e.target.value })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              />
              <select
                value={session.courseId ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { courseId: e.target.value })}
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
                value={session.format ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { format: e.target.value as MatchFormat })}
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

            <div className="mt-3 border-t border-gold-200 pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {matchTeeTimeLabels(session.format).map((label, slot) => (
                  <label key={slot} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
                    {label}
                    <input
                      type="time"
                      value={session.matchTeeTimes[slot] ?? ""}
                      disabled={session.courseLocked}
                      onChange={(e) => updateTeeTimeSlot(session, slot, e.target.value)}
                      className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-2 py-2 font-sans text-sm normal-case text-ink-900"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 font-sans text-xs text-ink-500">Tee times are Pacific Time.</p>
            </div>

            {!session.courseLocked && session.courseId && (() => {
              const course = courses.find((entry) => entry.id === session.courseId);
              if (!course) return null;
              const teeSets = teeSetsFor(course);
              if (!teeSets.length) return <p className="mt-4 text-sm text-ink-500">Lock a tee set in the Course Library to make it available for this session.</p>;
              const selectedTeeId = session.courseSetup?.teeSetId ?? "";
              return <div className="mt-4 border-t border-gold-200 pt-3">
                <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-48 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Base tee set<select value={selectedTeeId} onChange={(event) => saveCourseSetup(session, event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-2 py-2 font-sans text-sm normal-case text-ink-900"><option value="" disabled>Choose locked tees</option>{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}{tee.rating != null ? ` · ${tee.rating}/${tee.slope ?? "—"}` : ""}</option>)}</select></label><span className="font-sans text-xs text-ink-500">Choose a tee for the whole session, then adjust individual holes below.</span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{course.holes.map((hole) => <label key={hole.number} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Hole {hole.number}<select value={session.courseSetup?.holeTeeSetIds?.[String(hole.number)] ?? selectedTeeId} onChange={(event) => saveCourseSetup(session, selectedTeeId, hole.number, event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-1 py-1.5 font-sans text-xs normal-case text-ink-900"><option value="" disabled>Choose locked tees</option>{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name} · {tee.holes.find((entry) => entry.number === hole.number)?.yards ?? "—"}</option>)}</select></label>)}</div>
              </div>;
            })()}

            {removeTarget === session.session && (
              <div className="mt-3 rounded-lg bg-red-50 p-3">
                <p className="font-sans text-sm text-red-700">Remove Session {session.session}? This can&apos;t be undone.</p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => removeSession(session.session)}
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
