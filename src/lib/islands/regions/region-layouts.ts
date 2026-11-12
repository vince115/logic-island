import { REGION_IDS, type RegionId } from '@/content/world/types';
import { A, assembleLayout, plannedSettlement, shape, type WorldLayout } from '../hex-layout';
import { DATABASES_SPEC, ISLANDS_LAYOUT } from '../islands-world';
import type { HexBridge } from '../hex-world';
import { latticeLayout } from './lattice-layout';
import type { LatticeMapSpec, RegionLayout } from './schema';

/*
 * M3.1 regional world prototype (docs/planning/M3_1_REGIONAL_WORLD_ARCHITECTURE.md): where the islands of each region
 * stand on its hex map. Space only: which islands a region holds, their names, status and lessons all come from the
 * world registry (src/content/world), which tests compare with these layouts.
 *
 * The CS map keeps the foundations, structures, algorithms and database islands exactly as the home page places them
 * (same specs, same bridges), without 互動實驗島, which moves to the hub of the world overview. Planned islands are
 * 19-tile hexes (option A of the camera study) at the closest spots that keep two water hexes to every island and
 * leave room for a straight bridge whose ports and roads avoid landmarks, hills, woods and docks (option B); see the
 * M3.1 log for the measurements behind each coordinate.
 *
 * P8.2 (multi-region world): this file is the Region Layout Registry. A region is on the 3D world when it has an entry
 * in REGION_LAYOUTS, and nothing else lists the regions: the pages, the overview and the tests all read
 * MAPPED_REGION_IDS. CS and AI are authored (their approved M3.1 coordinates, unchanged); design, web and sys are
 * lattice maps (lattice-layout.ts), one IslandPlacement per registry island, proposed for art review.
 */

/** A planned island before it has lessons: a radius-2 hex, 19 tiles. */
export const PLANNED_SHAPE = shape(2, [], []);
const planned = (islandId: string, center: ReturnType<typeof A>, spurs?: Parameters<typeof plannedSettlement>[0]['spurs']) =>
  ({ islandId, center, shape: PLANNED_SHAPE, ...(spurs ? { spurs } : {}) });

const CS_BRIDGES: HexBridge[] = [
  // 程式語言島 takes the sea south of the foundations island that 互動實驗島 holds on the home map, and the same ports.
  { id: 'algorithms-programming-languages', kind: 'stone', from: { islandId: 'algorithms', tile: A(8, 1), edge: 4 }, to: { islandId: 'programming-languages', tile: A(5, 4), edge: 1 } },
  { id: 'structures-networks', kind: 'wood', from: { islandId: 'structures', tile: A(10, -8), edge: 0 }, to: { islandId: 'networks', tile: A(14, -8), edge: 3 } },
  // The database island's port is its north-east shore (4, -10), clear of the main tower's terrace (M3.1 fix).
  { id: 'databases-systems-analysis', kind: 'wood', from: { islandId: 'databases', tile: A(4, -10), edge: 1 }, to: { islandId: 'systems-analysis', tile: A(8, -14), edge: 4 } },
  { id: 'systems-analysis-information-systems', kind: 'stone', from: { islandId: 'systems-analysis', tile: A(7, -17), edge: 2 }, to: { islandId: 'information-systems', tile: A(7, -20), edge: 5 } },
];

const cs: WorldLayout = assembleLayout({
  ...ISLANDS_LAYOUT,
  databases: DATABASES_SPEC,
  planned: [planned('programming-languages', A(5, 6)), planned('networks', A(16, -10)), planned('systems-analysis', A(8, -16)), planned('information-systems', A(7, -22))],
  bridges: [...ISLANDS_LAYOUT.bridges,
    { id: 'structures-databases', kind: 'wood', from: { islandId: 'structures', tile: A(6, -8), edge: 3 }, to: { islandId: 'databases', tile: A(3, -8), edge: 0 } },
    ...CS_BRIDGES],
});

/*
 * The AI region is all planned: a loop from AI 基礎島 north through machine learning to deep learning, west to the
 * language-model island (with generative AI beyond it to the north), then south through agents to AI engineering,
 * which ends beside AI 基礎島 again, so both docks are on the region's south shore.
 */
const AI_BRIDGES: HexBridge[] = [
  { id: 'ai-foundations-machine-learning', kind: 'stone', from: { islandId: 'ai-foundations', tile: A(-1, -1), edge: 2 }, to: { islandId: 'machine-learning', tile: A(-1, -4), edge: 5 } },
  { id: 'machine-learning-deep-learning', kind: 'stone', from: { islandId: 'machine-learning', tile: A(-1, -8), edge: 2 }, to: { islandId: 'deep-learning', tile: A(-1, -11), edge: 5 } },
  { id: 'deep-learning-large-language-models', kind: 'stone', from: { islandId: 'deep-learning', tile: A(-2, -13), edge: 4 }, to: { islandId: 'large-language-models', tile: A(-5, -10), edge: 1 } },
  { id: 'large-language-models-generative-ai', kind: 'stone', from: { islandId: 'large-language-models', tile: A(-7, -12), edge: 1 }, to: { islandId: 'generative-ai', tile: A(-3, -16), edge: 4 } },
  { id: 'large-language-models-ai-agents', kind: 'stone', from: { islandId: 'large-language-models', tile: A(-8, -8), edge: 5 }, to: { islandId: 'ai-agents', tile: A(-8, -5), edge: 2 } },
  { id: 'ai-agents-ai-engineering', kind: 'stone', from: { islandId: 'ai-agents', tile: A(-8, -1), edge: 5 }, to: { islandId: 'ai-engineering', tile: A(-8, 2), edge: 2 } },
];
const aiSettlements = [
  planned('ai-foundations', A(0, 0), [{ id: 'ai-foundations-dock', tile: A(1, 1), edge: 5 }]),
  planned('machine-learning', A(-1, -6)), planned('deep-learning', A(0, -13)), planned('large-language-models', A(-7, -10)),
  planned('generative-ai', A(-2, -18)), planned('ai-agents', A(-8, -3)),
  planned('ai-engineering', A(-7, 3), [{ id: 'ai-engineering-dock', tile: A(-7, 5), edge: 5 }]),
].map(plannedSettlement);
const ai: WorldLayout = {
  world: { size: 1.25, settlements: aiSettlements, bridges: AI_BRIDGES },
  glb: [], forests: [], zones: { plaza: 0, buildings: 0, forest: 0, hills: 0, shore: 0, open: 0 },
};

