import { hexKey, hexToWorld, type Axial } from '@/lib/islands/hex';
import { A, inList, shape, shift, tiles, type WorldLayout } from '@/lib/islands/hex-layout';
import { clusteredForest, naturalRocks, naturalTerrains, type KeepOut } from '@/lib/islands/hex-natural-scene';
import type { ForestPatch } from '@/lib/islands/hex-nature-data';
import type { HexSettlement, HexTile } from '@/lib/islands/hex-world';
import { regionLayout, type RegionLayout } from '@/lib/islands/regions/region-layouts';

/*
 * P9.1 visual prototype: the CS region's map with its four planned islands as real islands. Review page only
 * (/p9/cs); /world/cs keeps REGION_LAYOUTS.cs, which this file reads and never changes.
 *
 * The four islands with lessons (foundations, structures, algorithms, databases), every bridge, port, dock and camera
 * preset are the approved CS layout, untouched. The four planned islands keep their centres and their bridge ports;
 * what changes is the land itself: each gets its own outline, heights, woods and shore in place of the shared 19-tile
 * plate, and a landscape of its own (PLANNED_LANDSCAPES, drawn by p9-landscapes.tsx). In this layout they are ordinary
 * settlements, so the scene gives them the natural terrain, trees and rocks of the other islands and no mist; that they
 * are planned stays where it always was, in the world registry, which labels them 規劃中 and gives them no lesson link.
 */

type Zone = { terrain: HexTile['terrain']; height?: number };
interface PlannedSpec {
  islandId: string;
  /** Relative to the island's centre (the approved one). */
  shape: Axial[];
  zone: (t: Axial) => Zone;
  forest: Axial[];
  /** The tiles its landscape stands on: no road, port or tree there. */
  landscape: Axial[];
}
const has = (list: Axial[]) => inList(list);
const key = (t: Axial) => hexKey(t);

/*
 * 程式語言島: a ring of standing stones on a rise in the north-east, woods on the west shore, a cove to the south.
 * Its bridge port is (0, -2), on level lawn.
 */
const PL_HIGH = [A(1, -1), A(2, -2), A(2, -1)], PL_TOP = [A(3, -2)];
const programmingLanguages: PlannedSpec = {
  islandId: 'programming-languages',
  shape: shape(2, [A(-2, 0)], [A(3, -2), A(3, -1), A(3, 0), A(0, 3), A(-1, 3), A(1, 2), A(-3, 2), A(-3, 3)]),
  zone: t => key(t) === '0,0' ? { terrain: 'meadow' } : has(PL_TOP)(t) ? { terrain: 'stone', height: 1.2 } : has(PL_HIGH)(t) ? { terrain: 'grass', height: .6 }
    : has([A(0, 3), A(-1, 3), A(1, 2)])(t) ? { terrain: 'shore', height: -.55 } : has([A(-2, 1), A(-2, 2), A(-3, 2), A(-3, 3), A(-1, 2)])(t) ? { terrain: 'forest' }
      : has([A(1, 0), A(1, 1), A(2, 0)])(t) ? { terrain: 'meadow' } : { terrain: 'grass' },
  forest: [A(-2, 1), A(-2, 2), A(-3, 2), A(-3, 3), A(-1, 2)],
  landscape: [A(2, -2), A(2, -1), A(1, -1)],
};
/*
 * 計算機網路島: a long island running east, its far headland raised for the relay masts, a beach bay on the south and
 * pines along the north shore. Its bridge port is (-2, 2), on level lawn at the island's west end.
 */
