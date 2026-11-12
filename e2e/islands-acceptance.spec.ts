import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { chooseIsland, modes } from './fallbacks';

/**
 * D.3-4 automated acceptance (docs/handoff/DEVICE_ACCEPTANCE.md, part A): what a browser can prove without a real
 * phone, on the candidate and the legacy page alike. Page width at 360/390 px, keyboard-only use and accessible names.
 * Real GPU frame rates and touch stay with the device run (part B).
 */
const ROUTES = ['/islands/candidate', '/islands/legacy'];
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
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });

async function load(page: Page, route: string) {
  await page.goto(route);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
}
/** Nothing sticks out sideways: the page cannot be scrolled horizontally. */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** The island the explorer toolbar names (both explorers put it first in the toolbar). */
const toolbarName = (page: Page) => modes(page).evaluate(group => group.closest('section')!.firstElementChild!.firstElementChild!.querySelector('span')!.textContent);
/** Presses Tab until `target` has focus, as a keyboard user would; fails if it is never reached. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab 無法到達：${target}`);
}
/** A keyboard focus ring is drawn (outline or box shadow). */
const focusRing = (target: Locator) => target.evaluate(element => {
  const style = getComputedStyle(element);
  return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
});

for (const route of ROUTES) test.describe(route, () => {
  for (const width of [360, 390]) {
    test(`${width}px：全景、聚焦與清單模式都沒有水平溢出`, async ({ page }) => {
      test.skip(!phone(), '手機寬度');
      await page.setViewportSize({ width, height: 800 });
      await load(page, route);
      expect(await overflow(page), '全景').toBeLessThanOrEqual(0);
      await label(page, '基礎程式島').click();
      await expect.poll(() => toolbarName(page)).toBe('基礎程式島');
      expect(await overflow(page), '聚焦').toBeLessThanOrEqual(0);
      await modes(page).getByRole('button', { name: '清單' }).click();
      for (const name of ['基礎程式島', '資料結構島', '演算法島']) {
        await chooseIsland(page, name).click();
        expect(await overflow(page), `清單：${name}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('鍵盤：Tab 到島嶼名牌按 Enter 聚焦，再 Tab 到「返回全景」按 Enter 回到全景，焦點框可見', async ({ page }) => {
    test.skip(phone(), '鍵盤在桌機驗收');
    await load(page, route);
    const pin = label(page, '資料結構島');
    await tabTo(page, pin);
    expect(await focusRing(pin), '名牌焦點框').toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => toolbarName(page)).toBe('資料結構島');
    const back = page.getByRole('button', { name: '返回全景' });
    await tabTo(page, back);
    expect(await focusRing(back), '返回全景焦點框').toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => toolbarName(page)).toBe('群島全景');
    await expect(label(page, '資料結構島')).toBeVisible();
  });

  test('鍵盤：只用鍵盤切到清單、選島並進入教材', async ({ page }) => {
    test.skip(phone(), '鍵盤在桌機驗收');
    await load(page, route);
    const list = modes(page).getByRole('button', { name: '清單' });
    await tabTo(page, list);
    await page.keyboard.press('Enter');
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('canvas')).toHaveCount(0);
    await tabTo(page, chooseIsland(page, '演算法島'));
    await page.keyboard.press('Enter');
    const lesson = page.getByRole('region', { name: '演算法島教材入口' }).getByRole('link').first();
    await tabTo(page, lesson);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn\/[a-z-]+$/);
  });

  test('無障礙名稱：地圖內每個按鈕與連結都有可讀名稱，地圖區塊與畫布都有標籤', async ({ page }) => {
    await load(page, route);
    const unnamed = (scope: Page) => scope.locator('main').evaluate(main => [...main.querySelectorAll('button, a[href]')]
      .filter(element => !(element.getAttribute('aria-label') ?? element.textContent ?? '').trim())
      .map(element => element.outerHTML.slice(0, 80)));
    expect(await unnamed(page), '3D 模式').toEqual([]);
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /.+/);
    await expect(modes(page)).toBeVisible();
    await label(page, '基礎程式島').click();
    expect(await unnamed(page), '聚焦').toEqual([]);
    await modes(page).getByRole('button', { name: '清單' }).click();
    expect(await unnamed(page), '清單模式').toEqual([]);
  });
});
