import { expect, type Page } from '@playwright/test';
import { test as plain } from '@playwright/test';
import { phone, test } from './world-helpers';

/*
 * P9.8a: the world overview's flight to a region ends on the region page's opening view (src/lib/p9/region-opening.ts),
 * and the region's models and landmarks are loaded during the flight, so the switch from the overview's canvas to the
 * page's keeps the map where it is, at the same size, and the page's first frame already has every building.
 *
 * The overview's `canvas.__p9Project(region, x, y, z)` and the region page's `__hexProject(x, y, z)` (both review hooks)
 * say where a point of the region's map is drawn. A map seen along one direction by an orthographic camera is an affine
 * picture of the map, so four points of each frame say where every point is: the test compares the two frames over
 * the screen area both canvases cover. Builds made with LOGIC_ISLAND_P9_PROTOTYPE=1 only.
 */
const P9 = process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1';
const REGIONS = ['cs', 'ai', 'design', 'web', 'sys'] as const;
type Affine = [number, number][];
type Frame = { rect: [number, number, number, number]; affine: Affine; unit?: number };
type Probe = HTMLCanvasElement & { __p9Project: (id: string, x: number, y: number, z: number) => [number, number]; __p9Unit: (id: string) => number; __hexProject?: (x: number, y: number, z: number) => [number, number] };
const BASIS = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]] as const;

/**
 * Before any page script: keeps the overview's last flight frame (when it starts navigating: the flight has ended) and
 * counts what every frame draws, so a test can find the region page's first frame.
 */
