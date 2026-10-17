import * as XLSX from "xlsx";
import type { RawTab } from "./sheetRows.ts";
import { HIGHLIGHT_TABS } from "./types.ts";

/**
 * Reads an uploaded .xlsx (Google Sheets → File → Download → Microsoft Excel) into the importer's input. Pure: bytes in,
 * cells out; no file system, network or database. Only the six category tabs are parsed; formulas are never evaluated
 * (Excel files carry each cell's last displayed text, which is what we read); nothing in the file is ever executed.
 * The file itself is never kept — callers store only its fingerprint (canonical.ts).
 */

export const MAX_XLSX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS_PER_TAB = 2000;

export type XlsxRejection =
  | "empty-file" | "file-too-large" | "wrong-file-type" | "unreadable-workbook" | "too-many-rows";
export type XlsxReadResult = { ok: true; tabs: RawTab[] } | { ok: false; code: XlsxRejection; error: string };

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // every .xlsx is a zip file
const OLD_EXCEL_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .xls
const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
const normalize = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
const reject = (code: XlsxRejection, error: string): XlsxReadResult => ({ ok: false, code, error });

export function readHighlightWorkbook(bytes: Uint8Array, fileName?: string): XlsxReadResult {
  if (bytes.length === 0) return reject("empty-file", "The file is empty.");
  if (bytes.length > MAX_XLSX_BYTES) return reject("file-too-large", `The file is larger than ${MAX_XLSX_BYTES / 1024 / 1024} MB.`);
  if (fileName !== undefined && !/\.xlsx$/i.test(fileName.trim())) {
    return reject("wrong-file-type", "Upload the .xlsx file from Google Sheets (File → Download → Microsoft Excel). Other formats aren't accepted.");
  }
  if (startsWith(bytes, OLD_EXCEL_SIGNATURE)) return reject("wrong-file-type", "This is an old .xls file. Download the sheet as .xlsx instead.");
  if (!startsWith(bytes, ZIP_SIGNATURE)) return reject("wrong-file-type", "This isn't an .xlsx file.");

  const options = { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false } as const;
  let names: string[];
  let book: XLSX.WorkBook;
  try {
    // First only the tab names, then only the six category tabs (legacy tabs are never parsed).
    names = XLSX.read(bytes, { ...options, bookSheets: true }).SheetNames;
    const wanted = names.filter((name) => (HIGHLIGHT_TABS as readonly string[]).some((tab) => normalize(tab) === normalize(name)));
    book = XLSX.read(bytes, { ...options, sheets: wanted, sheetRows: MAX_ROWS_PER_TAB + 1 });
  } catch {
    return reject("unreadable-workbook", "The file couldn't be read as a spreadsheet. Download it again from Google Sheets.");
  }

  const tabs: RawTab[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue; // a tab we chose not to parse
    const fullRef = sheet["!fullref"] ?? sheet["!ref"];
    if (fullRef && XLSX.utils.decode_range(fullRef).e.r + 1 > MAX_ROWS_PER_TAB) {
      return reject("too-many-rows", `The "${name}" tab has more than ${MAX_ROWS_PER_TAB} rows.`);
    }
    if (!sheet["!ref"]) { tabs.push({ name, values: [] }); continue; }
    // Read from A1 even if the sheet's used range starts lower, so row numbers in messages match the sheet.
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    range.s = { r: 0, c: 0 };
    const values = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false, blankrows: true, range });
    tabs.push({ name, values });
  }
  return { ok: true, tabs };
}
