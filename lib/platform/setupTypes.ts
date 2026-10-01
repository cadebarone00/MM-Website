/**
 * Tournament Setup, page 1 (/tournaments/create): "What are you creating?"
 * Each type gets its own setup branch later; for now each one routes to a
 * placeholder next step at /tournaments/create/<key>.
 */
export interface SetupType {
  key: "golf-trip" | "event" | "team" | "league" | "group";
  name: string;
}

export const SETUP_TYPES: readonly SetupType[] = [
  { key: "golf-trip", name: "Golf Trip" },
  { key: "event", name: "Event" },
  { key: "team", name: "Team" },
  { key: "league", name: "League" },
  { key: "group", name: "Group" },
];

export function setupNextStepHref(type: SetupType): string {
  return `/tournaments/create/${type.key}`;
}

/** The setup type named in the URL, or null if it isn't one. */
export function setupTypeFromParam(param: string): SetupType | null {
  return SETUP_TYPES.find((type) => type.key === param) ?? null;
}
