import { courses } from '@/content/courses';
import { islands as curriculumIslands, lessons } from '@/content/curriculum';
import { DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { DIFFICULTIES, type Difficulty, type IslandId } from '@/content/curriculum/schema';
import { databaseIsland, islands as mapIslands, labIsland } from '@/lib/islands/data';

/*
 * 2026-11-12 unified navigation: the sidebar trees, island previews and breadcrumbs are built here from the existing
 * sources (the curriculum lessons, the six labs, the trial bank) and never kept as a second list. Server only: the
 * pages pass the plain result to the client sidebar. The exam tree lives in exam-nav.ts so a build without the trial
 * system never loads the bank.
 */

/** The three areas of the sidebar, also the header's 2D sections. */
export type NavArea = 'curriculum' | 'labs' | 'trials';

export interface NavLeaf { id: string; label: string; href: string; code?: string; lessonId?: string }
export interface NavGroup { id: string; label: string; hint?: string; children: NavNode[] }
export type NavNode = NavLeaf | NavGroup | NavDisabled;
/** An entry that exists in the data but has no page yet (a planned exam): shown, never linked. */
export interface NavDisabled { id: string; label: string; disabled: string }
export const isGroup = (n: NavNode): n is NavGroup => 'children' in n;
export const isDisabled = (n: NavNode): n is NavDisabled => 'disabled' in n;

/** An island preview: the screenshot taken from the 3D map, and the address that opens the map on that island. */
export interface IslandPreview {
  id: string; name: string; nameEn: string; image: string; accent: string;
  /** The home map, focused on this island (`/?island=`), or the whole archipelago. */
  mapHref: string;
  /** This island's lessons with a page, for the learner's progress; none for the lab island (it keeps no record). */
  lessonIds?: string[];
}

const mapIsland = (id: string) => [...mapIslands, labIsland, databaseIsland].find(i => i.id === id);
const preview = (id: string, lessonIds?: string[]): IslandPreview => {
  const island = mapIsland(id);
  if (!island) throw new Error(`Unknown map island: ${id}`);
  return { id, name: island.name, nameEn: island.englishName, image: `/images/islands/${id}.webp`, accent: island.accent, mapHref: `/?island=${id}`, ...lessonIds ? { lessonIds } : {} };
};
/** The whole archipelago, for pages that belong to no single island (the curriculum overview, the trials). */
export const OVERVIEW_PREVIEW: IslandPreview = { id: 'overview', name: 'Logic Island 群島', nameEn: 'THE ARCHIPELAGO', image: '/images/islands/overview.webp', accent: '#2563c5', mapHref: '/' };

export const lessonIdsOfIsland = (islandId: string) => lessons.filter(l => l.islandId === islandId && l.lessonStatus === 'complete').map(l => l.lessonId);
/** Every island the sidebar can show, by map id (the four curriculum islands and the lab island). */
export const islandPreviews = (): Record<string, IslandPreview> => Object.fromEntries([
  ...curriculumIslands.map(i => [i.id, preview(i.id, lessonIdsOfIsland(i.id))] as const),
  [labIsland.id, preview(labIsland.id)] as const,
]);

/** Curriculum: island → difficulty → lesson, in the recommended order; only levels an island has. */
export function courseTree(): NavGroup[] {
  return curriculumIslands.map(island => ({
    id: `c:${island.id}`, label: island.name, hint: `${lessons.filter(l => l.islandId === island.id).length} 堂`,
    children: DIFFICULTIES.flatMap(level => {
      const own = lessons.filter(l => l.islandId === island.id && l.difficulty === level);
      return own.length ? [{ id: `c:${island.id}:${level}`, label: DIFFICULTY_LABELS[level], hint: `${own.length}`,
        children: own.map(l => ({ id: `c:${l.lessonId}`, label: l.title, code: l.lessonId, lessonId: l.lessonId, href: `/curriculum/${l.slug}` })) }] : [];
    }),
  }));
}

/** 互動實驗島: the six labs by category, in course order. */
export function labTree(): NavGroup[] {
  return [...new Set(courses.map(c => c.category))].map(category => ({
    id: `l:${category}`, label: category, hint: `${courses.filter(c => c.category === category).length}`,
    children: courses.filter(c => c.category === category).map(c => ({ id: `l:${c.slug}`, label: `${c.title} · ${c.subtitle}`, href: `/learn/${c.slug}` })),
  }));
}

/** Where a lesson sits, for the breadcrumb and the preview: its island, its level and the island's 2D index. */
export function lessonPlace(lessonId: string) {
  const lesson = lessons.find(l => l.lessonId === lessonId);
  if (!lesson) return undefined;
  const island = curriculumIslands.find(i => i.id === lesson.islandId)!;
  return { island, level: DIFFICULTY_LABELS[lesson.difficulty as Difficulty], islandHref: `/curriculum#island-${island.id as IslandId}` };
}
