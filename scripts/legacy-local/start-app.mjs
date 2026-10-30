// Runs the website locally against the SANITIZED maroon-legacy copy (architecture doc, step L7):
//   node scripts/legacy-local/start-app.mjs --confirm maroon-legacy      -> http://127.0.0.1:3998
// The child process gets a settings list built from scratch, not this terminal's: only basic system variables plus the
// local legacy API and keys. Every outbound setting (email, push, cron, Google Sheet / Scorekeeper, R2, OpenAI, Google
// Places ...) is forced to empty, so .env files cannot fill them in (Next.js never overrides a variable that is already
// set). V2 onboarding and account enforcement are off, so legacy accounts behave as they do on today's live site.
// It refuses to start unless the copy is sanitized and the API is exactly the local legacy stack.
import { spawn } from "node:child_process";
import { LEGACY, OUTBOUND_SETTINGS, confirmed, hostedTargetProblems, legacyApiProblems, outboundSettingsPresent } from "./guard.mjs";
import { legacyKeys, psqlLegacy } from "./local.mjs";

try {
  if (!confirmed(process.argv.slice(2))) throw new Error(`Type --confirm ${LEGACY.project} to start the app on the legacy copy.`);
  const state = psqlLegacy("select state from legacy_meta.restore_log order by restored_at desc limit 1;").trim();
  if (state !== "sanitized") throw new Error("The legacy copy is not sanitized. Run sanitize.mjs first.");
  const { api, serviceKey, anonKey } = legacyKeys();

  const env = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec", "NUMBER_OF_PROCESSORS"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    NODE_ENV: "development",
    SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_URL: api,
    SUPABASE_ANON_KEY: anonKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    MAROON_V2_ONBOARDING: "", MAROON_ACCOUNT_ENFORCEMENT: "",
    // Separate build folder, so it never clashes with another dev server's .next.
    NEXT_BUILD_OUTPUT: "out/next-legacy",
  });
  for (const key of OUTBOUND_SETTINGS) env[key] = "";

  const problems = [...legacyApiProblems(env.SUPABASE_URL), ...legacyApiProblems(env.NEXT_PUBLIC_SUPABASE_URL),
    ...hostedTargetProblems(env), ...outboundSettingsPresent(env).map((key) => `${key} is set`)];
  if (problems.length) throw new Error(problems.join("; "));

  console.log(`Starting the app on the legacy copy at http://127.0.0.1:${LEGACY.appPort} (API ${api}; email, push, cron and integrations off).`);
  console.log("Sign in as legacy-01@legacy.invalid ... with the test password. Emails land in the local inbox http://127.0.0.1:57324.");
  spawn("npx", ["--no-install", "next", "dev", "--port", String(LEGACY.appPort), "--hostname", "127.0.0.1"], { env, stdio: "inherit", shell: true })
    .on("exit", (code) => process.exit(code ?? 0));
} catch (error) {
  console.error(`APP NOT STARTED. ${error.message}`);
  process.exit(1);
}
