import { islands as curriculumIslands, lessons } from '@/content/curriculum';
import { DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { DIFFICULTIES, type Difficulty } from '@/content/curriculum/schema';
import { getIsland, islandsInRegion, orderedRegions, regionStatus } from '@/content/world';
import { CONTENT_STATUS_LABELS, contentStatusOf, lessonsOfIsland } from '@/content/world/catalog';
import type { IslandConfig, RegionId } from '@/content/world/types';
import { LAB_DOMAIN_LABELS, LAB_DOMAINS, labsOfDomain } from '@/content/world/labs';
import { databaseIsland, islands as mapIslands, labIsland } from '@/lib/islands/data';

/*
 * 2026-11-12 unified navigation: the sidebar trees, island previews and breadcrumbs are built here from the existing
 * sources (the world registry and catalog, the curriculum lessons, the six labs, the trial bank) and never kept as a
 * second list. Server only: the pages pass the plain result to the client sidebar, which imports nothing from this
 * module (its types and helpers are in nav-model.ts; a unit test checks it). The exam tree lives in exam-nav.ts
 * so a build without the trial system never loads the bank.
 *
 * Multi-archipelago v2 (P2): World → Region → Island → Lesson. The curriculum tree starts at the four regions; the AI
 * region adds its three navigation groups; an island with written lessons lists them by level, a planned island lists
 * its outline as entries that are shown and never linked (規劃中), so no planned lesson leads to a 404.
 */

// The data's shapes and the client-safe helpers are in nav-model.ts (which imports nothing); re-exported for server code.
export * from './nav-model';
import type { IslandPreview, NavGroup, NavLeaf, NavNode, PreviewLevel } from './nav-model';

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
    // R6: the region's overview comes first, so /regions/<id> opens and highlights its own region.
    const overview: NavLeaf = { id: `c:r:${region.id}:overview`, label: '群島總覽', href: `/regions/${region.id}` };
    return { id: `c:r:${region.id}`, kind: 'region' as const, label: region.name, hint: regionHint(region.id), children: [overview, ...children] };
  });
}

/**
 * 互動實驗島: every lab of the registry by learning domain (multi-archipelago v2, P4). Implemented labs link to their
 * page; planned ones are shown as 規劃中 without a link.
 */
export function labTree(): NavGroup[] {
  return LAB_DOMAINS.flatMap(domain => {
    const labs = labsOfDomain(domain);
    return labs.length ? [{ id: `l:${domain}`, label: LAB_DOMAIN_LABELS[domain], hint: `${labs.filter(l => l.status === 'implemented').length}／${labs.length}`,
      children: labs.map((l): NavNode => l.status === 'implemented' ? { id: `l:${l.id}`, label: l.title, href: `/learn/${l.id}` } : { id: `l:${l.id}`, label: l.title, disabled: '規劃中' }) }] : [];
  });
}

/** Where a lesson sits, for the breadcrumb and the preview: its region, its island, its level and the 2D indexes. */
export function lessonPlace(lessonId: string) {
  const lesson = lessons.find(l => l.lessonId === lessonId);
  if (!lesson) return undefined;
  const island = curriculumIslands.find(i => i.id === lesson.islandId)!;
  const region = orderedRegions.find(r => r.id === getIsland(island.id)?.regionId)!;
  return { region: { id: region.id, name: region.name }, regionHref: `/regions/${region.id}`, island,
    level: DIFFICULTY_LABELS[lesson.difficulty as Difficulty], islandHref: `/curriculum#island-${island.id}` };
}
