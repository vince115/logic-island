import { runAlert, type AlertRun } from './alerts';
import { durationText } from './history';
import { budgetTimeline, burnIssues, roundHalfUpBig, sloEvents, sumOf, tenthsText, type BurnCondition, type SloEvents, type SloScenario } from './slo';

/*
 * CICD-0 devops-explorer stage D6 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.6): burn rates and multi-window
 * burn-rate alerts on an SLO scenario (slo.ts). Vendor-neutral; the multi-window, multi-burn-rate idea is common SRE
 * practice, the rules here are this course's own:
 * - The burn rate over a window of W minutes at bucket t is over buckets [t − k + 1, t], k = W ÷ bucketMinutes:
 *   (bad ÷ total) ÷ (1 − target) = bad × 10000 ÷ (total × (10000 − target)); shown to one decimal, rounded half up.
 *   Before the window is full there is no value; a window without events burns 0. A burn rate of 1 uses exactly the
 *   whole budget over the SLO window.
 * - A burn-rate alert fires at bucket t when the long and the short window are both full and both burn rates are
 *   ≥ factor ÷ 10 (compared exactly: bad × 100000 ≥ factorTenths × total × (10000 − target)). The states, firing
 *   intervals and incident matching are D3's (alerts.ts runAlert), one step per bucket, with no `for` (the short window
 *   makes a stopped burn resolve quickly).
 * - Hours left at bucket t at the rate of the last W minutes: the remaining budget ÷ the bad events per hour of that
 *   window = remaining × W ÷ (bad × 60), one decimal, half up (0 when the budget is used up; none when the window has no
 *   bad events).
 */

export interface WindowSums { bad: number; total: number }
const big = (x: number) => BigInt(x);

/** The bad and total events of the window of `minutes` ending at bucket t (undefined until it is full). */
export function windowSums(s: SloScenario, e: SloEvents, t: number, minutes: number): WindowSums | undefined {
  const k = minutes / s.bucketMinutes;
  if (!Number.isInteger(k) || k < 1 || t < k - 1 || t >= s.buckets) return undefined;
  return { bad: sumOf(e.bad, t - k + 1, t + 1), total: sumOf(e.total, t - k + 1, t + 1) };
}
/** A window's burn rate in tenths (14.4 → 144), half up; 0 without events. */
export const burnTenths = (w: WindowSums, target: number) => w.total ? roundHalfUpBig(big(w.bad) * 100000n, big(w.total) * big(10000 - target)) : 0;
/** Whether a window burns at least factorTenths ÷ 10 (exactly). */
export const burnsAtLeast = (w: WindowSums, target: number, factorTenths: number) =>
  w.total > 0 && big(w.bad) * 100000n >= big(factorTenths) * big(w.total) * big(10000 - target);

/** A burn rate or factor in tenths as text: 144 → 14.4, 60 → 6. */
export const factorText = (tenths: number) => tenths % 10 ? tenthsText(tenths) : String(tenths / 10);
/** A condition in words: 「1 小時與 5 分鐘的消耗率都 ≥ 14.4」. */
export const burnConditionText = (c: BurnCondition) =>
  `長視窗 ${durationText(c.longMinutes)}與短視窗 ${durationText(c.shortMinutes)}的消耗率都 ≥ ${factorText(c.factorTenths)}`;

export interface BurnResult extends AlertRun {
  /** Each bucket's burn rate (tenths) over the long and the short window (undefined until the window is full). */
  long: (number | undefined)[];
  short: (number | undefined)[];
}
/** Evaluates a burn-rate condition bucket by bucket and matches its firing intervals with the declared incidents. */
export function evaluateBurn(s: SloScenario, c: BurnCondition, e = sloEvents(s)): BurnResult {
  const target = s.objective.targetPermyriad;
  const at = (minutes: number) => Array.from({ length: s.buckets }, (_, t) => windowSums(s, e, t, minutes));
  const longW = at(c.longMinutes), shortW = at(c.shortMinutes);
  const holds = longW.map((l, t) => !!l && !!shortW[t] && burnsAtLeast(l, target, c.factorTenths) && burnsAtLeast(shortW[t]!, target, c.factorTenths));
  return { ...runAlert(holds, 0, s.incidents ?? []), long: longW.map(w => w && burnTenths(w, target)), short: shortW.map(w => w && burnTenths(w, target)) };
}
/** Throws when the condition cannot be evaluated on the scenario. */
export function evaluateBurnChecked(s: SloScenario, c: BurnCondition): BurnResult {
  const issues = burnIssues(c, s);
  if (issues.length) throw new Error(issues.map(i => i.en).join('; '));
  return evaluateBurn(s, c);
}

/** Hours (tenths) the remaining budget lasts after bucket t at the bad-event rate of the last `minutes`. */
export function hoursLeftTenths(s: SloScenario, t: number, minutes: number, e = sloEvents(s)): number | undefined {
  const w = windowSums(s, e, t, minutes), row = budgetTimeline(s, e)[t];
  if (!w || !row) throw new Error(`hours-left needs a bucket whose ${minutes}-minute window is full`);
  if (row.remaining <= 0) return 0;
  if (!w.bad) return undefined;
  return roundHalfUpBig(big(row.remaining) * big(minutes) * 10n, big(w.bad) * 60n);
}
