import { test as base, expect, type Page } from '@playwright/test';
import { ENVIRONMENTS, SHADOW_HEIGHTS, shadowBox, type EnvironmentId } from '@/lib/islands/environments';
import { placementPose } from '@/lib/islands/hex-buildings';
import { scalePrototypes } from '@/lib/islands/hex-scale-prototype';
import { instrument, type Entry } from '../perf/instrument.mjs';

/*
 * D.3-6a: the lab page (/islands/hex/scale/37) draws what the noon environment data says, and nothing else: its
 * background, no fog, one ambient, hemisphere and shadow-casting sun light, the static shadow map; and the GLB lamps
 * glow from this page's own copy of their material while every other GLB material stays the shared cached one.
 * The lab probe reads the scene (`canvas.__hexEnvironment()`); the candidate page has no probe and is compared pixel
 * for pixel with the previous build instead (logs/2026-10-31-d3-6a-environment.md).
 * D.3-6b adds the time-of-day select (lab only), at the end of this file.
 */
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
type Material = { name: string; glow: number | null; emissive: string | null; color: string | null; meshes: string[] };
type Environment = {
  background: string; fog: unknown;
  lights: { type: string; color: string; intensity: number; ground?: string; position?: number[]; castShadow?: boolean;
    shadow?: { mapSize: number[]; bias: number; normalBias: number; box: number[] } }[];
  shadowMap: { enabled: boolean; type: number; autoUpdate: boolean };
  materials: Material[];
};
const noon = ENVIRONMENTS.noon;
/** three's `PCFShadowMap`, the static shadow map's type; a value here, since importing three into Playwright warns. */
const PCF_SHADOW_MAP = 1;

const LAB = '/islands/hex/scale/37';
async function open(page: Page, route = LAB) {
  await page.goto(route);
  await expect(page.getByRole('button', { name: '聚焦基礎程式島', exact: true })).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
}
const read = (page: Page) => page.evaluate(() => (document.querySelector('canvas') as unknown as { __hexEnvironment: () => Environment }).__hexEnvironment());
async function environment(page: Page) {
  await open(page);
  return read(page);
}

test('實驗室頁（D.3-6a）：背景、光源與陰影設定和中午環境資料一致，沒有霧', async ({ page }) => {
  const scene = await environment(page);
  expect(scene.background).toBe(noon.background);
  expect(scene.fog).toBeNull();
  expect(scene.shadowMap).toEqual({ enabled: true, type: PCF_SHADOW_MAP, autoUpdate: false });
  const byType = Object.fromEntries(scene.lights.map(l => [l.type, l]));
  expect(scene.lights.map(l => l.type).sort()).toEqual(['AmbientLight', 'DirectionalLight', 'HemisphereLight']);
  expect(byType.AmbientLight).toEqual({ type: 'AmbientLight', color: noon.ambient.color, intensity: noon.ambient.intensity });
  expect(byType.HemisphereLight).toEqual({ type: 'HemisphereLight', color: noon.hemisphere.sky, ground: noon.hemisphere.ground, intensity: noon.hemisphere.intensity });
  const sun = byType.DirectionalLight;
  expect(sun).toMatchObject({ color: noon.sun.color, intensity: noon.sun.intensity, position: noon.sun.position, castShadow: true });
  const [left, right, top, bottom, far, near] = sun.shadow!.box;
  expect(sun.shadow).toMatchObject({ mapSize: [noon.shadow.mapSize, noon.shadow.mapSize], bias: noon.shadow.bias, normalBias: noon.shadow.normalBias });
  // The shadow box covers the whole map: ±extent across, 2 less up and down, as before D.3-6a (three's default near).
  expect(noon.shadow.fit).toBe('map');
  expect([left, top, bottom, far, near]).toEqual([-right, right - 2, -(right - 2), noon.shadow.fit === 'map' ? noon.shadow.far : NaN, .5]);
  expect(right).toBeGreaterThanOrEqual(16);
});

