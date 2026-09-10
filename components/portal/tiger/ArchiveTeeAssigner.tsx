// components/portal/tiger/ArchiveTeeAssigner.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HandicapCourseOption } from "@/lib/handicap/types";

interface ArchiveRound {
  round: number;
  course: string;
  format: string | null;
  assigned: boolean;
}

/**
 * Tiger-only: assigns a course + tee set (rating/slope) and the date played
 * to every player's archived row for one tournament round at once, so that
 * round can start counting toward players' Maroon Masters handicap index.
 * Applies to the whole field, matching how a round is already modeled
 * during live scoring — see docs/superpowers/specs for the design.
 */
export function ArchiveTeeAssigner({ tournamentSlug, rounds, courses }: { tournamentSlug: string; rounds: ArchiveRound[]; courses: HandicapCourseOption[] }) {
  const router = useRouter();
  const [round, setRound] = useState<number | "">(rounds[0]?.round ?? "");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [teeSetId, setTeeSetId] = useState(courses[0]?.teeSets[0]?.id ?? "");
  const [datePlayed, setDatePlayed] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;

  if (rounds.length === 0) return null;

  async function submit() {
    if (round === "" || !courseId || !teeSetId || !datePlayed) {
      setMessage({ ok: false, text: "Choose a round, course, tee set, and date played." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/tiger/scorecards/archive-tees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentSlug, round, courseId, teeSetId, datePlayed }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ ok: false, text: data.error ?? "Could not save this tee assignment." });
        return;
      }
      setMessage({ ok: true, text: `Assigned tees to ${data.updated} player row${data.updated === 1 ? "" : "s"} for Round ${round}.` });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Could not reach the server. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border-2 border-stone-300 p-4">
      <h2 className="font-serif text-lg font-bold text-ink-900">Assign tees for handicap tracking</h2>
      <p className="mt-1 font-sans text-sm text-ink-500">
        Pick the course, tee set, and date this round was actually played. It applies to every player&apos;s archived round for this round number, and lets it count toward the Maroon Masters handicap index.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Round</span>
          <select value={round} onChange={(e) => setRound(Number(e.target.value))} className="rounded-lg border-2 border-stone-300 px-2 py-2 font-sans text-sm">
            {rounds.map((r) => (
              <option key={r.round} value={r.round}>
                Round {r.round} — {r.course}
                {r.assigned ? " (assigned)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Date played</span>
          <input type="date" value={datePlayed} onChange={(e) => setDatePlayed(e.target.value)} className="rounded-lg border-2 border-stone-300 px-2 py-2 font-sans text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Course</span>
          <select
            value={courseId}
            onChange={(e) => {
              const next = courses.find((c) => c.id === e.target.value);
              setCourseId(e.target.value);
              setTeeSetId(next?.teeSets[0]?.id ?? "");
            }}
            className="rounded-lg border-2 border-stone-300 px-2 py-2 font-sans text-sm"
          >
            {courses.length === 0 && <option value="">No courses with locked tees yet</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Tee set</span>
          <select value={teeSetId} onChange={(e) => setTeeSetId(e.target.value)} className="rounded-lg border-2 border-stone-300 px-2 py-2 font-sans text-sm">
            {selectedCourse?.teeSets.map((tee) => (
              <option key={tee.id} value={tee.id}>{tee.name} · Rating {tee.rating} · Slope {tee.slope}</option>
            ))}
          </select>
        </label>
      </div>

      {message && <p className={`mt-3 rounded-sm px-3 py-2 font-sans text-sm ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      <button
        type="button"
        disabled={submitting || courses.length === 0}
        onClick={submit}
        className="mt-3 rounded-pill bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Assign tees"}
      </button>
    </div>
  );
}
