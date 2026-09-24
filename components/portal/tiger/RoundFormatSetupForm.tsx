"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HandicapCourseOption } from "@/lib/handicap/types";
import { formatRoundLabel } from "@/lib/data/roundLabel";

/**
 * Inline "set the course & tees" editor for one round of the Round &
 * Format Archive — separate from "Assign tees for handicap tracking"
 * (ArchiveTeeAssigner) because that one requires an existing archived
 * scorecard row for the round, which Alternate Shot rounds never have
 * (confirmed with Cade, 2026-09-11) — every true round still needs a
 * course/tee shown here, Alt Shot included. Both save to the same
 * round_format_setups row (see lib/data/roundFormatSetups.ts), so
 * whichever one is used, the other reflects it too.
 */
export function RoundFormatSetupForm({ seasonYear, round, courses }: { seasonYear: number; round: number; courses: HandicapCourseOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [teeSetId, setTeeSetId] = useState("");
  const [datePlayed, setDatePlayed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;

  if (!editing) {
    return <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs font-bold text-maroon-700 underline">Set course &amp; tees</button>;
  }

  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-lg border border-gold-200 bg-white p-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !courseId || !teeSetId || !datePlayed) return;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/portal/tiger/round-format-setups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seasonYear, round, courseId, teeSetId, datePlayed }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save this round's setup.");
          setEditing(false);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save this round's setup.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{formatRoundLabel(round)} · course &amp; tees</p>
      <select required disabled={busy} value={courseId} onChange={(event) => { setCourseId(event.target.value); setTeeSetId(""); }} className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm">
        <option value="">Choose course</option>
        {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
      </select>
      <select required disabled={busy || !selectedCourse} value={teeSetId} onChange={(event) => setTeeSetId(event.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm">
        <option value="">Choose tees played</option>
        {selectedCourse?.teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name} · Rating {tee.rating} · Slope {tee.slope}</option>)}
      </select>
      <input required type="date" disabled={busy} value={datePlayed} onChange={(event) => setDatePlayed(event.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm" />
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="rounded bg-maroon-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className="text-xs underline">Cancel</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
