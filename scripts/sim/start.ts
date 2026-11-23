import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { startFakeSupabase } from "../fake-supabase.mjs";
import { SIM_MIGRATIONS } from "../../lib/dev/sim/migrations";
import { checkPortsFree } from "../../lib/dev/sim/ports";
import { startFrontDoor } from "./frontDoor";

const DOOR_PORT = 3005;
const APP_PORT = 3006;
const FAKE_PORT = 3007;

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
    NEXT_BUILD_OUTPUT: ".next-sim",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  };
  delete env.MAROON_ACCOUNT_ENFORCEMENT;

  // Hard guard: the sim app may only ever be pointed at the local fake.
  if (!new RegExp(`^http://(127\.0\.0\.1|localhost):${FAKE_PORT}/?$`).test(String(env.SUPABASE_URL))) {
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
