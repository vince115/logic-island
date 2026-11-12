import { expect, type Page } from '@playwright/test';

/**
 * D.3: the safety net every world-map explorer keeps, shared by the production page and the hex explorer specs:
 * list mode, the WebGL fallbacks and the lessons that must stay reachable without 3D.
 */
export const modes = (page: Page) => page.getByRole('group', { name: '地圖導航模式' });
export const chooseIsland = (page: Page, name: string) => page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: new RegExp(name) });

/** Every lesson stays reachable from the list: three islands, five lessons, and (on /islands) BFS from the page note. */
export async function expectLessonsReachable(page: Page, { bfs = true } = {}) {
  for (const [name, lessons] of [['資料結構島', 3], ['演算法島', 2]] as const) {
    await chooseIsland(page, name).click();
    await expect(page.getByRole('region', { name: `${name}教材入口` }).getByRole('link')).toHaveCount(lessons);
  }
  await chooseIsland(page, '基礎程式島').click();
  await expect(page.getByRole('region', { name: '基礎程式島教材入口' }).getByRole('link', { name: /瀏覽學習路線/ })).toBeVisible();
  if (bfs) await expect(page.getByRole('link', { name: '原有教材頁' })).toHaveAttribute('href', '/learn/bfs');
}

/** The page has given up on 3D: notice shown, 3D switch disabled, list mode on, no canvas, lessons reachable. */
export async function expectListFallback(page: Page, options?: { bfs?: boolean }) {
  await expect(page.getByRole('status').filter({ hasText: '此裝置的 3D 場景無法使用' })).toBeVisible({ timeout: 20_000 });
  await expect(modes(page).getByRole('button', { name: '3D 群島' })).toBeDisabled();
  await expect(modes(page).getByRole('button', { name: '清單' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expectLessonsReachable(page, options);
}

/** As on a device without WebGL: every WebGL context request fails, so the renderer throws while mounting. */
export async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : (getContext as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof getContext;
  });
}

/** Loses the running scene's WebGL context, as when the GPU process resets. */
export async function loseWebGLContext(page: Page) {
  await page.evaluate(() => (document.querySelector('canvas')!.getContext('webgl2') as WebGL2RenderingContext).getExtension('WEBGL_lose_context')!.loseContext());
}
