/*
 * CICD-0 devops-explorer stage D1 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §5): a service's deployment history and the
 * four DORA software delivery metrics computed from it. An invented teaching model on authored data (示意資料), all in
 * whole minutes and integer arithmetic, so a learner can recompute every number by hand:
 * - Time is minutes since the start of the measured period (minute 0 is day 1 at 00:00); the period is `days` days.
 * - Deployment frequency: the number of deployments in the period, the days with at least one deployment, and the
 *   average per week, N × 7 ÷ days rounded half up to one decimal (kept as tenths: roundHalfUp(N × 70, days)).
 * - Change lead time: for every change (commit) a deployment shipped, deployedAt − commitAt; the median over all changes.
 * - Change fail rate: deployments that caused a failure in production ÷ deployments, in whole percent rounded half up.
 * - Failed deployment recovery time: for every failed deployment, restoredAt − startedAt (the failure starts at the
 *   deployment unless the record says later); the median over the failed deployments. Time to detect (detectedAt −
 *   startedAt) is shown beside it.
 * Median: the values sorted ascending; an odd count takes the middle value, an even count the mean of the two middle
 * values rounded half up to a whole minute. Performance tiers (elite, high…) are not computed: they change with every
 * report, so lessons describe them in prose only.
 */

export const MINUTES_PER_DAY = 1440;
export const MAX_DAYS = 366;

export interface DeploymentFailure {
  /** When the failure began (default: the deployment itself). */
  startedAt?: number;
  detectedAt: number;
  restoredAt: number;
}
export interface DeploymentRecord {
  id: string;
  /** When each change shipped by this deployment was committed (minutes since the start of the period). */
  commitAt: number[];
  deployedAt: number;
  /** Present when the deployment caused a failure in production (it counts toward the change fail rate). */
  failure?: DeploymentFailure;
}
export interface DeploymentHistory {
  service: string;
  /** The length of the measured period in days (1–366); every deployment is inside it. */
  days: number;
  deployments: DeploymentRecord[];
}

/** a ÷ b rounded half up, for integers a ≥ 0 and b > 0: floor((2a + b) ÷ 2b). */
export function roundHalfUp(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}
/** The median of integers (sorted ascending here); an even count rounds the mean of the middle two half up. */
export function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : roundHalfUp(sorted[mid - 1] + sorted[mid], 2);
}

export const failureStart = (d: DeploymentRecord) => d.failure?.startedAt ?? d.deployedAt;

export interface DoraMetrics {
  deployments: number;
  deployDays: number;
  /** Deployments per week × 10 (one decimal, rounded half up). */
  perWeekTenths: number;
  /** Every change's lead time in minutes, sorted ascending. */
  leadTimes: number[];
  leadTimeMedian: number | undefined;
  failed: number;
  /** Change fail rate in whole percent (rounded half up). */
  changeFailPercent: number;
  /** Every failed deployment's recovery time in minutes, sorted ascending. */
  recoveryTimes: number[];
  recoveryMedian: number | undefined;
  detectTimes: number[];
  detectMedian: number | undefined;
}

export function doraMetrics(h: DeploymentHistory): DoraMetrics {
  const n = h.deployments.length;
  const leadTimes = h.deployments.flatMap(d => d.commitAt.map(c => d.deployedAt - c)).sort((a, b) => a - b);
  const failures = h.deployments.filter(d => d.failure);
  const recoveryTimes = failures.map(d => d.failure!.restoredAt - failureStart(d)).sort((a, b) => a - b);
  const detectTimes = failures.map(d => d.failure!.detectedAt - failureStart(d)).sort((a, b) => a - b);
  return {
    deployments: n,
    deployDays: new Set(h.deployments.map(d => Math.floor(d.deployedAt / MINUTES_PER_DAY))).size,
    perWeekTenths: roundHalfUp(n * 70, h.days),
    leadTimes, leadTimeMedian: median(leadTimes),
    failed: failures.length,
    changeFailPercent: n ? roundHalfUp(100 * failures.length, n) : 0,
    recoveryTimes, recoveryMedian: median(recoveryTimes),
    detectTimes, detectMedian: median(detectTimes),
  };
}

const isMinute = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

/** Everything that makes a history unusable: times out of the period or out of order, duplicate ids, empty changes. */
export function historyProblems(h: DeploymentHistory): string[] {
  const problems: string[] = [];
  if (!h.service?.trim()) problems.push('needs a service name');
  if (!Number.isInteger(h.days) || h.days < 1 || h.days > MAX_DAYS) problems.push(`days must be 1…${MAX_DAYS}`);
  if (!h.deployments.length) problems.push('needs at least one deployment');
  const end = h.days * MINUTES_PER_DAY, ids = new Set<string>();
  let previous = -1;
  for (const d of h.deployments) {
    const at = `deployment ${d.id}`;
    if (!d.id?.trim()) problems.push('a deployment needs an id');
    if (ids.has(d.id)) problems.push(`duplicate deployment ${d.id}`);
    ids.add(d.id);
    if (!isMinute(d.deployedAt) || d.deployedAt >= end) { problems.push(`${at}: deployedAt must be a whole minute inside the ${h.days}-day period`); continue; }
    if (d.deployedAt < previous) problems.push(`${at}: deployments are listed in the order they were deployed`);
    previous = d.deployedAt;
    if (!d.commitAt.length) problems.push(`${at}: needs at least one change (commitAt)`);
    for (const c of d.commitAt) if (!isMinute(c) || c > d.deployedAt) problems.push(`${at}: a change is committed at a whole minute ≥ 0, no later than the deployment`);
    if (d.failure) {
      const f = d.failure, start = failureStart(d);
      if (!isMinute(start) || start < d.deployedAt) problems.push(`${at}: the failure starts at or after the deployment`);
      if (!isMinute(f.detectedAt) || f.detectedAt < start) problems.push(`${at}: the failure is detected at or after it starts`);
      if (!isMinute(f.restoredAt) || f.restoredAt < f.detectedAt) problems.push(`${at}: service is restored at or after the failure is detected`);
    }
  }
  return problems;
}

/** A minute of the period as 第 d 天 hh:mm (day 1 is minute 0–1439). */
export function clockText(minute: number): string {
  const day = Math.floor(minute / MINUTES_PER_DAY) + 1, m = minute % MINUTES_PER_DAY;
  return `第 ${day} 天 ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** A duration in minutes as text: 45 分鐘, 2 小時 5 分鐘, 1 天 3 小時. */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} 分鐘`;
  const d = Math.floor(minutes / MINUTES_PER_DAY), h = Math.floor((minutes % MINUTES_PER_DAY) / 60), m = minutes % 60;
  return [d ? `${d} 天` : '', h ? `${h} 小時` : '', m ? `${m} 分鐘` : ''].filter(Boolean).join(' ');
}
