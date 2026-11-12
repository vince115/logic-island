import type { RegionId } from '@/content/world/types';
import type { HexEdge } from '../hex';
import type { WorldLayout } from '../hex-layout';

/*
 * P8.2 multi-region world: the shapes of the 3D layer's data (docs/planning/P8_MULTI_REGION_3D_WORLD_ARCHITECTURE.md §3).
 * Space and look only. Which regions and islands exist, their names, lesson counts and status all stay in the world
 * registry (src/content/world); nothing here repeats them, and tests compare every id used here with the registry.
 *
 *   World Layout Registry   world-map.ts       where the hub and each region sit on the world overview
 *   Region Layout Registry  region-layouts.ts  each region's own map: islands, bridges, docks, camera preset
 *   Island Placement        IslandPlacement    an island of a lattice map (a region with no authored terrain yet)
 *   Region Theme            region-themes.ts   a region's colors on the overview and its accent
 *   Island Visual Status    IslandVisual       how an island is drawn, derived from the registry status and the layout
 */

/** A region's colors: its accent (labels, list entries) and how its outline is drawn on the world overview. */
export interface RegionTheme { accent: string; land: string; plannedLand: string; bridge: string }

/**
 * A region map's camera: degrees added to the default azimuth per device (the turn that gives the smallest island the
 * most pixels on that stage), and how far a sideways caption reaches on desktop (tile sizes; see HexSceneOptions).
 */
export interface CameraPreset { azimuth: { desktop: number; phone: number }; labelReach?: number }

/** A dock where a ferry route of the world overview lands: `islandId` and the id of its dock spur. */
export interface RegionDock { islandId: string; spurId: string }

export interface RegionLayout {
  regionId: RegionId;
  layout: WorldLayout;
  camera: CameraPreset;
  docks: RegionDock[];
  /**
   * `authored`: hand-placed terrain (the CS and AI maps). `lattice`: built from IslandPlacement cells; a proposal until
   * its art is reviewed, drawn with the shared planned-island terrain and a procedural marker per island.
   */
  source: 'authored' | 'lattice';
  /** Each planned island's survey marker carries a pennant in the island's accent (a proposal; see P8.2 §8 R3). */
  plannedMarkers?: true;
}

/**
 * One island of a lattice map. `cell` is its place on a coarse hex lattice (lattice-layout.ts: neighbouring cells are
 * seven tiles apart, so two water hexes separate them). `trim` drops rim tiles for an uneven coast: index k is the rim
 * tile between hex directions k and k+1. `extend` adds a headland of three tiles beyond rim tile k, only on a side with
 * no neighbouring island. `dock` puts the region's ferry dock on rim tile k, facing the sea along k.
 */
export interface IslandPlacement { islandId: string; cell: readonly [number, number]; trim?: readonly HexEdge[]; extend?: readonly HexEdge[]; dock?: HexEdge }

/** A lattice map: the islands' cells and which neighbouring pairs a bridge joins. */
export interface LatticeMapSpec {
  placements: readonly IslandPlacement[];
  links: readonly (readonly [from: string, to: string])[];
  bridge: 'wood' | 'stone';
}

/** The overview has two compositions: `wide` (desktop, beside the guide) and `tall` (phones, portrait). */
export type OverviewShape = 'wide' | 'tall';
/** Which side of its outline (on screen) a region's label hangs on. */
export type LabelSide = 'above' | 'below' | 'left' | 'right';
/**
 * Where something sits on the world overview. `at` is on the sea plane in screen-aligned units: [right, away from the
 * viewer], with the hub near the origin. `width` is how wide the region's outline is drawn (its longest side).
 */
export interface OverviewPlacement { at: readonly [number, number]; width: number; label: LabelSide }

export interface WorldMapSpec {
  /** The shared island at the center (the Interactive Lab Island): an island id of the registry with `kind: 'tool'`. */
  hub: { islandId: string } & Record<OverviewShape, OverviewPlacement>;
  /** A region without an entry has no place on the overview and is listed in the guide only. */
  regions: Partial<Record<RegionId, Record<OverviewShape, OverviewPlacement>>>;
}

/**
 * How an island is drawn, never stored: `state` follows the registry (planned islands are pale, in mist, and open no
 * lesson); `tier` follows the layout (T2 `glb` model, T1 `landmark` geometry, T0 `outline` shared terrain and marker).
 */
export interface IslandVisual { state: 'open' | 'planned'; tier: 'glb' | 'landmark' | 'outline' }
