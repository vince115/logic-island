import type { RegionId } from '@/content/world/types';
import type { OverviewPlacement, OverviewShape, WorldLink, WorldMapSpec } from './schema';

/*
 * P8.2 World Layout Registry: the hub in the middle of the sea and the regions around it (decision D2). A natural,
 * uneven ring rather than five equal slots: clockwise from the far side CS, AI, design, web, sys, each at its own
 * distance and drawn at a width that follows how much land it has. Positions are in screen-aligned sea units
 * ([right, away]); `tall` is the phone composition, two columns around the hub. A proposal for screenshot review:
 * nothing here changes a region's own map.
 *
 * P8.3 (D7, approved 2026-11-12): the world's topology is the hub joined to every region, and relation bridges between
 * regions that are neighbours on the ring. The four bridges below are the neighbouring pairs whose lessons build on
 * each other (CS–AI, design–web, web–sys, sys–CS, at the time of review); AI and design are neighbours without one.
 * This is stored, reviewed data: nothing here reads the curriculum, so adding lessons or prerequisites never moves a
 * region or a bridge. A bridge is added or removed by editing this list.
 */
export const WORLD_MAP: WorldMapSpec = {
  hub: {
    islandId: 'labs',
    wide: { at: [0, 0], width: 8, label: 'below' },
    tall: { at: [0, 0], width: 6, label: 'below' },
  },
  regions: {
    cs: { wide: { at: [-4, 30], width: 30, label: 'above' }, tall: { at: [-1, 28], width: 19, label: 'above' } },
    ai: { wide: { at: [27, 10], width: 23, label: 'below' }, tall: { at: [13, 9], width: 13, label: 'below' } },
    design: { wide: { at: [19, -24], width: 16, label: 'below' }, tall: { at: [10, -19], width: 11, label: 'below' } },
    web: { wide: { at: [-13, -28], width: 19, label: 'below' }, tall: { at: [-10, -23], width: 13, label: 'below' } },
    sys: { wide: { at: [-29, 4], width: 20, label: 'below' }, tall: { at: [-13, 4], width: 12, label: 'below' } },
  },
  ring: ['cs', 'ai', 'design', 'web', 'sys'],
  bridges: [
    { id: 'cs-ai', between: ['cs', 'ai'] },
    { id: 'design-web', between: ['design', 'web'] },
    { id: 'web-sys', between: ['web', 'sys'] },
    { id: 'sys-cs', between: ['sys', 'cs'] },
  ],
};

/** The regions that have a place on the overview, in the order they are declared above. */
export const worldMapRegionIds = () => Object.keys(WORLD_MAP.regions) as RegionId[];

/** Whether two regions follow each other on the ring (in either direction). */
export function ringNeighbours(map: WorldMapSpec, a: RegionId, b: RegionId) {
  const i = map.ring.indexOf(a), j = map.ring.indexOf(b), n = map.ring.length;
  return i >= 0 && j >= 0 && i !== j && ((i + 1) % n === j || (j + 1) % n === i);
}
/** Every connection of the overview: the hub's link to each region of the ring, then the relation bridges. */
export const worldLinks = (map: WorldMapSpec): WorldLink[] => [
  ...map.ring.map(to => ({ id: `hub-${to}`, kind: 'hub' as const, from: 'hub' as const, to })),
  ...map.bridges.map(b => ({ id: b.id, kind: 'relation' as const, from: b.between[0], to: b.between[1] })),
];
/** The regions a relation bridge joins to `id`, in ring order. Every other region is reached through the hub. */
export const bridgedRegions = (map: WorldMapSpec, id: RegionId): RegionId[] =>
  map.ring.filter(other => map.bridges.some(b => (b.between[0] === id && b.between[1] === other) || (b.between[1] === id && b.between[0] === other)));

type Point = readonly [number, number];
/** How close segment a–b passes to point c. */
export function distanceToSegment(c: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / length)) : 0;
  return Math.hypot(c[0] - a[0] - dx * t, c[1] - a[1] - dz * t);
}

/**
 * Rules of the overview composition, checked in unit tests. Placement: every placed region is drawn at a positive
 * width, and no two outlines' circles (half the width) nor the hub's overlap, so labels and links have sea between
 * them. P8.3 topology: the ring is exactly the placed regions, in clockwise order on screen in this shape (so a
 * neighbour in the data is a neighbour on the map); every bridge joins two different neighbours, once; and no link's
 * straight line passes through the circle of a part it does not join.
 */
export function validateWorldMap(map: WorldMapSpec, shape: OverviewShape): string[] {
  const problems: string[] = [];
  const parts = [{ id: 'hub', ...map.hub[shape] }, ...(Object.entries(map.regions) as [RegionId, Record<OverviewShape, OverviewPlacement>][]).map(([id, p]) => ({ id: id as string, ...p[shape] }))];
  for (const part of parts) if (!(part.width > 0)) problems.push(`${part.id}: width ${part.width}`);
  for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) {
    const distance = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
    if (distance < (a.width + b.width) / 2) problems.push(`${a.id} and ${b.id} overlap on the ${shape} overview (${distance.toFixed(1)} apart, need ${((a.width + b.width) / 2).toFixed(1)})`);
  }

  const placed = Object.keys(map.regions);
  if ([...map.ring].sort().join() !== [...placed].sort().join() || new Set(map.ring).size !== map.ring.length) problems.push(`ring ${map.ring.join(', ')} is not the placed regions ${placed.join(', ')}, each once`);
  const hub = map.hub[shape].at;
  const angle = (id: RegionId) => { const at = map.regions[id]?.[shape].at; return at ? Math.atan2(at[1] - hub[1], at[0] - hub[0]) : NaN; };
  // Clockwise on screen: the angle (counter-clockwise from the right) falls from each region to the next, one full turn in all.
  const turned = map.ring.reduce((sum, id, i) => { const step = angle(id) - angle(map.ring[(i + 1) % map.ring.length]); return sum + ((step % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); }, 0);
  if (map.ring.length > 2 && !(Math.abs(turned - 2 * Math.PI) < 1e-6)) problems.push(`ring ${map.ring.join(', ')} is not clockwise around the hub on the ${shape} overview`);

  const seen = new Set<string>();
  for (const bridge of map.bridges) {
    const [a, b] = bridge.between, key = [a, b].sort().join('-');
    if (!map.regions[a] || !map.regions[b]) problems.push(`bridge ${bridge.id}: ${!map.regions[a] ? a : b} is not placed`);
    else if (!ringNeighbours(map, a, b)) problems.push(`bridge ${bridge.id}: ${a} and ${b} are not neighbours on the ring`);
    if (seen.has(key)) problems.push(`bridge ${bridge.id}: ${a} and ${b} are joined twice`);
    seen.add(key);
  }
  const at = (id: string) => parts.find(p => p.id === id);
  for (const link of worldLinks(map)) {
    const a = at(link.from), b = at(link.to);
    if (!a || !b) continue;
    for (const other of parts) {
      if (other === a || other === b) continue;
      if (distanceToSegment(other.at, a.at, b.at) < other.width / 2) problems.push(`${link.id} passes through ${other.id} on the ${shape} overview`);
    }
  }
  return problems;
}
