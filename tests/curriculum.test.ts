import planning from '../src/content/world/planning-data.json';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { curriculum, lessons } from '../src/content/curriculum';
import { UNITS } from '../src/content/curriculum/units';
import { DATABASE_VISUALIZATIONS, branchTaken, hasCapability, validateContent, validateCurriculum, type Curriculum, type LessonMeta, type VisualizationConfig } from '../src/content/curriculum/schema';

// Phase E.1: the 60-lesson curriculum and the rules every lesson keeps (src/content/curriculum/schema.ts).
const clone = (): Curriculum => structuredClone(curriculum);
/** Complete so far: E.1 wrote F01..F05, E.2 the rest of the foundations island, E.3 the structures island, E.4 the algorithms island. */
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
const ALGORITHMS_DONE = 20;
/** Phase F.1a: the database island's written lessons (the rest of its 20 are planned in src/content/world). */
const DATABASES_DONE = lessons.filter(l => l.islandId === 'databases').length;
const COMPLETE = [...ids('F', 20), ...ids('D', 20), ...ids('A', ALGORITHMS_DONE), ...ids('DB', DATABASES_DONE)];
// F.1b: lessons are told apart by the capabilities they declare, never by a missing field.
const programLessons = lessons.filter(l => hasCapability(l, 'program-code'));
type TraceConfig = Extract<VisualizationConfig, { steps: unknown }>;
const lesson = (c: Curriculum, id: string) => c.lessons.find(l => l.lessonId === id) as LessonMeta;

