import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbAssets } from '@/lib/islands/asset-registry';
import { checkGlbContract } from '@/lib/islands/glb-contract';
import { extractGlbParts, type GlbPart } from '@/lib/islands/glb-parts';
import { HEX_EDGES, hexDistance, hexKey, hexNeighbor, hexSpiral, hexToWorld, worldToHex } from '@/lib/islands/hex';
import { placementPose } from '@/lib/islands/hex-buildings';
import { buildSettlementTerrain, roadProfiles, tileTop } from '@/lib/islands/hex-terrain';
import { WATER_LEVEL, portPoint, validateHexWorld } from '@/lib/islands/hex-world';
import {
  SCALE_VARIANTS, WORKSHOP_DOOR, coastFoam, coastRocks, forestInstances, roadTiles, scalePrototypes, shallowHexes,
} from '@/lib/islands/hex-scale-prototype';
import { islands } from '@/lib/islands/data';
import { HIT_PROXY_MIN_WORLD, hitProxyBox } from '@/lib/islands/interaction-targets';
import { ROAD, bridgeParts, roadParts } from '@/lib/islands/hex-route-parts';

const asset = glbAssets['basics-island-v2.1'];
let parts: GlbPart[];
beforeAll(async () => {
  const bytes = readFileSync(`public${asset.url}`);
  const scene: Object3D = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  expect(checkGlbContract(scene, asset)).toEqual({ ok: true });
  parts = extractGlbParts(scene, asset, ['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry']).parts;
});
const segDist = ([ax, az]: number[], [bx, bz]: number[], [px, pz]: number[]) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)));
};

