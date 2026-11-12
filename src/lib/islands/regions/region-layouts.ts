import type { RegionId } from '@/content/world/types';
import { A, assembleLayout, plannedSettlement, shape, type WorldLayout } from '../hex-layout';
import { DATABASES_SPEC, ISLANDS_LAYOUT } from '../islands-world';
import type { HexBridge } from '../hex-world';

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
 */

/** A planned island before it has lessons: a radius-2 hex, 19 tiles. */
export const PLANNED_SHAPE = shape(2, [], []);
const planned = (islandId: string, center: ReturnType<typeof A>, spurs?: Parameters<typeof plannedSettlement>[0]['spurs']) =>
  ({ islandId, center, shape: PLANNED_SHAPE, ...(spurs ? { spurs } : {}) });

export interface RegionLayout {
  regionId: RegionId;
  layout: WorldLayout;
  /**
   * Degrees added to the default camera azimuth (option C), per device: the turn that gives the smallest island the
   * most pixels on that stage (desktop 1440 × 1000 beside the 340 px list, phone 390 × 434), from the M3.1 search.
   */
  azimuth: { desktop: number; phone: number };
  /** Docks where the ferry routes of the world overview land: `islandId` and spur id. */
  docks: { islandId: string; spurId: string }[];
}

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

export const REGION_LAYOUTS: Record<RegionId, RegionLayout> = {
  cs: { regionId: 'cs', layout: cs, azimuth: { desktop: 295, phone: 105 }, docks: [{ islandId: 'foundations', spurId: 'foundations-dock' }] },
  ai: { regionId: 'ai', layout: ai, azimuth: { desktop: 0, phone: 0 }, docks: [{ islandId: 'ai-foundations', spurId: 'ai-foundations-dock' }, { islandId: 'ai-engineering', spurId: 'ai-engineering-dock' }] },
};
