import { test } from "node:test";
import assert from "node:assert/strict";
import { iphonePreviewEnabled, isIphonePreviewPath } from "./iphonePreview";

test("iPhone canvas requires development and explicit opt-in; deployment flags fail closed", () => {
  const enabled = { NODE_ENV: "development", DEV_IPHONE_PREVIEW: "true" };
  assert.equal(iphonePreviewEnabled(enabled), true);
  for (const NODE_ENV of ["production", "test", undefined]) assert.equal(iphonePreviewEnabled({ ...enabled, NODE_ENV }), false);
  for (const DEV_IPHONE_PREVIEW of [undefined, "false", "1"]) assert.equal(iphonePreviewEnabled({ ...enabled, DEV_IPHONE_PREVIEW }), false);
  for (const flag of ["VERCEL", "NETLIFY", "AWS_APP_ID", "CI"]) assert.equal(iphonePreviewEnabled({ ...enabled, [flag]: "1" }), false);
});
test("preview namespace cannot match lookalike app or API paths", () => {
  assert.equal(isIphonePreviewPath("/dev-iphone"), true);
  assert.equal(isIphonePreviewPath("/dev-iphone/unknown"), true);
  for (const path of ["/dev", "/dev-iphone-other", "/api/dev-iphone", "/profile", "/"]) assert.equal(isIphonePreviewPath(path), false);
});
