/**
 * Settings → Appearance → Colour scheme (project_specs.md "Colour schemes in Settings → Appearance", 2026-11-23).
 * Saved on the account (profile_preferences.color_scheme) and copied to the "scheme" cookie so the right colours show
 * from the first paint. The Maroon = no attribute; any other scheme sets <html data-scheme="…">, which
 * app/color-schemes.css (built from app/globals.css by `npm run build:schemes`) uses to swap the shared colour tokens.
 *
 * How a scheme recolours: every maroon / gold / cream token keeps its lightness (so text stays exactly as readable as
 * in The Maroon) and takes the scheme's hue and a matching amount of colour.
 */

export const COLOR_SCHEMES = [
  { id: "maroon", name: "The Maroon", deep: "#500001", accent: "#b8945a", paper: "#f5efe2" },
  { id: "green", name: "Clubhouse Green", deep: "#0b4d2c", accent: "#e8c547", paper: "#f6f3ea" },
  { id: "navy", name: "Links Navy", deep: "#14213d", accent: "#b33a3a", paper: "#f4f1ea" },
  { id: "desert", name: "Desert Resort", deep: "#b5562f", accent: "#2f7d7a", paper: "#faf3e8" },
  { id: "rivalry", name: "Rivalry Cup", deep: "#1d3b6e", accent: "#c8102e", paper: "#ffffff" },
  { id: "midnight", name: "Midnight", deep: "#0f1115", accent: "#c9a86e", paper: "#eef0f3" },
  { id: "stone", name: "Stone", deep: "#2b2a27", accent: "#8a7f6a", paper: "#faf9f6" },
] as const;
export type ColorSchemeId = (typeof COLOR_SCHEMES)[number]["id"];
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export const DEFAULT_COLOR_SCHEME: ColorSchemeId = "maroon";
export const SCHEME_COOKIE = "scheme";

export const isColorSchemeId = (value: unknown): value is ColorSchemeId => COLOR_SCHEMES.some((s) => s.id === value);
/** The cookie's (or saved) value as a scheme, or The Maroon. */
export const colorScheme = (value: unknown): ColorSchemeId => isColorSchemeId(value) ? value : DEFAULT_COLOR_SCHEME;
/** The value for <html data-scheme>: nothing for The Maroon. */
export const schemeAttribute = (id: ColorSchemeId): string | undefined => id === DEFAULT_COLOR_SCHEME ? undefined : id;

/** In the browser: recolour now and remember it on this device for a year (the account is the real copy). */
export function applyScheme(id: ColorSchemeId) {
  const attribute = schemeAttribute(id);
  if (attribute) document.documentElement.setAttribute("data-scheme", attribute); else document.documentElement.removeAttribute("data-scheme");
  document.cookie = `${SCHEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
}

// ---------------------------------------------------------------- Colour maths (OKLCH: lightness, chroma, hue)

type Lch = { l: number; c: number; h: number };

const toLinear = (n: number) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const fromLinear = (n: number) => n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055;

export function hexToOklch(hex: string): Lch {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}

/** Linear sRGB for an OKLCH colour (may be outside 0–1 when the colour can't be shown). */
function oklchToLinear({ l: L, c, h }: Lch): number[] {
  const A = c * Math.cos(h * Math.PI / 180), B = c * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}

/** OKLCH → hex. Too much colour for a screen to show is turned down until it fits, keeping lightness and hue. */
export function oklchToHex(color: Lch): string {
  const fits = (c: number) => oklchToLinear({ ...color, c }).every((n) => n >= -0.0001 && n <= 1.0001);
  let c = color.c;
  if (!fits(c)) {
    let low = 0, high = c;
    for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
    c = low;
  }
  return "#" + oklchToLinear({ ...color, c }).map((n) => Math.round(Math.min(1, Math.max(0, fromLinear(n))) * 255).toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- One Maroon colour → the same role in a scheme

type Family = "deep" | "accent" | "paper";
const MAROON = COLOR_SCHEMES[0];
const inHue = (h: number, from: number, to: number) => from <= to ? h >= from && h <= to : h >= from || h <= to;

/** Which role a Maroon colour plays, or null for colours a scheme leaves alone (greys, greens, error pinks…). */
export function colorFamily(name: string, hex: string): Family | null {
  if (name.startsWith("--color-maroon-") || name.startsWith("--brand-")) return "deep";
  if (name.startsWith("--color-gold-")) return "accent";
  const { l, c, h } = hexToOklch(hex);
  if (l >= 0.84 && c < 0.045) return "paper";
  if (c < 0.01) return null;
  if (inHue(h, 50, 110) && c >= 0.045) return "accent";
  if (inHue(h, 330, 50) && l < 0.5) return "deep";
  return null;
}

/** The Maroon colour as it looks in this scheme: same lightness, the scheme's hue, colour scaled to the scheme's. */
export function schemeColor(hex: string, family: Family, scheme: ColorScheme): string {
  const from = hexToOklch(hex), ref = hexToOklch(MAROON[family]), target = hexToOklch(scheme[family]);
  return oklchToHex({ l: from.l, c: ref.c > 0 ? from.c * target.c / ref.c : 0, h: target.h });
}

// ---------------------------------------------------------------- app/color-schemes.css

/** Only these tokens are recoloured; everything else (ink greys, fairway green, score colours) stays put. */
const SCHEMED_TOKEN = /^--(color-(maroon|gold|cream)|brand|lm)-/;

/** The same selector, only when this scheme is picked (one step more specific, so the original order still holds). */
function schemedSelector(selector: string, id: string): string {
  const html = `html[data-scheme="${id}"]`;
  return selector.split(",").map((part) => part.trim()).map((part) =>
    part === ":root" || part === "@theme" ? html : part.startsWith("html") ? html + part.slice(4) : `${html} ${part}`).join(", ");
}

/** Every globals.css rule that sets a maroon / gold / cream token to a hex colour, repeated per scheme with its colours. */
export function buildSchemeCss(globalsCss: string): string {
  const rules: { selector: string; tokens: [string, string][] }[] = [];
  for (const [, selector, body] of globalsCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const tokens = [...body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map(([, name, hex]) => [name, hex.toLowerCase()] as [string, string])
      .filter(([name]) => SCHEMED_TOKEN.test(name));
    if (tokens.length) rules.push({ selector: selector.trim(), tokens });
  }
  const out = ["/* GENERATED by `npm run build:schemes` from app/globals.css and lib/theme/colorSchemes.ts. Don't edit by hand. */"];
  for (const scheme of COLOR_SCHEMES.slice(1)) {
    out.push("", `/* ${scheme.name} */`);
    for (const { selector, tokens } of rules) {
      const changed = tokens.map(([name, hex]) => { const family = colorFamily(name, hex); return family ? `${name}:${schemeColor(hex, family, scheme)};` : ""; }).join("");
      if (changed) out.push(`${schemedSelector(selector, scheme.id)}{${changed}}`);
    }
  }
  return out.join("\n") + "\n";
}
