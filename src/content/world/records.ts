import { courses } from '@/content/courses';
import { islands as curriculumIslands } from '@/content/curriculum/registry';
import { activitiesOfIsland } from './activities';
import { catalogLessons, lessonsOfIsland } from './catalog';
import { getIsland, islandOfLesson, worldIslands } from './index';
import type { Condition, IslandConfig } from './types';
import type { WorldPages } from './validate';

/*
 * Phase F.0 read helpers: an island's static configuration together with what follows from the curriculum (its
 * lessons, the islands its lessons require, the activities they use), and unlock conditions evaluated against
 * progress supplied by the caller. Nothing here reads or writes storage.
 */

export interface IslandRecord extends IslandConfig {
  /** Islands whose lessons this island's lessons require, in world order (hints; islands are never locked). */
  prerequisites: string[];
  /** Activity IDs its lessons use (src/content/world/activities.ts). */
  activities: string[];
  counts: { lessons: number; complete: number; planned: number };
}

const worldOrder = new Map(worldIslands.map((i, n) => [i.id, n]));

export function islandRecord(island: IslandConfig): IslandRecord {
  const own = lessonsOfIsland(island.id);
  const required = new Set(own.flatMap(l => l.prerequisites).map(id => islandOfLesson(id)?.id).filter((id): id is string => !!id && id !== island.id));
  return {
    ...island,
    prerequisites: [...required].sort((a, b) => worldOrder.get(a)! - worldOrder.get(b)!),
    activities: activitiesOfIsland(island.id).map(a => a.id),
    counts: { lessons: own.length, complete: own.filter(l => l.lessonStatus === 'complete').length, planned: own.filter(l => l.lessonStatus === 'planned').length },
  };
}

export const islandRecords: IslandRecord[] = worldIslands.map(islandRecord);
export const getIslandRecord = (id: string) => islandRecords.find(r => r.id === id);

/** Every route an entry point may use: complete lesson pages, labs, the catalog and its island anchors. */
export function worldPages(): WorldPages {
  const routes = new Set<string>(['/curriculum', '/learn']);
  for (const lesson of catalogLessons) if (lesson.href) routes.add(lesson.href);
  for (const course of courses) routes.add(`/learn/${course.slug}`);
  for (const island of curriculumIslands) routes.add(`/curriculum#island-${island.id}`);
  return { routes, lessonIds: new Set(catalogLessons.map(l => l.lessonId)) };
}

/** What a condition is checked against: the learner's progress, supplied at runtime. */
export interface ProgressView { lessonCompleted(lessonId: string): boolean }

/** An island counts as completed when every one of its lessons is; a planned island never is. */
function islandCompleted(id: string, progress: ProgressView) {
  const island = getIsland(id), own = lessonsOfIsland(id);
  return !!island && island.status === 'complete' && own.length > 0 && own.every(l => progress.lessonCompleted(l.lessonId));
}

export function meetsCondition(condition: Condition, progress: ProgressView): boolean {
  if ('completedLessons' in condition) return condition.completedLessons.every(id => progress.lessonCompleted(id));
  if ('completedIslands' in condition) return condition.completedIslands.every(id => islandCompleted(id, progress));
  if ('all' in condition) return condition.all.every(c => meetsCondition(c, progress));
  return condition.any.some(c => meetsCondition(c, progress));
}

/** Islands without a rule are always open; subject islands never have one. */
export const isUnlocked = (island: IslandConfig, progress: ProgressView) => !island.unlock || meetsCondition(island.unlock, progress);
