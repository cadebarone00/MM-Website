/**
 * App colour (Settings → App colour): which palette replaces the maroon ramp across the whole app (app/globals.css,
 * html[data-palette]). Kept on the device in the "palette" cookie so the server draws the right colours from the first
 * paint. Maroon is the default (no attribute).
 */
export const APP_PALETTES = [
  { id: "maroon", name: "Maroon", swatch: "#500001" },
  { id: "navy", name: "Navy", swatch: "#032453" },
  { id: "forest", name: "Forest", swatch: "#003014" },
  { id: "teal", name: "Teal", swatch: "#022d31" },
  { id: "purple", name: "Purple", swatch: "#32164b" },
  { id: "charcoal", name: "Charcoal", swatch: "#22272d" },
] as const;
export type AppPalette = (typeof APP_PALETTES)[number]["id"];
export const PALETTE_COOKIE = "palette";

/** The cookie's value as a palette, or maroon. */
export const appPalette = (value: string | undefined | null): AppPalette =>
  APP_PALETTES.some((p) => p.id === value) ? value as AppPalette : "maroon";

/** In the browser: recolour the app now and keep the choice on this device for a year. */
export function applyPalette(next: AppPalette) {
  const root = document.documentElement;
  if (next === "maroon") root.removeAttribute("data-palette"); else root.setAttribute("data-palette", next);
  document.cookie = `${PALETTE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}
