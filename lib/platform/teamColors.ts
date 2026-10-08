/**
 * Team colors the organizer picks from (Competition → Team → Team Color). Each color comes with the colors that go with
 * it, so anything drawn in a team's color stays readable:
 * - `text`: lettering on the team color (white or near-black, whichever reads better).
 * - `secondary`: a softer shade of the color for borders, bars and tints next to it.
 */
export type TeamColor = { id: string; name: string; base: string; text: string; secondary: string };

const PALETTE: [id: string, name: string, base: string][] = [
  ["maroon", "Maroon", "#6b1e2a"],
  ["red", "Red", "#c62828"],
  ["orange", "Orange", "#e8710a"],
  ["gold", "Gold", "#d4a62a"],
  ["green", "Green", "#2e7d32"],
  ["teal", "Teal", "#00796b"],
  ["navy", "Navy", "#1a2f5a"],
  ["royal", "Royal Blue", "#1e5bc6"],
  ["sky", "Sky Blue", "#5fa8e0"],
  ["purple", "Purple", "#5e35b1"],
  ["black", "Black", "#1c1c1c"],
  ["white", "White", "#f7f3ea"],
];

const DARK_TEXT = "#1a1a1a";
const LIGHT_TEXT = "#ffffff";

function channels(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** How bright a color looks (WCAG relative luminance, 0 = black, 1 = white). */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readability of one color on another (WCAG contrast ratio, 1–21; 4.5+ reads well for normal text). */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The color part-way toward white (amount 0–1), as #rrggbb. */
function mix(hex: string, toward: string, amount: number): string {
  const from = channels(hex), to = channels(toward);
  return `#${from.map((c, i) => Math.round(c + (to[i] - c) * amount).toString(16).padStart(2, "0")).join("")}`;
}

export const TEAM_COLORS: TeamColor[] = PALETTE.map(([id, name, base]) => {
  const text = contrast(base, LIGHT_TEXT) >= contrast(base, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  // Dark colors soften toward white; light ones deepen toward black.
  const secondary = text === LIGHT_TEXT ? mix(base, "#ffffff", 0.45) : mix(base, "#000000", 0.25);
  return { id, name, base, text, secondary };
});

export function teamColor(id: string | null | undefined): TeamColor | undefined {
  return TEAM_COLORS.find(color => color.id === id);
}
