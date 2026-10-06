import { stateAbbreviation, US_STATE_CODES } from "../data/usStates.ts";

/** Country name (lowercase) → two-letter code, built from the browser's / Node's region names, plus common short names. */
let countryCodes: Map<string, string> | null = null;
function countryCode(name: string): string | null {
  if (!countryCodes) {
    countryCodes = new Map([["usa", "US"], ["us", "US"], ["united states of america", "US"], ["uk", "GB"], ["england", "GB"], ["scotland", "GB"], ["wales", "GB"], ["northern ireland", "GB"]]);
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const region = names.of(code);
        // First code wins (e.g. France → FR, not the old "FX"); skip grouping codes like EU / UN.
        if (region && region !== code && !["EU", "EZ", "UN", "QO", "FX"].includes(code) && !countryCodes.has(region.toLowerCase())) countryCodes.set(region.toLowerCase(), code);
      } catch { /* not a region code */ }
    }
  }
  const trimmed = name.trim();
  const known = countryCodes.get(trimmed.toLowerCase());
  if (known) return known;
  return /^[A-Za-z]{2}$/.test(trimmed) && !US_STATE_CODES.has(trimmed.toUpperCase()) ? trimmed.toUpperCase() : null;
}

/**
 * A destination as "City, XX" (two short rows on Home never become three):
 * in the US, XX is the state ("Scottsdale, AZ, USA" or "Austin, Texas" → "Scottsdale, AZ" / "Austin, TX");
 * anywhere else, XX is the country ("Banff, AB, Canada" → "Banff, CA"). Anything it can't read is returned trimmed.
 */
export function shortPlace(destination: string): string {
  const parts = destination.split(",").map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const city = parts[0];
  const last = parts.at(-1)!;
  const state = stateAbbreviation(parts[1]);
  const country = countryCode(last);
  if (country === "US" || (parts.length === 2 && US_STATE_CODES.has(state))) return US_STATE_CODES.has(state) ? `${city}, ${state}` : city;
  if (country) return `${city}, ${country}`;
  return `${city}, ${last}`;
}
