import { courses } from '@/content/courses';
import { islands as curriculumIslands, lessons } from '@/content/curriculum';
import { DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { DIFFICULTIES, type Difficulty } from '@/content/curriculum/schema';
import { getIsland, islandsInRegion, orderedRegions, regionStatus } from '@/content/world';
import { CONTENT_STATUS_LABELS, contentStatusOf, lessonsOfIsland } from '@/content/world/catalog';
import type { IslandConfig, RegionId } from '@/content/world/types';
import { databaseIsland, islands as mapIslands, labIsland } from '@/lib/islands/data';

/*
 * 2026-11-12 unified navigation: the sidebar trees, island previews and breadcrumbs are built here from the existing
 * sources (the world registry and catalog, the curriculum lessons, the six labs, the trial bank) and never kept as a
 * second list. Server only: the pages pass the plain result to the client sidebar. The exam tree lives in exam-nav.ts
 * so a build without the trial system never loads the bank.
 *
 * Multi-archipelago v2 (P2): World → Region → Island → Lesson. The curriculum tree starts at the four regions; the AI
 * region adds its three navigation groups; an island with written lessons lists them by level, a planned island lists
 * its outline as entries that are shown and never linked (規劃中), so no planned lesson leads to a 404.
 */

/** The three areas of the sidebar, also the header's 2D sections. */
export type NavArea = 'curriculum' | 'labs' | 'trials';

export interface NavLeaf { id: string; label: string; href: string; code?: string; lessonId?: string }
export interface NavGroup { id: string; label: string; hint?: string; children: NavNode[]; kind?: 'region' | 'group' | 'island' | 'level' }
export type NavNode = NavLeaf | NavGroup | NavDisabled;
/** An entry that exists in the data but has no page yet (a planned lesson or exam): shown, never linked. */
export interface NavDisabled { id: string; label: string; disabled: string; code?: string }
export const isGroup = (n: NavNode): n is NavGroup => 'children' in n;
export const isDisabled = (n: NavNode): n is NavDisabled => 'disabled' in n;

/**
 * What a preview card stands for, shown on the card so one picture is never read as another level: the whole world,
 * one island, or the shared lab tool (which belongs to no region).
 */
export type PreviewLevel = 'world' | 'island' | 'tool';
export const PREVIEW_LEVEL_LABELS: Record<PreviewLevel, string> = { world: '世界', island: '島嶼', tool: '共用工具' };

/** An island preview: the screenshot taken from the 3D map, and the address that opens the map on that island. */
export interface IslandPreview {
  id: string; name: string; nameEn: string; image: string; accent: string; level: PreviewLevel;
  /** The region the island belongs to (islands only). */
  region?: string;
  /** The home map, focused on this island (`/?island=`), or the whole archipelago. */
  mapHref: string;
  /** This island's lessons with a page, for the learner's progress; none for the lab island (it keeps no record). */
  lessonIds?: string[];
}

const mapIsland = (id: string) => [...mapIslands, labIsland, databaseIsland].find(i => i.id === id);
const regionName = (id: string) => orderedRegions.find(r => r.id === getIsland(id)?.regionId)?.name;
const preview = (id: string, level: PreviewLevel, lessonIds?: string[]): IslandPreview => {
  const island = mapIsland(id);
  if (!island) throw new Error(`Unknown map island: ${id}`);
  const region = level === 'island' ? regionName(id) : undefined;
  return { id, name: island.name, nameEn: island.englishName, image: `/images/islands/${id}.webp`, accent: island.accent, level,
    mapHref: `/?island=${id}`, ...region ? { region } : {}, ...lessonIds ? { lessonIds } : {} };
};
/** The whole world, for pages that belong to no single island (the curriculum overview, the trials). */
export const OVERVIEW_PREVIEW: IslandPreview = { id: 'overview', name: 'Logic Island 世界', nameEn: 'THE WORLD', image: '/images/islands/overview.webp', accent: '#2563c5', level: 'world', mapHref: '/' };

export const lessonIdsOfIsland = (islandId: string) => lessons.filter(l => l.islandId === islandId && l.lessonStatus === 'complete').map(l => l.lessonId);
/**
 * Every island the sidebar can show a picture of, by map id: the islands with written lessons (each has a screenshot
 * of the 3D map) and the lab island. Planned islands have no model and no picture, and get none.
 */
export const islandPreviews = (): Record<string, IslandPreview> => Object.fromEntries([
  ...curriculumIslands.map(i => [i.id, preview(i.id, 'island', lessonIdsOfIsland(i.id))] as const),
  [labIsland.id, preview(labIsland.id, 'tool')] as const,
]);

/** An island with written lessons: its lessons by level, in recommended order (unchanged ids since 2026-11-12). */
function writtenIsland(island: IslandConfig): NavGroup {
  const own = lessons.filter(l => l.islandId === island.id);
  const planned = lessonsOfIsland(island.id).filter(l => contentStatusOf(l) !== 'published');
  return {
    id: `c:${island.id}`, kind: 'island', label: island.name, hint: planned.length ? `${own.length}／${island.lessonCount} 堂` : `${own.length} 堂`,
    children: [
      ...DIFFICULTIES.flatMap(level => {
        const at = own.filter(l => l.difficulty === level && l.lessonStatus === 'complete');
        return at.length ? [{ id: `c:${island.id}:${level}`, kind: 'level' as const, label: DIFFICULTY_LABELS[level], hint: `${at.length}`,
          children: at.map(l => ({ id: `c:${l.lessonId}`, label: l.title, code: l.lessonId, lessonId: l.lessonId, href: `/curriculum/${l.slug}` })) }] : [];
      }),
      ...planned.map(l => ({ id: `c:${l.lessonId}`, label: l.title, code: l.lessonId, disabled: CONTENT_STATUS_LABELS[contentStatusOf(l)] })),
    ],
  };
}
/** A planned island: its outline, every lesson shown as 規劃中 and none linked. */
function plannedIsland(island: IslandConfig): NavGroup {
  return {
    id: `c:${island.id}`, kind: 'island', label: island.name, hint: `規劃中 ${island.lessonCount}`,
    children: lessonsOfIsland(island.id).map(l => ({ id: `c:${l.lessonId}`, label: l.title, code: l.lessonId, disabled: CONTENT_STATUS_LABELS[contentStatusOf(l)] })),
  };
}
const islandNode = (island: IslandConfig) => island.status === 'planned' ? plannedIsland(island) : writtenIsland(island);

/** The hint beside a region: how many of its lessons can be opened, or that it is all planned. */
export function regionHint(region: RegionId) {
  const list = islandsInRegion(region), total = list.reduce((n, i) => n + i.lessonCount, 0);
  const open = lessons.filter(l => l.lessonStatus === 'complete' && list.some(i => i.id === l.islandId)).length;
  return regionStatus(region) === 'planned' ? `規劃中 · ${total} 堂` : `${open}／${total} 堂`;
}

/** Curriculum: region → (navigation group) → island → level → lesson; planned lessons are shown, never linked. */
export function courseTree(): NavGroup[] {
  return orderedRegions.map(region => {
    const list = islandsInRegion(region.id);
    const grouped = new Set(region.groups?.flatMap(g => g.islandIds) ?? []);
    const children: NavNode[] = [
      ...(region.groups ?? []).map(g => ({ id: `c:g:${g.id}`, kind: 'group' as const, label: g.label, hint: `${g.islandIds.length} 座島`,
        children: g.islandIds.map(id => islandNode(list.find(i => i.id === id)!)) })),
      ...list.filter(i => !grouped.has(i.id)).map(islandNode),
    ];
    return { id: `c:r:${region.id}`, kind: 'region' as const, label: region.name, hint: regionHint(region.id), children };
  });
}

/** 互動實驗島: the six labs by category, in course order. */
export function labTree(): NavGroup[] {
  return [...new Set(courses.map(c => c.category))].map(category => ({
    id: `l:${category}`, label: category, hint: `${courses.filter(c => c.category === category).length}`,
    children: courses.filter(c => c.category === category).map(c => ({ id: `l:${c.slug}`, label: `${c.title} · ${c.subtitle}`, href: `/learn/${c.slug}` })),
  }));
}

/** Where a lesson sits, for the breadcrumb and the preview: its region, its island, its level and the 2D indexes. */
export function lessonPlace(lessonId: string) {
  const lesson = lessons.find(l => l.lessonId === lessonId);
  if (!lesson) return undefined;
  const island = curriculumIslands.find(i => i.id === lesson.islandId)!;
  const region = orderedRegions.find(r => r.id === getIsland(island.id)?.regionId)!;
  return { region: { id: region.id, name: region.name }, regionHref: `/curriculum#region-${region.id}`, island,
    level: DIFFICULTY_LABELS[lesson.difficulty as Difficulty], islandHref: `/curriculum#island-${island.id}` };
}
