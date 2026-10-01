/**
 * Tournament Setup, page 1 (/tournaments/create): "What are you creating?"
 * Each type gets its own setup branch later; for now each one routes to a
 * placeholder next step at /tournaments/create/<key>.
 */
export interface SetupType {
  key: "event" | "team" | "league" | "group";
  name: string;
  description: string;
}

export const SETUP_TYPES: readonly SetupType[] = [
  { key: "event", name: "Event", description: "A one-time tournament or outing" },
  { key: "team", name: "Team", description: "A roster that competes together" },
  { key: "league", name: "League", description: "A season with standings" },
  { key: "group", name: "Group", description: "Friends who play together" },
];

export function setupNextStepHref(type: SetupType): string {
  return `/tournaments/create/${type.key}`;
}

/** The setup type named in the URL, or null if it isn't one. */
export function setupTypeFromParam(param: string): SetupType | null {
  return SETUP_TYPES.find((type) => type.key === param) ?? null;
}
