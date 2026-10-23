const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.IPHONE_PREVIEW_TEST_URL || 'http://localhost:3012';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
    const dataRequests = [];
    const errors = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || /supabase/.test(url.hostname)) dataRequests.push(request.url());
    });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base + '/dev-iphone');
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-security-policy'], /form-action 'none'/);
    await page.locator('[data-iphone-preview] main').waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    await page.getByRole('button', { name: 'Open development controls' }).click();
    await page.getByLabel('Page', { exact: true }).waitFor();
    const pages = await page.getByLabel('Page', { exact: true }).locator('option').evaluateAll(options => options.map(o => o.value));
    for (const id of pages) {
      console.log('Page:', id);
      await page.getByLabel('Page', { exact: true }).selectOption(id);
      assert.equal(new URL(page.url()).pathname, '/dev-iphone');
    }
    await page.getByLabel('Page', { exact: true }).selectOption('/dev/profile/edit');
    await page.getByRole('button', { name: 'Close controls' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Local Fixture Golfer');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Local Fixture Golfer', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/dev-iphone', 'sample form completion stays in canvas');
    await page.getByRole('button', { name: 'Open development controls' }).click();
    await page.getByLabel('Page', { exact: true }).selectOption('/dev/tournament');
    for (const scenario of ['scheduled', 'roundEnd', 'complete', 'live']) { console.log('Scenario:', scenario); await page.getByLabel('Trip scenario').selectOption(scenario); }
    await page.getByLabel('Page', { exact: true }).selectOption('/dev/profile');
    for (const scenario of ['profile-preview-few', 'profile-preview-none', 'profile-preview-public', 'profile-preview-private', 'profile-preview-sample']) {
      await page.getByLabel('Profile scenario').selectOption(scenario);
    }
    await page.getByRole('button', { name: 'Close controls' }).click();
    await page.getByRole('button', { name: 'Stats', exact: true }).click();
    await page.getByRole('searchbox').fill('sample');
    await page.waitForTimeout(400);
    assert.deepEqual(dataRequests, [], 'fixture UI must not request real APIs or Supabase');
    await page.getByRole('button', { name: 'Open development controls' }).click();
    await page.getByRole('button', { name: 'Hide for screenshot' }).click();
    assert.equal(await page.getByRole('complementary', { name: 'Development preview controls' }).count(), 0);
    fs.mkdirSync('out', { recursive: true });
    await page.screenshot({ path: 'out/dev-iphone-profile.png' });
    await page.getByRole('button', { name: 'Restore development controls' }).click();
    await page.getByRole('button', { name: 'Open development controls' }).click();
    await page.getByLabel('Page', { exact: true }).selectOption('/dev/tournament');
    await page.getByRole('button', { name: 'Hide for screenshot' }).click();
    await page.screenshot({ path: 'out/dev-iphone-trip.png' });
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(geometry.width, 393);
    assert(geometry.scrollWidth <= 394, 'no desktop simulator width or horizontal overflow');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open development controls' }).waitFor();
    assert.equal((await page.request.get(base + '/dev-iphone/unknown')).status(), 404);
    if (process.env.IPHONE_PREVIEW_DISABLED_URL) assert.equal((await page.request.get(process.env.IPHONE_PREVIEW_DISABLED_URL + '/dev-iphone')).status(), 404);
    assert.deepEqual(errors, [], 'fixture screens must not throw browser errors');
    await page.goto('file://' + require('node:path').resolve('docs/app-workflow.html'));
    await page.getByRole('button', { name: 'Expand all' }).click();
    assert.match(await page.locator('body').innerText(), /2026-10-23 - Isolated full-screen iPhone/);
    const workflowLink = page.getByRole('navigation', { name: 'All app sections' }).getByRole('link', { name: /22\. Legacy/ });
    await workflowLink.click();
    await page.locator('#search').fill('Isolated iPhone development canvas');
    assert(await page.locator('details:not(.hidden)').count() >= 1);
    await page.screenshot({ path: 'out/dev-iphone-workflow.png' });
    console.log('PASS: workflow change panel, navigation and search');
    console.log('PASS: direct phone viewport, all allowlisted pages/scenarios, contained navigation, zero data requests, screenshot hide/restore, unknown route rejection');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
