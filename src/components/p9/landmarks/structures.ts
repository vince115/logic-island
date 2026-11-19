import { BoxGeometry, ConeGeometry, CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { on, type Part, type Piece, type V3 } from './kit';

/*
 * P9.2 資料結構島 (kept as built in P9.2; P9.3 only moved it here). Its own small helpers, as written then.
 */
const STONE_DARK = '#b9b0a0', WOOD = '#a77b52', WOOD_DARK = '#7d5a3c', STEEL = '#c9d2d8';
const bx = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cy = (top: number, bottom: number, h: number, sides = 8) => new CylinderGeometry(top, bottom, h, sides);

/** A beam from a to b (offsets from one tile's centre, before SCALE): a box turned onto the line. */
const dsBeam = (a: V3, b: V3, w: number, h: number, color: string, fine?: true): Part => {
  const va = new Vector3(...a), vb = new Vector3(...b), dir = vb.clone().sub(va);
  return { geometry: bx(w, h, dir.length()), color, at: va.clone().add(vb).multiplyScalar(.5).toArray() as [number, number, number],
    quat: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.normalize()), ...(fine ? { fine } : {}) };
};
const dsBall = (r: number, color: string, at: [number, number, number]): Part => ({ geometry: new SphereGeometry(r, 10, 7), color, at });
const DS_BLOCKS = ['#188038', '#f4b400', '#4285f4', '#db4437', '#8a4fd1', '#34a853'] as const;

/*
 * P9.2 資料結構島: four landmarks, one for each idea the island teaches, on the tiles cs-region.ts gives it (in order):
 * the Stack Tower on the north hill, the Tree Observatory on the west terrace, the Graph Bridges on the east rise, the
 * Queue Passage along the south beach (two tiles, running east) and a pier. Decoration only, like every landscape:
 * the island's lessons are reached through its label and list entry, as before.
 */
