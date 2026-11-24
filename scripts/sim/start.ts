import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { startFakeSupabase } from "../fake-supabase.mjs";
import { SIM_MIGRATIONS } from "../../lib/dev/sim/migrations";
import { checkPortsFree } from "../../lib/dev/sim/ports";
import { startFrontDoor } from "./frontDoor";

// SIM_DOOR_PORT / SIM_APP_PORT / SIM_FAKE_PORT / SIM_BUILD_DIR run a second simulator next to the usual one (defaults unchanged).
function portFrom(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) { console.error(`${name}=${raw} isn't a usable port (a whole number from 1024 to 65535).`); process.exit(1); }
  if (n === 3001) { console.error(`${name}=3001 is the owner's dev server. Pick another port.`); process.exit(1); }
  return n;
}
const DOOR_PORT = portFrom("SIM_DOOR_PORT", 3005);
const APP_PORT = portFrom("SIM_APP_PORT", 3006);
const FAKE_PORT = portFrom("SIM_FAKE_PORT", 3007);
const BUILD_DIR = process.env.SIM_BUILD_DIR || ".next-sim";
if (!/^\.next-sim[a-z0-9-]*$/.test(BUILD_DIR)) { console.error(`SIM_BUILD_DIR=${BUILD_DIR} must start with .next-sim (e.g. .next-sim-alt).`); process.exit(1); }
if (new Set([DOOR_PORT, APP_PORT, FAKE_PORT]).size !== 3) { console.error("SIM_DOOR_PORT, SIM_APP_PORT and SIM_FAKE_PORT must be three different ports."); process.exit(1); }

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("The simulator is dev only. It will not run with NODE_ENV=production.");
    process.exit(1);
  }
  const busy = await checkPortsFree([DOOR_PORT, APP_PORT, FAKE_PORT]);
  if (busy !== null) {
    console.error(`Port ${busy} is in use (maybe the other agent's server). Stop it or change SIM ports.`);
    process.exit(1);
  }

  const holder = { current: await startFakeSupabase({ port: FAKE_PORT, migrations: SIM_MIGRATIONS }) };
  // The front door takes the clean base snapshot and restarts the fake so its log hook is attached.
  const door = await startFrontDoor({ port: DOOR_PORT, appPort: APP_PORT, fake: holder });

  // The sim app only ever talks to the fake. Empty NEXT_PUBLIC_* values are set explicitly (see report).
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_URL: holder.current.url,
    SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    NEXT_BUILD_OUTPUT: BUILD_DIR,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  };
  delete env.MAROON_ACCOUNT_ENFORCEMENT;

  // Next fills any key that is undefined from .env, so every key that reaches a real outside service is set to "" here.
  // Names only: R2 (files), Google Places/Maps, email, web push, Instagram, the Python API, the live feed, OpenAI, YouTube.
  const BLANK_PREFIXES = ["R2_", "WEB_PUSH_", "NEXT_PUBLIC_WEB_PUSH_", "INSTAGRAM_", "PYTHON_API_", "OPENAI_", "GOOGLE_OAUTH_"];
  const BLANK_NAMES = ["GOOGLE_PLACES_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "RESEND_API_KEY", "LIVE_FEED_URL", "MAROON_V2_ONBOARDING",
    "SCOREKEEPER_SERVER_SECRET", "CRON_SECRET", "NEXT_PUBLIC_YOUTUBE_LIVE_VIDEO_ID"];
  const realCourses = process.env.SIM_REAL_COURSE_API === "1";
  if (!realCourses) BLANK_NAMES.push("GOLF_COURSE_API_KEY");
  const envFileKeys: string[] = [];
  for (const file of [".env", ".env.local", ".env.development", ".env.example"]) {
    try { for (const line of readFileSync(file, "utf8").split(/\r?\n/)) { const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)=/.exec(line); if (m) envFileKeys.push(m[1]); } } catch { /* file not there */ }
  }
  for (const key of new Set([...envFileKeys, ...Object.keys(process.env), ...BLANK_NAMES])) {
    if (BLANK_NAMES.includes(key) || BLANK_PREFIXES.some((p) => key.startsWith(p))) env[key] = "";
  }
  console.log(realCourses ? "Course search is ON (real GolfCourseAPI key, SIM_REAL_COURSE_API=1)." : "Course search is OFF (set SIM_REAL_COURSE_API=1 to use the real key).");

  // Hard guard: the sim app may only ever be pointed at the local fake.
  if (!new RegExp(String.raw`^http://(127\.0\.0\.1|localhost):${FAKE_PORT}/?$`).test(String(env.SUPABASE_URL))) {
    console.error(`Refusing to start: SUPABASE_URL (${env.SUPABASE_URL}) is not the local fake on port ${FAKE_PORT}.`);
    await door.close().catch(() => undefined);
    await holder.current.close().catch(() => undefined);
    process.exit(1);
  }
  (env as Record<string, string | undefined>).NODE_ENV = "development";

  const win = process.platform === "win32";
  let next: ChildProcess | null = null;
  let stopping = false;
  async function shutdown(reason: string, code: number) {
    if (stopping) return;
    stopping = true;
    console.log(reason);
    if (next && next.pid && next.exitCode === null) {
      if (win) spawnSync("taskkill", ["/pid", String(next.pid), "/T", "/F"], { stdio: "ignore" });
      else next.kill("SIGTERM");
    }
    await door.close().catch(() => undefined);
    await holder.current.close().catch(() => undefined);
    process.exit(code);
  }
  process.on("SIGINT", () => void shutdown("Stopping the simulator...", 0));
  process.on("SIGTERM", () => void shutdown("Stopping the simulator...", 0));

  console.log("Starting the simulator app (first start can take a minute)…");
  const child: ChildProcess = win
    ? spawn(`npx next dev -p ${APP_PORT}`, { env, stdio: "inherit", shell: true })
    : spawn("npx", ["next", "dev", "-p", String(APP_PORT)], { env, stdio: "inherit" });
  next = child;
  child.on("error", (e) => void shutdown(`Could not start the simulator app: ${e.message}`, 1));
  child.on("exit", (code) => void shutdown(`The simulator app (next dev) stopped on its own (exit ${code}).`, code ?? 1));

  // Any HTTP answer means it is up. Give up after 90 s.
  const deadline = Date.now() + 90_000;
  while (!stopping) {
    try {
      await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(3000) });
      break;
    } catch {
      if (Date.now() > deadline) return void shutdown("The simulator app did not answer within 90 seconds.", 1);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (stopping) return;
  console.log("Simulator ready → open http://localhost:3001/dev and pick Simulators → Scoring (needs your normal npm run dev on 3001)");
}

main().catch((e) => { console.error(e); process.exit(1); });
