/** The Maroon's colors and fonts (same values as the website's globals.css). Use these, never hard-coded colors. */
export const colors = {
  maroon900: "#240001",
  maroon700: "#500001",
  cream: "#fbf8f1",
  card: "#ffffff",
  ink: "#240001",
  inkMuted: "#6b5552",
  gold: "#c9a86e",
  goldBright: "#e3c27f",
  onMaroon: "#f6eee8",
  tabInactive: "#8d7874",
  error: "#a3261c",
  errorOnMaroon: "#f2a9a0",
  line: "#e6ddd0",
  inputOnMaroon: "rgba(255,255,255,0.05)",
} as const;

export const fonts = {
  regular: "Spectral_400Regular",
  semibold: "Spectral_600SemiBold",
  bold: "Spectral_700Bold",
} as const;

/** Everything sits 16px from the phone's edges (same rule as the website's --page-gutter). */
export const gutter = 16;
