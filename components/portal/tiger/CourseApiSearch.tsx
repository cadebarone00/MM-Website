"use client";

import { useState } from "react";
import type { LiveCourse } from "@/lib/live/types";
import type { GolfSearchResult } from "@/lib/live/golfApiMapping";

export function CourseApiSearch({ configured, courses, target, onSaved, onCancel }: { configured: boolean; courses: LiveCourse[]; target?: LiveCourse; onSaved: (course: LiveCourse) => void; onCancel?: () => void }) {
  const [query, setQuery] = useState(target?.name ?? "");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<GolfSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function search(nextPage = 1) {
    setBusy(true); setError(null); setMessage("");
    const term = nextPage === 1 ? query.trim() : searchedQuery;
    try {
      const response = await fetch(`/api/portal/tiger/courses/provider?${new URLSearchParams({ q: term, page: String(nextPage) })}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.courses); setPage(nextPage); setTotal(data.total); setSearchedQuery(term);
    } catch (err) { setError(err instanceof Error ? err.message : "Search failed."); }
    finally { setBusy(false); }
  }
  async function importCourse(result: GolfSearchResult) {
    setBusy(true); setError(null); setMessage("");
    try {
      const response = await fetch("/api/portal/tiger/courses/provider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: result.id, ...(target ? { courseId: target.id } : {}) }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Import failed.");
      onSaved(data.course); setMessage(`${data.course.name} saved. Review the imported tee sets and lock them when ready.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Import failed."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 rounded-lg border border-gold-300 bg-white p-4">
    <h2 className="font-serif text-xl font-bold">{target ? `Find data for ${target.name}` : "Find a golf course"}</h2>
    <p className="mt-2 text-sm text-ink-600">Search the worldwide catalog, import available tees and hole data, then review and lock. Incomplete values stay blank.</p>
    {target && <p className="mt-2 text-xs text-ink-500">Provider tees will be added alongside existing manual tees. Future refreshes preserve your edits.</p>}
    {!configured && <p role="status" className="mt-3 rounded bg-cream-100 p-3 text-sm text-ink-700">Course search needs a GolfAPI.io account. <a href="https://www.golfapi.io/" target="_blank" rel="noreferrer" className="font-bold underline">Get API access</a>, then configure the server’s GOLF_API_KEY setting to enable search and import.</p>}
    <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <input aria-label="Golf course or club name" placeholder="Course or club name" value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy || !configured} className="min-w-0 flex-1 rounded border border-stone-300 px-3 py-2 text-sm" />
      <button disabled={busy || !configured || query.trim().length < 2} className="rounded bg-maroon-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? "Working…" : "Search"}</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-maroon-700">{message}</p>}
    {searchedQuery && !results.length && <p className="mt-3 text-sm text-ink-500">No courses found. Try a shorter club name.</p>}
    <div className="mt-3 divide-y divide-stone-200">{results.map((result) => {
      const saved = courses.some((course) => course.teeSets?.some((tee) => tee.apiSource?.courseId === result.id));
      return <div key={result.id} className="flex items-center justify-between gap-3 py-3"><div><h3 className="font-bold">{result.name}</h3><p className="text-xs text-ink-500">{result.location} · {result.holes} holes</p></div><button type="button" disabled={busy || saved || result.holes !== 18} onClick={() => importCourse(result)} className="shrink-0 rounded border border-maroon-700 px-3 py-2 text-xs font-bold text-maroon-700 disabled:opacity-40">{saved ? "Already saved" : result.holes !== 18 ? "18 holes required" : target ? "Link & import" : "Import course"}</button></div>;
    })}</div>
    {total > 200 && <div className="mt-3 flex items-center gap-3 text-sm"><button disabled={busy || page === 1} onClick={() => search(page - 1)} className="underline disabled:opacity-40">Previous</button><span>Page {page} of {Math.ceil(total / 200)}</span><button disabled={busy || page * 200 >= total} onClick={() => search(page + 1)} className="underline disabled:opacity-40">Next</button></div>}
    {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="mt-3 text-sm underline">Close search</button>}
  </section>;
}
