import { evaluateSampling, percentText, policyProblems, type SamplingPolicy, type SamplingResult } from './sampling';
import { traceSetProblems, tracesOf } from './traces';
import { tracesExplorerById } from './traces-check';
import type { DevopsLessonContent, SamplingConstraints, SamplingPlanTask } from './types';

/*
 * CICD-0 D5 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5): the sampling-plan task. The learner sets the head ratio
 * and the tail rules (the fields below, as typed text); the checker samples the lesson's traces with them and checks the
 * constraints: keep every trace with an error, keep every trace slower than X ms, at most N spans a day. Any policy
 * that meets them passes; the task's reference is one that does.
 */

export const SAMPLING_FIELDS = {
  head: '頭部取樣：保留的比例（%）',
  tail: '尾端取樣',
  errors: '尾端：保留有錯誤的追蹤',
  slower: '尾端：保留慢於幾毫秒的追蹤（空白表示不用這條）',
  rest: '尾端：其餘的追蹤保留的比例（%）',
} as const;
export type SamplingFieldKey = keyof typeof SAMPLING_FIELDS;

/** A policy as the learner types it. */
export function samplingAnswer(p: SamplingPolicy): Record<SamplingFieldKey, string> {
  return {
    head: percentText(p.headPermille), tail: p.tail ? 'on' : 'off', errors: p.tail?.keepErrors ? 'yes' : 'no',
    slower: p.tail?.slowerThanMs !== undefined ? String(p.tail.slowerThanMs) : '', rest: p.tail ? percentText(p.tail.restPermille) : '',
  };
}
/** The learner's fields as a policy, or the reasons they cannot be read. */
export function parseSamplingPlan(answer: Record<string, string>): { policy?: SamplingPolicy; messages: string[] } {
  const messages: string[] = [];
  const field = (k: SamplingFieldKey) => (answer[k] ?? '').normalize('NFKC').replace(/\s+/g, '');
  const pct = (k: 'head' | 'rest') => {
    const t = field(k).replace(/[%％]$/, ''), label = SAMPLING_FIELDS[k];
    if (!t) { messages.push(`還沒有填「${label}」。`); return 0; }
    if (!/^\d+(?:\.\d)?$/.test(t)) { messages.push(`「${label}」要填 0 到 100 的百分比，最多一位小數（例如 10 或 0.5）。`); return 0; }
    const permille = Math.round(Number(t) * 10);
    if (permille > 1000) messages.push(`「${label}」不能超過 100%。`);
    return permille;
  };
  const headPermille = pct('head');
  if (field('tail') !== 'on') return messages.length ? { messages } : { policy: { headPermille }, messages };
  const slowText = field('slower').replace(/(?:ms|毫秒)$/i, '');
  let slowerThanMs: number | undefined;
  if (slowText) {
    if (/^\d+$/.test(slowText)) slowerThanMs = Number(slowText);
    else messages.push(`「${SAMPLING_FIELDS.slower}」要填整數的毫秒數，或留白。`);
  }
  const restPermille = pct('rest');
  if (messages.length) return { messages };
  return { policy: { headPermille, tail: { keepErrors: field('errors') === 'yes', ...slowerThanMs !== undefined ? { slowerThanMs } : {}, restPermille } }, messages };
}

