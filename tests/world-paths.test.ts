import { describe, expect, it } from 'vitest';
import { courses } from '../src/content/courses';
import { lessons } from '../src/content/curriculum/lessons';
import { visualizations } from '../src/content/curriculum/registry';
import { worldIslands } from '../src/content/world';
import { activities, activitiesOfIsland, getActivity, validateActivities, type ActivityMeta } from '../src/content/world/activities';
import { catalogLessons, getCatalogLesson, isLearnable } from '../src/content/world/catalog';
import { parseLessonId } from '../src/content/world/lesson-id';
import { getLearningPath, learningPaths, pathProgress, pathsWithLesson, validatePaths, type LearningPath } from '../src/content/world/paths';

// Phase F.0: the six learning paths (src/content/world/paths.ts) and the activity registry (activities.ts).
const islandIds = worldIslands.map(i => i.id);
const path = (id: string) => getLearningPath(id)!;
const prefix = (id: string) => parseLessonId(id)?.prefix;

describe('learning paths (F.0)', () => {
  it('has ten valid paths, in the planning order (J: AI 架構, multi-archipelago v2; K, L, M: P6)', () => {
    expect(validatePaths(learningPaths)).toEqual([]);
    expect(learningPaths.map(p => p.id[0])).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'J', 'K', 'L', 'M']);
    expect(learningPaths.map(p => p.lessons.length)).toEqual([60, 86, 54, 84, 142, 89, 66, 62, 60, 48]);
    for (const p of learningPaths) expect(p.description, p.id).not.toBe('');
  });

  it('builds path J (AI 架構) from MCP, guardrails, evaluation and operations, without Machine Learning or Deep Learning', () => {
    const j = path('J-ai-architecture');
    for (const id of ['AG12', 'AG13', 'AG17', 'AG18', 'AG24', 'OPS03', 'OPS17', 'LLM20', 'LLM24']) expect(j.targets).toContain(id);
    expect(j.lessons.filter(id => /^(ML|DL)\d/.test(id))).toEqual([]);
    expect(j.completion.learnable).toBe(false);
  });

  it('routes the three systems paths from their regions into sys, with existing lessons only (P6)', () => {
    const prefixes = (id: string) => new Set(path(id).lessons.map(l => parseLessonId(l)!.prefix));
    expect([...prefixes('K-fullstack-deployment')]).toEqual(expect.arrayContaining(['FE', 'DB', 'DKR', 'LNX', 'SRV', 'CICD', 'CLD']));
    expect([...prefixes('L-ai-infrastructure')]).toEqual(expect.arrayContaining(['LLM', 'OPS', 'DKR', 'CLD', 'CICD', 'KUB']));
    expect([...prefixes('M-cloud-devops-foundations')]).toEqual(expect.arrayContaining(['CN', 'LNX', 'SRV', 'DKR', 'CLD', 'CICD', 'KUB']));
    expect(path('L-ai-infrastructure').targets).toContain('OPS07');
    expect(path('M-cloud-devops-foundations').gaps).toContain('作業系統原理（行程、排程、記憶體管理）');
  });

  it('keeps path A to the 60 complete lessons, the only path a learner can take today', () => {
    expect(path('A-apcs-cs-foundations').completion).toEqual({ lessonCount: 60, completeLessons: 60, plannedLessons: 0, learnable: true, rule: 'all-lessons' });
    for (const p of learningPaths.slice(1)) expect(p.completion.learnable, p.id).toBe(false);
  });

  it('counts the written database lessons as available on every path that has them, and the rest as planned (F.1a)', () => {
    const open = new Set(catalogLessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId as string));
    for (const p of learningPaths) {
      expect(p.completion.completeLessons, p.id).toBe(p.lessons.filter(id => open.has(id)).length);
      expect(p.completion.plannedLessons, p.id).toBe(p.lessons.length - p.completion.completeLessons);
    }
    for (const id of ['B-software-engineering', 'C-network-and-systems', 'D-enterprise-information-systems']) {
      const db = path(id).lessons.filter(l => prefix(l) === 'DB');
      expect(db.filter(l => open.has(l)), id).toEqual(db.filter(l => isLearnable(l)));
      // F.1d: once a database lesson is written it is open on every path (the island ends with DB20 written, none planned).
      expect(db.filter(l => !open.has(l)), `${id} planned DB lessons`).toEqual(db.filter(l => getCatalogLesson(l)?.lessonStatus === 'planned'));
    }
  });

  it('lists recommended lessons beside a path, never on it', () => {
    const b = path('B-software-engineering');
    expect(b.recommendedPrerequisites).toHaveLength(13);
    for (const p of learningPaths) for (const id of p.recommendedPrerequisites) expect(p.lessons, `${p.id} ${id}`).not.toContain(id);
    expect(b.requiredPrerequisites).toHaveLength(86 - 60);
    expect(b.gaps).toEqual(['operating-systems', 'cloud-platforms', 'software-engineering-practice']);
  });

  it('does not make Machine Learning or Deep Learning required for AI Application Engineering (path F)', () => {
    const f = path('F-ai-application-engineering');
    expect(f.lessons.filter(id => prefix(id) === 'ML' || prefix(id) === 'DL')).toEqual([]);
    // Each lesson's whole chain of required prerequisites stays clear of ML and DL…
    for (const id of f.lessons) {
      const chain = new Set<string>(), stack = [id as string];
      while (stack.length) { const x = stack.pop()!; if (chain.has(x)) continue; chain.add(x); stack.push(...getCatalogLesson(x)!.prerequisites); }
      expect([...chain].filter(x => prefix(x) === 'ML' || prefix(x) === 'DL'), id).toEqual([]);
    }
    // …while the LLM concepts it needs (tokenization, embeddings) are on it, and DL lessons are only recommended.
    expect(f.lessons).toEqual(expect.arrayContaining(['LLM02', 'LLM03']));
    expect(f.recommendedPrerequisites).toEqual(expect.arrayContaining(['DL01']));
    // Path E (AI research) does go through ML and DL.
    expect(path('E-ai-research').lessons.filter(id => prefix(id) === 'ML' || prefix(id) === 'DL')).toHaveLength(50);
  });

  it('catches a recommended lesson added to a path, a missing prerequisite, a wrong order and ML on path F', () => {
    const edit = (id: string, change: (p: LearningPath) => LearningPath) => learningPaths.map(p => p.id === id ? change(structuredClone(p)) : p);
    expect(validatePaths(edit('B-software-engineering', p => ({ ...p, lessons: [...p.lessons, p.recommendedPrerequisites[0]] }))).join('\n'))
      .toMatch(/neither a target nor required by one/);
    expect(validatePaths(edit('B-software-engineering', p => ({ ...p, lessons: p.lessons.filter(id => id !== 'F13') }))).join('\n'))
      .toMatch(/requires F13, which is not on the path/);
    expect(validatePaths(edit('A-apcs-cs-foundations', p => ({ ...p, lessons: [...p.lessons].reverse() }))).join('\n'))
      .toMatch(/comes before its prerequisite/);
    expect(validatePaths(edit('F-ai-application-engineering', p => ({ ...p, targets: [...p.targets, 'ML01'], lessons: [...p.lessons, 'ML01'] }))).join('\n'))
      .toMatch(/ML01: the AI application path must not require Machine Learning or Deep Learning/);
  });

  it('answers which paths a lesson is on and how far a learner is, without storing progress', () => {
    expect(pathsWithLesson('F01').map(p => p.id[0])).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'J', 'K', 'L', 'M']);
    expect(pathsWithLesson('LNX01').map(p => p.id[0])).toEqual(['K', 'L', 'M']);
    expect(pathsWithLesson('AG25').map(p => p.id[0])).toEqual(['F']);
    expect(pathsWithLesson('AG12').map(p => p.id[0])).toEqual(['F', 'J']);
    const done = new Set(['F01', 'F02']);
    expect(pathProgress(path('A-apcs-cs-foundations'), id => done.has(id))).toEqual({ completed: 2, total: 60, done: false });
  });
});

