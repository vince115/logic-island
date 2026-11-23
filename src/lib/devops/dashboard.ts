import { conditionIssues, evaluateAlert, SEVERITIES, type AlertCondition, type AlertResult, type AlertRule } from './alerts';
import { incidentProblems, severityProblems, type Incident, type SeverityMatrix } from './incident';
import { MAX_DASHBOARD_MINUTES, seriesProblems, type MetricSeries } from './series';

/*
 * CICD-0 devops-explorer stage D3 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10), the monitoring-dashboard activity:
 * a service's per-minute series (series.ts), the incidents that happened in that time (incident.ts) and the lesson's
 * alert rules (alerts.ts). The model is generic (series, signals, rules, incidents), so lessons of other islands that
 * name monitoring-dashboard (OPS13/14/19, KUB12) can reuse it.
 */

export interface Dashboard {
  service: string;
  /** The length of the dashboard in minutes (1–360); minute 0 is its first minute. */
  minutes: number;
  series: MetricSeries[];
  incidents?: Incident[];
  /** The lesson's rules; the explorer starts from the first and lets the learner edit it. */
  rules?: AlertRule[];
  severity?: SeverityMatrix;
}

export const seriesOf = (d: Dashboard, id: string) => d.series.find(s => s.id === id);

/** Evaluates a rule (or a bare condition) on the dashboard; throws when its series does not exist. */
export function evaluateOn(d: Dashboard, rule: AlertCondition): AlertResult {
  const s = seriesOf(d, rule.series);
  if (!s) throw new Error(`no series ${rule.series}`);
  return evaluateAlert(rule, s, d.minutes, d.incidents ?? []);
}

/** Everything that makes a dashboard unusable. */
export function dashboardProblems(d: Dashboard): string[] {
  const problems: string[] = [];
  if (!d.service?.trim()) problems.push('needs a service name');
  if (!Number.isInteger(d.minutes) || d.minutes < 1 || d.minutes > MAX_DASHBOARD_MINUTES) { problems.push(`minutes must be 1…${MAX_DASHBOARD_MINUTES}`); return problems; }
  if (!d.series.length) problems.push('needs at least one series');
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) problems.push(`duplicate id ${id}`); ids.add(id); };
  for (const s of d.series) { unique(s.id); problems.push(...seriesProblems(s, d.minutes).map(p => `series ${s.id}: ${p}`)); }
  for (const i of d.incidents ?? []) unique(i.id);
  problems.push(...incidentProblems(d.incidents ?? [], d.minutes));
  if (d.severity) problems.push(...severityProblems(d.severity));
  for (const r of d.rules ?? []) {
    unique(r.id);
    if (!r.label?.trim()) problems.push(`rule ${r.id} needs a label`);
    if (!(SEVERITIES as readonly string[]).includes(r.severity)) problems.push(`rule ${r.id}: severity is one of ${SEVERITIES.join(', ')}`);
    problems.push(...conditionIssues(r, d.series, d.minutes).map(i => `rule ${r.id}: ${i.en}`));
  }
  return problems;
}
