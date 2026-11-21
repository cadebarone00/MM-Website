/** Writes the widget handoff files to docs/native/widget-handoff/ (spec: "Widget handoff pack"). Run: npm run widget:handoff */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildWidgetHandoff, WIDGET_HANDOFF_DIR } from "../lib/dev/widgetHandoff";

for (const [name, content] of Object.entries(buildWidgetHandoff())) {
  const path = join(WIDGET_HANDOFF_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote docs/native/widget-handoff/${name}`);
}
