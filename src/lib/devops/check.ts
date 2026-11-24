import { dashboardProblems } from './dashboard';
import { ALERT_FIELDS, alertPlanAnswer, alertPlanProblems, checkAlertPlan, dashboardQueryValue } from './dashboard-check';
import { checkRedact, logsExplorerProblems, logsQueryValue, REDACT_FIELD, redactAnswer, redactTaskProblems } from './logs-check';
import { checkSamplingPlan, SAMPLING_FIELDS, samplingAnswer, samplingPlanProblems } from './sampling-check';
import { tracesExplorerProblems, tracesQueryValue } from './traces-check';
import { burnAlertProblems, burnAnswer, BURN_FIELDS, checkBurnAlert, sloQueryValue } from './slo-check';
import { sloProblems } from './slo';
import { doraMetrics, historyProblems, type DoraMetrics } from './history';
import { rolloutProblems, simulateRollout, strategyIssues, strategyProblems, strategyText, type InstanceAmount, type RolloutResult, type RolloutScenario, type Strategy } from './rollout';
import { DORA_METRICS, DORA_RANKED, devopsExplorers, ROLLOUT_METRICS, ROLLOUT_RANKED, type DevopsBlank, type DevopsExercise, type DevopsLessonContent, type DevopsQuery, type DoraMetric, type PlanConstraints, type RolloutPlanTask } from './types';

/*
 * CICD-0 devops-explorer exercises (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §7). An exercise names a query on the
 * lesson's explorers; its answer is computed here from the data (history.ts, rollout.ts), never written in the lesson,
 * and the learner's answer is compared with it: numbers exactly (at the decimals the value has), words without regard
 * to case and spaces, with their Chinese aliases. A rollout-plan exercise simulates the learner's own parameters and
 * checks the constraints. D3's dashboard queries and alert-rule task are in dashboard-check.ts, D4's log queries and
 * redact task in logs-check.ts, D5's trace, sampling and cardinality queries in traces-check.ts and its sampling-plan
 * task in sampling-check.ts, D6's slo and burn queries and burn-alert task in slo-check.ts, dispatched from here.
 * devopsContentProblems is what validateContent runs on `content.devops`.
 */

export type DevopsValue =
  | { type: 'number'; value: number; decimals: number; unit: string }
  /** `list`: an ordered list (D4's services of a trace); typed as words separated by commas, spaces or arrows. */
  | { type: 'text'; value: string; shown: string; aliases: string[]; list?: string[] };

const num = (value: number, unit: string, decimals = 0): DevopsValue => ({ type: 'number', value, decimals, unit });
const OUTCOME_TEXT = { completed: { shown: '完成', aliases: ['完成', '部署完成', '成功'] }, 'rolled-back': { shown: '回滾', aliases: ['回滾', '已回滾', 'rollback', 'rolled back'] },
  'in-progress': { shown: '進行中', aliases: ['進行中', '未完成'] } } as const;

const byId = <T extends { id: string }>(list: readonly T[] | undefined, id: string, what: string): T => {
  const found = list?.find(x => x.id === id);
  if (!found) throw new Error(`no ${what} ${id}`);
  return found;
};

function doraValue(m: DoraMetrics, metric: DoraMetric): DevopsValue {
  const need = (x: number | undefined, what: string) => { if (x === undefined) throw new Error(`the history has no ${what}`); return x; };
  switch (metric) {
    case 'deployments': return num(m.deployments, '次');
    case 'deploy-days': return num(m.deployDays, '天');
    case 'per-week': return num(m.perWeekTenths / 10, '次／週', 1);
    case 'changes': return num(m.leadTimes.length, '個');
    case 'lead-time-median': return num(need(m.leadTimeMedian, 'change'), '分鐘');
    case 'failed': return num(m.failed, '次');
    case 'change-fail-rate': return num(m.changeFailPercent, '%');
    case 'recovery-median': return num(need(m.recoveryMedian, 'failed deployment'), '分鐘');
    case 'detect-median': return num(need(m.detectMedian, 'failed deployment'), '分鐘');
  }
}
const doraScore = (m: DoraMetrics, metric: typeof DORA_RANKED[number]) => {
  const v = doraValue(m, metric);
  // Deployment frequency: more is better; lead time, fail rate and recovery: less is better.
  return metric === 'per-week' ? -(v as { value: number }).value : (v as { value: number }).value;
};

