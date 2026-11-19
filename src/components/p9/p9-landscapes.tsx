'use client';

import { useEffect, useMemo } from 'react';
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { LAND_TOP, tileHeight, type HexWorld } from '@/lib/islands/hex-world';
import type { PlannedLandscape } from '@/lib/p9/cs-region';

/*
 * P9.1 visual prototype: what stands on the CS region's four planned islands. Each island gets a landscape of its own
 * subject, so it can be told apart on the map, and every one of them is a site and not a building: standing stones,
 * masts, drafting floors under scaffolding, an archive's footings and a crane. No door, no lit window, no sign, and
 * nothing here can be clicked or focused (no raycast, no HTML): a planned island still opens no lesson, and its label
 * and list entry still say 規劃中. Flat-shaded primitives merged into one vertex-coloured mesh for the whole region.
 */
type Part = {
  geometry: BufferGeometry; color: string; at: [number, number, number]; turn?: number; tilt?: number; roll?: number;
  /** An explicit orientation (beams between two points); replaces turn, tilt and roll. */
  quat?: Quaternion;
  /** A detail the world overview leaves out (its level of detail): ropes, rails, bollards, small props. */
  fine?: true;
};
const STONE = '#d9d2c2', STONE_DARK = '#b9b0a0', WOOD = '#a77b52', WOOD_DARK = '#7d5a3c', STEEL = '#c9d2d8', PAPER = '#dbe9f6', LINE = '#f7fbff';
const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (top: number, bottom: number, h: number, sides = 8) => new CylinderGeometry(top, bottom, h, sides);

/** How much larger than their own measures the pieces are drawn, so a landscape reads from the region's overview. */
const SCALE = 1.3;
/** 計算機網路島: the masts' heights, tile by tile; a cable runs from each mast head to the next. */
const MASTS = [3.1, 2.5, 2] as const;
/** Each piece is given on a tile of its landscape (by index), at an offset from the tile's centre and above its ground. */
type Piece = Part & { tile: number };
const on = (tile: number, parts: Part[]): Piece[] => parts.map(p => ({ ...p, tile }));

/** A survey pennant in the island's accent on a pole: what every planned island of the world carries. */
const pennant = (accent: string, x: number, z: number): Part[] => [
  { geometry: cyl(.035, .045, 1.5, 6), color: '#f4f1e8', at: [x, .75, z] },
  { geometry: box(.42, .24, .03), color: accent, at: [x + .22, 1.32, z] },
  { geometry: cyl(.16, .2, .08, 8), color: STONE_DARK, at: [x, .04, z] },
];
/** A scaffold bay: four posts, two levels of rails and a plank deck. */
const scaffold = (x: number, z: number, w: number, d: number, h: number, turn = 0): Part[] => {
  const c = Math.cos(turn), s = Math.sin(turn), at = (dx: number, y: number, dz: number): [number, number, number] => [x + dx * c + dz * s, y, z - dx * s + dz * c];
  return [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]): Part => ({ geometry: cyl(.03, .03, h, 5), color: WOOD_DARK, at: at(a * w / 2, h / 2, b * d / 2) })),
    ...[h * .5, h * .98].flatMap((y): Part[] => [
      { geometry: box(w, .04, .04), color: WOOD, at: at(0, y, -d / 2), turn }, { geometry: box(w, .04, .04), color: WOOD, at: at(0, y, d / 2), turn },
      { geometry: box(.04, .04, d), color: WOOD, at: at(-w / 2, y, 0), turn }, { geometry: box(.04, .04, d), color: WOOD, at: at(w / 2, y, 0), turn },
    ]),
    { geometry: box(w * .96, .035, d * .9), color: '#c9a273', at: at(0, h * .52, 0), turn },
  ];
};

