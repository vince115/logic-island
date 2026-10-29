import { readFileSync } from 'node:fs';
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
const anchor = (page: Page, node: string) => page.locator(`[data-anchor="${node}"]`);
const NAMES = ['基礎程式島', '資料結構島', '演算法島'];
const GLB = '/models/islands/basics-island.v2.1.glb';

async function openFoundations(page: Page) {
  await page.goto('/islands/hex');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await label(page, '基礎程式島').click();
  await expect(anchor(page, 'Anchor_Workshop')).toBeVisible();
  await page.locator('canvas').scrollIntoViewIfNeeded();
}
/** Clicks the canvas `dy` canvas-heights from an anchor label once the label has stopped moving. */
async function clickNear(page: Page, node: string, dy: number) {
  let box = await anchor(page, node).boundingBox();
  await expect.poll(async () => {
    const next = await anchor(page, node).boundingBox();
    const settled = Boolean(box && next && Math.abs(box.x - next.x) < 0.5 && Math.abs(box.y - next.y) < 0.5);
    box = next;
    return settled;
  }, { intervals: [100] }).toBe(true);
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2 + dy * canvas.height);
}

test('六角聚落預覽顯示三座聚落，只請求本站 GLB', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/islands/hex');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('六角聚落');
  for (const name of NAMES) await expect(label(page, name)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: /Hex World 預覽/ })).toBeVisible();
  expect(requests.filter(url => !url.startsWith(new URL(page.url()).origin))).toEqual([]);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  expect(requests.filter(url => url.endsWith('.glb')).map(url => new URL(url).pathname)).toEqual([GLB]);
  expect(requests.filter(url => /draco|gstatic|meshopt/i.test(url))).toEqual([]);
  // Only the foundations island migrated; the other two keep their placeholders.
  await expect(label(page, '資料結構島')).toHaveAttribute('data-model-source', 'geometry');
  await expect(label(page, '演算法島')).toHaveAttribute('data-model-source', 'geometry');
});

test('名牌與清單都能聚焦聚落並顯示教材入口', async ({ page }) => {
  await page.goto('/islands/hex');
  await expect(label(page, '資料結構島')).toBeVisible({ timeout: 20_000 });
  await label(page, '資料結構島').click();
  // A focused settlement hides its own name label; the side panel shows its lessons.
  await expect(label(page, '資料結構島')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '資料結構島教材入口' }).getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: '返回全景' }).click();
  await expect(label(page, '資料結構島')).toBeVisible();
  await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /演算法島/ }).click();
  await expect(label(page, '演算法島')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '演算法島教材入口' }).getByRole('link')).toHaveCount(2);
});

test('點擊聚落地塊即可聚焦該島', async ({ page }) => {
  await page.goto('/islands/hex');
  await expect(label(page, '演算法島')).toBeVisible({ timeout: 20_000 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  // The label floats above the plaza; the tiles sit just below it, scaled with the canvas.
  const box = (await label(page, '演算法島').boundingBox())!, canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + canvas.height * .12);
  await expect(page.getByRole('region', { name: '演算法島教材入口' })).toBeVisible();
});

test('預覽頁可回到正式群島地圖', async ({ page }) => {
  await page.goto('/islands/hex');
  await page.getByRole('link', { name: '回到正式群島地圖' }).click();
  await expect(page).toHaveURL(/\/islands$/);
});

test('基礎程式島 GLB 建築：Anchor 標籤只定位，不攔截點擊', async ({ page }) => {
  await openFoundations(page);
  await expect(anchor(page, 'Anchor_Lighthouse')).toHaveText('燈塔');
  await expect(anchor(page, 'Anchor_Entry')).toHaveText('碼頭');
  await expect(anchor(page, 'Anchor_Route_Exit')).toHaveCount(0);
  for (const node of ['Anchor_Workshop', 'Anchor_Lighthouse', 'Anchor_Entry']) {
    const box = (await anchor(page, node).boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit, node).toBe('CANVAS');
  }
});

test('燈塔與碼頭顯示說明，工坊前往 /learn', async ({ page }) => {
  await openFoundations(page);
  await clickNear(page, 'Anchor_Lighthouse', -.08);
  await expect(page.getByRole('status').filter({ hasText: '基礎程式島的地標' })).toBeVisible();
  await page.getByRole('button', { name: '關閉燈塔說明' }).click();
  await clickNear(page, 'Anchor_Entry', .02);
  await expect(page.getByRole('status').filter({ hasText: '群島的入口' })).toBeVisible();
  await expect(page).toHaveURL(/\/islands\/hex$/);
  await page.getByRole('button', { name: '關閉碼頭說明' }).click();
  await clickNear(page, 'Anchor_Workshop', -.08);
  await expect(page).toHaveURL(/\/learn$/);
});

base('GLB 載入失敗時基礎程式島回到暫代建築', async ({ page }) => {
  await page.route(`**${GLB}`, route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/islands/hex');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 20_000 });
  await label(page, '基礎程式島').click();
  await expect(page.getByRole('region', { name: '基礎程式島教材入口' })).toBeVisible();
  await expect(anchor(page, 'Anchor_Workshop')).toHaveCount(0);
});

base('必要契約節點缺失時基礎程式島回到暫代建築', async ({ page }) => {
  const bytes = readFileSync(`public${GLB}`);
  const broken = Buffer.from(bytes.toString('latin1').replace('"Anchor_Lighthouse"', '"Anchor_Lighthousx"'), 'latin1');
  await page.route(`**${GLB}`, route => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: broken }));
  await page.goto('/islands/hex');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 20_000 });
});
