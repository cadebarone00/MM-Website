import { test } from "node:test";
import assert from "node:assert/strict";
import { platformAdminCheck } from "./platformAdmin.ts";

test("only a signed-in profile with platform_role exactly 'admin' passes", () => {
  assert.deepEqual(platformAdminCheck(null, "admin"), { status: "signed-out" });
  assert.deepEqual(platformAdminCheck("u1", "admin"), { status: "ok", userId: "u1" });
  for (const role of [null, "", "Admin", "ADMIN", "host", "organizer", " admin"]) assert.deepEqual(platformAdminCheck("u1", role), { status: "forbidden" }, String(role));
});
