"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WEBSITE_SECTIONS, isWebsiteSection, sectionForPath, type WebsiteSection, type WebsiteYearSettings } from "@/lib/website/settings";
import { WebsiteSettingsPanel } from "./WebsiteSettingsPanel";

export function WebsiteEditor({ initial, available, effectiveYears, players }: {
  initial: WebsiteYearSettings; available: boolean; effectiveYears: Record<string, number>; players: { slug: string; name: string }[];
}) {
  const [section, setSection] = useState<WebsiteSection>("home");
  const [path, setPath] = useState("/website");
  const [player, setPlayer] = useState(players[0]?.slug ?? "");
  const [mobile, setMobile] = useState(false);
  const [pick, setPick] = useState(false);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [year, setYear] = useState(effectiveYears.home);
  const [revision, setRevision] = useState(0);
  const site = useRef<HTMLIFrameElement>(null);
  const pickRef = useRef(false);
  useEffect(() => { pickRef.current = pick; }, [pick]);
  const current = WEBSITE_SECTIONS.find(item => item.key === section)!;

  useEffect(() => {
    const navigate = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== site.current?.contentWindow || event.data?.type !== "mm-website-location" || typeof event.data.path !== "string") return;
      const next = sectionForPath(event.data.path);
      if (event.data.path !== path) { setSection(next); setPath(event.data.path); }
    };
    window.addEventListener("message", navigate);
    return () => window.removeEventListener("message", navigate);
  }, [path]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/season-catalog?section=" + section, { cache: "no-store" }).then(response => response.json()).then(data => { if (alive) setYear(data.nextTournament.year); }).catch(() => {});
    return () => { alive = false; };
  }, [section, revision]);

  function choose(next: WebsiteSection) {
    setSection(next);
    setPath(WEBSITE_SECTIONS.find(item => item.key === next)!.path);
    setYear(initial[next] ?? effectiveYears[next]);
    setEditorPath(null);
    setRevision(value => value + 1);
  }
  function refresh() {
    setPath(WEBSITE_SECTIONS.find(item => item.key === section)!.path);
    setRevision(value => value + 1);
    void fetch("/api/season-catalog?section=" + section, { cache: "no-store" }).then(response => response.json()).then(data => setYear(data.nextTournament.year)).catch(() => {});
  }
  function loaded() {
    const frame = site.current;
    if (!frame?.contentDocument || !frame.contentWindow) return;
    const doc = frame.contentDocument;
    const url = new URL(frame.contentWindow.location.href);
    // Navigation stays in the real website; selecting a section opens its shared controls.
    if (url.pathname !== path && !url.pathname.startsWith("/portal/admin")) {
      const next = sectionForPath(url.pathname);
      setSection(next);
      setYear(initial[next] ?? effectiveYears[next]);
    }
    doc.addEventListener("click", event => {
      if (!pickRef.current || !event.target || typeof (event.target as Element).closest !== "function") return;
      event.preventDefault();
      event.stopPropagation();
      const element = event.target as HTMLElement;
      const key = element.closest<HTMLElement>("[data-website-section]")?.dataset.websiteSection;
      const selected = isWebsiteSection(key) ? key : sectionForPath(frame.contentWindow!.location.pathname);
      setSection(selected);
      setYear(initial[selected] ?? effectiveYears[selected]);
      setEditorPath(null);
      setPick(false);
    }, true);
  }
  const previewPath = path === "/portal" ? "/portal?previewPlayer=" + encodeURIComponent(player) : path;
  const setup = "/portal/admin/master-settings/" + year;
  const tools = [
    ["Dates and venue", setup], ["Courses, formats and tee times", setup + "/courses-format"],
    ["Players and teams", setup + "/players-teams"], ["Matchups", setup + "/matchups"],
    ["Player names and accounts", "/portal/admin/players"], ["Career and archived scorecards", "/portal/admin/career-stats"],
    ["Course library", "/portal/admin/course-library"], ["Scoring page", "/portal/admin/scoring-preview"],
    ["Odds model", "/portal/admin/odds-model"], ["Wager types", "/portal/admin/wager-types"], ["Broadcast", "/portal/admin/broadcast-controls"],
  ];
  return <main className="px-3 py-5 sm:px-6">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Link href="/portal/admin" className="underline">Admin Center</Link>
      <h1 className="font-serif text-2xl font-bold">Website editor</h1>
      <Link href="/portal/admin/website-settings" className="underline">All website settings</Link>
      <span className="rounded bg-maroon-700 px-3 py-1 text-sm text-white">Admin only · saves are live</span>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label>Section <select value={section} onChange={event => choose(event.target.value as WebsiteSection)} className="ml-2 min-h-11 rounded border bg-white px-2">{WEBSITE_SECTIONS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="button" aria-pressed={pick} onClick={() => setPick(value => !value)} className="min-h-11 rounded border px-3">{pick ? "Click a section below…" : "Select on website"}</button>
      <button type="button" aria-pressed={mobile} onClick={() => setMobile(value => !value)} className="min-h-11 rounded border px-3">{mobile ? "Desktop view" : "Phone view"}</button>
      <button type="button" onClick={refresh} className="min-h-11 rounded border px-3">Refresh website</button>
      {section === "portal" && <label>Player <select value={player} onChange={event => setPlayer(event.target.value)} className="ml-2 min-h-11 rounded border bg-white px-2">{players.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>}
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-lg border border-gold-400 bg-stone-200 p-2">
        <iframe key={previewPath + revision} ref={site} src={previewPath} onLoad={loaded} title="Live website editing view" className={"mx-auto h-[78vh] bg-white " + (mobile ? "w-full max-w-[390px]" : "w-full")} />
      </div>
      <aside className="space-y-4 rounded-lg border border-gold-300 bg-cream-50 p-4">
        <h2 className="font-serif text-xl font-bold">{current.label}</h2>
        <WebsiteSettingsPanel initial={initial} available={available} onlySection={section} onSaved={refresh} />
        <h3 className="font-semibold">Edit the shared source</h3>
        <label className="block text-sm">Tournament setup year <select value={year} onChange={event => setYear(Number(event.target.value))} className="ml-2 min-h-11 rounded border bg-white px-2">{Array.from({ length: 10 }, (_, i) => 2024 + i).map(value => <option key={value}>{value}</option>)}</select></label>
        <p className="text-xs text-ink-600">These are the same controls used in Admin Center. Existing lock and publication rules still apply. Refresh the website after saving tournament edits.</p>
        <div className="grid gap-2">{tools.filter((_, index) => year >= 2027 || index >= 4).map(([label, href]) => <button type="button" key={href} onClick={() => setEditorPath(href)} className="rounded border border-gold-300 bg-white px-3 py-2 text-left text-sm hover:bg-gold-100">{label}</button>)}</div>
        {year < 2027 && <p className="text-xs">Historical tournament data uses Career and archived scorecards; native season setup begins in 2027.</p>}
      </aside>
    </div>
    {editorPath && <section aria-label="Shared Admin settings" className="mt-5 rounded-lg border border-gold-400 bg-white p-3">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-xl font-bold">Admin settings · same live records</h2><button type="button" onClick={() => { setEditorPath(null); refresh(); }} className="min-h-11 rounded border px-4">Done and refresh website</button></div>
      <iframe key={editorPath} src={editorPath} title="Shared Admin settings" className="h-[75vh] w-full" />
    </section>}
  </main>;
}
