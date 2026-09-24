"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "@/lib/data/usStates";

export interface CourseLocation {
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export function CourseLocationEditor({ id, city, state, zipCode, onSaved }: { id: string } & CourseLocation & { onSaved?: (location: CourseLocation) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cityValue, setCityValue] = useState(city ?? "");
  const [stateValue, setStateValue] = useState(state ?? "");
  const [zipValue, setZipValue] = useState(zipCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!editing) return <button type="button" onClick={() => { setCityValue(city ?? ""); setStateValue(state ?? ""); setZipValue(zipCode ?? ""); setError(""); setEditing(true); }} className="mt-1 text-xs font-bold text-maroon-700 underline">Edit location</button>;

  return <form className="mt-3" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, city: cityValue, state: stateValue, zipCode: zipValue }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save the location.");
      onSaved?.({ city: data.course.city, state: data.course.state, zipCode: data.course.zipCode }); setEditing(false); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the location."); }
    finally { setBusy(false); }
  }}>
    <div className="flex flex-wrap gap-3">
      <label className="min-w-0 flex-1 basis-32 text-sm font-semibold">City<input maxLength={100} disabled={busy} value={cityValue} onChange={(event) => setCityValue(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-ink-900" /></label>
      <label className="min-w-0 basis-24 text-sm font-semibold">State<select disabled={busy} value={stateValue} onChange={(event) => setStateValue(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-ink-900"><option value="">—</option>{US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}</select></label>
      <label className="min-w-0 basis-28 text-sm font-semibold">Zip code <span className="font-normal text-ink-400">(optional)</span><input maxLength={10} disabled={busy} value={zipValue} onChange={(event) => setZipValue(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-ink-900" /></label>
    </div>
    <div className="mt-2 flex gap-3"><button disabled={busy} className="rounded bg-maroon-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Save location"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className="text-xs underline">Cancel</button></div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </form>;
}
