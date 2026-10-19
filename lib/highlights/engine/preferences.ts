import { ALERT_LEVELS, PREFERENCE_CATEGORIES, type AlertLevel, type PreferenceCategory } from "../metadata.ts";

/**
 * A golfer's alert preferences: one golf-highlight intensity + an on/off per category, at account level with optional
 * per-trip overrides. Pure; stored nowhere yet (simulator state only — no preference tables this phase).
 * Golf intensity is a RANKING: Big Plays ⊂ Balanced ⊂ All. Travel alerts ignore it — only their category counts.
 */

export type GolfIntensity = "off" | AlertLevel;
export const GOLF_INTENSITIES: readonly GolfIntensity[] = ["off", ...ALERT_LEVELS];
export const GOLF_INTENSITY_LABELS: Record<GolfIntensity, string> = { off: "Off", "big-plays": "Big Plays", balanced: "Balanced (recommended)", all: "All Highlights" };

export interface AlertPreferences {
  golf: GolfIntensity;
  categories: Record<PreferenceCategory, boolean>;
}
/** Per-trip override: anything set here replaces the account-level value for that trip only. */
export interface TripOverride {
  golf?: GolfIntensity;
  categories?: Partial<Record<PreferenceCategory, boolean>>;
}

export const DEFAULT_PREFERENCES: AlertPreferences = {
  golf: "balanced",
  categories: Object.fromEntries(PREFERENCE_CATEGORIES.map((category) => [category, true])) as Record<PreferenceCategory, boolean>,
};

export function effectivePreferences(account: AlertPreferences, override?: TripOverride | null): AlertPreferences {
  return {
    golf: override?.golf ?? account.golf,
    categories: { ...account.categories, ...(override?.categories ?? {}) } as Record<PreferenceCategory, boolean>,
  };
}

const RANK: Record<AlertLevel, number> = { "big-plays": 0, balanced: 1, all: 2 };
/** Does a user's golf setting include a rule of this minimum level? Big Plays rules reach every setting; All rules only All. */
export function intensityIncludes(setting: GolfIntensity, ruleLevel: AlertLevel): boolean {
  return setting !== "off" && RANK[ruleLevel] <= RANK[setting];
}
