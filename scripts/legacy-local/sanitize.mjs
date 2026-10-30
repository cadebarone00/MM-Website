// Sanitizes the restored LOCAL maroon-legacy copy (architecture doc, step L4): runs sanitize-legacy.sql inside the local
// container as one transaction. See that file for exactly what is removed, replaced, disabled and kept.
//   LEGACY_TEST_PASSWORD=<12+ characters, typed in this terminal>  node scripts/legacy-local/sanitize.mjs --confirm maroon-legacy
// The test password becomes the password of every legacy test login. It is never printed or written to a file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGACY, confirmed } from "./guard.mjs";
import { psqlLegacy } from "./local.mjs";

try {
  if (!confirmed(process.argv.slice(2))) throw new Error(`Type --confirm ${LEGACY.project} to sanitize the local legacy copy.`);
  const password = process.env.LEGACY_TEST_PASSWORD ?? "";
  if (password.length < 12) throw new Error("Set LEGACY_TEST_PASSWORD (12+ characters) in this terminal first.");
  const sql = readFileSync(join(process.cwd(), "scripts", "legacy-local", "sanitize-legacy.sql"), "utf8");
  const out = psqlLegacy(sql, { user: "supabase_admin", vars: { test_password: password } });
  console.log(out.trim());
  const state = psqlLegacy("select state from legacy_meta.restore_log order by restored_at desc limit 1;").trim();
  if (state !== "sanitized") throw new Error(`Sanitize did not finish (state: ${state || "none"}).`);
  console.log(`Sanitized. Testers sign in as legacy-01@legacy.invalid ... with the test password. Next: node scripts/legacy-local/rehearse-reset.mjs --confirm ${LEGACY.project}`);
} catch (error) {
  console.error(`SANITIZE STOPPED (nothing was changed if the SQL failed: it runs as one transaction). ${error.message}`);
  process.exit(1);
}
