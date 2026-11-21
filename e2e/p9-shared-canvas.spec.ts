import { expect, test as plain, type Page } from '@playwright/test';
import { phone, test } from './world-helpers';

/*
 * P9.8c: the P9 world (`/`) and the CS page (`/cs`) share one canvas (src/components/p9/shared-stage.tsx), in a build
 * made with LOGIC_ISLAND_P9_PROTOTYPE=1 and LOGIC_ISLAND_P9_SHARED_CANVAS=1 only. The canvas element and its WebGL
 * context stay through every change between the two, the camera is handed over both ways, and a lost context leaves a
 * way to go on without 3D. The other four regions keep a canvas of their own.
 */
const SHARED = process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1' && process.env.LOGIC_ISLAND_P9_SHARED_CANVAS === '1';
type Affine = [number, number][];
type Frame = { rect: [number, number, number, number]; affine: Affine };
const BASIS = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]];

/** Before any page script: counts WebGL contexts made and tags each, and notes when each scene takes the canvas over. */
function watchCanvas() {
  const w = window as unknown as { __contexts: number; __marks: Record<string, unknown> };
  w.__contexts = 0; w.__marks = {};
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
    const context = (get as (...a: unknown[]) => (RenderingContext & { __n?: number }) | null).call(this, kind, ...rest);
    if (context && /webgl/.test(kind) && !context.__n) context.__n = ++w.__contexts;
    return context;
  } as typeof get;
}
const contexts = (page: Page) => page.evaluate(() => (window as unknown as { __contexts: number }).__contexts);
/** The one canvas, tagged the first time it is seen, so a test can tell it is still the same element and context. */
const tagCanvas = (page: Page) => page.evaluate(() => { const c = document.querySelector('canvas') as HTMLCanvasElement & { __tag?: string }; c.__tag ??= 'first'; return (c.getContext('webgl2') as unknown as { __n: number }).__n; });
const sameCanvas = (page: Page) => page.evaluate(() => {
  const all = document.querySelectorAll('canvas'), c = all[0] as (HTMLCanvasElement & { __tag?: string }) | undefined;
  return { canvases: all.length, tag: c?.__tag ?? null, context: c ? (c.getContext('webgl2') as unknown as { __n: number }).__n : null };
});
/** HTML overlays (drei Html roots) in the canvas's event element, and those left empty. */
const overlays = (page: Page) => page.evaluate(() => {
  const host = document.querySelector('canvas')?.parentElement?.parentElement;
  const all = [...(host?.querySelectorAll(':scope > div') ?? [])].filter(d => (d as HTMLElement).style.transform.startsWith('translate3d'));
  return { count: all.length, empty: all.filter(d => !d.children.length).length };
});
async function openWorld(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (label => Boolean(label) && label!.style.visibility !== 'hidden')(document.querySelector<HTMLElement>('[data-target="cs"]')), null, { timeout: 30_000 });
}
/** Opens CS from the world by its label (a screen reader's click on phones, where the zoom buttons can cover labels). */
async function flyToCs(page: Page) {
  const label = page.locator('[data-target="cs"]');
  if (phone()) await label.evaluate(b => (b as HTMLElement).click()); else await label.click();
  await expect(page).toHaveURL(/\/cs$/);
  await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
}
const csFrame = (page: Page) => page.evaluate(basis => {
  const c = document.querySelector('canvas') as HTMLCanvasElement & { __hexProject: (x: number, y: number, z: number) => [number, number] }, b = c.getBoundingClientRect();
  return { rect: [b.left, b.top, b.width, b.height], affine: basis.map(([x, y, z]) => { const [px, py] = c.__hexProject(x, y, z); return [b.left + px, b.top + py]; }) } as Frame;
}, BASIS);
/** The largest screen distance between two frames' pictures of the same map points (a grid over the screen both show), and their scale ratio. */
function compare(from: Frame, to: Frame) {
  const at = (a: Affine, x: number, y: number, z: number) => [0, 1].map(k => a[0][k] + (a[1][k] - a[0][k]) * x + (a[3][k] - a[0][k]) * y + (a[2][k] - a[0][k]) * z);
  const ground = (a: Affine, sx: number, sy: number, y: number) => {
    const ox = a[0][0] + (a[3][0] - a[0][0]) * y, oy = a[0][1] + (a[3][1] - a[0][1]) * y;
    const [m0, m1, m2, m3] = [a[1][0] - a[0][0], a[2][0] - a[0][0], a[1][1] - a[0][1], a[2][1] - a[0][1]], det = m0 * m3 - m1 * m2, rx = sx - ox, ry = sy - oy;
    return [(rx * m3 - m1 * ry) / det, (m0 * ry - m2 * rx) / det];
  };
  const [fl, ft, fw, fh] = from.rect, [tl, tt, tw, th] = to.rect, x0 = Math.max(fl, tl), x1 = Math.min(fl + fw, tl + tw), y0 = Math.max(ft, tt), y1 = Math.min(ft + fh, tt + th);
  let jump = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (const y of [0, 2]) {
    const sx = x0 + (x1 - x0) * (.1 + .2 * i), sy = y0 + (y1 - y0) * (.1 + .2 * j), [gx, gz] = ground(to.affine, sx, sy, y), [fx, fy] = at(from.affine, gx, y, gz);
    jump = Math.max(jump, Math.hypot(fx - sx, fy - sy));
  }
  const unit = (a: Affine) => Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
  return { jump, scale: unit(to.affine) / unit(from.affine) };
}