test('實驗室頁（D.3-6a）：燈塔兩處發光共用本頁自己的一份暖光材質，其餘 GLB 材質仍與樹木共用快取', async ({ page }) => {
  const { materials } = await environment(page);
  const named = (name: string) => materials.filter(m => m.name === name);
  // One copy of the GLB's warm emission, at the GLB's own strength (glow 1), used by exactly the lighthouse's two glows.
  expect(named('LLv2_Warm_Emission')).toHaveLength(1);
  expect(named('LLv2_Warm_Emission')[0].glow).toBe(2 * noon.glow);
  expect(named('LLv2_Warm_Emission')[0].meshes.sort()).toEqual(['Light_Lantern', 'Lighthouse_WindowGlow']);
  // The palette is not copied: one material for every GLB building and the GLB trees (instanced).
  expect(named('LLv2_Palette_VertexColor')).toHaveLength(1);
  expect(named('LLv2_Palette_VertexColor')[0].glow).toBeNull();
  expect(named('LLv2_Palette_VertexColor')[0].meshes).toContain('InstancedMesh');
  // Glowing materials in the whole scene: that copy and the plaza lanterns (their own material, .35).
  expect(materials.filter(m => m.glow !== null).map(m => [m.name, m.glow]).sort()).toEqual([['', .35 * noon.glow], ['LLv2_Warm_Emission', 2 * noon.glow]]);
});

/*
 * D.3-6b: the lab page's time-of-day select. Each time of day draws what its data says (the sun's shadow box fitted
 * to the map from its direction, and the sea tint), costs no draw call or triangle more than noon, redraws the shadow
 * once per change and then nothing; it leaves Auto Orbit, focus and「返回全景」alone. D.3-6d: the candidate page has the
 * same select (e2e/candidate-integration.spec.ts checks it there without the probe).
 */
const IDS = Object.keys(ENVIRONMENTS) as EnvironmentId[];
const select = (page: Page) => page.getByRole('combobox', { name: '時間情境' });
const phone = () => test.info().project.name.startsWith('mobile');
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __perfEntries: Entry[] }).__perfEntries.slice());
/** Waits until no frame has been drawn for 600 ms. */
async function quiet(page: Page) {
  let last = -1;
  await expect.poll(async () => { const now = (await frames(page)).length, same = now === last; last = now; return same; },
    { intervals: [600], timeout: 15_000 }).toBe(true);
}
type Perf = { calls: number; triangles: number };
const perf = (page: Page, shadows: boolean) => page.evaluate(fresh => (document.querySelector('canvas') as unknown as { __hexPerf: (fresh: boolean) => Perf }).__hexPerf(fresh), shadows);

test('實驗室頁（D.3-6b）：原生選單「時間情境」預設中午，依序列出清晨、中午、黃昏、傍晚；候選頁（D.3-6d 起）相同', async ({ page }) => {
  for (const route of [LAB, '/islands/candidate']) {
    await open(page, route);
    await expect(select(page), route).toHaveValue('noon');
    await expect(select(page).locator('option'), route).toHaveText(['清晨', '中午', '黃昏', '傍晚']);
    expect(await select(page).locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value)), route).toEqual(IDS);
    await expect(page.locator('[data-environment="noon"]'), route).toHaveCount(1);
  }
});

