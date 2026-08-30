import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const URL = "http://localhost:3090/leaderboard/2026-palm-springs/players/nate";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(200);

await page.locator("button", { hasText: "vs Field" }).click();
await page.waitForTimeout(150);
await page.locator("button", { hasText: "Cade" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/stats-vs-cade-sg.png` });

// switch category while Cade stays selected
await page.locator("button", { hasText: "Fairways Hit %" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/stats-vs-cade-fir.png` });

await browser.close();
