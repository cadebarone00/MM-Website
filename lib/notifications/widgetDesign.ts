/**
 * The home screen widget's look: every color, font, spacing and box size in one place.
 * Spec: project_specs.md → "Widget handoff pack". The /dev preview reads these numbers, and
 * `npm run widget:handoff` writes them to docs/native/widget-handoff/design.json for the SwiftUI / Kotlin widgets.
 * Sizes are iPhone points (Android dp is close enough: Android resizes widgets freely).
 */

export const WIDGET_IPHONES = ["pro", "proMax"] as const;
export type WidgetIphone = (typeof WIDGET_IPHONES)[number];
export type WidgetBoxName = "small" | "medium" | "large" | "lockCircle" | "lockRect";
type Box = { width: number; height: number };
type TextStyle = { font: "Spectral" | "Barlow"; weight: number; size: number; lineHeight: number; uppercase?: boolean; letterSpacing?: number; opacity?: number };

export const WIDGET_DESIGN = {
  /** Apple's published widget sizes: regular phone (e.g. iPhone 15 Pro, 393 wide) and Max phone (430 wide). */
  iphoneSizes: {
    pro: { small: { width: 158, height: 158 }, medium: { width: 338, height: 158 }, large: { width: 338, height: 354 }, lockCircle: { width: 72, height: 72 }, lockRect: { width: 160, height: 72 } },
    proMax: { small: { width: 170, height: 170 }, medium: { width: 364, height: 170 }, large: { width: 364, height: 382 }, lockCircle: { width: 76, height: 76 }, lockRect: { width: 172, height: 76 } },
  } satisfies Record<WidgetIphone, Record<WidgetBoxName, Box>>,
  colors: {
    /** Background: a gradient from top-left to bottom-right. */
    backgroundTop: "#4a0f19",
    backgroundBottom: "#2c0910",
    text: "#fbf8f1",
    /** Top label and under-par hole scores. */
    gold: "#c9a86e",
    liveDot: "#e2554f",
    /** Divider lines and hole boxes are the text color at low opacity. */
    dividerOpacity: 0.12,
    holeBoxOpacity: 0.07,
    overParOpacity: 0.75,
  },
  /** Text styles, sizes in points. letterSpacing is in points too. */
  text: {
    label: { font: "Barlow", weight: 600, size: 10, lineHeight: 14, uppercase: true, letterSpacing: 0.8 },
    title: { font: "Spectral", weight: 600, size: 17, lineHeight: 20 },
    score: { font: "Spectral", weight: 700, size: 22, lineHeight: 25 },
    detail: { font: "Spectral", weight: 400, size: 13, lineHeight: 17, opacity: 0.8 },
    row: { font: "Spectral", weight: 400, size: 13, lineHeight: 16 },
    rowSmall: { font: "Barlow", weight: 500, size: 11, lineHeight: 11, opacity: 0.7 },
    holeScore: { font: "Spectral", weight: 700, size: 18, lineHeight: 20 },
    holeSmall: { font: "Barlow", weight: 500, size: 10, lineHeight: 10, opacity: 0.7 },
  } satisfies Record<string, TextStyle>,
  spacing: {
    padding: 14,
    /** Space between the main block and the extra block (rows / holes). */
    gap: 10,
    /** Medium: space on each side of the line between the left and right halves. */
    mediumColumnGap: 14,
    /** Space above the title, between the live dot and label, and inside a row (name ↔ score ↔ thru). */
    titleTop: 4,
    labelDotGap: 5,
    rowInnerGap: 8,
    rowGap: 7,
    holeGap: 8,
    holeBoxRadius: 10,
    holeBoxPaddingY: 6,
    liveDot: 6,
    /** iPhone draws its own widget corners; this is only for the preview. Android uses its own too. */
    cornerRadiusPreviewIos: 22,
    cornerRadiusPreviewAndroid: 28,
  },
} as const;

export function widgetBox(iphone: WidgetIphone, box: WidgetBoxName): Box {
  return WIDGET_DESIGN.iphoneSizes[iphone][box];
}

const px = (value: number) => `${value}px`;

/** CSS custom properties for the /dev preview, so it draws from the same numbers as the handoff. */
export function widgetCssVars(iphone: WidgetIphone): Record<string, string> {
  const sizes = WIDGET_DESIGN.iphoneSizes[iphone];
  const { colors, spacing, text } = WIDGET_DESIGN;
  const vars: Record<string, string> = {
    "--wd-bg-top": colors.backgroundTop, "--wd-bg-bottom": colors.backgroundBottom, "--wd-text": colors.text,
    "--wd-gold": colors.gold, "--wd-live-dot": colors.liveDot,
    "--wd-divider-opacity": String(colors.dividerOpacity), "--wd-hole-box-opacity": String(colors.holeBoxOpacity), "--wd-over-opacity": String(colors.overParOpacity),
    "--wd-padding": px(spacing.padding), "--wd-gap": px(spacing.gap), "--wd-medium-gap": px(spacing.mediumColumnGap),
    "--wd-row-gap": px(spacing.rowGap), "--wd-hole-gap": px(spacing.holeGap), "--wd-hole-radius": px(spacing.holeBoxRadius), "--wd-dot": px(spacing.liveDot),
    "--wd-title-top": px(spacing.titleTop), "--wd-dot-gap": px(spacing.labelDotGap), "--wd-row-inner-gap": px(spacing.rowInnerGap), "--wd-hole-pad": px(spacing.holeBoxPaddingY),
    "--wd-radius-ios": px(spacing.cornerRadiusPreviewIos), "--wd-radius-android": px(spacing.cornerRadiusPreviewAndroid),
  };
  for (const [name, box] of Object.entries(sizes)) {
    const key = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    vars[`--wd-${key}-w`] = px(box.width);
    vars[`--wd-${key}-h`] = px(box.height);
  }
  for (const [role, style] of Object.entries(text) as [string, TextStyle][]) {
    const key = role.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    vars[`--wd-${key}-size`] = px(style.size);
    vars[`--wd-${key}-line`] = px(style.lineHeight);
    vars[`--wd-${key}-weight`] = String(style.weight);
    vars[`--wd-${key}-opacity`] = String(style.opacity ?? 1);
  }
  return vars;
}
