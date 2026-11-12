import { parseLessonId, type LessonPrefix } from './lesson-id';
import { LAB_ISLAND_ID, regions, worldIslands } from './islands';
import type { IslandConfig, IslandStatus, Region, RegionId, WorldConfig } from './types';

/*
 * Phase F.0 world registry: the static configuration of regions and islands, and lookups over it. Server-side data:
 * client components should receive what they need as props rather than import this (it carries the planning data).
 */

export const world: WorldConfig = { version: '0.1.0', regions, islands: worldIslands };

export const getRegion = (id: string) => regions.find(r => r.id === id);
/** Multi-archipelago v2: the regions in their declared display order. */
export const orderedRegions: Region[] = [...regions].sort((a, b) => a.order - b.order);
export const getIsland = (id: string) => worldIslands.find(i => i.id === id);
export const subjectIslands = worldIslands.filter(i => i.kind === 'subject');
export const labIslandConfig = getIsland(LAB_ISLAND_ID)!;
/** A region's subject islands in subject order. */
export const islandsInRegion = (region: RegionId) => subjectIslands.filter(i => i.regionId === region).sort((a, b) => a.order! - b.order!);

/**
 * A region's content status, derived from its islands (never declared): complete when every island is complete,
 * available when any island has lessons to open, planned (shown as 規劃中) otherwise.
 */
export function regionStatus(region: RegionId): IslandStatus {
  const list = islandsInRegion(region);
  if (list.length && list.every(i => i.status === 'complete')) return 'complete';
  return list.some(i => i.status !== 'planned') ? 'available' : 'planned';
}

/** P6: the number of regions in Chinese (五 for five regions), so headings follow the data instead of a fixed 「四大」. */
export const regionCountZh = () => '零一二三四五六七八九十'[orderedRegions.length] ?? String(orderedRegions.length);

/** Multi-archipelago v2: how many subject islands and planned-or-written lessons each region holds, in region order. */
export const taxonomy = () => orderedRegions.map(r => ({ region: r.id, islands: islandsInRegion(r.id).length,
  lessons: islandsInRegion(r.id).reduce((n, i) => n + i.lessonCount, 0) }));

const byPrefix = new Map<LessonPrefix, IslandConfig>(subjectIslands.map(i => [i.lessonPrefix!, i]));
export const islandByPrefix = (prefix: LessonPrefix) => byPrefix.get(prefix);
/** The island a lesson ID belongs to, read with its whole prefix (DB01 → databases, never structures). */
export function islandOfLesson(lessonId: string): IslandConfig | undefined {
  const parsed = parseLessonId(lessonId);
  return parsed && byPrefix.get(parsed.prefix);
}

export { LAB_ISLAND_ID, regions, worldIslands };
export type * from './types';
