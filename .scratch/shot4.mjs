import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const URL = "http://localhost:3001/leaderboard/2026-palm-springs/players/nate";
const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/m2-front9.png` });

// click hole 5 to test highlight
const btn5 = page.locator("button", { hasText: /^5$/ }).first();
await btn5.click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/m2-front9-selected.png` });

// swipe to back9: scroll the inner scroller by its own width
const scroller = page.locator(".snap-x").first();
const box = await scroller.boundingBox();
await scroller.evaluate((el) => { el.scrollLeft = el.clientWidth; el.dispatchEvent(new Event('scroll')); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/m2-back9.png` });

console.log("errors:", JSON.stringify(errors), "scrollerBox:", JSON.stringify(box));
await browser.close();
