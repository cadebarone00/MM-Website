import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import type { DriverAction, DriverResult } from "../lib/dev/sim/driver/types";
import { SAMPLE_COURSES } from "../lib/dev/sim/studio/courses";
import { PRESETS } from "../lib/dev/sim/studio/setup";
import { playScript } from "../lib/dev/sim/studio/script";
import { createRunner } from "../lib/dev/sim/studio/runner";
import type { Transport } from "../lib/dev/sim/studio/runner";

/**
 * A four-ball plays itself: the Studio's "play-fourball" script runs on four real phone pages (headless Chromium) through
 * the driver, then the simulator's own checks must all pass. Starts its OWN simulator on test ports (never touches the
 * usual 3005-3007 sim or the owner's 3001) and stops only that process tree.
 */

const DOOR = 3025, APP = 3026, FAKE = 3027;
const win = process.platform === "win32";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

function control(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port: DOOR, method, path, headers: { Host: `localhost:${DOOR}`, ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) } },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => { let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body: parsed }); });
      },
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => req.destroy(new Error(`Timed out: ${method} ${path}`)));
    if (data) req.write(data);
    req.end();
  });
}

let started: ChildProcess | null = null;
let browser: Browser | null = null;
function cleanup() {
  if (started?.pid) {
    if (win) spawnSync("taskkill", ["/pid", String(started.pid), "/T", "/F"], { stdio: "ignore" });
    else started.kill("SIGTERM");
  }
  started = null;
}
async function closeBrowser() { try { await browser?.close(); } catch { /* already gone */ } browser = null; }
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { cleanup(); process.exit(130); });
process.on("exit", cleanup);
process.on("uncaughtException", (e) => { console.error(`✘ ${e instanceof Error ? e.message : String(e)}`); cleanup(); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error(`✘ ${e instanceof Error ? e.message : String(e)}`); cleanup(); process.exit(1); });

async function startSim() {
  for (const p of [DOOR, APP, FAKE]) {
    if (!(await portFree(p))) throw new Error(`Port ${p} is busy. This test needs 3025, 3026 and 3027 free (it starts its own simulator there).`);
  }
  console.log("Starting a test simulator on 3025-3027 (first start can take a minute)…");
  let ready = false;
  const onData = (chunk: Buffer) => { if (chunk.toString().includes("Simulator ready")) ready = true; };
  const env = { ...process.env, SIM_DOOR_PORT: String(DOOR), SIM_APP_PORT: String(APP), SIM_FAKE_PORT: String(FAKE), SIM_BUILD_DIR: ".next-sim-alt" };
  started = win
    ? spawn("npx tsx scripts/sim/start.ts", { shell: true, stdio: ["ignore", "pipe", "pipe"], env })
    : spawn("npx", ["tsx", "scripts/sim/start.ts"], { stdio: ["ignore", "pipe", "pipe"], env });
  started.stdout?.on("data", onData);
  started.stderr?.on("data", onData);
  let exited = false;
  started.on("exit", () => { exited = true; });
  const deadline = Date.now() + 360_000;
  while (!ready) {
    if (exited) throw new Error("The test simulator stopped before it was ready.");
    if (Date.now() > deadline) throw new Error("The test simulator was not ready within 360 seconds.");
    await sleep(500);
  }
}

type PhoneState = {
  page: Page;
  pending: Map<string, (r: DriverResult | { reloaded: true }) => void>;
  awaiting: boolean; readyArrived: boolean;
  waiters: Set<() => void>;
};

/**
 * The Transport contract (runner.ts) over Playwright pages: the driver listens to postMessage on its own window.
 * The driver announces `ready` two animation frames AFTER its document's `load`, so a ready is kept only once a main-frame
 * `load` was seen (after an action went out, or after `go`/`expectLoad`). A stale ready from the OLD document (the driver
 * also announces after pushState/replaceState) therefore never counts.
 */
