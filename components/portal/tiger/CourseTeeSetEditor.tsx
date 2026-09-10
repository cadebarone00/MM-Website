"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Lock, LockOpen } from "lucide-react";
import type { LiveCourse, LiveTeeSet } from "@/lib/live/types";
import { validTeeSets } from "@/lib/live/teeSets";

const inputClass = "mt-1 block w-full min-w-0 rounded border border-stone-300 bg-white px-2 py-2 font-sans text-sm normal-case text-ink-900 disabled:bg-stone-100";
const labelClass = "min-w-0 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500";
const leaveMessage = "You have unsaved changes. Are you sure you want to continue without saving your progress?";
function editable(tee: LiveTeeSet): LiveTeeSet {
  return { ...tee, color: tee.color ?? "#800020", locked: tee.locked ?? false, holes: Array.from({ length: 18 }, (_, i) => ({ ...(tee.holes.find((hole) => hole.number === i + 1) ?? { number: i + 1, par: 0, yards: 0 }) })) };
}

export function CourseTeeSetEditor({ course, onSaved }: { course: LiveCourse; onSaved?: (teeSets: LiveTeeSet[]) => void }) {
  const [saved, setSaved] = useState<LiveTeeSet[]>(() => (course.teeSets?.length ? course.teeSets : [{ id: "standard", name: "Standard", holes: course.holes, rating: course.rating, slope: course.slope }]).map(editable));
  const [draft, setDraft] = useState<LiveTeeSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; target: string } | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const reordering = useRef(false);
  const baseline = saved.find((tee) => tee.id === draft?.id);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    if (!dirty && !saving) return;
    const confirmLeave = () => !saving && window.confirm(leaveMessage);
    function unload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    function click(event: MouseEvent) {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!confirmLeave()) { event.preventDefault(); event.stopPropagation(); }
    }
    let restoring = false;
    function back(event: PopStateEvent) {
      if (restoring) { restoring = false; return; }
      if (!confirmLeave()) { event.stopImmediatePropagation(); restoring = true; window.history.go(1); }
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", back, true);
    };
  }, [dirty, saving]);
  function open(tee: LiveTeeSet) {
    if (saving || (dirty && !window.confirm(leaveMessage))) return;
    setDraft(editable(tee)); setError(null); setMessage("");
  }
  function create() { open({ id: crypto.randomUUID(), name: "New tee set", color: "#800020", locked: false, holes: course.holes, rating: null, slope: null }); }
  async function reorder(id: string, target: string) {
    if (saving || reordering.current || id === target) return;
    const from = saved.findIndex((tee) => tee.id === id), to = saved.findIndex((tee) => tee.id === target);
    if (from < 0 || to < 0) return;
    const tees = [...saved];
    tees.splice(to, 0, tees.splice(from, 1)[0]);
    reordering.current = true;
    setSaving(true); setError(null); setMessage(""); setSaved(tees);
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: course.id, teeSets: tees }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save tee set order.");
      setMessage("Tee set order saved."); onSaved?.(tees);
    } catch (err) {
      setSaved(saved);
      setError(err instanceof Error ? err.message : "Could not save tee set order. Please try again.");
    } finally { reordering.current = false; setSaving(false); }
  }
  async function save(next = draft, close = true) {
    if (!next || saving) return;
    if (!validTeeSets([next])) { setError("Enter a name, holes 1–18 with par (3–6) and yardage, and valid rating/slope (55–155). Locking also requires a rating, slope, and positive yardage for every hole."); return; }
    const tees = saved.some((tee) => tee.id === next.id) ? saved.map((tee) => tee.id === next.id ? next : tee) : [...saved, next];
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: course.id, teeSets: tees }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save tee set.");
      setSaved(tees); setDraft(close ? null : next); setMessage("Tee set saved."); onSaved?.(tees);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save tee set. Please try again."); }
    finally { setSaving(false); }
  }
  return <div className="mt-4 border-t border-gold-200 pt-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">Tee sets</h2><button type="button" disabled={saving} onClick={create} className="rounded border border-maroon-700 px-3 py-2 font-condensed text-xs font-bold uppercase text-maroon-700 disabled:opacity-50">New tee set</button></div>
    <p id="tee-order-help" className="mt-2 text-xs text-ink-500">Drag the grip to reorder tee sets. Order saves automatically. You can also focus a grip and use the up and down arrow keys.</p>
    <div ref={list} className="mt-3 grid gap-2">{saved.map((tee, index) => <div key={tee.id} data-tee-id={tee.id} className={`flex items-center rounded-lg border bg-white ${dragTarget === tee.id ? "border-maroon-700 ring-2 ring-maroon-300" : draft?.id === tee.id ? "border-maroon-700" : "border-stone-300"}`}>
      <button type="button" disabled={saving || saved.length < 2} aria-label={`Reorder ${tee.name}`} aria-describedby="tee-order-help" className="flex min-h-12 w-11 shrink-0 touch-none select-none items-center justify-center self-stretch rounded-l-lg text-ink-500 cursor-grab active:cursor-grabbing disabled:opacity-40 focus-visible:outline-maroon-700"
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const target = saved[index + (event.key === "ArrowUp" ? -1 : 1)];
          if (target) void reorder(tee.id, target.id);
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: tee.id, target: tee.id }; setDragTarget(tee.id);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const rows = list.current?.querySelectorAll<HTMLElement>("[data-tee-id]");
          if (!rows) return;
          let nearest: HTMLElement | null = null, distance = Infinity;
          rows.forEach((row) => { const rect = row.getBoundingClientRect(); const delta = Math.abs(event.clientY - (rect.top + rect.height / 2)); if (delta < distance) { nearest = row; distance = delta; } });
          const target = (nearest as HTMLElement | null)?.dataset.teeId;
          if (target) { drag.current.target = target; setDragTarget(target); }
          if (event.clientY < 80) window.scrollBy(0, -12);
          else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
        }}
        onPointerUp={() => { const move = drag.current; drag.current = null; setDragTarget(null); if (move) void reorder(move.id, move.target); }}
        onPointerCancel={() => { drag.current = null; setDragTarget(null); }}
        onLostPointerCapture={() => { drag.current = null; setDragTarget(null); }}
      ><GripVertical size={20} aria-hidden="true" /></button>
      <button type="button" disabled={saving} onClick={() => open(tee)} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-r-lg p-3 text-left">
      <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border border-ink-300" style={{ backgroundColor: tee.color }} /><span className="flex-1 font-serif font-bold">{tee.name}</span>
      <span className="font-sans text-sm">{tee.holes.reduce((sum, hole) => sum + hole.yards, 0).toLocaleString()} yards · {tee.rating ?? "—"}/{tee.slope ?? "—"}</span>
      <span className="flex items-center gap-1 font-sans text-xs text-ink-500">{tee.locked ? <Lock size={14} /> : <LockOpen size={14} />}{tee.locked ? "Available" : "Draft"}</span>
    </button></div>)}</div>
    {message && <p role="status" className="mt-3 text-sm text-maroon-700">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {draft && <div className="mt-5 rounded-lg border border-stone-300 bg-white p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save()} disabled={saving} className="rounded bg-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase text-white disabled:opacity-50">{saving ? "Saving…" : "Save tee set"}</button>
        <button type="button" disabled={saving} onClick={() => save({ ...draft, locked: !draft.locked }, false)} className="inline-flex items-center gap-2 rounded border border-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase text-maroon-700 disabled:opacity-50">{draft.locked ? <LockOpen size={16} /> : <Lock size={16} />}{draft.locked ? "Unlock to edit" : "Save & lock"}</button>
        <span className="font-sans text-xs text-ink-500">{draft.locked ? "Available for rounds. Unlock to edit." : "Draft — lock to make available for rounds."}{dirty ? " Unsaved changes." : ""}</span>
      </div>
      <fieldset disabled={saving || draft.locked}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className={`${labelClass} col-span-2 sm:col-span-1`}>Tee set name<input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className={labelClass}>Color<input type="color" className={`${inputClass} h-10`} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
          <div className={labelClass}>Total yardage<output className="mt-3 block font-sans text-sm text-ink-900">{draft.holes.reduce((sum, hole) => sum + hole.yards, 0).toLocaleString()}</output></div>
          <label className={labelClass}>Rating<input type="number" step="0.1" min="0.1" className={inputClass} value={draft.rating ?? ""} onChange={(e) => setDraft({ ...draft, rating: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label className={labelClass}>Slope<input type="number" min="55" max="155" className={inputClass} value={draft.slope ?? ""} onChange={(e) => setDraft({ ...draft, slope: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-6">{[0, 9].map((start) => { const holes = draft.holes.slice(start, start + 9); return <table key={start} className="w-full table-fixed text-center font-sans text-sm">
          <thead><tr className="border-b border-stone-300 text-xs text-ink-500"><th className="w-9 py-2">Hole</th><th>Par</th><th>Yardage</th></tr></thead>
          <tbody>{holes.map((hole) => <tr key={hole.number} className="border-b border-stone-100"><th scope="row">{hole.number}</th>{(["par", "yards"] as const).map((field) => <td key={field} className="px-0.5 py-1"><input type="number" min={field === "par" ? 3 : 0} max={field === "par" ? 6 : undefined} aria-label={`Hole ${hole.number} ${field === "yards" ? "yardage" : "par"}`} className="w-full min-w-0 rounded border border-stone-300 px-1 py-2 text-center disabled:bg-stone-100" value={hole[field] || ""} onChange={(e) => setDraft({ ...draft, holes: draft.holes.map((entry) => entry.number === hole.number ? { ...entry, [field]: Number(e.target.value) } : entry) })} /></td>)}</tr>)}</tbody>
          <tfoot><tr className="bg-cream-100 font-bold"><th className="py-3">{start === 0 ? "Out" : "In"}</th><td>{holes.reduce((sum, hole) => sum + hole.par, 0)}</td><td>{holes.reduce((sum, hole) => sum + hole.yards, 0).toLocaleString()}</td></tr></tfoot>
        </table>; })}</div>
      </fieldset>
    </div>}
  </div>;
}
