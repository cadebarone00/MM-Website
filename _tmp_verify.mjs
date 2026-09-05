import { chromium } from "playwright";

const scratch = "C:\\Users\\Owner\\AppData\\Local\\Temp\\claude\\c--Users-Owner-Documents-GitHub-MM-Website\\0093878c-a4e7-4c15-b7ed-acebece06583\\scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://localhost:3001/broadcast?preview=1&year=2026&scene=individual_leaderboard", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${scratch}\\individual_leaderboard.png` });

// Also grab the match play scene for finding 2 verification
await page.goto("http://localhost:3001/broadcast?preview=1&year=2026&scene=match_play", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${scratch}\\match_play.png` });

await browser.close();
console.log("done");