export function structuresPieces(accent: string): Piece[] {
  // Stack Tower: a plinth, six blocks stacked and slightly turned, a cap, and a gantry lowering the next block (push).
  const stack: Part[] = [
    { geometry: cy(.62, .7, .22, 6), color: STONE_DARK, at: [0, .11, 0] },
    ...DS_BLOCKS.map((c, i): Part => ({ geometry: bx(.74 - i * .03, .26, .74 - i * .03), color: c, at: [0, .36 + i * .28, 0], turn: i * .14 })),
    { geometry: new ConeGeometry(.48, .34, 4), color: '#2f5f8f', at: [0, 2.12, 0], turn: Math.PI / 4 },
    { geometry: cy(.05, .06, 3, 6), color: STEEL, at: [.68, 1.5, .1] },
    { geometry: new SphereGeometry(.06, 8, 6), color: '#ff6b5a', at: [.68, 3.06, .1], glow: true },
    dsBeam([.68, 2.98, .1], [-.1, 2.98, .1], .08, .08, STEEL),
    { geometry: cy(.012, .012, .36, 4), color: '#55626c', at: [0, 2.78, .1], fine: true },
    { geometry: bx(.56, .2, .56), color: accent, at: [0, 2.52, .1], turn: .5 },
    { geometry: bx(.3, .12, .3), color: STONE_DARK, at: [.68, .06, .1], fine: true },
  ];
  // Tree Observatory: a round hall with a telescope, and above it a tree of nodes: a root, two children, four leaves.
  const root: [number, number, number] = [0, 1.85, 0], kids: [number, number, number][] = [[-.5, 1.35, -.05], [.5, 1.35, .05]];
  const leaves: [number, number, number][] = [[-.78, .92, -.3], [-.3, .92, .25], [.3, .92, -.25], [.78, .92, .3]];
  const tree: Part[] = [
    { geometry: cy(.55, .62, .5, 10), color: '#efe9dc', at: [0, .25, 0] },
    // P9.3: lit windows round the hall and a beacon on the gantry, for the evening and night.
    { geometry: cy(.6, .6, .08, 10), color: '#ffe2a3', at: [0, .34, 0], glow: true },
    { geometry: new SphereGeometry(.48, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#2f5f8f', at: [0, .5, 0] },
    { geometry: cy(.07, .09, .55, 8), color: '#55626c', at: [.28, .78, .12], tilt: -.9, turn: .6, fine: true },
    { geometry: cy(.05, .05, 1.2, 6), color: WOOD_DARK, at: [0, 1.25, 0] },
    dsBall(.2, accent, root), ...kids.map(k => dsBall(.15, '#f4b400', k)), ...leaves.map(l => dsBall(.11, '#4285f4', l)),
    ...kids.map(k => dsBeam(root, k, .05, .05, WOOD_DARK)),
    dsBeam(kids[0], leaves[0], .04, .04, WOOD_DARK), dsBeam(kids[0], leaves[1], .04, .04, WOOD_DARK),
    dsBeam(kids[1], leaves[2], .04, .04, WOOD_DARK), dsBeam(kids[1], leaves[3], .04, .04, WOOD_DARK),
    ...leaves.map(([x, y, z]): Part => ({ geometry: cy(.02, .02, y - .5, 4), color: '#9a8f80', at: [x, .25 + (y - .5) / 2, z], fine: true })),
  ];
  // Graph Bridges: five round platforms on pillars of different heights, joined by plank footbridges (the edges).
  const nodes: [number, number, number][] = [[-.5, .9, -.4], [.42, 1.25, -.48], [.6, .7, .35], [-.35, 1.05, .5], [0, .5, 0]];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 2], [1, 3]];
  const graph: Part[] = [
    ...nodes.flatMap(([x, y, z], i): Part[] => [
      { geometry: cy(.07, .09, y, 6), color: STONE_DARK, at: [x, y / 2, z] },
      { geometry: cy(.2, .2, .08, 10), color: i === 4 ? accent : '#f3ead6', at: [x, y + .04, z] },
      { geometry: cy(.07, .07, .1, 8), color: ['#db4437', '#4285f4', '#f4b400', '#8a4fd1', accent][i], at: [x, y + .13, z] },
    ]),
    ...edges.map(([a, b]) => dsBeam([nodes[a][0], nodes[a][1] + .06, nodes[a][2]], [nodes[b][0], nodes[b][1] + .06, nodes[b][2]], .13, .035, WOOD)),
    ...edges.map(([a, b]) => dsBeam([nodes[a][0], nodes[a][1] + .18, nodes[a][2]], [nodes[b][0], nodes[b][1] + .18, nodes[b][2]], .025, .025, WOOD_DARK, true)),
  ];
  // Queue Passage: an arcade along the beach (east-west), a lane under it, crates in line from the green gate (enqueue)
  // in the west to the red gate (dequeue) in the east.
  const arch = (x: number, color: string, w = .07): Part[] => [
    { geometry: bx(w, 1, w), color, at: [x, .5, -.38] }, { geometry: bx(w, 1, w), color, at: [x, .5, .38] },
    { geometry: bx(w + .04, .1, .9), color, at: [x, 1.02, 0] },
  ];
  const crates = (xs: number[], from: number): Part[] => xs.map((x, i): Part => ({ geometry: bx(.3, .3, .3), color: DS_BLOCKS[(from + i) % DS_BLOCKS.length], at: [x, .2, 0], turn: .1 * (i % 2) }));
  const lane = (x: number): Part => ({ geometry: bx(1.3, .05, .56), color: '#d9cfb8', at: [x, .025, 0] });
  const roof = (x: number): Part => ({ geometry: bx(1.3, .05, .96), color: '#c9a273', at: [x, 1.1, 0], roll: .02 });
  const queueWest: Part[] = [lane(.1), roof(.1), ...arch(-.55, '#188038', .1), ...arch(.25, WOOD), ...crates([-.25, .1, .45], 0),
    { geometry: bx(.06, .4, .06), color: '#188038', at: [-.75, .2, .5], fine: true }];
  const queueEast: Part[] = [lane(-.1), roof(-.1), ...arch(-.45, WOOD), ...arch(.55, '#db4437', .1), ...crates([-.45, -.1, .25], 3),
    { geometry: bx(.06, .4, .06), color: '#db4437', at: [.75, .2, .5], fine: true }];
  // Pier: planks out over the water to the south, posts, bollards, a moored boat with a crate and two buoys.
  const pier: Part[] = [
    { geometry: bx(.5, .07, 1.5), color: WOOD, at: [0, .08, .4] },
    ...[-.2, .2].flatMap((x): Part[] => [.0, .55, 1.05].map((z): Part => ({ geometry: cy(.04, .04, .5, 5), color: WOOD_DARK, at: [x, -.12, z] }))),
    ...[-.2, .2].map((x): Part => ({ geometry: cy(.05, .06, .14, 6), color: '#55626c', at: [x, .19, 1.05], fine: true })),
    { geometry: bx(.34, .16, .9), color: '#f3ead6', at: [.5, -.02, .9] }, { geometry: bx(.24, .06, .7), color: '#2f5f8f', at: [.5, .08, .9] },
    { geometry: bx(.18, .18, .18), color: '#f4b400', at: [.5, .2, .8], fine: true },
    { geometry: new ConeGeometry(.08, .22, 6), color: '#db4437', at: [-.5, .05, 1.4], fine: true },
    { geometry: new ConeGeometry(.08, .22, 6), color: '#f7fbff', at: [.9, .05, 1.5], fine: true },
  ];
  return [...on(0, stack), ...on(1, tree), ...on(2, graph), ...on(3, queueWest), ...on(4, queueEast), ...on(5, pier)];
}

