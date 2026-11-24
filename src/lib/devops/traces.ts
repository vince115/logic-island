import { isSeed, mulberry32 } from '@/lib/llm/prng';

/*
 * CICD-0 devops-explorer stage D5 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5), part of the monitoring-dashboard
 * activity: distributed traces. An invented teaching model on authored data (示意資料), not any tracing product or SDK:
 * - A trace (32 lowercase hex digits) is a tree of spans (16 hex digits each): one root, every other span names its
 *   parent. A span has a service, an operation name, a start and a duration in whole milliseconds from the trace's start,
 *   a status (ok or error), a kind (server, client, internal, producer, consumer) and attributes (string or whole-number
 *   values). A child starts no earlier than its parent; it may end later (asynchronous work), and the analysis clips it.
 * - The lesson writes the traces that matter and may add bulk traces from a seeded generator (src/lib/llm/prng.ts) that
 *   follows a declared call shape, so it need not hand-write hundreds. The server render, the browser and the tests
 *   produce the same traces.
 *
 * Generated trace k = 0, 1… count − 1, draws u of mulberry32(seed) in this order:
 *   the trace id: four draws, each ⌊u × 2^32⌋ as 8 hex digits;
 *   each span of the shape, depth first (a span, then its calls in order): two draws for its id (8 hex digits each),
 *     one for its own time selfMs.min + ⌊u × (max − min + 1)⌋, one for its error (u × 1000 < errorPermille) when
 *     errorPermille > 0, one for a slow call (u × 1000 < slowPermille adds slowMs to its own time) when slowPermille > 0;
 *   then, when `users` is set, one for the root's user_id `u-${1000 + ⌊u × users⌋}`.
 * Timing: a span does ⌊own ÷ 2⌋ ms of its own work, then its calls (one after another, or all at once when `parallel`),
 * then the rest of its own work; so its duration is its own time plus the time its calls take, and its self time is
 * exactly its own time. The root starts at 0.
 */

export const SPAN_KINDS = ['server', 'client', 'internal', 'producer', 'consumer'] as const;
export type SpanKind = typeof SPAN_KINDS[number];
export const SPAN_KIND_LABEL: Record<SpanKind, string> = { server: '伺服器端', client: '用戶端', internal: '內部', producer: '生產者', consumer: '消費者' };
export type SpanStatus = 'ok' | 'error';
export const STATUS_LABEL: Record<SpanStatus, string> = { ok: '正常', error: '錯誤' };
export type AttrValue = string | number;

/** A span as the lesson writes it (times in whole ms from the trace's start). */
export interface SpanInput {
  id: string; parent?: string; service: string; name: string; start: number; duration: number;
  status?: SpanStatus; kind?: SpanKind; attributes?: Record<string, AttrValue>;
}
export interface TraceInput { id: string; spans: SpanInput[] }

/** A call in a generator's shape: a span and the calls it makes. */
export interface CallShape {
  service: string; name: string; kind?: SpanKind;
  /** Its own work in ms (drawn between min and max, both included). */
  selfMs: { min: number; max: number };
  calls?: CallShape[];
  /** The calls start together instead of one after another. */
  parallel?: boolean;
  /** Chance (per mille) that this span fails. */
  errorPermille?: number;
  /** Chance (per mille) that this span is slow by slowMs more of its own work. */
  slowPermille?: number; slowMs?: number;
  attributes?: Record<string, AttrValue>;
}
export interface TraceGenerator { seed: number; count: number; root: CallShape; users?: number }
/** A D3 exemplar: a dashboard series' minute and one trace recorded in it. */
export interface Exemplar { series: string; minute: number; trace: string }
export interface TraceSet {
  traces?: TraceInput[];
  generate?: TraceGenerator;
  /** Traces (requests) a day in production, for spans-per-day estimates. */
  perDay?: number;
  exemplars?: Exemplar[];
}

export interface Span {
  id: string; parent?: string; service: string; name: string; start: number; duration: number; end: number;
  status: SpanStatus; kind: SpanKind; attributes: Record<string, AttrValue>; depth: number;
}
export interface Trace {
  id: string;
  /** Depth first from the root; children by start time (then as written). */
  spans: Span[];
  root: Span; start: number; end: number; duration: number; error: boolean; generated: boolean;
}

