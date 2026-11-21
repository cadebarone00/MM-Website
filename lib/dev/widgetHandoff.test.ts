import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWidgetHandoff, WIDGET_HANDOFF_DIR } from "./widgetHandoff";

test("handoff has the design sheet, 4 samples and a README", () => {
  const files = buildWidgetHandoff();
  assert.deepEqual(Object.keys(files).sort(), ["README.md", "design.json", "samples/live.json", "samples/long.json", "samples/next.json", "samples/nothing.json"]);
  const live = JSON.parse(files["samples/live.json"]);
  assert.equal(live.now, "2026-10-16T14:11");
  assert.equal(live.timeline[0].state, "live");
  assert.equal(JSON.parse(files["samples/nothing.json"]).timeline[0].state, "nothing");
  assert.equal(JSON.parse(files["design.json"]).iphoneSizes.pro.small.width, 158);
});

test("checked-in handoff files are up to date (run: npm run widget:handoff)", () => {
  for (const [name, content] of Object.entries(buildWidgetHandoff())) {
    const path = join(WIDGET_HANDOFF_DIR, name);
    assert.ok(existsSync(path), `${name} missing. Run: npm run widget:handoff`);
    assert.equal(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), content, `${name} is out of date. Run: npm run widget:handoff`);
  }
});
