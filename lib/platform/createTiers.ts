/**
 * Create Tournament page (/tournaments/create): the format tiers shown as
 * price boxes, and the survey link each opens. Prices are a placeholder until
 * pricing is decided (no hard-coded pricing yet).
 */
export interface CreateTier {
  key: "individual" | "match-play" | "individual-match-play";
  label: string;
  name: string;
  price: string;
}

export const CREATE_TIERS: readonly CreateTier[] = [
  { key: "individual", label: "Tier 1", name: "Individual", price: "Free during beta" },
  { key: "match-play", label: "Tier 2", name: "Match Play", price: "Free during beta" },
  { key: "individual-match-play", label: "Tier 3", name: "Individual + Match Play", price: "Free during beta" },
];

export function tierSurveyHref(tier: CreateTier): string {
  return `/tournaments/new?tier=${tier.key}`;
}

/** The tier picked on the Create page, from the survey's `?tier=` (first value if repeated). */
export function tierFromParam(param: string | string[] | undefined): CreateTier | null {
  const value = Array.isArray(param) ? param[0] : param;
  return CREATE_TIERS.find((tier) => tier.key === value) ?? null;
}
