import { validTeeSets } from "./teeSets";
import type { LiveTeeSet } from "./types";

export const COURSE_CSV_MAX_BYTES = 1024 * 1024;

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
    } else if (ch === "," || ch === "\n" || ch === "\r") {
      row.push(cell.trim()); cell = ""; closed = false;
      if (ch !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === "\r" && source[i + 1] === "\n") i++;
      }
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (closed || ch === '"') throw new Error("Invalid CSV quoting. Use the downloadable template.");
    else cell += ch;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quotation mark.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseCourseCsv(text: string): { name: string; teeSets: LiveTeeSet[] } {
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error("The CSV needs a header and hole rows.");
  const aliases: Record<string, string> = { course: "course_name", tee: "tee_name", tee_set: "tee_name", tee_set_name: "tee_name", yardage: "yards", course_rating: "rating", slope_rating: "slope", tee_color: "color" };
  const headers = rows[0].map((header) => { const key = header.toLowerCase().replace(/[\s-]+/g, "_"); return aliases[key] ?? key; });
  if (new Set(headers).size !== headers.length) throw new Error("The CSV has duplicate column headers.");
  for (const header of ["course_name", "tee_name", "hole", "par", "yards"]) {
    if (!headers.includes(header)) throw new Error(`Missing column: ${header}. Use the downloadable template.`);
  }
  const tees = new Map<string, LiveTeeSet>();
  let name = "";
  const colors: Record<string, string> = { black: "#000000", blue: "#0000ff", white: "#ffffff", red: "#ff0000", gold: "#d4af37", yellow: "#ffff00", green: "#008000", maroon: "#800020", silver: "#c0c0c0", orange: "#ffa500" };
  for (let i = 1; i < rows.length; i++) {
    const fail = (message: string): never => { throw new Error(`Row ${i + 1}: ${message}`); };
    if (rows[i].length !== headers.length) fail("Column count does not match the header.");
    const row = Object.fromEntries(headers.map((header, j) => [header, rows[i][j]]));
    if (!row.course_name || !row.tee_name) fail("Course and tee names are required on every row.");
    if (name && name.toLowerCase() !== row.course_name.toLowerCase()) fail("Upload one course per file; multiple tee sets are supported.");
    name ||= row.course_name;
    const number = Number(row.hole), par = Number(row.par), yards = Number(row.yards);
    if (!row.hole || !Number.isInteger(number) || number < 1 || number > 18) fail("Hole must be 1–18. Do not include Out/In/Total rows.");
    if (!row.par || !Number.isInteger(par) || par < 3 || par > 6) fail("Par must be a whole number from 3 to 6.");
    if (!row.yards || !Number.isInteger(yards) || yards < 0) fail("Yardage must be a nonnegative whole number.");
    const color = row.color ? colors[row.color.toLowerCase()] ?? row.color.toLowerCase() : undefined;
    if (color && !/^#[0-9a-f]{6}$/.test(color)) fail("Color must be a standard tee color name or a six-digit hex color, such as #0000ff.");
    const rating = row.rating ? Number(row.rating) : null, slope = row.slope ? Number(row.slope) : null;
    if (rating !== null && (!Number.isFinite(rating) || rating <= 0)) fail("Rating must be a positive number.");
    if (slope !== null && (!Number.isInteger(slope) || slope < 55 || slope > 155)) fail("Slope must be a whole number from 55 to 155.");
    const key = row.tee_name.toLowerCase();
    let tee = tees.get(key);
    if (!tee) { tee = { id: `import-${tees.size + 1}`, name: row.tee_name, locked: false, rating: null, slope: null, holes: [] }; tees.set(key, tee); }
    if (tee.holes.some((hole) => hole.number === number)) fail(`Duplicate hole ${number} for ${tee.name}.`);
    if (color) { if (tee.color && tee.color !== color) fail(`Conflicting colors for ${tee.name}.`); tee.color = color; }
    if (rating !== null) { if (tee.rating !== null && tee.rating !== rating) fail(`Conflicting ratings for ${tee.name}.`); tee.rating = rating; }
    if (slope !== null) { if (tee.slope !== null && tee.slope !== slope) fail(`Conflicting slopes for ${tee.name}.`); tee.slope = slope; }
    tee.holes.push({ number, par, yards });
  }
  const teeSets = [...tees.values()];
  for (const tee of teeSets) {
    if (tee.holes.length !== 18) throw new Error(`${tee.name} needs all 18 holes; found ${tee.holes.length}.`);
    tee.holes.sort((a, b) => a.number - b.number);
    tee.color ??= colors[tee.name.toLowerCase()] ?? "#800020";
  }
  if (!validTeeSets(teeSets)) throw new Error("The CSV contains invalid tee sets.");
  return { name, teeSets };
}
