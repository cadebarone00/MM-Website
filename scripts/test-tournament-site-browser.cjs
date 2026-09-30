const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('out/tournament-site-preview/index.html')).href);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const event of ['texas', 'coastal']) {
        for (const view of ['home', 'leaderboard', 'matches', 'schedule', 'players', 'teams', 'courses', 'results']) {
          await page.evaluate(hash => { location.hash = hash; }, `${event}-${view}`);
          const active = page.locator(`[data-view]:not([hidden])`);
          await page.waitForFunction(id => document.querySelector('[data-view]:not([hidden])')?.id === id, `${event}-${view}`);
          assert.equal(await active.locator('h1').count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${event}/${view}/${width} overflow`);
          assert.equal(await active.locator('nav a[aria-current=page]').count(), 1);
          assert.equal(await active.getByRole('navigation').getByRole('link').count(), 8);
        }
      }
    }
    await page.getByLabel('Event', { exact: true }).selectOption('texas');
    await page.locator('#texas-home:not([hidden])').waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'out/tournament-site-preview/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'out/tournament-site-preview/mobile.png', fullPage: true });
    const nav = page.locator('#texas-home nav');
    for (const link of await nav.getByRole('link').all()) assert.ok(await link.evaluate(el => el.getBoundingClientRect().height >= 44));
    await nav.getByRole('link', { name: 'Matches', exact: true }).click();
    const matches = page.locator('#texas-matches:not([hidden])');
    await matches.waitFor();
    for (const state of ['Scheduled', 'Live', 'Final', 'Waiting on Pairings']) assert.ok((await matches.innerText()).includes(state));
    assert.ok(!(await matches.innerText()).includes('Thru 18'));
    await page.screenshot({ path: 'out/tournament-site-preview/matches-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Component states', exact: true }).click();
    await page.locator('#states:not([hidden])').waitFor();
    assert.equal(await page.getByText('Ivory Oaks', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
    await page.evaluate(() => { location.hash = 'texas-home'; });
    await page.locator('#texas-home:not([hidden])').waitFor();
    const skip = page.locator('#texas-home .ts-skip');
    await skip.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'texas-home-content');
    assert.deepEqual(errors, []);
    console.log('Passed: 48 fixture/page/viewport combinations, navigation, touch targets, keyboard skip link, white-team text, final labels; no browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
