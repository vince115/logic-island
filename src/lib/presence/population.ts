import type { PopulationSnapshot } from './engine';

/**
 * From online population to figures on the map (client side, pure). The two numbers are kept apart on purpose: the
 * population is whatever the presence API counts, while an island shows a small number of figures that grows ever
 * more slowly and stops at the island's cap, so a busy island looks lively instead of crowded and the map's cost
 * does not depend on traffic.
 */

/** The islands that draw figures, and the most each draws. The prototype: the foundations island only. */
export const NPC_ISLANDS: Readonly<Record<string, { cap: number }>> = { foundations: { cap: 8 } };

/** `low`: phones and other touch-first or narrow screens draw half the figures at a lower frame rate. */
export type DeviceTier = 'full' | 'low';
export const TIER_QUERY = '(max-width: 780px), (pointer: coarse)';
export const tierCap = (cap: number, tier: DeviceTier) => (tier === 'low' ? Math.max(1, Math.ceil(cap / 2)) : cap);
export const tierFps = (tier: DeviceTier) => (tier === 'low' ? 20 : 30);

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
 * visitors. The foundations island steps through quiet, busy and empty every `MOCK_STEP_MS`.
 */
export const MOCK_STEP_MS = 8_000;
const MOCK_FOUNDATIONS = [1, 3, 6, 12, 40, 12, 3, 0];
export function mockSnapshot(now: number, override?: Readonly<Record<string, number>>): PopulationSnapshot {
  const step = Math.floor(now / MOCK_STEP_MS);
  const islands: Record<string, number> = override ? { ...override } : {
    foundations: MOCK_FOUNDATIONS[step % MOCK_FOUNDATIONS.length], structures: 2 + (step % 3), databases: step % 2, 'machine-learning': 1,
  };
  for (const id of Object.keys(islands)) if (!(islands[id] > 0)) delete islands[id];
  const ai = islands['machine-learning'] ?? 0, cs = Object.values(islands).reduce((sum, n) => sum + n, 0) - ai;
  return { v: 1, at: now, ttlMs: 90_000, total: cs + ai + 1, hub: 1, regions: { cs, ai, design: 0, web: 0, sys: 0 }, islands };
}

/** A snapshot from untrusted JSON (the API's answer), or null when it is not one. */
export function parseSnapshot(value: unknown): PopulationSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const { v, at, ttlMs, total, hub, regions, islands } = value as Record<string, unknown>;
  const counts = (record: unknown): record is Record<string, number> => Boolean(record) && typeof record === 'object'
    && Object.values(record as object).every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (typeof v !== 'number' || typeof at !== 'number' || typeof ttlMs !== 'number' || typeof total !== 'number' || typeof hub !== 'number') return null;
  return counts(regions) && counts(islands) ? { v, at, ttlMs, total, hub, regions, islands } : null;
}
