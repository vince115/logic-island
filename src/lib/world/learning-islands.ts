import { getCourse } from '@/content/courses';
import { getLessonById } from '@/content/curriculum';
import type { IslandId } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland, islandsInRegion, labIslandConfig, orderedRegions } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import type { RegionId } from '@/content/world/types';
import { isMappedRegion, type MappedRegionId } from '@/lib/islands/regions/region-layouts';
import { databaseIsland, islands, labIsland } from '@/lib/islands/data';
import type { IslandDefinition, LearningIsland } from '@/lib/islands/types';

/*
 * M3.1 regional world prototype: what each region's map and list show, server-side. Islands with written lessons get
 * the same data as on the home page (src/app/page.tsx, left unchanged; the two fold together if the regional world
 * replaces it); planned islands get only their registry name, description and planned lesson count, so nothing
 * links to a lesson that does not exist and no progress or "已開放" line can appear.
 */
const MAP_ISLANDS: IslandDefinition[] = [...islands, databaseIsland];

function written(definition: IslandDefinition): LearningIsland {
  const record = getIsland(definition.id), anchor = record?.entryPoints.find(e => e.target.startsWith('/curriculum#'))?.target;
  return {
    ...definition,
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
  const record = getIsland(id)!;
  return {
    id, name: record.name, englishName: record.nameEn.toUpperCase(), description: record.description,
    landmark: `學科代碼 ${record.code} · 規劃中`, modelId: 'data-harbor', position: [0, 0, 0], bounds: { min: [-3, -2, -3], max: [3, 3, 3] },
    accent: record.theme.accent, courseSlugs: [], lessons: [], planned: { lessonCount: record.lessonCount },
  };
}

/** A region's islands in registry order: written ones as on the home page, planned ones as planned. */
export function regionIslands(region: MappedRegionId): LearningIsland[] {
  return islandsInRegion(region).map(record => {
    if (record.status === 'planned') return plannedIsland(record.id);
    const definition = MAP_ISLANDS.find(d => d.id === record.id);
    if (!definition) throw new Error(`No map definition for ${record.id}, which has written lessons`);
    return written(definition);
  });
}

export interface RegionSummary { id: MappedRegionId; name: string; nameEn: string; islands: number; open: number; planned: number; href: `/world/${MappedRegionId}` }
export interface UnmappedRegionSummary { id: RegionId; name: string; nameEn: string; islands: number; lessons: number }
/**
 * The world overview's regions with a 3D map: how many subject islands each holds and how many of them have lessons
 * to open. Multi-archipelago v2: regions without a map are listed by unmappedRegions(), never linked to /world.
 */
export function regionSummaries(): RegionSummary[] {
  return orderedRegions.flatMap(region => {
    if (!isMappedRegion(region.id)) return [];
    const list = islandsInRegion(region.id);
    return [{ id: region.id, name: region.name, nameEn: region.nameEn, islands: list.length, open: list.filter(i => i.status !== 'planned').length,
      planned: list.filter(i => i.status === 'planned').length, href: `/world/${region.id}` as const }];
  });
}
/** Regions in the registry that have no 3D map yet (shown as 規劃中, without a map link). */
export const unmappedRegions = (): UnmappedRegionSummary[] => orderedRegions.filter(r => !isMappedRegion(r.id)).map(r => ({
  id: r.id, name: r.name, nameEn: r.nameEn, islands: islandsInRegion(r.id).length, lessons: islandsInRegion(r.id).reduce((n, i) => n + i.lessonCount, 0) }));

/** The hub of the overview: 互動實驗島 (its labs at /learn) and the central challenge island, which is only planned. */
export const hubSummary = () => ({ lab: { name: labIslandConfig.name, description: labIslandConfig.description, href: '/learn' as const, accent: labIsland.accent } });
