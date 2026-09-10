import { read, utils } from "xlsx";
import type { LiveTeeSet } from "./types";
import { validTeeSets } from "./teeSets";

/** CSV updates only supplied cells; blank cells retain saved values. */
export function mergeCourseCsv(csv: string, existing: LiveTeeSet[]): LiveTeeSet[] {
  const workbook = read(csv.replace(/^\uFEFF/, ""), { type: "string", raw: true });
  const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
  if (!rows.length || rows.length > 2000) throw new Error("CSV must contain between 1 and 2,000 hole rows.");
  const tees = structuredClone(existing);
  const touched = new Set<string>();
  const seen = new Set<string>();
  for (const [index, original] of rows.entries()) {
    const row = Object.fromEntries(Object.entries(original).map(([key, value]) => [key.trim().toLowerCase().replace(/[\s-]+/g, "_"), String(value).trim()]));
    const name = row.tee_name || row.tee_set_name || row.tee_set || row.tee;
    const hole = Number(row.hole || row.hole_number);
    if (!name || !Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error(`Row ${index + 2}: provide tee_name and a hole number from 1 to 18.`);
    const matches = tees.filter((tee) => tee.name.trim().toLowerCase() === name.toLowerCase());
    if (matches.length > 1) throw new Error(`Multiple saved tees are named ${name}. Rename them before importing.`);
    let tee = matches[0];
    if (!tee) {
      tee = { id: crypto.randomUUID(), name, locked: false, rating: null, slope: null, holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 0, yards: 0 })) };
      tees.push(tee);
    }
    const key = `${tee.id}:${hole}`;
    if (seen.has(key)) throw new Error(`Duplicate hole ${hole} for ${name}.`);
    seen.add(key); touched.add(tee.id); tee.locked = false;
    const card = tee.holes.find((h) => h.number === hole)!;
    for (const [field, value] of [["par", row.par], ["yards", row.yardage || row.yards]] as const) {
      if (value) { const n = Number(value); if (!Number.isInteger(n) || (field === "par" ? n < 3 || n > 6 : n < 0)) throw new Error(`Row ${index + 2}: invalid ${field}.`); card[field] = n; }
    }
    for (const field of ["rating", "slope"] as const) {
      const value = row[field] || row[`course_${field}`];
      if (value) {
        const n = Number(value);
        if (!Number.isFinite(n) || (field === "rating" ? n <= 0 : !Number.isInteger(n) || n < 55 || n > 155)) throw new Error(`Row ${index + 2}: invalid ${field}.`);
        // A tee has one rating/slope; conflicting repeated values are errors.
        const marker = `${tee.id}:${field}:${n}`;
        if ([...seen].some((entry) => entry.startsWith(`${tee.id}:${field}:`) && entry !== marker)) throw new Error(`Conflicting ${field} values for ${name}.`);
        seen.add(marker); tee[field] = n;
      }
    }
    if (row.color) { if (!/^#[0-9a-f]{6}$/i.test(row.color)) throw new Error(`Row ${index + 2}: color must be a hex color such as #800020.`); tee.color = row.color; }
  }
  if (!touched.size || !validTeeSets(tees)) throw new Error("CSV contains invalid tee data.");
  return tees;
}
