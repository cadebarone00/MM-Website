import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; p.on("pageerror", e => errors.push(e.message)); p.on("console", m => m.type()==="error" && errors.push(m.text()));
await p.goto("http://localhost:3001/golf-trips/trip", { waitUntil: "domcontentloaded", timeout: 120000 }); await p.getByRole("tab", { name: "Home" }).waitFor({ timeout: 60000 });
await p.screenshot({ path: "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/306e5880-5657-4092-8d8a-9c1680c92500/scratchpad/empty.png", fullPage: true });
await p.evaluate(() => sessionStorage.setItem("golfTripDraft", JSON.stringify({ tripName: "Maroon Masters 2027", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-25", yourName: "Cade", golfDays: "2", day1Date: "2027-04-23", day1Rounds: "2", day2Date: "2027-04-24", round1Course: "Pinehurst No. 2", includesTournament: "yes" })));
await p.reload({ waitUntil: "domcontentloaded" }); await p.getByText("Maroon Masters 2027").waitFor({ timeout: 60000 }); await p.screenshot({ path: "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-Documents-GitHub-MM-Website/306e5880-5657-4092-8d8a-9c1680c92500/scratchpad/filled.png", fullPage: true });
await p.getByRole("tab", { name: "Venue" }).click(); console.log("venue selected:", await p.getByRole("tab", { name: "Venue" }).getAttribute("aria-selected"), "panel:", await p.getByRole("tabpanel").innerText());
console.log("errors:", JSON.stringify(errors)); await b.close();
