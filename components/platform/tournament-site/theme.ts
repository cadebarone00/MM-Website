import type { CSSProperties } from "react";
import type { Branding, PlayStatus, TournamentStatus } from "./types.ts";

export function safeColor(value: string, fallback = "#193c52"): string {
  return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}
export function luminance(color: string): number {
  const hex = safeColor(color).slice(1);
  const rgb = [0, 2, 4].map(offset => {
    const n = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
  });
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
/** Select black or white text, including for white and very pale team colors. */
export function readableText(color: string): string {
  const light = luminance(color);
  return (light + .05) / .05 >= 1.05 / (light + .05) ? "#000000" : "#ffffff";
}
export function themeVariables(branding: Branding): CSSProperties {
  const primary = safeColor(branding.primary);
  const secondary = safeColor(branding.secondary, "#f5f2e9");
  const accent = safeColor(branding.accent, "#d6b85c");
  return { "--ts-primary": primary, "--ts-on-primary": readableText(primary), "--ts-secondary": secondary,
    "--ts-on-secondary": readableText(secondary), "--ts-accent": accent, "--ts-on-accent": readableText(accent) } as CSSProperties;
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
