import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_HIGHLIGHTS } from "./builtIn.ts";
import type { HighlightConfig } from "./types.ts";
import { validateHighlightConfig } from "./validator.ts";

test("the built-in highlights load, pass the validator and have the four detector rules approved", () => {
  assert.ok(BUILT_IN_HIGHLIGHTS, "loads");
  const report = validateHighlightConfig(BUILT_IN_HIGHLIGHTS!, []);
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors.slice(0, 3)));
  const config: HighlightConfig = BUILT_IN_HIGHLIGHTS!;
  for (const id of ["HL-001", "HL-002", "HL-003", "HL-004"]) {
    const rule = config.rules.find((r) => r.id === id);
    assert.equal(rule?.status, "Approved", id);
    assert.ok(rule!.conditionals.every((c) => c.status === "Approved" && c.variations.some((v) => v.status === "Approved")), `${id} conditionals`);
  }
});