test('實驗室頁（D.3-6b）：每個時間情境畫出自己的資料，陰影範圍依太陽方向取，海面依色調，沒有霧', async ({ page }) => {
  await open(page);
  const extent = (await read(page)).lights.find(l => l.type === 'DirectionalLight')!.shadow!.box[1];
  for (const id of [...IDS.filter(i => i !== 'noon'), 'noon' as const]) {
    const data = ENVIRONMENTS[id];
    await select(page).selectOption(id);
    await expect.poll(async () => (await read(page)).background, id).toBe(data.background);
    const scene = await read(page), byType = Object.fromEntries(scene.lights.map(l => [l.type, l]));
    expect(scene.fog, id).toBeNull();
    expect(scene.lights.map(l => l.type).sort(), id).toEqual(['AmbientLight', 'DirectionalLight', 'HemisphereLight']);
    expect(byType.AmbientLight, id).toEqual({ type: 'AmbientLight', color: data.ambient.color, intensity: data.ambient.intensity });
    expect(byType.HemisphereLight, id).toEqual({ type: 'HemisphereLight', color: data.hemisphere.sky, ground: data.hemisphere.ground, intensity: data.hemisphere.intensity });
    const box = shadowBox(data, extent, SHADOW_HEIGHTS), sun = byType.DirectionalLight;
    expect(sun, id).toMatchObject({ color: data.sun.color, intensity: data.sun.intensity, position: box.position, castShadow: true,
      shadow: { mapSize: [1024, 1024], bias: data.shadow.bias, normalBias: data.shadow.normalBias } });
    sun.shadow!.box.forEach((v, i) => expect(v, `${id} box ${i}`).toBeCloseTo([box.left, box.right, box.top, box.bottom, box.far, box.near][i], 5));
    // The shaded sea quad's colour is the tint itself (white at noon, as before).
    expect(scene.materials.some(m => m.color === data.sea.tint), `${id} sea tint`).toBe(true);
    expect(scene.shadowMap, id).toEqual({ enabled: true, type: PCF_SHADOW_MAP, autoUpdate: false });
  }
});

test('實驗室頁（D.3-6b）：每個時間情境的 draw call 與三角形都和中午相同（主畫面與陰影 pass）', async ({ page }) => {
  await open(page);
  const counts: Record<string, [Perf, Perf]> = {};
  for (const id of ['noon', ...IDS.filter(i => i !== 'noon'), 'noon'] as EnvironmentId[]) {
    await select(page).selectOption(id);
    await expect.poll(async () => (await read(page)).background).toBe(ENVIRONMENTS[id].background);
    counts[id] = [await perf(page, true), await perf(page, false)];
  }
  for (const id of IDS) {
    expect(counts[id][0].calls, `${id} 含陰影`).toBeLessThanOrEqual(counts.noon[0].calls);
    expect(counts[id][0].triangles, `${id} 含陰影三角形`).toBeLessThanOrEqual(counts.noon[0].triangles);
    expect(counts[id][1], `${id} 主畫面`).toEqual(counts.noon[1]);
  }
});

test('實驗室頁（D.3-6b）：切換時間情境時陰影只重畫一次，之後閒置重畫為 0', async ({ page }) => {
  await page.addInitScript(instrument);
  await open(page);
  // Settle P1-29 first (the first change after load may redraw the static shadow one extra time).
  await select(page).selectOption('morning');
  await quiet(page);
  for (const id of ['sunset', 'dusk', 'noon', 'morning'] as EnvironmentId[]) {
    const before = await frames(page);
    await select(page).selectOption(id);
    await quiet(page);
    const after = await frames(page), drawn = after.slice(before.length);
    const passes = drawn.filter((entry, i) => entry.offscreen > (i ? drawn[i - 1] : before.at(-1)!).offscreen).length;
    expect(drawn.length, `${id} 重畫的幀`).toBeGreaterThanOrEqual(1);
    expect(passes, `${id} 陰影 pass`).toBe(1);
    await page.waitForTimeout(1500);
    expect((await frames(page)).length - after.length, `${id} 之後的閒置重畫`).toBe(0);
  }
});

test('實驗室頁（D.3-6b）：切換時間不影響自動旋轉、聚焦與返回全景，返回全景也不改時間', async ({ page }) => {
  await open(page);
  const orbit = page.getByRole('button', { name: '自動旋轉' }), back = page.getByRole('button', { name: '返回全景' });
  await expect(orbit).toBeEnabled();
  if (phone()) await orbit.tap(); else await orbit.click();
  await expect(orbit).toHaveAttribute('aria-pressed', 'true');
  await select(page).selectOption('sunset');
  await expect(orbit).toHaveAttribute('aria-pressed', 'true');
  if (phone()) await back.tap(); else await back.click();
  await expect(orbit).toHaveAttribute('aria-pressed', 'false');
  await expect(select(page)).toHaveValue('sunset');
  await page.getByRole('button', { name: '聚焦資料結構島', exact: true }).click();
  await expect(page.locator('[data-focused="true"]')).toHaveCount(1);
  await select(page).selectOption('dusk');
  await expect(page.locator('[data-focused="true"]')).toHaveCount(1);
  await expect(page.locator('[data-environment="dusk"]')).toHaveCount(1);
  if (phone()) await back.tap(); else await back.click();
  await expect(page.locator('[data-focused="true"]')).toHaveCount(0);
  await expect(select(page)).toHaveValue('dusk');
  // List mode and back: the time of day is the explorer's, so it stays.
  await page.getByRole('group', { name: '地圖導航模式' }).getByRole('button', { name: '清單' }).click();
  await page.getByRole('group', { name: '地圖導航模式' }).getByRole('button', { name: '3D 群島' }).click();
  await expect(select(page)).toHaveValue('dusk');
  await expect.poll(async () => (await read(page).catch(() => null))?.background).toBe(ENVIRONMENTS.dusk.background);
});

