import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

// Island Scale & World Composition Prototype at /islands/hex/scale/{19,37}; preview only.
// 37 tiles is the refined candidate (hit proxies, HTML targets, merged routes); 19 is the reference.
const GLB = '/models/islands/basics-island.v2.1.glb';
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
const marker = (page: Page, node: string) => page.locator(`span[data-anchor="${node}"]`);
const poi = (page: Page, node: string) => page.getByRole('region', { name: '基礎程式島地點' }).locator(`button[data-target="${node}"]`);
const info = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

async function focusFoundations(page: Page, variant: string) {
  await page.goto(`/islands/hex/scale/${variant}`);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await label(page, '基礎程式島').click();
  await expect(marker(page, 'Anchor_Workshop')).toBeVisible();
}
/** Taps the canvas `dy` canvas-heights from a marker, with the canvas on screen and the marker settled. */
async function clickNear(page: Page, node: string, dy: number) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  let box = await marker(page, node).boundingBox();
  await expect.poll(async () => {
    const next = await marker(page, node).boundingBox();
    const settled = Boolean(box && next && Math.abs(box.x - next.x) < 0.5 && Math.abs(box.y - next.y) < 0.5);
    box = next;
    return settled;
  }, { intervals: [100] }).toBe(true);
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2 + dy * canvas.height);
}

for (const variant of ['19', '37']) {
  test(`${variant} 格：三座聚落載入，只請求本站資源`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(`/islands/hex/scale/${variant}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('島嶼尺度原型');
    for (const name of ['基礎程式島', '資料結構島', '演算法島']) await expect(label(page, name)).toBeVisible({ timeout: 20_000 });
    await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
    expect(requests.filter(url => !url.startsWith(new URL(page.url()).origin))).toEqual([]);
    await expect(page.getByRole('link', { name: `${variant} 格` })).toHaveAttribute('aria-current', 'page');
  });

  test(`${variant} 格：聚焦後只顯示精簡標記，且不攔截點擊`, async ({ page }) => {
    await focusFoundations(page, variant);
    await expect(marker(page, 'Anchor_Workshop')).toHaveText('工坊');
    await expect(marker(page, 'Anchor_Lighthouse')).toHaveText('燈塔');
    await expect(marker(page, 'Anchor_Entry')).toHaveText('碼頭');
    await page.locator('canvas').scrollIntoViewIfNeeded();
    for (const node of ['Anchor_Workshop', 'Anchor_Lighthouse', 'Anchor_Entry']) {
      const box = (await marker(page, node).boundingBox())!;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(hit, node).toBe('CANVAS');
    }
  });

  test(`${variant} 格：在 3D 場景點燈塔、碼頭顯示說明，點工坊前往 /learn`, async ({ page }) => {
    await focusFoundations(page, variant);
    // 37 tiles mirrors the info in the HTML panel; on phones the 3D bubble is hidden so it covers nothing.
    const bubbleShown = !(variant === '37' && test.info().project.name.startsWith('mobile'));
    await clickNear(page, 'Anchor_Lighthouse', -.08);
    await expect(info(page, '基礎程式島的地標')).toBeVisible();
    await expect(page.locator('div[data-target="Landmark_Lighthouse"]')).toBeVisible({ visible: bubbleShown });
    await page.getByRole('button', { name: '關閉燈塔說明' }).click();
    await expect(info(page, '基礎程式島的地標')).toHaveCount(0);
    await clickNear(page, 'Anchor_Entry', -.02);
    await expect(info(page, '群島的入口')).toBeVisible();
    await expect(page.locator('div[data-target="Dock_Entry"]')).toBeVisible({ visible: bubbleShown });
    await page.getByRole('button', { name: '關閉碼頭說明' }).click();
    await clickNear(page, 'Anchor_Workshop', -.08);
    await expect(page).toHaveURL(/\/learn$/);
  });
}

test('37 格：HTML 地點入口以觸控或鍵盤操作，結果與 3D 點擊相同', async ({ page }) => {
  const phone = test.info().project.name.startsWith('mobile');
  await page.goto('/islands/hex/scale/37');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await expect(page.getByRole('region', { name: '基礎程式島地點' })).toHaveCount(0);
  // Select the island without the canvas: the side list is a plain button.
  await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /基礎程式島/ }).click();
  await expect(poi(page, 'Building_Workshop')).toBeVisible();
  // Touch on phones, keyboard on desktop.
  const activate = async (node: string) => {
    if (phone) await poi(page, node).tap();
    else { await poi(page, node).focus(); await page.keyboard.press('Enter'); }
  };
  await activate('Landmark_Lighthouse');
  await expect(info(page, '基礎程式島的地標')).toBeVisible();
  await expect(poi(page, 'Landmark_Lighthouse')).toHaveAttribute('aria-expanded', 'true');
  // The 3D bubble opens for the same target (desktop; on phones the panel alone shows it).
  await expect(page.locator('div[data-target="Landmark_Lighthouse"]')).toBeVisible({ visible: !phone });
  if (!phone) {
    // Tab moves on to the next target; Enter opens it and replaces the previous info.
    await page.keyboard.press('Tab');
    await expect(poi(page, 'Dock_Entry')).toBeFocused();
    await page.keyboard.press('Enter');
  } else await poi(page, 'Dock_Entry').tap();
  await expect(info(page, '群島的入口')).toBeVisible();
  await expect(info(page, '基礎程式島的地標')).toHaveCount(0);
  const close = page.getByRole('button', { name: '關閉碼頭說明' });
  if (phone) await close.tap(); else { await close.focus(); await page.keyboard.press('Enter'); }
  await expect(info(page, '群島的入口')).toHaveCount(0);
  await activate('Building_Workshop');
  await expect(page).toHaveURL(/\/learn$/);
});

base('37 格：GLB 載入失敗時回到暫代建築，HTML 地點入口仍可使用', async ({ page }) => {
  await page.route(`**${GLB}`, route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/islands/hex/scale/37');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 20_000 });
  await label(page, '基礎程式島').click();
  await expect(marker(page, 'Anchor_Workshop')).toHaveCount(0);
  await poi(page, 'Landmark_Lighthouse').click();
  await expect(info(page, '基礎程式島的地標')).toBeVisible();
  await poi(page, 'Building_Workshop').click();
  await expect(page).toHaveURL(/\/learn$/);
});

base('37 格：必要契約節點缺失時回到暫代建築', async ({ page }) => {
  const bytes = readFileSync(`public${GLB}`);
  const broken = Buffer.from(bytes.toString('latin1').replace('"Anchor_Lighthouse"', '"Anchor_Lighthousx"'), 'latin1');
  await page.route(`**${GLB}`, route => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: broken }));
  await page.goto('/islands/hex/scale/37');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 20_000 });
  await label(page, '基礎程式島').click();
  await expect(marker(page, 'Anchor_Workshop')).toHaveCount(0);
  await expect(poi(page, 'Dock_Entry')).toBeVisible();
});