describe.each(SCALE_VARIANTS)('scale prototype %s', variant => {
  const { world, glb, forests } = scalePrototypes[variant];
  const layout = glb[0];
  const foundations = world.settlements[0];
  const land = new Map(world.settlements.flatMap(s => s.tiles.map(t => [hexKey(t), t] as const)));
  const footprint = (node: string, n = 7) => {
    const part = parts.find(p => p.node === node)!, pose = placementPose(world, layout.islandId, layout.placements.find(p => p.node === node)!);
    const cos = Math.cos(pose.rotation), sin = Math.sin(pose.rotation), s = asset.scale, out: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = part.bounds.min[0] + (part.bounds.max[0] - part.bounds.min[0]) * i / (n - 1), z = part.bounds.min[2] + (part.bounds.max[2] - part.bounds.min[2]) * j / (n - 1);
      out.push([pose.position[0] + s * (x * cos + z * sin), pose.position[2] + s * (-x * sin + z * cos)]);
    }
    return { points: out, base: pose.position[1], pose };
  };
  const segments = () => [
    ...roadProfiles(world).flatMap(r => r.points.slice(1).map((p, i) => ({ id: r.routeId, a: [r.points[i][0], r.points[i][2]], b: [p[0], p[2]] }))),
    ...world.bridges.map(b => ({ id: b.id, a: portPoint(world, b.from), b: portPoint(world, b.to) })),
  ];

  it('is a valid world with the agreed foundations size, not a perfect hexagon', () => {
    expect(validateHexWorld(world, islands.map(i => i.id))).toEqual([]);
    expect(foundations.tiles).toHaveLength(Number(variant));
    const radius = variant === '19' ? 2 : 3;
    const perfect = new Set(hexSpiral({ q: 0, r: 0 }, radius).map(hexKey));
    expect(foundations.tiles.some(t => !perfect.has(hexKey(t)))).toBe(true);
    expect(world.settlements.every(s => s.surface === 'continuous')).toBe(true);
  });

  it('keeps building scale at 0.6 and spreads workshop, lighthouse and dock apart', () => {
    expect(asset.scale).toBe(0.6);
    const tileOf = (node: string) => layout.placements.find(p => p.node === node)!.tile;
    const pairs = [['Building_Workshop', 'Landmark_Lighthouse'], ['Building_Workshop', 'Dock_Entry'], ['Landmark_Lighthouse', 'Dock_Entry']];
    const min = variant === '19' ? 2 : 3;
    for (const [a, b] of pairs) expect(hexDistance(tileOf(a), tileOf(b)), `${a}–${b}`).toBeGreaterThanOrEqual(min);
  });

  it('stands each building on level land (dock aside) and clear of roads and bridges', () => {
    for (const node of ['Landmark_Lighthouse', 'Building_Workshop']) {
      const { points, base } = footprint(node);
      for (const [x, z] of points) {
        const tile = foundations.tiles.find(t => hexKey(t) === hexKey(worldToHex(x, z, world.size)));
        expect(tile, `${node} ${x.toFixed(2)},${z.toFixed(2)}`).toBeDefined();
        expect(tileTop(tile!)).toBeCloseTo(base, 9);
        // The workshop's own road ends at its door; that approach is checked in its own test below.
        for (const s of segments().filter(s => !(node === 'Building_Workshop' && s.id === 'foundations-workshop'))) {
          expect(segDist(s.a, s.b, [x, z]), `${node} vs ${s.id}`).toBeGreaterThan(0.3);
        }
      }
    }
    const dock = footprint('Dock_Entry', 5);
    for (const s of segments().filter(s => s.id !== 'foundations-dock')) for (const p of dock.points) expect(segDist(s.a, s.b, p)).toBeGreaterThan(0.5);
    expect(dock.base + 0.04 * asset.scale - WATER_LEVEL).toBeGreaterThan(0.25);
    expect(dock.base + 0.04 * asset.scale - WATER_LEVEL).toBeLessThan(0.4);
  });

  it('reaches the dock, the lighthouse lookout and both bridges by road, with ramps on every height change', () => {
    const profiles = roadProfiles(world);
    expect(profiles.filter(r => r.islandId === 'foundations').map(r => r.routeId).sort())
      .toEqual(variant === '37' ? ['foundations-dock', 'foundations-lighthouse', 'foundations-structures', 'foundations-workshop']
        : ['foundations-dock', 'foundations-lighthouse', 'foundations-structures']);
    for (const r of profiles) for (let i = 1; i < r.points.length; i++) {
      const [a, b] = [r.points[i - 1], r.points[i]];
      expect(Math.abs(b[1] - a[1])).toBeLessThanOrEqual(Math.tan((35 * Math.PI) / 180) * Math.hypot(b[0] - a[0], b[2] - a[2]) + 1e-9);
    }
    const ramps = world.settlements.flatMap(s => buildSettlementTerrain(world, s).ramps);
    expect(ramps.length).toBeGreaterThanOrEqual(2);
  });

  // 19 tiles scatters trees inside each forest tile; 37 tiles (D.2c-1) uses the clustered layout, with a few
  // trees spilling onto grass next to a forest (checked in detail in hex-natural.test.ts).
  it(variant === '19' ? 'plants forests only on forest tiles, off roads, inside the tile and away from buildings'
    : 'plants clustered forests on and beside forest tiles, off roads and away from buildings', () => {
    const trees = variant === '19' ? forestInstances(world, forests) : scalePrototypes['37'].natural!.trees, roads = roadTiles(world);
    expect(trees.length).toBeGreaterThan(variant === '19' ? 20 : 60);
    const buildings = ['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry'].map(n => footprint(n, 5).points);
    const forestKeys = new Set(forests.flatMap(f => f.tiles.map(t => `${f.islandId}:${hexKey(t)}`)));
    for (const tree of trees) {
      const tile = land.get(hexKey(tree.tile))!;
      if (variant === '19') {
        expect(tile.terrain).toBe('forest');
        expect(roads.has(`${tree.islandId}:${hexKey(tree.tile)}`)).toBe(false);
        const [cx, cz] = hexToWorld(tile, world.size);
        expect(Math.hypot(tree.position[0] - cx, tree.position[2] - cz)).toBeLessThan(0.7);
      } else {
        expect(tile.terrain === 'forest' || ['grass', 'meadow'].includes(tile.terrain)).toBe(true);
        // Off a forest tile only right next to one (spill trees at the forest edge).
        if (tile.terrain !== 'forest') expect(HEX_EDGES.some(e => forestKeys.has(`${tree.islandId}:${hexKey(hexNeighbor(tile, e))}`))).toBe(true);
        for (const s of segments()) expect(segDist(s.a, s.b, [tree.position[0], tree.position[2]]), s.id).toBeGreaterThan(0.6);
      }
      expect(tree.position[1]).toBeCloseTo(tileTop(tile), 9);
      if (tree.islandId === 'foundations') for (const fp of buildings) for (const p of fp) {
        expect(Math.hypot(tree.position[0] - p[0], tree.position[2] - p[1])).toBeGreaterThan(0.45);
      }
    }
  });

  it('puts rocks, foam and shallows only on water, never on land or the dock and bridge edges', () => {
    for (const rock of coastRocks(world)) expect(land.has(hexKey(worldToHex(rock.position[0], rock.position[2], world.size)))).toBe(false);
    expect(coastFoam(world).length).toBe(world.settlements.flatMap(s => buildSettlementTerrain(world, s).walls).filter(w => w.kind === 'coast').length);
    for (const h of shallowHexes(world, 1)) expect(land.has(hexKey(h))).toBe(false);
  });
});

