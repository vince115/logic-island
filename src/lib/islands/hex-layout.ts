import { addAxial, hexDistance, hexSpiral, type Axial } from './hex';
import { glbAssets } from './asset-registry';
import { placementPose, type HexGlbSettlement } from './hex-buildings';
import {
  MAIN_ROAD_WIDTH, MAIN_ROUTES, clusteredForest, naturalRocks, naturalTerrains, plazaLayout, type KeepOut, type NaturalRock, type PlazaLayout,
} from './hex-natural-scene';
import type { ForestPatch, TreeInstance } from './hex-nature-data';
import type { HexBridge, HexSettlement, HexSpur, HexTerrain, HexTile, HexWorld } from './hex-world';

/**
 * Builders shared by the world layouts (D.3-1): the production world (`islands-world.ts`, 37 tiles) and the
 * 19-tile scale prototype describe their own tiles, roads, bridges and buildings as a `LayoutSpec`;
 * `assembleLayout` turns either into the same `WorldLayout`.
 */
export interface WorldLayout {
  world: HexWorld;
  glb: HexGlbSettlement[];
  forests: ForestPatch[];
  /** Zone summary for the comparison report: which tiles serve which purpose. */
  zones: Record<'plaza' | 'buildings' | 'forest' | 'hills' | 'shore' | 'open', number>;
  /**
   * D.2c-1 natural style, placed once here: clustered trees, rocks, the plaza layout and the wider main route from
   * the dock through the plaza to the lighthouse.
   */
  natural?: { trees: TreeInstance[]; rocks: NaturalRock[]; keepOut: KeepOut[]; plaza: PlazaLayout; roadWidths: Record<string, number> };
}

export const at = (a: Axial, b: Axial) => a.q === b.q && a.r === b.r;
export const shift = (tiles: Axial[], center: Axial) => tiles.map(t => addAxial(t, center));
/** A radius-n hex with some rim tiles removed and others added, so coasts are not symmetric. */
export function shape(radius: number, remove: Axial[], extra: Axial[]): Axial[] {
  return [...hexSpiral({ q: 0, r: 0 }, radius).filter(t => !remove.some(x => at(x, t))), ...extra];
}
type Zone = { terrain: HexTerrain; height?: number };
export function tiles(center: Axial, rel: Axial[], zone: (t: Axial) => Zone): HexTile[] {
  return rel.map(t => ({ ...addAxial(t, center), ...zone(t) }));
}
export const inList = (list: Axial[]) => (t: Axial) => list.some(x => at(x, t));
export const A = (q: number, r: number): Axial => ({ q, r });

/* -------------------------------------------- the other two islands (placeholders) */

function harbor(center: Axial, rel: Axial[], forest: Axial[]): HexTile[] {
  return tiles(center, rel, t => at(t, A(0, 0)) ? { terrain: 'plaza' } : t.r >= 1 && t.q + t.r >= 1 ? { terrain: 'sand' }
    : inList(forest)(t) ? { terrain: 'forest' } : { terrain: 'meadow' });
}
function ridge(center: Axial, rel: Axial[], forest: Axial[]): HexTile[] {
  return tiles(center, rel, t => at(t, A(0, 0)) ? { terrain: 'plaza' }
    : t.r <= -1 && t.q <= 1 ? hexDistance(t, A(0, 0)) >= 2 ? { terrain: 'stone', height: .7 } : { terrain: 'grass', height: .35 }
      : inList(forest)(t) ? { terrain: 'forest' } : { terrain: 'grass' });
}

/** 2026-11-01 (home page only): the visualization lab island, a plaza ringed by lawn with a beach on its south shore. */
function lab(center: Axial, rel: Axial[], forest: Axial[]): HexTile[] {
  return tiles(center, rel, t => at(t, A(0, 0)) ? { terrain: 'plaza' } : t.r >= 1 && t.q + t.r >= 1 ? { terrain: 'sand' }
    : inList(forest)(t) ? { terrain: 'forest' } : { terrain: 'grass' });
}

/**
 * Phase F.2 (home page only): 資料庫應用島, a plaza (the data-table square) with the main tower's terrace raised to the
 * north and a beach on the south-east shore where the bridge from the structures island lands.
 */
