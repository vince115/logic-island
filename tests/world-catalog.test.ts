import { describe, expect, it } from 'vitest';
import { curriculum, getLessonBySlug, lessons } from '../src/content/curriculum';
import { world } from '../src/content/world';
import { catalogCounts, catalogLessons, getCatalogLesson, getCatalogLessonBySlug, isLearnable, lessonHref, lessonsOfIsland, validateCatalog, type CatalogLesson } from '../src/content/world/catalog';
import { validateWorld } from '../src/content/world/validate';
import { BACKUP_KEY, PROGRESS_VERSION, STORAGE_KEY, parse } from '../src/lib/progress';
import { BLUEPRINT, readJson } from '../scripts/planning-data.mjs';

// Phase F.0: the lesson catalog (src/content/world/catalog.ts): 60 complete lessons from the curriculum, 260 planned
// ones as metadata only, and nothing about the existing lessons, pages or progress changed.
const mutate = (id: string, change: Partial<CatalogLesson>) => catalogLessons.map(l => l.lessonId === id ? { ...l, ...change } : l);

describe('lesson catalog (F.0)', () => {
  it('passes its own rules and the world rules', () => {
    expect(validateCatalog(catalogLessons)).toEqual([]);
    expect(validateWorld(world, catalogLessons)).toEqual([]);
  });

  it('knows every lesson of the plan: every curriculum lesson complete (60 + the written database lessons), the rest planned', () => {
    const declared = world.islands.reduce((n, i) => n + i.lessonCount, 0);
    expect(catalogCounts()).toEqual({ total: declared, complete: lessons.length, planned: declared - lessons.length });
    expect(lessonsOfIsland('databases').filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)).toEqual(lessons.filter(l => l.islandId === 'databases').map(l => l.lessonId));
    expect(catalogLessons.slice(0, 3).map(l => l.lessonId)).toEqual(['F01', 'F02', 'F03']);
    // Multi-archipelago v2: regions in order (cs, ai, design, web); the web region's last island ends the catalog.
    expect(catalogLessons.at(-1)?.lessonId).toBe('KUB15');
    expect(catalogLessons.findIndex(l => l.lessonId === 'OPS20')).toBeLessThan(catalogLessons.findIndex(l => l.lessonId === 'UI01'));
    expect(lessonsOfIsland('interaction-design')).toHaveLength(14);
    expect(getCatalogLesson('UI10')).toMatchObject({ islandId: 'ui-design', lessonStatus: 'planned', activity: 'color-contrast' });
    expect(getCatalogLesson('UI10')?.href).toBeUndefined();
    expect(lessonsOfIsland('machine-learning')).toHaveLength(25);
    expect(getCatalogLesson('DB01')).toMatchObject({ islandId: 'databases', lessonStatus: 'complete', href: '/curriculum/database-concepts', activity: 'sql-playground' });
    // F.1d: the database island is written to the end; DB19 keeps its blueprint gap (cloud platforms) once written.
    expect(getCatalogLesson('DB20')).toMatchObject({ islandId: 'databases', lessonStatus: 'complete', href: '/curriculum/database-applications-capstone', activity: 'challenge-stages' });
    expect(getCatalogLesson('DB19')?.gaps).toEqual(['cloud-platforms']);
    expect(getCatalogLesson('PL01')).toMatchObject({ islandId: 'programming-languages', lessonStatus: 'planned' });
    expect(getCatalogLesson('PL01')?.href).toBeUndefined();
    expect(getCatalogLesson('D01')).toMatchObject({ islandId: 'structures', lessonStatus: 'complete' });
  });

  it('keeps the 60 lessons exactly as the curriculum has them, which is also what the blueprint references', () => {
    const complete = catalogLessons.filter(l => l.lessonStatus === 'complete');
    expect(complete.map(l => l.lessonId)).toEqual(lessons.map(l => l.lessonId));
    for (const [i, lesson] of lessons.entries())
      expect(complete[i], lesson.lessonId).toMatchObject({ slug: lesson.slug, title: lesson.title, prerequisites: lesson.prerequisites, difficulty: lesson.difficulty, href: `/curriculum/${lesson.slug}` });
    const references = readJson(BLUEPRINT).lessons.filter((l: { status: string }) => l.status === 'complete');
    expect(references.map((l: { id: string; slug: string; titleZh: string; difficulty: string; prerequisites: string[] }) =>
      [l.id, l.slug, l.titleZh, l.difficulty, l.prerequisites.join()])).toEqual(lessons.filter(l => l.islandId !== 'databases').map(l => [l.lessonId, l.slug, l.title, l.difficulty, l.prerequisites.join()]));
  });

  it('publishes written lessons of a planned island exactly as the blueprint defines them (F.1a), without editing the blueprint', () => {
    type Entry = { id: string; slug: string; titleZh: string; difficulty: string; prerequisites: string[]; recommended: string[]; objectives: string[]; concepts: string[]; status: string };
    const blueprint = new Map<string, Entry>(readJson(BLUEPRINT).lessons.map((l: Entry) => [l.id, l]));
    for (const lesson of lessons.filter(l => l.islandId === 'databases')) {
      const b = blueprint.get(lesson.lessonId)!;
      // The blueprint keeps its planning status; the curriculum decides what is published.
      expect(b.status, lesson.lessonId).toBe('planned');
      expect({ slug: lesson.slug, title: lesson.title, difficulty: lesson.difficulty, prerequisites: lesson.prerequisites, recommended: lesson.recommended,
        objectives: lesson.learningObjectives, concepts: lesson.concepts }, lesson.lessonId)
        .toEqual({ slug: b.slug, title: b.titleZh, difficulty: b.difficulty, prerequisites: b.prerequisites, recommended: b.recommended, objectives: b.objectives, concepts: b.concepts });
      expect(getCatalogLesson(lesson.lessonId)?.recommended, lesson.lessonId).toEqual(b.recommended);
    }
  });

  it('gives planned lessons no page, no content and no way to be learned', () => {
    for (const lesson of catalogLessons.filter(l => l.lessonStatus === 'planned')) {
      expect(lesson.href, lesson.lessonId).toBeUndefined();
      expect(lessonHref(lesson.lessonId)).toBeUndefined();
      expect(isLearnable(lesson.lessonId)).toBe(false);
      // /curriculum/[slug] builds pages from `lessons` only (dynamicParams = false), so a planned slug is a 404.
      expect(getLessonBySlug(lesson.slug), lesson.slug).toBeUndefined();
      expect(curriculum.contents).not.toHaveProperty(lesson.lessonId);
      expect(lesson.learningObjectives.length, lesson.lessonId).toBeGreaterThan(0);
    }
    expect(getCatalogLessonBySlug('programming-paradigms')).toMatchObject({ lessonId: 'PL01', lessonStatus: 'planned' });
    expect(isLearnable('F01')).toBe(true);
    expect(Object.keys(curriculum.contents)).toHaveLength(lessons.length);
  });

  it('keeps required and recommended prerequisites apart', () => {
    const pl01 = getCatalogLesson('PL01')!;
    expect(pl01.prerequisites).toEqual(['F13']);
    expect(pl01.recommended).toEqual(['F01', 'F16']);
    for (const lesson of catalogLessons.filter(l => l.lessonStatus === 'complete' && l.islandId !== 'databases')) expect(lesson.recommended).toEqual([]);
  });

  it('catches cycles, overlaps, unknown lessons and pages for planned lessons', () => {
    expect(validateCatalog(mutate('F01', { prerequisites: ['F02'] })).join('\n')).toMatch(/prerequisite cycle/);
    expect(validateCatalog(mutate('F01', { recommended: ['PL01'] })).join('\n')).toMatch(/prerequisite cycle/);
    expect(validateCatalog(mutate('PL01', { recommended: ['F13'] })).join('\n')).toMatch(/PL01: a lesson is both required and recommended/);
    // F.1b: the planned lesson comes from the registry (DB10 was planned until F.1b published it; F.1d wrote the whole
    // database island, so it is the first planned lesson of any island).
    const planned = catalogLessons.find(l => l.lessonStatus === 'planned')!, id = planned.lessonId;
    expect([planned.lessonStatus, planned.href, isLearnable(id)]).toEqual(['planned', undefined, false]);
    expect(validateCatalog(mutate(id, { prerequisites: ['DB99' as 'DB01'] })).join('\n')).toMatch(new RegExp(`${id}: unknown lesson DB99`));
    expect(validateCatalog(mutate(id, { href: '/curriculum/relational-model' })).join('\n')).toMatch(new RegExp(`${id}: a planned lesson has no page`));
    expect(validateCatalog(mutate(id, { slug: 'programs-and-algorithms' })).join('\n')).toMatch(/duplicate slug programs-and-algorithms/);
    // And the other direction: a published lesson must link to its page.
    expect(validateCatalog(mutate('DB10', { href: undefined })).join('\n')).toMatch(/DB10: a complete lesson links to its page/);
  });

  it('leaves learning progress as it was: same key, same version, existing records read back whole', () => {
    expect([STORAGE_KEY, BACKUP_KEY, PROGRESS_VERSION]).toEqual(['logic-island.progress', 'logic-island.progress.backup', 1]);
    const stored = { version: 1, lessons: { F01: { startedAt: '2026-10-31T10:00:00.000Z', readAt: '2026-10-31T10:05:00.000Z', quiz: { correct: 4, total: 4, at: '2026-10-31T10:06:00.000Z' }, completedAt: '2026-10-31T10:06:00.000Z' }, D05: { startedAt: '2026-11-01T09:00:00.000Z' } } };
    expect(parse(JSON.stringify(stored))).toEqual({ progress: stored, writable: true });
  });
});