function watchSwitch() {
  const w = window as unknown as { __lastWorld?: Frame; __frames: [number, number, number][]; __regionCanvasAt?: number };
  w.__frames = [];
  // Only the screen pass counts (not the shadow map's): draws while no framebuffer of its own is bound.
  let draws = 0, triangles = 0, offscreen = false;
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const bind = proto.bindFramebuffer;
  proto.bindFramebuffer = function (this: WebGL2RenderingContext, ...args: unknown[]) { if (args[0] !== this.READ_FRAMEBUFFER) offscreen = args[1] !== null; return bind.apply(this, args); };
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const own = proto[name];
    proto[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const instanced = name.endsWith('Instanced'), count = Number(name.startsWith('drawArrays') ? args[2] : args[1]);
      if (!offscreen) { draws++; if (args[0] === this.TRIANGLES) triangles += count / 3 * (instanced ? Number(args.at(-1)) : 1); }
      return own.apply(this, args);
    };
  }
  const tick = () => { if (draws) w.__frames.push([performance.now(), draws, triangles]); draws = 0; triangles = 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
    if (/webgl/.test(kind) && !this.closest('[data-fly]')) w.__regionCanvasAt ??= performance.now();
    return (getContext as (...a: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
  } as typeof getContext;
  // Every overview this page shows (a Back makes a new one): its stage turning to `navigating` ends a flight.
  new MutationObserver(records => {
    for (const { target } of records) {
      const stage = target as HTMLElement;
      if (stage.getAttribute('data-fly') !== 'navigating' || w.__lastWorld) continue;
      const canvas = stage.querySelector('canvas') as Probe, id = stage.getAttribute('data-fly-target')!, box = canvas.getBoundingClientRect();
      w.__lastWorld = { rect: [box.left, box.top, box.width, box.height], affine: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]].map(([x, y, z]) => canvas.__p9Project(id, x, y, z)), unit: canvas.__p9Unit(id) };
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-fly'] });
}

/** The region page's frame: where the four basis points are, in viewport px. */
async function regionFrame(page: Page): Promise<Frame> {
  await page.waitForFunction(() => (document.querySelector('canvas') as Probe | null)?.__hexProject, null, { timeout: 30_000 });
  return page.evaluate(basis => {
    const canvas = document.querySelector('canvas') as Probe, box = canvas.getBoundingClientRect();
    return { rect: [box.left, box.top, box.width, box.height] as [number, number, number, number], affine: basis.map(([x, y, z]) => { const [px, py] = canvas.__hexProject!(x, y, z); return [box.left + px, box.top + py] as [number, number]; }) };
  }, BASIS.map(p => [...p]));
}

/** How far apart the two frames draw the same map points (px, the largest over a grid of the shared screen area, on the water and 2 units up), and their scale ratio. */
function compare(world: Frame, region: Frame) {
  const at = (a: Affine, x: number, y: number, z: number) => [0, 1].map(k => a[0][k] + (a[1][k] - a[0][k]) * x + (a[3][k] - a[0][k]) * y + (a[2][k] - a[0][k]) * z);
  const ground = (a: Affine, sx: number, sy: number, y: number) => {
    const ox = a[0][0] + (a[3][0] - a[0][0]) * y, oy = a[0][1] + (a[3][1] - a[0][1]) * y;
    const [m0, m1, m2, m3] = [a[1][0] - a[0][0], a[2][0] - a[0][0], a[1][1] - a[0][1], a[2][1] - a[0][1]], det = m0 * m3 - m1 * m2, rx = sx - ox, ry = sy - oy;
    return [(rx * m3 - m1 * ry) / det, (m0 * ry - m2 * rx) / det];
  };
  const [wl, wt, ww, wh] = world.rect, [rl, rt, rw, rh] = region.rect;
  const x0 = Math.max(wl, rl), x1 = Math.min(wl + ww, rl + rw), y0 = Math.max(wt, rt), y1 = Math.min(wt + wh, rt + rh);
  let jump = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (const y of [0, 2]) {
    const sx = x0 + (x1 - x0) * (.1 + .2 * i), sy = y0 + (y1 - y0) * (.1 + .2 * j), [gx, gz] = ground(region.affine, sx, sy, y), [wx, wy] = at(world.affine, gx, y, gz);
    jump = Math.max(jump, Math.hypot(wx - sx, wy - sy));
  }
  const unit = (a: Affine) => Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
  return { jump, scale: unit(region.affine) / unit(world.affine) };
}

/** Opens a region from the overview by its label (on phones a tap; the web label sits under the zoom buttons there, so it is clicked as a screen reader would). */
async function openFromLabel(page: Page, id: string) {
  const label = page.locator(`[data-target="${id}"]`);
  if (phone()) await label.evaluate(button => (button as HTMLElement).click()); else await label.click();
  await expect(page).toHaveURL(new RegExp(`/${id}$`));
}
async function openWorld(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-target="cs"]')?.style.visibility !== 'hidden', null, { timeout: 30_000 });
}
const lastWorld = (page: Page) => page.evaluate(() => (window as unknown as { __lastWorld?: Frame }).__lastWorld);
/** GLB requests by file. */
function countModels(page: Page) {
  const seen = new Map<string, number>();
  page.on('request', request => { const name = new URL(request.url()).pathname; if (name.endsWith('.glb')) seen.set(name, (seen.get(name) ?? 0) + 1); });
  return seen;
}

test.describe('P9.8a World → Region continuity', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => { await page.addInitScript(watchSwitch); });

  for (const id of REGIONS) test(`${id}: the flight's last frame and the region page's first frame draw the map in the same place, at the same size`, async ({ page }) => {
    await openWorld(page);
    await openFromLabel(page, id);
    const region = await regionFrame(page), world = await lastWorld(page);
    expect(world, 'the overview recorded its last frame').toBeTruthy();
    const { jump, scale } = compare(world!, region);
    test.info().annotations.push({ type: 'switch', description: JSON.stringify({ jump: Math.round(jump * 100) / 100, scale: Math.round(scale * 10000) / 10000, world: world!.rect, region: region.rect }) });
    expect(jump, 'largest jump at the switch (px)').toBeLessThanOrEqual(1);
    expect(Math.abs(scale - 1), 'scale change at the switch').toBeLessThan(.005);
  });

  test('the region page\'s first frame already has every building and tree (CS: GLB buildings and landmarks)', async ({ page }) => {
    const models = countModels(page);
    await openWorld(page);
    await openFromLabel(page, 'cs');
    await regionFrame(page);
    // The page then only redraws what it drew first; nothing arrives later.
    await page.waitForTimeout(2500);
    const { frames, from } = await page.evaluate(() => { const w = window as unknown as { __frames: [number, number, number][]; __regionCanvasAt: number }; return { frames: w.__frames, from: w.__regionCanvasAt }; });
    const drawn = frames.filter(f => f[0] > from), first = drawn[0], last = drawn.at(-1)!;
    expect(drawn.length, 'frames drawn by the region page').toBeGreaterThan(0);
    expect(first[1], 'draw calls in the first frame').toBe(last[1]);
    expect(first[2], 'triangles in the first frame').toBe(last[2]);
    await expect(page.locator('button[aria-label^="聚焦基礎程式島"]')).toHaveAttribute('data-model-source', 'glb');
    // Each GLB file once: preloaded during the flight, read from the cache by the page.
    expect(models.size, 'GLB files').toBeGreaterThan(0);
    for (const [file, count] of models) expect(count, file).toBe(1);
  });

  test('after zooming and panning the overview, the flight still ends on the region page\'s opening view', async ({ page }) => {
    await openWorld(page);
    const stage = page.locator('[data-view]'), box = (await stage.boundingBox())!;
    if (phone()) {
      // Phones: zoom with the + button, then the region picker (P9.6) opens the region from the zoomed view.
      await page.getByRole('button', { name: '放大' }).click();
      await page.getByRole('button', { name: '放大' }).click();
      await page.locator('[data-pick="sys"]').click();
      await expect(page).toHaveURL(/\/sys$/);
    } else {
      await page.mouse.move(box.x + box.width * .35, box.y + box.height * .45);
      await page.mouse.wheel(0, -300);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * .35 + 60, box.y + box.height * .45 + 40, { steps: 6 }); await page.mouse.up();
      await expect.poll(async () => Number((await stage.getAttribute('data-view'))!.split(',')[0])).toBeGreaterThan(1.1);
      await page.waitForTimeout(300);
      await page.locator('[data-target="sys"]').evaluate(button => (button as HTMLElement).click());
      await expect(page).toHaveURL(/\/sys$/);
    }
    const { jump, scale } = compare((await lastWorld(page))!, await regionFrame(page));
    expect(jump).toBeLessThanOrEqual(1);
    expect(Math.abs(scale - 1)).toBeLessThan(.005);
  });

  test('Back, another region, Forward: each flight ends in place, and no GLB file is fetched twice', async ({ page }) => {
    const models = countModels(page);
    await openWorld(page);
    await openFromLabel(page, 'cs');
    expect(compare((await lastWorld(page))!, await regionFrame(page)).jump).toBeLessThanOrEqual(1);
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.evaluate(() => { delete (window as unknown as { __lastWorld?: Frame }).__lastWorld; });
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-target="ai"]')?.style.visibility !== 'hidden', null, { timeout: 30_000 });
    await openFromLabel(page, 'ai');
    expect(compare((await lastWorld(page))!, await regionFrame(page)).jump).toBeLessThanOrEqual(1);
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/ai$/);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    for (const [file, count] of models) expect(count, file).toBe(1);
  });

  test('quick repeated clicks open one region once', async ({ page }) => {
    test.skip(phone(), 'mouse: desktop');
    const models = countModels(page);
    await openWorld(page);
    const before = await page.evaluate(() => history.length);
    await page.locator('[data-target="cs"]').click();
    await page.locator('[data-target="cs"]').click({ force: true }).catch(() => {});
    await page.locator('[data-target="ai"]').click({ force: true }).catch(() => {});
    await expect(page).toHaveURL(/\/cs$/);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/cs$/);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    for (const [file, count] of models) expect(count, file).toBe(1);
  });

});

