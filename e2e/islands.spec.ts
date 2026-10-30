import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { expectLessonsReachable, expectListFallback, loseWebGLContext, modes, withoutWebGL } from './fallbacks';

const GLB = '/models/islands/basics-island.v2.1.glb';
// Console and uncaught errors fail the scenarios where the GLB is expected to load.
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const islandLabel = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });
const anchor = (page: Page, node: string) => page.locator(`[data-anchor="${node}"]`);

async function openFoundations(page: Page) {
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await islandLabel(page, '基礎程式島').click();
  await expect(anchor(page, 'Anchor_Workshop')).toBeVisible();
  // The stage extends below the fold on the phone viewport; mouse clicks need on-screen points.
  await page.locator('canvas').scrollIntoViewIfNeeded();
}
/** Clicks the canvas at an offset from an anchor label; the label itself lets the click through. */
async function clickNear(page: Page, node: string, dx: number, dy: number) {
  // Labels follow the camera frame by frame; wait until the label stops moving before aiming.
  let box = await anchor(page, node).boundingBox();
  await expect.poll(async () => {
    const next = await anchor(page, node).boundingBox();
    const settled = Boolean(box && next && Math.abs(box.x - next.x) < 0.5 && Math.abs(box.y - next.y) < 0.5);
    box = next;
    return settled;
  }, { intervals: [100] }).toBe(true);
  if (!box) throw new Error(`${node} label has no box`);
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

test('基礎程式島載入 GLB，不請求外部 Draco decoder', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const glb = page.waitForResponse(response => response.url().endsWith(GLB));
  await page.goto('/islands');
  expect((await glb).status()).toBe(200);
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  expect(requests.filter(url => /draco|gstatic|meshopt/i.test(url))).toEqual([]);
  expect(requests.filter(url => !url.startsWith(new URL(page.url()).origin))).toEqual([]);
});

test('另外兩座島維持原本的幾何模型與教材入口', async ({ page }) => {
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  for (const [name, lessons] of [['資料結構島', 3], ['演算法島', 2]] as const) {
    await expect(islandLabel(page, name)).toHaveAttribute('data-model-source', 'geometry');
    await islandLabel(page, name).click();
    await expect(islandLabel(page, name)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: `${name}教材入口` }).getByRole('link')).toHaveCount(lessons);
    // Focusing one island can push the other labels off-stage; return to the overview first.
    await page.getByRole('button', { name: '返回全景' }).click();
  }
});

test('Anchor 標籤只負責定位，不攔截點擊；route_exit 沒有標籤', async ({ page }) => {
  await openFoundations(page);
  await expect(anchor(page, 'Anchor_Lighthouse')).toHaveText('燈塔');
  await expect(anchor(page, 'Anchor_Entry')).toHaveText('碼頭');
  await expect(anchor(page, 'Anchor_Route_Exit')).toHaveCount(0);
  for (const node of ['Anchor_Workshop', 'Anchor_Lighthouse', 'Anchor_Entry']) {
    const box = (await anchor(page, node).boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit, node).toBe('CANVAS');
  }
  // Clicking exactly on a label reaches the scene, not a label handler: no navigation or info appears.
  await clickNear(page, 'Anchor_Entry', 0, 0);
  await expect(page).toHaveURL(/\/islands$/);
});

test('燈塔與碼頭只顯示簡短說明', async ({ page }) => {
  await openFoundations(page);
  await clickNear(page, 'Anchor_Lighthouse', 0, -40);
  const info = page.getByRole('status').filter({ hasText: '基礎程式島的地標' });
  await expect(info).toBeVisible();
  await expect(page).toHaveURL(/\/islands$/);
  await page.getByRole('button', { name: '關閉燈塔說明' }).click();
  await expect(info).toHaveCount(0);
  // The START marker on the dock, just above its label.
  await clickNear(page, 'Anchor_Entry', 8, -18);
  await expect(page.getByRole('status').filter({ hasText: '群島的入口' })).toBeVisible();
  await expect(page).toHaveURL(/\/islands$/);
});

test('選取基礎程式島後點工坊前往 /learn', async ({ page }) => {
  await openFoundations(page);
  await clickNear(page, 'Anchor_Workshop', 0, -40);
  await expect(page).toHaveURL(/\/learn$/);
});

// D.3-0: the safety net of this page (e2e/fallbacks.ts). Whatever replaces the renderer here must keep all of it.
test('清單模式：不用 3D 也能選島與進入教材，切回 3D 後場景重新載入', async ({ page }) => {
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await modes(page).getByRole('button', { name: '清單' }).click();
  await expect(modes(page).getByRole('button', { name: '清單' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expectLessonsReachable(page);
  await modes(page).getByRole('button', { name: '3D 群島' }).click();
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
});

base('WebGL 無法建立時由 Error Boundary 接住，自動改為清單導航', async ({ page }) => {
  const uncaught: string[] = [];
  page.on('pageerror', error => uncaught.push(error.message));
  await withoutWebGL(page);
  await page.goto('/islands');
  await expectListFallback(page);
  expect(uncaught, '錯誤要由 Error Boundary 接住，不能變成未捕捉錯誤').toEqual([]);
});

base('WebGL context 中途遺失時改為清單導航', async ({ page }) => {
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await loseWebGLContext(page);
  await expectListFallback(page);
});

test('BFS 不屬於任何島，仍可從頁面附註進入原教材頁', async ({ page }) => {
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  const link = page.getByRole('link', { name: '原有教材頁' });
  await expect(link).toHaveAttribute('href', '/learn/bfs');
  await link.click();
  await expect(page).toHaveURL(/\/learn\/bfs$/);
});

base('GLB 載入失敗時恢復原本的幾何模型', async ({ page }) => {
  await page.route(`**${GLB}`, route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 20_000 });
  await islandLabel(page, '基礎程式島').click();
  await expect(anchor(page, 'Anchor_Workshop')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '基礎程式島教材入口' }).getByRole('link', { name: /瀏覽學習路線/ })).toBeVisible();
});

base('必要契約節點缺失時恢復原本的幾何模型', async ({ page }) => {
  // Same-length rename keeps the GLB chunk sizes valid while removing a required node.
  const bytes = readFileSync(`public${GLB}`);
  const broken = Buffer.from(bytes.toString('latin1').replace('"Anchor_Lighthouse"', '"Anchor_Lighthousx"'), 'latin1');
  expect(broken.equals(bytes)).toBe(false);
  await page.route(`**${GLB}`, route => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: broken }));
  await page.goto('/islands');
  await expect(islandLabel(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 20_000 });
  await expect(islandLabel(page, '資料結構島')).toHaveAttribute('data-model-source', 'geometry');
});
