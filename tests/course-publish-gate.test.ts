import { describe, expect, it } from 'vitest';
import { curriculum } from '@/content/curriculum';
import type { LessonContent, LessonMeta } from '@/content/curriculum/schema';
import { publishProblems } from '@/lib/curriculum/publish-gate';

/*
 * 2026-11-20 (course production): the publish gate. Every published lesson passes it, and each rule it adds to the
 * curriculum validator stops a lesson that breaks it. See docs/curriculum/COURSE_CONTENT_SPECIFICATION.md §6.
 */
const published = curriculum.lessons.filter(l => l.lessonStatus === 'complete');

describe('publish gate', () => {
  it('passes every published lesson', () => {
    expect(published.length).toBeGreaterThanOrEqual(80);
    expect(published.flatMap(l => publishProblems(l, curriculum.contents[l.lessonId]))).toEqual([]);
  });

  // A good lesson to break: F05, one rule at a time.
  const meta = published.find(l => l.lessonId === 'F05')!, content = curriculum.contents.F05!;
  const broken = (m: Partial<LessonMeta>, c: (c: LessonContent) => LessonContent) => publishProblems({ ...meta, ...m }, c(structuredClone(content)));

  it('stops a lesson without content, or with too few objectives', () => {
    expect(publishProblems(meta, undefined)).toEqual(['F05: no content']);
    expect(broken({ learningObjectives: meta.learningObjectives.slice(0, 2) }, c => c)).toContain('F05: only 2 objectives');
  });

  it('stops placeholder text anywhere: TODO, FIXME, lorem ipsum, 待補', () => {
    for (const mark of ['TODO: write this', 'FIXME later', 'Lorem ipsum dolor', '此段待補'])
      expect(broken({}, c => { c.sections[0].blocks.push({ type: 'paragraph', text: mark } as never); return c; }).join(), mark).toMatch(/placeholder text/);
    // A lesson's own words are not placeholders: a to-do list variable, a SQL parameter placeholder.
    expect(broken({}, c => { c.sections[0].blocks.push({ type: 'paragraph', text: '把 todo 清單存進陣列；參數化查詢用 placeholder ? 代入值。' } as never); return c; })).toEqual([]);
  });

  it('stops an empty section, too few examples or quiz questions, and an exercise without tests', () => {
    expect(broken({}, c => { c.sections.push({ id: 'empty', title: '空白段落', blocks: [{ type: 'paragraph', text: '很短。' }] } as never); return c; }).join()).toMatch(/section .* characters/);
    expect(broken({}, c => { c.examples = c.examples.slice(0, 2); return c; })).toContain('F05: 2 examples');
    expect(broken({}, c => { c.quiz = c.quiz.slice(0, 3); return c; })).toContain('F05: 3 quiz questions');
    expect(broken({}, c => { c.exercises[0].tests = []; return c; }).join()).toMatch(/no test case/);
  });

  it('stops a quiz question whose answer is not an option, has twin options or is not explained', () => {
    const id = content.quiz[0].id;
    expect(broken({}, c => { c.quiz[0].answer = c.quiz[0].options.length; return c; })).toContain(`F05: ${id}: the answer is not one of the options`);
    expect(broken({}, c => { c.quiz[0].options[1] = c.quiz[0].options[0]; return c; })).toContain(`F05: ${id}: two options are the same`);
    expect(broken({}, c => { c.quiz[0].explanation = '答案是 B。'; return c; })).toContain(`F05: ${id}: the explanation does not explain`);
  });

  it('stops a visualization or activity that does not exist', () => {
    expect(broken({ visualizationType: 'heap' as never }, c => c)).toEqual([]);
    expect(broken({ visualizationType: 'no-such' as never }, c => c)).toContain('F05: visualization no-such is not implemented');
    expect(broken({ activity: 'type-checker' as never }, c => c)).toContain('F05: activity type-checker does not exist');
  });

  it('stops content that is not about the lesson\'s concepts', () => {
    expect(broken({ concepts: ['TCP 三向交握', '封包路由', 'DNS 查詢', 'HTTP 狀態碼'] }, c => c).join()).toMatch(/names 0 of its 4 concepts/);
  });
});
