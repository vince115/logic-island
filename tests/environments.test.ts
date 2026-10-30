import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ENVIRONMENTS, PREVIEW_NOON, type WorldEnvironment } from '@/lib/islands/environments';
import { glbAssets } from '@/lib/islands/asset-registry';
import { extractGlbParts, ownGlowMaterials } from '@/lib/islands/glb-parts';
import { hexGlbSettlements } from '@/lib/islands/hex-buildings';

// D.3-6a: the environment is data, the scene draws it in one place, and the GLB lamps glow from their own materials.
const dir = 'src/components/islands/hex-world';
const sources = readdirSync(dir).map(name => ({ name, text: readFileSync(`${dir}/${name}`, 'utf8') }));

describe('world environments (D.3-6a)', () => {
  it('noon is the accepted D.2c lighting value for value, and the only time of day', () => {
    expect(Object.keys(ENVIRONMENTS)).toEqual(['noon']);
    expect(ENVIRONMENTS.noon).toEqual({
      id: 'noon', background: '#cbe9f4',
      ambient: { color: '#ffffff', intensity: .62 }, hemisphere: { sky: '#f3fbff', ground: '#b9d7a8', intensity: .95 },
      sun: { color: '#ffffff', intensity: 2.9, position: [-12, 22, 10] },
      shadow: { mapSize: 1024, bias: -.0002, normalBias: .05, far: 70 }, fog: null, glow: 1,
    });
  });

  it('the A2 preview keeps its brighter fill over the same noon sun, shadow and glow', () => {
    const noon = ENVIRONMENTS.noon, { ambient, hemisphere, sun } = PREVIEW_NOON;
    expect([PREVIEW_NOON.background, ambient.intensity, hemisphere.intensity, sun.intensity]).toEqual(['#d4f0fb', 1.1, 1.2, 2.4]);
    expect({ ...PREVIEW_NOON, background: noon.background, ambient: { ...ambient, intensity: noon.ambient.intensity },
      hemisphere: { ...hemisphere, intensity: noon.hemisphere.intensity }, sun: { ...sun, intensity: noon.sun.intensity } }).toEqual(noon);
  });

  it('every environment survives JSON unchanged', () => {
    for (const environment of [...Object.values(ENVIRONMENTS), PREVIEW_NOON] as WorldEnvironment[]) {
      expect(JSON.parse(JSON.stringify(environment))).toEqual(environment);
    }
  });

  it('only hex-environment.tsx draws the background, fog and lights of the hex world', () => {
    const drawing = sources.filter(s => /<(ambientLight|hemisphereLight|directionalLight|pointLight|spotLight|fog)\b|attach="(background|fog)"/.test(s.text));
    expect(drawing.map(s => s.name)).toEqual(['hex-environment.tsx']);
  });
});

describe('GLB glow materials (D.3-6a)', () => {
  const layout = hexGlbSettlements[0];
  const asset = glbAssets[layout.asset];
  let cached: Object3D;
  beforeAll(async () => {
    const bytes = readFileSync(`public${asset.url}`);
    cached = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  });
  /** What one LoadedParts mount does with the cached scene. */
  const mount = () => {
    const { parts } = extractGlbParts(cached.clone(true), asset, layout.placements.map(p => p.node));
    return { parts, glows: ownGlowMaterials(parts.map(p => p.object)) };
  };
  const materialsOf = (roots: Object3D[]) => {
    const byMesh = new Map<string, Material>();
    for (const root of roots) root.traverse(o => { if ((o as Mesh).isMesh) byMesh.set(o.name, (o as Mesh).material as Material); });
    return byMesh;
  };
  const withoutId = (material: Material) => ({ ...material.toJSON(), uuid: null });

  it('each mount gets one copy of the warm emission material, as loaded, for both lighthouse glows', () => {
    const { parts, glows } = mount();
    expect(glows.map(g => [g.material.name, g.strength])).toEqual([['LLv2_Warm_Emission', 2]]);
    const materials = materialsOf(parts.map(p => p.object)), original = materialsOf([cached]);
    for (const name of ['Light_Lantern', 'Lighthouse_WindowGlow']) {
      expect(materials.get(name)).toBe(glows[0].material);
      expect(materials.get(name)).not.toBe(original.get(name));
    }
    expect(withoutId(glows[0].material)).toEqual(withoutId(original.get('Light_Lantern')!));
    expect(mount().glows[0].material).not.toBe(glows[0].material);
  });

  it('the palette stays the cached material, and changing a copy leaves the cache as loaded', () => {
    const { parts, glows } = mount();
    const materials = materialsOf(parts.map(p => p.object)), original = materialsOf([cached]);
    const palette = [...materials].filter(([, m]) => m.name === 'LLv2_Palette_VertexColor');
    expect(palette.length).toBeGreaterThan(0);
    for (const [name, material] of palette) expect(material).toBe(original.get(name));
    glows[0].material.emissiveIntensity = .5;
    expect((original.get('Light_Lantern') as MeshStandardMaterial).emissiveIntensity).toBe(2);
    expect((original.get('Route_LampGlow') as MeshStandardMaterial).emissiveIntensity).toBe(2);
  });
});
