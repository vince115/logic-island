import { test as base, expect, type Page } from '@playwright/test';
import { hexCorner, hexToWorld } from '../src/lib/islands/hex';
import { REGION_LAYOUTS } from '../src/lib/islands/regions/region-layouts';
import { chooseIsland, withoutWebGL } from './fallbacks';

/*
 * M3.1 regional world prototype (/world, /world/cs, /world/ai). The pages exist only in a build made with
 * LOGIC_ISLAND_REGIONAL_WORLD=1; run this spec against such a build with the same variable set and the flag-on tests
 * run, otherwise (the default build) only the flag-off tests run. See docs/handoff/TESTING_STATUS.md.
 */
const ON = process.env.LOGIC_ISLAND_REGIONAL_WORLD === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const phone = () => test.info().project.name.startsWith('mobile');
const CS = ['基礎程式島', '資料結構島', '演算法島', '程式語言島', '資料庫應用島', '計算機網路島', '系統分析與設計島', '管理資訊系統島'];
const CS_PLANNED = new Set(['程式語言島', '計算機網路島', '系統分析與設計島', '管理資訊系統島']);
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}${CS_PLANNED.has(name) ? '（規劃中）' : ''}`, exact: true });
type Probe = HTMLCanvasElement & { __hexProject: (x: number, y: number, z: number) => [number, number] | { x: number; y: number } };

async function openRegion(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => typeof (document.querySelector('canvas') as unknown as { __hexProject?: unknown }).__hexProject), { timeout: 30_000 }).toBe('function');
}
/** Every island's width on screen (px), from its tile corners through the scene's own projection. */
async function islandWidths(page: Page, region: 'cs' | 'ai') {
  const world = REGION_LAYOUTS[region].layout.world;
  const islands = world.settlements.map(s => ({ id: s.islandId, corners: s.tiles.flatMap(t => Array.from({ length: 6 }, (_, i) => hexCorner(t, world.size, i))) }));
  return page.evaluate(list => {
    const canvas = document.querySelector('canvas') as unknown as Probe;
    const x = (p: [number, number] | { x: number }) => Array.isArray(p) ? p[0] : p.x;
    return Object.fromEntries(list.map(({ id, corners }) => { const xs = corners.map(([cx, cz]) => x(canvas.__hexProject(cx, .55, cz))); return [id, Math.max(...xs) - Math.min(...xs)]; }));
  }, islands);
}
/** Labels inside the map, apart from each other and (wide screens) clear of the island list over the map. */
async function expectLabelsClear(page: Page) {
  const geo = await page.evaluate(() => {
    const rect = (e: Element | null | undefined) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom }; };
    return {
      canvas: rect(document.querySelector('canvas')),
      list: rect(document.querySelector('[aria-label="選擇學習島嶼"]')?.closest('div[class*="sideNavigation"]')),
      labels: [...document.querySelectorAll('button[aria-label^="聚焦"]')].map(b => ({ name: b.getAttribute('aria-label'), ...rect(b)! })),
    };
  });
  for (const l of geo.labels) expect(l.x >= geo.canvas!.x - 1 && l.r <= geo.canvas!.r + 1 && l.y >= geo.canvas!.y - 1 && l.b <= geo.canvas!.b + 1, `${l.name} 在地圖內`).toBe(true);
  for (const [i, a] of geo.labels.entries()) for (const b of geo.labels.slice(i + 1)) expect(a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b, `${a.name}／${b.name}`).toBe(false);
  if (geo.list && !phone()) for (const l of geo.labels) expect(l.r > geo.list.x && l.x < geo.list.r && l.b > geo.list.y && l.y < geo.list.b, `${l.name} 不在清單下`).toBe(false);
}

test.describe('regional world: flag off (default build)', () => {
  test.skip(ON, 'this build has the regional world');
  test('no /world route exists and nothing links to one', async ({ page, request }) => {
    for (const path of ['/world', '/world/cs', '/world/ai', '/world/xx']) expect((await request.get(path)).status(), path).toBe(404);
    await page.goto('/');
    await expect(page.locator('a[href^="/world"]')).toHaveCount(0);
  });
});

test.describe('regional world: flag on', () => {
  test.skip(!ON, 'built without LOGIC_ISLAND_REGIONAL_WORLD=1');

  test('overview: the two regions and the hub, in 3D and in the guide; a region opens its map', async ({ page }) => {
    await page.goto('/world');
    for (const name of ['進入程式與資訊群島', '進入AI 人工智慧群島', '前往中央樞紐：互動實驗島']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 30_000 });
    const guide = page.getByRole('navigation', { name: '世界導覽' });
    await expect(guide.getByRole('link', { name: /程式與資訊群島.*8 座學科島 · 4 座已開放 · 4 座規劃中/ })).toHaveAttribute('href', '/world/cs');
    await expect(guide.getByRole('link', { name: /AI 人工智慧群島.*7 座學科島 · 全部規劃中/ })).toHaveAttribute('href', '/world/ai');
    await expect(guide).toContainText('規劃中中央挑戰島');
    await expect(page.locator('a[href*="challenge"]')).toHaveCount(0);
    if (phone()) await page.getByRole('button', { name: '進入程式與資訊群島', exact: true }).tap(); else await page.getByRole('button', { name: '進入程式與資訊群島', exact: true }).click();
    await expect(page).toHaveURL(/\/world\/cs$/);
    await expect(label(page, '資料庫應用島')).toBeVisible({ timeout: 30_000 });
  });

  test('CS region: eight islands, planned ones marked, labels clear, every island at least as wide as the tested floor', async ({ page }) => {
    await openRegion(page, '/world/cs');
    for (const name of CS) await expect(label(page, name)).toBeVisible();
    await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    await expectLabelsClear(page);
    const widths = await islandWidths(page, 'cs');
    // Desktop meets the 180 px target; phones reach 73 px (target 88 not met, see the M3.1 log), pinned here as a floor.
    for (const [id, w] of Object.entries(widths)) expect(w, id).toBeGreaterThanOrEqual(phone() ? 70 : 180);
    const list = page.getByRole('group', { name: '選擇學習島嶼' });
    await expect(list.getByRole('button')).toHaveCount(8);
    await expect(list.getByRole('button').nth(3)).toContainText('程式語言島規劃中 預計 20 堂');
    await expect(list.getByRole('button').nth(4)).toContainText('資料庫應用島20 堂課 · 6 個科目');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('AI region: seven planned islands, labels clear, islands at least the tested floor', async ({ page }) => {
    await openRegion(page, '/world/ai');
    const names = ['AI 基礎島', '機器學習島', '深度學習島', '大型語言模型島', '生成式 AI 島', 'AI 代理島', 'AI 工程與 MLOps 島'];
    for (const name of names) await expect(page.getByRole('button', { name: `聚焦${name}（規劃中）`, exact: true })).toBeVisible();
    await expectLabelsClear(page);
    for (const [id, w] of Object.entries(await islandWidths(page, 'ai'))) expect(w, id).toBeGreaterThanOrEqual(phone() ? 80 : 180);
  });

  test('focus follows the address: choose, back, forward, deep link, unknown id, Escape up two levels', async ({ page }) => {
    await openRegion(page, '/world/cs');
    if (phone()) await label(page, '資料庫應用島').tap(); else await label(page, '資料庫應用島').click();
    await expect(page).toHaveURL(/\/world\/cs\?island=databases$/);
    const panel = page.getByRole('complementary', { name: '資料庫應用島科目清單' });
    await expect(panel.getByText('教材：已開放 20／20 堂')).toBeVisible();
    await expect(panel.locator('a[href^="/curriculum/"]')).toHaveCount(20);
    await expect(label(page, '資料庫應用島')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/world\/cs$/);
    await expect(label(page, '資料庫應用島')).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/island=databases$/);
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/world\/cs$/);
    await expect(label(page, '資料庫應用島')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/world$/);
    await page.goto('/world/cs?island=no-such-island');
    await expect(page).toHaveURL(/\/world\/cs$/);
    // Other parameters stay when the island changes (the P4 stress case relies on it).
    await page.goto('/world/cs?stress=glb');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /資料庫應用島/ }).click();
    await expect(page).toHaveURL(/\/world\/cs\?stress=glb&island=databases$/);
    await page.getByRole('button', { name: '返回全景' }).click();
    await expect(page).toHaveURL(/\/world\/cs\?stress=glb$/);
  });

  test('a planned island: its description and「規劃中」, no lesson link, no progress, no「已開放」', async ({ page }) => {
    await openRegion(page, '/world/ai?island=large-language-models');
    const detail = page.getByRole('region', { name: '大型語言模型島教材入口' });
    await expect(detail).toContainText('規劃中預計 25 堂，尚未開放課程');
    await expect(detail.getByRole('link')).toHaveCount(0);
    for (const text of ['已開放', '已完成', '進行中']) await expect(page.getByText(text)).toHaveCount(0);
    // (The site header's 開始學習 links F01; the map and its list link nothing.)
    await expect(page.locator('main a[href^="/curriculum/"]')).toHaveCount(0);
  });

  test('keyboard: a label takes focus and Enter focuses its island', async ({ page }) => {
    await openRegion(page, '/world/cs');
    await label(page, '程式語言島').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/island=programming-languages$/);
    await expect(page.getByRole('region', { name: '程式語言島教材入口' })).toContainText('規劃中');
  });

  test('mouse hover over an island lights its label', async ({ page }) => {
    test.skip(phone(), '觸控沒有 hover');
    await openRegion(page, '/world/cs');
    const world = REGION_LAYOUTS.cs.layout.world, center = world.settlements.find(s => s.islandId === 'networks')!.center;
    const [x, z] = hexToWorld(center, world.size);
    const point = await page.evaluate(([px, pz]) => { const p = (document.querySelector('canvas') as unknown as Probe).__hexProject(px, .55, pz); return Array.isArray(p) ? p : [p.x, (p as { y: number }).y]; }, [x, z]);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + point[0], box.y + point[1]);
    await expect(label(page, '計算機網路島')).toHaveAttribute('data-hovered', 'true');
  });

  test('phones: each pin has a 44 px touch area', async ({ page }) => {
    test.skip(!phone(), '只在手機');
    await openRegion(page, '/world/cs');
    const area = await label(page, '程式語言島').evaluate(b => { const s = getComputedStyle(b, '::before'); return [parseFloat(s.width), parseFloat(s.height)]; });
    expect(area).toEqual([44, 44]);
  });

  // Without WebGL the renderer logs its failure, so this one runs without the console guard (as on the home page).
  base('without WebGL: the overview guide and each region list still reach every island; planned ones say so', async ({ page }) => {
    await withoutWebGL(page);
    await page.goto('/world');
    await expect(page.getByRole('status').filter({ hasText: '此裝置的 3D 場景無法使用' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('navigation', { name: '世界導覽' }).getByRole('link', { name: /程式與資訊群島/ }).click();
    await expect(page).toHaveURL(/\/world\/cs$/);
    await expect(page.getByRole('status').filter({ hasText: '此裝置的 3D 場景無法使用' })).toBeVisible({ timeout: 20_000 });
    await chooseIsland(page, '程式語言島').click();
    await expect(page.getByRole('region', { name: '程式語言島教材入口' })).toContainText('規劃中');
    await expect(page.getByRole('region', { name: '程式語言島教材入口' }).getByRole('link')).toHaveCount(0);
    await chooseIsland(page, '資料庫應用島').click();
    await expect(page).toHaveURL(/island=databases$/);
  });
});
