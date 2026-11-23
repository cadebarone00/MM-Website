import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/**
 * One automated run per Play scenario, through the simulator's front door (port 3005) and the REAL app routes.
 * Uses a sim that is already running, or starts `npm run sim` itself (and then stops only what it started).
 * Each phone is <person>.localhost:3005; the front door signs that person in, so we only set the Host header.
 */

const DOOR = 3005;
const win = process.platform === "win32";

type Reply = { status: number; body: any };
function request(method: "GET" | "POST", path: string, host: string, body?: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port: DOOR, method, path, headers: { Host: host, ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) } },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let parsed: any = text;
          try { parsed = JSON.parse(text); } catch { /* not json */ }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => req.destroy(new Error(`Timed out: ${method} ${path}`)));
    if (data) req.write(data);
    req.end();
  });
}
const control = (method: "GET" | "POST", path: string, body?: unknown) => request(method, path, `localhost:${DOOR}`, body);
const as = (person: string, method: "GET" | "POST", path: string, body?: unknown) => request(method, path, `${person}.localhost:${DOOR}`, body);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function up(): Promise<boolean> {
  try { return (await control("GET", "/__sim/status")).status === 200; } catch { return false; }
}

let started: ChildProcess | null = null;
function stopStarted() {
  if (!started?.pid) return;
  if (win) spawnSync("taskkill", ["/pid", String(started.pid), "/T", "/F"], { stdio: "ignore" });
  else started.kill("SIGTERM");
  started = null;
}

async function ensureSim() {
  if (await up()) { console.log("Using the simulator that is already running."); return; }
  console.log("Starting the simulator (first start can take a minute)…");
  let ready = false;
  const onData = (chunk: Buffer) => { if (chunk.toString().includes("Simulator ready")) ready = true; };
  started = win ? spawn("npx tsx scripts/sim/start.ts", { shell: true, stdio: ["ignore", "pipe", "pipe"] }) : spawn("npx", ["tsx", "scripts/sim/start.ts"], { stdio: ["ignore", "pipe", "pipe"] });
  started.stdout?.on("data", onData);
  started.stderr?.on("data", onData);
  let exited = false;
  started.on("exit", () => { exited = true; });
  const deadline = Date.now() + 240_000;
  while (!ready) {
    if (exited) throw new Error("The simulator stopped before it was ready.");
    if (Date.now() > deadline) throw new Error("The simulator was not ready within 240 seconds.");
    await sleep(500);
  }
}

type Check = { id: string; status: string; detail: string };
type Entry = { n: number; person: string | null; kind: string; text: string; ok: boolean };

