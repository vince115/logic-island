/**
 * Dynamic Island Population (visitor presence). Two build-time switches, read on the server only, like the other
 * feature flags of the site (src/lib/world/flag.ts): without them nothing of the system is built or rendered.
 *
 * LOGIC_ISLAND_PRESENCE=1: the anonymous presence tracker (root layout) and the presence API. The API's route file is
 * `route.presence.ts`, a page extension next.config.ts adds only with this flag, so a build without it has no route
 * handler at all (the trial system's release preflight requires that, src/lib/trials/preflight.ts `routeCheck`).
 *
 * LOGIC_ISLAND_POPULATION_NPC=mock|live: the home map draws walking figures for an island's online population.
 * `mock` uses generated numbers (review and tests; never in a Vercel Production build), `live` reads the presence API
 * and needs LOGIC_ISLAND_PRESENCE=1. Any other value: no figures, and the map's code for them is never downloaded.
 */
export const presenceEnabled = () => process.env.LOGIC_ISLAND_PRESENCE === '1';

export type PopulationSource = 'mock' | 'live';
export function populationNpcSource(): PopulationSource | null {
  const value = process.env.LOGIC_ISLAND_POPULATION_NPC;
  if (value === 'mock') return process.env.VERCEL_ENV === 'production' ? null : 'mock';
  if (value === 'live') return presenceEnabled() ? 'live' : null;
  return null;
}
