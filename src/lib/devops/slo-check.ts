import { STATE_LABEL, type AlertRun } from './alerts';
import { burnTenths, evaluateBurn, evaluateBurnChecked, factorText, hoursLeftTenths, windowSums, type BurnResult } from './burn';
import type { DevopsValue } from './check';
import { alertViolations, STATE_ALIASES } from './dashboard-check';
import { budgetEvents, budgetTimeline, burnIssues, exhaustedBucket, meetsTarget, slaCredit, sliThousandths, sloEvents, sloProblems, sumOf, type BurnCondition, type SloScenario } from './slo';
import { BURN_METRICS, SLO_METRICS, type AlertConstraints, type BurnAlertTask, type DevopsLessonContent, type DevopsQuery } from './types';

/*
 * CICD-0 devops-explorer stage D6 exercises (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.6): the slo and burn
 * queries, computed from the lesson's SLO scenarios (slo.ts, burn.ts), and the burn-alert task, which evaluates the
 * learner's own burn-rate alert and checks the constraints (the same as alert-rule's, detectWithin in minutes).
 * check.ts dispatches to these.
 */

const num = (value: number, unit: string, decimals = 0): DevopsValue => ({ type: 'number', value, decimals, unit });
const text = (value: string, shown: string, aliases: readonly string[]): DevopsValue => ({ type: 'text', value, shown, aliases: [value, shown, ...aliases] });
const MET = { met: ['達成', '有達成', '符合', 'met', 'yes'], missed: ['未達成', '沒有達成', '不符合', '違反', 'missed', 'no'] } as const;

export function sloById(c: DevopsLessonContent, id: string): SloScenario {
  const found = c.slos?.find(x => x.id === id);
  if (!found) throw new Error(`no slo ${id}`);
  return found.slo;
}
/** The condition a query names: one of the scenario's alerts by id, or the one it writes. */
export function burnConditionOf(s: SloScenario, rule: string | BurnCondition): BurnCondition {
  if (typeof rule !== 'string') return rule;
  const found = s.alerts?.find(r => r.id === rule);
  if (!found) throw new Error(`no alert ${rule}`);
  return found;
}
/** A run with every step written as the start minute of its bucket (for D3's messages and constraints in minutes). */
export function inMinutes(r: AlertRun, bucketMinutes: number): AlertRun {
  const m = (t: number) => t * bucketMinutes;
  return { ...r,
    intervals: r.intervals.map(iv => ({ ...iv, start: m(iv.start), end: m(iv.end) })),
    incidents: r.incidents.map(i => ({ ...i, start: m(i.start), ...i.detectedAt !== undefined ? { detectedAt: m(i.detectedAt), delay: m(i.delay!) } : {} })),
    ...r.firstFiring !== undefined ? { firstFiring: m(r.firstFiring) } : {}, ...r.firstResolved !== undefined ? { firstResolved: m(r.firstResolved) } : {},
    firingMinutes: m(r.firingMinutes) };
}

