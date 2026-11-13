/** Import past trip: the three kinds of trip and their templates in public/templates (scripts/build-past-trip-templates.py).
 *  Kept apart from pastTripImport.ts so the page can use it without loading the spreadsheet reader. */
export type PastTripKind = "individual" | "team" | "both";
export const PAST_TRIP_KINDS: PastTripKind[] = ["individual", "team", "both"];
export const pastTripTemplate = (kind: PastTripKind) =>
  `/templates/${{ individual: "past-trip-individual", team: "past-trip-team", both: "past-trip-team-and-individual" }[kind]}.xlsx`;
