import { WATER_LEVEL } from './hex-world';
import type { Vec3 } from './types';

/**
 * D.3-6a: the world map's environment (time of day) as plain data that survives JSON: the background, the fill and
 * sun light, the sun's shadow, the sea's tint, an optional fog and how brightly lamps and windows glow. The scene
 * draws whichever environment it is given (hex-environment.tsx). D.3-6b adds morning, sunset and dusk beside noon,
 * offered on the lab page only; a later phase may read them from JSON (no schema, loader or validation here).
 */
export type EnvironmentId = 'morning' | 'noon' | 'sunset' | 'dusk';
/** A CSS hex colour, `#rrggbb`. */
export type HexColor = `#${string}`;

export interface WorldEnvironment {
  id: EnvironmentId;
  background: HexColor;
  ambient: { color: HexColor; intensity: number };
  hemisphere: { sky: HexColor; ground: HexColor; intensity: number };
  /** The one shadow-casting light, placed relative to the map centre and shining at it. */
  sun: { color: HexColor; intensity: number; position: Vec3 };
  /**
   * Square shadow map size in texels and depth biases. `fit: 'map'` (noon, D.2c): the sun stays at `sun.position`
   * and the shadow box is the D.2c one, ±extent across the map with `far` as its far plane. `fit: 'sun'` (D.3-6b):
   * only the sun's direction counts, and the box, its near and far planes and the sun's distance are fitted to the
   * map as seen from that direction (`shadowBox`), so a low sun neither cuts off the far side nor wastes the map.
   */
  shadow: { mapSize: number; bias: number; normalBias: number } & ({ fit: 'map'; far: number } | { fit: 'sun' });
  /** D.3-6b: multiplies the sea's own colours (the natural sea only); `#ffffff` keeps them. */
  sea: { tint: HexColor };
  /**
   * Linear fog over view depth; `null` draws none. Defined but unused (D.3-6a log §3): any fog adds a fog term to
   * every shader, and turning it on or off later recompiles them all, so no time of day has one.
   */
  fog: { color: HexColor; near: number; far: number } | null;
  /**
   * Multiplies the models' own emissive strength (the lighthouse lantern and windows from the GLB's warm emission
   * material, the plaza's route lanterns); 1 keeps it. Only those materials glow, from each mount's own copy, so it
   * lights no other surface (D.3-6c: no lights, no bloom).
   */
  glow: number;
  /**
   * D.3-6c: multiplies those materials' own emissive colour; `#ffffff` keeps it. The GLB's warm emission is white
   * (emissive factor 1, 1, 1, strength 2) and already clips to white at noon, so a warmer light needs a warmer colour,
   * not only more strength.
   */
  glowTint: HexColor;
}

/** Noon: the D.2c look as accepted, value for value (the `contrast` lighting it replaces). */
const noon: WorldEnvironment = {
  id: 'noon',
  background: '#cbe9f4',
  ambient: { color: '#ffffff', intensity: .62 },
  hemisphere: { sky: '#f3fbff', ground: '#b9d7a8', intensity: .95 },
  sun: { color: '#ffffff', intensity: 2.9, position: [-12, 22, 10] },
  shadow: { mapSize: 1024, bias: -.0002, normalBias: .05, fit: 'map', far: 70 },
  sea: { tint: '#ffffff' },
  fog: null,
  glow: 1,
  glowTint: '#ffffff',
};

/*
 * D.3-6b. The camera looks from +x +z, so a sun on that side lights the faces it sees. D.3-6c: morning keeps the
 * lamps' own glow, sunset warms them a little and dusk most.
 */
/** Morning: a pale warm sun about 35° up in the east, on the faces the camera sees, and a cool clear fill. */
const morning: WorldEnvironment = {
  id: 'morning',
  background: '#dcecf6',
  ambient: { color: '#eef3ff', intensity: .6 },
  hemisphere: { sky: '#e6f1ff', ground: '#c3d6ae', intensity: .9 },
  sun: { color: '#fff0d8', intensity: 2.6, position: [21, 15.5, 6.7] },
  shadow: { mapSize: 1024, bias: -.0003, normalBias: .06, fit: 'sun' },
  sea: { tint: '#f2f7ff' },
  fog: null,
  glow: 1,
  glowTint: '#ffffff',
};
/**
 * Sunset: an orange sun about 27° up on noon's side, so the shadows lengthen the same way, under a lavender sky
 * overhead (an orange fill turns the blue sea a murky green) and a slightly pink sea.
 */