test('實驗室頁（D.3-6b）：黃昏與傍晚時地圖標題的文字對比至少 4.5:1（不論後方是哪種畫面）', async ({ page }) => {
  await open(page);
  for (const id of ['sunset', 'dusk'] as const) {
    await select(page).selectOption(id);
    const caption = page.locator(`[data-environment="${id}"] > div`).first();
    // The caption's colours ease in briefly; read them once they have settled.
    await expect.poll(() => caption.evaluate(c => c.getAnimations().length)).toBe(0);
    const ratios = await caption.evaluate(caption => {
      const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => [r, g, b].map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const over = (top: number[], under: number[]) => { const a = top[3] ?? 1; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)); };
      const ratio = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const backing = rgba(getComputedStyle(caption).backgroundColor);
      // The worst case is whatever the map shows behind the backing: white or black.
      return [...caption.querySelectorAll('span, strong')].flatMap(text => {
        const color = rgba(getComputedStyle(text).color);
        return [[255, 255, 255], [0, 0, 0]].map(under => ratio(over(color, over(backing, under)), over(backing, under)));
      });
    });
    expect(ratios.length, id).toBeGreaterThanOrEqual(4);
    for (const ratio of ratios) expect(ratio, id).toBeGreaterThanOrEqual(4.5);
  }
});