export const MAX_TRACES = 2000;
export const MAX_GENERATED_SPANS = 20_000;
export const MAX_WRITTEN_SPANS = 200;
export const MAX_SHAPE_SPANS = 40;
export const MAX_MS = 3_600_000;
export const TRACE_ID = /^[0-9a-f]{32}$/;
export const SPAN_ID = /^[0-9a-f]{16}$/;
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** A trace from its spans (assumes traceProblems is empty). */
export function buildTrace(id: string, inputs: readonly SpanInput[], generated = false): Trace {
  const kids = new Map<string | undefined, SpanInput[]>();
  for (const s of inputs) kids.set(s.parent, [...kids.get(s.parent) ?? [], s]);
  const spans: Span[] = [];
  const visit = (s: SpanInput, depth: number) => {
    spans.push({ id: s.id, parent: s.parent, service: s.service, name: s.name, start: s.start, duration: s.duration, end: s.start + s.duration,
      status: s.status ?? 'ok', kind: s.kind ?? 'internal', attributes: { ...s.attributes }, depth });
    // Array.prototype.sort is stable: children at the same start keep the written order.
    for (const c of [...kids.get(s.id) ?? []].sort((a, b) => a.start - b.start)) visit(c, depth + 1);
  };
  visit(kids.get(undefined)![0], 0);
  const start = Math.min(...spans.map(s => s.start)), end = Math.max(...spans.map(s => s.end));
  return { id, spans, root: spans[0], start, end, duration: end - start, error: spans.some(s => s.status === 'error'), generated };
}

export const shapeSize = (s: CallShape): number => 1 + (s.calls ?? []).reduce((n, c) => n + shapeSize(c), 0);
const shapeDepth = (s: CallShape): number => 1 + Math.max(0, ...(s.calls ?? []).map(shapeDepth));

/** The generated traces, in generation order. */
export function generateTraces(g: TraceGenerator): Trace[] {
  const next = mulberry32(g.seed);
  const hex8 = () => Math.floor(next() * 4294967296).toString(16).padStart(8, '0');
  return Array.from({ length: g.count }, () => {
    const id = hex8() + hex8() + hex8() + hex8();
    const spans: SpanInput[] = [];
    const build = (shape: CallShape, parent: string | undefined, start: number): number => {
      const span: SpanInput = { id: hex8() + hex8(), parent, service: shape.service, name: shape.name, start, duration: 0, kind: shape.kind ?? (parent ? 'internal' : 'server'),
        ...shape.attributes ? { attributes: { ...shape.attributes } } : {} };
      spans.push(span);
      let own = shape.selfMs.min + Math.floor(next() * (shape.selfMs.max - shape.selfMs.min + 1));
      if (shape.errorPermille && next() * 1000 < shape.errorPermille) span.status = 'error';
      if (shape.slowPermille && next() * 1000 < shape.slowPermille) own += shape.slowMs ?? 0;
      const lead = Math.floor(own / 2);
      let cursor = start + lead, callsEnd = cursor;
      for (const c of shape.calls ?? []) {
        const end = build(c, span.id, shape.parallel ? start + lead : cursor);
        if (!shape.parallel) cursor = end;
        callsEnd = Math.max(callsEnd, end);
      }
      span.duration = callsEnd - start + own - lead;
      return start + span.duration;
    };
    build(g.root, undefined, 0);
    if (g.users) spans[0].attributes = { ...spans[0].attributes, user_id: `u-${1000 + Math.floor(next() * g.users)}` };
    return buildTrace(id, spans, true);
  });
}

/** Every trace of the set (written first, then generated); assumes traceSetProblems is empty. */
export function setTraces(s: TraceSet): Trace[] {
  return [...(s.traces ?? []).map(t => buildTrace(t.id, t.spans)), ...s.generate ? generateTraces(s.generate) : []];
}
const cache = new WeakMap<TraceSet, Trace[]>();
/** The traces of a set (computed once per set object). */
export function tracesOf(s: TraceSet): Trace[] {
  let t = cache.get(s);
  if (!t) { t = setTraces(s); cache.set(s, t); }
  return t;
}
export const traceById = (traces: readonly Trace[], id: string) => traces.find(t => t.id === id);

function attrProblems(at: string, attrs: Record<string, AttrValue> | undefined): string[] {
  const problems: string[] = [];
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (!ATTR_NAME.test(k)) problems.push(`${at}: attribute ${k} is not a name (letters, digits, _ and .)`);
    if (!(typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v)))) problems.push(`${at}: attribute ${k} is a string or a whole number`);
  }
  return problems;
}