describe('curriculum (E.1)', () => {
  it('passes every rule', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });

  it('has the 60 lessons of F, D and A (20 each) and the written database lessons, with unique IDs and slugs', () => {
    for (const island of ['foundations', 'structures', 'algorithms']) expect(lessons.filter(l => l.islandId === island), island).toHaveLength(20);
    expect(programLessons).toHaveLength(60);
    expect(DATABASES_DONE).toBeGreaterThan(0);
    expect(lessons.filter(l => l.islandId === 'databases').map(l => l.lessonId)).toEqual(ids('DB', DATABASES_DONE));
    expect(lessons).toHaveLength(60 + DATABASES_DONE);
    expect(new Set(lessons.map(l => l.lessonId)).size).toBe(lessons.length);
    expect(new Set(lessons.map(l => l.slug)).size).toBe(lessons.length);
  });

  it('marks exactly the written lessons complete, the rest planned outlines with real objectives', () => {
    expect(lessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)).toEqual(COMPLETE);
    for (const l of lessons.filter(l => l.lessonStatus === 'planned')) {
      expect(l.version, l.lessonId).toBe('0.1.0');
      expect(l.learningObjectives.length, l.lessonId).toBeGreaterThanOrEqual(3);
      expect(l.summary.length, l.lessonId).toBeGreaterThan(15);
    }
  });

  it('every program lesson supports C++, Java and Python, and may add JavaScript after them (2026-11-02)', () => {
    for (const l of programLessons) expect([['C++', 'Java', 'Python'], ['C++', 'Java', 'Python', 'JavaScript']], l.lessonId).toContainEqual(l.supportedLanguages);
  });

  it('capabilities (F.1b): F, D and A are program-code; database lessons declare what they use; the blueprint\'s activity fits', () => {
    const blueprint = new Map(planning.plannedLessons.map(l => [l.lessonId, l.activity]));
    expect(programLessons.map(l => l.lessonId)).toEqual(lessons.filter(l => l.islandId !== 'databases').map(l => l.lessonId));
    expect(programLessons).toHaveLength(60);
    for (const l of programLessons) expect([l.capabilities, l.activity, l.queryLanguage], l.lessonId).toEqual([['program-code'], undefined, undefined]);
    for (const l of lessons.filter(l => l.islandId === 'databases')) {
      expect(l, l.lessonId).toMatchObject({ supportedLanguages: [] });
      // F.1d: a blueprint activity that is a shared visualization (ds-comparison, challenge-stages) is the lesson's visualization.
      expect(l.visualizationType, l.lessonId).toBe((DATABASE_VISUALIZATIONS as readonly string[]).includes(l.activity!) ? l.activity : 'none');
      expect(l.capabilities, l.lessonId).not.toContain('program-code');
      expect(l.activity, l.lessonId).toBe(blueprint.get(l.lessonId));
      expect(l.queryLanguage === 'SQL', l.lessonId).toBe(hasCapability(l, 'sql'));
    }
    expect(Object.fromEntries(lessons.filter(l => l.islandId === 'databases' && l.lessonId >= 'DB08').map(l => [l.lessonId, l.capabilities])))
      .toEqual({ DB08: ['er-diagram'], DB09: ['sql', 'er-diagram'], DB10: ['sql', 'normalization'],
        DB11: ['sql', 'query-plan'], DB12: ['sql', 'query-plan'], DB13: ['sql'], DB14: ['sql', 'transaction-timeline'], DB15: ['sql', 'transaction-timeline'],
        DB16: ['sql', 'driver-code', 'protocol-sequence'], DB17: ['sql', 'driver-code'],
        DB18: ['sql', 'visualization'], DB19: ['sql', 'architecture-diagram'],
        DB20: ['sql', 'er-diagram', 'normalization', 'query-plan', 'driver-code', 'visualization'] });
  });

  it('DB08 (F.1b regression): an ER lesson without SQL is not a program lesson and needs no program code', () => {
    const db08 = lessons.find(l => l.lessonId === 'DB08')!, content = curriculum.contents.DB08!;
    expect(db08).toMatchObject({ slug: 'er-modeling', title: 'ER 模型', prerequisites: ['DB02'], recommended: ['DB07', 'D16'], activity: 'erd-builder',
      capabilities: ['er-diagram'], supportedLanguages: [], lessonStatus: 'complete' });
    expect(db08.queryLanguage).toBeUndefined();
    expect(programLessons).not.toContain(db08);
    expect([content.examples, content.exercises, content.sql]).toEqual([[], [], undefined]);
    expect(validateContent(db08, content, curriculum.visualizations)).toEqual([]);
    // Declaring program-code (or sql) for it is caught: the languages, SQL content and examples would be missing.
    const c = clone();
    lesson(c, 'DB08').capabilities = ['program-code'];
    expect(validateCurriculum(c).filter(p => p.startsWith('DB08'))).toEqual(expect.arrayContaining(['DB08: supportedLanguages must include C++, Java, Python', 'DB08: has er-diagram content without the er-diagram capability']));
    const d = clone();
    lesson(d, 'DB08').capabilities = ['sql', 'er-diagram'];
    expect(validateCurriculum(d)).toEqual(expect.arrayContaining(['DB08: a lesson is taught in SQL exactly when it has the sql capability', 'DB08: the sql capability needs its content']));
    // A program lesson declaring a database capability, or none at all, is caught too.
    const e = clone();
    lesson(e, 'F01').capabilities = ['program-code', 'sql'];
    lesson(e, 'F02').capabilities = [];
    expect(validateCurriculum(e)).toEqual(expect.arrayContaining(['F01: program-code stands alone', expect.stringMatching(/^F02: capabilities must be distinct values/)]));
  });

  it('every lesson can be reached: prerequisites exist and come earlier, so there is no cycle', () => {
    const done = new Set<string>();
    // F.1d: a prerequisite on an island the curriculum does not have yet (DB16 → PL02) is one of the catalog's planned lessons.
    const ours = new Set(lessons.map(l => l.lessonId.replace(/\d+$/, '')));
    const planned = new Set(planning.plannedLessons.map(l => l.lessonId));
    for (const l of lessons) {
      for (const p of l.prerequisites) expect(ours.has(p.replace(/\d+$/, '')) ? done.has(p) : planned.has(p), `${l.lessonId} needs ${p}`).toBe(true);
      done.add(l.lessonId);
    }
  });

  it('complete lessons use only implemented visualizations; the six labs are linked from their lessons', () => {
    for (const l of programLessons.filter(l => l.lessonStatus === 'complete')) expect(curriculum.visualizations[l.visualizationType].status, l.lessonId).toBe('implemented');
    expect(lessons.flatMap(l => l.labs ?? []).sort()).toEqual(['array', 'array', 'bfs', 'binary-search', 'bubble-sort', 'queue', 'stack']);
  });

  it('the curriculum documents list every lesson', () => {
    const doc = readFileSync('docs/curriculum/PHASE_E_CURRICULUM.md', 'utf8');
    for (const l of programLessons) expect(doc, l.lessonId).toContain(`| ${l.lessonId} |`);
    const db = readFileSync('docs/curriculum/DATABASE_ISLAND.md', 'utf8');
    for (const l of lessons.filter(l => l.islandId === 'databases')) expect(db, l.lessonId).toContain(`| ${l.lessonId} |`);
  });
});