/** The scenario a rollout query runs: the explorer's, with the query's strategy and gate in its place. */
export function scenarioFor(base: RolloutScenario, strategy?: Strategy, gate?: RolloutScenario['gate'] | null): RolloutScenario {
  const s: RolloutScenario = { ...base, ...(strategy ? { strategy } : {}) };
  if (gate === null) delete s.gate; else if (gate) s.gate = gate;
  return s;
}
function simulated(s: RolloutScenario): RolloutResult {
  const problems = strategyProblems(s.strategy, s.fleet.instances);
  if (problems.length) throw new Error(problems.join('; '));
  return simulateRollout(s);
}

function rolloutValue(r: RolloutResult, s: RolloutScenario, q: DevopsQuery & { task: 'rollout' }): DevopsValue {
  const at = (x: number | undefined, what: string) => { if (x === undefined) throw new Error(`the rollout has no ${what}`); return x; };
  const gate = () => {
    if (q.step === undefined) throw new Error(`${q.metric} needs a step`);
    const g = r.gates.find(x => x.step === q.step);
    if (!g) throw new Error(`no gate result for step ${q.step}`);
    return g;
  };
  const row = () => {
    if (q.minute === undefined || !r.rows[q.minute]) throw new Error(`${q.metric} needs a minute of the timeline (0…${s.minutes - 1})`);
    return r.rows[q.minute];
  };
  switch (q.metric) {
    case 'errors': return num(r.totals.errors, '個');
    case 'errors-from': return num(r.totals.errorsBy.from, '個');
    case 'errors-to': return num(r.totals.errorsBy.to, '個');
    case 'dropped': return num(r.totals.dropped, '個');
    case 'affected': return num(r.totals.affected, '個');
    case 'peak-instances': return num(r.totals.peakInstances, '個');
    case 'extra-instance-minutes': return num(r.totals.extraInstanceMinutes, '執行個體分鐘');
    case 'dropped-minutes': return num(r.totals.droppedMinutes, '分鐘');
    case 'completed-at': return num(at(r.completedAt, 'completion (it does not complete)'), '分鐘');
    case 'rolled-back-at': return num(at(r.rolledBackAt, 'rollback'), '分鐘');
    case 'switch-at': return num(at(r.switchAt, 'switch (only blue-green switches)'), '分鐘');
    case 'aborted-step': return num(at(r.abortedStep, 'aborted canary step'), '步');
    case 'outcome': return { type: 'text', value: r.outcome, ...OUTCOME_TEXT[r.outcome], aliases: [r.outcome, ...OUTCOME_TEXT[r.outcome].aliases] };
    case 'final-version': {
      if (r.outcome === 'in-progress') throw new Error('the rollout does not finish, so no version serves everything');
      const v = r.outcome === 'completed' ? s.to : s.from;
      return { type: 'text', value: v.id, shown: v.id, aliases: [v.id, v.label] };
    }
    case 'running-at': return num(row().running, '個');
    case 'served-to-at': return num(row().served.to, '個');
    case 'gate-requests': return num(gate().requests, '個');
    case 'gate-errors': return num(gate().errors, '個');
    case 'gate-permille': return num(gate().permille, '‰');
  }
}

