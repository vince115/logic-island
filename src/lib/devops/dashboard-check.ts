import { conditionIssues, ruleValueNumber, STATE_LABEL, type AlertCondition, type AlertResult, type AlertRun } from './alerts';
import type { DevopsValue } from './check';
import { dashboardProblems, evaluateOn, seriesOf, type Dashboard } from './dashboard';
import { incidentTimes, INCIDENT_METRICS, severityOf } from './incident';
import { SIGNAL_ALIASES, SIGNAL_LABEL, seriesValues } from './series';
import { ALERT_METRICS, SERIES_METRICS, type AlertConstraints, type AlertPlanTask, type DevopsLessonContent, type DevopsQuery } from './types';

/*
 * CICD-0 devops-explorer stage D3 exercises (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10): the series, alert and
 * incident queries, computed from the dashboard's data, and the alert-rule task, which evaluates the learner's own rule
 * and checks the constraints. check.ts dispatches to these.
 */

const num = (value: number, unit: string, decimals = 0): DevopsValue => ({ type: 'number', value, decimals, unit });
const text = (value: string, shown: string, aliases: string[]): DevopsValue => ({ type: 'text', value, shown, aliases: [value, shown, ...aliases] });
export const STATE_ALIASES = { inactive: ['正常', '未觸發', 'ok'], pending: ['等待', '等待中', 'pending'], firing: ['觸發', '觸發中', '告警中', 'firing'], resolved: ['恢復', '已恢復', 'resolved'] } as const;

export function dashboardById(c: DevopsLessonContent, id: string): Dashboard {
  const found = c.dashboards?.find(x => x.id === id);
  if (!found) throw new Error(`no dashboard ${id}`);
  return found.dashboard;
}
/** The condition a query names: one of the dashboard's rules by id, or the one it writes. */
export function conditionOf(d: Dashboard, rule: string | AlertCondition): AlertCondition {
  if (typeof rule !== 'string') return rule;
  const found = d.rules?.find(r => r.id === rule);
  if (!found) throw new Error(`no rule ${rule}`);
  return found;
}
function evaluated(d: Dashboard, rule: AlertCondition): AlertResult {
  const issues = conditionIssues(rule, d.series, d.minutes);
  if (issues.length) throw new Error(issues.map(i => i.en).join('; '));
  return evaluateOn(d, rule);
}