describe('curriculum validator (E.1)', () => {
  it('accepts a recommended lesson of a planned island (F.1c: DB15 → PL14) but not an unknown one of a curriculum island', () => {
    const c = clone();
    lesson(c, 'DB05').recommended = ['PL14', 'DB02'];
    expect(validateCurriculum(c)).toEqual([]);
    lesson(c, 'DB05').recommended = ['DB99' as 'DB01'];
    expect(validateCurriculum(c)).toContain('DB05: unknown recommended lesson DB99');
    lesson(c, 'DB05').recommended = ['XX01' as 'DB01'];
    expect(validateCurriculum(c)).toContain('DB05: unknown recommended lesson XX01');
  });

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
    // Every lesson is complete since E.4: take one's content away and mark another planned while it keeps its content.
    lesson(c, 'A01').lessonStatus = 'complete';
    lesson(c, 'A01').version = '1.0.0';
    delete c.contents.A01;
    lesson(c, 'A02').lessonStatus = 'planned';
    lesson(c, 'A02').version = '0.1.0';
    c.contents.A02 = c.contents.F01;
    const problems = validateCurriculum(c);
    expect(problems).toEqual(expect.arrayContaining(['A01: complete lesson has no content', 'A02: planned lesson has content (mark it complete or remove it)']));
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
    expect(validateCurriculum(c)).toEqual(expect.arrayContaining(['A01: supportedLanguages must include C++, Java, Python', "A02: apcsRelevance 'none' must stand alone"]));
  });

  it('JavaScript (2026-11-02): a lesson that offers it needs it everywhere; one that does not, has none', () => {
    const c = clone();
    delete c.contents.F05!.examples[0].code.JavaScript;
    delete c.contents.F05!.exercises[0].solution.JavaScript;
    lesson(c, 'F06').supportedLanguages = ['C++', 'Java', 'Python'];
    c.contents.F06!.examples[0].code.JavaScript = 'console.log(1);';
    lesson(c, 'F07').supportedLanguages = ['C++', 'Java', 'Python', 'JavaScript', 'JavaScript'];
    expect(validateCurriculum(c)).toEqual(expect.arrayContaining([
      'F05: example pass is missing a language', 'F05: exercise e1 is missing a reference solution',
      `F06: example ${c.contents.F06!.examples[0].id} has code in a language the lesson does not offer`,
      'F07: supportedLanguages may add only JavaScript, once',
    ]));
  });

  it('catches inconsistent data-structure visualizations (E.3)', () => {
    const c = clone();
    const cmp = c.contents.D01!.visualization as Extract<VisualizationConfig, { kind: 'ds-comparison' }>;
    delete cmp.structures[0].costs[cmp.operations[0].id];
    const list = c.contents.D04!.visualization as TraceConfig;
    const step = list.steps.find(s => s.list?.nodes.length)!;
    step.list!.pointers = { cur: step.list!.nodes.length };
    const hash = c.contents.D10!.visualization as TraceConfig;
    hash.playground = { structure: 'hash-set', buckets: 40 };
    hash.steps = hash.steps.map(s => ({ ...s, buckets: undefined }));
    const problems = validateCurriculum(c);
    expect(problems).toEqual(expect.arrayContaining([
      `D01: ds-comparison: ${cmp.structures[0].name} has no cost for ${cmp.operations[0].id}`,
      `D04: step ${list.steps.indexOf(step) + 1} pointer cur is outside the list`,
      'D10: a hash-set playground needs 2–13 buckets', 'D10: hash-table trace never shows its panel',
    ]));
  });

  it('a complete lesson cannot use a planned visualization', () => {
    const c = clone();
    // Every type is implemented since E.4, so mark one planned in the copy.
    c.visualizations['sorting-steps'] = { ...c.visualizations['sorting-steps'], status: 'planned' };
    lesson(c, 'F05').visualizationType = 'sorting-steps';
    expect(validateCurriculum(c)).toContain('F05: complete lesson uses visualization sorting-steps, which is not implemented');
  });
});

describe('subject units (2026-11-01)', () => {
  it('each island\'s units hold every one of its lessons exactly once, in the recommended order', () => {
    for (const island of ['foundations', 'structures', 'algorithms', 'databases'] as const) {
      const own = lessons.filter(l => l.islandId === island).map(l => l.lessonId);
      const listed = UNITS[island].flatMap(u => u.lessonIds);
      expect([...listed].sort(), island).toEqual([...own].sort());
      expect(new Set(listed).size, island).toBe(listed.length);
      for (const unit of UNITS[island]) {
        // A unit of an island still being written (the database island) may be smaller for now.
        if (own.length === 20) expect(unit.lessonIds.length, unit.title).toBeGreaterThanOrEqual(3);
        expect(unit.lessonIds, unit.title).toEqual([...unit.lessonIds].sort());
      }
    }
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
