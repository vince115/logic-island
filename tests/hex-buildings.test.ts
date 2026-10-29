import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbAssets } from '@/lib/islands/asset-registry';
import { checkGlbContract, resolveTarget } from '@/lib/islands/glb-contract';
import { extractGlbParts, type GlbPart } from '@/lib/islands/glb-parts';
import { hexKey, hexNeighbor, hexToWorld, worldToHex } from '@/lib/islands/hex';
import { hexGlbSettlements, placementPose } from '@/lib/islands/hex-buildings';
import { WATER_LEVEL, hexWorld, portPoint, tileHeight } from '@/lib/islands/hex-world';
import { roadProfiles, tileTop } from '@/lib/islands/hex-terrain';

const layout = hexGlbSettlements[0];
const asset = glbAssets[layout.asset];
const settlement = hexWorld.settlements.find(s => s.islandId === layout.islandId)!;
const land = new Set(hexWorld.settlements.flatMap(s => s.tiles.map(hexKey)));
let scene: Object3D;
let parts: GlbPart[];

beforeAll(async () => {
  const bytes = readFileSync(`public${asset.url}`);
  scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const result = extractGlbParts(scene.clone(true), asset, layout.placements.map(p => p.node));
  expect(result.missing).toEqual([]);
  parts = result.parts;
});
const part = (node: string) => parts.find(p => p.node === node)!;
const pose = (node: string) => placementPose(hexWorld, layout.islandId, layout.placements.find(p => p.node === node)!);
/** Footprint points on the map (x, z) after scale, rotation and placement: corners, or an n×n grid. */
function footprint(node: string, n = 2) {
  const { bounds } = part(node), { position, rotation } = pose(node);
  const cos = Math.cos(rotation), sin = Math.sin(rotation), s = asset.scale, out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * i / (n - 1), z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * j / (n - 1);
    out.push([position[0] + s * (x * cos + z * sin), position[2] + s * (-x * sin + z * cos)]);
  }
  return out;
}
const tileAt = (x: number, z: number) => settlement.tiles.find(t => hexKey(t) === hexKey(worldToHex(x, z, hexWorld.size)));
const roadSegments = (filter: (routeId: string) => boolean) => roadProfiles(hexWorld).filter(r => filter(r.routeId))
  .flatMap(r => r.points.slice(1).map((p, i) => [[r.points[i][0], r.points[i][2]], [p[0], p[2]]]));
const bridgeSegments = hexWorld.bridges.map(b => [portPoint(hexWorld, b.from), portPoint(hexWorld, b.to)]);
const segmentPointDistance = ([ax, az]: number[], [bx, bz]: number[], [px, pz]: number[]) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)));
};

describe('GLB parts for hex tiles', () => {
  it('only the foundations island uses GLB buildings in this trial', () => {
    expect(hexGlbSettlements.map(s => s.islandId)).toEqual(['foundations']);
    expect(layout.placements.map(p => p.node)).toEqual(['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry', 'Tree_001', 'Tree_003', 'Tree_005']);
    expect(asset.scale).toBe(0.6);
  });

  it('keep node names, userData and the D.1 contract', () => {
    expect(checkGlbContract(scene, asset)).toEqual({ ok: true });
    for (const entry of asset.nodes.filter(n => n.kind === 'target')) {
      expect(part(entry.node).object.name).toBe(entry.node);
      expect(part(entry.node).object.userData).toMatchObject({ role: entry.role, interaction_id: entry.interactionId });
      expect(part(entry.node).object.position.toArray()).toEqual([0, 0, 0]);
    }
  });

  it('resolve clicks on lifted meshes to the same targets', () => {
    const mesh = (node: string) => { let m: Object3D | undefined; part(node).object.traverse(o => { if (!m && (o as { isMesh?: boolean }).isMesh) m = o; }); return m!; };
    expect(resolveTarget(mesh('Building_Workshop'), asset)).toMatchObject({ action: { type: 'route', href: '/learn' } });
    expect(resolveTarget(mesh('Landmark_Lighthouse'), asset)).toMatchObject({ node: 'Landmark_Lighthouse', action: { type: 'info' } });
    expect(resolveTarget(mesh('Dock_Entry'), asset)).toMatchObject({ node: 'Dock_Entry', action: { type: 'info' } });
    expect(resolveTarget(mesh('Tree_001'), asset)).toBeNull();
  });

  it('re-express anchors relative to each building pivot', () => {
    const offsets = Object.fromEntries(parts.filter(p => p.anchor).map(p => [p.anchor!.node, p.anchor!.offset]));
    const expected = { Anchor_Workshop: [0.3, 0.15, 1.55], Anchor_Lighthouse: [0, 0.2, 0.78], Anchor_Entry: [0, 0.2, 0.3] };
    expect(Object.keys(offsets).sort()).toEqual(Object.keys(expected).sort());
    for (const [node, value] of Object.entries(expected)) value.forEach((v, i) => expect(offsets[node][i], `${node}[${i}]`).toBeCloseTo(v, 5));
  });
});

