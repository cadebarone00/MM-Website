/**
 * Building blocks → Notifications (owner request 2026-11-27): every notification type the app can send, each with its
 * wordings, so a tap sends a test of that type to your own phone with one of its wordings at random. Pure, tested.
 *   catalog:<kind>     the app's own types (lib/notifications/catalog.ts, approved V1–V3), sample names filled in
 *   hl:<conditional>   every highlight in the sheet (published or built-in), per trigger, sample names filled in
 */
import type { HighlightConfig } from "@/lib/highlights/types";
import { renderTemplate, SAMPLE_VALUES } from "@/lib/highlights/template";
import { CATALOG_SAMPLE_VALUES, fillBlanks, NOTIFICATION_CATALOG, NOTIFICATION_SWITCHES, type CatalogEntry } from "./catalog.ts";

export type TestItem = { id: string; label: string; note: string | null; versions: number };
export type TestGroup = { title: string; items: TestItem[] };
export type TestWords = { title: string; body: string };

const switchLabel = (id: string | null) => NOTIFICATION_SWITCHES.find((s) => s.id === id)?.label ?? "Always on";

/** The menu: the app's types grouped by their Settings switch, then the highlights by sheet tab. */
export function testMenu(config: HighlightConfig | null): TestGroup[] {
  const groups = new Map<string, TestItem[]>();
  const add = (title: string, item: TestItem) => groups.set(title, [...(groups.get(title) ?? []), item]);
  for (const entry of NOTIFICATION_CATALOG) {
    if (!entry.wording?.length) continue; // sheet types: their words are the highlights below
    add(switchLabel(entry.switch), { id: `catalog:${entry.kind}`, label: entry.name, note: entry.trigger, versions: entry.wording.length });
  }
  for (const rule of config?.rules ?? []) {
    for (const conditional of rule.conditionals) {
      const live = conditional.variations.filter((v) => v.headline.trim() || v.body.trim());
      if (!live.length) continue;
      const tier = conditional.tier === null ? "" : ` · ${conditional.tier}`;
      add(`Highlights · ${rule.category}`, { id: `hl:${conditional.id}`, label: `${rule.id} ${rule.name}${tier}`, note: `${rule.status === "Approved" && conditional.status === "Approved" ? "Approved" : "Not approved"}`, versions: live.length });
    }
  }
  return [...groups].map(([title, items]) => ({ title, items }));
}

/** One random wording for a menu item, with sample names; null for an unknown id. `random` is only swapped by tests. */
export function testWords(id: string, config: HighlightConfig | null, random: () => number = Math.random): TestWords | null {
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  if (id.startsWith("catalog:")) {
    const entry = (NOTIFICATION_CATALOG as readonly CatalogEntry[]).find((e) => e.kind === id.slice(8));
    if (!entry?.wording?.length) return null;
    const words = pick(entry.wording as readonly { title: string; body: string }[]);
    return { title: fillBlanks(words.title, CATALOG_SAMPLE_VALUES), body: fillBlanks(words.body, CATALOG_SAMPLE_VALUES) };
  }
  if (id.startsWith("hl:")) {
    const conditional = config?.rules.flatMap((r) => r.conditionals).find((c) => c.id === id.slice(3));
    const live = conditional?.variations.filter((v) => v.headline.trim() || v.body.trim()) ?? [];
    if (!live.length) return null;
    const words = pick(live);
    const fill = (text: string) => { const r = renderTemplate(text, SAMPLE_VALUES); return r.ok ? r.text : text; };
    return { title: fill(words.headline), body: fill(words.body) };
  }
  return null;
}