/*
 * 數位設計群島: four islands around a lagoon, a rhombus. The dock is on UI 設計島's outer shore.
 */
const DESIGN: LatticeMapSpec = {
  bridge: 'wood',
  placements: [
    { islandId: 'ui-design', cell: [0, 0], trim: [1], dock: 3 },
    { islandId: 'ux-research', cell: [1, 0], trim: [0, 2] },
    { islandId: 'interaction-design', cell: [0, 1], trim: [4] },
    { islandId: 'design-systems', cell: [1, 1], trim: [5, 3] },
  ],
  links: [['ui-design', 'ux-research'], ['ui-design', 'interaction-design'], ['ux-research', 'design-systems'], ['interaction-design', 'design-systems']],
};
/*
 * 網頁與應用開發群島: a stepped chain running east, from the web foundations to mobile apps, like a delivery pipeline.
 */
const WEB: LatticeMapSpec = {
  bridge: 'wood',
  placements: [
    { islandId: 'web-foundations', cell: [0, 0], trim: [2], dock: 4 },
    { islandId: 'frontend', cell: [1, 0], trim: [5] },
    { islandId: 'responsive-design', cell: [2, -1], trim: [1, 4] },
    { islandId: 'mobile-apps', cell: [3, -1], trim: [0] },
  ],
  links: [['web-foundations', 'frontend'], ['frontend', 'responsive-design'], ['responsive-design', 'mobile-apps']],
};
/*
 * 系統與雲端工程群島: a stack of three rows, the operating system, containers and servers at the base, cloud and
 * delivery above them, Kubernetes at the top.
 */
const SYS: LatticeMapSpec = {
  bridge: 'stone',
  placements: [
    { islandId: 'linux-systems', cell: [-2, 2], trim: [3], dock: 4 },
    { islandId: 'docker-containers', cell: [-1, 2], trim: [5] },
    { islandId: 'network-servers', cell: [0, 2], trim: [0, 4] },
    { islandId: 'cloud-infrastructure', cell: [-1, 1], trim: [2] },
    { islandId: 'devops-cicd', cell: [0, 1], trim: [0] },
    { islandId: 'kubernetes-reliability', cell: [0, 0], trim: [1, 3] },
  ],
  links: [['linux-systems', 'docker-containers'], ['docker-containers', 'network-servers'], ['docker-containers', 'cloud-infrastructure'],
    ['network-servers', 'devops-cicd'], ['cloud-infrastructure', 'kubernetes-reliability'], ['devops-cicd', 'kubernetes-reliability']],
};
// Lattice maps keep the default view; their captions get the room the longest island names need beside the list.
const lattice = (regionId: RegionId, spec: LatticeMapSpec, labelReach = 8.5): RegionLayout =>
  ({ regionId, ...latticeLayout(spec), camera: { azimuth: { desktop: 0, phone: 0 }, labelReach }, source: 'lattice' });

/**
 * The regions that have a 3D map, keyed by registry region id. A region without an entry has no /world page and no
 * place on the overview; it is described in lists only, marked 規劃中 (multi-archipelago v2). Adding a region to the
 * 3D world is one entry here and one in world-map.ts.
 */
export const REGION_LAYOUTS: Partial<Record<RegionId, RegionLayout>> = {
  cs: { regionId: 'cs', layout: cs, camera: { azimuth: { desktop: 295, phone: 105 }, labelReach: 8.5 }, docks: [{ islandId: 'foundations', spurId: 'foundations-dock' }], source: 'authored' },
  ai: { regionId: 'ai', layout: ai, camera: { azimuth: { desktop: 0, phone: 0 }, labelReach: 8.5 }, docks: [{ islandId: 'ai-foundations', spurId: 'ai-foundations-dock' }, { islandId: 'ai-engineering', spurId: 'ai-engineering-dock' }], source: 'authored' },
  design: lattice('design', DESIGN),
  web: lattice('web', WEB),
  sys: lattice('sys', SYS, 12),
};
/** The mapped regions, in the registry's id order; derived, never listed by hand. */
export const MAPPED_REGION_IDS: readonly RegionId[] = REGION_IDS.filter(id => REGION_LAYOUTS[id]);
/** Kept as a name for "a region with a map"; which ones is data (REGION_LAYOUTS), so the type is the registry's. */
export type MappedRegionId = RegionId;
export const isMappedRegion = (id: string): id is MappedRegionId => MAPPED_REGION_IDS.includes(id as RegionId);
/** A mapped region's layout; throws for a region without one (callers check isMappedRegion or use MAPPED_REGION_IDS). */
export function regionLayout(id: RegionId): RegionLayout {
  const layout = REGION_LAYOUTS[id];
  if (!layout) throw new Error(`Region ${id} has no 3D layout`);
  return layout;
}
export type { RegionLayout } from './schema';
