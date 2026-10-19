import * as XLSX from "xlsx";
import type { RawCell, RawTab } from "./sheetRows.ts";
import { HIGHLIGHT_TABS, TRAVEL_TAB } from "./types.ts";

/**
 * Test data in the real sheet's layout (not a test file itself): the six golf tabs (header row, PARENT rows with their
 * metadata, CONDITIONAL rows, blank separators), the travel tab with its own columns, and the three hidden legacy tabs
 * that must be ignored. Golf cells keep the original positions (A–H) so tests can address them; metadata is in I–K.
 */

/** Golf tabs: [Rule ID, Row type, Rule / conditional, Tier, Headline, Notification text, Status, Detection notes, Category, Eligibility, Alert level] */
export const HEADER: RawCell[] = ["Rule ID", "Row type", "Rule / conditional", "Tier", "Headline", "Notification text", "Status", "Detection notes", "Notification Category", "Competition Eligibility", "Minimum Alert Level"];
/** Travel tab, as in the sheet (no Tier / Detection notes; its own metadata columns). */
export const TRAVEL_HEADER: RawCell[] = ["Rule ID", "Row type", "Rule / conditional", "Variation", "Headline", "Notification text", "Status", "Category", "Audience", "Reminder / trigger", "Source requirement", "Notes", "Platform check"];
const blank: RawCell[] = ["", "", "", "", "", "", "", "", "", "", ""];

export const GOLF_META: Record<string, [string, string, string]> = {
  "HL-001": ["Individual performance", "All trip types", "Balanced"],
  "HL-002": ["Individual performance", "All trip types", "Big Plays"],
  "HL-011": ["Match play drama", "Match + Individual; Match Only", "All"],
  "HL-022": ["Team competition", "Match + Individual; Match Only (team competition active)", "Balanced"],
  "HL-023": ["Team competition", "Match + Individual; Match Only (team competition active)", "All"],
  "HL-031": ["Individual leaderboard", "Match + Individual; Individual Only", "Balanced"],
  "HL-040": ["Trip and tournament milestones", "Match + Individual; Match Only; Individual Only (tournament configured)", "Balanced"],
  "HL-046": ["Fun and social highlights", "All trip types", "Balanced"],
};
const parent = (id: string, name: string, status: string, notes = ""): RawCell[] => [id, "PARENT", name, "", "", "", status, notes, ...GOLF_META[id]];

const birdieStreak: RawCell[][] = [
  parent("HL-001", "Birdie streak", "Approved", "Birdie tier; extend through 10."),
  ...[3, 4, 5, 6, 7, 8, 9, 10].map((n): RawCell[] => [
    `HL-001-C${String(n - 2).padStart(2, "0")}`, "CONDITIONAL", `${n} consecutive birdies`, String(n),
    `{player}'s heating up! 🔥`, `{count} birdies in a row.`, "Approved", "Birdie tier.",
  ]),
  blank,
  parent("HL-002", "Eagle", "Draft", "Use player and hole variables."),
  ["HL-002-C01", "CONDITIONAL", "Eagle", "", "An eagle has landed! 🦅", "{player} makes eagle on No. {hole}.", "Draft", ""],
];

const draftRule = (id: string, name: string, headline: string, body: string): RawCell[][] => [
  parent(id, name, "Draft"),
  [`${id}-C01`, "CONDITIONAL", name, "", headline, body, "Draft", ""],
  blank,
];

/** Travel rule TR-001 (Draft): metadata on every row like the sheet, own wording V1 + two VARIATION rows. */
export const travelRows = (): RawCell[][] => {
  const meta = ["Flights", "Flight travelers", "24h before", "Scheduled"];
  return [
    ["TR-001", "PARENT", "Flight tomorrow", "", "", "", "Draft", ...meta, "", "Common Unicode emoji; device-rendering QA required"],
    ["TR-001-C01", "CONDITIONAL", "Flight tomorrow", "V1", "Takeoff tomorrow! ✈️", "Flight {Flight Number} leaves at {Time}.", "Draft", ...meta, "", ""],
    ["TR-001-C01-V02", "VARIATION", "Flight tomorrow", "V2", "Wheels up soon! 🧳", "Your flight to {Destination} is tomorrow.", "Draft", ...meta, "", ""],
    ["TR-001-C01-V03", "VARIATION", "Flight tomorrow", "V3", "Don't forget the clubs! ✈️", "Double-check flight {Flight Number} and your departure time.", "Draft", ...meta, "", ""],
  ];
};