async function startScenario(id: string) {
  const res = await control("POST", "/__sim/scenario", { id });
  assert.equal(res.status, 200, `Could not start scenario ${id}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.scenario, id);
  return res.body as { phones: { person: string }[] };
}
async function reset(id: string) {
  const res = await control("POST", "/__sim/reset");
  assert.equal(res.status, 200, `Could not reset ${id}: ${JSON.stringify(res.body)}`);
}
const checks = async () => (await control("GET", "/__sim/checks")).body as Check[];
const logEntries = async () => (await control("GET", "/__sim/log?since=0")).body as Entry[];

async function waitFor(required: string[]) {
  const deadline = Date.now() + 60_000;
  let rows: Check[] = [];
  while (Date.now() < deadline) {
    rows = await checks();
    const failed = rows.filter((r) => r.status === "fail");
    assert.equal(failed.length, 0, `Check failed: ${failed.map((r) => `${r.id}: ${r.detail}`).join("; ")}`);
    if (required.every((id) => rows.find((r) => r.id === id)?.status === "pass")) return rows;
    await sleep(1000);
  }
  assert.fail(`Checks not passing after 60 s: ${rows.filter((r) => required.includes(r.id) && r.status !== "pass").map((r) => `${r.id} is ${r.status} (${r.detail})`).join("; ")}`);
}

async function assertLog() {
  const entries = await logEntries();
  const bad = entries.filter((e) => e.kind === "unsupported" || (!e.ok && e.kind !== "note"));
  assert.equal(bad.length, 0, `Log has failing entries: ${bad.map((e) => `[${e.kind}] ${e.person ?? "-"} ${e.text}`).join("; ")}`);
}

async function ok(person: string, path: string, body: unknown) {
  const res = await as(person, "POST", path, body);
  assert.equal(res.status, 200, `${person} POST ${path} ${JSON.stringify(body)} → ${res.status} ${JSON.stringify(res.body)}`);
}

/** Loads the round as a person, exactly as the phone does. */
async function loadRound(person: string, round: string) {
  const res = await as(person, "GET", `/api/rounds/shared/${round}`);
  assert.equal(res.status, 200, `${person} GET round → ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.round as {
    host: string; setup: any;
    players: { profileId: string; name: string; status: string }[];
  };
}

const strokesFor = (par: number[], offset: number) => par.map((p, i) => Math.max(1, p + ((i + offset) % 3 === 0 ? 1 : 0)));

async function roundId(): Promise<string> {
  // The scenario's round id is the id in Cam's first phone path; ask the app which round Cam is in via status pages.
  const status = (await control("GET", "/__sim/status")).body;
  const phone = status.phones.find((p: any) => p.person === "cam");
  const id = /round=([0-9a-f-]{36})/i.exec(phone?.startPath ?? "")?.[1];
  assert.ok(id, "Could not find the round id in Cam's phone path");
  return id;
}

/** Cam (the host) enters every player's and guest's strokes for all 18 holes, then submits like the real client. */
async function playAndSubmit(round: string) {
  const loaded = await loadRound("cam", round);
  const par: number[] = loaded.setup.course.par;
  const joined = loaded.players.filter((p) => p.status === "joined");
  const everyone = [loaded.host, ...joined.map((p) => p.profileId).filter((id) => id !== loaded.host)];
  for (let i = 0; i < everyone.length; i++) {
    const s = strokesFor(par, i);
    for (let h = 1; h <= 18; h++) await ok("cam", `/api/rounds/shared/${round}`, { action: "strokes", player: everyone[i], hole: h, strokes: s[h - 1] });
  }
  for (const g of (loaded.setup.guests ?? []) as { id: string }[]) {
    const s = strokesFor(par, 5);
    for (let h = 1; h <= 18; h++) await ok("cam", `/api/rounds/shared/${round}`, { action: "guestStrokes", guest: g.id, hole: h, strokes: s[h - 1] });
  }
  const mine = strokesFor(par, 0);
  const card = { strokes: mine, putts: mine.map(() => null), fairways: mine.map(() => null), greens: mine.map(() => null) };
  const res = await as("cam", "POST", "/api/rounds/personal", { setup: loaded.setup, card, startedAt: round });
  assert.equal(res.status, 200, `Submit → ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true, `Submit not ok: ${JSON.stringify(res.body)}`);
  for (const m of (res.body.members ?? []) as { name: string; saved: boolean }[]) assert.ok(m.saved, `Member ${m.name} was not saved`);
}

async function runPlay(id: string, required: string[], beforePlay?: (round: string) => Promise<void>) {
  await startScenario(id);
  await reset(id);
  const round = await roundId();
  if (beforePlay) await beforePlay(round);
  await playAndSubmit(round);
  await waitFor(required);
  await assertLog();
  console.log(`✔ ${id}`);
}

async function runDelete() {
  await startScenario("play-solo");
  await reset("play-solo");
  const round = await roundId();
  const loaded = await loadRound("cam", round);
  const par: number[] = loaded.setup.course.par;
  const s = strokesFor(par, 0);
  for (let h = 1; h <= 9; h++) await ok("cam", `/api/rounds/shared/${round}`, { action: "strokes", player: loaded.host, hole: h, strokes: s[h - 1] });
  await ok("cam", `/api/rounds/shared/${round}`, { action: "delete" });
  // After a delete only "linked" ("Round deleted") and "deleted" apply; the rest are "waiting" because there is no round to read. None may fail.
  await waitFor(["linked", "deleted"]);
  await assertLog();
  console.log("✔ play-solo delete");
}

async function main() {
  await ensureSim();
  await runPlay("play-solo", ["linked", "saved", "ended", "profile-once", "handicap"]);
  await runPlay("play-friends", ["linked", "saved", "ended", "profile-once", "handicap", "guest"], async (round) => {
    const res = await as("jake", "POST", `/api/rounds/shared/${round}`, { action: "join" });
    assert.equal(res.status, 200, `Jake join → ${res.status} ${JSON.stringify(res.body)}`);
  });
  await runPlay("play-unrated", ["linked", "saved", "ended", "profile-once", "handicap"]);
  await runDelete();
}

main().then(
  () => { stopStarted(); process.exit(0); },
  (e) => { console.error(`✘ ${e instanceof Error ? e.message : String(e)}`); stopStarted(); process.exit(1); },
);
