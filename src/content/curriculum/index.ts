import { algorithmIds } from '@/lib/engine';
import { F01 } from './content/F01';
import { F02 } from './content/F02';
import { F03 } from './content/F03';
import { F04 } from './content/F04';
import { F05 } from './content/F05';
import { F06 } from './content/F06';
import { F07 } from './content/F07';
import { F08 } from './content/F08';
import { F09 } from './content/F09';
import { F10 } from './content/F10';
import { F11 } from './content/F11';
import { F12 } from './content/F12';
import { F13 } from './content/F13';
import { F14 } from './content/F14';
import { F15 } from './content/F15';
import { F16 } from './content/F16';
import { F17 } from './content/F17';
import { F18 } from './content/F18';
import { F19 } from './content/F19';
import { F20 } from './content/F20';
import { lessons } from './lessons';
import { islands, visualizations } from './registry';
import type { Curriculum, LessonContent, LessonId, LessonMeta } from './schema';

/** The Phase E curriculum, as one value the validator and the pages both read. */
export const curriculum: Curriculum = {
  islands, lessons, visualizations, labs: algorithmIds,
  contents: { F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20 },
};

export const getLessonBySlug = (slug: string) => lessons.find(l => l.slug === slug);
export const getLessonById = (id: string) => lessons.find(l => l.lessonId === id);
export const getContent = (id: LessonId): LessonContent | undefined => curriculum.contents[id];
/** The lessons before and after in the recommended order (across islands). */
export function neighbours(lesson: LessonMeta) {
  const index = lessons.indexOf(lesson);
  return { previous: lessons[index - 1], next: lessons[index + 1] };
}
export { islands, lessons, visualizations };