/** Everything that makes a written trace unusable. */
export function traceProblems(t: TraceInput): string[] {
  const at = `trace ${t.id}`, problems: string[] = [];
  if (!TRACE_ID.test(t.id) || /^0+$/.test(t.id)) problems.push(`${at}: the id is 32 lowercase hex digits, not all zero`);
  if (!t.spans.length || t.spans.length > MAX_WRITTEN_SPANS) { problems.push(`${at}: needs 1…${MAX_WRITTEN_SPANS} spans`); return problems; }
  const byId = new Map<string, SpanInput>();
  for (const s of t.spans) {
    const sp = `${at} span ${s.id}`;
    if (!SPAN_ID.test(s.id) || /^0+$/.test(s.id)) problems.push(`${sp}: the id is 16 lowercase hex digits, not all zero`);
    if (byId.has(s.id)) problems.push(`${at}: duplicate span ${s.id}`);
    byId.set(s.id, s);
    if (!s.service?.trim() || !s.name?.trim()) problems.push(`${sp}: needs a service and a name`);
    if (!whole(s.start, 0, MAX_MS) || !whole(s.duration, 0, MAX_MS)) problems.push(`${sp}: start and duration are whole ms 0…${MAX_MS}`);
    if (s.status !== undefined && s.status !== 'ok' && s.status !== 'error') problems.push(`${sp}: status is ok or error`);
    if (s.kind !== undefined && !(SPAN_KINDS as readonly string[]).includes(s.kind)) problems.push(`${sp}: kind is one of ${SPAN_KINDS.join(', ')}`);
    problems.push(...attrProblems(sp, s.attributes));
  }
  const roots = t.spans.filter(s => s.parent === undefined);
  if (roots.length !== 1) problems.push(`${at}: needs exactly one root span (without a parent), not ${roots.length}`);
  for (const s of t.spans) if (s.parent !== undefined) {
    const p = byId.get(s.parent);
    if (!p) problems.push(`${at} span ${s.id}: no parent span ${s.parent}`);
    else if (s.start < p.start) problems.push(`${at} span ${s.id}: starts before its parent ${p.id}`);
  }
  if (!problems.length) {
    // Every span reachable from the root (a cycle would leave some out).
    const seen = new Set<string>(), stack = [roots[0].id];
    while (stack.length) { const id = stack.pop()!; seen.add(id); for (const s of t.spans) if (s.parent === id && !seen.has(s.id)) stack.push(s.id); }
    if (seen.size !== t.spans.length) problems.push(`${at}: every span must lead up to the root (a parent cycle?)`);
  }
  return problems;
}

function shapeProblems(s: CallShape, at: string): string[] {
  const problems: string[] = [];
  if (!s.service?.trim() || !s.name?.trim()) problems.push(`${at}: needs a service and a name`);
  if (!whole(s.selfMs?.min, 0, 600_000) || !whole(s.selfMs?.max, s.selfMs?.min ?? 0, 600_000)) problems.push(`${at}: 0 ≤ selfMs.min ≤ max ≤ 600000`);
  if (s.kind !== undefined && !(SPAN_KINDS as readonly string[]).includes(s.kind)) problems.push(`${at}: kind is one of ${SPAN_KINDS.join(', ')}`);
  if (s.errorPermille !== undefined && !whole(s.errorPermille, 0, 1000)) problems.push(`${at}: errorPermille is 0…1000`);
  if (s.slowPermille !== undefined && (!whole(s.slowPermille, 0, 1000) || !whole(s.slowMs, 1, 600_000))) problems.push(`${at}: slowPermille is 0…1000 with slowMs 1…600000`);
  problems.push(...attrProblems(at, s.attributes));
  (s.calls ?? []).forEach((c, i) => problems.push(...shapeProblems(c, `${at}.calls[${i}]`)));
  return problems;
}

/** Everything that makes a trace set unusable (the exemplars' series and minutes are checked against a dashboard elsewhere). */
export function traceSetProblems(s: TraceSet): string[] {
  const problems: string[] = [];
  for (const t of s.traces ?? []) problems.push(...traceProblems(t));
  const g = s.generate;
  if (g) {
    if (!isSeed(g.seed)) problems.push('generate: the seed is a whole number 0…4294967295');
    if (!whole(g.count, 1, MAX_TRACES)) problems.push(`generate: count is 1…${MAX_TRACES}`);
    if (g.users !== undefined && !whole(g.users, 1, 1_000_000)) problems.push('generate: users is 1…1000000');
    problems.push(...shapeProblems(g.root, 'generate: root'));
    const size = shapeSize(g.root);
    if (size > MAX_SHAPE_SPANS || shapeDepth(g.root) > 8) problems.push(`generate: a shape has at most ${MAX_SHAPE_SPANS} spans, 8 levels deep`);
    else if (size * (g.count || 0) > MAX_GENERATED_SPANS) problems.push(`generate: at most ${MAX_GENERATED_SPANS} generated spans (count × spans of the shape)`);
  }
  const total = (s.traces?.length ?? 0) + (g?.count ?? 0);
  if (!total) problems.push('needs at least one trace (written or generated)');
  if (total > MAX_TRACES) problems.push(`at most ${MAX_TRACES} traces`);
  if (s.perDay !== undefined && !whole(s.perDay, 1, 1_000_000_000)) problems.push('perDay is 1…1000000000');
  if (problems.length) return problems;
  const ids = new Set<string>();
  for (const t of setTraces(s)) { if (ids.has(t.id)) problems.push(`duplicate trace id ${t.id}`); ids.add(t.id); }
  for (const e of s.exemplars ?? []) {
    if (!e.series?.trim() || !whole(e.minute, 0, 100_000)) problems.push('an exemplar needs a series and a whole minute');
    if (!ids.has(e.trace)) problems.push(`the exemplar at minute ${e.minute} names no trace of the set (${e.trace})`);
  }
  return problems;
}