test('實驗室頁（D.3-6b）：時間選單可用 Tab 到達，在 360／390 px 與桌機都在地圖內且不溢出', async ({ page }) => {
  for (const width of phone() ? [360, 390] : [0]) {
    if (width) await page.setViewportSize({ width, height: 780 });
    await open(page);
    for (const id of IDS) {
      await select(page).selectOption(id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width || 'desktop'} ${id}`).toBeLessThanOrEqual(0);
    }
    const stage = (await page.locator('canvas').boundingBox())!, box = (await select(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(stage.x);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height);
  }
  if (!phone()) {
    await select(page).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(select(page)).toBeFocused();
  }
});

/*
 * D.3-6c: dusk lamps. The lighthouse lantern and windows (this page's own copy of the GLB warm emission, strength 2)
 * and the plaza's route lanterns (.35) glow at their strength times the environment's glow; nothing else changes, no
 * material is added and no shader compiled however often the time changes, and noon restores them exactly.
 */
const GLOWING = [['', .35, '#f3cf86'], ['LLv2_Warm_Emission', 2, '#ffffff']] as const;
/** A colour times a tint as three does it (in linear space), back to `#rrggbb`. */
const tinted = (color: string, tint: string) => {
  const linear = (hex: string, i: number) => { const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return c < .04045 ? c * .0773993808 : Math.pow(c * .9478672986 + .0521327014, 2.4); };
  const srgb = (c: number) => Math.max(0, Math.min(255, Math.round((c < .0031308 ? c * 12.92 : 1.055 * Math.pow(c, .41666) - .055) * 255)));
  return `#${[0, 1, 2].map(i => srgb(linear(color, i) * linear(tint, i)).toString(16).padStart(2, '0')).join('')}`;
};
const near = (a: string, b: string) => [0, 1, 2].every(i => Math.abs(parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16) - parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16)) <= 1);
test('實驗室頁（D.3-6c）：只有暖光材質隨情境增強，反覆切換不累積、不新增材質或 shader，切回中午恢復原值', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype, link = proto.linkProgram;
    (window as unknown as { __links: number }).__links = 0;
    proto.linkProgram = function (program) { (window as unknown as { __links: number }).__links++; return link.call(this, program); };
  });
  await open(page);
  const links = () => page.evaluate(() => (window as unknown as { __links: number }).__links);
  const glowing = (materials: Material[]) => materials.filter(m => m.glow !== null).map(m => [m.name, m.glow]).sort();
  const emissive = (materials: Material[]) => materials.filter(m => m.glow !== null).sort((a, b) => a.name.localeCompare(b.name)).map(m => m.emissive!);
  const others = (materials: Material[]) => materials.filter(m => m.glow === null).map(m => `${m.name}|${m.color}|${m.meshes.length}`).sort();
  const start = await read(page), programs = await links();
  for (let round = 0; round < 3; round++) for (const id of [...IDS.filter(i => i !== 'noon'), 'noon' as const]) {
    const glow = ENVIRONMENTS[id].glow;
    await select(page).selectOption(id);
    await expect.poll(async () => glowing((await read(page)).materials), `${round} ${id}`).toEqual(GLOWING.map(([name, strength]) => [name, strength * glow]));
    const { materials } = await read(page);
    emissive(materials).forEach((color, i) => expect(near(color, tinted(GLOWING[i][2], ENVIRONMENTS[id].glowTint)), `${round} ${id} ${GLOWING[i][0]} ${color}`).toBe(true));
    expect(materials.length, `${round} ${id} 材質數`).toBe(start.materials.length);
    expect(materials.filter(m => m.name === 'LLv2_Warm_Emission'), `${round} ${id}`).toHaveLength(1);
    expect(materials.filter(m => m.name === 'LLv2_Palette_VertexColor'), `${round} ${id}`).toHaveLength(1);
    // Every material that does not glow is untouched apart from the sea tint (D.3-6b).
    if (id === 'noon') expect(others(materials), `${round} 中午`).toEqual(others(start.materials));
  }
  expect(glowing((await read(page)).materials)).toEqual(glowing(start.materials));
  expect(emissive((await read(page)).materials)).toEqual(emissive(start.materials));
  expect(emissive(start.materials)).toEqual(GLOWING.map(([, , color]) => color));
  expect(await links(), '切換時編譯的 program').toBe(programs);
});

test('實驗室頁（D.3-6c）：手機 360／390 px 的黃昏與傍晚，標題底板不蓋住燈塔', async ({ page }) => {
  test.skip(!phone(), '手機寬度');
  const lab = scalePrototypes['37'], layout = lab.glb.find(l => l.placements.some(p => p.node === 'Landmark_Lighthouse'))!;
  const [x, y, z] = placementPose(lab.world, layout.islandId, layout.placements.find(p => p.node === 'Landmark_Lighthouse')!).position;
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await open(page);
    for (const id of ['sunset', 'dusk'] as const) {
      await select(page).selectOption(id);
      const caption = page.locator(`[data-environment="${id}"] > div`).first();
      await expect.poll(() => caption.evaluate(c => c.getAnimations().length)).toBe(0);
      const box = (await caption.boundingBox())!;
      // The lighthouse from its foot to its lantern (about 2.7 above the placement), on screen.
      const points = await page.evaluate(([x, y, z]) => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement & { __hexProject: (x: number, y: number, z: number) => number[] };
        const frame = canvas.getBoundingClientRect();
        return [0, .9, 1.8, 2.7].map(h => { const [px, py] = canvas.__hexProject(x, y + h, z); return [px + frame.left, py + frame.top]; });
      }, [x, y, z]);
      for (const [px, py] of points) {
        const inside = px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
        expect(inside, `${width} ${id}：燈塔點 (${px.toFixed(0)}, ${py.toFixed(0)}) 在標題 ${JSON.stringify(box)} 內`).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width} ${id}`).toBeLessThanOrEqual(0);
    }
  }
});