describe('scale prototype bridges', () => {
  it('span one water hex at 19 tiles and two at 37', () => {
    for (const variant of SCALE_VARIANTS) {
      const { world } = scalePrototypes[variant];
      for (const b of world.bridges) {
        const [ax, az] = portPoint(world, b.from), [bx, bz] = portPoint(world, b.to);
        expect(Math.hypot(bx - ax, bz - az)).toBeCloseTo((variant === '19' ? 1 : 2) * Math.sqrt(3) * world.size, 9);
      }
    }
  });
});

describe('37 tile refinement: hit proxies', () => {
  const { world, glb } = scalePrototypes['37'];
  const proxies = () => ['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry'].map(node => {
    const part = parts.find(p => p.node === node)!, box = hitProxyBox(part.bounds, asset.scale);
    const pose = placementPose(world, 'foundations', glb[0].placements.find(p => p.node === node)!);
    const cos = Math.cos(pose.rotation), sin = Math.sin(pose.rotation), s = asset.scale;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
      const x = box.center[0] + i * box.size[0] / 2, z = box.center[2] + j * box.size[2] / 2;
      return [pose.position[0] + s * (x * cos + z * sin), pose.position[2] + s * (-x * sin + z * cos)];
    });
    return { node, part, box, corners };
  });

  it('enclose each target and are at least the minimum tap size on the map', () => {
    for (const { node, part, box } of proxies()) {
      for (const i of [0, 1, 2]) {
        expect(box.center[i] - box.size[i] / 2, `${node} min[${i}]`).toBeLessThanOrEqual(part.bounds.min[i] + 1e-9);
        expect(box.center[i] + box.size[i] / 2, `${node} max[${i}]`).toBeGreaterThanOrEqual(part.bounds.max[i] - 1e-9);
      }
      expect(box.size[0] * asset.scale).toBeGreaterThanOrEqual(HIT_PROXY_MIN_WORLD - 1e-9);
      expect(box.size[2] * asset.scale).toBeGreaterThanOrEqual(HIT_PROXY_MIN_WORLD - 1e-9);
    }
    // The dock is the target that needed it: its own footprint is smaller than the minimum.
    const dock = parts.find(p => p.node === 'Dock_Entry')!;
    expect((dock.bounds.max[0] - dock.bounds.min[0]) * asset.scale).toBeLessThan(HIT_PROXY_MIN_WORLD);
  });

  it('do not overlap each other, so a tap always resolves to one target', () => {
    const boxes = proxies().map(p => ({ node: p.node, minX: Math.min(...p.corners.map(c => c[0])), maxX: Math.max(...p.corners.map(c => c[0])),
      minZ: Math.min(...p.corners.map(c => c[1])), maxZ: Math.max(...p.corners.map(c => c[1])) }));
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
      expect(a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ, `${a.node} vs ${b.node}`).toBe(false);
    }
  });
});

