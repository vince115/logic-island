import { lessons } from '@/content/curriculum/lessons';
import { activities } from '@/content/world/activities';
import { worldIslands } from '@/content/world/islands';
import { REGION_IDS } from '@/content/world/types';
import { algorithmIds } from '@/lib/engine';
import type { TrialContext } from './schema';

/*
 * What the trial bank is checked against: the rest of the site (complete lessons, labs, world activities, islands and
 * regions). Only validation needs it — the tests and the import CLI, never a page. T.1.1 moved it out of ./index:
 * world activities import the whole curriculum (about 0.9 s), which every importer of the bank used to load.
 */
export const trialContext = (): TrialContext => ({
  completeLessonIds: new Set(lessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)),
  labIds: new Set<string>(algorithmIds),
  activityIds: new Set(activities.map(a => a.id)),
  islandIds: new Set(worldIslands.map(i => i.id)),
  regionIds: new Set<string>(REGION_IDS),
});
