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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateHole(index: number, field: "par" | "yards", value: number) {
    setHoles((current) => current.map((hole, i) => (i === index ? { ...hole, [field]: value } : hole)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, holes }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      onSaved({ id: data.courseId, name, holes });
      setName("");
      setHoles(blankHoles());
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