const sunset: WorldEnvironment = {
  id: 'sunset',
  background: '#f0c6b0',
  ambient: { color: '#ffe3d1', intensity: .7 },
  hemisphere: { sky: '#c8c2ec', ground: '#a08c84', intensity: 1 },
  sun: { color: '#ffb27a', intensity: 3, position: [-19.2, 12.3, 14.4] },
  shadow: { mapSize: 1024, bias: -.0004, normalBias: .08, fit: 'sun' },
  sea: { tint: '#f4dce6' },
  fog: null,
  glow: 1.2,
  glowTint: '#ffd8a8',
};
/**
 * Dusk: soft moonlight about 40° up (as decided 2026-10-30; not a light along the horizon) from the camera's side,
 * under a dim blue-grey fill; the moon and fill stay near neutral and the sea's tint greys it, since blue light on the
 * blue sea turns it a saturated royal blue. The lamps glow brightest (D.3-6c).
 */
const dusk: WorldEnvironment = {
  id: 'dusk',
  background: '#2b3759',
  ambient: { color: '#9aa3c4', intensity: .55 },
  hemisphere: { sky: '#8e98c0', ground: '#3a4058', intensity: .7 },
  sun: { color: '#d6defa', intensity: 1.6, position: [4.1, 17.4, 20.3] },
  shadow: { mapSize: 1024, bias: -.0003, normalBias: .05, fit: 'sun' },
  sea: { tint: '#b8b4c4' },
  fog: null,
  glow: 1.6,
  glowTint: '#ffb050',
};

/** In the order the time-of-day select lists them. */
export const ENVIRONMENTS = { morning, noon, sunset, dusk } as const satisfies Record<EnvironmentId, WorldEnvironment>;

/**
 * The A2 preview (/islands/hex, `lighting: 'preview'`, the scene default) has kept D.2a's brighter fill since before
 * the D.2c look: the same noon sun, shadow and glow under its own background and intensities. Not a time of day.
 */
export const PREVIEW_NOON: WorldEnvironment = {
  ...noon,
  background: '#d4f0fb',
  ambient: { ...noon.ambient, intensity: 1.1 },
  hemisphere: { ...noon.hemisphere, intensity: 1.2 },
  sun: { ...noon.sun, intensity: 2.4 },
};

/** Heights a shadow box fitted to the sun (D.3-6b) holds: from just under the sea to above the lighthouse. */
export const SHADOW_HEIGHTS: [number, number] = [WATER_LEVEL - .5, 8];

/** Where the sun sits and its orthographic shadow camera (light space: left/right/top/bottom, near/far along the light). */
export interface ShadowBox { position: Vec3; left: number; right: number; top: number; bottom: number; near: number; far: number }

/**
 * The sun's shadow camera for a map that spans ±`extent` around the centre between heights `floor` and `ceiling`.
 * `fit: 'map'` keeps the D.2c box (three's default near, 0.5). `fit: 'sun'` puts the map's corners into the light's
 * view (three aims the shadow camera from the sun at the centre with +y up), takes their extent across with a unit
 * margin, and moves the sun just beyond the nearest corner, so every caster is between the near and far planes.
 */
export function shadowBox(environment: WorldEnvironment, extent: number, [floor, ceiling]: [number, number]): ShadowBox {
  const { sun: { position }, shadow } = environment;
  if (shadow.fit === 'map') return { position, left: -extent, right: extent, top: extent - 2, bottom: -(extent - 2), near: .5, far: shadow.far };
  const length = Math.hypot(...position), z = position.map(v => v / length) as Vec3;
  // x = up × z and y = z × x, the shadow camera's own right and up.
  const flat = Math.hypot(z[0], z[2]), x: Vec3 = [z[2] / flat, 0, -z[0] / flat];
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const corners: Vec3[] = [];
  for (const cx of [-extent, extent]) for (const cy of [floor, ceiling]) for (const cz of [-extent, extent]) corners.push([cx, cy, cz]);
  const range = (axis: Vec3) => { const values = corners.map(c => dot(c, axis)); return [Math.min(...values), Math.max(...values)]; };
  // Along z, the corner with the largest value is the one nearest the sun; it ends up 2 in front of the sun.
  const [[left, right], [bottom, top], [away, toward]] = [range(x), range(y), range(z)];
  const distance = toward + 2, round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    position: z.map(v => round(v * distance)) as Vec3,
    left: round(left - 1), right: round(right + 1), bottom: round(bottom - 1), top: round(top + 1),
    near: 1, far: round(distance - away + 1),
  };
}
