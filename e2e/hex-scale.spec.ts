import { test as base, expect, type Page } from '@playwright/test';

// Island Scale & World Composition Prototype at /islands/hex/scale/{19,37}; preview only.
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
const marker = (page: Page, node: string) => page.locator(`[data-anchor="${node}"]`);

async function focusFoundations(page: Page, variant: string) {
  await page.goto(`/islands/hex/scale/${variant}`);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await label(page, '基礎程式島').click();
  await expect(marker(page, 'Anchor_Workshop')).toBeVisible();
  await page.locator('canvas').scrollIntoViewIfNeeded();
}
async function clickNear(page: Page, node: string, dy: number) {
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
    for (const node of ['Anchor_Workshop', 'Anchor_Lighthouse', 'Anchor_Entry']) {
      const box = (await marker(page, node).boundingBox())!;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(hit, node).toBe('CANVAS');
    }
  });

  test(`${variant} 格：燈塔與碼頭顯示說明，工坊前往 /learn`, async ({ page }) => {
    await focusFoundations(page, variant);
    await clickNear(page, 'Anchor_Lighthouse', -.08);
    await expect(page.getByRole('status').filter({ hasText: '基礎程式島的地標' })).toBeVisible();
    await page.getByRole('button', { name: '關閉燈塔說明' }).click();
    // Scale finding: at 37 tiles the dock is too small to hit reliably on a 390 px phone.
    if (!(variant === '37' && test.info().project.name.startsWith('mobile'))) {
      await clickNear(page, 'Anchor_Entry', -.02);
      await expect(page.getByRole('status').filter({ hasText: '群島的入口' })).toBeVisible();
      await page.getByRole('button', { name: '關閉碼頭說明' }).click();
    }
    await clickNear(page, 'Anchor_Workshop', -.08);
    await expect(page).toHaveURL(/\/learn$/);
  });
}
