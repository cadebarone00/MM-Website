import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const base = "http://localhost:3095";
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
page.on("pageerror", (e) => errors.push(String(e)));

// 1. Round dropdown course names
await page.goto(`${base}/leaderboard/2026-palm-springs/players/nate`, { waitUntil: "networkidle" });
const options = await page.locator("select option").allTextContents();
console.log("round options:", JSON.stringify(options));

// 2. Bio section
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/bio-section.png` });

// 3. Statistics per-round labels (Fairways %)
await page.locator("button", { hasText: "Fairways Hit %" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/course-labels.png` });

// 4. Teams -> player redirect
await page.goto(`${base}/teams/maroon/cam-latto`, { waitUntil: "networkidle" });
console.log("redirected url:", page.url());

console.log("errors:", JSON.stringify(errors));
await browser.close();
