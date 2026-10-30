// Which isolated local Supabase stack the auth scripts use. Default "test" = the original shared stack
// (project "maroon-auth-test", ports 55xxx, workdir out/auth-local). AUTH_LOCAL_STACK=main = a second, independent
// stack ("maroon-auth-main", ports 56xxx, workdir out/auth-local-main), so one checkout's tests never wipe or run
// against a stack another checkout built. Neither ever talks to a hosted project.
const STACKS = {
  test: { project: "maroon-auth-test", ports: "55", workdir: "out/auth-local" },
  main: { project: "maroon-auth-main", ports: "56", workdir: "out/auth-local-main" },
  // G4 sign-up gate (2026-10-30): its own stack with supabase/signup_gate.sql and the Before User Created hook switched
  // on (setup.mjs), so the shared stacks' suites, which sign up without an age pass, keep working. 57xxx is maroon-legacy.
  gate: { project: "maroon-auth-gate", ports: "58", workdir: "out/auth-local-gate" },
};

export function authLocalStack() {
  const name = process.env.AUTH_LOCAL_STACK || "test";
  const stack = STACKS[name];
  if (!stack) throw new Error(`Unknown AUTH_LOCAL_STACK "${name}" (use: ${Object.keys(STACKS).join(", ")})`);
  return {
    name, ...stack,
    dbContainer: `supabase_db_${stack.project}`,
    api: `http://127.0.0.1:${stack.ports}321`,
    mail: `http://127.0.0.1:${stack.ports}324`,
    /** scripts/auth-local/config.toml rewritten for this stack: its project id and its 5x3xx ports. */
    config: (text) => text.replace(/project_id = "maroon-auth-test"/, `project_id = "${stack.project}"`).replace(/\b55(\d{3})\b/g, `${stack.ports}$1`),
  };
}
