import * as XLSX from "xlsx";
import { inviteRows } from "./inviteImport.ts";

/** Parse only the first sheet, bounded to the shared invitation limit plus one warning row. */
export function parseTournamentInviteSpreadsheet(bytes: Uint8Array, net: boolean) {
  const book = XLSX.read(bytes, { type: "array", sheetRows: 503 });
  const sheet = book.Sheets[book.SheetNames[0]];
  return inviteRows(sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }) : [], net);
}
