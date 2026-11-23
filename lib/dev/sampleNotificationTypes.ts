/**
 * DEV ONLY: preview notes for every type in the notification master list (lib/notifications/catalog.ts), in its three
 * wording versions. Sheet-worded types (golf highlights, travel, organizer messages) read the Highlights snapshot fixture,
 * so this file stays out of lib/dev/simulator.ts (loaded by real pages).
 */
import type { AppNotification } from "@/lib/notifications/types";
import { CATALOG_SAMPLE_VALUES, catalogEntry, fillBlanks, type NotificationKind, type Wording } from "@/lib/notifications/catalog";
import { SAMPLE_VALUES, renderTemplate } from "@/lib/highlights/template";
import type { HighlightConfig } from "@/lib/highlights/types";
import { SAMPLE_TRIP, minutesAgo, type NotificationWording } from "./sampleNotifications";
import snapshot from "./highlightsSnapshot.json";

const SHEET = (snapshot as unknown as { config: HighlightConfig }).config;
/** A Highlights sheet rule for each sheet-worded type, filled with the sheet's typical values. */
const SHEET_RULE: Partial<Record<NotificationKind, string>> = { highlight: "HL-001", travel: "TR-001" };
function sheetRule(kind: NotificationKind) {
  const categories: readonly string[] = catalogEntry(kind).sheetCategories ?? [];
  return SHEET.rules.find(rule => rule.id === SHEET_RULE[kind]) ?? SHEET.rules.find(rule => categories.includes(String(rule.meta?.notificationCategory ?? "")));
}

/** The type's wording versions with the blanks filled: written in the catalog, or the first sheet rule it points at. */
export function sampleWordings(kind: NotificationKind): Wording[] {
  const entry = catalogEntry(kind);
  if (entry.wording) return entry.wording.map(w => ({ title: fillBlanks(w.title, CATALOG_SAMPLE_VALUES), body: fillBlanks(w.body, CATALOG_SAMPLE_VALUES) }));
  const values = { ...SAMPLE_VALUES, Player: CATALOG_SAMPLE_VALUES.Player };
  const fill = (text: string) => { const out = renderTemplate(text, values); return out.ok ? out.text : text; };
  return (sheetRule(kind)?.conditionals[0]?.variations ?? []).slice(0, 3).map(v => ({ title: fill(v.headline), body: fill(v.body) }));
}

/** Where the sheet wording came from, for the All types page ("HL-001 · 3 birdies in a row"). */
export function sampleSheetSource(kind: NotificationKind): string | null {
  const rule = catalogEntry(kind).wording ? null : sheetRule(kind);
  return rule ? `${rule.id} · ${rule.name}` : null;
}

/** How many sheet rules / wordings feed a sheet-worded type. */
export function sheetCounts(kind: NotificationKind): { rules: number; wordings: number } {
  const categories: readonly string[] = catalogEntry(kind).sheetCategories ?? [];
  const rules = SHEET.rules.filter(rule => categories.includes(String(rule.meta?.notificationCategory ?? "")));
  return { rules: rules.length, wordings: rules.reduce((sum, rule) => sum + rule.conditionals.reduce((n, c) => n + c.variations.length, 0), 0) };
}

/**
 * One type's preview notes: the chosen wording is the newest (unread), the other two follow (older; the last one read),
 * so the stack and the bell show all three versions together.
 */
export function sampleNotesForType(kind: NotificationKind, wording: NotificationWording = 1): AppNotification[] {
  const entry = catalogEntry(kind);
  const versions = sampleWordings(kind);
  const order = [wording - 1, ...versions.map((_, index) => index).filter(index => index !== wording - 1)];
  return order.filter(index => versions[index]).map((index, step) => ({
    ...(entry.personal ? { groupId: "", groupName: "" } : SAMPLE_TRIP), id: `${kind}-v${index + 1}`, kind, title: versions[index].title, body: versions[index].body,
    link: fillBlanks(entry.link, CATALOG_SAMPLE_VALUES), createdAt: minutesAgo([0, 14, 75][step]), read: step === 2,
    // A wording that names the sample golfer is about them: their avatar shows on the right.
    person: `${versions[index].title} ${versions[index].body}`.includes(CATALOG_SAMPLE_VALUES.Player) ? { name: CATALOG_SAMPLE_VALUES.Player } : null,
  }));
}
