import type { PopulationSnapshot } from './engine';

/**
 * From online population to figures on the map (client side, pure). The two numbers are kept apart on purpose: the
 * population is whatever the presence API counts, while an island shows a small number of figures that grows ever
 * more slowly and stops at the island's cap, so a busy island looks lively instead of crowded and the map's cost
 * does not depend on traffic.
 */

/** The key of the hub in a snapshot's `commons` (the same word as the server's hub region, locations.ts HUB). */
export const HUB_KEY = 'hub';

/** What a page hands its map to draw the population: where the numbers come from, and each island's region (or the hub). */
export interface PopulationConfig {
  source: 'mock' | 'live';
  regions: Readonly<Record<string, string>>;
  /**
   * P6-B: the map's islands that are not open (the registry has them as planned): no figures are drawn on them,
   * whatever number a snapshot holds for them, and such a number is drawn nowhere else either. (The API has none:
   * it counts a visitor who looks at a planned island in the region's commons, locations.ts.) Unset or empty: every
   * island of the map is open.
   */
  closed?: readonly string[];
}

/**
 * `low`: phones and other touch-first or narrow screens. Half the figures an island, a lower frame-rate cap, longer
 * rests at a road's end and an earlier stop when nobody touches the screen (npc-schedule.ts).
 */
export type DeviceTier = 'full' | 'low';
export const TIER_QUERY = '(max-width: 780px), (pointer: coarse)';
export const tierCap = (cap: number, tier: DeviceTier) => (tier === 'low' ? Math.max(1, Math.ceil(cap / 2)) : cap);
/** The most frames a second the figures ever ask for (the rate actually used follows the zoom: npc-schedule.ts motionFps). */
export const tierFps = (tier: DeviceTier) => (tier === 'low' ? 15 : 30);
/** How much longer than REST (npc-sim.ts) figures stand at a road's end. */
export const tierRest = (tier: DeviceTier) => (tier === 'low' ? 1.6 : 1);

/**
 * Figures for an online count: one each up to three visitors, then one more each time the count doubles
 * (4 → 4, 8 → 5, 16 → 6, 32 → 7, 64 → 8), never more than `cap`. Never decreasing in `online`.
 */
export function npcCountFor(online: number, cap: number): number {
  if (!Number.isFinite(online) || online < 1 || cap < 1) return 0;
  const count = Math.floor(online);
  return Math.min(Math.floor(cap), count <= 3 ? count : 2 + Math.ceil(Math.log2(count)));
}

/** An island's online count in a snapshot (0 when there is none, or no snapshot yet). */
export const onlineOf = (snapshot: PopulationSnapshot | null, islandId: string) => Math.max(0, Math.floor(snapshot?.islands[islandId] ?? 0));

/**
 * Mock presence data (LOGIC_ISLAND_POPULATION_NPC=mock): the same shape the API publishes, from the clock alone, so
 * the whole flow (numbers arriving, figures coming and going, the cap) can be reviewed with no server and no
 * visitors. The foundations island steps through quiet, busy and empty every `MOCK_STEP_MS`; an island or two of
 * every region and every region's commons have visitors too, so each region's map has something to show.
 */
export const MOCK_STEP_MS = 8_000;
const MOCK_FOUNDATIONS = [1, 3, 6, 12, 40, 12, 3, 0];
const MOCK_REGIONS = ['cs', 'ai', 'design', 'web', 'sys'] as const;
/** The mock's islands by region (ids of the world registry); an island it does not name counts for `cs`. */
const MOCK_ISLANDS: Readonly<Record<(typeof MOCK_REGIONS)[number] | typeof HUB_KEY, (step: number) => Record<string, number>>> = {
  cs: step => ({ foundations: MOCK_FOUNDATIONS[step % MOCK_FOUNDATIONS.length], structures: 2 + (step % 3), databases: step % 2, networks: (step + 1) % 2 }),
  ai: step => ({ 'machine-learning': 1, 'ai-agents': step % 3, 'large-language-models': 5 }),
  design: step => ({ 'ui-design': 2, 'ux-research': step % 2 }),
  web: step => ({ frontend: 1 + (step % 3), 'web-foundations': 4 }),
  sys: step => ({ 'linux-systems': 1 + (step % 4), 'docker-containers': 2, 'kubernetes-reliability': step % 2 }),
  hub: step => ({ labs: 1 + (step % 2) }),
};
const MOCK_COMMONS = (step: number): Record<string, number> => ({ cs: 1 + (step % 3), ai: step % 2, design: 1, web: (step + 1) % 2, sys: 2, hub: 1 + (step % 2) });
const MOCK_REGION_OF = new Map(Object.entries(MOCK_ISLANDS).flatMap(([region, islands]) => Object.keys(islands(0)).map(id => [id, region] as const)));

/** `override`: the islands' counts (review and tests); `commons`: the regions' with them, none when left out. */
export function mockSnapshot(now: number, override?: Readonly<Record<string, number>>, commonsOverride?: Readonly<Record<string, number>>): PopulationSnapshot {
  const step = Math.floor(now / MOCK_STEP_MS);
  const islands: Record<string, number> = override ? { ...override } : Object.assign({}, ...Object.values(MOCK_ISLANDS).map(of => of(step)));
  for (const id of Object.keys(islands)) if (!(islands[id] > 0)) delete islands[id];
  const commons: Record<string, number> = Object.fromEntries([...MOCK_REGIONS, HUB_KEY].map(region => [region, Math.max(0, Math.floor((override ? commonsOverride : MOCK_COMMONS(step))?.[region] ?? 0))]));
  const all = { ...commons };
  for (const [id, count] of Object.entries(islands)) all[MOCK_REGION_OF.get(id) ?? 'cs'] += count;
  const { [HUB_KEY]: hub, ...regions } = all;
  return { v: 1, at: now, ttlMs: 90_000, total: hub + Object.values(regions).reduce((sum, n) => sum + n, 0), hub, regions, islands, commons };
}

/** A snapshot from untrusted JSON (the API's answer), or null when it is not one. */
export function parseSnapshot(value: unknown): PopulationSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const { v, at, ttlMs, total, hub, regions, islands, commons } = value as Record<string, unknown>;
  const counts = (record: unknown): record is Record<string, number> => Boolean(record) && typeof record === 'object'
    && Object.values(record as object).every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (typeof v !== 'number' || typeof at !== 'number' || typeof ttlMs !== 'number' || typeof total !== 'number' || typeof hub !== 'number') return null;
  if (!counts(regions) || !counts(islands) || (commons !== undefined && !counts(commons))) return null;
  return { v, at, ttlMs, total, hub, regions, islands, ...(commons ? { commons } : {}) };
}
