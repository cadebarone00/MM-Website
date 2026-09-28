import { chromium } from "playwright";

const BASE = "http://localhost:3107";
const SHOTS = process.argv[2];
const browser = await chromium.launch();
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failures++; };

async function run(label, viewport, openMenu, signOutName) {
  const page = await browser.newPage({ viewport });
  let signedIn = true;
  let signoutCalls = 0;
  await page.route("**/api/account/me", (route) =>
    route.fulfill({ json: { session: signedIn ? { kind: "fan", username: "tester", displayName: "Test Fan" } : null } }));
  await page.route("**/api/auth/signout", (route) => { signoutCalls++; signedIn = false; route.fulfill({ json: { ok: true } }); });

  await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
  await openMenu(page);
  await page.getByRole("button", { name: signOutName, exact: true }).locator("visible=true").first().click();
  const dialog = page.getByRole("dialog");
  check(await dialog.isVisible(), `${label}: popup appears`);
  check(await dialog.getByText("Are you sure?").isVisible() && await dialog.getByText("Any unsaved data will not be stored.").isVisible(), `${label}: popup text`);
  const bg = await dialog.getByRole("button", { name: "Sign Out" }).evaluate((el) => getComputedStyle(el).backgroundColor);
  check(/rgb\((2[0-9]{2}|1[5-9][0-9]),\s*[0-9]{1,2},/.test(bg) || bg.startsWith("lab(48"), `${label}: Sign Out is red (${bg})`);
  await page.screenshot({ path: `${SHOTS}/${label}-popup.png` });

  await dialog.getByRole("button", { name: "Cancel" }).click();
  check(!(await dialog.isVisible()) && signoutCalls === 0 && page.url().endsWith("/history"), `${label}: Cancel keeps you signed in on same page`);

  await openMenu(page);
  await page.getByRole("button", { name: signOutName, exact: true }).locator("visible=true").first().click();
  await page.keyboard.press("Escape");
  check(!(await page.getByRole("dialog").isVisible()) && signoutCalls === 0, `${label}: Esc closes popup`);

  await openMenu(page);
  await page.getByRole("button", { name: signOutName, exact: true }).locator("visible=true").first().click();
  await Promise.all([page.waitForURL(`${BASE}/`), page.getByRole("dialog").getByRole("button", { name: "Sign Out" }).click()]);
  await page.waitForLoadState("load"); await page.getByRole("link", { name: "Login" }).locator("visible=true").first().waitFor();
  check(signoutCalls === 1, `${label}: sign-out request sent once`);
  check(new URL(page.url()).pathname === "/", `${label}: landed on home page`);
  check(await page.getByRole("link", { name: "Login" }).first().count() > 0, `${label}: shows Login (guest)`);
  await page.screenshot({ path: `${SHOTS}/${label}-after.png` });
  await page.close();
}

await run("desktop", { width: 1280, height: 800 }, async (page) => {
  await page.locator("button[aria-label=\"Your account\"]:visible").first().click();
}, "Sign Out");

await run("mobile", { width: 390, height: 844 }, async (page) => {
  if (await page.getByRole("button", { name: "Close menu" }).isVisible()) return; // Cancel returns you to the still-open menu
  await page.locator("button[aria-label=\"Your account\"]:visible").first().click();
}, "Log Out");

// Failure path: sign-out request errors -> popup stays, shows error, still on page
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("**/api/account/me", (r) => r.fulfill({ json: { session: { kind: "fan", username: "t", displayName: "Test Fan" } } }));
  await page.route("**/api/auth/signout", (r) => r.fulfill({ status: 500, json: { ok: false } }));
  await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
  await page.locator("button[aria-label=\"Your account\"]:visible").first().click();
  await page.getByRole("button", { name: "Sign Out", exact: true }).locator("visible=true").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign Out" }).click();
  await page.getByRole("alert").waitFor();
  check(page.url().endsWith("/history"), "error path: stays put and shows error message");
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
