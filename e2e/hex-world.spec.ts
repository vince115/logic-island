import { test as base, expect, type Page } from '@playwright/test';

// D.2a preview at /islands/hex; the production /islands map is covered by islands.spec.ts.
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });
const NAMES = ['基礎程式島', '資料結構島', '演算法島'];

test('六角聚落預覽顯示三座聚落，不發出外部請求', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/islands/hex');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('六角聚落');
  for (const name of NAMES) await expect(label(page, name)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: /Hex World 預覽/ })).toBeVisible();
  expect(requests.filter(url => !url.startsWith(new URL(page.url()).origin))).toEqual([]);
  expect(requests.filter(url => url.endsWith('.glb'))).toEqual([]);
});

test('名牌與清單都能聚焦聚落並顯示教材入口', async ({ page }) => {
  await page.goto('/islands/hex');
  await expect(label(page, '資料結構島')).toBeVisible({ timeout: 20_000 });
  await label(page, '資料結構島').click();
  await expect(label(page, '資料結構島')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: '資料結構島教材入口' }).getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: '返回全景' }).click();
  await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /演算法島/ }).click();
  await expect(label(page, '演算法島')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: '演算法島教材入口' }).getByRole('link')).toHaveCount(2);
});

test('點擊聚落地塊即可聚焦該島', async ({ page }) => {
  await page.goto('/islands/hex');
  await expect(label(page, '演算法島')).toBeVisible({ timeout: 20_000 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  // The label floats above the plaza; the tiles sit just below it, scaled with the canvas.
  const box = (await label(page, '演算法島').boundingBox())!, canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + canvas.height * .12);
  await expect(label(page, '演算法島')).toHaveAttribute('aria-pressed', 'true');
});

test('預覽頁可回到正式群島地圖', async ({ page }) => {
  await page.goto('/islands/hex');
  await page.getByRole('link', { name: '回到正式群島地圖' }).click();
  await expect(page).toHaveURL(/\/islands$/);
});