/** A beam from a to b (offsets from one tile's centre, before SCALE): a box turned onto the line. */
const beam = (a: [number, number, number], b: [number, number, number], w: number, h: number, color: string, fine?: true): Part => {
  const va = new Vector3(...a), vb = new Vector3(...b), dir = vb.clone().sub(va);
  return { geometry: box(w, h, dir.length()), color, at: va.clone().add(vb).multiplyScalar(.5).toArray() as [number, number, number],
    quat: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.normalize()), ...(fine ? { fine } : {}) };
};
const ball = (r: number, color: string, at: [number, number, number]): Part => ({ geometry: new SphereGeometry(r, 10, 7), color, at });
const DS_BLOCKS = ['#188038', '#f4b400', '#4285f4', '#db4437', '#8a4fd1', '#34a853'] as const;

/*
 * P9.2 資料結構島: four landmarks, one for each idea the island teaches, on the tiles cs-region.ts gives it (in order):
 * the Stack Tower on the north hill, the Tree Observatory on the west terrace, the Graph Bridges on the east rise, the
 * Queue Passage along the south beach (two tiles, running east) and a pier. Decoration only, like every landscape:
 * the island's lessons are reached through its label and list entry, as before.
 */
function structuresPieces(accent: string): Piece[] {
  // Stack Tower: a plinth, six blocks stacked and slightly turned, a cap, and a gantry lowering the next block (push).
  const stack: Part[] = [
    { geometry: cyl(.62, .7, .22, 6), color: STONE_DARK, at: [0, .11, 0] },
    ...DS_BLOCKS.map((c, i): Part => ({ geometry: box(.74 - i * .03, .26, .74 - i * .03), color: c, at: [0, .36 + i * .28, 0], turn: i * .14 })),
    { geometry: new ConeGeometry(.48, .34, 4), color: '#2f5f8f', at: [0, 2.12, 0], turn: Math.PI / 4 },
    { geometry: cyl(.05, .06, 3, 6), color: STEEL, at: [.68, 1.5, .1] },
    beam([.68, 2.98, .1], [-.1, 2.98, .1], .08, .08, STEEL),
    { geometry: cyl(.012, .012, .36, 4), color: '#55626c', at: [0, 2.78, .1], fine: true },
    { geometry: box(.56, .2, .56), color: accent, at: [0, 2.52, .1], turn: .5 },
    { geometry: box(.3, .12, .3), color: STONE_DARK, at: [.68, .06, .1], fine: true },
  ];
  // Tree Observatory: a round hall with a telescope, and above it a tree of nodes: a root, two children, four leaves.
  const root: [number, number, number] = [0, 1.85, 0], kids: [number, number, number][] = [[-.5, 1.35, -.05], [.5, 1.35, .05]];
  const leaves: [number, number, number][] = [[-.78, .92, -.3], [-.3, .92, .25], [.3, .92, -.25], [.78, .92, .3]];
  const tree: Part[] = [
    { geometry: cyl(.55, .62, .5, 10), color: '#efe9dc', at: [0, .25, 0] },
    { geometry: new SphereGeometry(.48, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#2f5f8f', at: [0, .5, 0] },
    { geometry: cyl(.07, .09, .55, 8), color: '#55626c', at: [.28, .78, .12], tilt: -.9, turn: .6, fine: true },
    { geometry: cyl(.05, .05, 1.2, 6), color: WOOD_DARK, at: [0, 1.25, 0] },
    ball(.2, accent, root), ...kids.map(k => ball(.15, '#f4b400', k)), ...leaves.map(l => ball(.11, '#4285f4', l)),
    ...kids.map(k => beam(root, k, .05, .05, WOOD_DARK)),
    beam(kids[0], leaves[0], .04, .04, WOOD_DARK), beam(kids[0], leaves[1], .04, .04, WOOD_DARK),
    beam(kids[1], leaves[2], .04, .04, WOOD_DARK), beam(kids[1], leaves[3], .04, .04, WOOD_DARK),
    ...leaves.map(([x, y, z]): Part => ({ geometry: cyl(.02, .02, y - .5, 4), color: '#9a8f80', at: [x, .25 + (y - .5) / 2, z], fine: true })),
  ];
  // Graph Bridges: five round platforms on pillars of different heights, joined by plank footbridges (the edges).
  const nodes: [number, number, number][] = [[-.5, .9, -.4], [.42, 1.25, -.48], [.6, .7, .35], [-.35, 1.05, .5], [0, .5, 0]];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 2], [1, 3]];
  const graph: Part[] = [
    ...nodes.flatMap(([x, y, z], i): Part[] => [
      { geometry: cyl(.07, .09, y, 6), color: STONE_DARK, at: [x, y / 2, z] },
      { geometry: cyl(.2, .2, .08, 10), color: i === 4 ? accent : '#f3ead6', at: [x, y + .04, z] },
      { geometry: cyl(.07, .07, .1, 8), color: ['#db4437', '#4285f4', '#f4b400', '#8a4fd1', accent][i], at: [x, y + .13, z] },
    ]),
    ...edges.map(([a, b]) => beam([nodes[a][0], nodes[a][1] + .06, nodes[a][2]], [nodes[b][0], nodes[b][1] + .06, nodes[b][2]], .13, .035, WOOD)),
    ...edges.map(([a, b]) => beam([nodes[a][0], nodes[a][1] + .18, nodes[a][2]], [nodes[b][0], nodes[b][1] + .18, nodes[b][2]], .025, .025, WOOD_DARK, true)),
  ];
  // Queue Passage: an arcade along the beach (east-west), a lane under it, crates in line from the green gate (enqueue)
  // in the west to the red gate (dequeue) in the east.
  const arch = (x: number, color: string, w = .07): Part[] => [
    { geometry: box(w, 1, w), color, at: [x, .5, -.38] }, { geometry: box(w, 1, w), color, at: [x, .5, .38] },
    { geometry: box(w + .04, .1, .9), color, at: [x, 1.02, 0] },
  ];
  const crates = (xs: number[], from: number): Part[] => xs.map((x, i): Part => ({ geometry: box(.3, .3, .3), color: DS_BLOCKS[(from + i) % DS_BLOCKS.length], at: [x, .2, 0], turn: .1 * (i % 2) }));
  const lane = (x: number): Part => ({ geometry: box(1.3, .05, .56), color: '#d9cfb8', at: [x, .025, 0] });
  const roof = (x: number): Part => ({ geometry: box(1.3, .05, .96), color: '#c9a273', at: [x, 1.1, 0], roll: .02 });
  const queueWest: Part[] = [lane(.1), roof(.1), ...arch(-.55, '#188038', .1), ...arch(.25, WOOD), ...crates([-.25, .1, .45], 0),
    { geometry: box(.06, .4, .06), color: '#188038', at: [-.75, .2, .5], fine: true }];
  const queueEast: Part[] = [lane(-.1), roof(-.1), ...arch(-.45, WOOD), ...arch(.55, '#db4437', .1), ...crates([-.45, -.1, .25], 3),
    { geometry: box(.06, .4, .06), color: '#db4437', at: [.75, .2, .5], fine: true }];
  // Pier: planks out over the water to the south, posts, bollards, a moored boat with a crate and two buoys.
  const pier: Part[] = [
    { geometry: box(.5, .07, 1.5), color: WOOD, at: [0, .08, .4] },
    ...[-.2, .2].flatMap((x): Part[] => [.0, .55, 1.05].map((z): Part => ({ geometry: cyl(.04, .04, .5, 5), color: WOOD_DARK, at: [x, -.12, z] }))),
    ...[-.2, .2].map((x): Part => ({ geometry: cyl(.05, .06, .14, 6), color: '#55626c', at: [x, .19, 1.05], fine: true })),
    { geometry: box(.34, .16, .9), color: '#f3ead6', at: [.5, -.02, .9] }, { geometry: box(.24, .06, .7), color: '#2f5f8f', at: [.5, .08, .9] },
    { geometry: box(.18, .18, .18), color: '#f4b400', at: [.5, .2, .8], fine: true },
    { geometry: new ConeGeometry(.08, .22, 6), color: '#db4437', at: [-.5, .05, 1.4], fine: true },
    { geometry: new ConeGeometry(.08, .22, 6), color: '#f7fbff', at: [.9, .05, 1.5], fine: true },
  ];
  return [...on(0, stack), ...on(1, tree), ...on(2, graph), ...on(3, queueWest), ...on(4, queueEast), ...on(5, pier)];
}

