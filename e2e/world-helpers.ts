import { test as base, expect, type Page } from '@playwright/test';
import { hexCorner } from '../src/lib/islands/hex';
import type { RegionId } from '../src/content/world/types';
import { regionLayout } from '../src/lib/islands/regions/region-layouts';

/*
 * Shared by the regional world specs (regional-world.spec.ts, world-topology.spec.ts). The pages exist only in a build
 * made with LOGIC_ISLAND_REGIONAL_WORLD=1; run the specs against such a build with the same variable set.
 */
export const ON = process.env.LOGIC_ISLAND_REGIONAL_WORLD === '1';
/** Fails a test on any console error or uncaught error. */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
export const phone = () => test.info().project.name.startsWith('mobile');
export type Probe = HTMLCanvasElement & { __hexProject: (x: number, y: number, z: number) => [number, number] | { x: number; y: number } };

export async function openRegion(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => typeof (document.querySelector('canvas') as unknown as { __hexProject?: unknown }).__hexProject), { timeout: 30_000 }).toBe('function');
}
export interface IslandBox { x0: number; y0: number; x1: number; y1: number; width: number }
/** Every island's extent on the canvas (px from the canvas's top-left), from its tile corners through the scene's own projection. */
export async function islandBoxes(page: Page, region: RegionId): Promise<Record<string, IslandBox>> {
  const world = regionLayout(region).layout.world;
  const islands = world.settlements.map(s => ({ id: s.islandId, corners: s.tiles.flatMap(t => Array.from({ length: 6 }, (_, i) => hexCorner(t, world.size, i))) }));
  return page.evaluate(list => {
    const canvas = document.querySelector('canvas') as unknown as Probe;
    const xy = (p: [number, number] | { x: number; y: number }) => Array.isArray(p) ? p : [p.x, p.y];
    return Object.fromEntries(list.map(({ id, corners }) => {
      const at = corners.map(([cx, cz]) => xy(canvas.__hexProject(cx, .55, cz))), xs = at.map(p => p[0]), ys = at.map(p => p[1]);
      return [id, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs) }];
    }));
  }, islands);
}
/** Every island's width on screen (px). */
export async function islandWidths(page: Page, region: RegionId) {
  return Object.fromEntries(Object.entries(await islandBoxes(page, region)).map(([id, box]) => [id, box.width]));
}
/** Labels inside the map, apart from each other and (wide screens) clear of the island list over the map. */
export async function expectLabelsClear(page: Page) {
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
