// Focused checks against an already running development server. No database fixture server.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.DEV_SIMULATOR_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    fs.mkdirSync("out", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/dev`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const phone = page.frameLocator("iframe");
    const frame = () => page.frames().find(item => item.parentFrame());
    const control = name => page.getByRole("combobox", { name, exact: true });
    const selected = async name => {
      await phone.getByRole("tab", { name, exact: true }).waitFor();
      await page.waitForFunction(name => Array.from(document.querySelector("iframe").contentDocument.querySelectorAll("[role=tab]")).some(element => element.textContent === name && element.getAttribute("aria-selected") === "true"), name);
    };
    await selected("Home");
    await frame().evaluate(() => { window.__simulatorTestToken = "keep"; });
    const outerSelected = async id => page.waitForFunction(id => document.querySelector('select[aria-label="App page"]').value === id, id);
    // App clicks report actual state; observing them must not issue another command.
    for (const tab of ["Golf", "Venue", "Info", "Home", "Golf"]) {
      await phone.getByRole("tab", { name: tab, exact: true }).click();
      await outerSelected(tab === "Home" ? "/dev/tournament" : `trip-${tab}`);
    }
    for (const section of ["Competition", "Games", "Overview"]) {
      await phone.getByRole("tab", { name: section, exact: true }).click();
      await outerSelected(section === "Overview" ? "trip-Golf" : `trip-${section}`);
    }
    await phone.getByRole("tab", { name: "Venue", exact: true }).click();
    await control("Data source").selectOption("mock");
    await phone.getByRole("heading", { name: "Friends Golf Weekend", exact: true }).waitFor();
    await outerSelected("trip-Venue");
    await control("Data source").selectOption("maroon");
    await phone.getByRole("heading", { name: "The Maroon Tournament 2026", exact: true }).waitFor();
    await outerSelected("trip-Venue");
    await control("App page").selectOption("/dev/tournament");
    await selected("Home");
    // CSS must not override the selected HTML dimensions with responsive embed rules.
    const sizingConflict = await page.addStyleTag({ content: "iframe { width: 100%; height: 100%; max-width: 300px; max-height: 300px; }" });
    const devices = { iphone16: [393, 852], iphone16pro: [402, 874], iphone16promax: [440, 956], iphone17: [402, 874], iphone17pro: [402, 874], iphone17promax: [440, 956], pixel9: [412, 924], pixel9pro: [412, 918] };
    for (const [id, dimensions] of Object.entries(devices)) {
      await control("Device preset").selectOption(id);
      await page.waitForFunction(dimensions => { const preview = document.querySelector("iframe").contentWindow; return preview.innerWidth === dimensions[0] && preview.innerHeight === dimensions[1]; }, dimensions);
      assert.deepEqual(await frame().evaluate(() => [innerWidth, innerHeight]), dimensions);
      assert.deepEqual(await page.locator("iframe").evaluate(element => {
        const css = getComputedStyle(element);
        return [parseFloat(css.width), parseFloat(css.height), css.maxWidth, css.maxHeight];
      }), [...dimensions, "none", "none"]);
    }
    await page.getByRole("spinbutton", { name: "Viewport width" }).fill("768");
    await page.getByRole("spinbutton", { name: "Viewport height" }).fill("900");
    assert.deepEqual(await frame().evaluate(() => [innerWidth, innerHeight]), [768, 900]);
    await sizingConflict.evaluate(element => element.remove());
    await control("Device preset").selectOption("iphone17pro");
    await control("App page").selectOption("trip-Golf");
    await selected("Golf");
    const titles = { mock: "Friends Golf Weekend", empty: "Your Golf Trip", busy: "Summer Golf Festival", maroon: "The Maroon Tournament 2026" };
    for (const [source, title] of Object.entries(titles)) {
      await control("Data source").selectOption(source);
      await phone.getByRole("heading", { name: title, exact: true }).waitFor();
      await selected("Golf");
      assert.equal(await frame().evaluate(() => window.__simulatorTestToken), "keep");
      assert.equal(await phone.getByRole("button", { name: "Maroon Tournament", exact: true }).count(), 0);
    }
    await control("Data source").selectOption("busy");
    await phone.getByText("Guest Golfer 32", { exact: true }).first().waitFor();
    for (const name of ["Competition", "Games", "Venue", "Info", "Home"]) {
      await control("App page").selectOption(name === "Home" ? "/dev/tournament" : `trip-${name}`);
      await selected(name);
    }
    await control("App page").selectOption("trip-Venue");
    await selected("Venue");
    await phone.getByRole("button", { name: /The Trip/ }).click();
    await control("Loading state").selectOption("weather");
    await phone.getByText("Loading forecast…", { exact: true }).waitFor();
    await control("Loading state").selectOption("off");
    await control("App page").selectOption("trip-Golf");
    await selected("Golf");
    await control("Golf format").selectOption("stableford");
    await phone.getByRole("tabpanel", { name: "Overview", exact: true }).getByText(/Stableford/).first().waitFor();
    await control("Trip / tournament status").selectOption("no");
    await phone.getByRole("tab", { name: "Competition", exact: true }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Reset app state" }).click();
    await phone.getByRole("tab", { name: "Competition", exact: true }).waitFor();
    await page.getByText("Safe-area testing", { exact: true }).click();
    await page.getByRole("spinbutton", { name: "Safe-area bottom" }).fill("50");
    await page.waitForFunction(() => getComputedStyle(document.querySelector("iframe").contentDocument.documentElement).getPropertyValue("--dev-safe-area-bottom") === "50px");
    const nav = phone.locator("[data-site-bottom-nav]");
    const before = (await nav.boundingBox()).y;
    await frame().evaluate(() => window.scrollTo(0, 400));
    assert(await frame().evaluate(() => scrollY) > 0);
    assert(Math.abs(before - (await nav.boundingBox()).y) < 1);
    await page.getByRole("button", { name: "Reset scroll", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("iframe").contentWindow.scrollY === 0);
    await phone.getByRole("link", { name: "Trip settings" }).click();
    await phone.getByText("Trip Settings", { exact: true }).waitFor();
    await outerSelected("/dev/tournament/settings");
    assert.equal(await frame().evaluate(() => window.__simulatorTestToken), "keep");
    await control("Golf format").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector('select[aria-label="Golf format"]').disabled);
    await control("Data source").selectOption("mock");
    await phone.getByRole("heading", { name: "Friends Golf Weekend", exact: true }).waitFor();
    await control("App page").selectOption("/dev/tournament");
    await selected("Home");
    await control("App page").selectOption("/");
    await phone.getByText("Discover", { exact: true }).first().waitFor();
    await outerSelected("/");
    assert.equal(await frame().evaluate(() => window.__simulatorTestToken), "keep");
    await page.waitForFunction(() => document.querySelector('select[aria-label="Data source"]').disabled);
    assert.equal(await phone.getByLabel("Development controls").count(), 0);
    await control("App page").selectOption("/dev/tournament");
    await selected("Home");
    await phone.getByRole("heading", { name: "Friends Golf Weekend", exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('select[aria-label="Data source"]').disabled);
    await page.screenshot({ path: "out/dev-simulator-tested.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "out/dev-simulator-small-screen.png" });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${base}/dev/tournament`, { waitUntil: "domcontentloaded" });
    // Existing randomized scoring labels can recover hydration on this route.
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Mock", exact: true }).click();
    await page.getByRole("heading", { name: "Friends Golf Weekend", exact: true }).waitFor();
    await page.getByRole("button", { name: "Maroon Tournament", exact: true }).click();
    await page.getByText("DEV: Unmapped Tournament Data (click to view)").waitFor();
    await page.goto(`file:///${process.cwd().replaceAll("\\", "/")}/docs/app-workflow.html`);
    await page.getByLabel("Recent workflow changes").waitFor();
    await page.locator("#search").fill("Development mobile simulator");
    assert(await page.locator("details:not(.hidden)").count() > 0);
    await page.locator("#search").fill("");
    await page.getByRole("heading", { name: /^Development mobile simulator:/, level: 3 }).click();
    assert(await page.locator("details[open]").count() > 0);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: "out/dev-simulator-workflow.png" });
    const unexpected = errors.filter(message => !(message.includes("Hydration failed") && message.includes("GolfTripScoring")));
    assert.deepEqual(unexpected, []);
    console.log("PASS: device/custom CSS viewports, fixtures without reload, shared section navigation, loading/state overrides, safe-area inputs, fixed bottom navigation, scrolling, Settings return, production-route isolation, standalone data toggle and workflow presentation.");
    if (errors.length) console.log("Known existing scoring-opponent hydration warning observed; scoring implementation unchanged.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
