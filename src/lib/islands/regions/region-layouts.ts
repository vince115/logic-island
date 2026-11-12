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
 * MAPPED_REGION_IDS. CS is authored (its approved M3.1 coordinates, unchanged); design, web and sys are lattice maps
 * (lattice-layout.ts), one IslandPlacement per registry island, proposed for art review. AI (2026-11-12, requested):
 * a six-petal pinwheel, also a lattice map and a proposal; its M3.1 loop stays below as AI_BASELINE_LAYOUT.
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
const aiBaseline: WorldLayout = {
  world: { size: 1.25, settlements: aiSettlements, bridges: AI_BRIDGES },
  glb: [], forests: [], zones: { plaza: 0, buildings: 0, forest: 0, hills: 0, shore: 0, open: 0 },
};
/**
 * The AI region as approved in M3.1 (the loop above). Kept whole, with its camera and docks, so going back is one line
 * in REGION_LAYOUTS; unit tests still validate it.
 */
export const AI_BASELINE_LAYOUT: RegionLayout = { regionId: 'ai', layout: aiBaseline, camera: { azimuth: { desktop: 0, phone: 0 }, labelReach: 8.5 },
  docks: [{ islandId: 'ai-foundations', spurId: 'ai-foundations-dock' }, { islandId: 'ai-engineering', spurId: 'ai-engineering-dock' }], source: 'authored' };

/*
 * P8.2 (2026-11-12): the four lattice maps were first drawn from how their islands are related (a lesson of one island
 * names a lesson of the other as a prerequisite or as recommended; src/lib/world/island-relations.ts): the island with
 * the most relations in the middle, the islands related to it around it, a bridge between related pairs. The AI map
 * is the exception by request: a turning ring of six, not a hub with spokes.
 *
 * P8.3: these are stored layouts now. Each island's cell and each bridge is written out below and pinned in a unit
 * test; nothing here reads the curriculum, so a new lesson or prerequisite moves no island and no bridge. A new island
 * is one more placement (and its links) beside the ones that are there, which stay where they are; whether a layout
 * still matches the curriculum's relations is a report for its next review (`bridgeCoverage`), not a rule.
 */

/*
 * AI 人工智慧群島 as a six-petal pinwheel (requested 2026-11-12: an outline that recalls the six-fold knot of a
 * well-known AI mark, as an arrangement of islands, not a copy of any logo; and a turning shape, not spokes from a
 * hub). Six petals stand around a lagoon and each leans the same way round: a headland on one outer side, a bay on
 * the other and a second bay on the inner side, so the ring reads as turning. A bridge joins each petal to the next,
 * and every such pair is related in the curriculum. 大型語言模型島 is the small hexagon in the middle of the lagoon,
 * joined by one bridge to the island it is most related to (AI 代理島) rather than by six spokes.
 * Petal j sits on lattice direction j: its ring bridges take edges j+2 and j+4, so its outer rim tiles j-1 and j are
 * free for the bay, the headland and, on the petal that faces the hub (AI 基礎島), the ferry dock.
 */