function vault(center: Axial, rel: Axial[], forest: Axial[], terrace: Axial[]): HexTile[] {
  return tiles(center, rel, t => at(t, A(0, 0)) ? { terrain: 'plaza' } : inList(terrace)(t) ? { terrain: 'grass', height: .35 }
    : t.r >= 1 && t.q + t.r >= 1 ? { terrain: 'sand' } : inList(forest)(t) ? { terrain: 'forest' } : { terrain: 'grass' });
}

/**
 * M3.1 (regional world prototype): an island of the plan with no lessons yet, low detail. A beach on its south-east
 * shore like the other islands, the rest lawn, no plaza, woods or landmarks.
 */
function planned(center: Axial, rel: Axial[]): HexTile[] {
  return tiles(center, rel, t => t.r >= 1 && t.q + t.r >= 1 ? { terrain: 'sand' } : { terrain: 'grass' });
}

/** Tile counts per zone for the foundations island, for the comparison report. */
function zones(settlement: HexSettlement, buildingTiles: Axial[]): WorldLayout['zones'] {
  const count = (f: (t: HexTile) => boolean) => settlement.tiles.filter(f).length;
  const isBuilding = inList(buildingTiles);
  return {
    plaza: count(t => t.terrain === 'plaza'),
    buildings: count(t => isBuilding(t)),
    forest: count(t => t.terrain === 'forest'),
    hills: count(t => t.terrain === 'stone' || (t.height ?? 0) > 0),
    shore: count(t => t.terrain === 'shore'),
    open: count(t => (t.terrain === 'grass' || t.terrain === 'meadow') && !isBuilding(t) && (t.height ?? 0) === 0),
  };
}

/**
 * The v2.1 workshop door, in Building_Workshop local GLB units: the door panel spans x 0.01–0.59 on the
 * +z wall (Anchor_Workshop sits at x 0.30, z 1.55), between porch posts at x ≈ -0.45 and 1.05.
 * Tests check these numbers against the GLB itself.
 */
export const WORKSHOP_DOOR = { x: 0.3, z: 1.55, approach: 1.5 } as const;
/** Map point of the workshop door, and of the spot straight in front of it, for a workshop at `pivot`. */
export function workshopDoor(pivot: [number, number], scale = glbAssets['basics-island-v2.1'].scale) {
  const door: [number, number] = [pivot[0] + WORKSHOP_DOOR.x * scale, pivot[1] + WORKSHOP_DOOR.z * scale];
  return { door, front: [door[0], door[1] + WORKSHOP_DOOR.approach * scale] as [number, number] };
}
/**
 * The v2.1 lighthouse in Landmark_Lighthouse local GLB units: its base reaches z 0.90 on the +z side, where
 * Anchor_Lighthouse (the door) sits at z 0.78. D.2c-1 ends the lookout road `gap` in front of that base.
 */
export const LIGHTHOUSE_BASE = { front: 0.9, gap: 0.65 } as const;
export function lighthouseFront(pivot: [number, number], scale = glbAssets['basics-island-v2.1'].scale): [number, number] {
  return [pivot[0], pivot[1] + (LIGHTHOUSE_BASE.front + LIGHTHOUSE_BASE.gap) * scale];
}

/**
 * Rough building footprints (map units) for keeping trees, rocks and plaza features clear; the unit tests check the
 * results against the real GLB footprints. The workshop is about 1.8 × 1.9 at 0.6 scale, so three circles.
 */
const KEEP_OUT: Record<string, [number, number, number][]> = {
  Landmark_Lighthouse: [[0, 0, 0.8]], Dock_Entry: [[0, 0, 0.9]], Building_Workshop: [[-0.55, 0.15, 1], [0, 0.15, 1], [0.55, 0.15, 1]],
};
function natural(world: HexWorld, layout: HexGlbSettlement, forests: ForestPatch[]): NonNullable<WorldLayout['natural']> {
  const keepOut: KeepOut[] = layout.placements.flatMap(p => {
    const pose = placementPose(world, layout.islandId, p);
    return (KEEP_OUT[p.node] ?? []).map(([x, z, r]): KeepOut => [pose.position[0] + x, pose.position[2] + z, r]);
  });
  const lighthouse = placementPose(world, layout.islandId, layout.placements.find(p => p.node === 'Landmark_Lighthouse')!).position;
  // The terrace reaches from under the lighthouse base to the end of the lookout road.
  const terrace: [number, number, number] = [lighthouse[0], lighthouse[2], (LIGHTHOUSE_BASE.front + LIGHTHOUSE_BASE.gap) * glbAssets[layout.asset].scale];
  return { keepOut, trees: clusteredForest(world, forests, keepOut), rocks: naturalRocks(world, naturalTerrains(world), keepOut),
    plaza: plazaLayout(world, layout.islandId, keepOut, { terrace }),
    roadWidths: Object.fromEntries(MAIN_ROUTES.map(id => [id, MAIN_ROAD_WIDTH])) };
}