describe('37 tile refinement: merged route parts', () => {
  const { world } = scalePrototypes['37'];

  it('describe one strip and one joint per road segment, sloped like the road profile', () => {
    const { boxes, joints } = roadParts(world);
    const segments = roadProfiles(world).reduce((n, r) => n + r.points.length - 1, 0);
    expect(boxes).toHaveLength(segments);
    expect(joints).toHaveLength(segments);
    for (const b of boxes) {
      expect(b.size[1]).toBe(ROAD.thickness);
      expect(Math.abs(b.pitch)).toBeLessThan((35 * Math.PI) / 180);
    }
  });

  it('keep every bridge part inside its bridge corridor', () => {
    const { boxes, arches } = bridgeParts(world);
    const planks = world.bridges.filter(b => b.kind === 'wood').reduce((n, b) => {
      const [ax, az] = portPoint(world, b.from), [bx, bz] = portPoint(world, b.to);
      return n + Math.round(Math.hypot(bx - ax, bz - az) / .2);
    }, 0);
    // planks + one deck per stone bridge + two rails and their posts per bridge
    const expected = planks + world.bridges.reduce((n, b) => n + (b.kind === 'stone' ? 1 + 2 + 14 : 2 + 10), 0);
    expect(boxes).toHaveLength(expected);
    expect(arches).toHaveLength(world.bridges.filter(b => b.kind === 'stone').length);
    for (const box of boxes) {
      const near = world.bridges.some(b => segDist(portPoint(world, b.from), portPoint(world, b.to), [box.position[0], box.position[2]]) < 0.5);
      expect(near).toBe(true);
    }
  });
});

