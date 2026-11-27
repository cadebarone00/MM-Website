/**
 * The app's built-in highlight notifications (owner decision 2026-11-27): the approved sheet, built into the code by
 * scripts/build-highlights-builtin.ts, so every user and trip gets them with nothing to publish, like Sleeper's
 * notifications. A version published in the Highlights Admin (/admin/highlights) replaces it, which is how wording changes
 * go live without a code update. Read through upgradeConfig so it always matches the current config shape.
 */
import type { HighlightConfig } from "./types.ts";
import { upgradeConfig } from "./upgrade.ts";
import builtIn from "./builtInConfig.json";

export const BUILT_IN_LABEL: string = builtIn.label;
export const BUILT_IN_FINGERPRINT: string = builtIn.configFingerprint;
/** Null only if the file were broken (then no highlights, never a crash). */
export const BUILT_IN_HIGHLIGHTS: HighlightConfig | null = upgradeConfig(builtIn.config);
