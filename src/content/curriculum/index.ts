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
import { D01 } from './content/D01';
import { D02 } from './content/D02';
import { D03 } from './content/D03';
import { D04 } from './content/D04';
import { D05 } from './content/D05';
import { D06 } from './content/D06';
import { D07 } from './content/D07';
import { D08 } from './content/D08';
import { D09 } from './content/D09';
import { D10 } from './content/D10';
import { D11 } from './content/D11';
import { D12 } from './content/D12';
import { D13 } from './content/D13';
import { D14 } from './content/D14';
import { D15 } from './content/D15';
import { D16 } from './content/D16';
import { D17 } from './content/D17';
import { D18 } from './content/D18';
import { D19 } from './content/D19';
import { D20 } from './content/D20';
import { A01 } from './content/A01';
import { A02 } from './content/A02';
import { A03 } from './content/A03';
import { A04 } from './content/A04';
import { A05 } from './content/A05';
import { A06 } from './content/A06';
import { A07 } from './content/A07';
import { A08 } from './content/A08';
import { A09 } from './content/A09';
import { A10 } from './content/A10';
import { A11 } from './content/A11';
import { A12 } from './content/A12';
import { A13 } from './content/A13';
import { A14 } from './content/A14';
import { A15 } from './content/A15';
import { lessons } from './lessons';
import { islands, visualizations } from './registry';
import type { Curriculum, LessonContent, LessonId, LessonMeta } from './schema';

/** The Phase E curriculum, as one value the validator and the pages both read. */
export const curriculum: Curriculum = {
  islands, lessons, visualizations, labs: algorithmIds,
  contents: { F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20,
    D01, D02, D03, D04, D05, D06, D07, D08, D09, D10,
    D11, D12, D13, D14, D15,
    D16, D17, D18, D19, D20,
    A01, A02, A03, A04, A05,
    A06, A07, A08, A09, A10,
    A11, A12, A13, A14, A15 },
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