const NET_HIGH = [A(2, -1), A(3, -2), A(2, 0)], NET_TOP = [A(3, -1), A(4, -2)];
const networks: PlannedSpec = {
  islandId: 'networks',
  shape: shape(2, [A(-2, 0), A(0, 2)], [A(3, -1), A(3, -2), A(4, -2), A(3, -3), A(1, -3), A(2, -3), A(3, 0), A(2, 1)]),
  zone: t => key(t) === '0,0' ? { terrain: 'meadow' } : has(NET_TOP)(t) ? { terrain: 'stone', height: 1.2 } : has(NET_HIGH)(t) ? { terrain: 'grass', height: .6 }
    : has([A(1, 1), A(2, 1), A(3, 0)])(t) ? { terrain: 'shore', height: -.55 } : has([A(0, -2), A(1, -3), A(2, -3), A(1, -2), A(3, -3)])(t) ? { terrain: 'forest' }
      : has([A(1, 0), A(-1, 1)])(t) ? { terrain: 'meadow' } : { terrain: 'grass' },
  forest: [A(0, -2), A(1, -3), A(2, -3), A(1, -2), A(3, -3)],
  landscape: [A(3, -1), A(2, -1), A(1, -1)],
};
/*
 * 系統分析與設計島: terraces stepping up to the east for the drafting floors, woods on the west. Its ports are (0, 2)
 * to the south and (-1, -1) to the north-west, both on level lawn.
 */
const SA_LOW = [A(1, 0), A(1, -1), A(2, -1)], SA_MID = [A(2, -2), A(3, -2), A(3, -1)], SA_TOP = [A(3, -3), A(4, -3)];
const systemsAnalysis: PlannedSpec = {
  islandId: 'systems-analysis',
  shape: shape(2, [A(2, 0)], [A(3, -1), A(3, -2), A(3, -3), A(4, -3), A(-3, 1), A(-3, 2), A(-3, 0)]),
  zone: t => key(t) === '0,0' ? { terrain: 'meadow' } : has(SA_TOP)(t) ? { terrain: 'stone', height: .9 } : has(SA_MID)(t) ? { terrain: 'grass', height: .6 }
    : has(SA_LOW)(t) ? { terrain: 'grass', height: .3 } : has([A(-2, 1), A(-2, 2), A(-3, 1), A(-3, 2), A(-3, 0), A(-2, 0)])(t) ? { terrain: 'forest' }
      : has([A(1, 1), A(0, 1)])(t) ? { terrain: 'meadow' } : has([A(-1, 2), A(1, -2)])(t) ? { terrain: 'sand' } : { terrain: 'grass' },
  forest: [A(-2, 1), A(-2, 2), A(-3, 1), A(-3, 2), A(-3, 0), A(-2, 0)],
  landscape: [A(2, -2), A(3, -2), A(2, -1), A(1, -1)],
};
/*
 * 管理資訊系統島: the region's northern island and the largest of the four, a broad plateau with the footings of an
 * archive laid out on it, a wooded north cape and a long west beach. Its bridge port is (0, 2), on level lawn.
 */
const IS_PLATEAU = [A(0, -1), A(1, -1), A(1, -2), A(0, -2), A(2, -2), A(-1, -1)], IS_CAPE = [A(0, -3), A(1, -3), A(-1, -2), A(2, -3), A(1, -4), A(0, -4)];
const informationSystems: PlannedSpec = {
  islandId: 'information-systems',
  shape: shape(2, [A(2, 0)], [A(0, -3), A(1, -3), A(2, -3), A(1, -4), A(0, -4), A(-3, 1), A(-3, 2), A(-3, 0), A(3, -2), A(3, -3), A(3, -1)]),
  zone: t => key(t) === '0,0' ? { terrain: 'meadow' } : has(IS_PLATEAU)(t) ? { terrain: 'grass', height: .35 } : has(IS_CAPE)(t) ? { terrain: 'forest', height: key(t) === '0,-4' || key(t) === '1,-4' ? .6 : 0 }
    : has([A(-3, 1), A(-3, 2), A(-2, 2)])(t) ? { terrain: 'shore', height: -.55 } : has([A(3, -2), A(3, -3)])(t) ? { terrain: 'stone', height: .6 }
      : has([A(1, 0), A(-1, 1), A(1, 1)])(t) ? { terrain: 'meadow' } : { terrain: 'grass' },
  forest: IS_CAPE,
  landscape: [A(0, -1), A(1, -1), A(1, -2), A(0, -2)],
};
const PLANNED = [programmingLanguages, networks, systemsAnalysis, informationSystems];

