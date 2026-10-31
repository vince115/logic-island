import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { curriculum, lessons } from '../src/content/curriculum';
import { branchTaken, validateCurriculum, type Curriculum, type LessonMeta } from '../src/content/curriculum/schema';

// Phase E.1: the 60-lesson curriculum and the rules every lesson keeps (src/content/curriculum/schema.ts).
const clone = (): Curriculum => structuredClone(curriculum);
/** Complete so far: E.1 wrote F01..F05, E.2 the rest of the foundations island. */
const COMPLETE = Array.from({ length: 10 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`);
const lesson = (c: Curriculum, id: string) => c.lessons.find(l => l.lessonId === id) as LessonMeta;

describe('curriculum (E.1)', () => {
  it('passes every rule', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });

  it('has exactly 60 lessons, 20 per island, with unique IDs and slugs', () => {
    expect(lessons).toHaveLength(60);
    for (const island of ['foundations', 'structures', 'algorithms']) expect(lessons.filter(l => l.islandId === island), island).toHaveLength(20);
    expect(new Set(lessons.map(l => l.lessonId)).size).toBe(60);
    expect(new Set(lessons.map(l => l.slug)).size).toBe(60);
  });

  it('marks exactly the written lessons complete, the rest planned outlines with real objectives', () => {
    expect(lessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)).toEqual(COMPLETE);
    for (const l of lessons.filter(l => l.lessonStatus === 'planned')) {
      expect(l.version, l.lessonId).toBe('0.1.0');
      expect(l.learningObjectives.length, l.lessonId).toBeGreaterThanOrEqual(3);
      expect(l.summary.length, l.lessonId).toBeGreaterThan(15);
    }
  });

  it('every lesson supports C++, Python and Java', () => {
    for (const l of lessons) expect([...l.supportedLanguages].sort(), l.lessonId).toEqual(['C++', 'Java', 'Python']);
  });

  it('every lesson can be reached: prerequisites exist and come earlier, so there is no cycle', () => {
    const done = new Set<string>();
    for (const l of lessons) {
      for (const p of l.prerequisites) expect(done.has(p), `${l.lessonId} needs ${p}`).toBe(true);
      done.add(l.lessonId);
    }
  });

  it('complete lessons use only implemented visualizations; the six labs are linked from their lessons', () => {
    for (const l of lessons.filter(l => l.lessonStatus === 'complete')) expect(curriculum.visualizations[l.visualizationType].status, l.lessonId).toBe('implemented');
    expect(lessons.flatMap(l => l.labs ?? []).sort()).toEqual(['array', 'array', 'bfs', 'binary-search', 'bubble-sort', 'queue', 'stack']);
  });

  it('the curriculum document lists every lesson', () => {
    const doc = readFileSync('docs/curriculum/PHASE_E_CURRICULUM.md', 'utf8');
    for (const l of lessons) expect(doc, l.lessonId).toContain(`| ${l.lessonId} |`);
  });
});

describe('curriculum validator (E.1)', () => {
  it('catches a cycle and a prerequisite that comes later', () => {
    const c = clone();
    lesson(c, 'F02').prerequisites = ['F03'];
    expect(validateCurriculum(c)).toContain('F02: prerequisite F03 does not come earlier');
  });

  it('catches duplicate IDs and slugs, and unknown references', () => {
    const c = clone();
    lesson(c, 'F07').slug = 'conditionals';
    lesson(c, 'F08').prerequisites = ['F99' as never];
    lesson(c, 'D05').labs = ['heap' as never];
    lesson(c, 'D06').visualizationType = 'hologram' as never;
    const problems = validateCurriculum(c);
    expect(problems).toEqual(expect.arrayContaining(['F07: duplicate slug conditionals', 'F08: unknown prerequisite F99', 'D05: unknown lab heap', 'D06: unknown visualization hologram']));
  });

  it('catches a lesson that claims to be complete without content, and planned lessons with content', () => {
    const c = clone();
    lesson(c, 'D01').lessonStatus = 'complete';
    c.contents.D02 = c.contents.F01;
    const problems = validateCurriculum(c);
    expect(problems).toEqual(expect.arrayContaining(['D01: complete lesson has no content', 'D02: planned lesson has content (mark it complete or remove it)']));
  });

  it('catches missing languages, a thin quiz, an unknown example and an exercise without tests', () => {
    const c = clone();
    const content = c.contents.F02!;
    content.examples[0].code.Java = '';
    content.quiz = content.quiz.slice(0, 2);
    content.sections[0].blocks.push({ type: 'example', id: 'nope' });
    content.exercises[0].tests = content.exercises[0].tests.filter(t => t.kind !== 'edge');
    content.exercises[0].errorPolicy = undefined;
    expect(validateCurriculum(c)).toEqual(expect.arrayContaining([
      'F02: example declare is missing a language', 'F02: needs at least 4 quiz questions', 'F02: section variables shows unknown example nope',
      'F02: exercise e1 has no edge test', 'F02: exercise e1 needs an error test or an errorPolicy',
    ]));
  });

  it('catches a lesson that is not one of the three languages, or an APCS label that cannot stand with others', () => {
    const c = clone();
    lesson(c, 'A01').supportedLanguages = ['C++', 'Python'];
    lesson(c, 'A02').apcsRelevance = ['none', 'concept'];
    expect(validateCurriculum(c)).toEqual(expect.arrayContaining(['A01: supportedLanguages must be C++, Python, Java', "A02: apcsRelevance 'none' must stand alone"]));
  });

  it('a complete lesson cannot use a planned visualization', () => {
    const c = clone();
    lesson(c, 'F05').visualizationType = 'sorting-steps';
    expect(validateCurriculum(c)).toContain('F05: complete lesson uses visualization sorting-steps, which is not implemented');
  });
});

describe('conditional branch (E.1)', () => {
  const viz = curriculum.contents.F05!.visualization;
  if (viz?.kind !== 'conditional-branch') throw new Error('F05 has a conditional-branch visualization');
  const result = (score: number) => viz.branches.find(b => branchTaken(score, b))?.result ?? viz.otherwise;
  it('takes the first branch that holds, the same as the reference solution', () => {
    expect([-1, 0, 59, 60, 69, 70, 79, 80, 89, 90, 100, 101].map(result)).toEqual(['Invalid', 'F', 'F', 'D', 'D', 'C', 'C', 'B', 'B', 'A', 'A', 'Invalid']);
  });
});
