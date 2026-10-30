import { test, expect, type Page } from '@playwright/test';
import { ENVIRONMENTS } from '@/lib/islands/environments';

/*
 * D.3-6a: the lab page (/islands/hex/scale/37) draws what the noon environment data says, and nothing else: its
 * background, no fog, one ambient, hemisphere and shadow-casting sun light, the static shadow map; and the GLB lamps
 * glow from this page's own copy of their material while every other GLB material stays the shared cached one.
 * The lab probe reads the scene (`canvas.__hexEnvironment()`); the candidate page has no probe and is compared pixel
 * for pixel with the previous build instead (logs/2026-10-31-d3-6a-environment.md).
 */
type Material = { name: string; glow: number | null; meshes: string[] };
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

async function environment(page: Page) {
  await page.goto('/islands/hex/scale/37');
  await expect(page.getByRole('button', { name: '聚焦基礎程式島', exact: true })).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  return page.evaluate(() => (document.querySelector('canvas') as unknown as { __hexEnvironment: () => Environment }).__hexEnvironment());
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
  const [left, right, top, bottom, far] = sun.shadow!.box;
  expect(sun.shadow).toMatchObject({ mapSize: [noon.shadow.mapSize, noon.shadow.mapSize], bias: noon.shadow.bias, normalBias: noon.shadow.normalBias });
  // The shadow box covers the whole map: ±extent across, 2 less up and down, as before D.3-6a.
  expect([left, top, bottom, far]).toEqual([-right, right - 2, -(right - 2), noon.shadow.far]);
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