function pieces(islandId: string, accent: string): Piece[] {
  switch (islandId) {
    case 'structures': return structuresPieces(accent);
    // 程式語言島: a ring of standing stones, each with a band in the island's colour, and one lintel.
    case 'programming-languages': return [
      ...on(0, [
        { geometry: box(.3, 1.9, .24), color: STONE, at: [-.45, .95, -.2], turn: .2 },
        { geometry: box(.3, 1.6, .24), color: STONE, at: [.45, .8, -.3], turn: -.25 },
        { geometry: box(1.25, .22, .28), color: STONE_DARK, at: [0, 1.98, -.25], turn: -.03, roll: .12 },
        { geometry: box(.32, .12, .26), color: accent, at: [-.45, 1.3, -.2], turn: .2 },
        { geometry: box(.28, 1.3, .22), color: STONE, at: [.1, .65, .55], turn: 1.1 },
        { geometry: box(.3, .1, .24), color: accent, at: [.1, .92, .55], turn: 1.1 },
      ]),
      ...on(1, [
        { geometry: box(.3, 1.45, .24), color: STONE, at: [-.35, .72, -.4], turn: .5 },
        { geometry: box(.28, 1.1, .22), color: STONE_DARK, at: [.5, .55, .1], turn: -.6 },
        { geometry: box(.3, .1, .24), color: accent, at: [-.35, 1, -.4], turn: .5 },
        { geometry: box(.3, 1.7, .24), color: STONE, at: [-.1, .85, .6], turn: -.15 },
      ]),
      ...on(2, [
        { geometry: box(.28, 1.2, .22), color: STONE, at: [.35, .6, -.35], turn: .9 },
        { geometry: box(.9, .2, .26), color: STONE_DARK, at: [-.35, .12, .35], turn: .7, roll: .05 },
        ...pennant(accent, -.5, -.4),
      ]),
    ];
    // 計算機網路島: three relay masts on the headland, cables slung from one to the next.
    case 'networks': {
      const mast = (h: number): Part[] => [
        { geometry: cyl(.06, .11, h, 6), color: STEEL, at: [0, h / 2, 0] },
        { geometry: cyl(.085, .095, h * .12, 6), color: accent, at: [0, h * .45, 0] },
        { geometry: box(.8, .06, .06), color: STEEL, at: [0, h * .78, 0] }, { geometry: box(.06, .06, .56), color: STEEL, at: [0, h * .62, 0] },
        { geometry: new ConeGeometry(.2, .16, 10, 1, true), color: '#eef3f6', at: [.2, h * .9, 0], tilt: Math.PI / 2, turn: .6 },
        { geometry: cyl(.3, .36, .14, 8), color: STONE_DARK, at: [0, .07, 0] },
        { geometry: box(.1, .1, .1), color: accent, at: [0, h + .05, 0] },
      ];
      return [
        ...on(0, mast(MASTS[0])), ...on(1, mast(MASTS[1])), ...on(2, [...mast(MASTS[2]), ...pennant(accent, .55, .45)]),
      ];
    }
    // 系統分析與設計島: drafting floors on the terraces, a plan pegged out on each, scaffolding going up beside one.
    case 'systems-analysis': {
      const floor = (w: number, d: number, turn: number): Part[] => [
        { geometry: box(w, .06, d), color: PAPER, at: [0, .03, 0], turn },
        ...[-.3, 0, .3].map((k): Part => ({ geometry: box(w * .92, .012, .025), color: LINE, at: [Math.sin(turn) * k * d, .068, Math.cos(turn) * k * d], turn })),
        ...[-.3, .3].map((k): Part => ({ geometry: box(.025, .012, d * .92), color: LINE, at: [Math.cos(turn) * k * w, .068, -Math.sin(turn) * k * w], turn })),
        { geometry: box(w * .34, .014, d * .3), color: accent, at: [Math.cos(turn) * w * .2, .07, -Math.sin(turn) * w * .2], turn },
      ];
      return [
        ...on(0, [...floor(1.35, 1, .3), ...scaffold(.05, -.05, .8, .6, 1.3, .3)]),
        ...on(1, [...floor(1.2, .95, -.2), { geometry: box(.5, .04, .36), color: '#f3ead6', at: [.1, .62, 0], turn: -.2, tilt: -.5 },
          { geometry: cyl(.025, .025, .6, 5), color: WOOD_DARK, at: [0, .3, .1] }, { geometry: cyl(.025, .025, .5, 5), color: WOOD_DARK, at: [.25, .25, -.12] }]),
        ...on(2, [...floor(1.2, .9, .5), ...[[-.5, -.35], [.5, -.3], [-.45, .4], [.5, .38]].map(([x, z]): Part => ({ geometry: cyl(.025, .025, .34, 5), color: accent, at: [x, .17, z] }))]),
        ...on(3, pennant(accent, .2, -.2)),
      ];
    }
    // 管理資訊系統島: an archive's footings in rows, a few columns begun, stacked stone and a timber crane.
    default: {
      const footings = (dx: number, dz: number, columns: number[]): Part[] => [-.5, 0, .5].flatMap((x, i) => [-.42, .42].map((z, j): Part => {
        const h = columns[i * 2 + j] ?? .2;
        return { geometry: h > .3 ? cyl(.13, .15, h, 8) : box(.34, h, .34), color: h > .3 ? '#efe9dc' : STONE, at: [dx + x, h / 2, dz + z] };
      }));
      return [
        ...on(0, [...footings(0, 0, [1.3, .2, .9, .2, .2, .2]), { geometry: box(1.5, .05, .12), color: STONE_DARK, at: [0, .025, 0] }]),
        ...on(1, [...footings(0, 0, [.2, .2, .6, 1.1, .2, .2]), { geometry: box(.12, .05, 1.2), color: STONE_DARK, at: [0, .025, 0] }]),
        ...on(2, [
          // The crane: a mast, a boom, a stay and a block on its rope.
          { geometry: cyl(.06, .08, 2.3, 6), color: WOOD_DARK, at: [-.3, 1.15, 0] },
          { geometry: box(1.7, .07, .07), color: WOOD, at: [.3, 2.05, 0], roll: .28 },
          { geometry: box(.03, .03, 1.1), color: '#55626c', at: [-.72, 1.75, 0], turn: Math.PI / 2, tilt: -.95 },
          { geometry: cyl(.012, .012, .8, 4), color: '#55626c', at: [1, 1.82, 0] },
          { geometry: box(.3, .24, .3), color: STONE, at: [1, 1.3, 0], turn: .4 },
          { geometry: box(.6, .1, .5), color: WOOD, at: [-.3, .05, 0] },
        ]),
        ...on(3, [
          { geometry: box(.4, .26, .4), color: STONE, at: [-.3, .13, -.2] }, { geometry: box(.4, .26, .4), color: STONE_DARK, at: [.14, .13, -.25], turn: .2 },
          { geometry: box(.4, .26, .4), color: STONE, at: [-.1, .39, -.22], turn: .5 }, { geometry: box(.9, .06, .2), color: WOOD, at: [.3, .03, .4], turn: .8 },
          ...pennant(accent, .55, -.45),
        ]),
      ];
    }
  }
}

