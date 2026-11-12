import { lessons } from '@/content/curriculum/lessons';
import { DIFFICULTIES, type Difficulty, type LessonStatus } from '@/content/curriculum/schema';
import { parseLessonId, type AnyLessonId } from './lesson-id';
import { subjectIslands } from './index';
import planning from './planning-data.json';

/*
 * Phase F.0 lesson catalog: all 320 lessons of the plan in one list, for lookups and future overviews. Data flow:
 * docs/planning/data (planning) → scripts/planning-data.mjs → planning-data.json (validated metadata) → this catalog →
 * pages. Every lesson the curriculum has (src/content/curriculum: the 60 of F, D, A and, from Phase F.1a, the written
 * database lessons) comes from there with its content untouched; every other lesson of the plan is metadata only: no
 * content, no quiz or exercise, no page. Only complete lessons have an `href`, so nothing links to a missing page.
 * The blueprint's `status` is the planning snapshot; what is published is decided by the curriculum alone, so writing
 * a lesson never needs an edit to the blueprint.
 */

export interface CatalogLesson {
  lessonId: AnyLessonId;
  islandId: string;
  slug: string;
  title: string;
  titleEn?: string;
  difficulty: Difficulty;
  learningObjectives: string[];
  concepts: string[];
  /** Blocking prerequisites: shown as required, still never locked. */
  prerequisites: AnyLessonId[];
  /** Helpful but optional; never turned into prerequisites. */
  recommended: AnyLessonId[];
  /** Content status (built or not), never the learner's progress. */
  lessonStatus: LessonStatus;
  /** The lesson page; complete lessons only. */
  href?: `/curriculum/${string}`;
  /** A complete lesson's visualization type, or the activity a planned lesson is expected to use. */
  activity: string;
  exerciseType?: string;
  outcome?: string;
  /** Background the plan needs but no island teaches (LEARNING_PATHS §4). */
  gaps?: string[];
  track?: string;
}

// F.1d: a written lesson keeps the background its blueprint says no island teaches (DB19: cloud platforms), so a path's
// gaps do not disappear when the lesson that needs them is written.
const blueprintGaps = new Map(planning.plannedLessons.flatMap(l => 'gaps' in l && l.gaps ? [[l.lessonId, l.gaps as string[]] as const] : []));
const complete: CatalogLesson[] = lessons.map(l => ({
  lessonId: l.lessonId, islandId: l.islandId, slug: l.slug, title: l.title, difficulty: l.difficulty,
  learningObjectives: l.learningObjectives, concepts: l.concepts, prerequisites: l.prerequisites, recommended: l.recommended ?? [],
  lessonStatus: l.lessonStatus, activity: l.activity ?? l.visualizationType,
  ...(l.lessonStatus === 'complete' ? { href: `/curriculum/${l.slug}` as const } : {}),
  ...(blueprintGaps.has(l.lessonId) ? { gaps: blueprintGaps.get(l.lessonId) } : {}),
}));
const inCurriculum = new Set<string>(lessons.map(l => l.lessonId));
const plannedLessons: CatalogLesson[] = planning.plannedLessons.filter(l => !inCurriculum.has(l.lessonId)).map(l => ({
  ...l, lessonId: l.lessonId as AnyLessonId, difficulty: l.difficulty as Difficulty,
  prerequisites: l.prerequisites as AnyLessonId[], recommended: l.recommended as AnyLessonId[], lessonStatus: 'planned',
}));

/** Region by region, island by island in subject order, lessons by number. */
const islandRank = new Map(subjectIslands.map(i => [i.id, (i.regionId === 'cs' ? 0 : 100) + i.order!]));
export const catalogLessons: CatalogLesson[] = [...complete, ...plannedLessons].sort((a, b) =>
  islandRank.get(a.islandId)! - islandRank.get(b.islandId)! || parseLessonId(a.lessonId)!.number - parseLessonId(b.lessonId)!.number);

const byId = new Map(catalogLessons.map(l => [l.lessonId as string, l]));
const bySlug = new Map(catalogLessons.map(l => [l.slug, l]));
export const getCatalogLesson = (id: string) => byId.get(id);
export const getCatalogLessonBySlug = (slug: string) => bySlug.get(slug);
export const lessonsOfIsland = (islandId: string) => catalogLessons.filter(l => l.islandId === islandId);
/** Whether a lesson can be opened and learned: only lessons whose content is complete. */
export const isLearnable = (id: string) => byId.get(id)?.lessonStatus === 'complete';
export const lessonHref = (id: string) => byId.get(id)?.href;
export const catalogCounts = () => ({
  total: catalogLessons.length,
  complete: catalogLessons.filter(l => l.lessonStatus === 'complete').length,
  planned: catalogLessons.filter(l => l.lessonStatus === 'planned').length,
});

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The catalog's own rules: unique slugs across all 320 (one /curriculum/[slug] namespace), prerequisites and
 * recommendations that exist and do not overlap, no cycle through either kind, and a page only for complete lessons.
 */
export function validateCatalog(list: readonly CatalogLesson[]): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  const ids = new Map(list.map(l => [l.lessonId as string, l]));
  const slugs = new Set<string>();
  for (const lesson of list) {
    const at = lesson.lessonId;
    if (!parseLessonId(at)) fail(at, 'not a lesson ID');
    if (!SLUG.test(lesson.slug)) fail(at, `slug ${lesson.slug} is not kebab-case`);
    if (slugs.has(lesson.slug)) fail(at, `duplicate slug ${lesson.slug}`);
    slugs.add(lesson.slug);
    if (!lesson.title.trim()) fail(at, 'empty title');
    if (!DIFFICULTIES.includes(lesson.difficulty)) fail(at, `unknown difficulty ${lesson.difficulty}`);
    for (const id of [...lesson.prerequisites, ...lesson.recommended]) {
      if (!ids.has(id)) fail(at, `unknown lesson ${id}`);
      if (id === at) fail(at, 'refers to itself');
    }
    if (lesson.recommended.some(id => lesson.prerequisites.includes(id))) fail(at, 'a lesson is both required and recommended');
    if (lesson.lessonStatus === 'complete' ? lesson.href !== `/curriculum/${lesson.slug}` : lesson.href !== undefined)
      fail(at, lesson.lessonStatus === 'complete' ? 'a complete lesson links to its page' : 'a planned lesson has no page');
  }
  // Depth-first search over required and recommended edges; a grey node met again is a cycle.
  const state = new Map<string, 'grey' | 'black'>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 'black') return;
    if (state.get(id) === 'grey') { fail(id, `prerequisite cycle ${[...path.slice(path.indexOf(id)), id].join(' → ')}`); return; }
    state.set(id, 'grey');
    const lesson = ids.get(id);
    for (const next of lesson ? [...lesson.prerequisites, ...lesson.recommended] : []) visit(next, [...path, id]);
    state.set(id, 'black');
  };
  for (const lesson of list) visit(lesson.lessonId, []);
  return problems;
}
