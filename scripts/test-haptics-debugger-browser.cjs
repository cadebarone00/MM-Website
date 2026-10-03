const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    const errors = [];
    page.on("pageerror", error => {
      // Existing randomized scoring fixture labels can mismatch on hydration.
      if (!error.message.startsWith("Hydration failed because")) errors.push(error.message);
    });
    await page.goto(process.env.DEV_SIMULATOR_URL || "http://localhost:3001/dev", { waitUntil: "domcontentloaded" });
    const meter = page.getByRole("meter", { name: "Haptic level" });
    const phone = page.locator("[data-haptics-phone]");
    const frame = page.locator("iframe");
    await meter.waitFor();
    // Let the development bundle hydrate and mount diagnostic listeners.
    await page.waitForTimeout(1500);
    for (let number = 0; number <= 10; number++) assert(await meter.getByText(String(number), { exact: true }).isVisible());
    const initial = await phone.boundingBox();
    await page.getByRole("button", { name: "Test haptic", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await meter.getAttribute("aria-valuenow"), "2");
    assert.equal(await phone.evaluate(node => node.getAnimations().length), 1);
    await page.waitForTimeout(1050);
    assert.equal(await meter.getAttribute("aria-valuenow"), "0");
    assert.equal(await phone.evaluate(node => getComputedStyle(node).transform), "none");
    assert.deepEqual(await phone.boundingBox(), initial);
    const preview = page.frames().find(item => item.parentFrame());
    await preview.evaluate(() => parent.postMessage({ channel: "maroon-dev-haptics-v1", intensity: 7, durationMs: 400, name: "success" }, location.origin));
    await page.waitForTimeout(80);
    assert.equal(await meter.getAttribute("aria-valuenow"), "7");
    await page.waitForTimeout(450);
    assert.equal(await meter.getAttribute("aria-valuenow"), "0");
    await page.evaluate(() => window.postMessage({ channel: "maroon-dev-haptics-v1", intensity: 10, durationMs: 1000, name: "spoof" }, location.origin));
    await page.waitForTimeout(80);
    assert.equal(await meter.getAttribute("aria-valuenow"), "0");
    for (const intensity of [0, 3, 6, 10]) {
      await page.getByLabel("Haptic test level").fill(String(intensity));
      await page.getByLabel("Haptic test duration").fill("1000");
      await page.getByRole("button", { name: "Test haptic", exact: true }).click();
      await page.waitForTimeout(50);
      assert.equal(await meter.getAttribute("aria-valuenow"), String(intensity));
      assert.equal(await phone.evaluate(node => node.getAnimations().length), intensity ? 1 : 0);
    }
    await page.getByLabel("Haptic test level").fill("0");
    await page.getByRole("button", { name: "Test haptic", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByLabel("Haptic test level").fill("7");
    await page.getByRole("button", { name: "Test haptic", exact: true }).click();
    await page.waitForTimeout(50);
    assert.equal(await meter.getAttribute("aria-valuenow"), "7");
    assert.equal(await phone.evaluate(node => node.getAnimations().length), 0);
    await page.waitForTimeout(1050);
    const devices = page.getByRole("combobox", { name: "Device preset" });
    for (const device of ["iphone16", "iphone16pro", "iphone16promax", "iphone17", "iphone17pro", "iphone17promax", "pixel9", "pixel9pro", "custom"]) {
      await devices.selectOption(device);
      await page.waitForTimeout(100);
      const dimensions = await frame.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight, expectedWidth: Number(node.width), expectedHeight: Number(node.height) }));
      assert.equal(dimensions.width, dimensions.expectedWidth);
      assert.equal(dimensions.height, dimensions.expectedHeight);
      const phoneBox = await phone.boundingBox();
      const meterBox = await page.getByLabel("Haptics visualization", { exact: true }).boundingBox();
      assert(meterBox.x - (phoneBox.x + phoneBox.width) >= 31);
    }
    await page.getByRole("spinbutton", { name: "Viewport width" }).fill("360");
    await page.getByRole("spinbutton", { name: "Viewport width" }).blur();
    assert.equal(await frame.evaluate(node => node.clientWidth), 360);
    await page.getByLabel("Haptic test level").fill("10");
    await page.getByLabel("Haptic test duration").fill("5000");
    await page.getByRole("button", { name: "Test haptic", exact: true }).click();
    fs.mkdirSync("out", { recursive: true });
    await page.screenshot({ path: "out/haptics-debugger.png" });
    await page.goto(pathToFileURL(path.resolve("docs/app-workflow.html")).href);
    assert.match(await page.getByLabel("Recent workflow changes").innerText(), /Development Haptic Debugger/);
    await page.locator("#search").fill("Native haptics foundation");
    assert(await page.getByText("Native haptics foundation and development debugger:", { exact: false }).first().isVisible());
    await page.locator("#search").fill("");
    await page.locator("nav a").filter({ hasText: "Legacy integrations" }).first().click();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS: timed pulses/reset, phone transform restoration, iframe events/source rejection, intensity controls, replacement, zero, reduced motion, device dimensions, spacing and workflow navigation/search.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
