'use client';

import { useEffect, useMemo } from 'react';
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
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
type Part = { geometry: BufferGeometry; color: string; at: [number, number, number]; turn?: number; tilt?: number; roll?: number };
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

function pieces(islandId: string, accent: string): Piece[] {
  switch (islandId) {
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
export function P9Landscapes({ world, landscapes, accents }: { world: HexWorld; landscapes: readonly PlannedLandscape[]; accents: Record<string, string> }) {
  const geometry = useMemo(() => {
    const up = new Vector3(0, 1, 0), side = new Vector3(1, 0, 0), front = new Vector3(0, 0, 1), parts: BufferGeometry[] = [];
    for (const landscape of landscapes) {
      const settlement = world.settlements.find(s => s.islandId === landscape.islandId);
      if (!settlement) continue;
      const ground = (t: Axial) => { const [x, z] = hexToWorld(t, world.size), tile = settlement.tiles.find(u => u.q === t.q && u.r === t.r); return [x, LAND_TOP + (tile ? tileHeight(tile) : 0), z] as const; };
      for (const piece of pieces(landscape.islandId, accents[landscape.islandId] ?? '#4285f4')) {
        const [x, y, z] = ground(landscape.tiles[piece.tile]);
        const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
        const q = new Quaternion().setFromAxisAngle(up, piece.turn ?? 0).multiply(new Quaternion().setFromAxisAngle(side, piece.tilt ?? 0)).multiply(new Quaternion().setFromAxisAngle(front, piece.roll ?? 0));
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
  }, [world, landscapes, accents]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? <mesh geometry={geometry} castShadow receiveShadow raycast={() => undefined}><meshStandardMaterial vertexColors flatShading roughness={.85}/></mesh> : null;
}
