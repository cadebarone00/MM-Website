import type { CSSProperties } from "react";
import type { Branding, PlayStatus, TournamentStatus } from "./types.ts";
import { SYSTEM_DEFAULT_THEME, isHexColor, readableTextOn, relativeLuminance, resolveTournamentTheme } from "../../../lib/theme/tournamentTheme.ts";

// Color logic lives in lib/theme/tournamentTheme.ts; these keep the kit's existing names.
export function safeColor(value: string, fallback = SYSTEM_DEFAULT_THEME.primary): string {
  return isHexColor(value) ? value : fallback;
}
export function luminance(color: string): number {
  return relativeLuminance(safeColor(color));
}
/** Select black or white text, including for white and very pale team colors. */
export function readableText(color: string): string {
  return readableTextOn(safeColor(color));
}
export function themeVariables(branding: Branding): CSSProperties {
  const { theme } = resolveTournamentTheme(branding);
  return { "--ts-primary": theme.primary, "--ts-on-primary": theme.textOnPrimary, "--ts-secondary": theme.secondary,
    "--ts-on-secondary": theme.textOnSecondary, "--ts-accent": theme.accent, "--ts-on-accent": theme.textOnAccent } as CSSProperties;
}
export function statusLabel(status: TournamentStatus | PlayStatus): string {
  return ({ draft: "Draft", waiting: "Waiting on Pairings", scheduled: "Scheduled", live: "Live", final: "Final", archived: "Archived" })[status];
}
export function playLabel(status: PlayStatus, progress?: string): string {
  return status === "final" ? "Final" : status === "live" && progress ? `${statusLabel(status)} · ${progress}` : statusLabel(status);
}
/** Optional assets only; disallow script/data URLs. No upload or hosted-media dependency. */
export function imageSource(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^\/(?!\/)[^\\]*$/.test(value)) return value;
  try { return new URL(value).protocol === "https:" ? value : undefined; } catch { return undefined; }
}
