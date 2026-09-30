import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const base = process.env.APP_URL || 'http://localhost:3001';
const browser = await chromium.launch({ headless: true });
await mkdir('out/platform-entry', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let signupPayload;
  let loginPayload;
  await page.route('**/api/auth/signup', route => {
    signupPayload = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/auth/login', route => {
    loginPayload = route.request().postDataJSON();
    return route.fulfill({ json: { ok: false, error: 'Verify your email.', unverified: true, email: 'test@example.com' } });
  });
  await page.route('**/api/auth/resend-verification', route => route.fulfill({ json: { ok: true } }));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/login', '/signup']) {
      await page.goto(base + route);
      await page.getByRole('heading', { level: 1 }).waitFor();
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}`);
      await page.screenshot({ path: `out/platform-entry/${route.slice(1) || 'home'}-${width}.png`, fullPage: true });
    }
  }
  await page.goto(base);
  await page.getByLabel('Open navigation').click();
  await page.getByRole('navigation', { name: 'Platform navigation' }).getByRole('link', { name: 'My Tournaments', exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Open navigation').click();
  await page.getByText('Join Tournament', { exact: true }).click();
  assert.ok(await page.getByText('Ask your commissioner', { exact: false }).isVisible());
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: 'Log In', exact: true }).focus();
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
  await page.goto(base + '/login');
  assert.ok(await page.getByRole('button', { name: 'Mobile', exact: true }).isDisabled());
  await page.getByLabel('Username or email', { exact: true }).fill('legacy-player');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Verify your email.' }).waitFor();
  assert.deepEqual(loginPayload, { usernameOrEmail: 'legacy-player', password: 'test-password' });
  await page.getByRole('button', { name: 'Resend email' }).click();
  await page.getByRole('button', { name: 'Sent!' }).waitFor();
  for (const invite of [false, true]) {
    signupPayload = undefined;
    await page.goto(base + '/signup' + (invite ? '?code=MMInvite' : ''));
    await page.getByLabel('Email', { exact: true }).fill('test@example.com');
    await page.getByLabel('Password', { exact: false }).fill('test-password');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).waitFor();
    assert.equal(signupPayload, undefined, 'step one must not submit credentials');
    await page.getByRole('button', { name: 'Back to email and password' }).click();
    assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'test@example.com');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Test Player');
    if (!invite) await page.getByLabel('Username', { exact: true }).fill('test-player');
    else assert.equal(await page.getByLabel('Username', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    assert.deepEqual(signupPayload, { name: 'Test Player', email: 'test@example.com', password: 'test-password', username: invite ? 'MMInvite' : 'test-player' });
  }
  await page.goto(pathToFileURL(path.resolve('docs/app-workflow.html')).href);
  assert.ok(await page.getByRole('region', { name: 'Recent workflow changes' }).isVisible());
  await page.locator('#search').fill('Invitation usernames');
  assert.ok(await page.locator('details:not(.hidden)').count() > 0);
  await page.getByText('Platform home and account entry', { exact: true }).waitFor();
  await page.locator('[data-open]').first().click();
  assert.equal(await page.locator('#search').inputValue(), '');
  assert.deepEqual(errors, []);
  console.log('Platform entry browser checks passed: responsive, focus, navigation, auth payloads, invitations, verification, workflow. Auth writes were intercepted.');
} finally { await browser.close(); }
