import { getCourse } from '@/content/courses';
import { getLessonById } from '@/content/curriculum';
import type { IslandId } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland, islandsInRegion, labIslandConfig, orderedRegions } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import { openLabCounts } from '@/content/world/labs';
import type { RegionId } from '@/content/world/types';
import { isMappedRegion } from '@/lib/islands/regions/region-layouts';
import type { IslandVisual } from '@/lib/islands/regions/schema';
import { databaseIsland, islands, labIsland } from '@/lib/islands/data';
import type { IslandDefinition, LearningIsland } from '@/lib/islands/types';
import { getIslandEntry } from './island-registry';

/*
 * M3.1 regional world prototype: what each region's map and list show, server-side. Islands with written lessons get
 * the same data as on the home page (src/app/page.tsx, left unchanged; the two fold together if the regional world
 * replaces it); planned islands get only their registry name, description and planned lesson count, so nothing
 * links to a lesson that does not exist and no progress or "已開放" line can appear.
 */
const MAP_ISLANDS: IslandDefinition[] = [...islands, databaseIsland];

/**
 * P9 S1: an island with written lessons that the home map never drew (every island beyond the first four, once its
 * lessons are published) is described by the world registry alone, so publishing an island needs no entry here. The
 * hex map frames an island from its tiles, so `modelId`, `position` and `bounds` are never read for it.
 */
function registryDefinition(id: string): IslandDefinition {
  const record = getIsland(id)!;
  return { id, name: record.name, englishName: record.nameEn.toUpperCase(), description: record.description, landmark: record.theme.landmark ?? `學科代碼 ${record.code}`,
    modelId: 'data-harbor', position: [0, 0, 0], bounds: { min: [-3, -2, -3], max: [3, 3, 3] }, accent: record.theme.accent, courseSlugs: [] };
}

function written(home: IslandDefinition): LearningIsland {
  const record = getIsland(home.id), anchor = record?.entryPoints.find(e => e.target.startsWith('/curriculum#'))?.target;
  const interactions = getIslandEntry(home.id)?.interactionSpec;
  // The home map presents the foundations island as the site's guide (`catalogEntry`, 「尚無專屬教材」). On a region map
  // it is a subject island like the others (S0 decision 4): the registry's description, and no guide entry.
  const { catalogEntry, ...own } = home;
  const definition: IslandDefinition = catalogEntry && record ? { ...own, description: record.description } : home;
  return {
    ...definition,
    // P9 S1: on a region map an island's targets follow the island registry (the workshop leads to its own syllabus).
    ...(interactions ? { interactions } : {}),
    // As on the home page, only the database island shows how many of its lessons are written.
    ...(definition.id === databaseIsland.id && record && anchor ? {
      published: { open: lessonsOfIsland(definition.id).filter(l => l.lessonStatus === 'complete').length, total: record.lessonCount },
      curriculumHref: anchor as `/curriculum#${string}`,
    } : {}),
    lessons: definition.courseSlugs.map(slug => {
      const course = getCourse(slug);
      if (!course) throw new Error(`Unknown island course: ${slug}`);
      return { slug: course.slug, title: course.title, subtitle: course.subtitle };
    }),
    units: UNITS[definition.id as IslandId]?.map(unit => ({ title: unit.title, summary: unit.summary, lessons: unit.lessonIds.map(id => {
      const lesson = getLessonById(id);
      if (!lesson) throw new Error(`Unknown curriculum lesson: ${id}`);
      return { id, slug: lesson.slug, title: lesson.title };
    }) })),
  };
}

function plannedIsland(id: string): LearningIsland {
  const record = getIsland(id)!, interactions = getIslandEntry(id)?.interactionSpec;
  return {
    // P9 S1: a planned island's targets, when it has any, are information only (islandInteractions drops the rest).
    ...(interactions ? { interactions } : {}),
    id, name: record.name, englishName: record.nameEn.toUpperCase(), description: record.description,
    landmark: `學科代碼 ${record.code} · 規劃中`, modelId: 'data-harbor', position: [0, 0, 0], bounds: { min: [-3, -2, -3], max: [3, 3, 3] },
    accent: record.theme.accent, courseSlugs: [], lessons: [], planned: { lessonCount: record.lessonCount },
    // P8.2 (D4): a planned island can be explored and its outline read; the outline is on the region's 2D overview,
    // which lists topics only. No lesson page exists, so nothing here leads to one.
    outlineHref: `/regions/${record.regionId!}#island-${id}`,
  };
}

/**
 * P8.2 Island Visual Status: how an island is drawn on its region map, derived and never stored. `state` is the
 * registry's content status; `tier` is what the region layout gives it (a GLB model, authored landmarks, or the shared
 * planned-island terrain with its marker).
 */
export function islandVisual(islandId: string): IslandVisual {
  const record = getIsland(islandId);
  if (!record?.regionId || !isMappedRegion(record.regionId)) throw new Error(`${islandId} is not on a region map`);
  // P9 S1: read from the island registry, the one place the 3D world takes an island from.
  const { state, tier } = getIslandEntry(islandId)!.visualSpec;
  return { state, tier };
}

/** A region's islands in registry order: written ones as on the home page, planned ones as planned. */
export function regionIslands(region: RegionId): LearningIsland[] {
  return islandsInRegion(region).map(record => {
    if (record.status === 'planned') return plannedIsland(record.id);
    return written(MAP_ISLANDS.find(d => d.id === record.id) ?? registryDefinition(record.id));
  });
}

export interface RegionSummary { id: RegionId; name: string; nameEn: string; islands: number; lessons: number; open: number; planned: number; href: `/world/${RegionId}` }
export interface UnmappedRegionSummary { id: RegionId; name: string; nameEn: string; islands: number; lessons: number }
/**
 * The world overview's regions with a 3D map: how many subject islands each holds and how many of them have lessons
 * to open. Multi-archipelago v2: regions without a map are listed by unmappedRegions(), never linked to /world.
 */
export function regionSummaries(): RegionSummary[] {
  return orderedRegions.flatMap(region => {
    if (!isMappedRegion(region.id)) return [];
    const list = islandsInRegion(region.id);
    return [{ id: region.id, name: region.name, nameEn: region.nameEn, islands: list.length, lessons: list.reduce((n, i) => n + i.lessonCount, 0), open: list.filter(i => i.status !== 'planned').length,
      planned: list.filter(i => i.status === 'planned').length, href: `/world/${region.id}` as const }];
  });
}
/** Regions in the registry that have no 3D map yet (shown as 規劃中, without a map link). */
export const unmappedRegions = (): UnmappedRegionSummary[] => orderedRegions.filter(r => !isMappedRegion(r.id)).map(r => ({
  id: r.id, name: r.name, nameEn: r.nameEn, islands: islandsInRegion(r.id).length, lessons: islandsInRegion(r.id).reduce((n, i) => n + i.lessonCount, 0) }));

/**
 * The hub of the overview: 互動實驗島 (its labs at /learn) and the central challenge island, which is only planned.
 * P8.2: the lab island is the registry's one tool island, shared by every region and never one of a region's subject
 * islands; `labs` is how many interactive labs it offers. P1-38: the hub stands for all of /learn, so that is every
 * open lab of the lab registry (algorithm and tool labs, never a planned one), the number /learn itself states; the
 * island record's own `labs` list holds only the six algorithm labs the home map shows under it.
 */
export const hubSummary = () => ({ lab: { id: labIslandConfig.id, name: labIslandConfig.name, description: labIslandConfig.description, href: '/learn' as const, accent: labIsland.accent, labs: openLabCounts().total } });
export type HubSummary = ReturnType<typeof hubSummary>;
