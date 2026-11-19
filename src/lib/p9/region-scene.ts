import { REGION_IDS, type RegionId } from '@/content/world/types';
import { glbAssets } from '@/lib/islands/asset-registry';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { islandLandmarks } from '@/lib/islands/island-landmarks';
import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { placementPose } from '@/lib/islands/hex-buildings';
import type { WorldLayout } from '@/lib/islands/hex-layout';
import { forestInstances, type TreeInstance } from '@/lib/islands/hex-nature-data';
import { LAND_TOP, tileHeight, worldCenter, type HexSettlement, type HexWorld } from '@/lib/islands/hex-world';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import type { RegionLayout } from '@/lib/islands/regions/region-layouts';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import type { Vec3 } from '@/lib/islands/types';
import { P9_CS_REGION, PLANNED_LANDSCAPES, type PlannedLandscape } from './cs-region';
import { builtRegion } from './built-region';

/*
 * P9.1b: the Region Scene Definition. One definition per region (and one for the hub) says everything a scene of that
 * region is drawn from: the islands' tiles and heights, the bridges and roads, the GLB placements, the woods and the
 * landscapes. The Region page draws it at full detail; the World overview draws THE SAME definition smaller and at a
 * lower level of detail (src/components/p9/p9-region-miniature.tsx). Nothing of a region's geography is stored or
 * generated anywhere else: the world overview has no terrain, coordinates or building list of its own.
 *
 * Levels of detail change how a thing is drawn, never where it is or what shape the land has:
 *   world   the same terrain triangles merged into one mesh a region, the same roads and bridges, the same procedural
 *           landmarks and landscapes, a stand-in for each GLB building at the building's own placement, low-poly trees
 *           at the trees' own places; no GLB is loaded
 *   region  everything, with the GLB buildings and trees (HexWorldScene)
 *   island  the region scene with the camera on one island (the explore view)
 */
export type SceneId = RegionId | 'hub';
/** Where a definition's land comes from: the prototype's own layout (`p9`), or the approved P8 layout as it is. */
export type SceneSource = 'p9' | 'approved';

export interface SceneIsland {
  islandId: string;
  /** The region whose scene the island stands in; the hub's island has none. */
  regionId: RegionId | null;
  /** The island's centre tile on the region's own map (x, z), and how many tiles it has. */
  center: [number, number]; tiles: number;
  /** The highest tile top (map units above the base land height). */
  top: number;
}
/** Something that stands on an island and marks it: a GLB building, an authored landmark, a landscape. */
export interface SceneLandmark {
  islandId: string;
  /** The GLB node, the landmark's future node name, or the landscape's island id. */
  id: string;
  kind: 'glb' | 'authored' | 'landscape';
  tile: Axial;
  /** Where it stands on the region's map: the tile's ground (x, y, z). */
  position: Vec3;
}

export interface RegionSceneDefinition {
  id: SceneId; source: SceneSource;
  /** The region's map: tiles, bridges, GLB placements, forests and the natural layout. The Region page's own layout. */
  region: RegionLayout;
  islands: SceneIsland[];
  landmarks: SceneLandmark[];
  /** The landscapes of planned islands (the prototype's CS map has four; the other regions none yet). */
  landscapes: readonly PlannedLandscape[];
  /** Every tree of the scene, as the Region places it (the natural layout's clusters, or the forest patches). */
  trees: TreeInstance[];
}

const ground = (world: HexWorld, settlement: HexSettlement, tile: Axial): Vec3 => {
  const [x, z] = hexToWorld(tile, world.size), found = settlement.tiles.find(t => t.q === tile.q && t.r === tile.r);
  return [x, LAND_TOP + (found ? tileHeight(found) : 0), z];
};

