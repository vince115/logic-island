import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
import { validateContent } from '@/content/curriculum/schema';

/*
 * SRV-5: replaying every terminal lesson takes about a second locally and several times that on CI, and every test file
 * that validates the whole curriculum runs in its own worker, so its first whole-curriculum check paid for all of it in
 * one test. Each such file calls this first: one test per terminal lesson validates it (the same check, lesson by lesson),
 * and schema.ts remembers each replay per content object, so the whole-curriculum checks after it reuse the results.
 */
export function validateTerminalLessonsFirst() {
  const terminal = lessons.filter(l => curriculum.contents[l.lessonId]?.terminal);
  describe('each terminal lesson, validated on its own first', () => {
    it.each(terminal.map(l => [l.lessonId, l] as const))('%s', (_, lesson) => {
      expect(validateContent(lesson, curriculum.contents[lesson.lessonId]!, curriculum.visualizations)).toEqual([]);
    });
  });
}
