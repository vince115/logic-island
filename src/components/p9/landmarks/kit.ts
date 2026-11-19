import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';

/*
 * P9.3 island building kit: the low-poly pieces every island's landmarks are made of, and a few archetypes built from
 * them (a hall, a tower, a mast, a panel). An island's landmarks are data: a list of pieces, each on one of the island's
 * landscape tiles (src/lib/p9/island-sites.ts picks them), drawn by one renderer for the whole region
 * (../p9-landscapes.tsx) as one merged, flat-shaded, vertex-coloured mesh plus one for what glows at night.
 *
 * Units: offsets from the tile's centre and heights above its ground, before the renderer's SCALE; a tile is about
 * 1.25 across its flats, so a piece stays within about ±0.7 of its tile.
 */
export type V3 = [number, number, number];
export interface Part {
  geometry: BufferGeometry; color: string; at: V3;
  /** Turn about the vertical, then tilt about x, then roll about z (radians). */
  turn?: number; tilt?: number; roll?: number;
  /** An explicit orientation (beams between two points); replaces turn, tilt and roll. */
  quat?: Quaternion;
  /** A stretch of the piece along its own axes (roofs fitted to a hall). */
  scale?: V3;
  /** Left out of the world overview's level of detail: ropes, rails, bollards, small props. */
  fine?: true;
  /** Lit from inside after dark: windows, screens, lamps (the environment's glow, as the GLB buildings' windows). */
  glow?: true;
}
export type Piece = Part & { tile: number };
export const on = (tile: number, parts: Part[]): Piece[] => parts.map(p => ({ ...p, tile }));

type Opt = Pick<Part, 'turn' | 'tilt' | 'roll' | 'fine' | 'glow' | 'scale'>;
export const box = (w: number, h: number, d: number, color: string, at: V3, o: Opt = {}): Part => ({ geometry: new BoxGeometry(w, h, d), color, at, ...o });
export const cyl = (top: number, bottom: number, h: number, color: string, at: V3, sides = 8, o: Opt = {}): Part => ({ geometry: new CylinderGeometry(top, bottom, h, sides), color, at, ...o });
export const cone = (r: number, h: number, color: string, at: V3, sides = 8, o: Opt = {}): Part => ({ geometry: new ConeGeometry(r, h, sides), color, at, ...o });
export const ball = (r: number, color: string, at: V3, o: Opt = {}): Part => ({ geometry: new SphereGeometry(r, 10, 7), color, at, ...o });
/** A half sphere sitting on `at`. */
export const dome = (r: number, color: string, at: V3, o: Opt = {}): Part => ({ geometry: new SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color, at, ...o });
/** A ring lying flat (tilt π/2) unless turned otherwise. */
export const ring = (R: number, r: number, color: string, at: V3, o: Opt = {}): Part => ({ geometry: new TorusGeometry(R, r, 5, 16), color, at, tilt: Math.PI / 2, ...o });
/** A beam from a to b: a box turned onto the line. */
export const beam = (a: V3, b: V3, w: number, h: number, color: string, o: Pick<Part, 'fine' | 'glow'> = {}): Part => {
  const va = new Vector3(...a), vb = new Vector3(...b), dir = vb.clone().sub(va);
  return { geometry: new BoxGeometry(w, h, dir.length()), color, at: va.clone().add(vb).multiplyScalar(.5).toArray() as V3,
    quat: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.normalize()), ...o };
};

/** Parts moved as one: turned about the vertical by `turn`, then shifted by `at`. */
export function group(parts: Part[], at: V3, turn = 0): Part[] {
  const c = Math.cos(turn), s = Math.sin(turn), spin = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn);
  return parts.map(p => {
    const [x, y, z] = p.at;
    return { ...p, at: [at[0] + x * c + z * s, at[1] + y, at[2] - x * s + z * c], ...(p.quat ? { quat: spin.clone().multiply(p.quat) } : { turn: (p.turn ?? 0) + turn }) };
  });
}

// Shared palette: walls, roofs and materials every region uses; each island adds its accent.
export const C = {
  wall: '#f3ede0', wallWarm: '#efe2c8', wallCool: '#e4ecf2', stone: '#d9d2c2', stoneDark: '#b9b0a0', slate: '#55626c',
  wood: '#a77b52', woodDark: '#7d5a3c', steel: '#c9d2d8', glass: '#9fd3ea', window: '#ffe2a3', roofRed: '#c75b4a',
  roofBlue: '#2f5f8f', roofGreen: '#3f8f5e', roofDark: '#3d4a57', white: '#f7fbff', gold: '#e8b84a', path: '#d9cfb8',
  ink: '#2b3440', leaf: '#4f9a5c',
} as const;

/** A raised base under a building: a slab with a step. */
export const plinth = (w: number, d: number, color: string = C.stoneDark, h = .14): Part[] => [
  box(w, h, d, color, [0, h / 2, 0]), box(w * .55, h * .5, .16, color, [0, h * .25, d / 2 + .08], { fine: true }),
];

