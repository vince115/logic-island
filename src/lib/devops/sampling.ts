import { roundHalfUp } from './history';
import type { AttrValue, Trace } from './traces';

/*
 * CICD-0 D5 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5): sampling and cardinality, this course's own rules (they
 * do not claim any tracing standard's exact bit layout or any product's policy names).
 * - Ratios are per mille (0…1000; 1000 keeps everything). A trace id decides by a threshold: the number r read from 8 of
 *   its hex digits (0…2^32 − 1) keeps the trace when r × 1000 < ratio × 2^32, so the decision is the same in every
 *   service that sees the id, and a larger ratio keeps every trace a smaller one keeps.
 * - Head sampling decides at the root, before anything is known about the trace: the last 8 hex digits, the head ratio.
 * - Tail sampling decides after the whole trace is complete, on the traces the head kept: keep it when it has an error
 *   span (keepErrors), when it is slower than slowerThanMs (duration > X), or else when the first 8 hex digits fall under
 *   restPermille (other digits than the head's, so the two ratios are independent).
 * - Spans a day: traces a day in production (the set's perDay) × kept spans ÷ traces in the set, rounded half up.
 * - Cardinality of a metric: the product of its labels' distinct values (the most series it can have).
 */

export interface TailPolicy { keepErrors: boolean; slowerThanMs?: number; restPermille: number }
export interface SamplingPolicy { headPermille: number; tail?: TailPolicy }
export const KEEP_ALL: SamplingPolicy = { headPermille: 1000 };

const TWO32 = 4294967296;
export const headDigits = (id: string) => parseInt(id.slice(-8), 16);
export const tailDigits = (id: string) => parseInt(id.slice(0, 8), 16);
/** Whether r (0…2^32 − 1) falls under the ratio (per mille). */
export const underRatio = (r: number, permille: number) => r * 1000 < permille * TWO32;

export type TailReason = 'error' | 'slow' | 'ratio';
export interface SamplingDecision { trace: Trace; head: boolean; tail?: TailReason; kept: boolean }
/** One trace's decision: the head first, then (on what the head kept) the tail's first rule that keeps it. */
export function decide(t: Trace, p: SamplingPolicy): SamplingDecision {
  const head = underRatio(headDigits(t.id), p.headPermille);
  if (!head || !p.tail) return { trace: t, head, kept: head };
  const tail: TailReason | undefined = p.tail.keepErrors && t.error ? 'error'
    : p.tail.slowerThanMs !== undefined && t.duration > p.tail.slowerThanMs ? 'slow'
    : underRatio(tailDigits(t.id), p.tail.restPermille) ? 'ratio' : undefined;
  return { trace: t, head, tail, kept: !!tail };
}

export interface SamplingResult {
  decisions: SamplingDecision[];
  traces: number; kept: number; errorTraces: number; keptErrors: number;
  spans: number; keptSpans: number;
  /** With the set's perDay: spans a day without sampling and with it. */
  spansPerDay?: number; keptSpansPerDay?: number;
  /** With a threshold: traces slower than it, and how many were kept. */
  slow?: { threshold: number; total: number; kept: number };
}
export function evaluateSampling(traces: readonly Trace[], p: SamplingPolicy, perDay?: number, slowerThan?: number): SamplingResult {
  const decisions = traces.map(t => decide(t, p)), kept = decisions.filter(d => d.kept);
  const spans = traces.reduce((n, t) => n + t.spans.length, 0), keptSpans = kept.reduce((n, d) => n + d.trace.spans.length, 0);
  const slowOnes = slowerThan === undefined ? [] : decisions.filter(d => d.trace.duration > slowerThan);
  return {
    decisions, traces: traces.length, kept: kept.length,
    errorTraces: traces.filter(t => t.error).length, keptErrors: kept.filter(d => d.trace.error).length,
    spans, keptSpans,
    ...perDay !== undefined && traces.length ? { spansPerDay: roundHalfUp(perDay * spans, traces.length), keptSpansPerDay: roundHalfUp(perDay * keptSpans, traces.length) } : {},
    ...slowerThan !== undefined ? { slow: { threshold: slowerThan, total: slowOnes.length, kept: slowOnes.filter(d => d.kept).length } } : {},
  };
}

/** Everything that makes a policy unusable. */
export function policyProblems(p: SamplingPolicy): string[] {
  const problems: string[] = [];
  const permille = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 1000;
  if (!permille(p.headPermille)) problems.push('headPermille is a whole number 0…1000');
  if (p.tail) {
    if (!permille(p.tail.restPermille)) problems.push('tail.restPermille is a whole number 0…1000');
    if (p.tail.slowerThanMs !== undefined && !(Number.isInteger(p.tail.slowerThanMs) && p.tail.slowerThanMs >= 0)) problems.push('tail.slowerThanMs is a whole number ≥ 0');
    if (typeof p.tail.keepErrors !== 'boolean') problems.push('tail.keepErrors is true or false');
  }
  return problems;
}
/** A ratio in per mille as a percentage: 1000 → 100, 5 → 0.5. */
export const percentText = (permille: number) => permille % 10 ? (permille / 10).toFixed(1) : String(permille / 10);
/** A policy in words. */
export function policyText(p: SamplingPolicy): string {
  const head = `頭部取樣 ${percentText(p.headPermille)}%`;
  if (!p.tail) return `${head}，不用尾端取樣`;
  const rules = [...p.tail.keepErrors ? ['保留有錯誤的追蹤'] : [], ...p.tail.slowerThanMs !== undefined ? [`保留慢於 ${p.tail.slowerThanMs} ms 的追蹤`] : [],
    `其餘保留 ${percentText(p.tail.restPermille)}%`];
  return `${head}；尾端取樣：${rules.join('、')}`;
}

// ---- cardinality --------------------------------------------------------------------------------------------------
/** The labels a span always has. */
export const SPAN_LABELS = ['service', 'name', 'status', 'kind'] as const;
const labelValue = (s: Trace['spans'][number], label: string): AttrValue | undefined =>
  label === 'service' ? s.service : label === 'name' ? s.name : label === 'status' ? s.status : label === 'kind' ? s.kind : s.attributes[label];
/** Every label of the traces' spans: the four every span has, then the attributes by first appearance. */
export function labelNames(traces: readonly Trace[]): string[] {
  const names = new Set<string>(SPAN_LABELS);
  for (const t of traces) for (const s of t.spans) for (const k of Object.keys(s.attributes)) names.add(k);
  return [...names];
}
/** How many distinct values a label takes over all spans that have it. */
export function distinctValues(traces: readonly Trace[], label: string): number {
  const seen = new Set<string>();
  for (const t of traces) for (const s of t.spans) { const v = labelValue(s, label); if (v !== undefined) seen.add(String(v)); }
  return seen.size;
}
/** The most series a metric with these labels can have: the product of their distinct values (exact, as a bigint). */
export const seriesCount = (counts: readonly number[]) => counts.reduce((n, c) => n * BigInt(c), BigInt(1));
