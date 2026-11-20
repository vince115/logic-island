import { getIsland, labIslandConfig, orderedRegions, subjectIslands } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import type { IslandKind, IslandStatus, RegionId } from '@/content/world/types';
import { glbAssetOfIsland, glbAssets, type GlbAssetId } from '@/lib/islands/asset-registry';
import { fallbackArtOf, type FallbackArt } from '@/lib/islands/fallback-art';
import { PLANNED_GLB_ASSETS } from '@/lib/islands/glb-island-contract';
import type { HexGlbSettlement } from '@/lib/islands/hex-buildings';
import type { ForestPatch } from '@/lib/islands/hex-nature-data';
import type { PlazaLayout } from '@/lib/islands/hex-natural-scene';
import type { HexSettlement, HexWorld } from '@/lib/islands/hex-world';
import type { IslandInteractionSpec } from '@/lib/islands/interactions';
import { ISLAND_INTERACTIONS } from '@/lib/islands/island-interactions';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import type { IslandVisual } from '@/lib/islands/regions/schema';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { hubWorld } from '@/lib/islands/regions/world-overview-geometry';
import { islandInteractions, validateInteractionSpec } from './island-interactions';

/*
 * P9 S1 Island Registry: one entry per island of the world (29 subject islands and the tool island), the single place
 * the 3D world reads an island from. It stores nothing of its own. Every field is read from the source that owns it:
 *
 *   islandId, kind, regionId, publicationStatus   the world registry (src/content/world) and the curriculum behind it
 *   visualSpec                                    the island's settlement in its region's layout (region-layouts.ts)
 *   assetSpec                                     the GLB asset registry and its contract (asset-registry.ts)
 *   interactionSpec                               the island's interaction spec, validated (island-interactions.ts)
 *
 * so a name, a lesson count or a status is never written twice, and the three levels of the world share one island:
 * the World overview shrinks the same settlements the Region map draws, and the Island view is that map's camera on
 * one of them. tests/island-registry.test.ts holds this as a contract. Server-side: it reads the catalog.
 */

/** Where an island is drawn: on its region's map, or as the hub of the world overview. Every island has exactly one place. */
export type IslandPlace = { kind: 'region'; regionId: RegionId } | { kind: 'hub' };

export interface IslandVisualSpec extends IslandVisual {
  place: IslandPlace;
  /** The island as its map draws it: the very settlement object of the layout, never a copy. */
  settlement: HexSettlement;
  /** The world that settlement belongs to (its region's map, or the hub's own little world). */
  world: HexWorld;
  /** What the layout holds for the island beyond its land. */
  forest?: ForestPatch; buildings?: HexGlbSettlement; plaza?: PlazaLayout;
  /** Counts the Island Visual Standard is checked against (S0): tiles, distinct tile heights, roads that are not bridges. */
  terrain: { tiles: number; levels: number; spurs: number; authored: boolean };
}

export interface IslandAssetSpec {
  /** The island's runtime GLB, when it has one (asset-registry.ts). */
  glb?: { id: GlbAssetId; url: string; version: string; sha256: string; bytes: number; root: string; scale: number; targets: readonly string[] };
  /** A GLB declared to the contract ahead of its file (glb-island-contract.ts PLANNED_GLB_ASSETS): node names only. */
  declared?: { id: string; root: string; targets: readonly string[] };
  /** What is drawn without a GLB, while it loads, and when it fails its contract (fallback-art.ts). */
  fallback: FallbackArt;
}

export interface IslandRegistryEntry {
  islandId: string;
  kind: IslandKind;
  /** Subject islands only; the tool island belongs to no region. */
  regionId?: RegionId;
  /** The world registry's content status: complete, available or planned. Derived from the curriculum, never stored here. */
  publicationStatus: IslandStatus;
  lessons: { planned: number; published: number };
  visualSpec: IslandVisualSpec;
  assetSpec: IslandAssetSpec;
  /** Undefined while the island has no targets. A planned island's holds `info` targets only. */
  interactionSpec?: IslandInteractionSpec;
}

const levels = (settlement: HexSettlement) => new Set(settlement.tiles.map(t => t.height ?? 0)).size;

function assetSpec(islandId: string): IslandAssetSpec {
  const id = glbAssetOfIsland(islandId), declared = Object.entries(PLANNED_GLB_ASSETS).find(([, a]) => a.islandId === islandId);
  const targets = (nodes: readonly { node: string; kind: string }[]) => nodes.filter(n => n.kind === 'target').map(n => n.node);
  return {
    ...(id ? { glb: { id, url: glbAssets[id].url, version: glbAssets[id].version, sha256: glbAssets[id].sha256, bytes: glbAssets[id].bytes, root: glbAssets[id].root, scale: glbAssets[id].scale, targets: targets(glbAssets[id].nodes) } } : {}),
    ...(declared ? { declared: { id: declared[0], root: declared[1].root, targets: targets(declared[1].nodes) } } : {}),
    fallback: fallbackArtOf(islandId),
  };
}

