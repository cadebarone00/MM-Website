import { redirect } from "next/navigation";
import { requireHost } from "@/lib/portal/requireHost";
import { ScoringPanel, type ScoringState } from "@/components/portal/ScoringPanel";
import type { MatchFormat } from "@/lib/live/types";

export default async function MobileScoringPreview({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
  if (!await requireHost()) redirect("/login");
  const params = await searchParams;
  const format: MatchFormat = params.format === "Fourball" || params.format === "Foursome" ? params.format : "Singles";
  const matchBox = { id: "preview-only", boxNumber: 1, format, teeTime: "2026-01-03T09:00:00-06:00", maroonPlayers: format === "Singles" ? ["cam"] : ["cam", "pete"], whitePlayers: format === "Singles" ? ["cade"] : ["cade", "kyle"], state: "Live" };
  const pars = [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 5, 4, 3, 5];
  const yards = [406, 418, 518, 166, 413, 517, 174, 372, 434, 404, 175, 393, 405, 384, 494, 397, 208, 545];
  const state: ScoringState = { matchBox, holes: pars.map((par, index) => ({ number: index + 1, par, yards: yards[index] })), submittedPlayers: [], scores: [...matchBox.maroonPlayers, ...matchBox.whitePlayers].map((player) => ({ player, hole: 1, score: 4, selfReportedScore: 4, putts: 2, fir: true, gir: true, firDirection: null, girDirection: null, didNotFinish: false, confirmedBy: "preview" })) };
  return <>
    <header className="sticky top-0 z-[300] grid h-16 grid-cols-3 items-center bg-maroon-900 px-4 text-cream-50"><span aria-hidden>?</span><span className="text-center font-serif text-base font-bold uppercase tracking-wide">Official Scoring</span><span className="text-right text-xs">Player</span></header>
    <nav data-player-area-nav aria-label="Preview player navigation" className="sticky top-16 z-[210] flex h-12 bg-maroon-900 font-condensed text-xs font-bold uppercase tracking-wide text-white">{["Website", "Portal", "Scoring"].map((label) => <span key={label} className={"flex flex-1 items-center justify-center " + (label === "Scoring" ? "bg-cream-50 text-maroon-700" : "")}>{label}</span>)}</nav>
    <main className="px-4 pb-8"><ScoringPanel playerSlug="cam" playerFullName="Cam" round={1} matchBox={matchBox} nameBySlug={{ cam: "Cam", pete: "Pete", cade: "Cade", kyle: "Kyle" }} previewState={state} /></main>
  </>;
}
