import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import type { DriverAction, DriverResult } from "../../lib/dev/sim/driver/types";

let browser: Browser;
let bundle = "";

before(async () => {
  const out = await build({
    entryPoints: [path.resolve("lib/dev/sim/driver/actions.ts")],
    bundle: true, write: false, format: "iife", platform: "browser", globalName: "SimActions",
  });
  bundle = out.outputFiles[0].text;
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
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      // React-style tracker: setting el.value directly would not notify; only the input event does.
      el.addEventListener("input", () => window.seen.push(el.value));
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