/** The landscapes of a region's planned islands, in the map's own coordinates (drawn inside the scene's map group). */
/** How many pieces an island's landscape has at a level of detail (for tests: the world draws fewer). */
export const landscapePieceCount = (islandId: string, detail: 'region' | 'world') =>
  pieces(islandId, '#000000').filter(p => detail === 'region' || !p.fine).length;

/**
 * The landscapes of a region's islands, in the map's own coordinates (drawn inside the scene's map group). `detail`
 * 'world' is the overview's level of detail: the same pieces at the same places, without the fine ones.
 */
export function P9Landscapes({ world, landscapes, accents, detail = 'region' }: { world: HexWorld; landscapes: readonly PlannedLandscape[]; accents: Record<string, string>; detail?: 'region' | 'world' }) {
  const geometry = useMemo(() => {
    const up = new Vector3(0, 1, 0), side = new Vector3(1, 0, 0), front = new Vector3(0, 0, 1), parts: BufferGeometry[] = [];
    for (const landscape of landscapes) {
      const settlement = world.settlements.find(s => s.islandId === landscape.islandId);
      if (!settlement) continue;
      const ground = (t: Axial) => { const [x, z] = hexToWorld(t, world.size), tile = settlement.tiles.find(u => u.q === t.q && u.r === t.r); return [x, LAND_TOP + (tile ? tileHeight(tile) : 0), z] as const; };
      for (const piece of pieces(landscape.islandId, accents[landscape.islandId] ?? '#4285f4')) {
        if (detail === 'world' && piece.fine) { piece.geometry.dispose(); continue; }
        const [x, y, z] = ground(landscape.tiles[piece.tile]);
        const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
        const q = piece.quat ?? new Quaternion().setFromAxisAngle(up, piece.turn ?? 0).multiply(new Quaternion().setFromAxisAngle(side, piece.tilt ?? 0)).multiply(new Quaternion().setFromAxisAngle(front, piece.roll ?? 0));
        g.applyMatrix4(new Matrix4().compose(new Vector3(x + piece.at[0] * SCALE, y + piece.at[1] * SCALE, z + piece.at[2] * SCALE), q, new Vector3(SCALE, SCALE, SCALE)));
        const c = new Color(piece.color), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new Float32BufferAttribute(colors, 3));
        g.deleteAttribute('uv');
        parts.push(g);
        piece.geometry.dispose();
      }
      if (landscape.islandId === 'networks') {
        // The cables, between the real mast heads: a thin span turned onto the line from one head to the next.
        const heads = MASTS.map((h, i) => { const [x, y, z] = ground(landscape.tiles[i]); return new Vector3(x, y + h * .78 * SCALE, z); });
        for (let i = 0; i + 1 < heads.length; i++) {
          const a = heads[i], b = heads[i + 1], g = new BoxGeometry(.04, .04, a.distanceTo(b)).toNonIndexed();
          g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new Quaternion().setFromUnitVectors(front, b.clone().sub(a).normalize()), new Vector3(1, 1, 1)));
          const c = new Color('#55626c'), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
          for (let k = 0; k < count; k++) colors.set([c.r, c.g, c.b], k * 3);
          g.setAttribute('color', new Float32BufferAttribute(colors, 3));
          g.deleteAttribute('uv');
          parts.push(g);
        }
      }
    }
    if (!parts.length) return null;
    const merged = mergeGeometries(parts);
    parts.forEach(p => p.dispose());
    return merged;
  }, [world, landscapes, accents, detail]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? <mesh geometry={geometry} castShadow receiveShadow raycast={() => undefined}><meshStandardMaterial vertexColors flatShading roughness={.85}/></mesh> : null;
}
