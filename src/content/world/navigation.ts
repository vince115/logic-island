import { getCatalogLesson, lessonsOfIsland, type CatalogLesson } from './catalog';
import { getIsland, islandOfLesson } from './index';
import { pathsWithLesson } from './paths';

/*
 * Phase F.1b lesson navigation. "上一堂" and "下一堂" stay inside one island: a lesson's next lesson is the next one of
 * the same subject, never the first lesson of another island. A next lesson that is only planned is named without a
 * link. Moving on to another island goes through what says so: the learning paths that hold the lesson, the island's
 * bridges, and the catalog. Everything is read from the registries (catalog, islands, paths); no ID range is written
 * here or in the page.
 */

export interface PathStep { id: string; title: string; open: number; total: number; next?: CatalogLesson; /** The lesson ends the path. */ last: boolean }
export interface LessonNavigation {
  previous?: CatalogLesson;
  /** The next lesson of the island, if it can be opened. */
  next?: CatalogLesson;
  /** The next lesson of the island when it is only planned (no page, no link). */
  plannedNext?: CatalogLesson;
  /** No lesson of this island can be opened after this one. */
  islandEnd: boolean;
  /** Every lesson of the island is written. */
  islandComplete: boolean;
  /** The learning paths with this lesson, and the next open lesson after it on each (it may be on another island). */
  paths: PathStep[];
  /** Islands this island's bridges lead to that can be entered. */
  bridges: { id: string; name: string; href: string }[];
}

export function lessonNavigation(lessonId: string): LessonNavigation {
  const lesson = getCatalogLesson(lessonId);
  if (!lesson) throw new Error(`unknown lesson ${lessonId}`);
  const island = lessonsOfIsland(lesson.islandId), at = island.indexOf(lesson);
  const before = island[at - 1], after = island[at + 1];
  const open = (l?: CatalogLesson) => l?.lessonStatus === 'complete' ? l : undefined;
  const config = islandOfLesson(lessonId);
  return {
    previous: open(before),
    next: open(after),
    plannedNext: after && !open(after) ? after : undefined,
    islandEnd: !open(after),
    islandComplete: island.every(l => l.lessonStatus === 'complete'),
    paths: pathsWithLesson(lessonId).map(path => {
      const rest = path.lessons.slice(path.lessons.indexOf(lesson.lessonId) + 1);
      return { id: path.id, title: path.title, open: path.completion.completeLessons, total: path.completion.lessonCount, last: !rest.length,
        next: rest.map(id => getCatalogLesson(id)).find(l => l?.lessonStatus === 'complete') };
    }),
    bridges: (config?.links ?? []).filter(link => link.kind === 'bridge').flatMap(link => {
      const target = getIsland(link.to), href = target?.entryPoints[0]?.target;
      return target && href ? [{ id: target.id, name: target.name, href }] : [];
    }),
  };
}