type SloQuery = Extract<DevopsQuery, { task: 'slo' | 'burn' }>;
/** A D6 query's value; throws when it names something the scenario does not have. */
export function sloQueryValue(q: SloQuery, c: DevopsLessonContent): DevopsValue {
  const s = sloById(c, q.slo), e = sloEvents(s), last = s.buckets - 1;
  const bucket = (x: number | undefined, fallback?: number) => {
    const t = x ?? fallback;
    if (t === undefined || !Number.isInteger(t) || t < 0 || t > last) throw new Error(`${q.metric} needs a bucket of the scenario (at: 0…${last})`);
    return t;
  };
  if (q.task === 'burn') {
    if (!(BURN_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown burn metric ${q.metric}`);
    const raw = evaluateBurnChecked(s, burnConditionOf(s, q.rule)), r = inMinutes(raw, s.bucketMinutes);
    const at = (x: number | undefined, what: string) => { if (x === undefined) throw new Error(`the alert ${what}`); return num(x, '分鐘'); };
    switch (q.metric) {
      case 'first-firing': return at(r.firstFiring, 'never fires');
      case 'first-resolved': return at(r.firstResolved, 'never resolves');
      case 'notifications': return num(r.notifications, '次');
      case 'false-alerts': return num(r.falseAlerts, '次');
      case 'missed': return num(r.missed, '個');
      case 'detected': return num(r.detected, '個');
      case 'firing-minutes': return num(r.firingMinutes, '分鐘');
      case 'detection-delay': {
        const d = r.incidents.find(x => x.id === q.incident);
        if (!d) throw new Error(`detection-delay needs an incident of the scenario (${q.incident ?? 'none given'})`);
        return at(d.delay, `misses incident ${d.id}`);
      }
      case 'state-at': { const st = raw.states[bucket(q.at)]; return text(st, STATE_LABEL[st], STATE_ALIASES[st]); }
    }
  }
  if (!(SLO_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown slo metric ${q.metric}`);
  const range = () => {
    const from = q.from ?? 0, to = q.to ?? s.buckets;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > s.buckets || from >= to) throw new Error(`a range of buckets is 0 ≤ from < to ≤ ${s.buckets}`);
    const total = sumOf(e.total, from, to), good = sumOf(e.good, from, to);
    if (!total) throw new Error(`buckets ${from}…${to - 1} have no events`);
    return { total, good };
  };
  const windowed = () => {
    const t = bucket(q.at);
    if (q.window === undefined) throw new Error(`${q.metric} needs a window (minutes)`);
    const w = windowSums(s, e, t, q.window);
    if (!w) throw new Error(`${q.metric}: the ${q.window}-minute window is not full at bucket ${t} (a multiple of ${s.bucketMinutes} minutes)`);
    return { t, w };
  };
  const row = () => budgetTimeline(s, e)[bucket(q.at, last)];
  switch (q.metric) {
    case 'sli': { const r = range(); return num(sliThousandths(r.good, r.total)! / 1000, '%', 3); }
    case 'slo-met': { const r = range(), ok = meetsTarget(r.good, r.total, s.objective.targetPermyriad); return text(ok ? 'met' : 'missed', ok ? '達成' : '未達成', MET[ok ? 'met' : 'missed']); }
    case 'total-events': return num(range().total, '個');
    case 'bad-events': { const r = range(); return num(r.total - r.good, '個'); }
    case 'budget-events': return num(budgetEvents(s, e), '個');
    case 'consumed': return num(row().consumed, '個');
    case 'consumed-pct': return num(row().consumedTenths / 10, '%', 1);
    case 'remaining': return num(row().remaining, '個');
    case 'remaining-pct': return num(row().remainingTenths / 10, '%', 1);
    case 'burn-rate-at': { const { w } = windowed(); return num(burnTenths(w, s.objective.targetPermyriad) / 10, '倍', 1); }
    case 'hours-left': {
      const { t } = windowed(), h = hoursLeftTenths(s, t, q.window!, e);
      if (h === undefined) throw new Error(`no bad events in the window at bucket ${t}: the budget does not run out at this rate`);
      return num(h / 10, '小時', 1);
    }
    case 'exhausted-at': {
      const t = exhaustedBucket(s, e);
      if (t === undefined) throw new Error('the budget is never used up');
      return num(t * s.bucketMinutes, '分鐘');
    }
    case 'sla-credit': {
      if (!s.sla) throw new Error('the scenario has no SLA');
      const r = range();
      return num(slaCredit(s.sla, r.good, r.total).percent, '%');
    }
  }
}

// ---- the burn-alert task ------------------------------------------------------------------------------------------
export const BURN_FIELDS = { long: '長視窗（分鐘）', short: '短視窗（分鐘）', factor: '消耗率門檻（倍，最多一位小數）' } as const;
export type BurnFieldKey = keyof typeof BURN_FIELDS;

/** A condition as the learner types it. */
export const burnAnswer = (c: BurnCondition): Record<BurnFieldKey, string> => ({ long: String(c.longMinutes), short: String(c.shortMinutes), factor: factorText(c.factorTenths) });
/** The learner's fields as a condition, or the reasons they cannot be read (windows in minutes, or hours with 小時／h). */
export function parseBurnPlan(answer: Record<string, string>): { condition?: BurnCondition; messages: string[] } {
  const messages: string[] = [];
  const field = (k: BurnFieldKey) => (answer[k] ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();
  const minutes = (k: 'long' | 'short') => {
    const t = field(k), m = /^(\d+)(分鐘|分|min|m)?$/.exec(t), h = /^(\d+)(小時|h)$/.exec(t);
    if (!t) { messages.push(`還沒有填「${BURN_FIELDS[k]}」。`); return 0; }
    if (m) return Number(m[1]);
    if (h) return Number(h[1]) * 60;
    messages.push(`「${BURN_FIELDS[k]}」要填整數的分鐘數（也可以寫成 1 小時）。`); return 0;
  };
  const longMinutes = minutes('long'), shortMinutes = minutes('short');
  const f = field('factor').replace(/(?:倍|×|x)$/, '');
  if (!f) messages.push(`還沒有填「${BURN_FIELDS.factor}」。`);
  else if (!/^\d+(?:\.\d)?$/.test(f)) messages.push(`「${BURN_FIELDS.factor}」要填數字，最多一位小數（例如 14.4）。`);
  if (messages.length) return { messages };
  return { condition: { longMinutes, shortMinutes, factorTenths: Math.round(Number(f) * 10) }, messages };
}
/** The learner's condition evaluated on the task's scenario (undefined when it cannot be read or evaluated). */
export function evaluateBurnPlan(task: BurnAlertTask, c: DevopsLessonContent, answer: Record<string, string>): BurnResult | undefined {
  const s = sloById(c, task.slo), { condition } = parseBurnPlan(answer);
  return condition && !burnIssues(condition, s).length ? evaluateBurn(s, condition) : undefined;
}
/** The constraints a burn-rate alert's evaluation breaks, in words (the run is in buckets; the messages in minutes). */
export const burnViolations = (k: AlertConstraints, r: AlertRun, s: SloScenario) => alertViolations(k, inMinutes(r, s.bucketMinutes));
export function checkBurnAlert(task: BurnAlertTask, c: DevopsLessonContent, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const { condition, messages } = parseBurnPlan(answer);
  if (!condition) return { ok: false, messages };
  const s = sloById(c, task.slo);
  const issues = burnIssues(condition, s).map(i => i.zh);
  if (issues.length) return { ok: false, messages: issues };
  const v = burnViolations(task.constraints, evaluateBurn(s, condition), s);
  return { ok: !v.length, messages: v };
}
/** What the validator checks in a burn-alert task (beyond the reference passing and the mistakes failing). */
export function burnAlertProblems(task: BurnAlertTask, c: DevopsLessonContent): string[] {
  const s = sloById(c, task.slo);
  if (sloProblems(s).length) return [];
  const problems = burnIssues(task.reference, s).map(i => `the reference alert: ${i.en}`);
  const limits = Object.entries(task.constraints);
  if (!limits.length) problems.push('a burn-alert task needs at least one constraint');
  for (const [k, v] of limits) if (!Number.isInteger(v) || (v as number) < 0) problems.push(`constraint ${k} is a whole number ≥ 0`);
  if (!s.incidents?.length && (task.constraints.detectWithin !== undefined || task.constraints.maxMissed !== undefined)) problems.push('detection constraints need incidents on the scenario');
  if (!problems.length) {
    const v = burnViolations(task.constraints, evaluateBurn(s, task.reference), s);
    if (v.length) problems.push(`the reference alert breaks its constraints: ${v.join(' ')}`);
  }
  return problems;
}