test.describe('P9.8c shared canvas: one canvas for the world and CS', () => {
  test.skip(!SHARED, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1 and LOGIC_ISLAND_P9_SHARED_CANVAS=1');
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => { await page.addInitScript(watchCanvas); });

  test('World → CS → Back → Forward → list → 3D: the same canvas and WebGL context throughout, labels whole and never doubled', async ({ page }) => {
    test.setTimeout(60_000);
    await openWorld(page);
    expect(await tagCanvas(page)).toBe(1);
    await flyToCs(page);
    expect(await sameCanvas(page)).toEqual({ canvases: 1, tag: 'first', context: 1 });
    await expect.poll(() => overlays(page)).toEqual({ count: 8, empty: 0 });
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.waitForFunction(() => (label => Boolean(label) && label!.style.visibility !== 'hidden')(document.querySelector<HTMLElement>('[data-target="cs"]')), null, { timeout: 30_000 });
    expect(await sameCanvas(page)).toEqual({ canvases: 1, tag: 'first', context: 1 });
    // The world draws no overlays of its own in the canvas (its labels are the page's): none left behind by CS.
    expect(await overlays(page)).toEqual({ count: 0, empty: 0 });
    await page.goForward();
    await expect(page).toHaveURL(/\/cs$/);
    await expect.poll(() => overlays(page)).toEqual({ count: 8, empty: 0 });
    expect(await sameCanvas(page)).toEqual({ canvases: 1, tag: 'first', context: 1 });
    // CS's island list (the header's 清單 button) shut and opened again: the map stays in the same canvas, labels whole.
    const list = page.getByRole('button', { name: /清單/ }).first();
    await list.click(); await list.click();
    await expect.poll(() => overlays(page)).toEqual({ count: 8, empty: 0 });
    expect(await sameCanvas(page)).toEqual({ canvases: 1, tag: 'first', context: 1 });
    expect(await contexts(page)).toBe(1);
  });

  test('the camera is handed over both ways: World → CS and CS → World keep the map in place (≤ 1 px, same scale)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __lastWorld?: Frame };
      new MutationObserver(() => {
        const stage = document.querySelector('[data-shared-stage="world"]');
        if (stage?.getAttribute('data-fly') !== 'navigating' || w.__lastWorld) return;
        const c = document.querySelector('canvas') as HTMLCanvasElement & { __p9Project: (id: string, x: number, y: number, z: number) => [number, number] }, b = c.getBoundingClientRect();
        w.__lastWorld = { rect: [b.left, b.top, b.width, b.height], affine: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]].map(([x, y, z]) => c.__p9Project('cs', x, y, z)) };
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-fly'] });
    });
    await openWorld(page);
    await flyToCs(page);
    await page.waitForFunction(() => (document.querySelector('canvas') as unknown as { __hexProject?: unknown } | null)?.__hexProject);
    await page.waitForTimeout(1500);
    const cs = await csFrame(page), lastWorld = await page.evaluate(() => (window as unknown as { __lastWorld: Frame }).__lastWorld);
    const toCs = compare(lastWorld, cs);
    test.info().annotations.push({ type: 'world → cs', description: JSON.stringify(toCs) });
    expect(toCs.jump).toBeLessThanOrEqual(1); expect(Math.abs(toCs.scale - 1)).toBeLessThan(.005);
    // Back: the world's first frame shows what CS showed, then it flies back to the whole world at rest.
    await page.evaluate(() => {
      const w = window as unknown as { __firstWorld?: Frame };
      new MutationObserver((_, observer) => {
        if (!document.querySelector('[data-shared-stage="world"]')) return;
        observer.disconnect();
        requestAnimationFrame(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement & { __p9Project: (id: string, x: number, y: number, z: number) => [number, number] }, b = c.getBoundingClientRect();
          w.__firstWorld = { rect: [b.left, b.top, b.width, b.height], affine: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]].map(([x, y, z]) => c.__p9Project('cs', x, y, z)) };
        });
      }).observe(document, { subtree: true, childList: true });
    });
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.waitForFunction(() => (window as unknown as { __firstWorld?: unknown }).__firstWorld);
    const toWorld = compare(cs, await page.evaluate(() => (window as unknown as { __firstWorld: Frame }).__firstWorld));
    test.info().annotations.push({ type: 'cs → world', description: JSON.stringify(toWorld) });
    expect(toWorld.jump).toBeLessThanOrEqual(1); expect(Math.abs(toWorld.scale - 1)).toBeLessThan(.005);
    await expect(page.locator('[data-view]')).toHaveAttribute('data-fly', 'idle', { timeout: 5_000 });
    await expect(page.locator('[data-view]')).toHaveAttribute('data-view', '1.000,0.0,0.0');
    expect(await contexts(page)).toBe(1);
  });

  test('quick changes back and forth leave one canvas, one context and whole labels', async ({ page }) => {
    await openWorld(page);
    await tagCanvas(page);
    await flyToCs(page);
    // Each change as soon as the address has changed, without waiting for the scene.
    for (let i = 0; i < 3; i++) {
      await page.goBack(); await expect(page).toHaveURL(/:\d+\/$/);
      await page.goForward(); await expect(page).toHaveURL(/\/cs$/);
    }
    await expect(page).toHaveURL(/\/cs$/);
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await expect.poll(() => overlays(page)).toEqual({ count: 8, empty: 0 });
    expect(await sameCanvas(page)).toEqual({ canvases: 1, tag: 'first', context: 1 });
  });

  test('a direct load of /cs, then the world: the same canvas goes on', async ({ page }) => {
    await page.goto('/cs');
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await tagCanvas(page);
    await page.getByRole('link', { name: '返回世界總覽' }).click();
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.waitForFunction(() => (label => Boolean(label) && label!.style.visibility !== 'hidden')(document.querySelector<HTMLElement>('[data-target="cs"]')), null, { timeout: 30_000 });
    expect(await sameCanvas(page)).toEqual({ canvases: 1, tag: 'first', context: 1 });
  });

  test('the other regions keep a canvas of their own: World → AI releases the shared canvas', async ({ page }) => {
    await openWorld(page);
    await page.locator('[data-target="ai"]').evaluate(b => (b as HTMLElement).click());
    await expect(page).toHaveURL(/\/ai$/);
    await expect(page.locator('button[aria-label^="聚焦"]').first()).toBeAttached({ timeout: 30_000 });
    expect((await sameCanvas(page)).canvases).toBe(1);
    expect(await page.locator('[data-shared-canvas]').count(), 'no shared canvas container on /ai').toBe(0);
    expect(await contexts(page), 'the world\'s context, then the AI page\'s own').toBe(2);
  });
});

