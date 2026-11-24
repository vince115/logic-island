import { roundHalfUp } from './history';
import type { Incident } from './incident';
import { seriesValues, type MetricSeries } from './series';

/*
 * CICD-0 devops-explorer stage D3 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10): alert rules on a dashboard's series,
 * evaluated once per minute. A vendor-neutral teaching model: the pending-then-firing idea (`for`) resembles common
 * monitoring systems, but the rules here are this course's own:
 * - The rule's value at minute t is the series' value, or an aggregate over the last `window.minutes` minutes
 *   [t − W + 1, t] (avg, max or min). Before the window is full there is no value and the condition is false.
 * - avg is compared exactly, without rounding: avg op threshold ⇔ sum op threshold × W. It is shown to one decimal,
 *   rounded half up. Thresholds are whole numbers.
 * - States per minute: the condition false → inactive (or `resolved` in the first minute after firing); true → pending
 *   while it has been true for at most `for` minutes in a row, firing from the (for + 1)-th minute in a row. With for 0
 *   it fires in the first minute the condition holds; a pending rule whose condition stops never fires.
 * - A firing interval [start, end) runs from the first firing minute to the resolved minute (or the end of the
 *   dashboard, `open`). Each interval is one notification (resolved notices are not counted).
 * - An incident [start, end) is detected at the first firing minute t with start ≤ t < end; detection delay is
 *   t − start. An incident with no firing minute inside its window is missed. A firing interval that overlaps no
 *   incident is a false alert (one that starts only after its incident ended is late: the incident is missed and the
 *   interval is a false alert).
 */

export const ALERT_OPS = ['>', '>=', '<', '<='] as const;
export type AlertOp = typeof ALERT_OPS[number];
export const AGGREGATIONS = ['avg', 'max', 'min'] as const;
export type Aggregation = typeof AGGREGATIONS[number];
export const AGG_LABEL: Record<Aggregation, string> = { avg: '平均', max: '最大值', min: '最小值' };
export const SEVERITIES = ['critical', 'warning', 'info'] as const;
export type Severity = typeof SEVERITIES[number];
export const SEVERITY_LABEL: Record<Severity, string> = { critical: '嚴重', warning: '警告', info: '資訊' };
export const MAX_WINDOW = 60;
export const MAX_FOR = 60;

/** What a rule watches: a series, an optional window aggregate, a comparison and how long it must hold. */
export interface AlertCondition {
  series: string;
  op: AlertOp;
  threshold: number;
  window?: { agg: Aggregation; minutes: number };
  /** Minutes the condition stays pending before it fires (0 fires at once). */
  forMinutes: number;
}
export interface AlertRule extends AlertCondition { id: string; label: string; severity: Severity }

export const ALERT_STATES = ['inactive', 'pending', 'firing', 'resolved'] as const;
export type AlertState = typeof ALERT_STATES[number];
export const STATE_LABEL: Record<AlertState, string> = { inactive: '未觸發', pending: '等待中', firing: '觸發中', resolved: '已恢復' };

export interface RuleValue { sum: number; count: number }
export interface FiringInterval { start: number; end: number; open: boolean; incident?: string }
export interface IncidentDetection { id: string; label: string; start: number; detectedAt?: number; delay?: number }
export interface AlertResult {
  /** The rule's value each minute (undefined until the window is full). */
  values: (RuleValue | undefined)[];
  holds: boolean[];
  states: AlertState[];
  intervals: FiringInterval[];
  incidents: IncidentDetection[];
  firstFiring?: number;
  firstResolved?: number;
  notifications: number;
  falseAlerts: number;
  missed: number;
  detected: number;
  firingMinutes: number;
}
/** A run of the state machine without the rule's values (D6's burn-rate alerts have two burn rates instead). */
export type AlertRun = Omit<AlertResult, 'values'>;

/** The value as shown: whole for a single value, max or min; one decimal (half up) for an average. */
export const ruleValueText = (v: RuleValue | undefined) => !v ? '—' : v.count === 1 ? String(v.sum) : (roundHalfUp(10 * v.sum, v.count) / 10).toFixed(1);
export const ruleValueNumber = (v: RuleValue) => v.count === 1 ? v.sum : roundHalfUp(10 * v.sum, v.count) / 10;

const compare = (a: number, op: AlertOp, b: number) => op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : a <= b;

function valueAt(values: readonly number[], t: number, w: AlertCondition['window']): RuleValue | undefined {
  if (!w) return { sum: values[t], count: 1 };
  if (t < w.minutes - 1) return undefined;
  const slice = values.slice(t - w.minutes + 1, t + 1);
  if (w.agg === 'avg') return { sum: slice.reduce((a, b) => a + b, 0), count: w.minutes };
  return { sum: w.agg === 'max' ? Math.max(...slice) : Math.min(...slice), count: 1 };
}