async function makeTransport(phones: Map<string, Page>): Promise<Transport & { expectLoad(phone: string): void }> {
  const states = new Map<string, PhoneState>();
  let counter = 0;
  for (const [key, page] of phones) {
    const s: PhoneState = { page, pending: new Map(), awaiting: false, readyArrived: false, waiters: new Set() };
    states.set(key, s);
    await page.exposeBinding("__simToNode", (_src, msg: any) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.sim === "done") {
        const fn = s.pending.get(msg.id);
        if (fn) { s.pending.delete(msg.id); fn(msg.result as DriverResult); }
      } else if (msg.sim === "ready") {
        if (s.awaiting) { s.awaiting = false; s.readyArrived = true; for (const w of [...s.waiters]) w(); }
      }
    });
    // The driver posts to window.parent, which is the page itself at top level; forward those to node.
    await page.addInitScript(() => {
      window.addEventListener("message", (e: MessageEvent) => {
        const d = e.data;
        if (d && typeof d === "object" && (d.sim === "done" || d.sim === "ready")) (window as any).__simToNode(d);
      });
    });
  }
  return {
    /** Call before a navigation the test makes itself: the next load's ready is then kept for ready(). */
    expectLoad(phone: string) {
      const s = states.get(phone)!;
      s.awaiting = false; s.readyArrived = false;
      s.page.once("load", () => { s.awaiting = true; s.readyArrived = false; });
    },
    act(phone, action: DriverAction) {
      const s = states.get(phone);
      if (!s) throw new Error(`No phone "${phone}".`);
      const id = `t${++counter}`;
      return new Promise((resolve) => {
        const finish = (r: DriverResult | { reloaded: true }) => { s.pending.delete(id); s.page.off("load", onLoad); resolve(r); };
        const onLoad = () => { s.awaiting = true; s.readyArrived = false; finish({ reloaded: true }); };
        const send = () => s.page.evaluate(([i, a]) => window.postMessage({ sim: "act", id: i, action: a }, "*"), [id, action] as const);
        if (action.kind === "go") {
          s.awaiting = false; s.readyArrived = false;
          s.page.once("load", () => { s.awaiting = true; s.readyArrived = false; });
          send().catch(() => { /* the page is already leaving */ });
          resolve({ ok: true });
          return;
        }
        s.pending.set(id, finish);
        s.page.on("load", onLoad);
        send().catch(() => { /* the document went away under the call: its load event reports the reload */ });
      });
    },
    ready(phone, timeoutMs) {
      const s = states.get(phone);
      if (!s) return Promise.resolve(false);
      if (s.readyArrived) { s.readyArrived = false; return Promise.resolve(true); }
      return new Promise((resolve) => {
        const wake = () => { clearTimeout(timer); s.waiters.delete(wake); s.readyArrived = false; resolve(true); };
        const timer = setTimeout(() => { s.waiters.delete(wake); resolve(false); }, timeoutMs);
        s.waiters.add(wake);
      });
    },
  };
}

type Check = { id: string; status: string; detail: string };
type Entry = { n: number; person: string | null; kind: string; text: string; ok: boolean };
const checks = async () => (await control("GET", "/__sim/checks")).body as Check[];
const logEntries = async () => (await control("GET", "/__sim/log?since=0")).body as Entry[];

async function waitChecks(required: string[], timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let rows: Check[] = [];
  while (Date.now() < deadline) {
    rows = await checks();
    const failed = rows.filter((r) => r.status === "fail");
    assert.equal(failed.length, 0, `Check failed: ${failed.map((r) => `${r.id}: ${r.detail}`).join("; ")}`);
    if (required.every((id) => rows.find((r) => r.id === id)?.status === "pass")) return rows;
    await sleep(1000);
  }
  assert.fail(`Checks not passing after ${timeoutMs / 1000} s: ${rows.filter((r) => r.status !== "pass" && r.id !== "deleted").map((r) => `${r.id} is ${r.status} (${r.detail})`).join("; ")}`);
}