/*
 * P9.2 資料結構島 (an island with lessons): its own landmarks in place of the placeholder warehouse and crates. A hill
 * rises in the north for the Stack Tower, a terrace in the west for the Tree Observatory, a rise in the east for the
 * Graph Bridges, and the Queue Passage runs along the south beach. The island keeps its id, centre, tile list, ports
 * and roads (which leave the plaza through (-1, 0), (-1, 1), (1, 0) and (0, 1)/(1, 1), none of them raised or built on).
 * Landscape tiles, in this order: stack tower, tree observatory, graph bridges, queue passage (two tiles), pier.
 */
const DS_HEIGHT: Record<string, { terrain?: HexTile['terrain']; height: number }> = {
  '0,-2': { terrain: 'stone', height: .9 }, '0,-1': { terrain: 'grass', height: .45 }, '-1,-1': { terrain: 'grass', height: .45 },
  '1,-1': { terrain: 'grass', height: .3 },
};
const DS_LANDSCAPE = [A(0, -2), A(-1, -1), A(1, -1), A(-1, 2), A(0, 2), A(-1, 3)];
const raiseStructures = (s: HexSettlement): HexSettlement => ({
  ...s, ownLandmarks: true,
  tiles: s.tiles.map(t => {
    const lift = DS_HEIGHT[`${t.q - s.center.q},${t.r - s.center.r}`];
    return lift ? { ...t, terrain: lift.terrain ?? t.terrain, height: lift.height } : t;
  }),
});

/** A landscape site (a planned island's, or 資料結構島's own landmarks): the island, its centre, and its tiles (map coordinates). */
export interface PlannedLandscape { islandId: string; center: Axial; tiles: Axial[] }

function build(): { region: RegionLayout; landscapes: PlannedLandscape[] } {
  const base = regionLayout('cs'), { world } = base.layout;
  const specs = new Map(PLANNED.map(p => [p.islandId, p]));
  const settlements: HexSettlement[] = world.settlements.map(s => {
    if (s.islandId === 'structures') return raiseStructures(s);
    const spec = specs.get(s.islandId);
    if (!spec) return s;
    // An ordinary settlement: same id, centre and spurs, its own tiles, and no `planned` (which only chose the mist).
    return { islandId: s.islandId, center: s.center, surface: 'continuous', tiles: tiles(s.center, spec.shape, spec.zone), ...(s.spurs ? { spurs: s.spurs } : {}) };
  });
  const p9World = { ...world, settlements };
  const centers = new Map(settlements.map(s => [s.islandId, s.center]));
  const landscapes: PlannedLandscape[] = PLANNED.map(p => ({ islandId: p.islandId, center: centers.get(p.islandId)!, tiles: shift(p.landscape, centers.get(p.islandId)!) }));
  const ds = centers.get('structures')!;
  landscapes.push({ islandId: 'structures', center: ds, tiles: shift(DS_LANDSCAPE, ds) });
  const forests: ForestPatch[] = [...base.layout.forests, ...PLANNED.map(p => ({ islandId: p.islandId, tiles: shift(p.forest, centers.get(p.islandId)!), density: 4 }))];
  const natural = base.layout.natural!;
  // Trees and rocks keep off the landscapes as they keep off the buildings: one circle a landscape tile.
  const keepOut: KeepOut[] = [...natural.keepOut, ...landscapes.flatMap(l => l.tiles.map((t): KeepOut => [...hexToWorld(t, world.size), world.size * .95]))];
  const layout: WorldLayout = {
    ...base.layout, world: p9World, forests,
    natural: { ...natural, keepOut, trees: clusteredForest(p9World, forests, keepOut), rocks: naturalRocks(p9World, naturalTerrains(p9World), keepOut) },
  };
  return { region: { ...base, layout }, landscapes };
}
const built = build();
/** The CS region as the prototype draws it. */
export const P9_CS_REGION: RegionLayout = built.region;
export const PLANNED_LANDSCAPES: readonly PlannedLandscape[] = built.landscapes;
