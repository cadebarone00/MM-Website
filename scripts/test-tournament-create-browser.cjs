// Browser check for CREATE → EXIST, signed out (no production writes possible):
// quick create needs only a name, the web address follows the name, saving is
// refused without an account (the draft stays local), and a saved
// tournament's dashboard is invisible to strangers.
// Run against a running app: CREATE_TEST_URL=http://localhost:3001 node scripts/test-tournament-create-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const base = process.env.CREATE_TEST_URL || 'http://localhost:3001';

(async () => {
  const unauthenticated = await fetch(`${base}/api/platform/tournaments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthenticated.status, 401, 'signed-out create must be refused');

  const stranger = await fetch(`${base}/tournaments/texas-cup/2027`);
  assert.equal(stranger.status, 404, 'a saved tournament dashboard must not be visible to strangers');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/tournaments/new`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => { const form = document.querySelector('main form'); return form && Object.keys(form).some((key) => key.startsWith('__reactProps')); });

    await page.getByLabel('Tournament name', { exact: true }).fill('The Texas Cup!');
    assert.equal(await page.getByLabel('Web address', { exact: true }).inputValue(), 'the-texas-cup');
    await page.getByLabel('Web address', { exact: true }).fill('texas-cup');
    await page.getByLabel('Tournament name', { exact: true }).fill('Texas Cup 2027');
    assert.equal(await page.getByLabel('Web address', { exact: true }).inputValue(), 'texas-cup', 'an edited address must not be overwritten');

    await page.getByRole('button', { name: 'Create now, finish later', exact: true }).click();
    await page.getByRole('heading', { name: /Tournament Setup/ }).waitFor();
    const main = await page.locator('main').innerText();
    assert.match(main, /Sign in to save your tournament\. Until then this stays a local draft/);
    assert.match(main, /dates to be decided/);
    assert.match(main, /Basics\s+Needs Attention/);
    assert.deepEqual(errors, []);
    console.log('Passed: signed-out create refused, stranger 404, quick create with name only, address follows name until edited, local fallback.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