describe('placements on the hex map', () => {
  it('stand on foundations tiles, with the lighthouse on a raised tile', () => {
    for (const p of layout.placements) expect(settlement.tiles.some(t => hexKey(t) === hexKey(p.tile)), p.node).toBe(true);
    const tileOf = (node: string) => settlement.tiles.find(t => hexKey(t) === hexKey(layout.placements.find(p => p.node === node)!.tile))!;
    expect(tileHeight(tileOf('Landmark_Lighthouse'))).toBeGreaterThan(tileHeight(settlement.tiles.find(t => hexKey(t) === hexKey(settlement.center))!));
  });

  it('stand every building except the dock fully on level land at its base height', () => {
    for (const node of ['Landmark_Lighthouse', 'Building_Workshop', 'Tree_001', 'Tree_003', 'Tree_005']) {
      const base = pose(node).position[1];
      for (const [x, z] of footprint(node, 7)) {
        const tile = tileAt(x, z);
        expect(tile, `${node} at ${x.toFixed(2)},${z.toFixed(2)}`).toBeDefined();
        expect(tileTop(tile!), `${node} base`).toBeCloseTo(base, 9);
      }
    }
  });

  it('span the workshop across (-1, 1) and (-1, 0) at scale 0.6', () => {
    const tiles = new Set(footprint('Building_Workshop', 7).map(([x, z]) => hexKey(tileAt(x, z)!)));
    expect(tiles.has('-1,1') && tiles.has('-1,0')).toBe(true);
    const [w, d] = [part('Building_Workshop').bounds.max[0] - part('Building_Workshop').bounds.min[0], part('Building_Workshop').bounds.max[2] - part('Building_Workshop').bounds.min[2]];
    // Wider than one tile's 2.165 flat-to-flat span once corners are counted, so it needs two tiles.
    expect(w * asset.scale).toBeCloseTo(1.8, 2);
    expect(d * asset.scale).toBeCloseTo(1.91, 2);
  });

  it('keep buildings clear of roads, ramps and bridges', () => {
    const segments = [...roadSegments(() => true), ...bridgeSegments];
    for (const node of ['Landmark_Lighthouse', 'Building_Workshop', 'Tree_001', 'Tree_003', 'Tree_005']) {
      for (const point of footprint(node, 7)) for (const [a, b] of segments) {
        expect(segmentPointDistance(a, b, point), node).toBeGreaterThan(0.3);
      }
    }
  });

  it('put the dock on a water-facing edge, clear of bridges and roads', () => {
    const dock = layout.placements.find(p => p.node === 'Dock_Entry')!;
    expect(land.has(hexKey(hexNeighbor(dock.tile, dock.edge!)))).toBe(false);
    for (const bridge of hexWorld.bridges) for (const port of [bridge.from, bridge.to]) {
      expect(hexKey(port.tile) === hexKey(dock.tile) && port.edge === dock.edge).toBe(false);
    }
    const corners = footprint('Dock_Entry');
    // The deck reaches out over water: its far corners leave the land tiles.
    expect(corners.filter(([x, z]) => !land.has(hexKey(worldToHex(x, z, hexWorld.size)))).length).toBeGreaterThan(0);
    // Its own spur road ends at the dock; every other road and bridge stays well away.
    const segments = [...roadSegments(id => id !== 'foundations-dock'), ...bridgeSegments];
    for (const [a, b] of segments) for (const corner of [...footprint('Dock_Entry', 5), hexToWorld(dock.tile, hexWorld.size)]) {
      expect(segmentPointDistance(a, b, corner)).toBeGreaterThan(0.5);
    }
    const spur = roadProfiles(hexWorld).find(r => r.routeId === 'foundations-dock')!.points.at(-1)!;
    pose('Dock_Entry').position.forEach((v, i) => expect(spur[i]).toBeCloseTo(v, 9));
  });

  it('sit the dock deck about 0.3 above the water on the low shore', () => {
    const levels = new Map<string, number>();
    part('Dock_Entry').object.traverse(o => {
      const geometry = (o as { geometry?: { attributes: Record<string, { count: number; getY: (i: number) => number }> } }).geometry;
      if (!geometry || o.name !== 'Dock_Timber_and_Ropes') return;
      const { position, normal } = geometry.attributes;
      for (let i = 0; i < position.count; i++) if (normal.getY(i) > .9) {
        const y = position.getY(i).toFixed(2);
        levels.set(y, (levels.get(y) ?? 0) + 1);
      }
    });
    // The deck planks are the most common upward-facing level of the dock timber.
    const deck = Number([...levels.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    expect(deck).toBeCloseTo(0.04, 2);
    const height = pose('Dock_Entry').position[1] + deck * asset.scale - WATER_LEVEL;
    expect(height).toBeGreaterThan(0.25);
    expect(height).toBeLessThan(0.4);
  });

  it('do not overlap each other', () => {
    const boxes = layout.placements.filter(p => !p.node.startsWith('Tree')).map(p => {
      const c = footprint(p.node);
      return { node: p.node, minX: Math.min(...c.map(v => v[0])), maxX: Math.max(...c.map(v => v[0])), minZ: Math.min(...c.map(v => v[1])), maxZ: Math.max(...c.map(v => v[1])) };
    });
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
      const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
      expect(overlap, `${a.node} vs ${b.node}`).toBe(false);
    }
  });
});

describe('worldToHex', () => {
  it('inverts hexToWorld for every tile center', () => {
    for (const tile of hexWorld.settlements.flatMap(s => s.tiles)) {
      const [x, z] = hexToWorld(tile, hexWorld.size);
      expect(worldToHex(x, z, hexWorld.size)).toEqual({ q: tile.q, r: tile.r });
    }
  });
});
