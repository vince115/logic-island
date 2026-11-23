import { describe, expect, it } from 'vitest';
import { curriculum, getLessonBySlug, lessons } from '@/content/curriculum';
import { CICD_SHAPES, cicdFromBlueprint, DEVOPS_STAGES_BUILT, dockerFromBlueprint, llmFromBlueprint } from '@/content/curriculum/lessons';
import { DEVOPS_ACTIVITIES, ISLAND_IDS, ISLAND_PREFIX, LESSON_ACTIVITIES, LESSON_CAPABILITIES, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { activities, getActivity } from '@/content/world/activities';
import { lessonsOfIsland } from '@/content/world/catalog';
import { labRegistry } from '@/content/world/labs';
import planning from '@/content/world/planning-data.json';
import { publishProblems } from '@/lib/curriculum/publish-gate';
import { alertConstraintTexts, alertPlanAnswer, alertViolations, parseAlertPlan } from '@/lib/devops/dashboard-check';
import { checkDevopsAnswer, constraintTexts, devopsContentProblems, devopsQueryValue, matchesDevopsValue, parseDevopsNumber, parsePlan, referenceAnswer } from '@/lib/devops/check';
import { conditionText, evaluateAlert, ruleValueText } from '@/lib/devops/alerts';
import { dashboardProblems, evaluateOn, type Dashboard } from '@/lib/devops/dashboard';
import { incidentTimes, severityOf } from '@/lib/devops/incident';
import { generateSeries, seriesProblems, seriesValues } from '@/lib/devops/series';
import { draws } from '@/lib/llm/prng';
import { clockText, doraMetrics, durationText, historyProblems, median, roundHalfUp } from '@/lib/devops/history';
import { resolveRolling, rolloutProblems, simulateRollout, splitByWeights, strategyProblems, type RolloutScenario } from '@/lib/devops/rollout';
import type { DevopsExercise, DevopsLessonContent } from '@/lib/devops/types';
import { badCanary, checkout, devopsContent, devopsLesson, exercises, flagged, schemaChange, teamA, teamB } from './support/devops-fixture';
import { api, dashboardContent, dashboardExercises, dashboardLesson, tiny } from './support/dashboard-fixture';
import { validateTerminalLessonsFirst } from './support/terminal-replays';

/*
 * CICD-0 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md): the devops-cicd island prepared for authoring, the per-lesson
 * mapping (cicdFromBlueprint, CICD_SHAPES), and the devops-explorer capability's stages D1 (deployment histories and DORA
 * metrics) and D2 (the deployment-simulator). Every number below is worked out by hand in the comments of
 * tests/support/devops-fixture.ts or here. CICD-1 publishes the island (CICD01) after network-servers; it dropped the
 * test that a synthetic CICD10 was refused while the island was prepared: no island is prepared any more, so it cannot be
 * built; network-capability.test.ts keeps the refusal of a lesson outside the curriculum islands.
 */
const metaOf = (lessonId: string, outline: ReturnType<typeof cicdFromBlueprint>): LessonMeta => ({
  lessonId: lessonId as LessonMeta['lessonId'], islandId: 'devops-cicd', slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: [], visualizationType: outline.visualization,
  lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
});
const meta = metaOf('CICD10', cicdFromBlueprint('CICD10', '比較滾動、藍綠與金絲雀部署的風險與成本（測試用大綱）。', 60));
const sim = (s: RolloutScenario) => simulateRollout(s);
const series = (s: RolloutScenario, f: (r: ReturnType<typeof sim>['rows'][number]) => unknown) => sim(s).rows.map(f);

validateTerminalLessonsFirst();

describe('cicdFromBlueprint (CICD_SHAPES)', () => {
  it('has one row for each of the 15 outlined lessons, each matching the blueprint activity', () => {
    const outlined = planning.plannedLessons.filter(l => l.islandId === 'devops-cicd');
    expect(Object.keys(CICD_SHAPES)).toEqual(outlined.map(l => l.lessonId));
    for (const l of outlined) expect(CICD_SHAPES[l.lessonId].blueprint, l.lessonId).toBe(l.activity);
  });
  it('maps every lesson as planned (rows asserted one by one)', () => {
    const shape = (id: string) => { const o = cicdFromBlueprint(id, 's', 50); return [o.activity, o.capabilities, o.visualization]; };
    expect(shape('CICD01')).toEqual(['deployment-simulator', ['devops-explorer'], 'none']);
    expect(shape('CICD02')).toEqual(['terminal-sim', ['terminal'], 'none']);
    for (const id of ['CICD03', 'CICD04', 'CICD05', 'CICD06', 'CICD07', 'CICD09']) expect(shape(id), id).toEqual(['terminal-sim', ['terminal'], 'none']);
    expect(shape('CICD08')).toEqual(['terminal-sim', ['terminal'], 'none']);
    expect(shape('CICD10')).toEqual(['deployment-simulator', ['devops-explorer'], 'none']);
    expect(cicdFromBlueprint('CICD10', 's', 60, true).capabilities).toEqual(['devops-explorer', 'terminal']);
    expect(shape('CICD13')).toEqual(['terminal-sim', ['terminal', 'devops-explorer'], 'none']);
    expect(shape('CICD14')).toEqual(['terminal-sim', ['terminal', 'devops-explorer'], 'none']);
    expect(shape('CICD15')).toEqual(['challenge-stages', ['terminal', 'devops-explorer', 'visualization'], 'challenge-stages']);
    // CICD11 and CICD12 are mapped to monitoring-dashboard, registered with D3 (CICD-4): CICD11 can be built; CICD12 also
    // needs D4 (logs), which is not built, so it is still refused.
    expect(CICD_SHAPES.CICD11).toMatchObject({ activity: 'monitoring-dashboard', capabilities: ['devops-explorer'], stages: ['D3'] });
    expect(CICD_SHAPES.CICD12).toMatchObject({ activity: 'monitoring-dashboard', capabilities: ['devops-explorer', 'terminal'], stages: ['D3', 'D4'] });
    expect(shape('CICD11')).toEqual(['monitoring-dashboard', ['devops-explorer'], 'none']);
    expect(DEVOPS_STAGES_BUILT).toEqual(['D1', 'D2', 'D3']);
    expect(() => cicdFromBlueprint('CICD12', 's', 50)).toThrow(/^CICD12: the devops-explorer stage D4 is not built yet \(the monitoring-dashboard activity needs D3 and D4\)$/);
    // The stages each lesson waits for.
    expect(Object.fromEntries(Object.entries(CICD_SHAPES).map(([id, s]) => [id, s.stages.join(' ')]))).toEqual({
      CICD01: 'D1', CICD02: 'E25 E26', CICD03: 'E25 E26 E27 E28', CICD04: 'E25 E26 E27 E28', CICD05: 'E25 E26 E27 E28',
      CICD06: 'E25 E26 E27 E28 E29', CICD07: 'E25 E26 E27 E28 E29', CICD08: 'E25 E26 E27 E28 E29', CICD09: 'E25 E26 E27 E28 E29 E30 E31',
      CICD10: 'D2', CICD11: 'D3', CICD12: 'D3 D4', CICD13: 'E25 E26 E27 E28 E29 E30 D2', CICD14: 'E31 D3', CICD15: 'E25 E26 E27 E28 E29 E30 E31 D2 D3',
    });
    const b = planning.plannedLessons.find(l => l.lessonId === 'CICD01')!;
    expect(cicdFromBlueprint('CICD01', 's', 40)).toMatchObject({ slug: b.slug, title: b.title, objectives: b.learningObjectives, concepts: b.concepts, prerequisites: b.prerequisites, blueprintId: 'CICD01' });
  });
  it('refuses lessons of other islands and an optional capability a lesson does not have; other islands keep theirs', () => {
    expect(() => cicdFromBlueprint('DKR01', 's', 40)).toThrow(/not a DevOps and CI\/CD lesson/);
    expect(() => cicdFromBlueprint('KUB12', 's', 40)).toThrow(/not a DevOps and CI\/CD lesson/);
    expect(() => cicdFromBlueprint('CICD01', 's', 40, true)).toThrow(/CICD01 has no optional capability/);
    expect(() => dockerFromBlueprint('CICD01', 's', 40)).toThrow(/not a Docker containers lesson/);
    expect(() => llmFromBlueprint('CICD01', 's', 40)).toThrow(/not a large-language-models or generative-ai lesson/);
  });
});

describe('the devops-cicd island: prepared in CICD-0, published from CICD-1', () => {
  it('is a curriculum island after network-servers with its first lessons written in id order and in its unit; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).toEqual([]);
    expect(ISLAND_IDS).toContain('devops-cicd');
    // The world's order in the systems region: LNX, DKR, SRV, CLD (still planned), CICD, KUB.
    expect(ISLAND_IDS.indexOf('devops-cicd')).toBe(ISLAND_IDS.indexOf('network-servers') + 1);
    expect(ISLAND_PREFIX['devops-cicd']).toBe('CICD');
    const written = lessons.filter(l => l.islandId === 'devops-cicd');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `CICD${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(1);
    // CICD-1: one unit, CICD01.
    expect(UNITS['devops-cicd'][0]).toMatchObject({ title: 'DevOps 與交付的基本觀念', lessonIds: ['CICD01'] });
    expect(UNITS['devops-cicd'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    // Every written lesson has its page; CICD01 is the devops-explorer's deployment histories (D1), with no terminal.
    for (const l of written) expect(getLessonBySlug(l.slug)?.lessonId, l.slug).toBe(l.lessonId);
    expect([written[0].capabilities, written[0].activity, !!curriculum.contents.CICD01?.devops, !!curriculum.contents.CICD01?.terminal]).toEqual([['devops-explorer'], 'deployment-simulator', true, false]);
    const outline = lessonsOfIsland('devops-cicd');
    expect(outline.map(l => l.lessonId)).toEqual(Array.from({ length: 15 }, (_, i) => `CICD${String(i + 1).padStart(2, '0')}`));
    expect(outline.slice(0, written.length).every(l => l.lessonStatus === 'complete' && l.href === `/curriculum/${l.slug}`)).toBe(true);
    for (const l of outline.slice(written.length)) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    // Its lessons open on their own; its 3D landscape stays the planned one (IslandConfig.mapState, set by hand).
    expect(getIsland('devops-cicd')).toMatchObject({ status: written.length < 15 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('registers devops-explorer with deployment-simulator (D1, D2) and monitoring-dashboard (D3) only; the other blueprint names stay planned', () => {
    expect(LESSON_CAPABILITIES).toContain('devops-explorer');
    expect(DEVOPS_ACTIVITIES).toEqual(['deployment-simulator', 'monitoring-dashboard']);
    expect(LESSON_ACTIVITIES).toContain('deployment-simulator');
    expect(LESSON_ACTIVITIES).toContain('monitoring-dashboard');
    for (const a of ['pipeline-sim', 'case-study-board', 'decision-simulation']) expect(LESSON_ACTIVITIES, a).not.toContain(a);
    expect(labRegistry.find(l => l.id === 'cicd-pipeline')).toMatchObject({ status: 'planned', activities: ['pipeline-sim'] });
  });
  it('kept deployment-simulator planned in the activity registry until a complete lesson used it: CICD01 (CICD-1) makes it implemented', () => {
    expect(lessons.some(l => l.activity === 'deployment-simulator' && l.lessonStatus === 'complete')).toBe(true);
    expect(getActivity('deployment-simulator')).toMatchObject({ availability: 'implemented', version: '1.0.0',
      subjects: ['systems-analysis', 'deep-learning', 'ai-engineering', 'cloud-infrastructure', 'devops-cicd'] });
    // Implemented, it carries its own description of the text equivalent (IMPLEMENTED_TEXT) instead of the requirement.
    expect(getActivity('deployment-simulator')!.accessibility).toEqual({ keyboard: true,
      textAlternative: '每張圖都有等效的表格：部署紀錄逐筆列出（變更數、前置時間、是否失敗、偵測與復原時間），DORA 指標與其算式以文字寫出；部署模擬逐分鐘列出各版本的執行個體、承接的請求、錯誤與丟棄，閘門的判定與總計以表格呈現，目前這一分鐘的說明以 aria-live 宣告' });
    // Every activity with a described text equivalent is implemented, and every planned one carries the requirement.
    for (const a of activities.filter(x => x.type === 'activity' && x.accessibility.textAlternative !== '必要：實作時提供與畫面等效的文字說明')) expect(a.availability, a.id).toBe('implemented');
    for (const a of activities.filter(x => x.type === 'activity' && x.availability === 'planned')) expect(a.accessibility.textAlternative, a.id).toBe('必要：實作時提供與畫面等效的文字說明');
  });
  it('keeps monitoring-dashboard planned in the activity registry until a complete lesson uses it (D3 registers it, no lesson yet)', () => {
    expect(lessons.some(l => l.activity === 'monitoring-dashboard')).toBe(false);
    expect(getActivity('monitoring-dashboard')).toMatchObject({ availability: 'planned', version: '0.1.0',
      accessibility: { keyboard: true, textAlternative: '必要：實作時提供與畫面等效的文字說明' } });
    // The blueprint's six lessons on three islands name it (CICD11/12, OPS13/14/19, KUB12); registering it adds none.
    expect(planning.plannedLessons.filter(l => l.activity === 'monitoring-dashboard').map(l => l.lessonId).sort()).toEqual(['CICD11', 'CICD12', 'KUB12', 'OPS13', 'OPS14', 'OPS19']);
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});

// ---- D1 ------------------------------------------------------------------------------------------------------------
describe('D1: DORA metrics from a deployment history', () => {
  it('rounds half up and takes the median as documented', () => {
    expect([roundHalfUp(5, 2), roundHalfUp(7, 3), roundHalfUp(350, 14), roundHalfUp(1, 3), roundHalfUp(0, 9)]).toEqual([3, 2, 25, 0, 0]);
    expect(median([])).toBeUndefined();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([45, 120])).toBe(83);
    expect(median([1, 2])).toBe(2);
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it('computes the four metrics of team-a by hand', () => {
    expect(doraMetrics(teamA())).toEqual({
      deployments: 5, deployDays: 5, perWeekTenths: 25,
      leadTimes: [30, 60, 90, 120, 120, 240, 300, 600], leadTimeMedian: 120,
      failed: 2, changeFailPercent: 40,
      recoveryTimes: [45, 120], recoveryMedian: 83, detectTimes: [15, 20], detectMedian: 18,
    });
  });
  it('computes team-b, and a history without failures has no recovery time', () => {
    expect(doraMetrics(teamB())).toMatchObject({ deployments: 10, deployDays: 10, perWeekTenths: 50, leadTimeMedian: 60, failed: 1, changeFailPercent: 10, recoveryMedian: 20 });
    const clean = { ...teamA(), deployments: teamA().deployments.map(({ failure: _f, ...d }) => { void _f; return d; }) };
    expect(doraMetrics(clean)).toMatchObject({ failed: 0, changeFailPercent: 0, recoveryMedian: undefined, detectMedian: undefined });
    // 3 of 7 deployments: 42.857…% → 43%; 2 deployments in 30 days: 0.466… a week → 0.5.
    expect(roundHalfUp(300, 7)).toBe(43);
    expect(doraMetrics({ service: 's', days: 30, deployments: [{ id: 'a', deployedAt: 0, commitAt: [0] }, { id: 'b', deployedAt: 1440, commitAt: [10] }] }).perWeekTenths).toBe(5);
  });
  it('rejects inconsistent histories', () => {
    const bad = (patch: (h: ReturnType<typeof teamA>) => void) => { const h = teamA(); patch(h); return historyProblems(h); };
    expect(historyProblems(teamA())).toEqual([]);
    expect(bad(h => { h.days = 0; })).toContain('days must be 1…366');
    expect(bad(h => { h.deployments = []; })).toContain('needs at least one deployment');
    expect(bad(h => { h.deployments[1].id = 'd1'; })).toContain('duplicate deployment d1');
    expect(bad(h => { h.deployments[4].deployedAt = 14 * 1440; })).toContain('deployment d5: deployedAt must be a whole minute inside the 14-day period');
    expect(bad(h => { h.deployments[2].deployedAt = 100; h.deployments[2].commitAt = [0]; })).toContain('deployment d3: deployments are listed in the order they were deployed');
    expect(bad(h => { h.deployments[0].commitAt = [700]; })).toContain('deployment d1: a change is committed at a whole minute ≥ 0, no later than the deployment');
    expect(bad(h => { h.deployments[0].commitAt = []; })).toContain('deployment d1: needs at least one change (commitAt)');
    expect(bad(h => { h.deployments[1].failure = { detectedAt: 2000, restoredAt: 2100 }; })).toContain('deployment d2: the failure is detected at or after it starts');
    expect(bad(h => { h.deployments[1].failure = { detectedAt: 2060, restoredAt: 2050 }; })).toContain('deployment d2: service is restored at or after the failure is detected');
    expect(bad(h => { h.deployments[3].failure!.startedAt = 10; })).toContain('deployment d4: the failure starts at or after the deployment');
  });
  it('writes times and durations in words', () => {
    expect(clockText(0)).toBe('第 1 天 00:00');
    expect(clockText(1440 + 605)).toBe('第 2 天 10:05');
    expect([durationText(45), durationText(120), durationText(125), durationText(1440 + 180)]).toEqual(['45 分鐘', '2 小時', '2 小時 5 分鐘', '1 天 3 小時']);
  });
});

// ---- D2 ------------------------------------------------------------------------------------------------------------
describe('D2: integer rules', () => {
  it('splits requests by weights with the largest remainders (ties: the earlier part)', () => {
    expect(splitByWeights(1000, [3, 1])).toEqual([750, 250]);
    expect(splitByWeights(1000, [1, 2])).toEqual([333, 667]);
    expect(splitByWeights(5, [1, 1])).toEqual([3, 2]);
    expect(splitByWeights(7, [0, 5])).toEqual([0, 7]);
    expect(splitByWeights(10, [0, 0])).toEqual([0, 0]);
    expect(splitByWeights(1000, [90, 10])).toEqual([900, 100]);
  });
  it('resolves maxSurge up and maxUnavailable down from percentages; both 0 makes unavailable 1', () => {
    expect(resolveRolling(10, '25%', '25%')).toEqual({ surge: 3, unavailable: 2 });
    expect(resolveRolling(3, '10%', '10%')).toEqual({ surge: 1, unavailable: 0 });
    expect(resolveRolling(3, '0%', '10%')).toEqual({ surge: 0, unavailable: 1 });
    expect(resolveRolling(4, 2, 9)).toEqual({ surge: 2, unavailable: 4 });
    expect(strategyProblems({ kind: 'rolling', maxSurge: 0, maxUnavailable: 0 }, 4)).toEqual(['maxSurge and maxUnavailable cannot both be 0']);
    expect(strategyProblems({ kind: 'rolling', maxSurge: '0%', maxUnavailable: '0%' }, 4)).toEqual([]);
    expect(strategyProblems({ kind: 'rolling', maxSurge: '150%', maxUnavailable: 0 }, 4)[0]).toMatch(/counts .* or percentages/);
  });
  it('carries the remainder of errors from minute to minute, so totals are exact', () => {
    // 333 requests a minute at 3 ‰: 0.999 a minute → 0, 1, 1 (carry 999, 998, 997): 2 = ⌊2,997 ÷ 1,000⌋.
    const s: RolloutScenario = { fleet: { instances: 1, capacityRpm: 1000, rpm: 333 }, from: { id: 'v1', label: 'v1', errorPermille: 3, p95Ms: 1, startSeconds: 0 },
      to: { id: 'v2', label: 'v2', errorPermille: 3, p95Ms: 1, startSeconds: 0 }, strategy: { kind: 'blue-green', verifyMinutes: 3, keepBlueMinutes: 1 }, minutes: 5 };
    expect(series(s, r => (r as { errors: { from: number } }).errors.from).slice(0, 3)).toEqual([0, 1, 1]);
  });
});

describe('D2: the four strategies on the checkout fleet', () => {
  it('rolling, maxSurge 1 / maxUnavailable 0: one old instance goes as each new one is ready', () => {
    const r = sim(checkout());
    expect(r.rows.map(x => [x.running, x.instances.from.ready, x.instances.to.ready, x.instances.to.starting])).toEqual([
      [5, 4, 0, 1], [5, 4, 0, 1], [5, 3, 1, 1], [5, 3, 1, 1], [5, 2, 2, 1], [5, 2, 2, 1], [5, 1, 3, 1], [5, 1, 3, 1], [4, 0, 4, 0], [4, 0, 4, 0]]);
    expect(r.rows.map(x => [x.served.from, x.served.to])).toEqual([[1000, 0], [1000, 0], [750, 250], [750, 250], [500, 500], [500, 500], [250, 750], [250, 750], [0, 1000], [0, 1000]]);
    expect(r).toMatchObject({ outcome: 'completed', completedAt: 8, rolling: { surge: 1, unavailable: 0 }, gates: [] });
    expect(r.totals).toEqual({ requests: 10000, served: 10000, dropped: 0, errors: 15, errorsBy: { from: 5, to: 10 }, affected: 15, peakInstances: 5, extraInstanceMinutes: 8, droppedMinutes: 0 });
    expect(r.rows[2].events).toEqual(['移除 1 個 v1', '啟動 1 個 v2（第 4 分鐘就緒）']);
    expect(r.rows[8].events).toEqual(['移除 1 個 v1', '部署完成']);
  });
  it('rolling, maxSurge 0 / maxUnavailable 1: never more than 4, but 3 ready instances drop 100 requests a minute', () => {
    const r = sim({ ...checkout(), strategy: { kind: 'rolling', maxSurge: 0, maxUnavailable: 1 } });
    expect(r.rows.map(x => x.dropped)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 0, 0]);
    expect(r.rows.map(x => [x.served.from, x.served.to]).slice(0, 8)).toEqual([[900, 0], [900, 0], [600, 300], [600, 300], [300, 600], [300, 600], [0, 900], [0, 900]]);
    expect(r).toMatchObject({ outcome: 'completed', completedAt: 8 });
    expect(r.totals).toMatchObject({ dropped: 800, droppedMinutes: 8, peakInstances: 4, extraInstanceMinutes: 0, served: 9200 });
  });
  it('recreate: everything stops, nothing serves until v2 is ready', () => {
    const r = sim({ ...checkout(), strategy: { kind: 'recreate' } });
    expect(r.rows.map(x => x.dropped)).toEqual([1000, 1000, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r).toMatchObject({ outcome: 'completed', completedAt: 2 });
    expect(r.totals).toMatchObject({ dropped: 2000, errors: 16, errorsBy: { from: 0, to: 16 }, peakInstances: 4, extraInstanceMinutes: 0, droppedMinutes: 2 });
  });
  it('blue-green: green ready at 2, verified for 1 minute, switch at 3, blue kept 3 minutes and removed at 6', () => {
    const r = sim({ ...checkout(), strategy: { kind: 'blue-green', verifyMinutes: 1, keepBlueMinutes: 3 } });
    expect(r.rows.map(x => [x.running, x.weight, x.served.from, x.served.to])).toEqual([
      [8, 0, 1000, 0], [8, 0, 1000, 0], [8, 0, 1000, 0], [8, 100, 0, 1000], [8, 100, 0, 1000], [8, 100, 0, 1000], [4, 100, 0, 1000], [4, 100, 0, 1000], [4, 100, 0, 1000], [4, 100, 0, 1000]]);
    expect(r).toMatchObject({ outcome: 'completed', switchAt: 3, completedAt: 6 });
    expect(r.gates).toEqual([{ step: 0, from: 3, to: 5, requests: 3000, errors: 6, permille: 2, p95Ms: 200, verdict: 'pass' }]);
    expect(r.totals).toMatchObject({ peakInstances: 8, extraInstanceMinutes: 24, dropped: 0, errors: 17 });
  });
  it('blue-green rolls back instantly when the watch fails: traffic back to blue, green removed', () => {
    const r = sim({ ...badCanary(), strategy: { kind: 'blue-green', verifyMinutes: 0, keepBlueMinutes: 2 } });
    // Switch at 2; the watch over minutes 2–3 sees 2,000 requests and 100 errors (50 ‰ > 5 ‰): back to v1 at 4.
    expect(r).toMatchObject({ outcome: 'rolled-back', switchAt: 2, rolledBackAt: 4 });
    expect(r.gates[0]).toMatchObject({ requests: 2000, errors: 100, permille: 50, verdict: 'fail' });
    expect(r.rows.slice(4).every(x => x.weight === 0 && x.served.from === 1000 && x.running === 4)).toBe(true);
  });
  it('canary 25% → 100%: each step waits for its instances, holds, then passes its gate', () => {
    const r = sim({ ...checkout(), strategy: { kind: 'canary', steps: [{ weight: 25, holdMinutes: 2 }, { weight: 100, holdMinutes: 2 }] } });
    expect(r.rows.map(x => [x.running, x.weight, x.served.from, x.served.to])).toEqual([
      [5, 0, 1000, 0], [5, 0, 1000, 0], [5, 25, 750, 250], [5, 25, 750, 250], [8, 25, 750, 250], [8, 25, 750, 250], [8, 100, 0, 1000], [8, 100, 0, 1000], [4, 100, 0, 1000], [4, 100, 0, 1000]]);
    expect(r.gates.map(g => [g.step, g.from, g.to, g.requests, g.errors, g.verdict])).toEqual([[1, 2, 3, 500, 1, 'pass'], [2, 6, 7, 2000, 4, 'pass']]);
    expect(r).toMatchObject({ outcome: 'completed', completedAt: 8 });
    expect(r.totals).toMatchObject({ peakInstances: 8, extraInstanceMinutes: 20, errors: 15 });
  });
});

describe('D2: gates and abort', () => {
  it('aborts a canary whose error rate breaks the gate and sends the traffic back', () => {
    const r = sim(badCanary());
    // Minutes 2–3: 250 + 250 requests at 50 ‰ → 12 (carry 500) + 13 = 25 errors; 25 × 1000 > 5 × 500.
    expect(r.gates).toEqual([{ step: 1, from: 2, to: 3, requests: 500, errors: 25, permille: 50, p95Ms: 200, verdict: 'fail' }]);
    expect(r).toMatchObject({ outcome: 'rolled-back', rolledBackAt: 4, abortedStep: 1 });
    expect(r.rows[4]).toMatchObject({ weight: 0, running: 4, served: { from: 1000, to: 0 } });
    expect(r.rows[4].events).toEqual(['移除 1 個 v2', '回滾：第 1 步的閘門未通過，流量切回 v1']);
    expect(r.totals.errorsBy.to).toBe(25);
  });
  it('fails closed when the window has fewer requests than minRequests', () => {
    const r = sim({ ...checkout(), strategy: badCanary().strategy, gate: { metric: 'error-rate', max: 5, minRequests: 600 } });
    expect(r.gates[0]).toMatchObject({ requests: 500, verdict: 'insufficient' });
    expect(r).toMatchObject({ outcome: 'rolled-back', rolledBackAt: 4 });
  });
  it('checks the declared p95 on a p95 gate, and promotes without a gate', () => {
    expect(sim({ ...checkout(), strategy: badCanary().strategy, gate: { metric: 'p95', max: 150, minRequests: 1 } })).toMatchObject({ outcome: 'rolled-back', abortedStep: 1 });
    expect(sim({ ...checkout(), strategy: badCanary().strategy, gate: { metric: 'p95', max: 200, minRequests: 1 } })).toMatchObject({ outcome: 'completed' });
    const { gate: _g, ...ungated } = badCanary();
    void _g;
    expect(sim(ungated)).toMatchObject({ outcome: 'completed', completedAt: 8, gates: [] });
    expect(sim(ungated).totals.errorsBy.to).toBe(250);
  });
});

describe('D2: expand/contract migrations and feature flags', () => {
  it('fails every request of a version while a column it needs is missing', () => {
    const r = sim(schemaChange());
    expect(r.rows.map(x => x.incompatible.from)).toEqual([false, false, false, false, false, true, true, true, true, true]);
    expect(r.rows.map(x => x.errors.from)).toEqual([0, 0, 0, 0, 0, 500, 250, 250, 0, 0]);
    expect(r.totals.errorsBy).toEqual({ from: 1000, to: 0 });
    expect(r.rows[0].events[0]).toBe('結構變更（擴充）：新增欄位 full_name');
    expect(r.rows[5].schema).toEqual(['full_name', 'id']);
    // Contract after the rollout completes: no errors. Forgetting the expand: v2 fails all 5,000 requests it serves.
    expect(sim({ ...schemaChange(), migrations: [{ at: 0, kind: 'expand', columns: ['full_name'] }, { at: 9, kind: 'contract', columns: ['name'] }] }).totals.errors).toBe(0);
    expect(sim({ ...schemaChange(), migrations: [] }).totals.errorsBy).toEqual({ from: 0, to: 5000 });
  });
  it('rejects migrations that do not fit the schema', () => {
    expect(rolloutProblems(schemaChange())).toEqual([]);
    expect(rolloutProblems({ ...schemaChange(), migrations: [{ at: 0, kind: 'expand', columns: ['name'] }] })).toContain('expand adds name, which already exists');
    expect(rolloutProblems({ ...schemaChange(), migrations: [{ at: 1, kind: 'contract', columns: ['email'] }] })).toContain('contract drops email, which does not exist');
    expect(rolloutProblems({ ...schemaChange(), migrations: [{ at: 10, kind: 'expand', columns: ['x'] }] })).toContain('a migration happens at a minute of the timeline (0…9)');
  });
  it('exposes a flag independently of the deployment', () => {
    const r = sim(flagged());
    // Rolling 2 instances (ready after 1 minute): complete at 2; the flag opens 20% at 6: 200 of 1,000 requests, 20 errors a minute.
    expect(r).toMatchObject({ outcome: 'completed', completedAt: 2 });
    expect(r.rows.map(x => x.feature.to)).toEqual([0, 0, 0, 0, 0, 0, 200, 200, 200, 200]);
    expect(r.rows.map(x => x.errors.to)).toEqual([0, 0, 0, 0, 0, 0, 20, 20, 20, 20]);
    expect(r.rows[6]).toMatchObject({ exposure: { 'new-checkout': 20 } });
    expect(r.rows[6].events).toEqual(['功能旗標「新結帳流程」開放 20%']);
    expect(r.totals.errors).toBe(80);
  });
  it('rejects scenarios that are inconsistent or do not finish in time', () => {
    const at = (patch: Partial<RolloutScenario>) => rolloutProblems({ ...checkout(), ...patch });
    expect(at({ fleet: { instances: 0, capacityRpm: 1, rpm: 1 } })).toContain('instances must be 1…20');
    expect(at({ to: { ...checkout().to, id: 'v1' } })).toContain('the two versions need different ids');
    expect(at({ minutes: 5 })).toContain('the rolling rollout neither completes nor rolls back within 5 minutes');
    expect(at({ strategy: { kind: 'canary', steps: [{ weight: 50, holdMinutes: 1 }, { weight: 40, holdMinutes: 1 }] } })).toEqual(expect.arrayContaining(['step 2: weights increase step by step', 'the last step sends 100% of the traffic']));
    expect(at({ flags: [{ id: 'f', label: 'f', version: 'v3', errorPermille: 0, exposure: [{ at: 0, percent: 10 }] }] })).toContain('flag f: version v3 is not v1 or v2');
    expect(at({ gate: { metric: 'error-rate', max: 2000, minRequests: 1 } })).toContain('the gate max is a whole number (‰ for error-rate, ms for p95)');
  });
});

// ---- exercises -----------------------------------------------------------------------------------------------------
const content = devopsContent();
const ex = (id: string) => exercises().find(e => e.id === id)!;
describe('devops exercises: answers computed from the data', () => {
  it('computes each query', () => {
    expect(devopsQueryValue({ task: 'dora', history: 'team-a', metric: 'per-week' }, content)).toEqual({ type: 'number', value: 2.5, decimals: 1, unit: '次／週' });
    expect(devopsQueryValue({ task: 'dora-best', histories: ['team-a', 'team-b'], metric: 'change-fail-rate' }, content)).toMatchObject({ type: 'text', value: 'team-b' });
    expect(devopsQueryValue({ task: 'rollout', rollout: 'checkout', metric: 'running-at', minute: 4 }, content)).toMatchObject({ value: 5 });
    expect(devopsQueryValue({ task: 'rollout', rollout: 'checkout', metric: 'served-to-at', minute: 4 }, content)).toMatchObject({ value: 500 });
    expect(devopsQueryValue({ task: 'rollout', rollout: 'bad-canary', metric: 'final-version' }, content)).toMatchObject({ value: 'v1' });
    expect(devopsQueryValue({ task: 'rollout', rollout: 'bad-canary', metric: 'gate-permille', step: 1 }, content)).toMatchObject({ value: 50, unit: '‰' });
    expect(devopsQueryValue({ task: 'rollout', rollout: 'bad-canary', metric: 'outcome', gate: null }, content)).toMatchObject({ value: 'completed' });
    expect(() => devopsQueryValue({ task: 'rollout', rollout: 'checkout', metric: 'rolled-back-at' }, content)).toThrow(/no rollback/);
    expect(() => devopsQueryValue({ task: 'rollout', rollout: 'checkout', metric: 'running-at' }, content)).toThrow(/needs a minute/);
    expect(() => devopsQueryValue({ task: 'dora', history: 'team-x', metric: 'failed' }, content)).toThrow(/no history team-x/);
    expect(() => devopsQueryValue({ task: 'rollout', rollout: 'checkout', metric: 'errors', strategy: { kind: 'rolling', maxSurge: 0, maxUnavailable: 0 } }, content)).toThrow(/cannot both be 0/);
    expect(() => devopsQueryValue({ task: 'dora-best', histories: ['team-a', 'team-a'], metric: 'per-week' }, content)).toThrow(/tie/);
  });
  it('reads numbers as typed and compares them exactly at the value\'s decimals', () => {
    expect([parseDevopsNumber('１２０'), parseDevopsNumber('120 分鐘'), parseDevopsNumber('1,000'), parseDevopsNumber('40%'), parseDevopsNumber('abc')]).toEqual([120, 120, 1000, 40, undefined]);
    const v = { type: 'number' as const, value: 2.5, decimals: 1, unit: '次／週' };
    expect(['2.5', '2.50', '2.5 次／週'].map(t => matchesDevopsValue(v, t))).toEqual([true, true, true]);
    expect(['2.46', '3', '2'].map(t => matchesDevopsValue(v, t))).toEqual([false, false, false]);
    const o = devopsQueryValue({ task: 'rollout', rollout: 'bad-canary', metric: 'outcome' }, content);
    expect(['回滾', 'Rolled Back', 'rolled-back', '完成'].map(t => matchesDevopsValue(o, t))).toEqual([true, true, true, false]);
  });
  it('accepts the right answers and rejects the wrong ones', () => {
    expect(checkDevopsAnswer(ex('x-per-week'), content, { value: '2.5' }).ok).toBe(true);
    expect(checkDevopsAnswer(ex('x-per-week'), content, { value: '' }).messages).toEqual(['還沒有填「每週部署次數」。']);
    expect(checkDevopsAnswer(ex('x-per-week'), content, { value: '兩次' }).messages).toEqual(['「每週部署次數」要填一個數字（到小數點後 1 位）。']);
    expect(checkDevopsAnswer(ex('x-dora'), content, { lead: '120', cfr: '40%', rec: '83' }).ok).toBe(true);
    expect(checkDevopsAnswer(ex('x-dora'), content, { lead: '195', cfr: '40', rec: '83' }).messages).toEqual(['「變更前置時間中位數（分鐘）」不對：回到探索器，照題目的設定再算一次。']);
    expect(checkDevopsAnswer(ex('x-best'), content, { choice: '1' }).ok).toBe(true);
    expect(checkDevopsAnswer(ex('x-best'), content, { choice: '0' }).ok).toBe(false);
    expect(checkDevopsAnswer(ex('x-dropped'), content, { value: '800' }).ok).toBe(true);
    expect(checkDevopsAnswer(ex('x-canary'), content, { errors: '25', at: '4', step: '1' }).ok).toBe(true);
    expect(checkDevopsAnswer(ex('x-outcome'), content, { value: '回滾' }).ok).toBe(true);
    expect(checkDevopsAnswer(ex('x-strategy'), content, { choice: '0' }).ok).toBe(true);
    for (const e of exercises()) {
      expect(checkDevopsAnswer(e, content, referenceAnswer(e, content)).ok, e.id).toBe(true);
      for (const m of e.mistakes) expect(checkDevopsAnswer(e, content, m.answer).ok, `${e.id}: ${m.why}`).toBe(false);
    }
  });
  it('checks a rollout plan by simulating the learner\'s parameters', () => {
    const plan = ex('x-plan');
    expect(checkDevopsAnswer(plan, content, { maxSurge: '1', maxUnavailable: '0' })).toEqual({ ok: true, messages: [] });
    expect(checkDevopsAnswer(plan, content, { maxSurge: '25%', maxUnavailable: '0%' })).toEqual({ ok: true, messages: [] });
    expect(checkDevopsAnswer(plan, content, { maxSurge: '0', maxUnavailable: '1' }).messages).toEqual(['丟棄的請求有 800，超過上限 0。']);
    expect(checkDevopsAnswer(plan, content, { maxSurge: '2', maxUnavailable: '0' }).messages).toEqual(['同時執行的執行個體有 6，超過上限 5。']);
    expect(checkDevopsAnswer(plan, content, { maxSurge: '0', maxUnavailable: '0' }).messages[0]).toMatch(/不能同時是 0/);
    expect(checkDevopsAnswer(plan, content, { maxSurge: 'x', maxUnavailable: '' }).messages).toEqual(['「maxSurge」要填個數（整數）或百分比（例如 25%）。', '還沒有填「maxUnavailable」。']);
    expect(parsePlan('canary', { steps: '10/5，50%/5、100/10 分鐘' })).toEqual({ strategy: { kind: 'canary', steps: [{ weight: 10, holdMinutes: 5 }, { weight: 50, holdMinutes: 5 }, { weight: 100, holdMinutes: 10 }] }, messages: [] });
    expect(parsePlan('canary', { steps: '10 then 100' }).messages).toEqual(['步驟要寫成「流量%/觀察分鐘」，用逗號分開，例如 10/5, 50/5, 100/5。']);
    expect(parsePlan('blue-green', { verifyMinutes: '1', keepBlueMinutes: '3 分鐘' })).toEqual({ strategy: { kind: 'blue-green', verifyMinutes: 1, keepBlueMinutes: 3 }, messages: [] });
    // A canary plan on the faulty version: completing is impossible, rolling back early keeps the errors low.
    const canaryPlan: DevopsExercise = { id: 'c', kind: 'rollout-plan', title: 't', statement: 's', hints: ['h'], explanation: 'e', mistakes: [{ answer: { steps: '50/2, 100/2' }, why: 'w' }],
      plan: { rollout: 'bad-canary', strategy: 'canary', constraints: { maxErrors: 20, outcome: 'rolled-back' }, reference: { kind: 'canary', steps: [{ weight: 10, holdMinutes: 2 }, { weight: 100, holdMinutes: 2 }] } } };
    expect(checkDevopsAnswer(canaryPlan, content, { steps: '10/2, 100/2' }).ok).toBe(true);
    expect(checkDevopsAnswer(canaryPlan, content, { steps: '50/2, 100/2' }).messages[0]).toMatch(/^錯誤的請求有 \d+，超過上限 20。$/);
    // CICD-5: gateFailed — a step too small to judge also rolls back with few errors; with gateFailed it does not pass.
    // (10% for 2 minutes is 200 requests, below the gate's minimum: it rolls back with 19 errors without judging; 25% is 500 and fails with 34.)
    const judged: DevopsExercise = { ...canaryPlan, mistakes: [{ answer: { steps: '10/2, 100/2' }, why: 'w' }],
      plan: { ...canaryPlan.plan, constraints: { maxErrors: 40, outcome: 'rolled-back', gateFailed: true }, reference: { kind: 'canary', steps: [{ weight: 25, holdMinutes: 2 }, { weight: 100, holdMinutes: 2 }] } } } as DevopsExercise;
    expect(checkDevopsAnswer(judged, content, { steps: '25/2, 100/2' }).ok).toBe(true);
    expect(checkDevopsAnswer(judged, content, { steps: '10/2, 100/2' }).messages).toEqual(['第 1 步只收到 200 個請求，樣本不足就中止了；要讓閘門在足夠的樣本上判定失敗。']);
    expect(devopsContentProblems({ ...devopsContent(), exercises: [judged] })).toEqual([]);
    expect(constraintTexts({ outcome: 'rolled-back', gateFailed: true })).toEqual(['結果是「回滾」', '由閘門在足夠的樣本上判定失敗而中止']);
    expect(devopsContentProblems({ ...devopsContent(), exercises: [{ ...judged, plan: { ...(judged as Extract<DevopsExercise, { kind: 'rollout-plan' }>).plan, strategy: 'rolling', reference: { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 } } } as DevopsExercise] }))
      .toContain('exercise c: gateFailed is true, for a canary plan');
  });
  it('validates content: computable answers, sound choices, failing mistakes, a passing reference plan', () => {
    expect(devopsContentProblems(content)).toEqual([]);
    const withExercise = (e: DevopsExercise): DevopsLessonContent => ({ ...devopsContent(), exercises: [e] });
    expect(devopsContentProblems({ exercises: [] })).toEqual(['a devops-explorer lesson needs at least one explorer (a history, a rollout or a dashboard)']);
    expect(devopsContentProblems(withExercise({ ...ex('x-per-week'), mistakes: [{ answer: { value: '2.5' }, why: '其實是對的' }] })))
      .toEqual(['exercise x-per-week: the typical mistake "其實是對的" passes the check']);
    expect(devopsContentProblems(withExercise({ ...ex('x-per-week'), mistakes: [{ answer: { lead: '1' }, why: '錯的欄位' }] })))
      .toEqual(['exercise x-per-week: the typical mistake "錯的欄位" answers lead, which the exercise does not ask']);
    expect(devopsContentProblems(withExercise({ ...ex('x-outcome'), kind: 'number' } as DevopsExercise))).toEqual(['exercise x-outcome: blank o: a number exercise asks for a number']);
    expect(devopsContentProblems(withExercise({ ...ex('x-per-week'), kind: 'field' } as DevopsExercise))).toEqual(['exercise x-per-week: blank f: a numeric answer is a number exercise']);
    const choice = ex('x-best') as Extract<DevopsExercise, { kind: 'choice' }>;
    expect(devopsContentProblems(withExercise({ ...choice, options: [{ value: 'team-a', label: 'A' }, { value: 'team-c', label: 'C' }] }))[0])
      .toMatch(/the data \(team-b\) makes no option right; exactly one option must be/);
    expect(devopsContentProblems(withExercise({ ...ex('x-dropped'), blank: { id: 'd', label: '丟棄', query: { task: 'rollout', rollout: 'nope', metric: 'dropped' } } } as DevopsExercise)))
      .toEqual(['exercise x-dropped: blank d: no rollout nope']);
    const plan = ex('x-plan') as Extract<DevopsExercise, { kind: 'rollout-plan' }>;
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, reference: { kind: 'rolling', maxSurge: 0, maxUnavailable: 1 } } }))[0])
      .toMatch(/^exercise x-plan: the reference plan breaks its constraints: 丟棄的請求有 800/);
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, reference: { kind: 'recreate' } } }))).toEqual(['exercise x-plan: the reference plan is recreate, not rolling']);
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, constraints: {} } }))).toContain('exercise x-plan: a plan needs at least one constraint');
    expect(devopsContentProblems({ ...devopsContent(), histories: [{ ...devopsContent().histories![0], history: { ...teamA(), days: 400 } }] })).toEqual(['history team-a: days must be 1…366']);
    expect(devopsContentProblems({ ...devopsContent(), rollouts: [...devopsContent().rollouts!, { ...devopsContent().rollouts![0] }] })).toContain('duplicate id checkout');
  });
});

describe('a synthetic CICD10 lesson (deployment-simulator)', () => {
  it('validates and passes the publish gate', () => {
    expect(meta).toMatchObject({ activity: 'deployment-simulator', capabilities: ['devops-explorer'], visualizationType: 'none' });
    expect(validateContent(meta, devopsLesson(), curriculum.visualizations)).toEqual([]);
    expect(publishProblems(meta, devopsLesson())).toEqual([]);
  });
  it('ties content to the capability and the activity to a history or rollout', () => {
    const { devops: _d, ...without } = devopsLesson();
    void _d;
    expect(validateContent(meta, without, curriculum.visualizations)).toContain('CICD10: the devops-explorer capability needs its content');
    const hidden = devopsLesson(); hidden.sections[2].blocks.pop();
    expect(validateContent(meta, hidden, curriculum.visualizations)).toContain('CICD10: example flag is never shown');
    const wrong = devopsLesson(); wrong.devops!.exercises[0].mistakes = [];
    expect(validateContent(meta, wrong, curriculum.visualizations)).toContain('CICD10: exercise x-per-week: needs at least one typical mistake (it shows the check rejects it)');
    // A network lesson cannot carry devops content.
    const cn = lessons.find(l => l.lessonId === 'CN01')!;
    expect(validateContent(cn, { ...curriculum.contents.CN01!, devops: devopsContent() }, curriculum.visualizations)).toContain('CN01: has devops-explorer content without the devops-explorer capability');
  });
  it('pairs devops-explorer with terminal and visualization only, and needs its activity without the terminal', () => {
    // The rules on a published lesson's place (DKR04, a terminal lesson).
    const swap = (patch: Partial<LessonMeta>) => validateCurriculum({ ...curriculum, lessons: lessons.map(l => l.lessonId === 'DKR04' ? { ...l, ...patch } : l) }).join('\n');
    expect(swap({ capabilities: ['terminal', 'devops-explorer'] })).not.toMatch(/DKR04: devops-explorer is combined|DKR04: a devops-explorer lesson/);
    expect(swap({ capabilities: ['devops-explorer'] })).toMatch(/DKR04: a devops-explorer lesson without the terminal names deployment-simulator or monitoring-dashboard as its activity/);
    expect(swap({ capabilities: ['devops-explorer', 'network-protocol'], activity: 'deployment-simulator' })).toMatch(/DKR04: devops-explorer is combined with terminal and visualization only/);
    expect(swap({ capabilities: ['terminal'], activity: 'deployment-simulator' })).toMatch(/DKR04: activity deployment-simulator needs the devops-explorer capability/);
  });
});

// ---- D3 ------------------------------------------------------------------------------------------------------------
describe('D3: series generated from a declared shape', () => {
  it('adds the steps, ramps and spikes as documented, clamped to 0', () => {
    // 10, step +5 from 2, ramp +8 over 4–7 (⌊8 × k ÷ 4⌋ = 2, 4, 6, 8), spike −30 at 9–10.
    expect(generateSeries({ seed: 1, baseline: 10, changes: [{ kind: 'step', at: 2, delta: 5 }, { kind: 'ramp', from: 4, to: 8, delta: 8 }, { kind: 'spike', at: 9, minutes: 2, delta: -30 }] }, 12))
      .toEqual([10, 10, 15, 15, 17, 19, 21, 23, 23, 0, 0, 23]);
    // A falling ramp floors too: ⌊−5 × 1 ÷ 2⌋ = −3, then −5.
    expect(generateSeries({ seed: 1, baseline: 10, changes: [{ kind: 'ramp', from: 0, to: 2, delta: -5 }] }, 3)).toEqual([7, 5, 5]);
  });
  it('draws the noise from the seeded generator, one draw a minute, deterministically', () => {
    const shape = { seed: 42, baseline: 100, noise: 5 };
    const v = generateSeries(shape, 50);
    expect(v).toEqual(draws(42, 50).map(u => 100 + Math.floor(u * 11) - 5));
    expect(generateSeries(shape, 50)).toEqual(v);
    expect(v.every(x => x >= 95 && x <= 105)).toBe(true);
    expect(new Set(v).size).toBeGreaterThan(5);
    expect(generateSeries({ ...shape, seed: 43 }, 50)).not.toEqual(v);
    // The api fixture's errors: the incident, the one-minute blip and the ramp, as generated.
    const errors = seriesValues(api().series[2], 180);
    expect([errors[60], errors[100], errors[101], errors[130], errors[131], errors[145]]).toEqual([41, 29, 4, 8, 11, 3]);
  });
  it('rejects series and dashboards that are inconsistent', () => {
    const s = tiny().series[0];
    expect(seriesProblems({ ...s, values: [1, 2] }, 12)).toEqual(['has 2 values for 12 minutes']);
    expect(seriesProblems({ ...s, signal: 'speed' as 'latency' }, 12)).toEqual(['signal must be one of latency, traffic, errors, saturation']);
    expect(seriesProblems({ ...s, shape: { seed: 1, baseline: 1 } }, 12)).toEqual(['needs either values or a shape (not both)']);
    expect(seriesProblems({ ...s, values: undefined, shape: { seed: -1, baseline: 1, changes: [{ kind: 'ramp', from: 5, to: 5, delta: 1 }, { kind: 'spike', at: 12, minutes: 1, delta: 0 }] } }, 12))
      .toEqual(['the seed is a whole number 0…4294967295', 'change 1 (ramp): 0 ≤ from < to ≤ 12', 'change 2 (spike): delta is a whole number other than 0', 'change 2 (spike): at is a minute of the dashboard (0…11)']);
    const d = tiny();
    expect(dashboardProblems({ ...d, minutes: 0 })).toEqual(['minutes must be 1…360']);
    expect(dashboardProblems({ ...d, incidents: [{ id: 'i1', label: 'x', start: 3, end: 6 }, { id: 'i2', label: 'y', start: 5, end: 8 }] })).toEqual(['incident i2: incidents are listed in order and do not overlap']);
    expect(dashboardProblems({ ...d, incidents: [{ id: 'err', label: 'x', start: 6, end: 3 }] })).toEqual(['duplicate id err', 'incident err: 0 ≤ start < end ≤ 12']);
    expect(dashboardProblems({ ...d, rules: [{ ...d.rules![0], series: 'p99', threshold: 1.5, forMinutes: -1 }] }))
      .toEqual(['rule spike: no series p99', 'rule spike: the threshold is a whole number ≥ 0', 'rule spike: for is a whole number of minutes 0…60']);
    expect(dashboardProblems({ ...d, rules: [{ ...d.rules![0], window: { agg: 'avg', minutes: 13 } }] })).toEqual(['rule spike: the window is 1…12 minutes']);
    const a = api();
    expect(dashboardProblems({ ...a, incidents: [{ ...a.incidents![0], events: [{ at: 65, kind: 'acknowledged', text: 't' }, { at: 66, kind: 'detected', text: 't' }] }] }))
      .toEqual(['incident a: detected, acknowledged, mitigated and resolved happen in that order']);
    expect(dashboardProblems({ ...a, severity: { ...a.severity!, rows: [...a.severity!.rows].reverse() } })).toEqual(['the severity rows go from the most users down to minUsersPercent 0']);
    expect(dashboardProblems(a)).toEqual([]);
  });
});

describe('D3: alert rules evaluated minute by minute (tiny, worked out in tests/support/dashboard-fixture.ts)', () => {
  const d = tiny();
  const run = (id: string) => evaluateOn(d, d.rules!.find(r => r.id === id)!);
  it('fires at once with for 0: two notifications, one of them a false alert', () => {
    const r = run('spike');
    expect(r.states).toEqual(['inactive', 'inactive', 'inactive', 'firing', 'firing', 'firing', 'resolved', 'inactive', 'firing', 'resolved', 'inactive', 'inactive']);
    expect(r.intervals).toEqual([{ start: 3, end: 6, open: false, incident: 'i1' }, { start: 8, end: 9, open: false }]);
    expect(r.incidents).toEqual([{ id: 'i1', label: '結帳失敗', start: 3, detectedAt: 3, delay: 0 }]);
    expect([r.notifications, r.falseAlerts, r.missed, r.detected, r.firingMinutes, r.firstFiring, r.firstResolved]).toEqual([2, 1, 0, 1, 4, 3, 6]);
  });
  it('stays pending for `for` minutes, and a short spike never fires', () => {
    const r = run('patient');
    expect(r.states).toEqual(['inactive', 'inactive', 'inactive', 'pending', 'pending', 'firing', 'resolved', 'inactive', 'pending', 'inactive', 'inactive', 'inactive']);
    expect([r.notifications, r.falseAlerts, r.incidents[0].delay]).toEqual([1, 0, 2]);
  });
  it('compares a window average exactly, has no value before the window is full, and shows it to one decimal', () => {
    const r = run('smooth');
    expect(r.values.slice(0, 5)).toEqual([undefined, undefined, { sum: 4, count: 3 }, { sum: 12, count: 3 }, { sum: 20, count: 3 }]);
    expect(r.values.map(ruleValueText)).toEqual(['—', '—', '1.3', '4.0', '6.7', '9.0', '6.3', '3.7', '3.3', '3.3', '3.3', '1.0']);
    expect(r.intervals).toEqual([{ start: 4, end: 7, open: false, incident: 'i1' }]);
    expect([r.notifications, r.falseAlerts, r.incidents[0].delay]).toEqual([1, 0, 1]);
    // 15 ÷ 3 = 5 exactly: > 5 does not hold, >= 5 does (no rounding in the comparison).
    const series = { ...d.series[0], values: [5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(evaluateAlert({ series: 'err', op: '>', threshold: 5, window: { agg: 'avg', minutes: 3 }, forMinutes: 0 }, series, 12).holds[2]).toBe(false);
    expect(evaluateAlert({ series: 'err', op: '>=', threshold: 5, window: { agg: 'avg', minutes: 3 }, forMinutes: 0 }, series, 12).holds[2]).toBe(true);
  });
  it('uses max and min windows, the other operators, and leaves an interval open at the end', () => {
    const max = evaluateOn(d, { series: 'err', op: '>=', threshold: 8, window: { agg: 'max', minutes: 2 }, forMinutes: 0 });
    expect(max.intervals).toEqual([{ start: 3, end: 7, open: false, incident: 'i1' }, { start: 8, end: 10, open: false }]);
    const min = evaluateOn(d, { series: 'err', op: '<', threshold: 2, window: { agg: 'min', minutes: 2 }, forMinutes: 0 });
    // Minimum of 1 1 | 1 2 | 2 9 | 9 9 | 9 9 | 9 1 | 1 1 | 1 8 | 8 1 | 1 1 | 1 1 < 2: holds at 1, 2 and 6–11.
    expect(min.states.map(s => s[0]).join('')).toBe('iffriiffffff');
    expect(min.intervals).toEqual([{ start: 1, end: 3, open: false }, { start: 6, end: 12, open: true }]);
    // Firing before the incident and through its start: detected at its start, delay 0, not a false alert.
    const low = evaluateOn(d, { series: 'err', op: '>=', threshold: 1, forMinutes: 0 });
    expect([low.intervals, low.incidents[0].delay, low.falseAlerts]).toEqual([[{ start: 0, end: 12, open: true, incident: 'i1' }], 0, 0]);
  });
  it('misses an incident when the rule fires only after it ended (late: the interval is also a false alert)', () => {
    const late = evaluateOn(d, { series: 'err', op: '>', threshold: 5, window: { agg: 'avg', minutes: 3 }, forMinutes: 2 });
    expect(late.intervals).toEqual([{ start: 6, end: 7, open: false }]);
    expect([late.missed, late.falseAlerts]).toEqual([1, 1]);
    const short: Dashboard = { ...d, incidents: [{ id: 'i1', label: '結帳失敗', start: 3, end: 5 }] };
    const r = evaluateOn(short, { series: 'err', op: '>', threshold: 5, forMinutes: 2 });
    expect([r.incidents[0].detectedAt, r.missed, r.falseAlerts]).toEqual([undefined, 1, 1]);
    expect(conditionText({ series: 'err', op: '>', threshold: 5, window: { agg: 'avg', minutes: 3 }, forMinutes: 2 }, d.series[0])).toBe('錯誤率（‰）的 3 分鐘平均 > 5，持續 2 分鐘才觸發');
  });
  it('evaluates the api rules: alert fatigue against detection delay', () => {
    const a = api();
    const noisy = evaluateOn(a, a.rules![0]), slow = evaluateOn(a, a.rules![1]);
    expect(noisy.intervals.map(i => [i.start, i.end, i.incident ?? '誤報'])).toEqual([[60, 68, 'a'], [100, 101, '誤報'], [131, 145, 'b']]);
    expect(slow.intervals.map(i => [i.start, i.end, i.incident ?? '誤報'])).toEqual([[66, 76, 'a'], [140, 151, 'b']]);
    expect([noisy.notifications, noisy.falseAlerts, noisy.incidents.map(i => i.delay)]).toEqual([3, 1, [0, 1]]);
    expect([slow.notifications, slow.falseAlerts, slow.incidents.map(i => i.delay)]).toEqual([2, 0, [6, 10]]);
    // CPU sees the database incident only.
    const cpu = evaluateOn(a, { series: 'cpu', op: '>', threshold: 70, forMinutes: 2 });
    expect([cpu.incidents.map(i => i.delay), cpu.missed]).toEqual([[undefined, 2], 1]);
  });
});

describe('D3: incident timelines and severity', () => {
  it('computes the times from the events and the severity from the matrix', () => {
    const [a, b] = api().incidents!;
    expect(incidentTimes(a)).toEqual({ detect: 2, acknowledge: 3, mitigate: 8, recover: 8 });
    expect(incidentTimes(b)).toEqual({ detect: 4, acknowledge: 4, mitigate: 15, recover: 15 });
    expect(incidentTimes({ id: 'x', label: 'x', start: 0, end: 5 })).toEqual({ recover: 5 });
    const m = api().severity!;
    // a: 40% → row 0, 8 minutes → column 2 → SEV2; b: 3% → row 2, 15 minutes → column 1 → SEV3.
    expect(severityOf(a, m)).toEqual({ level: 'SEV2', row: 0, column: 2 });
    expect(severityOf(b, m)).toEqual({ level: 'SEV3', row: 2, column: 1 });
    expect(severityOf({ ...a, usersPercent: 30, end: 90 }, m)).toEqual({ level: 'SEV1', row: 0, column: 0 });
    expect(severityOf({ ...a, usersPercent: undefined }, m)).toBeUndefined();
  });
});

describe('D3 exercises: alert-eval, golden signals, incidents and the alert-rule task', () => {
  const c = dashboardContent();
  const dx = (id: string) => dashboardExercises().find(e => e.id === id)!;
  it('computes the series, alert and incident queries', () => {
    const q = (query: Parameters<typeof devopsQueryValue>[0]) => devopsQueryValue(query, c);
    expect(q({ task: 'alert', dashboard: 'api', rule: 'noisy', metric: 'first-firing' })).toMatchObject({ value: 60, unit: '分鐘' });
    expect(q({ task: 'alert', dashboard: 'api', rule: 'slow', metric: 'detection-delay', incident: 'a' })).toMatchObject({ value: 6 });
    expect(q({ task: 'alert', dashboard: 'tiny', rule: 'spike', metric: 'first-resolved' })).toMatchObject({ value: 6 });
    expect(q({ task: 'alert', dashboard: 'tiny', rule: { series: 'err', op: '>', threshold: 5, forMinutes: 1 }, metric: 'notifications' })).toMatchObject({ value: 1 });
    expect(q({ task: 'alert', dashboard: 'tiny', rule: 'smooth', metric: 'value-at', minute: 4 })).toEqual({ type: 'number', value: 6.7, decimals: 1, unit: '‰' });
    expect(q({ task: 'alert', dashboard: 'tiny', rule: 'spike', metric: 'value-at', minute: 4 })).toEqual({ type: 'number', value: 9, decimals: 0, unit: '‰' });
    const state = q({ task: 'alert', dashboard: 'tiny', rule: 'patient', metric: 'state-at', minute: 4 });
    expect(['pending', '等待中', 'PENDING', '觸發中'].map(t => matchesDevopsValue(state, t))).toEqual([true, true, true, false]);
    expect(q({ task: 'series', dashboard: 'api', series: 'errors', metric: 'value-at', minute: 100 })).toMatchObject({ value: 29, unit: '‰' });
    expect(q({ task: 'series', dashboard: 'api', series: 'p95', metric: 'max-at' })).toMatchObject({ unit: '分鐘' });
    const signal = q({ task: 'series', dashboard: 'api', series: 'cpu', metric: 'signal' });
    expect(['saturation', '飽和度', 'Saturation', '流量'].map(t => matchesDevopsValue(signal, t))).toEqual([true, true, true, false]);
    expect(q({ task: 'incident', dashboard: 'api', incident: 'b', metric: 'severity' })).toMatchObject({ value: 'SEV3' });
    expect(q({ task: 'incident', dashboard: 'api', incident: 'b', metric: 'time-to-acknowledge' })).toMatchObject({ value: 4 });
    expect(() => q({ task: 'alert', dashboard: 'api', rule: 'noisy', metric: 'detection-delay' })).toThrow(/needs an incident/);
    expect(() => q({ task: 'alert', dashboard: 'api', rule: { series: 'cpu', op: '>', threshold: 70, forMinutes: 2 }, metric: 'detection-delay', incident: 'a' })).toThrow(/misses incident a/);
    expect(() => q({ task: 'alert', dashboard: 'tiny', rule: 'smooth', metric: 'value-at', minute: 1 })).toThrow(/before its window is full/);
    expect(() => q({ task: 'alert', dashboard: 'tiny', rule: 'spike', metric: 'state-at' })).toThrow(/needs a minute/);
    expect(() => q({ task: 'alert', dashboard: 'tiny', rule: 'nope', metric: 'notifications' })).toThrow(/no rule nope/);
    expect(() => q({ task: 'alert', dashboard: 'tiny', rule: { series: 'err', op: '>', threshold: -1, forMinutes: 0 }, metric: 'notifications' })).toThrow(/threshold/);
    expect(() => q({ task: 'incident', dashboard: 'tiny', incident: 'i1', metric: 'time-to-detect' })).toThrow(/no detected event/);
    expect(() => q({ task: 'incident', dashboard: 'tiny', incident: 'i1', metric: 'severity' })).toThrow(/no severity matrix/);
    expect(() => q({ task: 'series', dashboard: 'nope', series: 'x', metric: 'max' })).toThrow(/no dashboard nope/);
  });
  it('accepts every reference answer and rejects every typical mistake', () => {
    expect(devopsContentProblems(c)).toEqual([]);
    for (const e of dashboardExercises()) {
      expect(checkDevopsAnswer(e, c, referenceAnswer(e, c)).ok, e.id).toBe(true);
      for (const m of e.mistakes) expect(checkDevopsAnswer(e, c, m.answer).ok, `${e.id}: ${m.why}`).toBe(false);
    }
    expect(referenceAnswer(dx('x-noisy'), c)).toEqual({ n: '3', f: '1', d: '1' });
    expect(referenceAnswer(dx('x-incident'), c)).toEqual({ ttd: '2', ttr: '8', sev: 'SEV2' });
    expect(checkDevopsAnswer(dx('x-signals'), c, { p95: 'latency', rpm: 'Traffic', errors: '錯誤率', cpu: '使用率' }).ok).toBe(true);
    expect(checkDevopsAnswer(dx('x-average'), c, { value: '6.67' }).ok).toBe(false);
  });
  it('checks an alert rule by evaluating the learner\'s own rule against the constraints', () => {
    const e = dx('x-rule');
    const rule = (patch: Record<string, string>) => checkDevopsAnswer(e, c, { series: 'errors', op: '>', threshold: '10', agg: 'none', window: '', for: '1', ...patch });
    expect(rule({})).toEqual({ ok: true, messages: [] });
    // Any rule that meets the constraints passes: a 2-minute minimum, or for 2.
    expect(rule({ agg: 'min', window: '2', for: '0' }).ok).toBe(true);
    expect(rule({ for: '2 分鐘' }).ok).toBe(true);
    expect(rule({ for: '0' }).messages).toEqual(['誤報有 1 次，超過上限 0。']);
    expect(rule({ agg: 'avg', window: '10', for: '5' }).messages).toEqual([
      '事故「有問題的版本」第 60 分鐘開始，第 66 分鐘才觸發，延遲 6 分鐘，超過 3 分鐘。', '事故「資料庫連線耗盡」第 130 分鐘開始，第 140 分鐘才觸發，延遲 10 分鐘，超過 3 分鐘。']);
    expect(rule({ series: 'cpu', threshold: '70', for: '2' }).messages).toEqual(['事故「有問題的版本」在它持續的期間沒有觸發告警（漏掉了）。']);
    expect(rule({ threshold: '', op: '=', for: 'x' }).messages).toEqual(['「比較」要選 >、>=、< 或 <=。', '還沒有填「門檻（整數）」。', '「持續多久才觸發（分鐘）」要填 0 以上的整數。']);
    expect(rule({ agg: 'avg', window: '' }).messages).toEqual(['還沒有填「視窗長度（分鐘）」。']);
    expect(rule({ agg: 'avg', window: '200' }).messages).toEqual(['視窗要填 1–60 的整數分鐘。']);
    expect(rule({ series: 'latency' }).messages).toEqual(['請選擇一個指標。']);
    expect(parseAlertPlan({ series: 'errors', op: '<=', threshold: '１２', agg: 'max', window: '3 分鐘', for: '0' })).toEqual({
      rule: { series: 'errors', op: '<=', threshold: 12, forMinutes: 0, window: { agg: 'max', minutes: 3 } }, messages: [] });
    expect(alertConstraintTexts({ detectWithin: 3, maxMissed: 0, maxFalseAlerts: 0, maxNotifications: 2 })).toEqual(['每個事故都在開始後 3 分鐘內觸發', '漏掉的事故最多 0 個', '誤報最多 0 次', '通知最多 2 次']);
    const noisy = evaluateOn(api(), api().rules![0]);
    expect(alertViolations({ maxNotifications: 2, maxMissed: 0 }, noisy)).toEqual(['通知有 3 次，超過上限 2。']);
  });
  it('validates alert-rule tasks and dashboard content', () => {
    const plan = dx('x-rule') as Extract<DevopsExercise, { kind: 'alert-rule' }>;
    const withExercise = (e: DevopsExercise): DevopsLessonContent => ({ ...dashboardContent(), exercises: [e] });
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, reference: { series: 'errors', op: '>', threshold: 10, forMinutes: 0 } } })))
      .toEqual(['exercise x-rule: the reference rule breaks its constraints: 誤報有 1 次，超過上限 0。']);
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, constraints: {} } }))).toEqual(['exercise x-rule: an alert-rule task needs at least one constraint']);
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, dashboard: 'nope' } }))).toEqual(['exercise x-rule: no dashboard nope']);
    expect(devopsContentProblems(withExercise({ ...plan, plan: { ...plan.plan, reference: { ...plan.plan.reference, series: 'p99' } } }))).toEqual(['exercise x-rule: the reference rule: no series p99']);
    expect(devopsContentProblems(withExercise({ ...plan, mistakes: [{ answer: { ...alertPlanAnswer(plan.plan.reference), for: '2' }, why: '其實也對' }] })))
      .toEqual(['exercise x-rule: the typical mistake "其實也對" passes the check']);
    const tinyOnly: DevopsLessonContent = { dashboards: [{ ...dashboardContent().dashboards![0] }], exercises: [{ ...plan, plan: { ...plan.plan, dashboard: 'tiny', constraints: { maxNotifications: 1 }, reference: { series: 'err', op: '>', threshold: 5, forMinutes: 2 } }, mistakes: [{ answer: { series: 'err', op: '>', threshold: '5', agg: 'none', window: '', for: '0' }, why: '兩次通知' }] }] };
    expect(devopsContentProblems(tinyOnly)).toEqual([]);
    expect(devopsContentProblems({ ...dashboardContent(), dashboards: [{ ...dashboardContent().dashboards![0], dashboard: { ...tiny(), service: ' ' } }] })).toEqual(['dashboard tiny: needs a service name']);
  });
});

describe('a synthetic CICD11 lesson (monitoring-dashboard)', () => {
  const m11 = metaOf('CICD11', cicdFromBlueprint('CICD11', '用儀表板讀四大黃金訊號，設定有行動意義的告警（測試用大綱）。', 50));
  it('validates and passes the publish gate', () => {
    expect(m11).toMatchObject({ activity: 'monitoring-dashboard', capabilities: ['devops-explorer'], visualizationType: 'none' });
    expect(validateContent(m11, dashboardLesson(), curriculum.visualizations)).toEqual([]);
    expect(publishProblems(m11, dashboardLesson())).toEqual([]);
  });
  it('needs a dashboard for the monitoring-dashboard activity, and a history or rollout for deployment-simulator', () => {
    const noDashboard = dashboardLesson();
    noDashboard.devops = { ...devopsContent(), exercises: [] };
    noDashboard.sections = devopsLesson().sections;
    expect(validateContent(m11, noDashboard, curriculum.visualizations)).toContain('CICD11: the monitoring-dashboard activity needs at least one of content.devops.dashboards');
    expect(validateContent(meta, { ...devopsLesson(), devops: { ...dashboardContent() }, sections: dashboardLesson().sections }, curriculum.visualizations))
      .toContain('CICD10: the deployment-simulator activity needs at least one of content.devops.histories or content.devops.rollouts');
    const hidden = dashboardLesson(); hidden.sections[2].blocks.pop();
    expect(validateContent(m11, hidden, curriculum.visualizations)).toContain('CICD11: example api-slow is never shown');
  });
});
