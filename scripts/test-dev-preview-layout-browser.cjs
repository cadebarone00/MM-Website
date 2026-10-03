const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    fs.mkdirSync("out", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(60000);
    await page.goto("http://localhost:3001/dev");
    await page.frameLocator('iframe[title="Mobile application preview"]').getByRole("tab", { name: "Home", exact: true }).waitFor();
    await page.getByRole("complementary", { name: "Conditionals", exact: true }).getByRole("button", { name: "Mock golf trip data", exact: true }).click();
    await page.getByLabel("Device preset").selectOption("iphone17pro");
    let referenceHeight;
    for (const width of [1920, 1700, 1440, 1366, 1280, 1100]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.waitForTimeout(250);
      const geometry = await page.evaluate(() => {
        const phone = document.querySelector("[data-haptics-phone]");
        const preview = phone.parentElement.parentElement;
        const meter = document.querySelector('[aria-label="Haptics visualization"]');
        const shell = document.querySelector("main");
        const frame = document.querySelector('iframe[title="Mobile application preview"]');
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        return { phone: rect(phone), preview: rect(preview), meter: rect(meter), shell: { clientWidth: shell.clientWidth, scrollWidth: shell.scrollWidth }, viewport: [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight] };
      });
      const { phone, preview, meter } = geometry;
      assert(Math.abs(phone.x + phone.width / 2 - preview.x - preview.width / 2) < .5, `${width}: phone horizontally centered in its preview area`);
      assert(Math.abs(phone.y + phone.height / 2 - preview.y - preview.height / 2) < .5, `${width}: phone vertically centered in preview`);
      assert(Math.abs(meter.x - phone.right - 24) < .5, `${width}: exactly 24px gap`);
      assert(Math.abs(meter.y + meter.height / 2 - phone.y - phone.height / 2) < .5, `${width}: meter vertically centered beside phone`);
      assert(meter.right <= preview.right, `${width}: meter stays within preview`);
      assert.deepEqual(geometry.viewport, [402, 874], `${width}: simulated dimensions retained`);
      referenceHeight ??= phone.height;
      assert(Math.abs(phone.height - referenceHeight) < .5, `${width}: narrower browser preserves phone size`);
      if (width <= 1440) assert(geometry.shell.scrollWidth > geometry.shell.clientWidth, `${width}: workspace scrolls rather than crushing phone`);
      await page.screenshot({ path: `out/dev-preview-layout-${width}.png` });
      await page.evaluate(() => document.querySelector("main").scrollTo({ left: document.querySelector("main").scrollWidth, behavior: "instant" }));
      await page.waitForFunction(() => {
        const panel = document.querySelector('[aria-label="Design review"]').getBoundingClientRect();
        return panel.x >= 0 && panel.right <= innerWidth + 1;
      });
      const annotation = await page.getByRole("region", { name: "Design review", exact: true }).boundingBox();
      assert(annotation.x >= 0 && annotation.x + annotation.width <= width + 1, "horizontal scrolling reveals entire annotation panel");
      await page.evaluate(() => document.querySelector("main").scrollTo({ left: 0, behavior: "instant" }));
      console.log(`${width}px: centered ${phone.width.toFixed(1)}×${phone.height.toFixed(1)} phone; 24px gap; workspace ${geometry.shell.scrollWidth}px`);
    }
    await page.getByLabel("Display scale").selectOption("1");
    await page.waitForTimeout(100);
    const actual = await page.locator("[data-haptics-phone]").boundingBox();
    assert.equal(actual.width, 418); assert.equal(actual.height, 890);
    console.log("PASS: desktop widths, horizontal/vertical phone centering, unchanged phone size/iframe viewport, adjacent meter, horizontal overflow and accessible annotation column");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
