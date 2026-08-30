import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const URL = "http://localhost:3090/leaderboard/2026-palm-springs/players/nate";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(200);

for (const label of ["Greens in Regulation %", "Putts / Round"]) {
  await page.locator("button", { hasText: label }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/stats-${label.replace(/[^a-z0-9]/gi,'')}.png` });
}

// Strokes Gained is scrolled off to the right in the pill bar; scroll it into view
const pillBar = page.locator(".overflow-x-auto").last();
await pillBar.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
await page.waitForTimeout(100);
await page.locator("button", { hasText: "Strokes Gained" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/stats-sg.png` });

// test compare picker
await page.locator("button", { hasText: "vs Field" }).click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/stats-compare-open.png` });

console.log("errors:", JSON.stringify(errors));
await browser.close();
