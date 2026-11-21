import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDGET_DESIGN, WIDGET_IPHONES, widgetBox, widgetCssVars } from "./widgetDesign.ts";

test("iPhone widget boxes use Apple's published point sizes", () => {
  assert.deepEqual(WIDGET_IPHONES, ["pro", "proMax"]);
  assert.deepEqual(widgetBox("pro", "small"), { width: 158, height: 158 });
  assert.deepEqual(widgetBox("pro", "medium"), { width: 338, height: 158 });
  assert.deepEqual(widgetBox("pro", "large"), { width: 338, height: 354 });
  assert.deepEqual(widgetBox("proMax", "small"), { width: 170, height: 170 });
  assert.deepEqual(widgetBox("proMax", "medium"), { width: 364, height: 170 });
  assert.deepEqual(widgetBox("proMax", "large"), { width: 364, height: 382 });
  assert.deepEqual(widgetBox("pro", "lockCircle"), { width: 72, height: 72 });
  assert.deepEqual(widgetBox("proMax", "lockRect"), { width: 172, height: 76 });
});

test("every text style uses our fonts with a size and weight", () => {
  for (const [role, style] of Object.entries(WIDGET_DESIGN.text)) {
    assert.ok(["Spectral", "Barlow"].includes(style.font), role);
    assert.ok(style.size > 0 && style.weight >= 400, role);
  }
  assert.equal(WIDGET_DESIGN.text.label.uppercase, true);
});

test("css vars carry the design numbers into the /dev preview", () => {
  const vars = widgetCssVars("proMax");
  assert.equal(vars["--wd-small-w"], "170px");
  assert.equal(vars["--wd-large-h"], "382px");
  assert.equal(vars["--wd-padding"], `${WIDGET_DESIGN.spacing.padding}px`);
  assert.equal(vars["--wd-bg-top"], WIDGET_DESIGN.colors.backgroundTop);
  assert.equal(vars["--wd-title-size"], `${WIDGET_DESIGN.text.title.size}px`);
});
