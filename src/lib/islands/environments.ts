import type { Vec3 } from './types';

/**
 * D.3-6a: the world map's environment (time of day) as plain data that survives JSON: the background, the fill and
 * sun light, the sun's shadow, an optional fog and how brightly lamps and windows glow. The scene draws whichever
 * environment it is given (hex-environment.tsx); only noon exists. D.3-6b adds the other times of day as more
 * entries, and a later phase may read them from JSON (no schema, loader or validation here).
 */
export type EnvironmentId = 'noon';
/** A CSS hex colour, `#rrggbb`. */
export type HexColor = `#${string}`;

export interface WorldEnvironment {
  id: EnvironmentId;
  background: HexColor;
  ambient: { color: HexColor; intensity: number };
  hemisphere: { sky: HexColor; ground: HexColor; intensity: number };
  /** The one shadow-casting light, placed relative to the map centre and shining at it. */
  sun: { color: HexColor; intensity: number; position: Vec3 };
  /** Square shadow map size in texels, depth biases and the far plane of the sun's shadow box (its sides fit the map). */
  shadow: { mapSize: number; bias: number; normalBias: number; far: number };
  /**
   * Linear fog over view depth; `null` draws none. Defined but unused (D.3-6a log §3): any fog adds a fog term to
   * every shader, and turning it on or off later recompiles them all.
   */
  fog: { color: HexColor; near: number; far: number } | null;
  /** Multiplies the models' own emissive strength (GLB lamps and windows, plaza lanterns); 1 keeps it. */
  glow: number;
}

/** Noon: the D.2c look as accepted, value for value (the `contrast` lighting it replaces). */
const noon: WorldEnvironment = {
  id: 'noon',
  background: '#cbe9f4',
  ambient: { color: '#ffffff', intensity: .62 },
  hemisphere: { sky: '#f3fbff', ground: '#b9d7a8', intensity: .95 },
  sun: { color: '#ffffff', intensity: 2.9, position: [-12, 22, 10] },
  shadow: { mapSize: 1024, bias: -.0002, normalBias: .05, far: 70 },
  fog: null,
  glow: 1,
};

export const ENVIRONMENTS = { noon } as const satisfies Record<EnvironmentId, WorldEnvironment>;

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