/** A query's value, computed from the lesson's explorers; throws when it names something they do not have. */
export function devopsQueryValue(q: DevopsQuery, c: DevopsLessonContent): DevopsValue {
  switch (q.task) {
    case 'dora': {
      if (!(DORA_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown DORA metric ${q.metric}`);
      return doraValue(doraMetrics(byId(c.histories, q.history, 'history').history), q.metric);
    }
    case 'dora-best': {
      if (!(DORA_RANKED as readonly string[]).includes(q.metric)) throw new Error(`histories cannot be ranked by ${q.metric}`);
      if (q.histories.length < 2) throw new Error('dora-best compares at least two histories');
      const scored = q.histories.map(id => ({ id, score: doraScore(doraMetrics(byId(c.histories, id, 'history').history), q.metric) })).sort((a, b) => a.score - b.score);
      if (scored[0].score === scored[1].score) throw new Error(`histories ${scored[0].id} and ${scored[1].id} tie on ${q.metric}`);
      return { type: 'text', value: scored[0].id, shown: scored[0].id, aliases: [scored[0].id] };
    }
    case 'rollout': {
      if (!(ROLLOUT_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown rollout metric ${q.metric}`);
      const s = scenarioFor(byId(c.rollouts, q.rollout, 'rollout').scenario, q.strategy, q.gate);
      return rolloutValue(simulated(s), s, q);
    }
    case 'rollout-best': {
      if (!(ROLLOUT_RANKED as readonly string[]).includes(q.metric)) throw new Error(`strategies cannot be ranked by ${q.metric}`);
      if (q.candidates.length < 2) throw new Error('rollout-best compares at least two strategies');
      const base = byId(c.rollouts, q.rollout, 'rollout').scenario;
      const scored = q.candidates.map(x => {
        const s = scenarioFor(base, x.strategy);
        return { id: x.id, score: (rolloutValue(simulated(s), s, { task: 'rollout', rollout: q.rollout, metric: q.metric }) as { value: number }).value };
      }).sort((a, b) => a.score - b.score);
      if (scored[0].score === scored[1].score) throw new Error(`candidates ${scored[0].id} and ${scored[1].id} tie on ${q.metric}`);
      return { type: 'text', value: scored[0].id, shown: scored[0].id, aliases: [scored[0].id] };
    }
    case 'series': case 'alert': case 'incident': return dashboardQueryValue(q, c);
    case 'logs': case 'correlate': case 'retention': case 'log-format': return logsQueryValue(q, c);
    case 'trace': case 'sampling': case 'cardinality': return tracesQueryValue(q, c);
    case 'slo': case 'burn': return sloQueryValue(q, c);
  }
}

// ---- checking -----------------------------------------------------------------------------------------------------
const UNIT = /(執行個體分鐘|分鐘|小時|次／週|次\/週|次|個?事件|個|步|天|分|毫秒|ms|%|‰|秒|筆|位元組|bytes|MB|GB|條|個span|spans?|倍|×|x)$/i;
/** A number as the learner may type it: full-width digits, thousands commas, a unit after it (分鐘, %, ‰…). */
export function parseDevopsNumber(text: string): number | undefined {
  const t = text.normalize('NFKC').replace(/\s+/g, '').replace(/[,，]/g, '').replace(UNIT, '');
  return /^[+-]?\d+(?:\.\d+)?$/.test(t) ? Number(t) : undefined;
}
const normWord = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
/** Whether a typed answer is the value: a number exactly at the value's decimals, a word or one of its aliases. */
export function matchesDevopsValue(value: DevopsValue, text: string): boolean {
  if (value.type === 'text') {
    if ([value.value, ...value.aliases].some(a => normWord(a) === normWord(text))) return true;
    const typed = normWord(text).replace(/->|→|>/g, ' ').split(/[\s,，、]+/).filter(Boolean);
    return !!value.list && typed.length === value.list.length && value.list.every((x, i) => normWord(x) === typed[i]);
  }
  const x = parseDevopsNumber(text);
  if (x === undefined) return false;
  const scale = 10 ** value.decimals, scaled = x * scale;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9 && Math.round(scaled) === Math.round(value.value * scale);
}
export const formatDevopsValue = (v: DevopsValue) => v.type === 'text' ? v.shown : `${v.value.toFixed(v.decimals)}${v.unit === '%' || v.unit === '‰' || !v.unit ? v.unit : ` ${v.unit}`}`;

export const blanksOf = (e: DevopsExercise): DevopsBlank[] => e.kind === 'table' ? e.blanks : e.kind === 'number' || e.kind === 'field' ? [e.blank] : [];
/** The fields a learner sets in a rollout-plan exercise, by strategy, with their labels. */
export const PLAN_FIELDS: Record<RolloutPlanTask['strategy'], Record<string, string>> = {
  rolling: { maxSurge: 'maxSurge（個數或百分比，例如 1 或 25%）', maxUnavailable: 'maxUnavailable（個數或百分比）' },
  'blue-green': { verifyMinutes: '切換前驗證幾分鐘', keepBlueMinutes: '切換後保留藍色環境幾分鐘' },
  canary: { steps: '各步驟（流量%/觀察分鐘，用逗號分開，例如 10/5, 50/5, 100/5）' },
};
/** The keys of a learner's answer: `value` (number, field), `choice` (an option's index), each blank's id, or the plan's fields. */
export const answerKeys = (e: DevopsExercise): string[] => e.kind === 'table' ? e.blanks.map(b => b.id) : e.kind === 'choice' ? ['choice']
  : e.kind === 'rollout-plan' ? Object.keys(PLAN_FIELDS[e.plan.strategy]) : e.kind === 'alert-rule' ? Object.keys(ALERT_FIELDS)
  : e.kind === 'redact' ? Object.keys(REDACT_FIELD) : e.kind === 'sampling-plan' ? Object.keys(SAMPLING_FIELDS) : e.kind === 'burn-alert' ? Object.keys(BURN_FIELDS) : ['value'];

/** A plan's parameters as the learner types them. */
export function planAnswer(st: Strategy): Record<string, string> {
  switch (st.kind) {
    case 'rolling': return { maxSurge: String(st.maxSurge), maxUnavailable: String(st.maxUnavailable) };
    case 'blue-green': return { verifyMinutes: String(st.verifyMinutes), keepBlueMinutes: String(st.keepBlueMinutes) };
    case 'canary': return { steps: st.steps.map(x => `${x.weight}/${x.holdMinutes}`).join(', ') };
    case 'recreate': return {};
  }
}
/** The learner's parameters as a strategy, or the reasons they cannot be read. */
export function parsePlan(kind: RolloutPlanTask['strategy'], answer: Record<string, string>): { strategy?: Strategy; messages: string[] } {
  const messages: string[] = [];
  const text = (k: string) => (answer[k] ?? '').normalize('NFKC').trim();
  const whole = (k: string, label: string) => {
    const t = text(k).replace(/\s+/g, '').replace(/(?:分鐘|分)$/, '');
    if (!t) { messages.push(`還沒有填「${label}」。`); return 0; }
    if (!/^\d+$/.test(t)) { messages.push(`「${label}」要填整數。`); return 0; }
    return Number(t);
  };
  const amount = (k: string, label: string): InstanceAmount => {
    const t = text(k).replace(/\s+/g, '');
    if (!t) { messages.push(`還沒有填「${label}」。`); return 0; }
    if (/^\d+$/.test(t)) return Number(t);
    if (/^\d+%$/.test(t)) return t as `${number}%`;
    messages.push(`「${label}」要填個數（整數）或百分比（例如 25%）。`); return 0;
  };
  if (kind === 'rolling') {
    const strategy: Strategy = { kind, maxSurge: amount('maxSurge', 'maxSurge'), maxUnavailable: amount('maxUnavailable', 'maxUnavailable') };
    return messages.length ? { messages } : { strategy, messages };
  }
  if (kind === 'blue-green') {
    const strategy: Strategy = { kind, verifyMinutes: whole('verifyMinutes', '驗證時間'), keepBlueMinutes: whole('keepBlueMinutes', '保留藍色環境的時間') };
    return messages.length ? { messages } : { strategy, messages };
  }
  const raw = text('steps');
  if (!raw) return { messages: ['還沒有填金絲雀發布的步驟。'] };
  const steps = raw.split(/[,，、;；\n]+/).map(p => p.trim()).filter(Boolean).map(p => /^(\d+)%?\s*[/:：／]\s*(\d+)\s*(?:分鐘|分)?$/.exec(p));
  if (steps.some(m => !m)) return { messages: ['步驟要寫成「流量%/觀察分鐘」，用逗號分開，例如 10/5, 50/5, 100/5。'] };
  return { strategy: { kind: 'canary', steps: steps.map(m => ({ weight: Number(m![1]), holdMinutes: Number(m![2]) })) }, messages };
}

const CONSTRAINT_TEXT: Record<Exclude<keyof PlanConstraints, 'completeBy' | 'outcome' | 'gateFailed'>, [label: string, of: (r: RolloutResult) => number]> = {
  maxErrors: ['錯誤的請求', r => r.totals.errors],
  maxDropped: ['丟棄的請求', r => r.totals.dropped],
  maxAffected: ['受影響的請求（錯誤＋丟棄）', r => r.totals.affected],
  maxPeakInstances: ['同時執行的執行個體', r => r.totals.peakInstances],
  maxExtraInstanceMinutes: ['額外的執行個體分鐘', r => r.totals.extraInstanceMinutes],
};
/** A plan's constraints in words, for the exercise. */
export function constraintTexts(c: PlanConstraints): string[] {
  const out = (Object.entries(CONSTRAINT_TEXT) as [keyof typeof CONSTRAINT_TEXT, (typeof CONSTRAINT_TEXT)[keyof typeof CONSTRAINT_TEXT]][])
    .flatMap(([k, [label]]) => c[k] === undefined ? [] : [`${label}最多 ${c[k]}`]);
  if (c.completeBy !== undefined) out.push(`在第 ${c.completeBy} 分鐘以前完成`);
  if (c.outcome) out.push(`結果是「${OUTCOME_TEXT[c.outcome].shown}」`);
  if (c.gateFailed) out.push('由閘門在足夠的樣本上判定失敗而中止');
  return out;
}
export const outcomeText = (o: keyof typeof OUTCOME_TEXT) => OUTCOME_TEXT[o].shown;
/** The constraints a plan's simulation breaks, in words (empty when it meets them all). */
export function planViolations(c: PlanConstraints, r: RolloutResult): string[] {
  const out: string[] = [];
  for (const [k, [label, of]] of Object.entries(CONSTRAINT_TEXT) as [keyof typeof CONSTRAINT_TEXT, (typeof CONSTRAINT_TEXT)[keyof typeof CONSTRAINT_TEXT]][]) {
    const max = c[k];
    if (max !== undefined && of(r) > max) out.push(`${label}有 ${of(r)}，超過上限 ${max}。`);
  }
  if (c.completeBy !== undefined && !(r.outcome === 'completed' && r.completedAt! <= c.completeBy))
    out.push(r.outcome === 'completed' ? `第 ${r.completedAt} 分鐘才完成，晚於第 ${c.completeBy} 分鐘。` : `部署沒有完成（${OUTCOME_TEXT[r.outcome].shown}），要在第 ${c.completeBy} 分鐘前完成。`);
  if (c.outcome && r.outcome !== c.outcome) out.push(`結果是「${OUTCOME_TEXT[r.outcome].shown}」，題目要的是「${OUTCOME_TEXT[c.outcome].shown}」。`);
  if (c.gateFailed) {
    const last = r.gates.at(-1);
    if (!last || last.verdict !== 'fail') out.push(last?.verdict === 'insufficient'
      ? `第 ${last.step} 步只收到 ${last.requests} 個請求，樣本不足就中止了；要讓閘門在足夠的樣本上判定失敗。`
      : '沒有任何閘門判定失敗。');
  }
  return out;
}
export function simulatePlan(task: RolloutPlanTask, c: DevopsLessonContent, strategy: Strategy): RolloutResult {
  return simulateRollout(scenarioFor(byId(c.rollouts, task.rollout, 'rollout').scenario, strategy));
}
function checkPlan(task: RolloutPlanTask, c: DevopsLessonContent, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const { strategy, messages } = parsePlan(task.strategy, answer);
  if (!strategy) return { ok: false, messages };
  const n = byId(c.rollouts, task.rollout, 'rollout').scenario.fleet.instances;
  const issues = strategyIssues(strategy, n).map(i => i.zh);
  if (issues.length) return { ok: false, messages: issues };
  const v = planViolations(task.constraints, simulatePlan(task, c, strategy));
  return { ok: !v.length, messages: v };
}

/** Checks a learner's answer against the values computed from the lesson's explorers. */
export function checkDevopsAnswer(e: DevopsExercise, c: DevopsLessonContent, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  if (e.kind === 'rollout-plan') return checkPlan(e.plan, c, answer);
  if (e.kind === 'alert-rule') return checkAlertPlan(e.plan, c, answer);
  if (e.kind === 'redact') return checkRedact(e.redact, c, answer);
  if (e.kind === 'sampling-plan') return checkSamplingPlan(e.sampling, c, answer);
  if (e.kind === 'burn-alert') return checkBurnAlert(e.burn, c, answer);
  const messages: string[] = [];
  if (e.kind === 'choice') {
    const chosen = answer.choice?.trim();
    if (!chosen) messages.push('還沒有選擇答案。');
    else if (Number(chosen) !== correctOption(e, c)) messages.push(`「${e.options[Number(chosen)]?.label ?? chosen}」不對：回到探索器，照題目的設定再看一次。`);
    return { ok: !messages.length, messages };
  }
  for (const b of blanksOf(e)) {
    const got = answer[e.kind === 'table' ? b.id : 'value'] ?? '', label = b.label.replace(/`/g, '');
    if (!got.trim()) { messages.push(`還沒有填「${label}」。`); continue; }
    const want = devopsQueryValue(b.query, c);
    if (want.type === 'number' && parseDevopsNumber(got) === undefined) messages.push(`「${label}」要填一個數字${want.decimals ? `（到小數點後 ${want.decimals} 位）` : '（整數）'}。`);
    else if (!matchesDevopsValue(want, got)) messages.push(`「${label}」不對：回到探索器，照題目的設定再算一次。`);
  }
  return { ok: !messages.length, messages };
}
/** The index of the option the data makes right (validation guarantees exactly one). */
export function correctOption(e: DevopsExercise & { kind: 'choice' }, c: DevopsLessonContent): number {
  const v = devopsQueryValue(e.query, c);
  return e.options.findIndex(o => matchesDevopsValue(v, o.value));
}
/** The reference answer as the learner would type it (computed; for a plan, its reference parameters). */
export function referenceAnswer(e: DevopsExercise, c: DevopsLessonContent): Record<string, string> {
  if (e.kind === 'choice') return { choice: String(correctOption(e, c)) };
  if (e.kind === 'rollout-plan') return planAnswer(e.plan.reference);
  if (e.kind === 'alert-rule') return alertPlanAnswer(e.plan.reference);
  if (e.kind === 'redact') return redactAnswer(e.redact.reference);
  if (e.kind === 'sampling-plan') return samplingAnswer(e.sampling.reference);
  if (e.kind === 'burn-alert') return burnAnswer(e.burn.reference);
  const shown = (b: DevopsBlank) => { const v = devopsQueryValue(b.query, c); return v.type === 'text' ? v.shown : v.value.toFixed(v.decimals); };
  return e.kind === 'table' ? Object.fromEntries(e.blanks.map(b => [b.id, shown(b)])) : { value: shown(e.blank) };
}
export const planText = (st: Strategy) => strategyText(st);

// ---- validation ---------------------------------------------------------------------------------------------------
/**
 * Everything the validator checks in `content.devops` (validateContent wires it in): explorers with consistent data,
 * unique ids, and exercises whose answers can be computed, whose reference passes and whose typical mistakes fail.
 */
export function devopsContentProblems(c: DevopsLessonContent): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) problems.push(`duplicate id ${id}`); ids.add(id); };
  const explorers = devopsExplorers(c);
  if (!explorers.length) problems.push('a devops-explorer lesson needs at least one explorer (a history, a rollout, a dashboard, logs, traces or an SLO)');
  for (const x of explorers) {
    unique(x.id);
    if (!x.title?.trim() || !x.description?.trim()) problems.push(`explorer ${x.id} needs a title and a description`);
  }
  for (const h of c.histories ?? []) problems.push(...historyProblems(h.history).map(p => `history ${h.id}: ${p}`));
  for (const r of c.rollouts ?? []) problems.push(...rolloutProblems(r.scenario).map(p => `rollout ${r.id}: ${p}`));
  for (const d of c.dashboards ?? []) problems.push(...dashboardProblems(d.dashboard).map(p => `dashboard ${d.id}: ${p}`));
  for (const l of c.logs ?? []) problems.push(...logsExplorerProblems(l).map(p => `logs ${l.id}: ${p}`));
  for (const t of c.traces ?? []) problems.push(...tracesExplorerProblems(t, c).map(p => `traces ${t.id}: ${p}`));
  for (const x of c.slos ?? []) problems.push(...sloProblems(x.slo).map(p => `slo ${x.id}: ${p}`));
  if (problems.length) return problems;

  for (const e of c.exercises) {
    unique(e.id);
    const fail = (what: string) => problems.push(`exercise ${e.id}: ${what}`);
    if (!e.title?.trim() || !e.statement?.trim()) fail('needs a title and a statement');
    if (!e.hints.length || e.hints.some(h => !h.trim())) fail('needs hints');
    if (!e.explanation?.trim()) fail('needs an explanation');
    if (!e.mistakes.length) fail('needs at least one typical mistake (it shows the check rejects it)');
    const keys = answerKeys(e);
    let sound = true;
    if (e.kind === 'table') {
      if (!e.blanks.length) fail('a table needs blanks');
      if (new Set(keys).size !== keys.length || keys.some(k => k === 'value' || k === 'choice')) fail('blank ids must be distinct (and not value or choice)');
    }
    for (const b of blanksOf(e)) {
      if (!b.label?.trim()) fail(`blank ${b.id} needs a label`);
      try {
        const v = devopsQueryValue(b.query, c);
        if (e.kind === 'number' && v.type !== 'number') { fail(`blank ${b.id}: a number exercise asks for a number`); sound = false; }
        if (e.kind === 'field' && v.type !== 'text') { fail(`blank ${b.id}: a numeric answer is a number exercise`); sound = false; }
      } catch (err) { fail(`blank ${b.id}: ${(err as Error).message}`); sound = false; }
    }
    if (e.kind === 'choice') {
      try {
        const v = devopsQueryValue(e.query, c);
        if (e.options.length < 2 || new Set(e.options.map(o => normWord(o.value))).size !== e.options.length || new Set(e.options.map(o => o.label.trim())).size !== e.options.length)
          fail('needs at least two options with distinct values and labels');
        const matching = e.options.flatMap((o, i) => matchesDevopsValue(v, o.value) ? [i] : []);
        if (matching.length !== 1) { fail(`the data (${formatDevopsValue(v)}) makes ${matching.length ? matching.map(i => `"${e.options[i].label}"`).join(', ') : 'no option'} right; exactly one option must be`); sound = false; }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (e.kind === 'rollout-plan') {
      const p = e.plan;
      try {
        const rollout = byId(c.rollouts, p.rollout, 'rollout');
        if (!(['rolling', 'blue-green', 'canary'] as const).includes(p.strategy)) { fail(`a plan sets a rolling, blue-green or canary strategy, not ${p.strategy}`); sound = false; }
        else if (p.reference.kind !== p.strategy) { fail(`the reference plan is ${p.reference.kind}, not ${p.strategy}`); sound = false; }
        else {
          const bad = strategyProblems(p.reference, rollout.scenario.fleet.instances);
          if (bad.length) { fail(`the reference plan: ${bad.join('; ')}`); sound = false; }
        }
        const limits = Object.entries(p.constraints).filter(([k]) => k !== 'outcome' && k !== 'gateFailed');
        if (!limits.length && !p.constraints.outcome && !p.constraints.gateFailed) fail('a plan needs at least one constraint');
        if (p.constraints.gateFailed !== undefined && (p.constraints.gateFailed !== true || p.strategy !== 'canary')) fail('gateFailed is true, for a canary plan');
        for (const [k, v] of limits) if (!Number.isInteger(v) || (v as number) < 0) fail(`constraint ${k} is a whole number ≥ 0`);
        if (p.constraints.outcome && p.constraints.outcome !== 'completed' && p.constraints.outcome !== 'rolled-back') fail(`unknown outcome ${p.constraints.outcome}`);
        if (sound) {
          const v = planViolations(p.constraints, simulatePlan(p, c, p.reference));
          if (v.length) { fail(`the reference plan breaks its constraints: ${v.join(' ')}`); sound = false; }
        }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (e.kind === 'alert-rule') {
      try {
        const bad = alertPlanProblems(e.plan, c);
        if (bad.length) { for (const b of bad) fail(b); sound = false; }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (e.kind === 'redact') {
      try {
        const bad = redactTaskProblems(e.redact, c);
        if (bad.length) { for (const b of bad) fail(b); sound = false; }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (e.kind === 'sampling-plan') {
      try {
        const bad = samplingPlanProblems(e.sampling, c);
        if (bad.length) { for (const b of bad) fail(b); sound = false; }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (e.kind === 'burn-alert') {
      try {
        const bad = burnAlertProblems(e.burn, c);
        if (bad.length) { for (const b of bad) fail(b); sound = false; }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (!sound) continue;
    if (!checkDevopsAnswer(e, c, referenceAnswer(e, c)).ok) fail('the reference answer fails its own check');
    for (const m of e.mistakes) {
      if (!m.why?.trim()) fail('a typical mistake needs its reason');
      const unknown = Object.keys(m.answer).filter(k => !keys.includes(k));
      if (unknown.length) fail(`the typical mistake "${m.why}" answers ${unknown.join(', ')}, which the exercise does not ask`);
      else if (checkDevopsAnswer(e, c, m.answer).ok) fail(`the typical mistake "${m.why}" passes the check`);
    }
  }
  return problems;
}
