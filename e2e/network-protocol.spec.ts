import { test, expect, type Page } from '@playwright/test';
import { lessonsOfIsland } from '../src/content/world/catalog';

/*
 * CN-0: the network-protocol capability on its preview page (built only with LOGIC_ISLAND_NETWORK_PREVIEW=1, never in
 * Vercel Production), on desktop and phone: keyboard stepping, the announced explanation, the nested headers, node
 * tables, reduced motion and the exercises. In every build the networks island's lessons have no page.
 */
const PREVIEW = process.env.LOGIC_ISLAND_NETWORK_PREVIEW === '1';
const phone = () => test.info().project.name.startsWith('mobile');
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const scene = (page: Page, id: string) => page.locator(`[data-network-scene="${id}"]`);

test('計算機網路島仍是規劃中：每堂課都沒有頁面，預覽頁只在預覽建置存在', async ({ page }) => {
  for (const l of lessonsOfIsland('networks').filter((_, i) => i % 5 === 0)) expect((await page.request.get(`/curriculum/${l.slug}`)).status(), l.slug).toBe(404);
  expect((await page.request.get('/preview/network-protocol')).status()).toBe(PREVIEW ? 200 : 404);
});

test('網路協定視覺化：鍵盤逐步、宣告說明、由外到內的標頭與節點表格', async ({ page }) => {
  test.skip(!PREVIEW, 'needs a build with LOGIC_ISLAND_NETWORK_PREVIEW=1');
  await page.goto('/preview/network-protocol');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('網路協定視覺化');
  const http = scene(page, 'preview-http-router');
  const live = http.locator('[aria-live="polite"]');
  await expect(live).toContainText('步驟 1／4：筆電 → 路由器 R1');
  // Keyboard: Tab to the stepper, then the arrow keys and End.
  await http.getByRole('button', { name: /下一步/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(live).toContainText('步驟 2／4：路由器 R1 → 網頁伺服器');
  const packet = http.getByRole('region', { name: /這則訊息的各層標頭/ });
  await expect(packet.locator('[data-layer]')).toHaveCount(4);
  await expect(packet.locator('[data-layer]').first()).toHaveAttribute('data-layer', 'link');
  await expect(packet.locator('[data-layer="network"] dd').nth(2)).toHaveText('63');
  await expect(http.getByRole('table', { name: '路由器 R1：路由表（這一步之後）' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(live).toContainText('步驟 4／4');
  await page.keyboard.press('Home');
  await expect(live).toContainText('步驟 1／4');
  // Choosing a message moves the step too.
  const sw = scene(page, 'preview-switch-learning');
  await sw.getByRole('button', { name: /3\. 主機 B → 交換器/ }).click();
  await expect(sw.getByRole('button', { name: /3\. 主機 B → 交換器/ })).toHaveAttribute('aria-current', 'step');
  await expect(sw.getByRole('table', { name: '交換器：MAC 位址表（這一步之後）' }).locator('tr[data-changed]')).toHaveCount(1);
  // The lost SYN is said in words, not only drawn as a dashed line.
  await expect(scene(page, 'preview-tcp-handshake').getByRole('button', { name: /SYN（遺失）/ })).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('網路協定視覺化：手機以文字列出訊息、不需要水平捲動；減少動態時沒有轉場', async ({ page }) => {
  test.skip(!PREVIEW, 'needs a build with LOGIC_ISLAND_NETWORK_PREVIEW=1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/preview/network-protocol');
  const http = scene(page, 'preview-http-router');
  const first = http.getByRole('button', { name: /1\. 筆電 → 路由器 R1/ });
  await expect(first).toBeVisible();
  // Phones show each message as text; wide screens draw the arrow between the nodes' columns.
  await expect(http.locator('[data-dir]').first()).toBeVisible({ visible: !phone() });
  // The site's reduced-motion rule (globals.css) shortens every transition to 0.01 ms: effectively none.
  expect(parseFloat(await first.evaluate(e => getComputedStyle(e).transitionDuration))).toBeLessThan(0.001);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('網路協定練習：欄位、所在層與子網路的答案從情境讀出或計算', async ({ page }) => {
  test.skip(!PREVIEW, 'needs a build with LOGIC_ISLAND_NETWORK_PREVIEW=1');
  await page.goto('/preview/network-protocol');
  const ttl = page.getByRole('article').filter({ hasText: '經過路由器後的 TTL' });
  await ttl.getByRole('textbox', { name: '欄位的值' }).fill('64');
  await ttl.getByRole('button', { name: '檢查答案' }).click();
  await expect(ttl).toContainText('還沒通過');
  await ttl.getByRole('textbox', { name: '欄位的值' }).fill('63');
  await ttl.getByRole('button', { name: '檢查答案' }).click();
  await expect(ttl).toContainText('正確。');
  const layer = page.getByRole('article').filter({ hasText: 'TCP 在哪一層' });
  await layer.getByRole('radio', { name: /傳輸層/ }).check();
  await layer.getByRole('button', { name: '檢查答案' }).click();
  await expect(layer).toContainText('正確。');
  const subnet = page.getByRole('article').filter({ hasText: '一個 /26 子網路' });
  await subnet.getByRole('textbox', { name: '網路位址' }).fill('192.0.2.128');
  await subnet.getByRole('textbox', { name: '廣播位址' }).fill('192.0.2.191');
  await subnet.getByRole('textbox', { name: '可用主機數' }).fill('62');
  await subnet.getByRole('button', { name: '檢查答案' }).click();
  await expect(subnet).toContainText('正確。');
});