function define(id: SceneId, source: SceneSource, region: RegionLayout, landscapes: readonly PlannedLandscape[]): RegionSceneDefinition {
  const { world, glb, forests, natural } = region.layout;
  // Space only, like the layouts: which islands a region holds, and which of them are planned, is the world registry's
  // to say (src/content/world), and a unit test compares every scene's islands with it. Nothing here imports the
  // registry, so a page that draws a scene does not ship the registry's data with it.
  const islands: SceneIsland[] = world.settlements.map(s => ({ islandId: s.islandId, regionId: id === 'hub' ? null : id, center: hexToWorld(s.center, world.size), tiles: s.tiles.length, top: Math.max(...s.tiles.map(tileHeight)) }));
  const landmarks: SceneLandmark[] = [];
  for (const layout of glb) {
    const targets = new Set<string>(glbAssets[layout.asset].nodes.filter(n => n.kind === 'target').map(n => n.node));
    for (const placement of layout.placements) if (targets.has(placement.node)) {
      landmarks.push({ islandId: layout.islandId, id: placement.node, kind: 'glb', tile: placement.tile, position: placementPose(world, layout.islandId, placement).position });
    }
  }
  const databases = world.settlements.find(s => s.islandId === 'databases');
  // P9.3: an island that draws its own landmarks (ownLandmarks) no longer shows the database's transitional art.
  if (databases && !databases.ownLandmarks) for (const landmark of DATABASE_LANDMARKS) {
    const tile = { q: databases.center.q + landmark.at.q, r: databases.center.r + landmark.at.r };
    landmarks.push({ islandId: 'databases', id: landmark.node, kind: 'authored', tile, position: ground(world, databases, tile) });
  }
  for (const landscape of landscapes) {
    const settlement = world.settlements.find(s => s.islandId === landscape.islandId);
    if (!settlement) throw new Error(`region scene ${id}: landscape of ${landscape.islandId}, which is not on the map`);
    // P9.4: one entry per landmark of the island's landmark registry (src/lib/islands/island-landmarks.ts), on its site.
    const named = islandLandmarks(landscape.islandId).filter(l => landscape.tiles[l.site]);
    if (!named.length) landmarks.push({ islandId: landscape.islandId, id: landscape.islandId, kind: 'landscape', tile: landscape.tiles[0], position: ground(world, settlement, landscape.tiles[0]) });
    for (const l of named) landmarks.push({ islandId: landscape.islandId, id: l.landmarkId, kind: 'landscape', tile: landscape.tiles[l.site], position: ground(world, settlement, landscape.tiles[l.site]) });
  }
  return { id, source, region, islands, landmarks, landscapes, trees: natural?.trees ?? forestInstances(world, forests) };
}

/** The hub: 互動實驗島 alone, as the home map draws it, with the home map's own woods on it. */
function hubRegion(): RegionLayout {
  const home = islandsHomeWorld, island = home.world.settlements.find(s => s.islandId === WORLD_MAP.hub.islandId);
  if (!island) throw new Error(`region scene hub: ${WORLD_MAP.hub.islandId} is not on the home map`);
  const own = <T extends { islandId: string }>(list: T[]) => list.filter(item => item.islandId === island.islandId);
  const layout: WorldLayout = {
    world: { size: home.world.size, settlements: [island], bridges: [] }, glb: [], forests: own(home.forests), zones: home.zones,
    ...(home.natural ? { natural: { ...home.natural, trees: own(home.natural.trees), rocks: own(home.natural.rocks) } } : {}),
  };
  // A hub has no region id; the layout's own field is never read for it.
  return { regionId: 'cs', layout, camera: { azimuth: { desktop: 0, phone: 0 } }, docks: [], source: 'authored' };
}

const cache = new Map<SceneId, RegionSceneDefinition>();
/**
 * A region's scene definition. CS is the prototype's own map (P9_CS_REGION: the approved map with real land for its
 * planned islands); the other four regions are their approved maps as they are, until the prototype builds theirs.
 */
export function regionScene(id: SceneId): RegionSceneDefinition {
  let scene = cache.get(id);
  if (!scene) {
    scene = id === 'hub' ? define('hub', 'approved', hubRegion(), [])
      : id === 'cs' ? define('cs', 'p9', P9_CS_REGION, PLANNED_LANDSCAPES)
        : (() => { const built = builtRegion(id); return define(id, 'p9', built.region, built.landscapes); })();
    cache.set(id, scene);
  }
  return scene;
}
/** Every scene the world overview is composed of: the five regions, then the hub. */
export const SCENE_IDS: readonly SceneId[] = [...REGION_IDS, 'hub'];
/** The regions' layouts by id, for the overview's placement and links (world-overview-geometry.ts). */
export const sceneLayouts = (): Record<RegionId, RegionLayout> => Object.fromEntries(REGION_IDS.map(id => [id, regionScene(id).region])) as Record<RegionId, RegionLayout>;

/**
 * How a definition is put on the world overview: every map point (x, y, z) goes to `at + (point - centre) * scale`,
 * and the map's sea level lands on the overview's (y = 0). One uniform scale: heights shrink with the land.
 */
export interface ScenePlacement { scale: number; position: Vec3 }
export function scenePlacement(world: HexWorld, anchor: readonly [number, number], scale: number, seaLevel: number): ScenePlacement {
  const [cx, cz] = worldCenter(world);
  return { scale, position: [anchor[0] - cx * scale, -seaLevel * scale, anchor[1] - cz * scale] };
}
