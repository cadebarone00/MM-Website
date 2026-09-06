"use client";

import { useState } from "react";
import type { LiveCourse, LiveTeeSet } from "@/lib/live/types";

function defaultTeeSet(course: LiveCourse): LiveTeeSet {
  return { id: "standard", name: "Standard", holes: course.holes, rating: course.rating, slope: course.slope };
}

export function CourseTeeSetEditor({ course, onSaved }: { course: LiveCourse; onSaved?: (teeSets: LiveTeeSet[]) => void }) {
  const [teeSets, setTeeSets] = useState<LiveTeeSet[]>(course.teeSets?.length ? course.teeSets : [defaultTeeSet(course)]);
  const [selectedId, setSelectedId] = useState(teeSets[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = teeSets.find((tee) => tee.id === selectedId) ?? teeSets[0];

  function replaceSelected(next: LiveTeeSet) { setTeeSets((current) => current.map((tee) => tee.id === selected.id ? next : tee)); }
  function addTeeSet() {
    const id = `tee-${Date.now()}`;
    const next = { ...selected, id, name: `${selected.name} copy`, holes: selected.holes.map((hole) => ({ ...hole })) };
    setTeeSets((current) => [...current, next]); setSelectedId(id);
  }
  async function save() {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: course.id, teeSets }) });
      const data = await response.json();
      if (!data.ok) { setError(data.error); return; }
      if (onSaved) onSaved(teeSets);
      else window.location.reload();
    } finally { setSaving(false); }
  }

  return <div className="mt-4 border-t border-gold-200 pt-4">
    <div className="flex flex-wrap items-end gap-2"><label className="flex-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Tee set<select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-2 py-2 font-sans text-sm text-ink-900">{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}</option>)}</select></label><button type="button" onClick={addTeeSet} className="rounded-sm border border-maroon-700 px-3 py-2 font-condensed text-2xs font-bold uppercase text-maroon-700">Duplicate tee set</button></div>
    <div className="mt-3 grid grid-cols-3 gap-2"><label className="col-span-3 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Tee set name<input value={selected.name} onChange={(event) => replaceSelected({ ...selected, name: event.target.value })} className="mt-1 block w-full rounded-sm border border-gold-300 px-2 py-2 font-sans text-sm font-semibold normal-case text-ink-900" /></label><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Rating<input type="number" step="0.1" value={selected.rating ?? ""} onChange={(event) => replaceSelected({ ...selected, rating: event.target.value === "" ? null : Number(event.target.value) })} className="mt-1 block w-full rounded-sm border border-gold-300 px-2 py-2 font-sans text-sm normal-case text-ink-900" /></label><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Slope<input type="number" value={selected.slope ?? ""} onChange={(event) => replaceSelected({ ...selected, slope: event.target.value === "" ? null : Number(event.target.value) })} className="mt-1 block w-full rounded-sm border border-gold-300 px-2 py-2 font-sans text-sm normal-case text-ink-900" /></label></div>
    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{selected.holes.map((hole) => <label key={hole.number} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{hole.number}<input type="number" value={hole.yards} onChange={(event) => replaceSelected({ ...selected, holes: selected.holes.map((entry) => entry.number === hole.number ? { ...entry, yards: Number(event.target.value) } : entry) })} className="mt-1 block w-full rounded-sm border border-gold-300 px-2 py-1.5 font-sans text-sm normal-case text-ink-900" aria-label={`Hole ${hole.number} yards`} /></label>)}</div>
    {error && <p className="mt-3 font-sans text-sm text-red-700">{error}</p>}
    <button type="button" onClick={save} disabled={saving || !selected.name.trim()} className="mt-4 rounded-sm bg-maroon-700 px-3 py-2 font-condensed text-2xs font-bold uppercase tracking-wide text-white disabled:opacity-50">{saving ? "Saving…" : "Save tee sets"}</button>
  </div>;
}
