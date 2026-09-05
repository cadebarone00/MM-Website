"use client";

import { useState } from "react";
import { type WagerType, wagerMarketKindLabels, wagerScopeLabels } from "@/lib/wagers/wagerTypes";
import { PUBLIC_WAGER_CATALOG } from "@/lib/wagers/publicWagerCatalog";

/** Tiger only publishes code-defined wager models. This prevents an ad hoc
 * database form from creating a public market with no model or settlement
 * implementation behind it. */
export function WagerTypesPanel({ initialWagerTypes, databaseReady }: { initialWagerTypes: WagerType[]; databaseReady: boolean }) {
  const [wagerTypes, setWagerTypes] = useState(initialWagerTypes);
  const [publishingSlug, setPublishingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publishWager(slug: string) {
    setPublishingSlug(slug);
    setError(null);
    try {
      const response = await fetch("/api/portal/tiger/wager-types/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error ?? "Could not publish this wager.");
      setWagerTypes((current) => [data.wagerType, ...current.filter((item) => item.slug !== data.wagerType.slug)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not publish this wager.");
    } finally {
      setPublishingSlug(null);
    }
  }

  return (
    <div>
      {!databaseReady && <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 font-sans text-sm text-amber-900">The Wager Types table has not been set up yet. Run the latest <code>supabase/schema.sql</code> in Supabase before publishing markets.</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700">{error}</p>}

      <section className="rounded-lg border-2 border-maroon-700 bg-cream-50 p-4 sm:p-6">
        <h2 className="font-serif text-xl font-bold text-ink-900">Public Wager Board</h2>
        <p className="mt-1 font-sans text-sm text-ink-600">Only wager models built into the application appear here. Submit one to make it visible publicly; it will show its readiness requirements until legitimate odds can be created.</p>
        <div className="mt-4 grid gap-3">
          {Object.values(PUBLIC_WAGER_CATALOG).map((market) => {
            const published = wagerTypes.find((type) => type.slug === market.slug)?.isActive;
            return (
              <article key={market.slug} className="rounded-lg border border-gold-300 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-ink-900">{market.name}</h3>
                    <p className="mt-1 max-w-2xl font-sans text-sm text-ink-600">{market.description}</p>
                  </div>
                  <span className={published ? "rounded-full bg-emerald-700 px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-white" : "rounded-full bg-stone-200 px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-700"}>{published ? "Public" : "Not submitted"}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Rule label="Applies to" value={market.appliesTo} />
                  <Rule label="Public slot" value={market.publicSlot} />
                </dl>
                <button type="button" disabled={!databaseReady || published || publishingSlug === market.slug} onClick={() => publishWager(market.slug)} className="mt-4 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">
                  {published ? "Submitted to Public Wagers" : publishingSlug === market.slug ? "Submitting…" : "Submit Wager"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-serif text-xl font-bold text-ink-900">Published Rulebooks</h2>
        {wagerTypes.length === 0 ? <p className="mt-3 font-sans text-sm text-ink-500">No coded wager types have been submitted to public Wagers yet.</p> : <div className="mt-3 grid gap-3">{wagerTypes.map((wagerType) => <article key={wagerType.id} className="rounded-lg border-2 border-stone-300 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-serif text-lg font-bold text-ink-900">{wagerType.name}</h3><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{wagerType.slug} · {wagerScopeLabels[wagerType.scope]} · {wagerMarketKindLabels[wagerType.marketKind]}</p></div><span className="rounded-full bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white">Public</span></div><dl className="mt-4 grid gap-3 font-sans text-sm"><Rule label="Stat source" value={wagerType.statKey} /><Rule label="Calculation" value={wagerType.calculationRule} /><Rule label="Settlement" value={wagerType.settlementRule} /></dl></article>)}</div>}
      </section>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-ink-800">{value}</dd></div>;
}
