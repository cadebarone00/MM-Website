/** The 50 states + DC, for the course-location "State" dropdown. Value is the two-letter code stored on the course (e.g. "TX"). */
export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

export const US_STATE_CODES = new Set(US_STATES.map((state) => state.code));

const CODE_BY_NAME = new Map(US_STATES.map((state) => [state.name.toLowerCase(), state.code]));

/** App-wide rule: a US state always shows as its two-letter code ("Texas" or "texas" → "TX"). Anything else is returned trimmed, unchanged. */
export function stateAbbreviation(state: string): string {
  const trimmed = state.trim();
  if (US_STATE_CODES.has(trimmed.toUpperCase()) && trimmed.length === 2) return trimmed.toUpperCase();
  return CODE_BY_NAME.get(trimmed.toLowerCase()) ?? trimmed;
}

/** "City, ST" from optional parts, e.g. ("Austin", "Texas") → "Austin, TX"; missing parts are skipped. */
export function cityState(city?: string | null, state?: string | null): string {
  return [city?.trim(), state ? stateAbbreviation(state) : null].filter(Boolean).join(", ");
}
