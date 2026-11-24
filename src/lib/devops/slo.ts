import { SEVERITIES, type Severity } from './alerts';
import { incidentProblems, type Incident } from './incident';
import { generateSeries, seriesProblems, type SeriesShape } from './series';

/*
 * CICD-0 devops-explorer stage D6 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.6), part of the monitoring-dashboard
 * activity (KUB14, KUB15): a service-level objective on bucketed good and total events. An invented, vendor-neutral
 * teaching model on authored data (示意資料), all exact integer arithmetic (BigInt for products), so a learner can recompute
 * every number by hand:
 * - Bucket t covers minutes [t × B, (t + 1) × B) of the period, B = bucketMinutes (1, 5 or 60), at most 720 buckets
 *   (720 hourly buckets are 30 days). Each bucket has a whole number of total events and of good ones (bad = total − good),
 *   written out or generated with D3's shapes (series.ts); either the good or the bad series is given.
 * - The objective is a target in permyriad (9990 = 99.9%) over a window of windowMinutes (≥ the period). When the period
 *   is shorter than the window (the scenario is the window's first part), the lesson states windowTotal, the events
 *   expected in the whole window.
 * - SLI over buckets = good ÷ total, shown in percent to three decimals (rounded half up, §5.3); it meets the target when
 *   good × 10000 ≥ target × total (compared exactly).
 * - Error budget (events) = ⌊windowTotal × (10000 − target) ÷ 10000⌋: the most bad events with which the SLO is still met
 *   (bad is whole, so bad ≤ ⌊x⌋ ⇔ bad ≤ x). Consumed after bucket t = the bad events of buckets 0…t; consumed % =
 *   consumed × 100 ÷ budget to one decimal (half up); remaining = budget − consumed (may be negative), remaining % =
 *   100 − consumed %. The budget is used up at the first bucket where consumed ≥ budget.
 * - SLA: a lower target with a credit table (bands below which a credit % applies); the credit is the band of the lowest
 *   threshold the SLI is under, compared exactly.
 */

export const BUCKET_MINUTES = [1, 5, 60] as const;
export const MAX_BUCKETS = 720;
export const MAX_WINDOW_MINUTES = 90 * 1440;
export const MAX_WINDOW_TOTAL = 1_000_000_000_000;

/** One whole number ≥ 0 per bucket, written out or generated from a D3 shape. */
export interface EventSeries { values?: number[]; shape?: SeriesShape }
export interface SloObjective {
  /** The target in permyriad: 9990 is 99.9%. */
  targetPermyriad: number;
  windowMinutes: number;
  /** The events expected in the whole window, needed (only) when the period is shorter than the window. */
  windowTotal?: number;
}
export interface SlaTerms {
  /** A lower target than the objective's, in permyriad. */
  targetPermyriad: number;
  /** From the SLA target down: below belowPermyriad, creditPercent of the bill is credited. */
  credits: { belowPermyriad: number; creditPercent: number }[];
}
/** A multi-window burn-rate condition: both windows' burn rates ≥ factor ÷ 10. */
export interface BurnCondition { longMinutes: number; shortMinutes: number; factorTenths: number }
export interface BurnAlertRule extends BurnCondition { id: string; label: string; severity: Severity }
export interface SloScenario {
  service: string;
  /** What counts as a good event, in words (e.g. 「回應碼不是 5xx、300 ms 內完成的請求」). */
  sli: string;
  bucketMinutes: typeof BUCKET_MINUTES[number];
  buckets: number;
  total: EventSeries;
  good?: EventSeries;
  bad?: EventSeries;
  objective: SloObjective;
  sla?: SlaTerms;
  /** Declared incidents, in buckets [start, end). */
  incidents?: Incident[];
  alerts?: BurnAlertRule[];
}

// ---- integer helpers -----------------------------------------------------------------------------------------------
const big = (x: number | bigint) => BigInt(x);
/** ⌊a ÷ b⌋ for b > 0 (BigInt division truncates toward zero). */
export function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
}
/** a ÷ b rounded half up (⌊(2a + b) ÷ 2b⌋, §5.3), exact for large products; b > 0. */
export const roundHalfUpBig = (a: number | bigint, b: number | bigint) => Number(floorDiv(2n * big(a) + big(b), 2n * big(b)));
/** 9990 → 99.9%, 9995 → 99.95%, 9900 → 99%. */
export function permyriadText(p: number): string {
  const frac = String(p % 100).padStart(2, '0').replace(/0+$/, '');
  return `${Math.floor(p / 100)}${frac ? `.${frac}` : ''}%`;
}
/** A value kept in tenths as text with one decimal (−205 → -20.5). */
export const tenthsText = (x: number) => `${x < 0 ? '-' : ''}${Math.floor(Math.abs(x) / 10)}.${Math.abs(x) % 10}`;
export const n0 = (x: number) => x.toLocaleString('en-US');

