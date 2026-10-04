import { test, expect } from '@playwright/test';

const canonical = 'https://m-masaki72.github.io/glass-shatter/';
async function openGame(page) {
  await page.goto('/?seed=17');
  await expect
    .poll(() => page.evaluate(() => window.crystalLab?.snapshot().ready), { timeout: 30000 })
    .toBe(true);
  await expect(page.locator('#startup-error')).toBeHidden();
}

test('public metadata and bundled assets are present', async ({ page, request }) => {
  await openGame(page);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(ld['@type']).toBe('VideoGame');
  expect(ld.url).toBe(canonical);
  for (const asset of [
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/images/ogp.jpg',
    '/sitemap.xml',
    '/robots.txt',
  ]) {
    expect((await request.get(asset)).ok(), asset).toBe(true);
  }
  const missing = await request.get('/missing-page');
  expect(missing.status()).toBe(404);
  const recovery = await request.get('/404.html');
  expect(await recovery.text()).toContain('ゲームに戻る');
});

test('game starts without API or external asset requests', async ({ page }) => {
  const failures = [],
    errors = [],
    unexpected = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.includes('/api/') ||
      (url.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(url.hostname))
    )
      unexpected.push(request.url());
  });
  await openGame(page);
  await expect(page.locator('#crystal-viewport canvas')).toBeVisible();
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test('share links and clipboard fallback work on a narrow screen', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openGame(page);
  for (const label of ['Xで共有（新しいタブで開く）', 'LINEで共有（新しいタブで開く）']) {
    const link = page.getByRole('link', { name: label });
    expect(new URL(await link.getAttribute('href')).searchParams.get('url')).toBe(canonical);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await page.locator('#copy-link').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(canonical);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('blocked');
    };
  });
  await page.locator('#copy-link').click();
  await expect(page.locator('#share-url')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('blocked storage does not prevent playing', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'])
      Storage.prototype[method] = () => {
        throw new Error('Storage blocked');
      };
  });
  await openGame(page);
  await expect(page.locator('#crystal-viewport canvas')).toBeVisible();
});

test('failed module loading offers reload and disables gameplay', async ({ page }) => {
  await page.route('**/js/shatter-lab.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#startup-error')).toBeVisible();
  expect(await page.locator('main').evaluate((node) => node.inert)).toBe(true);
});

test('clearing data affects only this game and reloads another tab', async ({ page, context }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openGame(page);
  const other = await context.newPage();
  await other.setViewportSize({ width: 800, height: 600 });
  await other.route('**/js/shatter-lab.js', (route) => route.abort());
  await other.goto('/');
  await expect(other.locator('#startup-error')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('another-game-record', 'preserve'));
  const reloaded = other.waitForEvent('load');
  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([page.waitForEvent('load'), page.locator('#clear-saved-data').click()]);
  await reloaded;
  await expect(other.locator('#startup-error')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('another-game-record'))).toBe('preserve');
});

test('real mouse strike chips glass and retry resets hits', async ({ page }) => {
  await openGame(page);
  const target = await page.evaluate(() =>
    window.crystalLab.snapshot().targets.find((target) => !target.moving),
  );
  expect(target).toBeTruthy();
  const rect = await page.locator('#crystal-viewport').boundingBox();
  await page.mouse.click(rect.x + target.x, rect.y + target.y);
  await expect.poll(() => page.evaluate(() => window.crystalLab.snapshot().hits), { timeout: 20000 }).toBe(1);
  await page.locator('#round-retry').click();
  await expect.poll(() => page.evaluate(() => window.crystalLab.snapshot().hits)).toBe(0);
});

test('shape selection and audio preferences survive a fresh page', async ({ page, context }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openGame(page);
  await page.locator('[data-open-panel="settings"]').click();
  await page.locator('#lab-sound').click();
  await page.locator('#settings-panel [data-close-panel]').click();
  await page.locator('#round-compose').click();
  await page.locator('[data-shape="cascade"]').click();
  await expect.poll(() => page.evaluate(() => window.crystalLab.snapshot().stage.type)).toBe('cascade');
  await page.close();
  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 800, height: 600 });
  await openGame(reopened);
  expect(await reopened.evaluate(() => window.crystalLab.snapshot().stage.type)).toBe('cascade');
  await reopened.locator('[data-open-panel="settings"]').click();
  await expect(reopened.locator('#lab-sound')).toHaveAttribute('aria-pressed', 'false');
});
