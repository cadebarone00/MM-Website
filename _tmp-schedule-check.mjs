import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await p.addInitScript(() => localStorage.setItem("mm-install-prompt-dismissed", "1"));
const rects = (sel) => p.evaluate((sel) => {
  const r = (q) => { const e = document.querySelector(q); if (!e) return null; const x = e.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.bottom)]; };
  return { header: r("header"), areaNav: r("[data-player-area-nav]"), tabBar: r("[data-mobile-tab-bar]"), screen: r(sel), vh: innerHeight };
}, sel);
await p.goto("http://localhost:3001/schedule", { waitUntil: "load" });
console.log("landing fan", await rects("main"));
await p.waitForTimeout(2500); await p.screenshot({ path: process.argv[2] + "/landing.png" });
const href = await p.getAttribute("nav[aria-label='Tournament days'] a", "href");
await p.goto("http://localhost:3001" + href, { waitUntil: "load" });
const pageSel = "[class*='ScheduleAccordion-module'][class*='page']";
console.log("day fan", href, await rects(pageSel));
await p.waitForTimeout(2500); await p.screenshot({ path: process.argv[2] + "/day.png" });
// Simulate a player/Tiger session: the area switcher appears under the header.
await p.evaluate(() => { const n = document.createElement("nav"); n.setAttribute("data-player-area-nav", ""); n.style.cssText = "position:sticky;top:" + document.querySelector("header").getBoundingClientRect().height + "px;height:48px;background:#500;z-index:210"; document.querySelector("header").after(n); });
await p.waitForTimeout(300);
console.log("day player", await rects(pageSel));
await p.waitForTimeout(2500); await p.screenshot({ path: process.argv[2] + "/day-player.png" });
await p.setViewportSize({ width: 1400, height: 900 });
await p.waitForTimeout(300);
console.log("desktop", await rects(pageSel));
await b.close();
