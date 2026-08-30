import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const URL = "http://localhost:3090/leaderboard/2026-palm-springs/players/nate";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

// scroll down to the stats section
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/stats-default.png`, fullPage: false });

console.log("errors so far:", JSON.stringify(errors));
await browser.close();