/*
 * Without the shared console guard: the failed GLB requests and the loader's report of them are the point of this test.
 * Any other console error still fails it.
 */
plain.describe('P9.8a a region whose models fail to load', () => {
  plain.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  plain.use({ reducedMotion: 'no-preference' });
  plain('the region still opens, with placeholder buildings and its island list', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*.glb', route => route.abort());
    await openWorld(page);
    await openFromLabel(page, 'cs');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await expect(page.locator('button[aria-label^="聚焦基礎程式島"]')).toHaveAttribute('data-model-source', 'geometry', { timeout: 30_000 });
    if (!info.project.name.startsWith('mobile')) await expect(page.locator('[data-island-choice]')).toHaveCount(8);
    expect(errors.filter(e => !/^Failed to load resource|^Could not load \/models\/.+\.glb/.test(e)), 'errors besides the failed GLB requests').toEqual([]);
  });
});

test.describe('P9.8a reduced motion', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test.use({ reducedMotion: 'reduce' });
  test('opens the region at once, with no flight, and its models are fetched once', async ({ page }) => {
    const models = countModels(page);
    await openWorld(page);
    const states: string[] = [];
    await page.exposeFunction('__flyState', (state: string) => { states.push(state); });
    await page.evaluate(() => { const stage = document.querySelector('[data-fly]')!; new MutationObserver(() => (window as unknown as { __flyState: (s: string) => void }).__flyState(stage.getAttribute('data-fly') ?? '')).observe(stage, { attributes: true, attributeFilter: ['data-fly'] }); });
    await openFromLabel(page, 'cs');
    expect(states, 'no flight').not.toContain('flying');
    await expect(page.locator('button[aria-label^="聚焦基礎程式島"]')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    for (const [file, count] of models) expect(count, file).toBe(1);
  });
});
