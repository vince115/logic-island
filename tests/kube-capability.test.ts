import { describe, expect, it } from 'vitest';
import { curriculum, getLessonBySlug, lessons } from '@/content/curriculum';
import { cicdFromBlueprint, DEVOPS_STAGES_BUILT, dockerFromBlueprint, KUB_SHAPES, KUBE_STAGES_BUILT, kubeFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, LESSON_ACTIVITIES, PREPARED_ISLAND_IDS, validateCurriculum } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { getActivity } from '@/content/world/activities';
import { lessonsOfIsland } from '@/content/world/catalog';
import planning from '@/content/world/planning-data.json';
import { validateTerminalLessonsFirst } from './support/terminal-replays';

/*
 * KUB-0 (docs/curriculum/KUB0_KUBERNETES_CAPABILITY.md): the kubernetes-reliability island prepared for authoring and
 * its per-lesson mapping (kubeFromBlueprint, KUB_SHAPES, every row asserted). Engine stages E32–E40 are built
 * (tests/terminal-e32.test.ts … terminal-e36.test.ts, terminal-e37*.test.ts … terminal-e40*.test.ts); a lesson that
 * needs a later stage (D5, D6) cannot be built yet. KUB-1 publishes the island (KUB01–KUB04) after
 * devops-cicd; it dropped the test that a synthetic KUB02 was refused while the island was prepared: no island is prepared
 * any more, so it cannot be built; network-capability.test.ts keeps the refusal of a lesson outside the curriculum islands.
 * KUB-2 adds KUB05–KUB07 (E35 kube-net, E36 kube-config, E37 ingress) in a third unit; KUB-3 adds KUB08–KUB10
 * (E38 kube-storage, E39 helm, E40 autoscaling) in a fourth.
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
  it('builds every lesson: E32–E40 and D1–D6 are built', () => {
    expect(KUBE_STAGES_BUILT).toEqual(['E32', 'E33', 'E34', 'E35', 'E36', 'E37', 'E38', 'E39', 'E40']);
    expect(DEVOPS_STAGES_BUILT).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    const b = planning.plannedLessons.find(l => l.lessonId === 'KUB02')!;
    expect(outline('KUB02')).toMatchObject({ slug: b.slug, title: b.title, objectives: b.learningObjectives, concepts: b.concepts, prerequisites: b.prerequisites, activity: 'network-sequence',
      capabilities: ['terminal', 'network-protocol'], visualization: 'none', blueprintId: 'KUB02' });
    for (const id of ['KUB01', 'KUB03', 'KUB04', 'KUB05', 'KUB06', 'KUB11']) expect(outline(id)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: id });
    expect(kubeFromBlueprint('KUB11', 's', 50, true).capabilities).toEqual(['terminal', 'devops-explorer']);
    // E37 (KUB-2): KUB07 is the request path beside a real Ingress and HTTPRoute (its shape also needs network-protocol and E13).
    expect(outline('KUB07')).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none', blueprintId: 'KUB07' });
    // E38 (KUB-3): KUB08 is a terminal lesson of PVs, PVCs, StorageClasses, StatefulSets and backups.
    expect(outline('KUB08')).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: 'KUB08' });
    // E39 (KUB-3): KUB09 is a terminal lesson of Helm charts, values and releases.
    expect(outline('KUB09')).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: 'KUB09' });
    // D5 and D6 (KUB-4): KUB13 (traces) and KUB14 (SLOs) are monitoring-dashboard lessons on the devops-explorer.
    for (const id of ['KUB13', 'KUB14']) expect(outline(id)).toMatchObject({ activity: 'monitoring-dashboard', capabilities: ['devops-explorer'], visualization: 'none', blueprintId: id });
    // E40 (KUB-3): KUB10 is a terminal lesson of requests, limits, metrics-server and the HPA; KUB12 (D3, D4 and E40) can be built too.
    expect(outline('KUB10')).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: 'KUB10' });
    expect(outline('KUB12')).toMatchObject({ activity: 'monitoring-dashboard', blueprintId: 'KUB12' });
    expect(() => kubeFromBlueprint('KUB02', 's', 50, true)).toThrow('KUB02 has no optional capability');
  });
  it('refuses lessons of other islands; other builders refuse KUB lessons', () => {
    expect(() => outline('CICD12')).toThrow(/not a Kubernetes and reliability lesson/);
    expect(() => outline('ML19')).toThrow(/not a Kubernetes and reliability lesson/);
    expect(() => cicdFromBlueprint('KUB12', 's', 40)).toThrow(/not a DevOps and CI\/CD lesson/);
    expect(() => dockerFromBlueprint('KUB01', 's', 40)).toThrow(/not a Docker containers lesson/);
  });
});

describe('the kubernetes-reliability island: prepared in KUB-0, published from KUB-1', () => {
  it('is a curriculum island after devops-cicd with its first lessons written in id order and in its units; the rest stay planned outlines without a page', () => {
    // KUB-1 moved it to ISLAND_IDS: no island is prepared any more.
    expect(PREPARED_ISLAND_IDS).toEqual([]);
    expect(ISLAND_IDS).toContain('kubernetes-reliability');
    // The world's order in the systems region: LNX, DKR, SRV, CLD (still planned), CICD, KUB.
    expect(ISLAND_IDS.indexOf('kubernetes-reliability')).toBe(ISLAND_IDS.indexOf('devops-cicd') + 1);
    expect(ISLAND_PREFIX['kubernetes-reliability']).toBe('KUB');
    const written = lessons.filter(l => l.islandId === 'kubernetes-reliability');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `KUB${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(10);
    // KUB-1: two units, KUB01–KUB02 and KUB03–KUB04; KUB-2: a third, KUB05–KUB07; KUB-3: a fourth, KUB08–KUB10.
    expect(UNITS['kubernetes-reliability'].slice(0, 4)).toMatchObject([{ title: '編排的觀念與叢集架構', lessonIds: ['KUB01', 'KUB02'] }, { title: 'Pod 與工作負載', lessonIds: ['KUB03', 'KUB04'] },
      { title: '服務、設定與入口', lessonIds: ['KUB05', 'KUB06', 'KUB07'] }, { title: '儲存、套件與擴展', lessonIds: ['KUB08', 'KUB09', 'KUB10'] }]);
    expect(UNITS['kubernetes-reliability'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    // Every written lesson has its page and follows its KUB_SHAPES row: KUB01, KUB03 and KUB04 are the terminal with a
    // simulated cluster, KUB02 adds a network-protocol scene; KUB-2: KUB05 and KUB06 are cluster lessons too, KUB07 (the
    // blueprint's request-path) adds a network-protocol scene like KUB02; KUB-3: KUB08–KUB10 are cluster lessons.
    for (const l of written) expect(getLessonBySlug(l.slug)?.lessonId, l.slug).toBe(l.lessonId);
    expect(written.slice(0, 10).map(l => [l.lessonId, l.capabilities, l.activity, !!curriculum.contents[l.lessonId]?.terminal, !!curriculum.contents[l.lessonId]?.network])).toEqual([
      ['KUB01', ['terminal'], 'terminal-sim', true, false],
      ['KUB02', ['terminal', 'network-protocol'], 'network-sequence', true, true],
      ['KUB03', ['terminal'], 'terminal-sim', true, false],
      ['KUB04', ['terminal'], 'terminal-sim', true, false],
      ['KUB05', ['terminal'], 'terminal-sim', true, false],
      ['KUB06', ['terminal'], 'terminal-sim', true, false],
      ['KUB07', ['terminal', 'network-protocol'], 'network-sequence', true, true],
      ['KUB08', ['terminal'], 'terminal-sim', true, false],
      ['KUB09', ['terminal'], 'terminal-sim', true, false],
      ['KUB10', ['terminal'], 'terminal-sim', true, false],
    ]);
    const planned = lessonsOfIsland('kubernetes-reliability');
    expect(planned.map(l => l.lessonId)).toEqual(Array.from({ length: 15 }, (_, i) => `KUB${String(i + 1).padStart(2, '0')}`));
    expect(planned.slice(0, written.length).every(l => l.lessonStatus === 'complete' && l.href === `/curriculum/${l.slug}`)).toBe(true);
    for (const l of planned.slice(written.length)) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    // Its lessons open on their own; its 3D landscape stays the planned one (IslandConfig.mapState, set by hand).
    expect(getIsland('kubernetes-reliability')).toMatchObject({ status: written.length < 15 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('registers no new activity: cluster-sim and metric-explorer stay blueprint names', () => {
    for (const a of ['cluster-sim', 'metric-explorer']) expect(LESSON_ACTIVITIES, a).not.toContain(a);
    expect(getActivity('cluster-sim')).toMatchObject({ availability: 'planned' });
    // KUB-1 (KUB0 §3, effects on the activity registry): cluster-sim keeps the island while KUB05–KUB11 are planned with it
    // (KUB-3: KUB11 is the last unwritten cluster-sim lesson, so the island stays until KUB-4);
    // KUB02, written as network-sequence, takes kubernetes-reliability off architecture-diagram (still implemented by DB19)
    // and onto network-sequence; KUB01, KUB03 and KUB04 put it on terminal-sim.
    expect(getActivity('cluster-sim')!.subjects).toEqual(['kubernetes-reliability']);
    expect(getActivity('architecture-diagram')).toMatchObject({ availability: 'implemented' });
    expect(getActivity('architecture-diagram')!.subjects).not.toContain('kubernetes-reliability');
    expect(getActivity('network-sequence')!.subjects).toContain('kubernetes-reliability');
    expect(getActivity('terminal-sim')!.subjects).toContain('kubernetes-reliability');
    // KUB-2: KUB07, the island's request-path lesson, is written as network-sequence. request-path stays planned through the
    // planned network-request lab (DKR-5's rule) and, with no catalog lesson left on it, lists the islands of its outlines.
    expect(getActivity('request-path')).toMatchObject({ availability: 'planned', subjects: ['network-servers', 'kubernetes-reliability'] });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});