const AI_PETALS = ['deep-learning', 'machine-learning', 'ai-engineering', 'ai-agents', 'ai-foundations', 'generative-ai'] as const;
const AI_DOCK_PETAL = 4;
const turn = (k: number) => (((k % 6) + 6) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
const AI_CELLS: (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const AI_PINWHEEL: LatticeMapSpec = {
  bridge: 'stone',
  placements: [
    { islandId: 'large-language-models', cell: [0, 0] },
    ...AI_PETALS.map((islandId, j) => ({ islandId, cell: AI_CELLS[j], extend: [turn(j)], ...(j === AI_DOCK_PETAL ? { dock: turn(j - 1), trim: [turn(j + 2)] } : { trim: [turn(j - 1), turn(j + 2)] }) })),
  ],
  links: [...AI_PETALS.map((id, j) => [id, AI_PETALS[(j + 1) % 6]] as const), ['large-language-models', 'ai-agents']],
};

/*
 * 數位設計群島: UI 設計島 and 互動設計島 side by side in the middle (each related to the other three), UX 研究島 and
 * 設計系統島 at the two ends. All five relations of the region are bridges.
 */
const DESIGN: LatticeMapSpec = {
  bridge: 'wood',
  placements: [
    { islandId: 'ux-research', cell: [0, 0], trim: [1], dock: 3 },
    { islandId: 'ui-design', cell: [1, 0], extend: [1] },
    { islandId: 'interaction-design', cell: [0, 1], trim: [4] },
    { islandId: 'design-systems', cell: [1, 1], extend: [0], trim: [5] },
  ],
  links: [['ux-research', 'ui-design'], ['ux-research', 'interaction-design'], ['ui-design', 'interaction-design'], ['ui-design', 'design-systems'], ['interaction-design', 'design-systems']],
};
/*
 * 網頁與應用開發群島: 網頁基礎島 and 行動應用島 in the middle, 前端 and 響應式設計 at the ends, lying east to west. All
 * five relations of the region are bridges.
 */
const WEB: LatticeMapSpec = {
  bridge: 'wood',
  placements: [
    { islandId: 'frontend', cell: [0, 0], trim: [3], extend: [4] },
    { islandId: 'web-foundations', cell: [1, 0], dock: 4 },
    { islandId: 'mobile-apps', cell: [1, -1], trim: [2] },
    { islandId: 'responsive-design', cell: [2, -1], extend: [0], trim: [5] },
  ],
  links: [['frontend', 'web-foundations'], ['frontend', 'mobile-apps'], ['web-foundations', 'mobile-apps'], ['web-foundations', 'responsive-design'], ['mobile-apps', 'responsive-design']],
};
/*
 * 系統與雲端工程群島: Linux 系統島 in the middle with the four islands that build on it around it, and Kubernetes
 * beyond the two it depends on most (DevOps and servers). Eight of the region's ten relations are bridges.
 */
const SYS: LatticeMapSpec = {
  bridge: 'stone',
  placements: [
    { islandId: 'linux-systems', cell: [0, 0], dock: 3 },
    { islandId: 'network-servers', cell: [1, 0], extend: [5] },
    { islandId: 'devops-cicd', cell: [1, -1], extend: [1] },
    { islandId: 'docker-containers', cell: [0, -1], extend: [2], trim: [3] },
    { islandId: 'cloud-infrastructure', cell: [0, 1], extend: [4], trim: [3] },
    { islandId: 'kubernetes-reliability', cell: [2, -1], extend: [0], trim: [5] },
  ],
  links: [['linux-systems', 'network-servers'], ['linux-systems', 'devops-cicd'], ['linux-systems', 'docker-containers'], ['linux-systems', 'cloud-infrastructure'],
    ['devops-cicd', 'docker-containers'], ['network-servers', 'cloud-infrastructure'], ['network-servers', 'kubernetes-reliability'], ['devops-cicd', 'kubernetes-reliability']],
};
// Lattice maps keep the default view; their captions get the room the longest island names need beside the list.
// `markers`: the new regions' planned islands carry an accent pennant; AI keeps the M3.1 planned-island look.
const lattice = (regionId: RegionId, spec: LatticeMapSpec, { labelReach = 8.5, markers = true, azimuth = 0 } = {}): RegionLayout =>
  ({ regionId, ...latticeLayout(spec), camera: { azimuth: { desktop: azimuth, phone: azimuth }, labelReach }, source: 'lattice', ...(markers ? { plannedMarkers: true as const } : {}) });

/**
 * The regions that have a 3D map, keyed by registry region id. A region without an entry has no /world page and no
 * place on the overview; it is described in lists only, marked 規劃中 (multi-archipelago v2). Adding a region to the
 * 3D world is one entry here and one in world-map.ts.
 */
export const REGION_LAYOUTS: Partial<Record<RegionId, RegionLayout>> = {
  cs: { regionId: 'cs', layout: cs, camera: { azimuth: { desktop: 295, phone: 105 }, labelReach: 8.5 }, docks: [{ islandId: 'foundations', spurId: 'foundations-dock' }], source: 'authored' },
  // To go back to the M3.1 loop: `ai: AI_BASELINE_LAYOUT`.
  // Turned 30 degrees: a hexagonal ring is narrowest across its flats, so every island is drawn larger.
  ai: lattice('ai', AI_PINWHEEL, { markers: false, azimuth: 30, labelReach: 6 }),
  design: lattice('design', DESIGN),
  web: lattice('web', WEB),
  sys: lattice('sys', SYS, { labelReach: 16 }),
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