/** A task's constraints in words. */
export function samplingConstraintTexts(c: SamplingConstraints): string[] {
  return [
    ...c.keepAllErrors ? ['保留每一個有錯誤的追蹤'] : [],
    ...c.keepSlowerThan !== undefined ? [`保留每一個慢於 ${c.keepSlowerThan} ms 的追蹤`] : [],
    ...c.maxSpansPerDay !== undefined ? [`估計每天保留的 span 最多 ${c.maxSpansPerDay.toLocaleString('en-US')} 個`] : [],
  ];
}
/** The constraints a sampling result breaks, in words (empty when it meets them all). */
export function samplingViolations(c: SamplingConstraints, r: SamplingResult): string[] {
  const out: string[] = [];
  if (c.keepAllErrors && r.keptErrors < r.errorTraces) out.push(`有錯誤的追蹤有 ${r.errorTraces} 個，只保留了 ${r.keptErrors} 個；題目要全部保留。`);
  if (c.keepSlowerThan !== undefined && r.slow && r.slow.kept < r.slow.total) out.push(`慢於 ${c.keepSlowerThan} ms 的追蹤有 ${r.slow.total} 個，只保留了 ${r.slow.kept} 個；題目要全部保留。`);
  if (c.maxSpansPerDay !== undefined && r.keptSpansPerDay !== undefined && r.keptSpansPerDay > c.maxSpansPerDay)
    out.push(`估計每天保留 ${r.keptSpansPerDay.toLocaleString('en-US')} 個 span，超過上限 ${c.maxSpansPerDay.toLocaleString('en-US')}。`);
  return out;
}
/** The task's traces sampled with a policy (with the slow threshold and perDay the constraints need). */
export function sampleForTask(task: SamplingPlanTask, c: DevopsLessonContent, policy: SamplingPolicy): SamplingResult {
  const set = tracesExplorerById(c, task.traces).traces;
  return evaluateSampling(tracesOf(set), policy, set.perDay, task.constraints.keepSlowerThan);
}
/** The learner's policy sampled on the task's traces (undefined when it cannot be read). */
export function evaluateSamplingPlan(task: SamplingPlanTask, c: DevopsLessonContent, answer: Record<string, string>): SamplingResult | undefined {
  const { policy } = parseSamplingPlan(answer);
  return policy ? sampleForTask(task, c, policy) : undefined;
}
export function checkSamplingPlan(task: SamplingPlanTask, c: DevopsLessonContent, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const { policy, messages } = parseSamplingPlan(answer);
  if (!policy) return { ok: false, messages };
  const v = samplingViolations(task.constraints, sampleForTask(task, c, policy));
  return { ok: !v.length, messages: v };
}

/** What the validator checks in a sampling-plan task (beyond the reference passing and the mistakes failing). */
export function samplingPlanProblems(task: SamplingPlanTask, c: DevopsLessonContent): string[] {
  const set = tracesExplorerById(c, task.traces).traces;
  if (traceSetProblems(set).length) return [];
  const k = task.constraints, problems: string[] = [];
  if (k.keepAllErrors === undefined && k.keepSlowerThan === undefined && k.maxSpansPerDay === undefined) problems.push('a sampling-plan task needs at least one constraint');
  if (k.keepAllErrors !== undefined && k.keepAllErrors !== true) problems.push('keepAllErrors is true');
  if (k.keepSlowerThan !== undefined && !(Number.isInteger(k.keepSlowerThan) && k.keepSlowerThan >= 0)) problems.push('keepSlowerThan is a whole number of ms ≥ 0');
  if (k.maxSpansPerDay !== undefined && !(Number.isInteger(k.maxSpansPerDay) && k.maxSpansPerDay >= 1)) problems.push('maxSpansPerDay is a whole number ≥ 1');
  if (k.maxSpansPerDay !== undefined && set.perDay === undefined) problems.push('maxSpansPerDay needs the trace set\'s perDay');
  const traces = tracesOf(set);
  if (k.keepAllErrors && !traces.some(t => t.error)) problems.push('keepAllErrors needs traces with an error');
  if (k.keepSlowerThan !== undefined && !traces.some(t => t.duration > k.keepSlowerThan!)) problems.push(`no trace is slower than ${k.keepSlowerThan} ms`);
  problems.push(...policyProblems(task.reference).map(p => `the reference policy: ${p}`));
  if (!problems.length) {
    const v = samplingViolations(k, sampleForTask(task, c, task.reference));
    if (v.length) problems.push(`the reference policy breaks its constraints: ${v.join(' ')}`);
  }
  return problems;
}
