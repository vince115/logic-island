import { describe, expect, it } from 'vitest';
import { curriculum, getLessonBySlug, lessons } from '@/content/curriculum';
import { cicdFromBlueprint, DEVOPS_STAGES_BUILT, dockerFromBlueprint, KUB_SHAPES, KUBE_STAGES_BUILT, kubeFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, LESSON_ACTIVITIES, PREPARED_ISLAND_IDS, validateCurriculum, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { getActivity } from '@/content/world/activities';
import { lessonsOfIsland } from '@/content/world/catalog';
import planning from '@/content/world/planning-data.json';
import { validateTerminalLessonsFirst } from './support/terminal-replays';

/*
 * KUB-0 (docs/curriculum/KUB0_KUBERNETES_CAPABILITY.md): the kubernetes-reliability island prepared for authoring and
 * its per-lesson mapping (kubeFromBlueprint, KUB_SHAPES, every row asserted). Engine stage E32 is built
 * (tests/terminal-e32.test.ts); a lesson that needs a later stage (E33–E40, D5, D6) cannot be built yet.
 */
const outline = (id: string) => kubeFromBlueprint(id, 's', 50);

validateTerminalLessonsFirst();

describe('kubeFromBlueprint (KUB_SHAPES)', () => {
  it('has one row for each of the 15 outlined lessons, each matching the blueprint activity', () => {
    const outlined = planning.plannedLessons.filter(l => l.islandId === 'kubernetes-reliability');
    expect(Object.keys(KUB_SHAPES)).toEqual(outlined.map(l => l.lessonId));
    for (const l of outlined) expect(KUB_SHAPES[l.lessonId].blueprint, l.lessonId).toBe(l.activity);
  });
  it('maps every lesson as planned (rows asserted one by one)', () => {
    const row = (id: string) => { const s = KUB_SHAPES[id]; return [s.blueprint, s.activity, s.capabilities, s.optional ?? [], s.visualization, s.stages.join(' ')]; };
    const terminal = (stages: string) => ['cluster-sim', 'terminal-sim', ['terminal'], [], 'none', stages];
    expect(row('KUB01')).toEqual(terminal('E32 E33 E34'));
    expect(row('KUB02')).toEqual(['architecture-diagram', 'network-sequence', ['terminal', 'network-protocol'], [], 'none', 'E32']);
    expect(row('KUB03')).toEqual(terminal('E32 E33'));
    expect(row('KUB04')).toEqual(terminal('E32 E33 E34'));
    expect(row('KUB05')).toEqual(terminal('E35'));
    expect(row('KUB06')).toEqual(terminal('E36'));
    expect(row('KUB07')).toEqual(['request-path', 'network-sequence', ['terminal', 'network-protocol'], [], 'none', 'E35 E37 E13']);
    expect(row('KUB08')).toEqual(terminal('E38'));
    expect(row('KUB09')).toEqual(terminal('E39'));
    expect(row('KUB10')).toEqual(terminal('E40'));
    expect(row('KUB11')).toEqual(['cluster-sim', 'terminal-sim', ['terminal'], ['devops-explorer'], 'none', 'E34 E35']);
    expect(row('KUB12')).toEqual(['monitoring-dashboard', 'monitoring-dashboard', ['devops-explorer', 'terminal'], [], 'none', 'D3 D4 E40']);
    expect(row('KUB13')).toEqual(['metric-explorer', 'monitoring-dashboard', ['devops-explorer'], [], 'none', 'D3 D4 D5']);
    expect(row('KUB14')).toEqual(['metric-explorer', 'monitoring-dashboard', ['devops-explorer'], [], 'none', 'D6']);
    expect(row('KUB15')).toEqual(['challenge-stages', 'challenge-stages', ['terminal', 'devops-explorer', 'visualization'], [], 'challenge-stages', 'E32 E33 E34 E35 E36 E37 E38 E39 E40 D3 D5 D6']);
  });
  it('builds only the lessons whose stages exist: E32 is built, the later KUB stages and D5–D6 are not', () => {
    expect(KUBE_STAGES_BUILT).toEqual(['E32']);
    expect(DEVOPS_STAGES_BUILT).toEqual(['D1', 'D2', 'D3', 'D4']);
    const b = planning.plannedLessons.find(l => l.lessonId === 'KUB02')!;
    expect(outline('KUB02')).toMatchObject({ slug: b.slug, title: b.title, objectives: b.learningObjectives, concepts: b.concepts, prerequisites: b.prerequisites, activity: 'network-sequence',
      capabilities: ['terminal', 'network-protocol'], visualization: 'none', blueprintId: 'KUB02' });
    expect(() => outline('KUB01')).toThrow('KUB01: the terminal engine stage E33, E34 is not built yet (the lesson needs E32, E33, E34)');
    expect(() => outline('KUB07')).toThrow('KUB07: the terminal engine stage E35, E37 is not built yet (the lesson needs E35, E37)');
    expect(() => outline('KUB13')).toThrow('KUB13: the devops-explorer stage D5 is not built yet (the lesson needs D3, D4, D5)');
    expect(() => outline('KUB14')).toThrow('KUB14: the devops-explorer stage D6 is not built yet (the lesson needs D6)');
    expect(() => outline('KUB12')).toThrow(/E40 is not built yet/);
    expect(() => kubeFromBlueprint('KUB02', 's', 50, true)).toThrow('KUB02 has no optional capability');
  });
  it('refuses lessons of other islands; other builders refuse KUB lessons', () => {
    expect(() => outline('CICD12')).toThrow(/not a Kubernetes and reliability lesson/);
    expect(() => outline('ML19')).toThrow(/not a Kubernetes and reliability lesson/);
    expect(() => cicdFromBlueprint('KUB12', 's', 40)).toThrow(/not a DevOps and CI\/CD lesson/);
    expect(() => dockerFromBlueprint('KUB01', 's', 40)).toThrow(/not a Docker containers lesson/);
  });
});

describe('the kubernetes-reliability island: prepared in KUB-0', () => {
  it('is registered for authoring, not published: no unit, no page, all 15 lessons planned', () => {
    expect(PREPARED_ISLAND_IDS).toEqual(['kubernetes-reliability']);
    expect(ISLAND_IDS).not.toContain('kubernetes-reliability');
    expect(ISLAND_PREFIX['kubernetes-reliability']).toBe('KUB');
    expect(UNITS['kubernetes-reliability']).toEqual([]);
    expect(lessons.filter(l => l.islandId === 'kubernetes-reliability')).toEqual([]);
    const planned = lessonsOfIsland('kubernetes-reliability');
    expect(planned.map(l => l.lessonId)).toEqual(Array.from({ length: 15 }, (_, i) => `KUB${String(i + 1).padStart(2, '0')}`));
    for (const l of planned) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    expect(getIsland('kubernetes-reliability')).toMatchObject({ status: 'planned' });
  });
  it('refuses a KUB lesson in the curriculum until the island joins ISLAND_IDS', () => {
    const o = outline('KUB02');
    const meta: LessonMeta = { lessonId: 'KUB02', islandId: 'kubernetes-reliability', slug: o.slug, title: o.title, summary: o.summary, learningObjectives: o.objectives, difficulty: o.difficulty,
      estimatedMinutes: o.minutes, prerequisites: o.prerequisites, concepts: o.concepts, apcsRelevance: o.apcs, supportedLanguages: [], visualizationType: o.visualization, lessonStatus: 'complete',
      version: '1.0.0', capabilities: o.capabilities, activity: o.activity };
    const problems = validateCurriculum({ ...curriculum, lessons: [...lessons, meta], contents: { ...curriculum.contents, KUB02: curriculum.contents.DKR01! } });
    expect(problems).toContain('KUB02: kubernetes-reliability is prepared for authoring, not a curriculum island yet: move it to ISLAND_IDS with its first written lesson');
  });
  it('registers no new activity: cluster-sim and metric-explorer stay blueprint names', () => {
    for (const a of ['cluster-sim', 'metric-explorer']) expect(LESSON_ACTIVITIES, a).not.toContain(a);
    expect(getActivity('cluster-sim')).toMatchObject({ availability: 'planned' });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});