/*
 * Context loss. The shared console guard is left out: the lost context is the point, and Chromium reports it. Any
 * other console error still fails.
 */
plain.describe('P9.8c shared canvas: a lost WebGL context', () => {
  plain.skip(!SHARED, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1 and LOGIC_ISLAND_P9_SHARED_CANVAS=1');
  plain.beforeEach(async ({ page }) => { await page.addInitScript(watchCanvas); });
  const loseContext = (page: Page) => page.evaluate(() => (document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')! as { loseContext: () => void }).loseContext());
  const errorsBesidesContextLoss = (page: Page) => { const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/WebGL|context/i.test(m.text())) errors.push(m.text()); }); return errors; };

  plain('on the world: no frozen picture, the guide takes over (by keyboard), nothing rebuilds by itself, retry brings 3D back', async ({ page }) => {
    const errors = errorsBesidesContextLoss(page);
    await openWorld(page);
    await loseContext(page);
    const notice = page.locator('[role="status"]').filter({ hasText: '3D 場景無法使用' });
    await expect(notice).toBeVisible();
    await expect(page.locator('canvas'), 'the stopped canvas is gone').toHaveCount(0);
    // A restored context brings nothing back by itself, and nothing is rebuilt meanwhile.
    await page.waitForTimeout(1500);
    expect(await contexts(page)).toBe(1);
    // The world's guide is the way on, by keyboard.
    const entry = page.locator('[data-region-entry="cs"]');
    await entry.focus();
    await expect(entry).toBeFocused();
    // Retry first (the user's choice): a new canvas, a new context, the labels back.
    await notice.getByRole('button', { name: '重新載入 3D 地圖' }).click();
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
    await page.waitForFunction(() => (label => Boolean(label) && label!.style.visibility !== 'hidden')(document.querySelector<HTMLElement>('[data-target="cs"]')), null, { timeout: 30_000 });
    expect(await contexts(page)).toBe(2);
    // And the guide, by keyboard, opens CS.
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cs$/);
    expect(errors).toEqual([]);
  });

  plain('on CS: the island list takes over and a published lesson opens by keyboard; retry brings the map back', async ({ page }, info) => {
    const errors = errorsBesidesContextLoss(page);
    await page.goto('/cs');
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await loseContext(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    const retryNotice = page.locator('[role="status"]').filter({ hasText: '3D 地圖已停止' });
    await expect(retryNotice).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await contexts(page), 'nothing rebuilt by itself').toBe(1);
    // The explorer's own list: the islands (the basics island chosen by keyboard), and its way to the archipelago's
    // overview without 3D, which leads to each island's syllabus and so to every published lesson; one opens, all by
    // keyboard. (The list names no lessons itself: the region explorer's list as it was before P9.8c, the same on P9.8b.)
    const island = page.locator('[data-island-choice="foundations"]');
    await expect(island).toBeVisible({ timeout: 10_000 });
    await island.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cs\?island=foundations$/);
    const overview = page.getByRole('link', { name: /程式與資訊群島清單總覽/ });
    await overview.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/regions\/cs$/);
    const syllabus = page.locator('main a[href="/curriculum#island-foundations"]');
    await syllabus.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/curriculum#island-foundations$/);
    const lesson = page.locator('main a[href^="/curriculum/"]').filter({ visible: true }).first();
    await expect(lesson).toBeVisible({ timeout: 10_000 });
    const href = (await lesson.getAttribute('href'))!;
    test.info().annotations.push({ type: 'lesson', description: `${info.project.name}: ${href}` });
    await lesson.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const back of [/\/curriculum#island-foundations$/, /\/regions\/cs$/]) { await page.goBack(); await expect(page).toHaveURL(back); }
    // Back on the map's page, still without 3D until asked: retry brings the map back, in a new context.
    await page.goBack();
    await expect(page).toHaveURL(/\/cs\?island=foundations$/);
    await expect(page.locator('canvas'), 'nothing rebuilt by itself on the way').toHaveCount(0);
    await retryNotice.getByRole('button', { name: '重新載入 3D 地圖' }).click();
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('button[aria-label^="聚焦"]').first()).toBeAttached({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  plain('focus in the map moves to the notice that replaces it (Tab then reaches retry); a page that opens lost leaves focus alone', async ({ page }) => {
    const errors = errorsBesidesContextLoss(page);
    const retryButton = { name: '重新載入 3D 地圖' };
    // The world: a region's label has focus when the context goes.
    await openWorld(page);
    await page.locator('[data-target="cs"]').focus();
    await loseContext(page);
    const worldNotice = page.locator('[role="status"]').filter({ hasText: '3D 場景無法使用' });
    await expect(worldNotice, 'focus moves to the world\'s notice').toBeFocused();
    await page.keyboard.press('Tab');
    await expect(worldNotice.getByRole('button', retryButton)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
    // CS (reached in the page, so Back stays in it): an island's button in the map has focus when the context goes.
    await page.waitForFunction(() => (label => Boolean(label) && label!.style.visibility !== 'hidden')(document.querySelector<HTMLElement>('[data-target="cs"]')), null, { timeout: 30_000 });
    await flyToCs(page);
    await page.locator('button[aria-label^="聚焦"]').first().focus();
    await loseContext(page);
    const csNotice = page.locator('[role="status"]').filter({ hasText: '3D 地圖已停止' });
    await expect(csNotice, 'focus moves to the CS notice').toBeFocused();
    await page.keyboard.press('Tab');
    await expect(csNotice.getByRole('button', retryButton)).toBeFocused();
    // Back to the world, which opens with the canvas already lost: its notice shows, focus is not moved to it.
    await page.goBack();
    await expect(worldNotice).toBeVisible();
    await expect(worldNotice).not.toBeFocused();
    expect(errors).toEqual([]);
  });

  plain('a context lost on CS is lost for the world too: Back shows the guide, not an empty stage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-region-entry="cs"]').click();
    await expect(page).toHaveURL(/\/cs$/);
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await loseContext(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.locator('[role="status"]').filter({ hasText: '3D 場景無法使用' })).toBeVisible();
    await expect(page.locator('[data-region-entry="cs"]')).toBeVisible();
    expect(await contexts(page)).toBe(1);
  });
});