// ---- the events ------------------------------------------------------------------------------------------------------
export const seriesOfEvents = (e: EventSeries, buckets: number) => e.values ?? generateSeries(e.shape!, buckets);
export interface SloEvents { total: number[]; good: number[]; bad: number[] }
/** Every bucket's total, good and bad events (the validator makes sure good and bad are 0…total). */
export function sloEvents(s: SloScenario): SloEvents {
  const total = seriesOfEvents(s.total, s.buckets);
  if (s.good) { const good = seriesOfEvents(s.good, s.buckets); return { total, good, bad: total.map((x, t) => x - good[t]) }; }
  const bad = seriesOfEvents(s.bad!, s.buckets);
  return { total, good: total.map((x, t) => x - bad[t]), bad };
}
/** Sums of a series over buckets [from, to). */
export const sumOf = (xs: readonly number[], from = 0, to = xs.length) => xs.slice(from, to).reduce((a, b) => a + b, 0);
export const periodMinutes = (s: SloScenario) => s.buckets * s.bucketMinutes;
export const windowTotalOf = (s: SloScenario, e = sloEvents(s)) => s.objective.windowTotal ?? sumOf(e.total);
/** The error budget in events: the most bad events with which the SLO is still met. */
export const budgetEvents = (s: SloScenario, e = sloEvents(s)) =>
  Number(floorDiv(big(windowTotalOf(s, e)) * big(10000 - s.objective.targetPermyriad), 10000n));

/** good ÷ total in thousandths of a percent (99.905% → 99905), half up; undefined without events. */
export const sliThousandths = (good: number, total: number) => total ? roundHalfUpBig(big(good) * 100000n, total) : undefined;
export const sliText = (k: number | undefined) => k === undefined ? '—' : `${(k / 1000).toFixed(3)}%`;
/** Whether good ÷ total ≥ target (exactly). */
export const meetsTarget = (good: number, total: number, target: number) => big(good) * 10000n >= big(target) * big(total);

export interface BudgetRow { bad: number; consumed: number; consumedTenths: number; remaining: number; remainingTenths: number }
/** The budget after each bucket: the bucket's bad events, consumed so far, consumed %, remaining events and %. */
export function budgetTimeline(s: SloScenario, e = sloEvents(s)): BudgetRow[] {
  const budget = budgetEvents(s, e);
  let consumed = 0;
  return e.bad.map(bad => {
    consumed += bad;
    const consumedTenths = roundHalfUpBig(big(consumed) * 1000n, budget);
    return { bad, consumed, consumedTenths, remaining: budget - consumed, remainingTenths: 1000 - consumedTenths };
  });
}
/** The first bucket after which the budget is used up (consumed ≥ budget), if any. */
export const exhaustedBucket = (s: SloScenario, e = sloEvents(s)) => {
  const t = budgetTimeline(s, e).findIndex(r => r.remaining <= 0);
  return t < 0 ? undefined : t;
};

/** The SLA credit band the SLI over the events falls in: its index (or −1 above every band) and the credit %. */
export function slaCredit(sla: SlaTerms, good: number, total: number): { band: number; percent: number } {
  let band = -1;
  sla.credits.forEach((c, k) => { if (!meetsTarget(good, total, c.belowPermyriad)) band = k; });
  return { band, percent: band < 0 ? 0 : sla.credits[band].creditPercent };
}

// ---- validation ------------------------------------------------------------------------------------------------------
const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** What makes a burn condition impossible to evaluate on a scenario, in English (validation) and Chinese (the form). */
export function burnIssues(c: BurnCondition, s: Pick<SloScenario, 'bucketMinutes' | 'buckets'>): { en: string; zh: string }[] {
  const issues: { en: string; zh: string }[] = [], bm = s.bucketMinutes, period = s.buckets * bm;
  const add = (en: string, zh: string) => issues.push({ en, zh });
  const fits = (m: number) => whole(m, bm, period) && m % bm === 0;
  if (!fits(c.longMinutes)) add(`the long window is a multiple of ${bm} minutes, ${bm}…${period}`, `長視窗要填 ${bm} 的倍數，${bm}–${period} 分鐘。`);
  if (!fits(c.shortMinutes)) add(`the short window is a multiple of ${bm} minutes, ${bm}…${period}`, `短視窗要填 ${bm} 的倍數，${bm}–${period} 分鐘。`);
  else if (fits(c.longMinutes) && c.shortMinutes > c.longMinutes) add('the short window is at most the long window', '短視窗不能比長視窗長。');
  if (!whole(c.factorTenths, 1, 10000)) add('the factor is 0.1…1000 (factorTenths 1…10000)', '消耗率門檻要填 0.1–1000，最多一位小數。');
  return issues;
}