/** Evaluates a rule on a series, minute by minute, and matches its firing intervals with the incidents. */
export function evaluateAlert(rule: AlertCondition, series: MetricSeries, minutes: number, incidents: readonly Incident[] = []): AlertResult {
  const raw = seriesValues(series, minutes);
  const values = raw.map((_, t) => valueAt(raw, t, rule.window));
  return { values, ...runAlert(values.map(v => !!v && compare(v.sum, rule.op, rule.threshold * v.count)), rule.forMinutes, incidents) };
}

/**
 * The state machine and the incident matching above, on a condition that holds or not at each step (a minute here; D6's
 * burn-rate alerts run it once per bucket, slo.ts / burn.ts): states, firing intervals, detections and the counts.
 */
export function runAlert(holds: readonly boolean[], forMinutes: number, incidents: readonly Incident[] = []): AlertRun {
  const minutes = holds.length;
  const states: AlertState[] = [], intervals: FiringInterval[] = [];
  let run = 0, firing = false;
  for (let t = 0; t < minutes; t++) {
    if (holds[t]) {
      run++;
      if (run > forMinutes) {
        states.push('firing');
        if (!firing) intervals.push({ start: t, end: minutes, open: true });
        firing = true;
      } else states.push('pending');
    } else {
      run = 0;
      states.push(firing ? 'resolved' : 'inactive');
      if (firing) Object.assign(intervals[intervals.length - 1], { end: t, open: false });
      firing = false;
    }
  }
  for (const iv of intervals) iv.incident = incidents.find(i => iv.start < i.end && i.start < iv.end)?.id;
  const detections = incidents.map(i => {
    const at = states.findIndex((s, t) => s === 'firing' && t >= i.start && t < i.end);
    return at < 0 ? { id: i.id, label: i.label, start: i.start } : { id: i.id, label: i.label, start: i.start, detectedAt: at, delay: at - i.start };
  });
  const firstFiring = states.indexOf('firing'), firstResolved = states.indexOf('resolved');
  return {
    holds: [...holds], states, intervals, incidents: detections,
    ...firstFiring >= 0 ? { firstFiring } : {}, ...firstResolved >= 0 ? { firstResolved } : {},
    notifications: intervals.length,
    falseAlerts: intervals.filter(iv => !iv.incident).length,
    missed: detections.filter(d => d.detectedAt === undefined).length,
    detected: detections.filter(d => d.detectedAt !== undefined).length,
    firingMinutes: states.filter(s => s === 'firing').length,
  };
}

/** A rule's condition in words: 「錯誤率 的 5 分鐘平均 > 10，持續 2 分鐘」. */
export function conditionText(rule: AlertCondition, series?: MetricSeries): string {
  const name = series ? `${series.label}（${series.unit}）` : rule.series;
  const of = rule.window ? `${name}的 ${rule.window.minutes} 分鐘${AGG_LABEL[rule.window.agg]}` : name;
  return `${of} ${rule.op} ${rule.threshold}${rule.forMinutes ? `，持續 ${rule.forMinutes} 分鐘才觸發` : '，立即觸發'}`;
}

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
/** What makes a rule's condition impossible to evaluate on a dashboard, in English (validation) and Chinese (the editor). */
export function conditionIssues(rule: AlertCondition, series: readonly MetricSeries[], minutes: number): { en: string; zh: string }[] {
  const issues: { en: string; zh: string }[] = [];
  const add = (en: string, zh: string) => issues.push({ en, zh });
  if (!series.some(s => s.id === rule.series)) add(`no series ${rule.series}`, '請選擇一個指標。');
  if (!(ALERT_OPS as readonly string[]).includes(rule.op)) add(`the operator is one of ${ALERT_OPS.join(' ')}`, `比較要用 ${ALERT_OPS.join('、')} 其中一個。`);
  if (!whole(rule.threshold, 0, 10_000_000)) add('the threshold is a whole number ≥ 0', '門檻要填 0 以上的整數。');
  if (rule.window) {
    if (!(AGGREGATIONS as readonly string[]).includes(rule.window.agg)) add(`the window aggregate is one of ${AGGREGATIONS.join(', ')}`, '視窗要選平均、最大值或最小值。');
    const most = Math.min(MAX_WINDOW, minutes);
    if (!whole(rule.window.minutes, 1, most)) add(`the window is 1…${most} minutes`, `視窗要填 1–${most} 的整數分鐘。`);
  }
  if (!whole(rule.forMinutes, 0, MAX_FOR)) add(`for is a whole number of minutes 0…${MAX_FOR}`, `持續時間要填 0–${MAX_FOR} 的整數分鐘。`);
  return issues;
}
