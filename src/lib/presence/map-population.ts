import { populationNpcSource } from './flag';
import { islandOpen, islandRegion } from './locations';
import type { PopulationConfig } from './population';

/**
 * Server only (a page's server component): what a map needs to draw the population, or undefined when the build has
 * no population source (LOGIC_ISLAND_POPULATION_NPC, flag.ts), in which case the map's code for figures is never
 * downloaded. `regions` is each island's region as the presence API itself resolves it (locations.ts), so a map's
 * commons are the same regions the API counts; only these few ids cross to the client, never the registry.
 *
 * P6-B: `closed` are the map's islands the registry has as planned (locations.ts islandOpen). They keep their region
 * (their bridges are still the region's commons, where the region's visitors on no island are drawn), but no figure
 * is ever drawn on them, whatever a snapshot says: the API counts nobody there, and a map does not rely on that.
 */
export function mapPopulation(islandIds: readonly string[]): PopulationConfig | undefined {
  const source = populationNpcSource();
  if (!source) return undefined;
  const closed = islandIds.filter(id => !islandOpen(id));
  return { source, regions: Object.fromEntries(islandIds.flatMap(id => { const region = islandRegion(id); return region ? [[id, region]] : []; })), ...(closed.length ? { closed } : {}) };
}
