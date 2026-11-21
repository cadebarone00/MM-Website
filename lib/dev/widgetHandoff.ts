/**
 * DEV ONLY: builds the widget handoff files for Xcode / Android Studio (spec: "Widget handoff pack").
 * `npm run widget:handoff` writes them to docs/native/widget-handoff/; a test fails when they're out of date.
 */
import { join } from "node:path";
import { widgetTimeline } from "@/lib/notifications/widget";
import { WIDGET_DESIGN } from "@/lib/notifications/widgetDesign";
import { sampleWidgetItems, WIDGET_SAMPLE_NOW, WIDGET_STATES } from "./sampleWidget";

export const WIDGET_HANDOFF_DIR = join(process.cwd(), "docs", "native", "widget-handoff");

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const README = `# Home screen widget: handoff for SwiftUI (iPhone) and Kotlin (Android)

Made by \`npm run widget:handoff\`. Don't edit these files by hand: change \`lib/notifications/widgetDesign.ts\`
(the look) or \`lib/notifications/widget.ts\` (the words), then run the command again.

Check the look first in the dev simulator: \`/dev\` → Notifications → Home screen widget.

## Files

- \`design.json\`: every color, font, spacing and box size. Sizes are iPhone points.
- \`samples/*.json\`: the exact snapshots the dev preview shows. \`now\` is the clock time of the example,
  \`timeline\` is what the app saves for the widget. Use them in Xcode's widget preview.
  - \`nothing\`: no rounds. \`next\`: a round coming up. \`live\`: a round being played. \`long\`: live with very long names.

## The snapshot

The app saves a list of snapshots (\`timeline\`). Each one has \`at\`, the trip-local time it starts showing.
Show the newest one whose \`at\` has passed. That's how "In 2 days" turns into "Tomorrow" and "Now"
without the app opening. In WidgetKit, each snapshot becomes one timeline entry.

Tapping anywhere on the widget opens \`link\` inside the app.

## What goes where

| Field | Small | Medium | Large | Style in design.json |
|---|---|---|---|---|
| \`eyebrow\` | top line (red dot first when \`state\` is \`live\`) | same | same | \`text.label\`, \`colors.gold\` |
| \`title\` | 2nd line | same | same | \`text.title\` |
| \`line1\` | bottom, big | same | under the title | \`text.score\` |
| \`line2\` | under \`line1\` | same | same | \`text.detail\` |
| \`group\` (live) | — | right half, up to 4 rows | under a divider, up to 4 rows | \`text.row\` + \`text.rowSmall\` |
| \`upcoming\` (not live) | — | right half, 2 rows | under a divider, 4 rows | \`text.row\` + \`text.rowSmall\` |
| \`holes\` (live) | — | — | 3 boxes at the bottom | \`text.holeScore\` + \`text.holeSmall\` |

When \`state\` is \`nothing\` and there are no \`upcoming\` rows, Medium and Large show one row: "Start a round" with a "+".

Hole score color: under par = \`colors.gold\`, par = \`colors.text\`, over par = text at \`colors.overParOpacity\`.

Every text line is one line. When it's too long it ends in "…" (\`lineLimit(1)\` + \`truncationMode(.tail)\`).
Each size is one fixed box. Only the words change between states, never the layout.

## Lock screen (iPhone only)

\`lock.inline\`: the line by the date. \`lock.circle\`: the circle (show the app icon when empty).
\`lock.rect\`: the rectangle, two lines. iPhone draws these in its own system font and tint.
Android has no lock screen widgets. Its Live Update covers that.

## Before building in Xcode

- Add Spectral and Barlow font files to the widget extension target, or the widget falls back to the system font.
- iPhone draws its own widget corners and margins (\`containerBackground\`). The corner numbers are only for the preview.
- Check the exact widget sizes on the iPhone 17 Pro in Xcode. design.json has Apple's sizes for the regular and Max phones.
`;

/** File name (inside the handoff folder) → contents. */
export function buildWidgetHandoff(): Record<string, string> {
  const files: Record<string, string> = { "design.json": json(WIDGET_DESIGN), "README.md": README };
  for (const sample of WIDGET_STATES) {
    files[`samples/${sample}.json`] = json({ sample, now: WIDGET_SAMPLE_NOW, timeline: widgetTimeline(sampleWidgetItems(sample), WIDGET_SAMPLE_NOW) });
  }
  return files;
}
