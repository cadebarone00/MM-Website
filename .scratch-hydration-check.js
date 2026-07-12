const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const pages = ['/', '/leaderboard', '/teams', '/schedule'];
  let anyError = false;

  for (const path of pages) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`http://localhost:3100${path}`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000);

    const hydrationErrors = errors.filter((e) => /hydrat/i.test(e));
    console.log(`--- ${path} ---`);
    if (hydrationErrors.length) {
      anyError = true;
      hydrationErrors.forEach((e) => console.log('HYDRATION ERROR:', e));
    } else {
      console.log('No hydration errors.');
    }
    await page.close();
  }

  await browser.close();
  process.exit(anyError ? 1 : 0);
})();
