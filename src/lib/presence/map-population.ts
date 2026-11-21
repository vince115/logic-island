import { populationNpcSource } from './flag';
import { resolvePlace } from './locations';
import type { PopulationConfig } from './population';

/**
 * Server only (a page's server component): what a map needs to draw the population, or undefined when the build has
 * no population source (LOGIC_ISLAND_POPULATION_NPC, flag.ts), in which case the map's code for figures is never
 * downloaded. `regions` is each island's region as the presence API itself resolves it (locations.ts), so a map's
 * commons are the same regions the API counts; only these few ids cross to the client, never the registry.
 */
export function mapPopulation(islandIds: readonly string[]): PopulationConfig | undefined {
  const source = populationNpcSource();
  if (!source) return undefined;
  return { source, regions: Object.fromEntries(islandIds.flatMap(id => {
    const location = resolvePlace({ t: 'island', id });
    return location.island === id ? [[id, location.region]] : [];
  })) };
}