/** A hipped roof over a w × d footprint whose eaves are at `y`: a square pyramid stretched to the walls, a little over. */
export function hipRoof(w: number, d: number, h: number, color: string, y: number): Part {
  const geometry = new ConeGeometry(Math.SQRT1_2, 1, 4);
  geometry.rotateY(Math.PI / 4);
  return { geometry, color, at: [0, y + h / 2, 0], scale: [w + .12, h, d + .12] };
}

/**
 * A hall: walls, a roof (hipped: a four-sided cone fitted to the walls; flat: a slab with a parapet; glass: a low dome)
 * and a band of windows on the front (+z) and back that glow at night.
 */
export function hall({ w, d, h, wall = C.wall, roof = C.roofRed, kind = 'hip', windows = C.window, door = C.woodDark }: {
  w: number; d: number; h: number; wall?: string; roof?: string; kind?: 'hip' | 'flat' | 'glass'; windows?: string | null; door?: string | null;
}): Part[] {
  const parts: Part[] = [box(w, h, d, wall, [0, h / 2, 0])];
  if (kind === 'hip') parts.push(hipRoof(w, d, .5, roof, h));
  else if (kind === 'flat') parts.push(box(w + .06, .08, d + .06, roof, [0, h + .04, 0]), box(w * .5, .14, d * .4, C.slate, [w * .15, h + .15, 0], { fine: true }));
  else parts.push(dome(Math.min(w, d) * .5, C.glass, [0, h, 0]), box(w + .06, .06, d + .06, roof, [0, h + .03, 0]));
  if (windows) for (const z of [d / 2 + .006, -d / 2 - .006]) parts.push(box(w * .78, Math.min(.16, h * .25), .012, windows, [0, h * .62, z], { glow: true }));
  if (door) parts.push(box(Math.min(.2, w * .25), Math.min(.3, h * .55), .02, door, [0, Math.min(.3, h * .55) / 2, d / 2 + .012]));
  return parts;
}

/** A round or polygonal tower with bands and a cap. */
export function tower({ r, h, color = C.wall, sides = 8, cap = 'cone', capColor = C.roofBlue, bands = [] as string[], windows = true }: {
  r: number; h: number; color?: string; sides?: number; cap?: 'cone' | 'dome' | 'flat' | 'ball'; capColor?: string; bands?: string[]; windows?: boolean;
}): Part[] {
  const parts: Part[] = [cyl(r * .92, r, h, color, [0, h / 2, 0], sides)];
  bands.forEach((b, i) => parts.push(cyl(r * 1.02, r * 1.02, .08, b, [0, h * (i + 1) / (bands.length + 1), 0], sides)));
  if (windows) parts.push(cyl(r * .95, r * .95, .1, C.window, [0, h * .86, 0], sides, { glow: true }));
  if (cap === 'cone') parts.push(cone(r * 1.15, r * 1.3, capColor, [0, h + r * .65, 0], sides));
  else if (cap === 'dome') parts.push(dome(r * .98, capColor, [0, h, 0]));
  else if (cap === 'ball') parts.push(ball(r * .7, capColor, [0, h + r * .55, 0]));
  else parts.push(cyl(r * 1.08, r * 1.08, .08, capColor, [0, h + .04, 0], sides));
  return parts;
}

/** A mast with a dish and a light on top. */
export const mast = (h: number, color: string = C.steel, light = '#ff6b5a'): Part[] => [
  cyl(.035, .06, h, color, [0, h / 2, 0], 6), box(.5, .04, .04, color, [0, h * .7, 0], { fine: true }),
  cone(.18, .1, C.white, [.14, h * .82, 0], 10, { roll: -Math.PI / 2.4 }), ball(.06, light, [0, h + .04, 0], { glow: true }),
];

/** A board on two legs (a screen, a chart, a sign); its face glows when `lit`. */
export const panel = (w: number, h: number, face: string, frame: string = C.slate, lift = .25, lit = false): Part[] => [
  box(w + .06, h + .06, .05, frame, [0, lift + h / 2, 0]), box(w, h, .02, face, [0, lift + h / 2, .03], lit ? { glow: true } : {}),
  ...[-w / 2 + .04, w / 2 - .04].map((x): Part => box(.04, lift, .04, frame, [x, lift / 2, 0], { fine: true })),
];

/** A short lamp post. */
export const lamp = (at: V3): Part[] => group([cyl(.018, .025, .5, C.slate, [0, .25, 0], 5, { fine: true }), ball(.05, C.window, [0, .52, 0], { glow: true, fine: true })], at);

/** A low hedge or wall segment. */
export const wall = (len: number, color: string, at: V3, turn = 0, h = .18): Part => box(len, h, .1, color, [at[0], at[1] + h / 2, at[2]], { turn });
