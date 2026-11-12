import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ENVIRONMENTS, PREVIEW_NOON, shadowBox, type WorldEnvironment } from '@/lib/islands/environments';
import type { Vec3 } from '@/lib/islands/types';
import { glbAssets } from '@/lib/islands/asset-registry';
import { extractGlbParts, ownGlowMaterials } from '@/lib/islands/glb-parts';
import { hexGlbSettlements } from '@/lib/islands/hex-buildings';

// D.3-6a: the environment is data, the scene draws it in one place, and the GLB lamps glow from their own materials.
const dir = 'src/components/islands/hex-world';
const sources = readdirSync(dir).map(name => ({ name, text: readFileSync(`${dir}/${name}`, 'utf8') }));

describe('world environments (D.3-6a)', () => {
  it('noon is the accepted D.2c lighting value for value (D.3-6b: with its D.2c shadow box and an untinted sea)', () => {
    expect(ENVIRONMENTS.noon).toEqual({
      id: 'noon', background: '#cbe9f4',
      ambient: { color: '#ffffff', intensity: .62 }, hemisphere: { sky: '#f3fbff', ground: '#b9d7a8', intensity: .95 },
      sun: { color: '#ffffff', intensity: 2.9, position: [-12, 22, 10] },
      shadow: { mapSize: 1024, bias: -.0002, normalBias: .05, fit: 'map', far: 70 }, sea: { tint: '#ffffff' }, fog: null, glow: 1, glowTint: '#ffffff',
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

describe('times of day (D.3-6b)', () => {
  const elevation = ({ sun: { position: [x, y, z] } }: WorldEnvironment) => Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI;
  const others = (['morning', 'sunset', 'dusk'] as const).map(id => ENVIRONMENTS[id]);

  it('four times of day in select order, each under its own id', () => {
    expect(Object.keys(ENVIRONMENTS)).toEqual(['morning', 'noon', 'sunset', 'dusk']);
    for (const [id, environment] of Object.entries(ENVIRONMENTS)) expect(environment.id).toBe(id);
  });

  it('a sunset sun 25–30° up, a dusk moon about 40° up (decided 2026-10-30), a morning sun between sunset and noon', () => {
    expect(elevation(ENVIRONMENTS.sunset)).toBeGreaterThanOrEqual(25);
    expect(elevation(ENVIRONMENTS.sunset)).toBeLessThanOrEqual(30);
    expect(elevation(ENVIRONMENTS.dusk)).toBeCloseTo(40, 0);
    expect(elevation(ENVIRONMENTS.morning)).toBeGreaterThan(30);
    expect(elevation(ENVIRONMENTS.morning)).toBeLessThan(elevation(ENVIRONMENTS.noon));
  });

  it('what stays the same for every time of day: no fog, the shadow map size', () => {
    for (const environment of Object.values(ENVIRONMENTS)) {
      expect(environment.fog).toBeNull();
      expect(environment.shadow.mapSize).toBe(1024);
    }
    expect(others.map(e => e.shadow.fit)).toEqual(['sun', 'sun', 'sun']);
  });

  it('D.3-6c lamp glow: morning and noon as modelled, sunset a little warmer and brighter, dusk most', () => {
    const { morning, noon, sunset, dusk } = ENVIRONMENTS;
    expect([morning, noon, PREVIEW_NOON].map(e => [e.glow, e.glowTint])).toEqual([[1, '#ffffff'], [1, '#ffffff'], [1, '#ffffff']]);
    expect(sunset.glow).toBeGreaterThan(1);
    expect(dusk.glow).toBeGreaterThan(sunset.glow);
    // Warmer = less blue (and green) in the tint, red kept.
    const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [s, d] = [rgb(sunset.glowTint), rgb(dusk.glowTint)];
    expect([s[0], d[0]]).toEqual([255, 255]);
    expect(d[2]).toBeLessThan(s[2]);
    expect(s[2]).toBeLessThan(255);
  });

  it('noon keeps the D.2c shadow box and sun; the A2 preview too', () => {
    for (const environment of [ENVIRONMENTS.noon, PREVIEW_NOON]) {
      expect(shadowBox(environment, 22, [-1, 8])).toEqual({ position: [-12, 22, 10], left: -22, right: 22, top: 20, bottom: -20, near: .5, far: 70 });
    }
  });

  it('a fitted shadow box holds every corner of the map, seen from the sun, between its near and far planes', () => {
    for (const environment of others) for (const extent of [16, 22, 30]) {
      const box = shadowBox(environment, extent, [-1, 8]);
      const length = Math.hypot(...box.position), z = box.position.map(v => v / length) as Vec3;
      // The sun keeps the data's direction; only its distance is fitted.
      const given = environment.sun.position, given1 = Math.hypot(...given);
      z.forEach((v, i) => expect(v).toBeCloseTo(given[i] / given1, 4));
      const flat = Math.hypot(z[0], z[2]), x: Vec3 = [z[2] / flat, 0, -z[0] / flat];
      const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (const cx of [-extent, extent]) for (const cy of [-1, 8]) for (const cz of [-extent, extent]) {
        const corner: Vec3 = [cx, cy, cz], depth = length - dot(corner, z);
        expect(dot(corner, x)).toBeGreaterThan(box.left);
        expect(dot(corner, x)).toBeLessThan(box.right);
        expect(dot(corner, y)).toBeGreaterThan(box.bottom);
        expect(dot(corner, y)).toBeLessThan(box.top);
        expect(depth).toBeGreaterThan(box.near);
        expect(depth).toBeLessThan(box.far);
      }
    }
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
    // D.3-6c: the colour as loaded is kept apart from the material it will tint (white for this GLB).
    expect(glows[0].emissive.getHex()).toBe(0xffffff);
    expect(glows[0].emissive).not.toBe(glows[0].material.emissive);
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
