// components/portal/tiger/CoursesFormatPanel.tsx
"use client";
import { availableTeeSets } from "@/lib/live/teeSets";

import { SessionDestinations, type DestinationContext } from "./SessionDestinations";
import { useRouter } from "next/navigation";
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
  destinations,
}: {
  year: number;
  initialSettings: TournamentSettings;
  initialSessions: LiveSessionState[];
  initialCourses: LiveCourse[];
  destinations: DestinationContext;
}) {
  // null (never configured yet) shows a blank placeholder instead of
  // defaulting to a real number like 8 — picking "8" from a dropdown that
  // already shows "8" fires no onChange event at all (the browser only
  // fires change when the value actually changes), so nothing would ever
  // save on first setup. Every option is a real value once one is chosen,
  // since sessionCount then reflects a real, already-saved number.
  const router = useRouter();
  const fieldClass = (live: boolean) => `border-2 rounded-lg px-2 py-2 text-sm disabled:opacity-100 ${live ? "border-green-600 bg-green-50 text-green-900" : "border-stone-300 bg-white"}`;
  const [sessionCount, setSessionCount] = useState<number | null>(initialSettings.sessionCount);
  const [sessionCountLocked, setSessionCountLocked] = useState(initialSettings.sessionCountLocked);
  const [countBusy, setCountBusy] = useState(false);
  const [sessions, setSessions] = useState(initialSessions);
  const courses = initialCourses;
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveCountSettings(patch: { sessionCount: number } | { sessionCountLocked: boolean }) {
    setError(null);
    setCountBusy(true);
    try {
      const res = await fetch("/api/portal/tiger/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, ...patch }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save session settings.");
      if ("sessionCountLocked" in patch) {
        setSessionCountLocked(patch.sessionCountLocked);
        router.refresh();
      } else {
        setSessionCount(patch.sessionCount);
        window.location.reload();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save session settings.");
    } finally {
      setCountBusy(false);
    }
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
      return false;
    }
    setSessions((current) =>
      current.map((s) => {
        if (s.session !== session) return s;
        return {
          ...s,
          date: patch.date !== undefined ? (date ?? null) : s.date,
          courseId: patch.courseId ?? s.courseId,
          format: patch.format ?? s.format,
          courseSetup: patch.courseSetup && (patch.courseId ?? s.courseId)
            ? (() => {
              const course = courses.find((entry) => entry.id === (patch.courseId ?? s.courseId));
              return course ? buildCourseSetup(course, patch.courseSetup.teeSetId, patch.courseSetup.holeTeeSetIds) : s.courseSetup;
            })()
            : patch.courseId ? null : s.courseSetup,
          matchTeeTimes: patch.matchTeeTimes ?? s.matchTeeTimes,
        };
      })
    );
    return true;
  }

  function teeSetsFor(course: LiveCourse): LiveTeeSet[] {
    return availableTeeSets(course.teeSets);
  }

  function buildCourseSetup(course: LiveCourse, teeSetId: string, holeTeeSetIds: Record<string, string>) {
    const teeSets = teeSetsFor(course);
    const selected = teeSets.find((tee) => tee.id === teeSetId);
    if (!selected) return null;
    const byId = new Map(teeSets.map((tee) => [tee.id, tee]));
    return {
      teeSetId: selected.id,
      teeSetName: selected.name,
      rating: selected.rating,
      slope: selected.slope,
      holeTeeSetIds,
      holes: selected.holes.map((hole) => {
        const tee = byId.get(holeTeeSetIds[String(hole.number)]) ?? selected;
        const override = tee.holes.find((entry) => entry.number === hole.number) ?? hole;
        return { ...override, teeSetId: tee.id, teeSetName: tee.name };
      }),
    };
  }

  async function saveCourseSetup(session: LiveSessionState, teeSetId: string, changedHole?: number, changedTeeSetId?: string) {
    const course = courses.find((entry) => entry.id === session.courseId);
    if (!course) return;
    const current = session.courseSetup?.teeSetId ?? teeSetId;
    const holeTeeSetIds = changedHole ? { ...(session.courseSetup?.holeTeeSetIds ?? Object.fromEntries(course.holes.map((hole) => [String(hole.number), current]))) } : Object.fromEntries(course.holes.map((hole) => [String(hole.number), teeSetId]));
    if (changedHole && changedTeeSetId) holeTeeSetIds[String(changedHole)] = changedTeeSetId;
    const saved = await updateSession(session.session, { courseId: course.id, courseSetup: { teeSetId, holeTeeSetIds } });
    if (!saved) return;
    const setup = buildCourseSetup(course, teeSetId, holeTeeSetIds);
    if (setup) setSessions((current) => current.map((entry) => entry.session === session.session ? { ...entry, courseSetup: setup } : entry));
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
    setSessions((current) => current.map((s) => (s.session === session ? { ...s, courseLocked: value, matchupsLocked: value && s.matchupsLocked } : s)));
    router.refresh();
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

  function renderCourseSetup(session: LiveSessionState) {
    const course = courses.find((entry) => entry.id === session.courseId);
    if (!course) return null;
    const teeSets = teeSetsFor(course);
    if (!teeSets.length) return <p className="mt-4 text-sm text-ink-500">Lock a tee set in the Course Library to make it available for this session.</p>;
    const selectedTeeId = session.courseSetup?.teeSetId ?? "";
    const selectedTee = teeSets.find((tee) => tee.id === selectedTeeId);
    return <div className={`mt-4 border-t pt-3 ${session.courseLocked ? "border-green-200" : "border-gold-200"}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-48 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Base tee set
          <select value={selectedTeeId} disabled={session.courseLocked} onChange={(event) => saveCourseSetup(session, event.target.value)} className={`mt-1 block w-full rounded-sm border px-2 py-2 font-sans text-sm normal-case ${session.courseLocked && selectedTeeId ? "border-green-600 bg-green-50 text-green-900" : "border-gold-300 bg-white text-ink-900"}`}>
            <option value="" disabled>Choose locked tees</option>
            {teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}{tee.rating != null ? ` - ${tee.rating}/${tee.slope ?? "-"}` : ""}</option>)}
          </select>
        </label>
        <span className="font-sans text-xs text-ink-500">{selectedTee ? `${selectedTee.name} remains the rating/slope tee${selectedTee.rating != null ? ` (${selectedTee.rating}/${selectedTee.slope ?? "-"})` : ""}. Per-hole changes only alter played tee, yardage and par display.` : "Choose the rating/slope tee for the session, then adjust individual holes."}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{course.holes.map((hole) => {
        const value = session.courseSetup?.holeTeeSetIds?.[String(hole.number)] ?? selectedTeeId;
        const tee = teeSets.find((entry) => entry.id === value);
        const played = tee?.holes.find((entry) => entry.number === hole.number);
        return <label key={hole.number} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Hole {hole.number}
          <select value={value} disabled={session.courseLocked || !selectedTeeId} onChange={(event) => saveCourseSetup(session, selectedTeeId, hole.number, event.target.value)} className={`mt-1 block w-full rounded-sm border px-1 py-1.5 font-sans text-xs normal-case ${session.courseLocked && value ? "border-green-600 bg-green-50 text-green-900" : "border-gold-300 bg-white text-ink-900"}`}>
            <option value="" disabled>Choose locked tees</option>
            {teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name} - {tee.holes.find((entry) => entry.number === hole.number)?.yards ?? "-"}</option>)}
          </select>
          <span className="mt-0.5 block truncate font-sans text-[10px] font-normal normal-case text-ink-500">{tee?.name ?? "Tee pending"} - {played?.yards ?? "-"} yds - Par {played?.par ?? "-"}</span>
        </label>;
      })}</div>
    </div>;
  }

  return (
    <div className="mt-6">
      <p className="mb-4 rounded-sm border border-gold-300 bg-cream-100 px-3 py-2 font-sans text-sm text-ink-700">Courses are selected from the shared <Link href="/portal/admin/course-library" className="font-semibold text-maroon-700 underline">Course Library</Link>, so adding or editing a course never belongs to one season.</p>
      <div className="flex flex-wrap items-center gap-3">
      <label className="font-sans text-sm font-semibold text-ink-700">
        Number of sessions:{" "}
        <select
          value={sessionCount ?? ""}
          disabled={sessionCountLocked || countBusy}
          onChange={(e) => saveCountSettings({ sessionCount: Number(e.target.value) })}
          className={fieldClass(sessionCountLocked && sessionCount !== null)}
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
      <button type="button" disabled={countBusy} onClick={() => saveCountSettings({ sessionCountLocked: !sessionCountLocked })} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50" aria-label={sessionCountLocked ? "Unlock number of sessions" : "Lock number of sessions"}>
        {countBusy ? "Saving..." : sessionCountLocked ? "Unlock" : "Lock"}
      </button>
      <span className="text-xs text-ink-500">{sessionCountLocked ? "Locked. Unlock to change the number of sessions." : "Choose a number, or lock it now and choose later."}</span>
      </div>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-6 space-y-4">
        {sessions.map((session) => (
          <div key={session.session} className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
          <div className={`rounded-lg border-2 p-4 ${session.courseLocked ? "border-green-600" : "border-stone-300"}`}>
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

            <p className="mt-2 text-xs text-ink-500">{session.courseLocked ? "Locked: chosen details are published. Blank fields stay pending. Unlock to edit." : "Draft: lock whenever you are ready, even with blank fields."}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="date"
                value={session.date ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { date: e.target.value })}
                aria-label="Session date" className={fieldClass(session.courseLocked && Boolean(session.date))}
              />
              <select
                value={session.courseId ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { courseId: e.target.value })}
                aria-label="Course" className={fieldClass(session.courseLocked && Boolean(session.courseId))}
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
                aria-label="Format" className={fieldClass(session.courseLocked && Boolean(session.format))}
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
                      className={`mt-1 block w-full font-sans normal-case ${fieldClass(session.courseLocked && Boolean(session.matchTeeTimes[slot]))}`}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 font-sans text-xs text-ink-500">Tee times use {initialSettings.timezone.replaceAll("_", " ")}.</p>
            </div>

            {session.courseId && renderCourseSetup(session)}

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
          <SessionDestinations session={session} year={year} context={destinations} />
          </div>
        ))}
      </div>
    </div>
  );
}