/** One world as data: the foundations island (with its GLB buildings), the two placeholder islands and the bridges. */
export interface LayoutSpec {
  foundations: { tiles: HexTile[]; cliffBeaches?: Axial[]; spurs: HexSpur[]; forest: Axial[]; buildingTiles: Axial[] };
  structures: { center: Axial; shape: Axial[]; forest: Axial[] };
  algorithms: { center: Axial; shape: Axial[]; forest: Axial[] };
  /** 2026-11-01: the Interactive Lab Island (互動實驗島), on the home page's world only. */
  labs?: { center: Axial; shape: Axial[]; forest: Axial[] };
  /** Phase F.2: 資料庫應用島, on the home page's world only; `terrace` tiles are raised for the main tower. */
  databases?: { center: Axial; shape: Axial[]; forest: Axial[]; terrace: Axial[] };
  /** M3.1 regional world prototype: islands of the plan, appended after the others (see `planned`). */
  planned?: PlannedSettlement[];
  bridges: HexBridge[];
  glb: Pick<HexGlbSettlement, 'label' | 'placements'>;
  /** Place the D.2c-1 natural layout (clustered trees, rocks, plaza, main route). */
  natural: boolean;
}

export interface PlannedSettlement { islandId: string; center: Axial; shape: Axial[]; spurs?: HexSpur[] }
export const plannedSettlement = ({ islandId, center, shape, spurs }: PlannedSettlement): HexSettlement =>
  ({ islandId, center, surface: 'continuous', planned: true, tiles: planned(center, shape), ...(spurs ? { spurs } : {}) });

export function assembleLayout(spec: LayoutSpec): WorldLayout {
  const { foundations: f, structures: s, algorithms: a } = spec;
  const foundations: HexSettlement = {
    islandId: 'foundations', center: A(0, 0), surface: 'continuous', tiles: f.tiles,
    ...(f.cliffBeaches ? { cliffBeaches: f.cliffBeaches } : {}), spurs: f.spurs,
  };
  const structures: HexSettlement = { islandId: 'structures', center: s.center, surface: 'continuous', tiles: harbor(s.center, s.shape, s.forest) };
  const algorithms: HexSettlement = { islandId: 'algorithms', center: a.center, surface: 'continuous', tiles: ridge(a.center, a.shape, a.forest) };
  const labs: HexSettlement[] = spec.labs ? [{ islandId: 'labs', center: spec.labs.center, surface: 'continuous', tiles: lab(spec.labs.center, spec.labs.shape, spec.labs.forest) }] : [];
  const d = spec.databases;
  const databases: HexSettlement[] = d ? [{ islandId: 'databases', center: d.center, surface: 'continuous', tiles: vault(d.center, d.shape, d.forest, d.terrace) }] : [];
  const world: HexWorld = { size: 1.25, settlements: [foundations, structures, algorithms, ...labs, ...databases, ...(spec.planned ?? []).map(plannedSettlement)], bridges: spec.bridges };
  const glb: HexGlbSettlement[] = [{ islandId: 'foundations', asset: 'basics-island-v2.1', label: spec.glb.label, placements: spec.glb.placements }];
  const forests: ForestPatch[] = [
    { islandId: 'foundations', tiles: f.forest, density: 5 },
    { islandId: 'structures', tiles: shift(s.forest, s.center), density: 4 },
    { islandId: 'algorithms', tiles: shift(a.forest, a.center), density: 4 },
    ...(spec.labs ? [{ islandId: 'labs', tiles: shift(spec.labs.forest, spec.labs.center), density: 4 }] : []),
    ...(d ? [{ islandId: 'databases', tiles: shift(d.forest, d.center), density: 4 }] : []),
  ];
  return { world, glb, forests, zones: zones(foundations, f.buildingTiles), natural: spec.natural ? natural(world, glb[0], forests) : undefined };
}
