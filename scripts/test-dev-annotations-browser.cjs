const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    fs.mkdirSync("out", { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1700, height: 1150 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto("http://localhost:3001/dev");
    const phone = page.frameLocator('iframe[title="Mobile application preview"]');
    await phone.getByRole("tab", { name: "Home", exact: true }).waitFor();
    await page.getByRole("complementary", { name: "Conditionals", exact: true }).getByRole("button", { name: "Mock golf trip data", exact: true }).click();
    const canvas = page.getByLabel("Phone annotations", { exact: true });
    const tool = name => page.getByRole("button", { name, exact: true });
    const pixels = () => canvas.evaluate(c => {
      const bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let count = 0; for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) count++;
      return count;
    });
    async function line(x, y, dx = .25, dy = .05) {
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (x + dx), box.y + box.height * (y + dy), { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(80);
    }
    await tool("Pen").click();
    await line(.2, .15);
    const first = await pixels(); assert(first > 0);
    await line(.2, .3);
    const second = await pixels(); assert(second > first);
    await tool("Undo").click(); assert.equal(await pixels(), first);
    await tool("Redo").click(); assert.equal(await pixels(), second);
    await tool("Highlighter").click();
    assert.equal(await page.getByLabel("Stroke thickness").inputValue(), "20");
    await line(.2, .45);
    const highlighted = await pixels(); assert(highlighted > second);
    assert(await canvas.evaluate(c => {
      const d = c.getContext("2d").getImageData(Math.round(c.width * .25), Math.round(c.height * .46), 1, 1).data;
      return d[0] > 200 && d[1] > 150 && d[3] > 60 && d[3] < 100;
    }), "highlighter has yellow translucent ink");
    await tool("Eraser").click(); await line(.25, .3, .05, .01);
    assert(await pixels() < highlighted);
    await tool("Undo").click(); assert.equal(await pixels(), highlighted);
    await tool("Clear annotations").click(); assert.equal(await pixels(), 0);
    await page.keyboard.press("Control+z"); assert.equal(await pixels(), highlighted);
    await tool("Hide annotations").click(); assert.equal(await pixels(), 0);
    assert.equal(await canvas.getAttribute("data-tool"), "interact");
    await tool("Show annotations").click(); assert.equal(await pixels(), highlighted);
    // Pointer layer is precisely the iframe viewport, for every supported reference size and zoom.
    for (const id of ["iphone16", "iphone16pro", "iphone16promax", "iphone17", "iphone17pro", "iphone17promax", "pixel9", "pixel9pro"]) {
      await page.getByLabel("Device preset").selectOption(id);
      for (const zoom of ["fit", "0.5"]) {
        await page.getByLabel("Display scale").selectOption(zoom);
        const a = await canvas.boundingBox(), b = await page.locator('iframe[title="Mobile application preview"]').boundingBox();
        for (const k of ["x", "y", "width", "height"]) assert(Math.abs(a[k] - b[k]) < .1, `${id}/${zoom}: ${k}`);
        assert(await pixels() > 0);
      }
    }
    await page.getByLabel("Viewport width").fill("480");
    await page.getByLabel("Viewport height").fill("900");
    await page.getByLabel("Display scale").selectOption("fit");
    await page.setViewportSize({ width: 1450, height: 1000 });
    await page.waitForFunction(() => {
      const a = document.querySelector('[aria-label="Phone annotations"]').getBoundingClientRect();
      const b = document.querySelector('iframe[title="Mobile application preview"]').getBoundingClientRect();
      return Math.abs(a.width - b.width) < .1 && Math.abs(a.x - b.x) < .1 && document.querySelector("iframe").contentWindow.innerWidth === 480;
    });
    let a = await canvas.boundingBox(), b = await page.locator('iframe[title="Mobile application preview"]').boundingBox();
    assert(Math.abs(a.width - b.width) < .1 && Math.abs(a.x - b.x) < .1);
    await page.setViewportSize({ width: 1700, height: 1150 });
    await page.getByLabel("Device preset").selectOption("iphone17pro");
    await tool("Pen").click();
    const frame = page.frames().find(f => f.parentFrame());
    await frame.evaluate(() => { window.__reviewClicks = 0; document.addEventListener("click", () => window.__reviewClicks++); });
    await line(.5, .6); assert.equal(await frame.evaluate(() => window.__reviewClicks), 0);
    await page.keyboard.press("Escape");
    assert.equal(await canvas.evaluate(c => getComputedStyle(c).pointerEvents), "none");
    await phone.getByRole("tab", { name: "Info", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-page-id="trip-Info"]').getAttribute("aria-pressed") === "true");
    assert(await frame.evaluate(() => window.__reviewClicks) > 0);
    assert.equal(await pixels(), 0, "navigation starts a fresh review canvas");
    await tool("Red pen").click(); await line(.2, .15);
    // Deterministic fixed-position marker verifies capture cropping even after document scroll.
    await frame.evaluate(() => {
      const marker = document.createElement("div");
      marker.style.cssText = "position:fixed;left:12px;top:110px;width:30px;height:30px;background:rgb(1,200,99);z-index:2147483647";
      document.body.append(marker); window.scrollTo({ top: 100, behavior: "instant" });
    });
    await page.locator('iframe[title="Mobile application preview"]').screenshot({ path: "out/dev-review-native.png" });
    const download = page.waitForEvent("download");
    await tool("Download Snapshot").click();
    await (await download).saveAs("out/dev-review-screen.png");
    const png = fs.readFileSync("out/dev-review-screen.png");
    assert.equal(png.readUInt32BE(16), 804); assert.equal(png.readUInt32BE(20), 1748);
    await page.evaluate(async data => {
      const img = new Image(); img.src = data; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      window.__reviewPNG = c.toDataURL();
      window.__reviewPixel = Array.from(c.getContext("2d").getImageData(40, 240, 1, 1).data);
    }, "data:image/png;base64," + png.toString("base64"));
    assert.deepEqual(await page.evaluate(() => window.__reviewPixel), [1, 200, 99, 255]);
    await tool("Copy Snapshot").click();
    await page.getByRole("status").filter({ hasText: "Snapshot copied" }).waitFor();
    assert.equal(await page.evaluate(async () => (await navigator.clipboard.read())[0].types[0]), "image/png");
    await page.getByLabel("Snapshot area").selectOption("frame");
    const framed = page.waitForEvent("download"); await tool("Download Snapshot").click();
    await (await framed).saveAs("out/dev-review-frame.png");
    const framedPNG = fs.readFileSync("out/dev-review-frame.png");
    assert.equal(framedPNG.readUInt32BE(16), 836); assert.equal(framedPNG.readUInt32BE(20), 1780);
    for (const width of [1366, 1440, 1700, 1920]) {
      await page.setViewportSize({ width, height: 1150 });
      await page.waitForTimeout(150);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector("main > header").getBoundingClientRect();
        const conditions = document.querySelector('[aria-label="Conditionals"]').getBoundingClientRect();
        const review = document.querySelector('[aria-label="Design review"]').getBoundingClientRect();
        const phone = document.querySelector("[data-haptics-phone]").getBoundingClientRect();
        return { headerRight: header.right, conditionsRight: conditions.right, reviewLeft: review.left, reviewRight: review.right, phoneTop: phone.top, phoneBottom: phone.bottom, height: innerHeight, width: innerWidth };
      });
      assert(Math.abs(geometry.headerRight - geometry.conditionsRight) < 1, "header ends at third column");
      assert(geometry.reviewLeft > 0, "annotation column remains right of phone preview");
      assert(Math.abs(geometry.phoneTop - geometry.height * .05) < 1, "phone starts 5% down");
      assert(geometry.phoneBottom <= geometry.height * .95 + 1, "phone stays above bottom 5%");
      if (width >= 1700) assert(Math.abs(geometry.phoneBottom - geometry.height * .95) < 1, "Fit fills central 90% when width allows");
    }
    await page.setViewportSize({ width: 1700, height: 1150 });
    await page.screenshot({ path: "out/dev-review-workspace.png" });
    await page.goto("file:///" + process.cwd().replaceAll("\\", "/") + "/docs/app-workflow.html");
    await page.getByLabel("Recent workflow changes").getByText(/Design-review annotations/).waitFor();
    await page.getByLabel("Search app workflows").fill("annotation");
    assert(await page.locator("details:not(.hidden)").count() > 0);
    await page.getByLabel("Search app workflows").fill("");
    await page.locator('nav[aria-label="All app sections"] a').filter({ hasText: "22." }).click();
    assert(await page.locator("details[open]").count() > 0);
    await page.screenshot({ path: "out/dev-review-workflow.png" });
    console.log("PASS: annotations/history/eraser/highlighter, input isolation, devices/zoom/resize, clean screen/frame PNG and clipboard, workflow UI");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
