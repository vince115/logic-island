import { islandOfLesson, islandsInRegion, orderedRegions, regionStatus } from '@/content/world';
import { getCatalogLesson, lessonsOfIsland } from '@/content/world/catalog';
import { learningPaths } from '@/content/world/paths';
import { REGION_IDS, type IslandConfig, type IslandStatus, type RegionId } from '@/content/world/types';

/*
 * R6 (2026-11-12): one overview per region, /regions/<id>, read from the world registry and the catalog only. A region's
 * islands are listed by navigation group; an island links to its syllabus only when it has published lessons, so a
 * planned island (every AI island today) is text marked 規劃中 and never a way to a lesson page that does not exist.
 */

export const regionHref = (region: RegionId) => `/regions/${region}` as const;
export const isRegionId = (id: string): id is RegionId => (REGION_IDS as readonly string[]).includes(id);

export interface RegionIslandSummary {
  id: string; code: string; name: string; nameEn: string; description: string; accent: string;
  status: IslandStatus; lessonCount: number; published: number;
  /** The island's section on /curriculum, only when it has published lessons. */
  href?: `/curriculum#${string}`;
}
export interface RegionPathSummary { id: string; title: string; titleEn: string; description: string; lessonCount: number; publishedLessons: number; learnable: boolean }
export interface RegionOverview {
  id: RegionId; name: string; nameEn: string; order: number; status: IslandStatus;
  islandCount: number; lessonCount: number; published: number;
  groups: { id: string; label: string; islands: RegionIslandSummary[] }[];
  /** Islands of the region outside every navigation group (all of them in a region without groups). */
  ungrouped: RegionIslandSummary[];
  /** Learning paths whose targets sit mostly in this region. */
  paths: RegionPathSummary[];
}

function islandSummary(island: IslandConfig): RegionIslandSummary {
  const published = lessonsOfIsland(island.id).filter(l => l.lessonStatus === 'complete').length;
  return { id: island.id, code: island.code, name: island.name, nameEn: island.nameEn, description: island.description, accent: island.theme.accent,
    status: island.status, lessonCount: island.lessonCount, published, ...published ? { href: `/curriculum#island-${island.id}` as const } : {} };
}

/** The region a path belongs to: where most of its targets are (ties go to the earlier region). */
export function pathRegion(targets: readonly string[]): RegionId | undefined {
  const count = new Map<RegionId, number>();
  for (const t of targets) { const r = islandOfLesson(t)?.regionId; if (r) count.set(r, (count.get(r) ?? 0) + 1); }
  let best: RegionId | undefined;
  for (const r of orderedRegions.map(x => x.id)) if ((count.get(r) ?? 0) > (best ? count.get(best)! : 0)) best = r;
  return best;
}

export function regionOverview(id: RegionId): RegionOverview {
  const region = orderedRegions.find(r => r.id === id)!;
  const islands = islandsInRegion(id).map(islandSummary);
  const grouped = new Set(region.groups?.flatMap(g => g.islandIds) ?? []);
  return {
    id, name: region.name, nameEn: region.nameEn, order: region.order, status: regionStatus(id),
    islandCount: islands.length, lessonCount: islands.reduce((n, i) => n + i.lessonCount, 0), published: islands.reduce((n, i) => n + i.published, 0),
    groups: (region.groups ?? []).map(g => ({ id: g.id, label: g.label, islands: g.islandIds.map(iid => islands.find(i => i.id === iid)!) })),
    ungrouped: islands.filter(i => !grouped.has(i.id)),
    paths: learningPaths.filter(p => pathRegion(p.targets) === id).map(p => ({ id: p.id, title: p.title, titleEn: p.titleEn, description: p.description,
      lessonCount: p.lessons.length, publishedLessons: p.lessons.filter(l => getCatalogLesson(l)?.lessonStatus === 'complete').length, learnable: p.completion.learnable })),
  };
}

/** Every region in order, for the entry points (home, /curriculum, /world): what it holds and where its overview is. */
export const regionEntries = () => orderedRegions.map(r => {
  const o = regionOverview(r.id);
  return { id: o.id, name: o.name, nameEn: o.nameEn, status: o.status, islandCount: o.islandCount, lessonCount: o.lessonCount, published: o.published, href: regionHref(o.id) };
});
export type RegionEntry = ReturnType<typeof regionEntries>[number];