describe('activity registry (F.0)', () => {
  it('passes every rule', () => {
    expect(validateActivities(activities, islandIds)).toEqual([]);
  });

  it('holds the 20 visualizations and 6 labs as implemented, and every other activity of the plan as an activity', () => {
    const of = (type: ActivityMeta['type']) => activities.filter(a => a.type === type);
    expect(of('visualization').map(a => a.id)).toEqual(Object.keys(visualizations).filter(k => k !== 'none'));
    expect(of('visualization').every(a => a.tier === 'T0' && a.availability === 'implemented')).toBe(true);
    expect(of('lab').map(a => a.id)).toEqual(courses.map(c => `lab:${c.slug}`));
    expect(of('lab').every(a => a.availability === 'implemented' && a.subjects[0] === 'labs')).toBe(true);
    // One entry per activity the lessons name that is not an existing visualization (61 for the CS and AI plan).
    const named = new Set(catalogLessons.map(l => l.activity).filter(id => id !== 'none' && !(id in visualizations)));
    expect(of('activity').map(a => a.id).sort()).toEqual([...named].sort());
    // Phase F.1a: the SQL playground is implemented (the written database lessons use it); F.1b adds the ER builder and
    // the normalization steps once a written lesson uses them; the rest stay planned.
    const used = new Set(lessons.filter(l => l.lessonStatus === 'complete' && l.activity).map(l => l.activity!));
    // Multi-archipelago v2 (P4): color-contrast is implemented by its standalone lab (/learn/color-contrast).
    expect(of('activity').filter(a => a.availability === 'implemented').map(a => a.id)).toEqual(['architecture-diagram', 'color-contrast', 'erd-builder', 'normalization-steps', 'protocol-sequence', 'query-plan', 'sql-playground', 'transaction-timeline'].filter(id => id === 'color-contrast' || used.has(id as 'sql-playground')));
    expect(getActivity('color-contrast')).toMatchObject({ lab: 'color-contrast', version: '1.0.0', subjects: ['labs', 'ui-design'] });
    expect(used.has('sql-playground')).toBe(true);
    expect(of('activity').every(a => a.subjects.length > 0)).toBe(true);
    // The existing visualization statuses are untouched.
    expect(Object.values(visualizations).filter(v => v.status === 'implemented')).toHaveLength(20);
  });

  it('assigns tiers as planned: one sandbox (SQL), precomputed model outputs, nothing that needs a backend', () => {
    const tiers = (tier: string) => activities.filter(a => a.type === 'activity' && a.tier === tier).map(a => a.id);
    // F.1c: query plans are the learner's SQL run in the same sandbox, so query-plan is T2 too.
    expect(tiers('T2')).toEqual(['protocol-sequence', 'query-plan', 'sql-playground']);
    expect(tiers('T3').sort()).toEqual(['diffusion-steps', 'embedding-space', 'eval-dashboard', 'latent-space', 'multimodal-pipeline', 'prompt-lab', 'rag-explorer', 'training-curves']);
    expect(tiers('T4')).toEqual([]);
    expect(getActivity('sql-playground')).toMatchObject({ runtime: 'browser-sandbox', inputs: ['sql'], subjects: ['databases', 'information-systems'], availability: 'implemented', version: '1.0.0' });
    expect(activitiesOfIsland('databases').map(a => a.id)).toContain('sql-playground');
  });

  it('derives inputs and subjects from the lessons', () => {
    expect(getActivity('stack-queue')?.inputs).toEqual(['preset', 'custom-values']);
    expect(getActivity('variable-state')?.subjects).toEqual(expect.arrayContaining(['foundations', 'programming-languages']));
    expect(getActivity('lab:bfs')?.subjects).toEqual(expect.arrayContaining(['labs', 'algorithms']));
  });

  it('catches a wrong runtime, a backend activity and an unknown island', () => {
    const edit = (id: string, change: Partial<ActivityMeta>) => activities.map(a => a.id === id ? { ...a, ...change } : a);
    expect(validateActivities(edit('sql-playground', { runtime: 'browser' }), islandIds).join('\n')).toMatch(/tier T2 runs on browser-sandbox/);
    expect(validateActivities(edit('prompt-lab', { tier: 'T4', runtime: 'server' }), islandIds).join('\n')).toMatch(/prompt-lab: T4 needs a backend/);
    expect(validateActivities(edit('heap', { subjects: ['nowhere'] }), islandIds).join('\n')).toMatch(/heap: unknown island nowhere/);
  });
});
