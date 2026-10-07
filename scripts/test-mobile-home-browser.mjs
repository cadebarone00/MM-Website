import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('out/mobile-home', { recursive: true });
  await page.goto(process.env.APP_URL || 'http://localhost:3001', { timeout: 60000 });
  for (const width of [320, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(29, 11, 17)');
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'The Maroon');
    // Main app navigation: the 5-tab bottom menu (Play lit) and an icon-only top bar.
    const tabs = await page.locator('[data-site-bottom-nav] a').evaluateAll(links => links.map(a => a.getAttribute('href')));
    assert.deepEqual(tabs, ['/', '/golf-trips', '/profile', '/tournaments/join', '/pickems']);
    assert.equal(await page.locator('[data-site-bottom-nav] a[aria-current="page"]').getAttribute('href'), '/');
    const menu = await page.locator('header nav[aria-label="Platform navigation"] a').evaluateAll(links => links.map(a => [a.textContent.trim(), a.getAttribute('href')]));
    assert.ok(!menu.some(([, href]) => href === '/website'), 'menu has no /website tournament shortcut');
    assert.deepEqual(menu.find(([label]) => label === 'My Tournaments'), ['My Tournaments', '/tournaments/mine']);
    // Tournaments are entered from Tourneys, so Play has no My Tournaments button.
    assert.equal(await page.locator('main').getByText('My Tournaments', { exact: true }).count(), 0);
    const create = page.getByRole('link', { name: 'Create Tournament', exact: true }).last();
    assert.equal(await create.getAttribute('href'), '/tournaments/create');
    // Play page: Tournament and Golf Trip cards each have a join and a create.
    assert.equal(await page.getByRole('link', { name: 'Join Tournament', exact: true }).getAttribute('href'), '/tournaments/join');
    assert.equal(await page.getByRole('link', { name: 'Join a Trip', exact: true }).getAttribute('href'), '/golf-trips');
    assert.equal(await page.getByRole('link', { name: 'Create a Trip', exact: true }).getAttribute('href'), '/tournaments/create/golf-trip');
    assert.equal(await page.locator('[data-site-bottom-nav] a[href="/"]').textContent(), 'Play');
    // "Pick a course" switches the ribbon to Courses (course search).
    await page.getByRole('button', { name: 'Pick a course' }).click();
    assert.equal(await page.getByRole('button', { name: 'Courses', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'News', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'News', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('link', { name: 'Explore News' }).getAttribute('href'), '/the-maroon/news');
    await page.getByRole('button', { name: 'Courses', exact: true }).click();
    assert.equal(await page.getByRole('link', { name: 'Explore Courses' }).getAttribute('href'), '/the-maroon/courses');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
    await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
    await page.screenshot({ path: `out/mobile-home/home-${width}.png`, fullPage: true });
  }
  await page.goto(pathToFileURL(path.resolve('docs/app-workflow.html')).href);
  assert.ok(await page.getByRole('region', { name: 'Recent workflow changes' }).isVisible());
  await page.locator('#search').fill('1D0B11');
  assert.ok(await page.locator('details:not(.hidden)').count() > 0);
  await page.locator('[data-open]').first().click();
  assert.equal(await page.locator('#search').inputValue(), '');
  assert.deepEqual(errors, []);
  console.log('Mobile home passed: five widths, exact maroon, play cards, Pick a course, category selection, routes, focus, workflow panel/navigation/search.');
} finally { await browser.close(); }