async function assertLog() {
  const bad = (await logEntries()).filter((e) => e.kind === "unsupported" || (!e.ok && e.kind !== "note"));
  assert.equal(bad.length, 0, `Log has failing entries: ${bad.map((e) => `[${e.kind}] ${e.person ?? "-"} ${e.text}`).join("; ")}`);
}

/** One full four-ball: start the setup, open the phones, play the script. */
async function playOnce(delayMs: number, label: string): Promise<void> {
  const preset = PRESETS.find((p) => p.id === "play-fourball");
  assert.ok(preset, "play-fourball preset missing");
  const course = SAMPLE_COURSES.find((c) => c.ref === preset.setup.course);
  assert.ok(course, `Course ${preset.setup.course} not in SAMPLE_COURSES`);
  const res = await control("POST", "/__sim/custom", { setup: preset.setup });
  assert.equal(res.status, 200, `/__sim/custom → ${res.status} ${JSON.stringify(res.body)}`);

  const context = await browser!.newContext({ viewport: { width: 390, height: 780 } });
  try {
    const phones = new Map<string, Page>();
    for (const p of preset.setup.players) phones.set(p.key, await context.newPage());
    const transport = await makeTransport(phones);
    for (const p of preset.setup.players) {
      transport.expectLoad(p.key);
      await phones.get(p.key)!.goto(`http://${p.key}.localhost:${DOOR}/__sim/login?as=${p.key}&next=/`, { waitUntil: "load" });
    }
    // Wait for each phone's driver to announce its first screen (the login hop may load more than one document).
    for (const p of preset.setup.players) {
      const page = phones.get(p.key)!;
      let ok = await transport.ready(p.key, 60_000);
      for (let hops = 0; ok && /\/__sim\/login/.test(page.url()) && hops < 3; hops++) { transport.expectLoad(p.key); ok = await transport.ready(p.key, 60_000); }
      assert.ok(ok, `${p.name}'s phone never announced its first screen within 60 s (page at ${page.url()}).`);
    }
    const runner = createRunner(playScript(preset.setup, course), transport, { delayMs });
    await runner.playAll();
    const st = runner.state();
    assert.equal(st.status, "done", `${label}: the script stopped at step ${st.index} (${st.status}): ${st.message}`);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function main() {
  await startSim();
  browser = await chromium.launch({ headless: true });

  await playOnce(600, "main run");
  const rows = await waitChecks(["linked", "saved", "ended", "profile-once", "card-matches", "handicap"], 60_000);
  const notPassing = rows.filter((r) => r.status !== "pass" && r.id !== "deleted");
  assert.equal(notPassing.length, 0, `Checks not passing: ${notPassing.map((r) => `${r.id} is ${r.status} (${r.detail})`).join("; ")}`);
  await assertLog();
  console.log("✔ studio four-ball");

  // App race check (printed, never fails): the same four-ball with no pause between steps.
  try {
    await playOnce(0, "app race check");
    await sleep(5000);
    const once = (await checks()).find((r) => r.id === "profile-once");
    console.log(`app race check (delay 0): profile-once is ${once?.status ?? "missing"}${once ? ` (${once.detail})` : ""}`);
  } catch (e) {
    console.log(`app race check (delay 0): the run did not finish: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function shutdown() {
  await closeBrowser();
  const weStarted = started !== null;
  cleanup();
  if (!weStarted) return; // never started a sim (e.g. the ports were busy): nothing of ours to recheck
  await sleep(1500);
  const busy: number[] = [];
  for (const p of [DOOR, APP, FAKE]) if (!(await portFree(p))) busy.push(p);
  if (busy.length) console.error(`Warning: ports still busy after stopping: ${busy.join(", ")}`);
  else console.log("Test ports 3025-3027 are free again.");
}

main().then(
  async () => { await shutdown(); process.exit(0); },
  async (e) => { console.error(`✘ ${e instanceof Error ? e.message : String(e)}`); await shutdown(); process.exit(1); },
);