type DashboardQuery = Extract<DevopsQuery, { task: 'series' | 'alert' | 'incident' }>;
/** A D3 query's value; throws when it names something the dashboard does not have. */
export function dashboardQueryValue(q: DashboardQuery, c: DevopsLessonContent): DevopsValue {
  const d = dashboardById(c, q.dashboard);
  const minute = () => { if (q.task === 'incident' || q.minute === undefined || !Number.isInteger(q.minute) || q.minute < 0 || q.minute >= d.minutes) throw new Error(`${q.metric} needs a minute of the dashboard (0…${d.minutes - 1})`); return q.minute; };
  if (q.task === 'series') {
    if (!(SERIES_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown series metric ${q.metric}`);
    const s = seriesOf(d, q.series);
    if (!s) throw new Error(`no series ${q.series}`);
    const v = seriesValues(s, d.minutes), max = Math.max(...v);
    switch (q.metric) {
      case 'value-at': return num(v[minute()], s.unit);
      case 'max': return num(max, s.unit);
      case 'min': return num(Math.min(...v), s.unit);
      case 'max-at': return num(v.indexOf(max), '分鐘');
      case 'signal': return text(s.signal, SIGNAL_LABEL[s.signal], SIGNAL_ALIASES[s.signal]);
    }
  }
  if (q.task === 'incident') {
    if (!(INCIDENT_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown incident metric ${q.metric}`);
    const i = d.incidents?.find(x => x.id === q.incident);
    if (!i) throw new Error(`no incident ${q.incident}`);
    const t = incidentTimes(i);
    const need = (x: number | undefined, what: string) => { if (x === undefined) throw new Error(`incident ${i.id} has no ${what} event`); return num(x, '分鐘'); };
    switch (q.metric) {
      case 'time-to-detect': return need(t.detect, 'detected');
      case 'time-to-acknowledge': return need(t.acknowledge, 'detected and acknowledged');
      case 'time-to-mitigate': return need(t.mitigate, 'mitigated');
      case 'time-to-recover': return num(t.recover, '分鐘');
      case 'severity': {
        if (!d.severity) throw new Error('the dashboard has no severity matrix');
        const sev = severityOf(i, d.severity);
        if (!sev) throw new Error(`incident ${i.id} has no usersPercent`);
        return text(sev.level, sev.level, []);
      }
    }
  }
  if (!(ALERT_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown alert metric ${q.metric}`);
  const r = evaluated(d, conditionOf(d, q.rule));
  const at = (x: number | undefined, what: string) => { if (x === undefined) throw new Error(`the rule ${what}`); return num(x, '分鐘'); };
  switch (q.metric) {
    case 'first-firing': return at(r.firstFiring, 'never fires');
    case 'first-resolved': return at(r.firstResolved, 'never resolves');
    case 'notifications': return num(r.notifications, '次');
    case 'false-alerts': return num(r.falseAlerts, '次');
    case 'missed': return num(r.missed, '個');
    case 'detected': return num(r.detected, '個');
    case 'firing-minutes': return num(r.firingMinutes, '分鐘');
    case 'detection-delay': {
      const det = r.incidents.find(x => x.id === q.incident);
      if (!det) throw new Error(`detection-delay needs an incident of the dashboard (${q.incident ?? 'none given'})`);
      return at(det.delay, `misses incident ${det.id}`);
    }
    case 'state-at': { const s = r.states[minute()]; return text(s, STATE_LABEL[s], [...STATE_ALIASES[s]]); }
    case 'value-at': {
      const v = r.values[minute()];
      if (!v) throw new Error('the rule has no value before its window is full');
      return num(ruleValueNumber(v), seriesOf(d, conditionOf(d, q.rule).series)!.unit, v.count === 1 ? 0 : 1);
    }
  }
}

// ---- the alert-rule task ------------------------------------------------------------------------------------------
/** The fields a learner sets in an alert-rule exercise, with their labels. */
export const ALERT_FIELDS: Record<string, string> = {
  series: '指標', op: '比較', threshold: '門檻（整數）', agg: '視窗計算', window: '視窗長度（分鐘）', for: '持續多久才觸發（分鐘）',
};
export const AGG_CHOICES = { none: '不用視窗（每分鐘的值）', avg: '平均', max: '最大值', min: '最小值' } as const;

/** A condition as the learner types it. */
export function alertPlanAnswer(r: AlertCondition): Record<string, string> {
  return { series: r.series, op: r.op, threshold: String(r.threshold), agg: r.window?.agg ?? 'none', window: r.window ? String(r.window.minutes) : '', for: String(r.forMinutes) };
}
/** The learner's fields as a condition, or the reasons they cannot be read. */
export function parseAlertPlan(answer: Record<string, string>): { rule?: AlertCondition; messages: string[] } {
  const messages: string[] = [];
  const field = (k: string) => (answer[k] ?? '').normalize('NFKC').trim().replace(/\s+/g, '');
  const whole = (k: string, unit: boolean) => {
    const t = unit ? field(k).replace(/(?:分鐘|分)$/, '') : field(k);
    if (!t) { messages.push(`還沒有填「${ALERT_FIELDS[k]}」。`); return 0; }
    if (!/^\d+$/.test(t)) { messages.push(`「${ALERT_FIELDS[k]}」要填 0 以上的整數。`); return 0; }
    return Number(t);
  };
  const series = field('series'), op = field('op'), agg = field('agg') || 'none';
  if (!series) messages.push('還沒有選擇「指標」。');
  if (!['>', '>=', '<', '<='].includes(op)) messages.push('「比較」要選 >、>=、< 或 <=。');
  const threshold = whole('threshold', false), forMinutes = whole('for', true);
  if (!(agg in AGG_CHOICES)) messages.push('「視窗計算」要選不用視窗、平均、最大值或最小值。');
  const windowMinutes = agg !== 'none' && agg in AGG_CHOICES ? whole('window', true) : 0;
  if (messages.length) return { messages };
  const rule: AlertCondition = { series, op: op as AlertCondition['op'], threshold, forMinutes,
    ...agg !== 'none' ? { window: { agg: agg as 'avg' | 'max' | 'min', minutes: windowMinutes } } : {} };
  return { rule, messages };
}

/** A task's constraints in words. */
export function alertConstraintTexts(c: AlertConstraints): string[] {
  return [
    ...c.detectWithin !== undefined ? [`每個事故都在開始後 ${c.detectWithin} 分鐘內觸發`] : [],
    ...c.maxMissed !== undefined ? [`漏掉的事故最多 ${c.maxMissed} 個`] : [],
    ...c.maxFalseAlerts !== undefined ? [`誤報最多 ${c.maxFalseAlerts} 次`] : [],
    ...c.maxNotifications !== undefined ? [`通知最多 ${c.maxNotifications} 次`] : [],
  ];
}
/** The constraints a rule's evaluation breaks, in words (empty when it meets them all). */
export function alertViolations(c: AlertConstraints, r: AlertRun): string[] {
  const out: string[] = [];
  if (c.detectWithin !== undefined) for (const i of r.incidents) {
    if (i.delay === undefined) out.push(`事故「${i.label}」在它持續的期間沒有觸發告警（漏掉了）。`);
    else if (i.delay > c.detectWithin) out.push(`事故「${i.label}」第 ${i.start} 分鐘開始，第 ${i.detectedAt} 分鐘才觸發，延遲 ${i.delay} 分鐘，超過 ${c.detectWithin} 分鐘。`);
  }
  if (c.maxMissed !== undefined && r.missed > c.maxMissed) out.push(`漏掉 ${r.missed} 個事故，超過上限 ${c.maxMissed}。`);
  if (c.maxFalseAlerts !== undefined && r.falseAlerts > c.maxFalseAlerts) out.push(`誤報有 ${r.falseAlerts} 次，超過上限 ${c.maxFalseAlerts}。`);
  if (c.maxNotifications !== undefined && r.notifications > c.maxNotifications) out.push(`通知有 ${r.notifications} 次，超過上限 ${c.maxNotifications}。`);
  return out;
}
/** The learner's rule evaluated on the task's dashboard (undefined when it cannot be read or evaluated). */
export function evaluatePlan(task: AlertPlanTask, c: DevopsLessonContent, answer: Record<string, string>): AlertResult | undefined {
  const d = dashboardById(c, task.dashboard), { rule } = parseAlertPlan(answer);
  return rule && !conditionIssues(rule, d.series, d.minutes).length ? evaluateOn(d, rule) : undefined;
}
export function checkAlertPlan(task: AlertPlanTask, c: DevopsLessonContent, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const { rule, messages } = parseAlertPlan(answer);
  if (!rule) return { ok: false, messages };
  const d = dashboardById(c, task.dashboard);
  const issues = conditionIssues(rule, d.series, d.minutes).map(i => i.zh);
  if (issues.length) return { ok: false, messages: issues };
  const v = alertViolations(task.constraints, evaluateOn(d, rule));
  return { ok: !v.length, messages: v };
}
/** What the validator checks in an alert-rule task (beyond the reference passing and the mistakes failing). */
export function alertPlanProblems(task: AlertPlanTask, c: DevopsLessonContent): string[] {
  const d = dashboardById(c, task.dashboard);
  if (dashboardProblems(d).length) return [];
  const problems = conditionIssues(task.reference, d.series, d.minutes).map(i => `the reference rule: ${i.en}`);
  const limits = Object.entries(task.constraints);
  if (!limits.length) problems.push('an alert-rule task needs at least one constraint');
  for (const [k, v] of limits) if (!Number.isInteger(v) || (v as number) < 0) problems.push(`constraint ${k} is a whole number ≥ 0`);
  if (!d.incidents?.length && (task.constraints.detectWithin !== undefined || task.constraints.maxMissed !== undefined)) problems.push('detection constraints need incidents on the dashboard');
  if (!problems.length) {
    const v = alertViolations(task.constraints, evaluateOn(d, task.reference));
    if (v.length) problems.push(`the reference rule breaks its constraints: ${v.join(' ')}`);
  }
  return problems;
}
