import type { Span, Trace } from './traces';

/*
 * CICD-0 D5 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5): what the trace explorer computes from one trace or from
 * all of them. Times are whole milliseconds; every rule below is this course's teaching model.
 * - Self time of a span: its duration minus the union of its children's intervals, each clipped to the span's own
 *   interval [start, end) (overlapping children are counted once; a child that runs past its parent counts up to the
 *   parent's end).
 * - Critical path, inside the root's interval: walk back from the root's end; the child that finishes last (at or before
 *   the cursor, clipped to it) is on the path, the time between its end and the cursor belongs to the parent, the walk
 *   goes into that child up to its (clipped) end, then the cursor moves to the child's start and the next child that
 *   finishes last before it is taken; time with no child left is the parent's. Ties go to the child that started first.
 *   The segments add up to the root's duration.
 * - Bottleneck: the service with the most time on the critical path (its spans' own segments added up).
 * - Percentile across traces by nearest rank: the durations sorted ascending, the value at rank ⌈p × N ÷ 100⌉.
 */

export interface PathSegment { span: Span; from: number; to: number }
export interface SpanRow { span: Span; self: number; critical: number; onPath: boolean }
export interface TraceAnalysis {
  trace: Trace;
  /** In the trace's order (depth first). */
  rows: SpanRow[];
  /** Critical-path segments, latest first as the walk finds them. */
  segments: PathSegment[];
  /** The spans the critical path goes through, by start time (then depth-first order). */
  pathSpans: Span[];
  /** Their services in that order, a service named again only after another one. */
  pathServices: string[];
  /** Time on the critical path per service, most first (then by name). */
  byService: { service: string; ms: number }[];
  /** The service with the most critical time, when no other service ties with it. */
  bottleneck?: { service: string; ms: number };
}

const childrenOf = (t: Trace) => {
  const kids = new Map<string, Span[]>();
  for (const s of t.spans) if (s.parent !== undefined) kids.set(s.parent, [...kids.get(s.parent) ?? [], s]);
  return (s: Span) => kids.get(s.id) ?? [];
};

/** The length of the union of intervals [a, b), each clipped to [from, to). */
export function unionLength(intervals: readonly [number, number][], from: number, to: number): number {
  const clipped = intervals.map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, curA = -1, curB = -1;
  for (const [a, b] of clipped) {
    if (a > curB) { total += curB - curA; curA = a; curB = b; } else curB = Math.max(curB, b);
  }
  return total + curB - curA;
}

/** A span's self time: its duration minus the union of its children's (clipped) intervals. */
export const selfTimeOf = (span: Span, children: readonly Span[]) =>
  span.duration - unionLength(children.map(c => [c.start, c.end]), span.start, span.end);

/** The critical path's segments, walking back from `until` in `span`. */
function walk(span: Span, until: number, kids: (s: Span) => Span[], out: PathSegment[], visited: Span[]) {
  visited.push(span);
  let cursor = until;
  const used = new Set<Span>();
  while (cursor > span.start) {
    let best: Span | undefined, bestEnd = -1;
    for (const c of kids(span)) {
      if (used.has(c) || c.start >= cursor) continue;
      const e = Math.min(c.end, cursor);
      if (e > bestEnd) { best = c; bestEnd = e; }
    }
    if (!best) { out.push({ span, from: span.start, to: cursor }); return; }
    used.add(best);
    if (cursor > bestEnd) out.push({ span, from: bestEnd, to: cursor });
    walk(best, bestEnd, kids, out, visited);
    cursor = best.start;
  }
}

export function analyzeTrace(t: Trace): TraceAnalysis {
  const kids = childrenOf(t);
  const segments: PathSegment[] = [], visited: Span[] = [];
  walk(t.root, t.root.end, kids, segments, visited);
  const critical = new Map<Span, number>();
  for (const s of segments) critical.set(s.span, (critical.get(s.span) ?? 0) + s.to - s.from);
  const onPath = new Set(visited);
  const rows = t.spans.map(span => ({ span, self: selfTimeOf(span, kids(span)), critical: critical.get(span) ?? 0, onPath: onPath.has(span) }));
  const order = new Map(t.spans.map((s, i) => [s, i]));
  const pathSpans = [...visited].sort((a, b) => a.start - b.start || order.get(a)! - order.get(b)!);
  const pathServices = pathSpans.map(s => s.service).filter((s, i, all) => i === 0 || all[i - 1] !== s);
  const totals = new Map<string, number>();
  for (const s of segments) totals.set(s.span.service, (totals.get(s.span.service) ?? 0) + s.to - s.from);
  const byService = [...totals].map(([service, ms]) => ({ service, ms })).sort((a, b) => b.ms - a.ms || (a.service < b.service ? -1 : a.service > b.service ? 1 : 0));
  const bottleneck = byService[0] && (!byService[1] || byService[1].ms < byService[0].ms) ? byService[0] : undefined;
  return { trace: t, rows, segments, pathSpans, pathServices, byService, bottleneck };
}
const cache = new WeakMap<Trace, TraceAnalysis>();
/** A trace's analysis (computed once per trace object). */
export function analysisOf(t: Trace): TraceAnalysis {
  let a = cache.get(t);
  if (!a) { a = analyzeTrace(t); cache.set(t, a); }
  return a;
}

/** The p-th percentile (1…100) of the values by nearest rank: sorted ascending, the value at rank ⌈p × N ÷ 100⌉. */
export function nearestRank(values: readonly number[], p: number): number {
  if (!values.length) throw new Error('no values');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.floor((p * sorted.length + 99) / 100));
  return sorted[rank - 1];
}

/** A span of a trace by its id, or by its operation name when exactly one span has it. */
export function findSpan(t: Trace, key: string): Span | undefined {
  const byId = t.spans.find(s => s.id === key);
  if (byId) return byId;
  const named = t.spans.filter(s => s.name === key);
  return named.length === 1 ? named[0] : undefined;
}

/** The span as the explorer names it: its service and operation. */
export const spanLabel = (s: Span) => `${s.service}：${s.name}`;
