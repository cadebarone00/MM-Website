/**
 * Tournament Setup, page 1 (/tournaments/create): "What are you creating?"
 * Tournament opens its own setup (/tournaments/code/new: a tournament players join with a code); Golf Trip starts the
 * trip questionnaire; the rest route to a placeholder next step at /tournaments/create/<key>.
 */
export interface SetupType {
  key: "golf-trip" | "tournament" | "team" | "league" | "group";
  name: string;
}

export const SETUP_TYPES: readonly SetupType[] = [
  { key: "golf-trip", name: "Golf Trip" },
  { key: "tournament", name: "Tournament" },
  { key: "team", name: "Team" },
  { key: "league", name: "League" },
  { key: "group", name: "Group" },
];

export function setupNextStepHref(type: SetupType): string {
  return type.key === "tournament" ? "/tournaments/code/new" : `/tournaments/create/${type.key}`;
}

/** The setup type named in the URL, or null if it isn't one. */
export function setupTypeFromParam(param: string): SetupType | null {
  return SETUP_TYPES.find((type) => type.key === param) ?? null;
}
