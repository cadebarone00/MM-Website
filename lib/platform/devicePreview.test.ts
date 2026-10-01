import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREVIEW, DEVICE_PRESETS, parsePreviewSettings } from "./devicePreview.ts";

test("device presets match the Figma frames; iPhone 390 × 844 is the default", () => {
  assert.deepEqual([DEVICE_PRESETS.iphone.width, DEVICE_PRESETS.iphone.height], [390, 844]);
  assert.deepEqual([DEVICE_PRESETS.large.width, DEVICE_PRESETS.large.height], [430, 932]);
  assert.equal(DEVICE_PRESETS.responsive.width, null);
  assert.deepEqual(DEFAULT_PREVIEW, { device: "iphone", frame: true });
});

test("stored preview settings are validated, never trusted", () => {
  assert.deepEqual(parsePreviewSettings('{"device":"large","frame":false}'), { device: "large", frame: false });
  assert.deepEqual(parsePreviewSettings({ device: "responsive" }), { device: "responsive", frame: true });
  for (const bad of [null, "", "{nope", '{"device":"ipad","frame":"yes"}', 42, '{"device":"__proto__"}']) assert.deepEqual(parsePreviewSettings(bad), DEFAULT_PREVIEW, String(bad));
});
