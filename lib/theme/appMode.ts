/**
 * Appearance (Settings → Appearance): Dark (the maroon app, the default) or Light (white pages, dark text, maroon
 * buttons and accents). Light sets <html data-mode="light">, which swaps the --lm-* colours in app/globals.css. Kept on
 * the device in the "mode" cookie so the server draws the right look from the first paint.
 */
/** Kept for reference: the two looks. */
export const APP_MODES = [
  { id: "dark", name: "Dark", note: "Maroon", swatch: "#240001", ink: "#fbf8f1" },
  { id: "light", name: "Light", note: "White", swatch: "#ffffff", ink: "#240001" },
] as const;
export type AppMode = (typeof APP_MODES)[number]["id"];
export const MODE_COOKIE = "mode";

/** The cookie's value as a mode, or dark. */
export const appMode = (value: string | undefined | null): AppMode => value === "light" ? "light" : "dark";

/** In the browser: switch now and keep the choice on this device for a year. */
export function applyMode(next: AppMode) {
  const root = document.documentElement;
  if (next === "light") root.setAttribute("data-mode", "light"); else root.removeAttribute("data-mode");
  document.cookie = `${MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}
