import { addAxial, hexDistance, hexSpiral, type Axial } from './hex';
import { glbAssets } from './asset-registry';
import { placementPose, type HexGlbPlacement, type HexGlbSettlement } from './hex-buildings';
import {
  MAIN_ROAD_WIDTH, clusteredForest, naturalRocks, naturalTerrains, plazaLayout, type KeepOut, type NaturalRock, type PlazaLayout,
} from './hex-natural-scene';
import type { ForestPatch, TreeInstance } from './hex-nature-data';
import type { HexBridge, HexSettlement, HexSpur, HexTerrain, HexTile, HexWorld } from './hex-world';
import type { GlbAsset, GlbAssetId } from './types';

/**
 * Builders shared by the world layouts (D.3-1): the production world (`islands-world.ts`, 37 tiles) and the
 * 19-tile scale prototype describe their own tiles, roads, bridges and buildings as a `LayoutSpec`;
 * `assembleLayout` turns either into the same `WorldLayout`.
 *
 * P9 S1: a `LayoutSpec` is a list of `IslandSpec`s and the bridges between them. Nothing here names an island: an
 * island's terrain, woods, roads, buildings and plaza are its own spec, so any of the 29 islands (and any number of
 * them with buildings and a plaza) goes through the same builder.
 */
export interface WorldLayout {
  world: HexWorld;
  glb: HexGlbSettlement[];
  forests: ForestPatch[];
  /** Zone summary for the comparison report: which tiles serve which purpose. */
  zones: Record<'plaza' | 'buildings' | 'forest' | 'hills' | 'shore' | 'open', number>;
  /**
   * D.2c-1 natural style, placed once here: clustered trees, rocks, and for every island that has a plaza (P9 S1) its
   * plaza layout and its wider main route (on the foundations island, from the dock through the plaza to the lighthouse).
   */
  natural?: { trees: TreeInstance[]; rocks: NaturalRock[]; keepOut: KeepOut[]; plazas: PlazaLayout[]; roadWidths: Record<string, number> };
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

/* -------------------------------------------- terrain presets (the islands without authored terrain) */

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

/** Tile counts per zone of one island, for the comparison report. */
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
 * One island's plaza (D.2c-1; P9 S1: any island may have one). `mainRoutes`: the ids of its roads that are drawn wide
 * and lit, its spine. `forecourts`: spurs that end at a door and get paving there. `terraces`: round paving under a
 * placed GLB node, `radius` in that asset's own units (the builder scales it and finds the node on the map).
 */
export interface IslandPlazaSpec { mainRoutes: readonly string[]; forecourts?: readonly string[]; terraces?: readonly { node: string; radius: number }[] }

/**
 * One island of a world layout, in map coordinates: where it is, its land, and what stands on it. Everything optional
 * is left out by an island that does not have it yet, and the builder draws what is there.
 */
export interface IslandSpec {
  islandId: string;
  center: Axial;
  tiles: HexTile[];
  cliffBeaches?: Axial[];
  /** Roads from the plaza that are not bridges: to a dock, a landmark, a door. */
  spurs?: HexSpur[];
  /** Its woods: forest tiles and trees per tile. */
  forest?: { tiles: Axial[]; density: number };
  /** M3.1: an island of the plan with no written lessons, drawn in mist (see HexSettlement.planned). */
  planned?: true;
  /** GLB buildings from the island's asset (asset-registry.ts), each node on its tile. */
  glb?: { asset: GlbAssetId; placements: HexGlbPlacement[]; label?: HexGlbSettlement['label'] };
  plaza?: IslandPlazaSpec;
  /** The tiles its buildings stand on, for the zone report. */
  buildingTiles?: Axial[];
}

/** One world as data: its islands in drawing order and the bridges between them. */
export interface LayoutSpec {
  islands: IslandSpec[];
  bridges: HexBridge[];
  /** Place the D.2c-1 natural layout (clustered trees, rocks, each island's plaza and main route). */
  natural: boolean;
}

/** The terrain of an island given only as a shape around its centre: which preset turns the shape into tiles. */
export type TerrainPreset = 'harbor' | 'ridge' | 'lawn' | 'terraced';
export interface ShapedIsland { center: Axial; shape: Axial[]; forest: Axial[]; /** `terraced` only: the raised tiles. */ terrace?: Axial[] }
/** An island from a shape, a forest and a terrain preset (tiles relative to the centre), with four trees a forest tile. */
export function shapedIsland(islandId: string, preset: TerrainPreset, { center, shape, forest, terrace = [] }: ShapedIsland, density = 4): IslandSpec {
  const land = preset === 'harbor' ? harbor(center, shape, forest) : preset === 'ridge' ? ridge(center, shape, forest)
    : preset === 'lawn' ? lab(center, shape, forest) : vault(center, shape, forest, terrace);
  return { islandId, center, tiles: land, forest: { tiles: shift(forest, center), density } };
}

export interface PlannedSettlement { islandId: string; center: Axial; shape: Axial[]; spurs?: HexSpur[] }
/** A planned island (M3.1): the shared low-detail terrain, no woods, plaza or buildings. */
export const plannedIsland = ({ islandId, center, shape, spurs }: PlannedSettlement): IslandSpec =>
  ({ islandId, center, tiles: planned(center, shape), planned: true, ...(spurs ? { spurs } : {}) });

/** The settlement the map draws for an island (key order kept from before P9 S1: the world-data fingerprints hash it). */
const settlementOf = (island: IslandSpec): HexSettlement => ({
  islandId: island.islandId, center: island.center, surface: 'continuous', ...(island.planned ? { planned: true as const } : {}), tiles: island.tiles,
  ...(island.cliffBeaches ? { cliffBeaches: island.cliffBeaches } : {}), ...(island.spurs ? { spurs: island.spurs } : {}),
});
export const plannedSettlement = (settlement: PlannedSettlement): HexSettlement => settlementOf(plannedIsland(settlement));

function natural(world: HexWorld, islands: IslandSpec[], glb: HexGlbSettlement[], forests: ForestPatch[]): NonNullable<WorldLayout['natural']> {
  const keepOut: KeepOut[] = glb.flatMap(layout => layout.placements.flatMap(p => {
    const pose = placementPose(world, layout.islandId, p);
    // Each asset's own footprints (asset-registry.ts) keep trees, rocks and plaza features clear of its buildings.
    const footprints: GlbAsset['footprints'] = glbAssets[layout.asset].footprints;
    return (footprints?.[p.node] ?? []).map(([x, z, r]): KeepOut => [pose.position[0] + x, pose.position[2] + z, r]);
  }));
  const plazas = islands.flatMap(island => {
    if (!island.plaza) return [];
    const layout = glb.find(g => g.islandId === island.islandId);
    const terraces = (island.plaza.terraces ?? []).map(({ node, radius }): [number, number, number] => {
      const placement = layout?.placements.find(p => p.node === node);
      if (!layout || !placement) throw new Error(`${island.islandId}: plaza terrace names ${node}, which is not placed on the island`);
      const at = placementPose(world, island.islandId, placement).position;
      return [at[0], at[2], radius * glbAssets[layout.asset].scale];
    });
    return [plazaLayout(world, island.islandId, keepOut, { mainRoutes: island.plaza.mainRoutes, forecourts: island.plaza.forecourts, terraces })];
  });
  return { keepOut, trees: clusteredForest(world, forests, keepOut), rocks: naturalRocks(world, naturalTerrains(world), keepOut), plazas,
    roadWidths: Object.fromEntries(islands.flatMap(island => island.plaza?.mainRoutes ?? []).map(id => [id, MAIN_ROAD_WIDTH])) };
}

const NO_ZONES: WorldLayout['zones'] = { plaza: 0, buildings: 0, forest: 0, hills: 0, shore: 0, open: 0 };

export function assembleLayout(spec: LayoutSpec): WorldLayout {
  const ids = spec.islands.map(island => island.islandId);
  if (new Set(ids).size !== ids.length) throw new Error(`world layout: an island is listed twice (${ids.join(', ')})`);
  const settlements = spec.islands.map(settlementOf);
  const world: HexWorld = { size: 1.25, settlements, bridges: spec.bridges };
  const glb: HexGlbSettlement[] = spec.islands.flatMap(island => island.glb
    ? [{ islandId: island.islandId, asset: island.glb.asset, label: island.glb.label, placements: island.glb.placements }] : []);
  const forests: ForestPatch[] = spec.islands.flatMap(island => island.forest ? [{ islandId: island.islandId, tiles: island.forest.tiles, density: island.forest.density }] : []);
  // The zone report is of the first island that declares its building tiles (the foundations island in every layout so far).
  const reported = spec.islands.findIndex(island => island.buildingTiles);
  return { world, glb, forests, zones: reported < 0 ? NO_ZONES : zones(settlements[reported], spec.islands[reported].buildingTiles!),
    natural: spec.natural ? natural(world, spec.islands, glb, forests) : undefined };
}
