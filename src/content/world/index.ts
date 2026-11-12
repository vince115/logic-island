import { parseLessonId, type LessonPrefix } from './lesson-id';
import { LAB_ISLAND_ID, regions, worldIslands } from './islands';
import type { IslandConfig, RegionId, WorldConfig } from './types';

/*
 * Phase F.0 world registry: the static configuration of regions and islands, and lookups over it. Server-side data:
 * client components should receive what they need as props rather than import this (it carries the planning data).
 */

export const world: WorldConfig = { version: '0.1.0', regions, islands: worldIslands };

export const getRegion = (id: string) => regions.find(r => r.id === id);
export const getIsland = (id: string) => worldIslands.find(i => i.id === id);
export const subjectIslands = worldIslands.filter(i => i.kind === 'subject');
export const labIslandConfig = getIsland(LAB_ISLAND_ID)!;
/** A region's subject islands in subject order. */
export const islandsInRegion = (region: RegionId) => subjectIslands.filter(i => i.regionId === region).sort((a, b) => a.order! - b.order!);

const byPrefix = new Map<LessonPrefix, IslandConfig>(subjectIslands.map(i => [i.lessonPrefix!, i]));
export const islandByPrefix = (prefix: LessonPrefix) => byPrefix.get(prefix);
/** The island a lesson ID belongs to, read with its whole prefix (DB01 → databases, never structures). */
export function islandOfLesson(lessonId: string): IslandConfig | undefined {
  const parsed = parseLessonId(lessonId);
  return parsed && byPrefix.get(parsed.prefix);
}

export { LAB_ISLAND_ID, regions, worldIslands };
export type * from './types';
