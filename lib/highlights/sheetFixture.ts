import * as XLSX from "xlsx";
import type { RawCell, RawTab } from "./sheetRows.ts";
import { HIGHLIGHT_HEADERS, HIGHLIGHT_TABS } from "./types.ts";

/**
 * Test data in the real sheet's layout (not a test file itself). Six category tabs with the header row, PARENT rows,
 * CONDITIONAL rows and blank separators, plus the three legacy tabs that must be ignored.
 */

export const HEADER: RawCell[] = Object.values(HIGHLIGHT_HEADERS);
const blank: RawCell[] = ["", "", "", "", "", "", "", ""];

/** [Rule ID, Row type, Rule / conditional, Tier, Headline, Notification text, Status, Detection notes] */
const birdieStreak: RawCell[][] = [
  ["HL-001", "PARENT", "Birdie streak", "", "", "", "Approved", "Birdie tier; extend through 10."],
  ...[3, 4, 5, 6, 7, 8, 9, 10].map((n): RawCell[] => [
    `HL-001-C${String(n - 2).padStart(2, "0")}`, "CONDITIONAL", `${n} consecutive birdies`, String(n),
    `{player}'s heating up! 🔥`, `{count} birdies in a row.`, "Approved", "Birdie tier.",
  ]),
  blank,
  ["HL-002", "PARENT", "Eagle", "", "", "", "Draft", "Use player and hole variables."],
  ["HL-002-C01", "CONDITIONAL", "Eagle", "", "An eagle has landed! 🦅", "{player} makes eagle on No. {hole}.", "Draft", ""],
];

const draftRule = (id: string, name: string, headline: string, body: string): RawCell[][] => [
  [id, "PARENT", name, "", "", "", "Draft", ""],
  [`${id}-C01`, "CONDITIONAL", name, "", headline, body, "Draft", ""],
  blank,
];

/** A clean sheet: HL-001 fully Approved with tiers 3–10, everything else Draft. Validates with zero errors. */
export function validSheet(): RawTab[] {
  // A fresh deep copy every call, so a test that edits a cell can't affect another test.
  return structuredClone([
    { name: "START HERE", values: [["THE MAROON — HIGHLIGHTS ENGINE", "Editable source of truth"]] },
    { name: "Parent Rules", values: [["Rule ID", "Category"], ["HL-999", "Should be ignored"]] },
    { name: "Conditionals", values: [["Parent rule ID"], ["HL-999"]] },
    { name: HIGHLIGHT_TABS[0], values: [HEADER, ...birdieStreak] },
    { name: HIGHLIGHT_TABS[1], values: [HEADER, ...draftRule("HL-011", "Returns all square after 5+ holes not square", "We have a match!", "{player} and {opponent} are back to square.")] },
    { name: HIGHLIGHT_TABS[2], values: [HEADER, ...draftRule("HL-023", "Teams become tied", "Tied at the top!", "{team} ties up the tournament.")] },
    { name: HIGHLIGHT_TABS[3], values: [HEADER, ...draftRule("HL-031", "New solo leader", "New sheriff in town!", "{player} takes sole possession of first.")] },
    { name: HIGHLIGHT_TABS[4], values: [HEADER, ...draftRule("HL-040", "Tournament begins", "Let the games begin!", "Round {round} is underway.")] },
    { name: HIGHLIGHT_TABS[5], values: [HEADER, ...draftRule("HL-046", "First birdie of trip", "First birdie on the board! 🐦", "{player} gets things started.")] },
  ]);
}

/** Rows copied from the real sheet as it was on 2026-10-16 (blank conditional IDs, real names, "Needs copy"), HL-001 marked Approved. */
export function sheetAsFoundOn20261016(): RawTab[] {
  const tabs = validSheet();
  tabs[3] = { name: HIGHLIGHT_TABS[0], values: [HEADER,
    ["HL-001", "PARENT", "Birdie streak", "", "", "", "Approved", "Birdie tier; extend through 10."],
    ["", "CONDITIONAL", "3 consecutive birdies", "3", "Cam’s heating up! 🔥", "3 birdies in a row.", "Approved", "Birdie tier; extend through 10."],
    ["", "CONDITIONAL", "7 consecutive birdies", "7", "Cam is ACTUALLY COOKING!🔥", "7 birdies in a row", "Needs copy", "Same detector"],
  ] };
  tabs[5] = { name: HIGHLIGHT_TABS[2], values: [HEADER,
    ["HL-022", "PARENT", "Team takes/retakes overall lead", "", "", "", "Draft", ""],
    ["", "CONDITIONAL", "Team takes/retakes overall lead", "", "Maroon takes control! / The tide has turned 🌊", "Team Maroon moves into the lead.", "Draft", ""],
  ] };
  return tabs;
}

/** Real .xlsx bytes for these tabs, built in memory like a Google Sheets download. `decorate` can add widths, styles… */
export function toXlsx(tabs: RawTab[], decorate?: (sheet: XLSX.WorkSheet, name: string) => void): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const tab of tabs) {
    const sheet = XLSX.utils.aoa_to_sheet(tab.values);
    decorate?.(sheet, tab.name);
    XLSX.utils.book_append_sheet(book, sheet, tab.name);
  }
  return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}
