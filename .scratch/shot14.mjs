import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const URL = "http://localhost:3001/leaderboard/2026-palm-springs/players/nate";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.mouse.wheel(0, 650);
await page.waitForTimeout(200);

const stepper3 = page.locator("button.rounded-full", { hasText: "3" }).first();
await stepper3.click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/final-shot3-jump.png` });

// now click back to 1
const stepper1 = page.locator("button.rounded-full", { hasText: "1" }).first();
await stepper1.click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/final-shot1-back.png` });
await browser.close();
