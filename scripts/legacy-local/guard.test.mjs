// node --test scripts/legacy-local/guard.test.mjs   (unit tests for the legacy-copy safety rules; no network, no Docker)
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY, confirmed, hostedTargetProblems, legacyApiProblems, outboundSettingsPresent, safeBackupDir } from "./guard.mjs";

test("production, maroon-auth-dev and any hosted Supabase address are refused", () => {
  assert.equal(hostedTargetProblems({ SUPABASE_URL: "https://msvrbifhdvltibafzrdb.supabase.co" }).length, 2);
  assert.match(hostedTargetProblems({ DB: "postgres://x@db.llqqddiundaptmsgccwj.supabase.co:5432/postgres" })[0], /maroon-auth-dev/);
  assert.match(hostedTargetProblems({ URL: "https://someotherref.supabase.co" })[0], /hosted Supabase/);
  assert.match(hostedTargetProblems({ URL: "postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/db" })[0], /hosted Supabase/);
  assert.deepEqual(hostedTargetProblems({ SUPABASE_URL: LEGACY.api, EMPTY: "" }), []);
});

test("the legacy app may only use the local legacy API", () => {
  assert.deepEqual(legacyApiProblems("http://127.0.0.1:57321"), []);
  for (const url of ["http://127.0.0.1:55321", "http://localhost:57321", "https://msvrbifhdvltibafzrdb.supabase.co", ""]) {
    assert.equal(legacyApiProblems(url).length, 1, url);
  }
});

test("any outbound setting with a value is reported; empty ones are fine", () => {
  assert.deepEqual(outboundSettingsPresent({ RESEND_API_KEY: "re_x", CRON_SECRET: " ", LIVE_FEED_URL: "", OTHER: "x" }), ["RESEND_API_KEY"]);
});

test("backups must be absolute, outside Git and outside synced folders", () => {
  const none = () => false;
  assert.throws(() => safeBackupDir("", {}, none), /Set MAROON_BACKUP_DIR/);
  assert.throws(() => safeBackupDir("backups", {}, none), /absolute/);
  assert.throws(() => safeBackupDir("C:\\Users\\Owner\\OneDrive\\Backups", {}, none), /cloud-synced/);
  assert.throws(() => safeBackupDir("C:\\Users\\Owner\\Dropbox\\maroon", {}, none), /cloud-synced/);
  assert.throws(() => safeBackupDir("E:\\Sync\\Maroon", { OneDrive: "E:\\Sync" }, none), /inside OneDrive/);
  const gitAt = (p) => p.replace(/\\/g, "/").toLowerCase() === "c:/users/owner/documents/github/mm-website-authdev/.git";
  assert.throws(() => safeBackupDir("C:\\Users\\Owner\\Documents\\GitHub\\MM-Website-authdev\\out\\backups", {}, gitAt), /Git working copy/);
  assert.match(safeBackupDir("D:\\MaroonBackups", { OneDrive: "C:\\Users\\Owner\\OneDrive" }, none), /MaroonBackups$/);
});

test("destructive commands need --confirm maroon-legacy", () => {
  assert.equal(confirmed(["start", "--confirm", "maroon-legacy"]), true);
  assert.equal(confirmed(["start", "--confirm", "maroon-auth-test"]), false);
  assert.equal(confirmed(["start"]), false);
});
