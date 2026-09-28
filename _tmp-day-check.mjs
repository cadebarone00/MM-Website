import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const errors = [];
for (const [name, vp] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
  const p = await b.newPage({ viewport: vp, isMobile: name === "mobile", hasTouch: name === "mobile" });
  p.on("pageerror", e => errors.push(name + ": " + e.message));
  p.on("console", m => m.type() === "error" && errors.push(name + " console: " + m.text()));
  await p.addInitScript(() => localStorage.setItem("mm-install-prompt-dismissed", "1"));
  await p.goto("http://localhost:3001/schedule/2027?date=2027-01-06", { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector("h1:has-text('Day 1')", { timeout: 120000 }); await p.waitForTimeout(2500);
  const info = async () => p.evaluate(() => ({
    title: document.querySelector("main h1")?.textContent,
    halves: [...document.querySelectorAll("main section")].map(s => { const r = s.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), s.querySelector("p:last-child")?.textContent]; }),
    arrows: [...document.querySelectorAll("main > button")].map(b => b.getAttribute("aria-label")),
    url: location.search,
  }));
  console.log(name, "day1", JSON.stringify(await info()));
  await p.screenshot({ path: `${out}/${name}-day1.png` });
  await p.click("button[aria-label='Day 2']"); await p.waitForTimeout(1500);
  console.log(name, "after next", JSON.stringify(await info()));
  await p.screenshot({ path: `${out}/${name}-day2.png` });
  await p.click("button[aria-label='Day 1']"); await p.waitForTimeout(500);
  console.log(name, "after prev", JSON.stringify(await info()));
  await p.goto("http://localhost:3001/schedule/2027?date=2027-01-09", { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector("h1:has-text('Day 4')", { timeout: 120000 });
  console.log(name, "last day", JSON.stringify(await info()));
  await p.click("text=Photo Library"); await p.waitForTimeout(300);
  console.log(name, "library open", await p.evaluate(() => document.querySelector("dialog")?.open));
}
console.log("errors", errors);
await b.close();