function visualSpec(islandId: string, mapState: 'built' | 'planned', place: IslandPlace): IslandVisualSpec {
  const region = place.kind === 'region' ? REGION_LAYOUTS[place.regionId] : undefined;
  const world = region ? region.layout.world : hubWorld(WORLD_MAP);
  const settlement = world.settlements.find(s => s.islandId === islandId);
  if (!settlement) throw new Error(`${islandId} has no settlement on ${place.kind === 'region' ? `the ${place.regionId} map` : 'the hub'}`);
  const layout = region?.layout, buildings = layout?.glb.find(g => g.islandId === islandId);
  // 2026-11-20: the registry's map state, not the lessons: an island can open lessons while it keeps its planned landscape.
  const state = mapState === 'planned' ? 'planned' : 'open';
  const forest = layout?.forests.find(f => f.islandId === islandId), plaza = layout?.natural?.plazas.find(p => p.islandId === islandId);
  return {
    place, settlement, world, state, tier: buildings ? 'glb' : state === 'planned' ? 'outline' : 'landmark',
    ...(forest ? { forest } : {}), ...(buildings ? { buildings } : {}), ...(plaza ? { plaza } : {}),
    terrain: { tiles: settlement.tiles.length, levels: levels(settlement), spurs: settlement.spurs?.length ?? 0, authored: region ? region.source === 'authored' && !settlement.planned : true },
  };
}

function entry(islandId: string): IslandRegistryEntry {
  const record = getIsland(islandId)!, own = lessonsOfIsland(islandId);
  const place: IslandPlace = record.kind === 'tool' ? { kind: 'hub' } : { kind: 'region', regionId: record.regionId! };
  const interactionSpec = islandInteractions(islandId);
  return {
    islandId, kind: record.kind, ...(record.regionId ? { regionId: record.regionId } : {}), publicationStatus: record.status,
    lessons: { planned: record.lessonCount, published: own.filter(l => l.lessonStatus === 'complete').length },
    visualSpec: visualSpec(islandId, record.mapState, place), assetSpec: assetSpec(islandId),
    ...(interactionSpec ? { interactionSpec } : {}),
  };
}

/*
 * The Island Visual Standard (S0, 2026-11-19: eight items, every island whatever its publication status), as far as
 * the registry's data can tell today. `met` is null where the data cannot say yet: regional biome (2), decor (5), night
 * lighting (7, a property of the GLB's materials) and the provisional budget (8, measured on the built scene, never a
 * hard limit before real devices). The other items are counted from the island's own specs, so the report changes
 * only when the island does. A report for review and for S2's target, not a gate: nothing is blocked by it.
 */
export type StandardItem = 'terrain' | 'biome' | 'buildings' | 'roads-and-plaza' | 'decor' | 'interactions' | 'night-lighting' | 'budget';
export interface StandardCheck { item: StandardItem; met: boolean | null; note: string }
export function standardReport(e: IslandRegistryEntry): StandardCheck[] {
  const { settlement, terrain, plaza } = e.visualSpec, targets = e.assetSpec.glb?.targets ?? [], shown = e.interactionSpec?.targets ?? [];
  const beach = settlement.tiles.some(t => t.terrain === 'shore' || t.terrain === 'sand');
  const ownRoute = shown.some(t => t.action.type === 'route' && (e.kind === 'tool' ? t.action.to.kind === 'labs' : t.action.to.kind !== 'labs'));
  return [
    { item: 'terrain', met: terrain.authored && terrain.levels >= 3 && beach, note: `${terrain.tiles} tiles, ${terrain.levels} height levels${terrain.authored ? '' : ', shared planned terrain'}${beach ? '' : ', no beach'}` },
    { item: 'biome', met: null, note: 'no region biome data yet' },
    { item: 'buildings', met: targets.length >= 3 && targets.some(n => n.startsWith('Landmark_')), note: e.assetSpec.glb ? `${e.assetSpec.glb.id}: ${targets.join(', ')}` : `no GLB (${e.assetSpec.fallback}${e.assetSpec.declared ? `, ${e.assetSpec.declared.id} declared` : ''})` },
    { item: 'roads-and-plaza', met: Boolean(plaza) && terrain.spurs >= Math.max(1, targets.length), note: `${plaza ? 'plaza' : 'no plaza'}, ${terrain.spurs} roads to places` },
    { item: 'decor', met: null, note: 'no decor data yet' },
    // A planned island's targets give information only; an open island needs a way into its own content among them.
    { item: 'interactions', met: shown.length >= 3 && (e.publicationStatus === 'planned' ? shown.every(t => t.action.type === 'info') : ownRoute), note: `${shown.length} targets` },
    { item: 'night-lighting', met: null, note: 'read from the GLB\'s emissive materials, not from the registry' },
    { item: 'budget', met: null, note: 'provisional; measured on the built scene' },
  ];
}
/** Whether an island meets every item the registry can check. */
export const meetsCheckedStandard = (e: IslandRegistryEntry) => standardReport(e).every(c => c.met !== false);

