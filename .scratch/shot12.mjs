import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const URL = "http://localhost:3001/leaderboard/2026-palm-springs/players/nate";
const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/final-mobile.png` });

// click shot 3 in the stepper if present
const shotBtns = page.locator("button", { hasText: /^[0-9]+$/ });
const count = await shotBtns.count();
console.log("numeric buttons found:", count);
// find the stepper buttons specifically (rounded-full, small)
const stepper3 = page.locator("button.rounded-full", { hasText: "3" }).first();
if (await stepper3.count()) {
  await stepper3.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/final-shot3.png` });
}

console.log("errors:", JSON.stringify(errors));
await browser.close();
