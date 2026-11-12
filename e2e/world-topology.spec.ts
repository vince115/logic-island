import { expect, type Page } from '@playwright/test';
import { getIsland, getRegion, islandsInRegion, orderedRegions } from '../src/content/world';
import type { RegionId } from '../src/content/world/types';
import { boxCoversLand, boxesOverlap, lineHitsBox, type Box, type StageLine } from '../src/lib/islands/regions/overview-labels';
import { MAPPED_REGION_IDS, REGION_LAYOUTS } from '../src/lib/islands/regions/region-layouts';
import { WORLD_MAP, bridgedRegions, worldLinks } from '../src/lib/islands/regions/world-map';
import { frameOverview, overviewLinks, overviewOutlines, stageLands, stageLines } from '../src/lib/islands/regions/world-overview-geometry';
import { ON, expectLabelsClear, islandBoxes, openRegion, phone, test } from './world-helpers';

/*
 * P8.3 (docs/planning/P8_3_WORLD_TOPOLOGY_AND_NAVIGATION.md): the world's topology on the overview (the hub joined to
 * every region, relation bridges between neighbours), region selection and navigation, label collisions at each
 * reviewed size, and the phone acceptance checks of the region maps (320, 375 and 390 px), which look at the region
 * as a whole, at a focused island, at the labels, the touch targets, the camera's bounds and whatever lies over the map.
 * Runs against a build made with LOGIC_ISLAND_REGIONAL_WORLD=1, with the same variable set.
 */
const short = (name: string) => name.replace(/群島$/, '');
const regionName = (id: RegionId) => getRegion(id)!.name;

