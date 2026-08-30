import { chromium } from "playwright";
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/95f2e46e-66de-4d7e-b473-68b84fa0bb52/scratchpad";
const base = "http://localhost:3095";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/teams/maroon/cam-latto`, { waitUntil: "networkidle" });
console.log("redirected url:", page.url());
await page.screenshot({ path: `${OUT}/redirect-target.png` });
console.log("errors:", JSON.stringify(errors));
await browser.close();