function eventSeriesProblems(e: EventSeries | undefined, name: string, buckets: number): string[] {
  if (!e) return [];
  // D3's checks, in buckets instead of minutes (shapes' at, from, to and spike lengths count buckets).
  return seriesProblems({ id: name, label: name, unit: 'events', signal: 'traffic', ...e }, buckets)
    .map(p => `${name}: ${p.replace('a minute of the dashboard', 'a bucket of the scenario').replace(/minutes\b/, 'buckets')}`);
}

/** Everything that makes an SLO scenario unusable. */
export function sloProblems(s: SloScenario): string[] {
  const problems: string[] = [];
  if (!s.service?.trim() || !s.sli?.trim()) problems.push('needs a service and the SLI in words');
  if (!(BUCKET_MINUTES as readonly number[]).includes(s.bucketMinutes)) problems.push('bucketMinutes is 1, 5 or 60');
  if (!whole(s.buckets, 1, MAX_BUCKETS)) problems.push(`buckets is 1…${MAX_BUCKETS}`);
  if (problems.length) return problems;
  if (!!s.good === !!s.bad) problems.push('needs either the good or the bad series (not both)');
  problems.push(...eventSeriesProblems(s.total, 'total', s.buckets), ...eventSeriesProblems(s.good, 'good', s.buckets), ...eventSeriesProblems(s.bad, 'bad', s.buckets));
  if (problems.length) return problems;
  const e = sloEvents(s), which = s.good ? 'good' : 'bad';
  const over = e.total.findIndex((x, t) => (s.good ? e.good[t] : e.bad[t]) > x);
  if (over >= 0) problems.push(`bucket ${over}: ${which} events exceed the total`);
  const o = s.objective, period = periodMinutes(s);
  if (!whole(o.targetPermyriad, 1, 9999)) problems.push('the target is 1…9999 permyriad');
  if (!whole(o.windowMinutes, period, MAX_WINDOW_MINUTES) || o.windowMinutes % s.bucketMinutes) problems.push(`the window is a multiple of ${s.bucketMinutes} minutes, ${period}…${MAX_WINDOW_MINUTES} (the period up to 90 days)`);
  else if (o.windowMinutes > period && !whole(o.windowTotal, sumOf(e.total), MAX_WINDOW_TOTAL)) problems.push(`a window longer than the period needs windowTotal, ${sumOf(e.total)}…${MAX_WINDOW_TOTAL}`);
  else if (o.windowMinutes === period && o.windowTotal !== undefined) problems.push('windowTotal is only for a window longer than the period');
  if (!problems.length && budgetEvents(s, e) < 1) problems.push('the error budget is less than one event');
  if (s.sla) {
    const c = s.sla.credits;
    if (!whole(s.sla.targetPermyriad, 1, o.targetPermyriad - 1)) problems.push('the SLA target is lower than the objective');
    if (!c.length || c[0].belowPermyriad !== s.sla.targetPermyriad) problems.push('the first credit band starts below the SLA target');
    if (c.some((x, k) => !whole(x.belowPermyriad, 1, 10000) || (k > 0 && x.belowPermyriad >= c[k - 1].belowPermyriad))) problems.push('credit bands go down (belowPermyriad 1…10000, decreasing)');
    if (c.some((x, k) => !whole(x.creditPercent, 1, 100) || (k > 0 && x.creditPercent <= c[k - 1].creditPercent))) problems.push('credits go up (1…100 percent, increasing)');
  }
  const ids = new Set<string>();
  for (const i of s.incidents ?? []) { if (ids.has(i.id)) problems.push(`duplicate id ${i.id}`); ids.add(i.id); }
  problems.push(...incidentProblems(s.incidents ?? [], s.buckets));
  for (const r of s.alerts ?? []) {
    if (ids.has(r.id)) problems.push(`duplicate id ${r.id}`);
    ids.add(r.id);
    if (!r.label?.trim()) problems.push(`alert ${r.id} needs a label`);
    if (!(SEVERITIES as readonly string[]).includes(r.severity)) problems.push(`alert ${r.id}: severity is one of ${SEVERITIES.join(', ')}`);
    problems.push(...burnIssues(r, s).map(i => `alert ${r.id}: ${i.en}`));
  }
  return problems;
}
