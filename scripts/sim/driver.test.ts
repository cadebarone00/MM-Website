import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import type { DriverAction, DriverResult } from "../../lib/dev/sim/driver/types";

let browser: Browser;
let bundle = "";
let clientBundle = "";

before(async () => {
  const out = await build({
    entryPoints: [path.resolve("lib/dev/sim/driver/actions.ts")],
    bundle: true, write: false, format: "iife", platform: "browser", globalName: "SimActions",
  });
  bundle = out.outputFiles[0].text;
  clientBundle = (await build({
    entryPoints: [path.resolve("lib/dev/sim/driver/client.ts")],
    bundle: true, write: false, format: "iife", platform: "browser",
    define: { __SIM_CONTROL_ORIGIN__: JSON.stringify("http://localhost:3001") },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });

async function pageWith(html: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(html);
  await page.addScriptTag({ content: bundle });
  return page;
}
const run = (page: Page, action: DriverAction): Promise<DriverResult> =>
  page.evaluate((a) => (window as any).SimActions.runAction(document, a), action as any);

test("tap finds a button by text and clicks it", async () => {
  const page = await pageWith(`<button onclick="document.title='clicked'">Accept</button><button>Decline</button>`);
  const r = await run(page, { kind: "tap", target: { text: "Accept" } });
  assert.deepEqual(r, { ok: true });
  assert.equal(await page.title(), "clicked");
  await page.close();
});

test("two matches is ambiguous unless within narrows it", async () => {
  const page = await pageWith(`
    <div data-sim="a">Alice <button onclick="document.title='alice'">Next</button></div>
    <div data-sim="b">Bob <button onclick="document.title='bob'">Next</button></div>`);
  const amb = await run(page, { kind: "tap", target: { text: "Next" } });
  assert.equal(amb.ok, false);
  if (!amb.ok) { assert.equal(amb.reason, "ambiguous"); assert.match(amb.message, /2 matches for "Next"/); assert.match(amb.seen, /Alice/); }
  assert.equal(await page.title(), "");
  const ok = await run(page, { kind: "tap", target: { text: "Next", within: { sim: "b" } } });
  assert.deepEqual(ok, { ok: true });
  assert.equal(await page.title(), "bob");
  // hidden duplicates are ignored
  await page.setContent(`<button onclick="document.title='vis'">Go</button><button style="display:none">Go</button>`);
  assert.deepEqual(await run(page, { kind: "tap", target: { text: "Go" } }), { ok: true });
  assert.equal(await page.title(), "vis");
  await page.close();
});

test("type updates a React-style controlled input", async () => {
  const page = await pageWith(`<label for="n">Strokes</label><input id="n" value="">
    <script>
      const el = document.getElementById("n"); window.seen = [];
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      const tracker = { v: "" };
      // React's value tracker: an own-property accessor. Assigning el.value= updates it silently (no change seen).
      Object.defineProperty(el, "value", { get() { return d.get.call(el); }, set(x) { tracker.v = String(x); d.set.call(el, x); }, configurable: true });
      el.addEventListener("input", () => { const now = d.get.call(el); if (now !== tracker.v) { tracker.v = now; window.seen.push(now); } });
    </script>`);
  const r = await run(page, { kind: "type", target: { label: "Strokes" }, text: "4" });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(await page.evaluate(() => (window as any).seen), ["4"]);
  assert.equal(await page.inputValue("#n"), "4");
  await page.close();
});

test("waitFor times out with what the page showed", async () => {
  const page = await pageWith(`<p>Hole 3 of 18</p>`);
  const r = await run(page, { kind: "waitFor", target: { text: "Finish" }, timeoutMs: 300 });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.reason, "timeout"); assert.match(r.seen, /Hole 3 of 18/); }
  await page.close();
});

test("waitFor succeeds when the target appears later, and absent waits for it to go", async () => {
  const page = await pageWith(`<div id="box"></div><script>
    setTimeout(() => { document.getElementById("box").innerHTML = "<button>Later</button>"; }, 250);
    setTimeout(() => { document.getElementById("box").innerHTML = ""; }, 900);</script>`);
  assert.deepEqual(await run(page, { kind: "waitFor", target: { text: "Later" }, timeoutMs: 2000 }), { ok: true });
  assert.deepEqual(await run(page, { kind: "absent", target: { text: "Later" }, timeoutMs: 3000 }), { ok: true });
  await page.close();
});

test("disabled button is reported, not clicked", async () => {
  const page = await pageWith(`<button disabled onclick="document.title='clicked'">Submit</button>`);
  const r = await run(page, { kind: "tap", target: { text: "Submit" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "disabled");
  assert.equal(await page.title(), "");
  await page.close();
});

test("a wrapper around the match is not ambiguous (innermost wins)", async () => {
  const page = await pageWith(`<a href="#x"><button onclick="document.title='inner'">Next</button></a>`);
  assert.deepEqual(await run(page, { kind: "tap", target: { text: "Next" } }), { ok: true });
  assert.equal(await page.title(), "inner");
  await page.close();
});

test("a covered button fails red instead of tapping the cover", async () => {
  const page = await pageWith(`<button onclick="document.title='clicked'">Save</button>
    <div data-sim="veil" style="position:fixed;inset:0;background:#fff8">Loading</div>`);
  const r = await run(page, { kind: "tap", target: { text: "Save" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /covered by <div data-sim="veil"/);
  assert.equal(await page.title(), "");
  await page.close();
});

test("a button that becomes enabled shortly after passes", async () => {
  const page = await pageWith(`<button id="b" disabled onclick="document.title='go'">Submit</button>
    <script>setTimeout(() => { document.getElementById("b").disabled = false; }, 400);</script>`);
  assert.deepEqual(await run(page, { kind: "tap", target: { text: "Submit" } }), { ok: true });
  assert.equal(await page.title(), "go");
  await page.close();
});

test("a disabled fieldset disables its buttons", async () => {
  const page = await pageWith(`<fieldset disabled><button>Pay</button></fieldset>`);
  const r = await run(page, { kind: "tap", target: { text: "Pay" } });
  assert.equal(!r.ok && r.reason, "disabled");
  await page.close();
});

test("an unknown action replies red", async () => {
  const page = await pageWith("<p>x</p>");
  const r = await run(page, { kind: "dance" } as any);
  assert.equal(r.ok, false);
  await page.close();
});

test("on a Next page a tap waits for hydration, and times out red if it never happens", async () => {
  const page = await pageWith(`<button id="b" onclick="document.title='hydrated-click'">Join</button>
    <script>window.__next_f = []; setTimeout(() => { document.getElementById("b").__reactProps$x = {}; }, 400);</script>`);
  assert.deepEqual(await run(page, { kind: "tap", target: { text: "Join" } }), { ok: true });
  assert.equal(await page.title(), "hydrated-click");
  await page.setContent(`<button onclick="document.title='bad'">Join</button><script>window.__next_f = [];</script>`);
  const r = await run(page, { kind: "tap", target: { text: "Join" } });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.reason, "timeout"); assert.equal(r.message, "the screen never finished loading"); }
  assert.equal(await page.title(), "");
  await page.close();
});

async function framePair() {
  const page = await browser.newPage();
  await page.route("http://t.test/**", (route) => {
    const u = new URL(route.request().url());
    const body = u.pathname === "/parent"
      ? `<iframe id="f" src="/child"></iframe><script>window.msgs=[];addEventListener("message",e=>window.msgs.push(e.data));</script>`
      : `<button onclick="document.title='tapped'">Tap me</button><script>window.dones=[];addEventListener("message",e=>{if(e.data&&e.data.sim==="done")window.dones.push(e.data)});</script><script>${clientBundle}</script>`;
    return route.fulfill({ contentType: "text/html", body });
  });
  await page.goto("http://t.test/parent");
  const msgs = () => page.evaluate(() => (window as any).msgs as any[]);
  return { page, msgs, child: () => page.frames().find((f) => f.url().includes("/child"))! };
}

test("ready is announced after load, and again after every pushState, even to the same path", async () => {
  const { page, msgs, child } = await framePair();
  await page.waitForFunction(() => (window as any).msgs.length >= 1);
  assert.deepEqual((await msgs())[0], { sim: "ready", path: "/child" });
  await child().evaluate(() => history.pushState({}, "", "/child?step=2"));
  await page.waitForFunction(() => (window as any).msgs.length >= 2);
  assert.deepEqual((await msgs())[1], { sim: "ready", path: "/child?step=2" });
  await child().evaluate(() => history.pushState({}, "", "/child?step=2"));
  await page.waitForFunction(() => (window as any).msgs.length >= 3);
  await page.close();
});

test("act messages from another origin are ignored; from the page itself they run", async () => {
  const { page, msgs, child } = await framePair();
  await page.waitForFunction(() => (window as any).msgs.length >= 1);
  const act = { sim: "act", id: "1", action: { kind: "tap", target: { text: "Tap me" } } };
  await page.evaluate((m) => (document.getElementById("f") as HTMLIFrameElement).contentWindow!.postMessage(m, "*"), act);
  await page.waitForTimeout(500);
  assert.equal(await child().title(), "");
  assert.ok(!(await msgs()).some((m) => m.sim === "done"));
  await child().evaluate((m) => window.postMessage(m, "*"), act);
  await child().waitForFunction(() => (window as any).dones.length === 1);
  assert.equal(await child().title(), "tapped");
  await page.close();
});