let cache: IslandRegistryEntry[] | undefined;
/** Every island of the world: the subject islands region by region in subject order, then the tool island (the hub). */
export function islandRegistry(): IslandRegistryEntry[] {
  cache ??= [...orderedRegions.flatMap(region => subjectIslands.filter(i => i.regionId === region.id).sort((a, b) => a.order! - b.order!)), labIslandConfig].map(i => entry(i.id));
  return cache;
}
export const getIslandEntry = (islandId: string) => islandRegistry().find(e => e.islandId === islandId);
/** A region's islands, in subject order. */
export const regionEntries = (regionId: RegionId) => islandRegistry().filter(e => e.regionId === regionId);

/**
 * The registry's own rules, every one broken: each island is placed exactly once (a subject island on its own
 * region's map and nowhere else, the tool island at the hub and on no region map), every layout holds only islands of
 * its region, assets and interactions belong to the island that names them, and a planned island leads nowhere.
 */
export function validateIslandRegistry(entries: readonly IslandRegistryEntry[] = islandRegistry()): string[] {
  const problems: string[] = [];
  const ids = entries.map(e => e.islandId);
  if (new Set(ids).size !== ids.length) problems.push('an island is listed twice');
  // Where each island id is drawn, over every region map and the hub.
  const drawn = new Map<string, string[]>();
  const draw = (islandId: string, where: string) => drawn.set(islandId, [...(drawn.get(islandId) ?? []), where]);
  for (const [regionId, region] of Object.entries(REGION_LAYOUTS)) for (const s of region.layout.world.settlements) draw(s.islandId, regionId);
  for (const s of hubWorld(WORLD_MAP).settlements) draw(s.islandId, 'hub');
  for (const [islandId, places] of drawn) if (!ids.includes(islandId)) problems.push(`${islandId} is drawn on ${places.join(', ')} but is not in the registry`);
  for (const e of entries) {
    const places = drawn.get(e.islandId) ?? [], expected = e.kind === 'tool' ? 'hub' : e.regionId;
    if (places.length !== 1 || places[0] !== expected) problems.push(`${e.islandId} is drawn on ${places.join(', ') || 'no map'}; it belongs on ${expected} alone`);
    if (e.kind === 'subject' && (e.visualSpec.place.kind !== 'region' || e.visualSpec.place.regionId !== e.regionId)) problems.push(`${e.islandId}: placed outside its region`);
    if (e.kind === 'tool' && e.visualSpec.place.kind !== 'hub') problems.push(`${e.islandId}: a tool island is the hub`);
    // 2026-11-20: the visual state is the registry's map state, and the map draws exactly that; neither follows the lessons.
    if (e.visualSpec.state !== (getIsland(e.islandId)!.mapState === 'planned' ? 'planned' : 'open')) problems.push(`${e.islandId}: visual state does not follow its map state`);
    if (Boolean(e.visualSpec.settlement.planned) !== (e.visualSpec.state === 'planned')) problems.push(`${e.islandId}: the map draws it ${e.visualSpec.settlement.planned ? 'planned' : 'built'}, its map state says ${e.visualSpec.state}`);
    if (e.assetSpec.glb && glbAssets[e.assetSpec.glb.id].islandId !== e.islandId) problems.push(`${e.islandId}: its GLB belongs to another island`);
    if (e.visualSpec.buildings && e.visualSpec.buildings.asset !== e.assetSpec.glb?.id) problems.push(`${e.islandId}: the map places a GLB that is not the island's asset`);
    if (e.assetSpec.glb && e.assetSpec.declared) problems.push(`${e.islandId}: has a runtime GLB and is still declared as planned`);
    const spec = ISLAND_INTERACTIONS[e.islandId];
    if (spec) problems.push(...validateInteractionSpec(spec));
    if (e.publicationStatus === 'planned' && e.interactionSpec?.targets.some(t => t.action.type === 'route')) problems.push(`${e.islandId}: a planned island has a route`);
  }
  if (WORLD_MAP.hub.islandId !== entries.find(e => e.kind === 'tool')?.islandId) problems.push('the world map\'s hub is not the tool island');
  return problems;
}
