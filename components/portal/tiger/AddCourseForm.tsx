// components/portal/tiger/AddCourseForm.tsx
"use client";

import { useState } from "react";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

function blankHoles(): LiveHole[] {
  return Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yards: 0 }));
}

export function AddCourseForm({ onSaved }: { onSaved: (course: LiveCourse) => void }) {
  const [name, setName] = useState("");
  const [holes, setHoles] = useState<LiveHole[]>(blankHoles());
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateHole(index: number, field: "par" | "yards", value: number) {
    setHoles((current) => current.map((hole, i) => (i === index ? { ...hole, [field]: value } : hole)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const ratingValue = rating.trim() ? Number(rating) : null;
      const slopeValue = slope.trim() ? Number(slope) : null;
      const res = await fetch("/api/portal/tiger/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, holes, rating: ratingValue, slope: slopeValue }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      onSaved({ id: data.courseId, name, holes, rating: ratingValue, slope: slopeValue });
      setName("");
      setHoles(blankHoles());
      setRating("");
      setSlope("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border-2 border-stone-300 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Course name"
        className="w-full border-2 border-stone-300 rounded-lg px-2 py-2 text-sm font-semibold"
      />
      <div className="mt-2 flex gap-3">
        <label className="flex flex-1 flex-col gap-1 font-sans text-xs text-ink-700">
          Course Rating
          <input
            type="number"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            placeholder="e.g. 72.4"
            className="border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 font-sans text-xs text-ink-700">
          Slope Rating
          <input
            type="number"
            min={55}
            max={155}
            value={slope}
            onChange={(e) => setSlope(e.target.value)}
            placeholder="e.g. 128"
            className="border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
          />
        </label>
      </div>
      <table className="mt-3 w-full font-sans text-xs">
        <thead>
          <tr>
            <th className="text-left">Hole</th>
            <th className="text-left">Par</th>
            <th className="text-left">Yards</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole, i) => (
            <tr key={hole.number}>
              <td>{hole.number}</td>
              <td>
                <input
                  type="number"
                  value={hole.par}
                  onChange={(e) => updateHole(i, "par", Number(e.target.value))}
                  className="w-14 border border-stone-300 rounded px-1"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={hole.yards}
                  onChange={(e) => updateHole(i, "yards", Number(e.target.value))}
                  className="w-16 border border-stone-300 rounded px-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={save}
        className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
      >
        {saving ? "Saving…" : "Save Course"}
      </button>
    </div>
  );
}