describe('37 tile workshop entrance road', () => {
  const { world, glb } = scalePrototypes['37'];
  const layout = glb[0], foundations = world.settlements[0];
  const pose = placementPose(world, 'foundations', layout.placements.find(p => p.node === 'Building_Workshop')!);
  const s = asset.scale;
  // Map point -> Building_Workshop local GLB units (the workshop is not rotated).
  const local = ([x, z]: number[]) => [(x - pose.position[0]) / s, (z - pose.position[2]) / s];
  const road = () => roadProfiles(world).find(r => r.routeId === 'foundations-workshop')!;
  const mesh = () => {
    let found: Object3D | undefined;
    parts.find(p => p.node === 'Building_Workshop')!.object.traverse(o => { if (o.name === 'Workshop_Architecture') found = o; });
    return (found as unknown as { geometry: { attributes: Record<string, { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number }> } }).geometry.attributes;
  };

  it('uses the real door: +z wall, Anchor_Workshop x/z, between the porch posts', () => {
    const anchor = parts.find(p => p.node === 'Building_Workshop')!.anchor!.offset;
    expect(anchor[0]).toBeCloseTo(WORKSHOP_DOOR.x, 5);
    expect(anchor[2]).toBeCloseTo(WORKSHOP_DOOR.z, 5);
    const { position, normal } = mesh();
    // The front (+z) wall sits at z ≈ 1.2; posts below 0.5 high stand in front of it.
    const posts: number[] = [];
    for (let i = 0; i < position.count; i++) if (position.getY(i) < .5 && position.getZ(i) > 1.35) posts.push(position.getX(i));
    const left = posts.filter(x => x < WORKSHOP_DOOR.x), right = posts.filter(x => x > WORKSHOP_DOOR.x);
    expect(left.length && right.length).toBeTruthy();
    // The road (0.5 wide on the map) fits between the inner faces of the two posts.
    expect(Math.min(...right) - Math.max(...left)).toBeGreaterThan(ROAD.width / s);
    let frontWall = -Infinity;
    for (let i = 0; i < position.count; i++) if (normal.getZ(i) > .9 && position.getY(i) < 1.6 && position.getY(i) > .5) frontWall = Math.max(frontWall, position.getZ(i));
    expect(frontWall).toBeLessThan(WORKSHOP_DOOR.z);
  });

  it('runs plaza -> south -> east -> straight north between the posts to the door, with no height gap', () => {
    const points = road().points;
    const [cx, cz] = hexToWorld(foundations.center, world.size);
    expect(points[0][0]).toBeCloseTo(cx, 9);
    expect(points[0][2]).toBeCloseTo(cz, 9);
    const end = points.at(-1)!, front = points.at(-2)!;
    const [ex, ez] = local([end[0], end[2]]), [fx, fz] = local([front[0], front[2]]);
    expect(ex).toBeCloseTo(WORKSHOP_DOOR.x, 6);
    expect(ez).toBeCloseTo(WORKSHOP_DOOR.z, 6);
    expect(fx).toBeCloseTo(WORKSHOP_DOOR.x, 6);
    expect(fz).toBeGreaterThan(1.83);
    // Every road point is on the workshop's ground level: the road meets the door step without a drop.
    for (const p of points) expect(p[1]).toBeCloseTo(pose.position[1], 9);
  });

  it('keeps every road on land, off forest, and clear of buildings except at its own destination', () => {
    const footprints = Object.fromEntries(['Landmark_Lighthouse', 'Building_Workshop'].map(node => {
      const part = parts.find(p => p.node === node)!, pl = placementPose(world, 'foundations', layout.placements.find(p => p.node === node)!);
      return [node, { part, pl }];
    }));
    const inside = (node: string, x: number, z: number, margin: number) => {
      const { part, pl } = footprints[node];
      const lx = (x - pl.position[0]) / s, lz = (z - pl.position[2]) / s;
      return lx > part.bounds.min[0] - margin && lx < part.bounds.max[0] + margin && lz > part.bounds.min[2] - margin && lz < part.bounds.max[2] + margin;
    };
    for (const r of roadProfiles(world).filter(r => r.islandId === 'foundations')) {
      for (let i = 1; i < r.points.length; i++) {
        const [a, b] = [r.points[i - 1], r.points[i]], approach = r.routeId === 'foundations-workshop' && i === r.points.length - 1;
        // Bridge and dock roads end exactly on a coast edge; stop just short of that shared boundary.
        const toEdge = r.routeId !== 'foundations-workshop' && r.routeId !== 'foundations-lighthouse' && i === r.points.length - 1;
        for (let k = 0; k <= (toEdge ? 19 : 20); k++) {
          const x = a[0] + (b[0] - a[0]) * k / 20, z = a[2] + (b[2] - a[2]) * k / 20;
          const tile = foundations.tiles.find(t => hexKey(t) === hexKey(worldToHex(x, z, world.size)));
          expect(tile, `${r.routeId} on land at ${x.toFixed(2)},${z.toFixed(2)}`).toBeDefined();
          expect(tile!.terrain).not.toBe('forest');
          expect(inside('Landmark_Lighthouse', x, z, .3 / s), `${r.routeId} vs lighthouse`).toBe(false);
          // The final approach is meant to enter the workshop's porch; every other stretch stays clear.
          if (!approach) expect(inside('Building_Workshop', x, z, .3 / s), `${r.routeId} vs workshop`).toBe(false);
          else expect(local([x, z])[1]).toBeGreaterThanOrEqual(WORKSHOP_DOOR.z - 1e-9);
        }
      }
    }
  });

  it('does not overlap or cross other roads: routes only meet at the plaza', () => {
    const segs = roadProfiles(world).filter(r => r.islandId === 'foundations')
      .flatMap(r => r.points.slice(1).map((p, i) => ({ id: r.routeId, a: [r.points[i][0], r.points[i][2]], b: [p[0], p[2]] })));
    const cross = (p: number[], q: number[], r: number[], t: number[]) => {
      const d = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return d(p, q, r) * d(p, q, t) < -1e-9 && d(r, t, p) * d(r, t, q) < -1e-9;
    };
    for (const [i, u] of segs.entries()) for (const v of segs.slice(i + 1)) {
      if (u.id === v.id) continue;
      expect(cross(u.a, u.b, v.a, v.b), `${u.id} crosses ${v.id}`).toBe(false);
      // Apart from the shared plaza start, no stretch of two different roads runs within a road width.
      const sharesStart = [u.a, u.b].some(p => [v.a, v.b].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9));
      if (!sharesStart) for (let k = 0; k <= 10; k++) {
        const p = [u.a[0] + (u.b[0] - u.a[0]) * k / 10, u.a[1] + (u.b[1] - u.a[1]) * k / 10];
        expect(segDist(v.a, v.b, p), `${u.id} runs along ${v.id}`).toBeGreaterThan(ROAD.width);
      }
    }
  });

  it('rejects a workshop road through non-adjacent tiles or off level land', () => {
    const broken = structuredClone(world);
    const spur = broken.settlements[0].spurs!.find(x => x.id === 'foundations-workshop')!;
    spur.via = [{ q: 0, r: 2 }];
    spur.approach = [[0, 6]];
    const problems = validateHexWorld(broken, islands.map(i => i.id));
    expect(problems.some(p => p.includes('is not adjacent'))).toBe(true);
    expect(problems.some(p => p.includes('approach leaves level land'))).toBe(true);
  });
});