/** The overview as the page drew it, and the same stage worked out here from the world map: they must agree. */
async function overviewStage(page: Page) {
  const dom = await page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('[data-links]')!, r = wrap.getBoundingClientRect();
    const rect = (e: Element) => { const b = e.getBoundingClientRect(); return { x: b.x - r.x, y: b.y - r.y, width: b.width, height: b.height }; };
    return { shape: wrap.dataset.shape as 'wide' | 'tall', compact: wrap.dataset.compact === 'true', width: wrap.clientWidth, height: wrap.clientHeight, lines: JSON.parse(wrap.dataset.links!) as StageLine[],
      labels: [...wrap.querySelectorAll<HTMLElement>('button[data-target]')].map(b => ({ id: b.dataset.target!, side: b.dataset.side, visible: getComputedStyle(b).visibility !== 'hidden', touch: parseFloat(getComputedStyle(b, '::before').height), ...rect(b) })),
      guide: (() => { const g = document.querySelector('nav[aria-label="世界導覽"]')!.getBoundingClientRect(); return { x: g.x - r.x, y: g.y - r.y, width: g.width, height: g.height }; })() };
  });
  const outlines = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, dom.shape), frame = frameOverview(outlines, dom.shape, { width: dom.width, height: dom.height }, dom.shape === 'wide' ? 360 : 0);
  return { ...dom, outlines, lands: stageLands(frame, outlines), expected: stageLines(frame, overviewLinks(WORLD_MAP, outlines), dom.shape) };
}
/** P8.3 rule 6 and the label rules on the real page: every label shown, on the stage, apart, off the islands, off the links. */
async function expectOverviewClear(page: Page, size: string) {
  await expect(page.locator('[data-links]')).toBeVisible({ timeout: 30_000 });
  const problems = (stage: Awaited<ReturnType<typeof overviewStage>>) => {
    const out: string[] = [];
    if (stage.labels.filter(l => l.visible).length !== orderedRegions.length + 1) out.push('labels not placed yet');
    // What the page drew is what the world map says: the same links, where the geometry puts them.
    if (stage.lines.map(l => l.id).join() !== worldLinks(WORLD_MAP).map(l => l.id).join()) out.push(`links ${stage.lines.map(l => l.id).join()}`);
    for (const [i, line] of stage.lines.entries()) for (const key of ['x0', 'y0', 'x1', 'y1'] as const) if (Math.abs(line[key] - (stage.expected[i]?.[key] ?? NaN)) > 1.5) out.push(`${line.id} ${key} is ${line[key]}, the world map puts it at ${stage.expected[i]?.[key]}`);
    for (const line of stage.lines) if (!(Math.min(line.x0, line.x1) >= 0 && Math.max(line.x0, line.x1) <= stage.width && Math.min(line.y0, line.y1) >= 0 && Math.max(line.y0, line.y1) <= stage.height)) out.push(`${line.id} 不在場景內`);
    for (const [i, label] of stage.labels.entries()) {
      const box: Box = label;
      if (!(box.x >= -1 && box.x + box.width <= stage.width + 1 && box.y >= -1 && box.y + box.height <= stage.height + 1)) out.push(`${label.id} 標籤不在場景內`);
      for (const other of stage.labels.filter((o, j) => j > i && boxesOverlap(box, o))) out.push(`${label.id} 與 ${other.id} 標籤重疊`);
      for (const line of stage.lines.filter(l => lineHitsBox(l, box, 1))) out.push(`${label.id} 標籤壓到 ${line.id}`);
      for (const [j, land] of stage.lands.entries()) if (boxCoversLand(box, land)) out.push(`${label.id} 標籤蓋住 ${stage.outlines[j].id} 的島`);
      if (stage.shape === 'wide' && boxesOverlap(box, stage.guide)) out.push(`${label.id} 標籤在導覽下`);
      // A short label is a 44 px touch target through the area around it.
      if (stage.compact ? label.touch !== 44 : label.height < 44) out.push(`${label.id} 觸控高度不足`);
      if (label.width < 44) out.push(`${label.id} 寬度 ${label.width}`);
    }
    return out;
  };
  // The stage is framed, then its labels measured and placed, over a few frames (again after a resize): the rules
  // hold once it has settled.
  await expect.poll(async () => problems(await overviewStage(page)), { timeout: 15_000, message: `${size} 世界總覽` }).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${size} 無水平捲動`).toBeLessThanOrEqual(0);
  return overviewStage(page);
}

test.describe('P8.3 world topology', () => {
  test.skip(!ON, 'built without LOGIC_ISLAND_REGIONAL_WORLD=1');

  test('overview: the hub is linked to every region and relation bridges join neighbours, on the map and in words', async ({ page }) => {
    await page.goto('/world');
    const stage = await expectOverviewClear(page, 'default');
    expect(stage.lines.filter(l => l.kind === 'hub')).toHaveLength(orderedRegions.length);
    expect(stage.lines.filter(l => l.kind === 'relation').map(l => l.id)).toEqual(WORLD_MAP.bridges.map(b => b.id));
    // A causeway is drawn wider than a relation bridge.
    expect(Math.min(...stage.lines.filter(l => l.kind === 'hub').map(l => l.width))).toBeGreaterThan(Math.max(...stage.lines.filter(l => l.kind === 'relation').map(l => l.width)));
    // The guide says the same without the 3D map.
    const links = page.getByRole('region', { name: '世界橋樑' });
    await expect(links).toContainText(`樞紐橋中央樞紐通往全部 ${orderedRegions.length} 個群島`);
    for (const bridge of WORLD_MAP.bridges) await expect(links).toContainText(`${short(regionName(bridge.between[0]))} ↔ ${short(regionName(bridge.between[1]))}`);
    await expect(links).toContainText('沒有關聯橋相連的群島，經中央樞紐前往。');
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', new RegExp(`中央樞紐以樞紐橋連接 ${orderedRegions.length} 個群島.*${WORLD_MAP.bridges.length} 座關聯橋`));
  });

  test('overview labels at each reviewed size: on the stage, apart, off every island and every link', async ({ page }) => {
    test.setTimeout(120_000);
    const sizes = phone() ? [[390, 844], [375, 812], [320, 568]] : [[1440, 1000], [1280, 800], [1024, 768]];
    await page.goto('/world');
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const stage = await expectOverviewClear(page, `${width}×${height}`);
      // Short labels wherever the free part of the stage is narrow; a region's label keeps to its own side when it can.
      expect(stage.compact, `${width}`).toBe(width < 1080);
      expect(stage.shape, `${width}`).toBe(width > 780 ? 'wide' : 'tall');
    }
  });

  test('region selection: each region opens from its label and from the guide, back returns to the overview; the hub opens the labs', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/world');
    for (const region of orderedRegions) {
      const label = page.getByRole('button', { name: `進入${region.name}`, exact: true });
      await expect(label).toBeVisible({ timeout: 30_000 });
      if (phone()) await label.tap(); else await label.click();
      await expect(page).toHaveURL(new RegExp(`/world/${region.id}$`));
      await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/world$/);
      await page.getByRole('navigation', { name: '世界導覽' }).locator(`a[data-region-entry="${region.id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/world/${region.id}$`));
      await page.goBack();
      await expect(page).toHaveURL(/\/world$/);
    }
    const hub = page.getByRole('button', { name: '前往中央樞紐：互動實驗島', exact: true });
    await expect(hub).toBeVisible({ timeout: 30_000 });
    if (phone()) await hub.tap(); else await hub.click();
    await expect(page).toHaveURL(/\/learn$/);
  });

  test('keyboard: Tab walks the labels in registry order, the hub last; Enter opens the region', async ({ page }) => {
    test.skip(phone(), '鍵盤操作在桌機驗證');
    await page.goto('/world');
    const first = page.getByRole('button', { name: `進入${orderedRegions[0].name}`, exact: true });
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.focus();
    for (const region of orderedRegions.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: `進入${region.name}`, exact: true })).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '前往中央樞紐：互動實驗島', exact: true })).toBeFocused();
    await page.getByRole('button', { name: `進入${orderedRegions[1].name}`, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/world/${orderedRegions[1].id}$`));
  });

  test('a region map offers the regions its bridges reach; every other region is reached through the world overview', async ({ page }) => {
    test.setTimeout(180_000);
    for (const id of MAPPED_REGION_IDS) {
      await openRegion(page, `/world/${id}`);
      const more = page.getByRole('navigation', { name: `${regionName(id)}以外` });
      const reached = bridgedRegions(WORLD_MAP, id);
      await expect(more.locator('a[data-bridge-to]')).toHaveCount(reached.length);
      for (const other of reached) {
        await expect(more.locator(`a[data-bridge-to="${other}"]`)).toHaveAttribute('href', `/world/${other}`);
        await expect(more.locator(`a[data-bridge-to="${other}"]`)).toContainText(regionName(other));
        await expect(more.locator(`a[data-bridge-to="${other}"]`)).toContainText('關聯橋 · 相鄰群島');
      }
      await expect(more.locator('a[href="/world"]')).toContainText('樞紐橋 · 其他群島');
      // No link to a region this one has no bridge to.
      for (const other of MAPPED_REGION_IDS.filter(o => o !== id && !reached.includes(o))) await expect(more.locator(`a[href="/world/${other}"]`)).toHaveCount(0);
    }
    // Along a bridge, then through the hub: CS to AI directly, AI to design by way of the overview.
    await openRegion(page, '/world/cs');
    await page.getByRole('navigation', { name: `${regionName('cs')}以外` }).locator('a[data-bridge-to="ai"]').click();
    await expect(page).toHaveURL(/\/world\/ai$/);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('navigation', { name: `${regionName('ai')}以外` }).locator('a[href="/world"]').click();
    await expect(page).toHaveURL(/\/world$/);
    // Reached from the AI region, the overview puts the keyboard focus on its entry.
    await expect(page.locator('a[data-region-entry="ai"]')).toBeFocused();
    await page.locator('a[data-region-entry="design"]').click();
    await expect(page).toHaveURL(/\/world\/design$/);
  });
});

/* ------------------------------------------------------------------ phone acceptance of the region maps */

const PHONES = [[320, 568], [375, 812], [390, 844]] as const;
/** The floor for an island in the region overview: a touch target. Telling one island from another there is the pins' and the list's job; the 88 px target is the focused island's. */
const TOUCH = 44, FOCUSED = 88;

/** What lies over the map: of a grid of points on the canvas, those whose topmost element is neither the map nor one of its pins. */
const coveredPoints = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector('canvas')!, c = canvas.getBoundingClientRect(), covered: string[] = [];
  let total = 0;
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const x = c.x + c.width * i / 12, y = c.y + c.height * j / 12;
    if (y < 0 || y > innerHeight) continue;
    total++;
    const top = document.elementFromPoint(x, y);
    if (top && top !== canvas && !top.closest('button[aria-label^="聚焦"]')) covered.push(top.tagName);
  }
  return { covered: covered.length, total };
});
/** The focused island on the canvas, and what could hide it: the subjects sheet over the map's lower part, if open. */
async function focusedIsland(page: Page, region: RegionId, id: string) {
  const box = (await islandBoxes(page, region))[id];
  const around = await page.evaluate(([x0, y0, x1, y1]) => {
    const canvas = document.querySelector('canvas')!, c = canvas.getBoundingClientRect();
    const sheet = document.querySelector('aside[class*="subjectsFloating"]')?.getBoundingClientRect();
    const top = document.elementFromPoint(c.x + (x0 + x1) / 2, c.y + (y0 + y1) / 2);
    return { width: c.width, height: c.height, sheetTop: sheet ? sheet.y - c.y : null, sheetShare: sheet ? sheet.height / c.height : 0,
      // The map is the canvas and what the scene hangs over it (other islands' pins, place names): all inside the
      // element that takes the map's keys. A caption, a sheet or a list over the island's middle is none of these.
      centerOnMap: Boolean(top?.closest('[aria-label^="地圖鍵盤操作"]')), stageInView: c.y >= -1 && c.bottom <= innerHeight + 1 };
  }, [box.x0, box.y0, box.x1, box.y1]);
  const floor = around.sheetTop ?? around.height;
  return { box, ...around, clear: box.width >= FOCUSED && box.x0 >= -1 && box.x1 <= around.width + 1 && box.y0 >= -1 && box.y1 <= floor + 1 };
}

test.describe('P8.3 phone acceptance of the region maps', () => {
  test.skip(!ON, 'built without LOGIC_ISLAND_REGIONAL_WORLD=1');

  for (const [width, height] of PHONES) {
    test(`${width} px: every region reads as a whole, every island focuses to at least ${FOCUSED} px clear of what lies over the map`, async ({ page }) => {
      test.skip(!phone(), '只在手機');
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height });
      for (const region of MAPPED_REGION_IDS) {
        const islands = islandsInRegion(region), at = `${width} ${region}`;
        await openRegion(page, `/world/${region}`);

        // 1. The region as a whole: every island on the stage, the region filling most of its width, every island at
        //    least a touch target, and one pin per island to tell them apart.
        await expect.poll(async () => Object.values(await islandBoxes(page, region)).every(b => b.width >= TOUCH), { timeout: 15_000, message: `${at} 總覽已就緒` }).toBe(true);
        const canvas = (await page.locator('canvas').boundingBox())!;
        const boxes = await islandBoxes(page, region), all = Object.values(boxes);
        for (const [id, box] of Object.entries(boxes)) {
          expect(box.x0 >= -1 && box.x1 <= canvas.width + 1 && box.y0 >= -1 && box.y1 <= canvas.height + 1, `${at} ${id} 在地圖內`).toBe(true);
          expect(box.width, `${at} ${id} 總覽寬度`).toBeGreaterThanOrEqual(TOUCH);
        }
        const span = Math.max(...all.map(b => b.x1)) - Math.min(...all.map(b => b.x0));
        // The islands alone, without the pins that hang beside them and the sea kept around them, take at least 70% of the width.
        expect(span / canvas.width, `${at} 群島佔場景寬度`).toBeGreaterThanOrEqual(.7);
        // 2 and 3. Pins: one per island, apart and on the map, each a 44 px touch target.
        const pins = page.locator('button[aria-label^="聚焦"]');
        await expect(pins).toHaveCount(islands.length);
        await expectLabelsClear(page);
        for (const target of await pins.evaluateAll(list => list.map(b => { const s = getComputedStyle(b, '::before'); return [parseFloat(s.width), parseFloat(s.height)]; }))) expect(target, `${at} 圖釘觸控區`).toEqual([TOUCH, TOUCH]);
        // 4. The other touch targets of the page: the island list, the map's buttons and the header's two tools.
        const targets = await page.evaluate(() => {
          // A target's size is its own box or the invisible area around it (::before), whichever is larger.
          const size = (e: Element) => { const r = e.getBoundingClientRect(), area = getComputedStyle(e, '::before');
            return { name: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 16), width: Math.max(r.width, parseFloat(area.width) || 0), height: Math.max(r.height, parseFloat(area.height) || 0) }; };
          return [...document.querySelectorAll('[aria-label="選擇學習島嶼"] button, [class*="stageActions"] button, .header-tools a, .header-tools button, nav[aria-label$="以外"] a')].map(size);
        });
        expect(targets.length, at).toBeGreaterThanOrEqual(islands.length + 4);
        for (const target of targets) {
          expect(target.height, `${at} ${target.name} 高度`).toBeGreaterThanOrEqual(TOUCH);
          expect(target.width, `${at} ${target.name} 寬度`).toBeGreaterThanOrEqual(TOUCH);
        }
        // 6. Nothing lies over the map in the overview: the caption is above it, the controls and the list below.
        const over = await coveredPoints(page);
        expect(over.covered / over.total, `${at} 總覽被遮住的比例`).toBeLessThanOrEqual(.02);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${at} 無水平捲動`).toBeLessThanOrEqual(0);

        // 5. Camera bounds, driven through the map's own keys: panned as far as it goes the map's middle stays on the
        //    stage, zoomed out as far as it goes the region is still whole and large on it, and 0 brings the overview back.
        const map = page.getByRole('group', { name: /^地圖鍵盤操作/ });
        // How much of the region is still on the stage: the islands whose middle is inside it.
        const onStage = async () => Object.values(await islandBoxes(page, region)).filter(b => (b.x0 + b.x1) / 2 > 0 && (b.x0 + b.x1) / 2 < canvas.width && (b.y0 + b.y1) / 2 > 0 && (b.y0 + b.y1) / 2 < canvas.height).length;
        await map.focus();
        for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
          for (let i = 0; i < 30; i++) await page.keyboard.press(key);
          // The first presses moved the map; the rest ran into its bounds, with part of the region still in view.
          await expect(page.getByRole('button', { name: '返回全景' }), `${at} ${key}`).toBeEnabled();
          await expect.poll(onStage, { message: `${at} ${key} 邊界` }).toBeGreaterThanOrEqual(1);
          await page.keyboard.press('0');
          await expect.poll(onStage, { message: `${at} ${key} 後回到全景` }).toBe(islands.length);
        }
        // Zoomed out as far as it goes (the whole map fits at any turn, at 85%): the region is whole on the stage and
        // still spans two fifths of its width.
        // (Each press zooms from what the last frame drew, so the presses are a frame apart.)
        const spanNow = async () => { const now = Object.values(await islandBoxes(page, region)); return now.every(b => b.x0 >= -1 && b.x1 <= canvas.width + 1 && b.y0 >= -1 && b.y1 <= canvas.height + 1) ? (Math.max(...now.map(b => b.x1)) - Math.min(...now.map(b => b.x0))) / canvas.width : 0; };
        let farthest = await spanNow();
        for (let i = 0; i < 16; i++) { await page.keyboard.press('-'); await page.waitForTimeout(80); const next = await spanNow(); if (i > 2 && Math.abs(next - farthest) < .002) break; farthest = next; }
        expect(farthest, `${at} 最遠縮放`).toBeLessThan(span / canvas.width);
        await expect.poll(spanNow, { message: `${at} 最遠縮放` }).toBeGreaterThanOrEqual(.4);
        test.info().annotations.push({ type: 'farthest zoom', description: `${at}: ${(await spanNow()).toFixed(2)} of the stage width` });
        await page.keyboard.press('0');
        await expect.poll(async () => Math.abs((await islandBoxes(page, region))[islands[0].id].width - boxes[islands[0].id].width), { message: `${at} 回到全景` }).toBeLessThanOrEqual(1);
        await expect(page.getByRole('button', { name: '返回全景' })).toBeDisabled();

        // 2 and 6. Every island, focused through the address: at least 88 px wide, whole on the stage, above the
        //    subjects sheet when one is open, its middle not under anything, and the map still in the window.
        for (const island of islands) {
          await page.evaluate(id => history.pushState(null, '', `?island=${id}`), island.id);
          await expect(page.getByRole('region', { name: `${island.name}教材入口` })).toBeVisible();
          await expect.poll(async () => (await focusedIsland(page, region, island.id)).clear, { timeout: 15_000, message: `${at} ${island.id} 聚焦後完整可見且 ≥ ${FOCUSED}px` }).toBe(true);
          const focused = await focusedIsland(page, region, island.id);
          expect(focused.centerOnMap, `${at} ${island.id} 中心未被遮住`).toBe(true);
          expect(focused.stageInView, `${at} ${island.id} 地圖在視窗內`).toBe(true);
          // A sheet may take the lower part of the map, never most of it.
          expect(focused.sheetShare, `${at} ${island.id} 面板佔地圖比例`).toBeLessThanOrEqual(.6);
          expect(Boolean(focused.sheetTop), `${at} ${island.id} 只有已開放的島有科目面板`).toBe(getIsland(island.id)!.status !== 'planned');
        }
      }
    });
  }

  test('phones: closing the subjects sheet gives the focused island the whole map; the list is below the map, not over it', async ({ page }) => {
    test.skip(!phone(), '只在手機');
    await openRegion(page, '/world/cs?island=databases');
    await expect.poll(async () => (await focusedIsland(page, 'cs', 'databases')).clear, { timeout: 15_000 }).toBe(true);
    const withSheet = await focusedIsland(page, 'cs', 'databases');
    expect(withSheet.sheetTop).not.toBeNull();
    expect(withSheet.box.y1).toBeLessThanOrEqual(withSheet.sheetTop! + 1);
    await page.getByRole('button', { name: '關閉科目清單' }).tap();
    await expect(page.locator('aside[class*="subjectsFloating"]')).toHaveCount(0);
    // Framed in the whole stage again: lower on it and at least as large.
    await expect.poll(async () => { const now = await focusedIsland(page, 'cs', 'databases'); return now.clear && now.box.y1 > withSheet.box.y1 && now.box.width >= withSheet.box.width - 1; }, { timeout: 15_000 }).toBe(true);
    // The island list and the map never share a spot on a single-column screen.
    const [canvas, list] = await page.evaluate(() => [document.querySelector('canvas')!, document.querySelector('[aria-label="選擇學習島嶼"]')!].map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    expect(list.top).toBeGreaterThanOrEqual(canvas.bottom - 1);
    // The header's 清單 button hides the list and shows it again; the map stays.
    const toggle = page.locator('.header-tools button');
    await toggle.tap();
    await expect(page.getByRole('group', { name: '選擇學習島嶼' })).toHaveCount(0);
    await expect(page.locator('canvas')).toBeVisible();
    await toggle.tap();
    await expect(page.getByRole('group', { name: '選擇學習島嶼' })).toBeVisible();
  });
});