/** A clean sheet: HL-001 fully Approved with tiers 3–10, everything else Draft. Validates with zero errors or warnings. */
export function validSheet(): RawTab[] {
  // A fresh deep copy every call, so a test that edits a cell can't affect another test.
  return structuredClone([
    { name: "START HERE", values: [["THE MAROON — HIGHLIGHTS ENGINE", "Editable source of truth"]] },
    { name: "Parent Rules", values: [["Rule ID", "Category"], ["HL-999", "Should be ignored"]] },
    { name: "Conditionals", values: [["Parent rule ID"], ["HL-999"]] },
    { name: HIGHLIGHT_TABS[0], values: [HEADER, ...birdieStreak] },
    { name: HIGHLIGHT_TABS[1], values: [HEADER, ...draftRule("HL-011", "Returns all square after 5+ holes not square", "We have a match! ⚖️", "{player} and {opponent} are back to square.")] },
    { name: HIGHLIGHT_TABS[2], values: [HEADER, ...draftRule("HL-023", "Teams become tied", "Tied at the top! ⚖️", "{team} ties up the tournament.")] },
    { name: HIGHLIGHT_TABS[3], values: [HEADER, ...draftRule("HL-031", "New solo leader", "New sheriff in town! 🤠", "{player} takes sole possession of first.")] },
    { name: HIGHLIGHT_TABS[4], values: [HEADER, ...draftRule("HL-040", "Tournament begins", "Let the games begin! ⛳", "Round {round} is underway.")] },
    { name: HIGHLIGHT_TABS[5], values: [HEADER, ...draftRule("HL-046", "First birdie of trip", "First birdie on the board! 🐦", "{player} gets things started.")] },
    { name: TRAVEL_TAB, values: [TRAVEL_HEADER, ...travelRows()] },
  ]);
}

/** Rows copied from the real sheet as it was on 2026-10-16 (blank conditional IDs, real names, "Needs copy"), HL-001 marked Approved. */
export function sheetAsFoundOn20261016(): RawTab[] {
  const tabs = validSheet();
  tabs[3] = { name: HIGHLIGHT_TABS[0], values: [HEADER,
    parent("HL-001", "Birdie streak", "Approved", "Birdie tier; extend through 10."),
    ["", "CONDITIONAL", "3 consecutive birdies", "3", "Cam’s heating up! 🔥", "3 birdies in a row.", "Approved", "Birdie tier; extend through 10."],
    ["", "CONDITIONAL", "7 consecutive birdies", "7", "Cam is ACTUALLY COOKING!🔥", "7 birdies in a row", "Needs copy", "Same detector"],
  ] };
  tabs[5] = { name: HIGHLIGHT_TABS[2], values: [HEADER,
    parent("HL-022", "Team takes/retakes overall lead", "Draft"),
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

/**
 * The variations layout: HL-001-C01 has three VARIATION rows (owner's example wording) and no wording of its own;
 * C02 has only its own wording (V01); C03 has VARIATION rows V01–V03, one Draft and one Disabled. Other tabs as in validSheet().
 */
export function variationSheet(): RawTab[] {
  const tabs = validSheet();
  tabs[3] = { name: HIGHLIGHT_TABS[0], values: [HEADER,
    parent("HL-001", "Birdie streak", "Approved"),
    ["HL-001-C01", "CONDITIONAL", "3 consecutive birdies", "3", "", "", "Approved", ""],
    ["HL-001-C01-V01", "VARIATION", "Heating up", "", "{player}'s heating up! 🔥", "{count} birdies in a row.", "Approved", ""],
    ["HL-001-C01-V02", "VARIATION", "Check the clubs", "", "Somebody check those clubs! 👀", "{player} has {count} straight birdies.", "Approved", ""],
    ["HL-001-C01-V03", "VARIATION", "", "", "Three's a party! 🐦", "{player} birdies {count} in a row.", "Approved", ""],
    ["HL-001-C02", "CONDITIONAL", "4 consecutive birdies", "4", "Somebody stop {player}! 🔥", "4 straight birdies.", "Approved", ""],
    ["HL-001-C03", "CONDITIONAL", "5 consecutive birdies", "5", "", "", "Approved", ""],
    ["HL-001-C03-V01", "VARIATION", "", "", "{player} is actually on fire! 🔥", "5 birdies in a row", "Approved", ""],
    ["HL-001-C03-V02", "VARIATION", "", "", "Still being written ✍️", "{player} keeps going", "Draft", ""],
    ["HL-001-C03-V03", "VARIATION", "", "", "Retired {line", "", "Disabled", ""],
    [],
    parent("HL-002", "Eagle", "Draft"),
    ["HL-002-C01", "CONDITIONAL", "Eagle", "", "An eagle has landed! 🦅", "{player} makes eagle on No. {hole}.", "Draft", ""],
  ] };
  return structuredClone(tabs);
}
