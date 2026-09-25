"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_REAL_SEASON_YEAR, TEST_SEASON_YEAR } from "@/lib/live/testSeason";
import { TestSeasonStatus } from "./TestSeasonStatus";

export function TestSeasonPanel({ activeYear }: { activeYear: number }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = activeYear === TEST_SEASON_YEAR;

  async function reset() {
    if (!window.confirm("Reset the entire 2034 Test Season? This permanently removes only test matches, scores, odds snapshots, archive rows, and test wagers.")) return;
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/portal/tiger/test-season/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET TEST SEASON" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not reset the test season.");
      window.location.assign("/portal/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset the test season.");
      setWorking(false);
    }
  }

  return (
    <section className={`mt-6 rounded-xl border-2 p-5 ${active ? "border-amber-500 bg-amber-50" : "border-stone-300 bg-stone-50"}`}>
      <p className="font-condensed text-xs font-bold uppercase tracking-[0.16em] text-ink-600">2034 Test Season</p>
      <h2 className="mt-1 font-serif text-2xl font-bold text-ink-900">{active ? "Testing is live" : "Disposable full-workflow rehearsal"}</h2>
      <p className="mt-2 font-sans text-sm leading-6 text-ink-700">
        {active
          ? "Scores, confirmed archive updates, match state, odds, public views, and MM Coin wagers are using 2034 test data. It is excluded from real Career Stats and real-season odds."
          : "Use 2034 to rehearse the full tournament across player tabs. Set it as the active year in Master Settings when you are ready; real 2027 data remains separate."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/portal/admin/master-settings/${TEST_SEASON_YEAR}`} className="rounded-md bg-maroon-700 px-4 py-2 font-sans text-sm font-bold text-white hover:bg-maroon-800">
          Open Test Setup
        </Link>
        {active && <button type="button" onClick={reset} disabled={working} className="rounded-md border border-red-700 px-4 py-2 font-sans text-sm font-bold text-red-800 disabled:opacity-50">
          {working ? "Resetting…" : "Reset Test Season"}
        </button>}
      </div>
      <details className="mt-4 rounded-md bg-white/70 p-3">
        <summary className="cursor-pointer font-sans text-sm font-semibold text-ink-800">How to rehearse Begin Round, the Scorecard colors, and Submit Round</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 font-sans text-sm text-ink-700">
          <li>In Open Test Setup, lock a course and matchups for Session 1 using two players you can log in as, then Start the session from this page.</li>
          <li>On two phones (one per player account), open Portal → Scoring. Each sees the full matchup, who they are scoring, and Begin Round.</li>
          <li>Both players enter all 18 holes. Enter one hole differently on purpose: that hole number and the round total on the Scorecard turn red. Fix it and the total turns green.</li>
          <li>Each player opens Scorecard and presses Submit Round (it only turns maroon when green). After both submit, each Scoring tab moves on.</li>
          <li>Watch Rehearsal status below: it shows holes matched, who submitted, when the round becomes an official record, and whether it would count toward a handicap. Then Close Out Match.</li>
          <li>Press Reset Test Season when you are done.</li>
        </ol>
        <p className="mt-2 font-sans text-xs text-ink-500">No second phone? Use Live Scoring Page Editor under Global Tools — it plays both sides on one screen.</p>
      </details>
      {active && <TestSeasonStatus />}
      {active && <p className="mt-3 font-sans text-xs text-ink-600">Reset returns the active season to {DEFAULT_REAL_SEASON_YEAR}, reverses test-only MM Coin changes, and removes the 2034 records.</p>}
      {message && <p className="mt-3 font-sans text-sm text-red-700">{message}</p>}
    </section>
  );
}
