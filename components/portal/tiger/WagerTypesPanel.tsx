"use client";

import { useState } from "react";
import { WAGER_MARKET_KINDS, WAGER_SCOPES, type WagerMarketKind, type WagerScope, type WagerType, wagerMarketKindLabels, wagerScopeLabels } from "@/lib/wagers/wagerTypes";

const emptyForm = {
  name: "", slug: "", scope: "player" as WagerScope, marketKind: "over_under" as WagerMarketKind,
  statKey: "", calculationRule: "", settlementRule: "", isActive: false,
};
const inputClassName = "w-full rounded-lg border-2 border-stone-300 bg-white px-3 py-2 font-sans text-sm text-ink-900 outline-none focus:border-maroon-700";

function labelForSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function WagerTypesPanel({ initialWagerTypes, databaseReady }: { initialWagerTypes: WagerType[]; databaseReady: boolean }) {
  const [wagerTypes, setWagerTypes] = useState(initialWagerTypes);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createWagerType(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/portal/tiger/wager-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setWagerTypes((current) => [data.wagerType, ...current]);
      setForm(emptyForm);
    } catch {
      setError("Could not create this wager type.");
    } finally { setSaving(false); }
  }

  return (
    <div>
      {!databaseReady && <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 font-sans text-sm text-amber-900">The Wager Types table has not been set up yet. Run the latest <code>supabase/schema.sql</code> in Supabase before creating markets.</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700">{error}</p>}
      <form onSubmit={createWagerType} className="rounded-lg border-2 border-stone-300 p-4 sm:p-6">
        <h2 className="font-serif text-xl font-bold text-ink-900">Create Wager Type</h2>
        <p className="mt-1 font-sans text-sm text-ink-500">This defines the repeatable rulebookâ€”not the odds for an individual wager.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Market name"><input required value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value, slug: v.slug || labelForSlug(e.target.value) }))} placeholder="Total Birdies" className={inputClassName} /></Field>
          <Field label="Market key"><input required value={form.slug} onChange={(e) => setForm((v) => ({ ...v, slug: labelForSlug(e.target.value) }))} placeholder="total-birdies" className={inputClassName} /></Field>
          <Field label="Applies to"><select value={form.scope} onChange={(e) => setForm((v) => ({ ...v, scope: e.target.value as WagerScope }))} className={inputClassName}>{WAGER_SCOPES.map((scope) => <option key={scope} value={scope}>{wagerScopeLabels[scope]}</option>)}</select></Field>
          <Field label="Market style"><select value={form.marketKind} onChange={(e) => setForm((v) => ({ ...v, marketKind: e.target.value as WagerMarketKind }))} className={inputClassName}>{WAGER_MARKET_KINDS.map((kind) => <option key={kind} value={kind}>{wagerMarketKindLabels[kind]}</option>)}</select></Field>
          <Field label="Career-stat source key" className="sm:col-span-2"><input required value={form.statKey} onChange={(e) => setForm((v) => ({ ...v, statKey: e.target.value }))} placeholder="career.scoring.birdies" className={inputClassName} /><span className="mt-1 block text-xs text-ink-500">The exact statistic or data set this market will read from.</span></Field>
          <Field label="Calculation rule" className="sm:col-span-2"><textarea required value={form.calculationRule} onChange={(e) => setForm((v) => ({ ...v, calculationRule: e.target.value }))} placeholder="How the line and odds are calculated from the selected statistics." className={`${inputClassName} min-h-24`} /></Field>
          <Field label="Settlement rule" className="sm:col-span-2"><textarea required value={form.settlementRule} onChange={(e) => setForm((v) => ({ ...v, settlementRule: e.target.value }))} placeholder="How this market is declared won, lost, void, or tied after play." className={`${inputClassName} min-h-24`} /></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 font-sans text-sm text-ink-700"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))} /> Eligible to publish when odds are configured</label>
        <button disabled={saving || !databaseReady} className="mt-5 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">{saving ? "Creatingâ€¦" : "Create Wager Type"}</button>
      </form>
      <section className="mt-6">
        <h2 className="font-serif text-xl font-bold text-ink-900">Defined Wager Types</h2>
        {wagerTypes.length === 0 ? <p className="mt-3 font-sans text-sm text-ink-500">No wager types yet. Create the rulebook before publishing any market or odds.</p> : <div className="mt-3 grid gap-3">{wagerTypes.map((wagerType) => <article key={wagerType.id} className="rounded-lg border-2 border-stone-300 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-serif text-lg font-bold text-ink-900">{wagerType.name}</h3><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{wagerType.slug} Â· {wagerScopeLabels[wagerType.scope]} Â· {wagerMarketKindLabels[wagerType.marketKind]}</p></div><span className={wagerType.isActive ? "rounded-full bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white" : "rounded-full bg-stone-200 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-700"}>{wagerType.isActive ? "Eligible" : "Draft"}</span></div><dl className="mt-4 grid gap-3 font-sans text-sm"><Rule label="Stat source" value={wagerType.statKey} /><Rule label="Calculation" value={wagerType.calculationRule} /><Rule label="Settlement" value={wagerType.settlementRule} /></dl></article>)}</div>}
      </section>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`flex flex-col gap-1 font-sans text-sm font-medium text-ink-700 ${className}`}><span>{label}</span>{children}</label>; }
function Rule({ label, value }: { label: string; value: string }) { return <div><dt className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-ink-800">{value}</dd></div>; }
