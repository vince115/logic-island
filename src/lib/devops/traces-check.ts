import type { DevopsValue } from './check';
import { fieldNames } from './log-query';
import { correlationFieldOf, type LogRecord } from './logs';
import { recordsOf } from './logs-check';
import { KEEP_ALL, distinctValues, evaluateSampling, labelNames, policyProblems, seriesCount, type SamplingPolicy } from './sampling';
import { analysisOf, findSpan, nearestRank } from './trace-query';
import { traceById, traceSetProblems, tracesOf, type Trace } from './traces';
import { SAMPLING_METRICS, TRACE_METRICS, type DevopsLessonContent, type DevopsQuery, type TracesExplorer } from './types';

/*
 * CICD-0 devops-explorer stage D5 exercises (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5): the trace, sampling and
 * cardinality queries, computed from the lesson's trace sets, and what the validator checks in a traces explorer (its
 * links to the lesson's logs and dashboard). The sampling-plan task is in sampling-check.ts. check.ts dispatches here.
 */

const num = (value: number, unit: string): DevopsValue => ({ type: 'number', value, decimals: 0, unit });
const text = (value: string, shown: string, aliases: string[]): DevopsValue => ({ type: 'text', value, shown, aliases: [value, shown, ...aliases] });

export function tracesExplorerById(c: DevopsLessonContent, id: string): TracesExplorer {
  const found = c.traces?.find(x => x.id === id);
  if (!found) throw new Error(`no traces ${id}`);
  return found;
}
/** A trace id as an answer: the full id, or its first 8 hex digits when no other trace starts with them. */
export function traceIdValue(id: string, traces: readonly Trace[]): DevopsValue {
  const short = id.slice(0, 8), unique = traces.filter(t => t.id.startsWith(short)).length === 1;
  return text(id, id, unique ? [short] : []);
}
/** The log records that carry a trace's id, through the explorer's link (empty without one). */
export function linkedRecords(x: TracesExplorer, c: DevopsLessonContent, traceId: string): { field: string; records: LogRecord[] } | undefined {
  if (!x.links?.logs) return undefined;
  const logs = c.logs?.find(l => l.id === x.links!.logs);
  if (!logs) return undefined;
  const field = x.links.field ?? correlationFieldOf(logs.logs);
  return { field, records: recordsOf(logs.logs).filter(r => r.fields[field] !== undefined && String(r.fields[field]) === traceId) };
}

type TracesQuery = Extract<DevopsQuery, { task: 'trace' | 'sampling' | 'cardinality' }>;
/** A D5 query's value; throws when it names something the traces do not have. */
export function tracesQueryValue(q: TracesQuery, c: DevopsLessonContent): DevopsValue {
  if (q.task === 'cardinality') {
    if (q.metric !== 'series' && q.metric !== 'distinct') throw new Error(`unknown cardinality metric ${q.metric}`);
    if (!q.labels.length) throw new Error('cardinality needs labels');
    const traces = q.traces === undefined ? undefined : tracesOf(tracesExplorerById(c, q.traces).traces);
    const counts = q.labels.map(l => {
      if (typeof l !== 'string') {
        if (!l.name?.trim() || !Number.isInteger(l.values) || l.values < 1 || l.values > 1_000_000_000) throw new Error('a given label has a name and 1…1000000000 values');
        return l.values;
      }
      if (!traces) throw new Error(`the label ${l} is counted in a trace set: name it (traces)`);
      const n = distinctValues(traces, l);
      if (!n) throw new Error(`no span has the label ${l}`);
      return n;
    });
    if (q.metric === 'distinct') {
      if (counts.length !== 1) throw new Error('distinct counts one label');
      return num(counts[0], '個');
    }
    const n = seriesCount(counts);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('the series count is too large to compare exactly');
    return num(Number(n), '條');
  }
  const x = tracesExplorerById(c, q.traces), set = x.traces, traces = tracesOf(set);
  if (q.task === 'sampling') {
    if (!(SAMPLING_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown sampling metric ${q.metric}`);
    const policy: SamplingPolicy = q.policy ?? KEEP_ALL;
    const bad = policyProblems(policy);
    if (bad.length) throw new Error(`the policy: ${bad.join('; ')}`);
    const slowNeeded = q.metric === 'slow-traces' || q.metric === 'kept-slow';
    if (slowNeeded && (q.slowerThan === undefined || !Number.isInteger(q.slowerThan) || q.slowerThan < 0)) throw new Error(`${q.metric} needs slowerThan (whole ms)`);
    if ((q.metric === 'spans-per-day' || q.metric === 'kept-spans-per-day') && set.perDay === undefined) throw new Error(`${q.metric} needs the set's perDay`);
    const r = evaluateSampling(traces, policy, set.perDay, slowNeeded ? q.slowerThan : undefined);
    switch (q.metric) {
      case 'traces': return num(r.traces, '個');
      case 'error-traces': return num(r.errorTraces, '個');
      case 'slow-traces': return num(r.slow!.total, '個');
      case 'kept': return num(r.kept, '個');
      case 'kept-errors': return num(r.keptErrors, '個');
      case 'kept-slow': return num(r.slow!.kept, '個');
      case 'spans': return num(r.spans, '個');
      case 'kept-spans': return num(r.keptSpans, '個');
      case 'spans-per-day': return num(r.spansPerDay!, '個');
      case 'kept-spans-per-day': return num(r.keptSpansPerDay!, '個');
    }
  }
  if (!(TRACE_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown trace metric ${q.metric}`);
  if (q.metric === 'percentile') {
    const p = q.p ?? 95;
    if (!Number.isInteger(p) || p < 1 || p > 100) throw new Error('percentile takes p 1…100');
    return num(nearestRank(traces.map(t => t.duration), p), 'ms');
  }
  if (q.metric === 'slowest') {
    const max = Math.max(...traces.map(t => t.duration)), top = traces.filter(t => t.duration === max);
    if (top.length > 1) throw new Error(`${top.length} traces share the longest duration (${max} ms)`);
    return traceIdValue(top[0].id, traces);
  }
  if (q.metric === 'exemplar') {
    const e = set.exemplars?.find(x => x.series === q.series && x.minute === q.minute);
    if (!e) throw new Error(`no exemplar for series ${q.series ?? '(none)'} at minute ${q.minute ?? '(none)'}`);
    return traceIdValue(e.trace, traces);
  }
  if (!q.trace) throw new Error(`${q.metric} needs a trace`);
  const t = traceById(traces, q.trace);
  if (!t) throw new Error(`no trace ${q.trace}`);
  const a = analysisOf(t);
  switch (q.metric) {
    case 'spans': return num(t.spans.length, '個');
    case 'duration': return num(t.duration, 'ms');
    case 'error-spans': return num(t.spans.filter(s => s.status === 'error').length, '個');
    case 'self-time': {
      const s = q.span === undefined ? undefined : findSpan(t, q.span);
      if (!s) throw new Error(`self-time needs a span of trace ${t.id} (its id, or a name only one span has): ${q.span ?? 'none given'}`);
      return num(a.rows.find(r => r.span === s)!.self, 'ms');
    }
    case 'critical-services': { const shown = a.pathServices.join(' → '); return { ...text(shown, shown, [a.pathServices.join(', ')]), list: a.pathServices } as DevopsValue; }
    case 'bottleneck': case 'bottleneck-time': {
      if (!a.bottleneck) throw new Error(`trace ${t.id}: ${a.byService[0].service} and ${a.byService[1].service} tie on the critical path`);
      return q.metric === 'bottleneck' ? text(a.bottleneck.service, a.bottleneck.service, []) : num(a.bottleneck.ms, 'ms');
    }
    case 'log-records': {
      const linked = linkedRecords(x, c, t.id);
      if (!linked) throw new Error(`traces ${x.id} links no logs`);
      return num(linked.records.length, '筆');
    }
  }
  throw new Error(`unknown trace metric ${q.metric}`);
}

/** What the validator checks in a traces explorer: its set, and its links to the lesson's logs and dashboard. */
export function tracesExplorerProblems(x: TracesExplorer, c: DevopsLessonContent): string[] {
  const problems = traceSetProblems(x.traces);
  if (problems.length) return problems;
  const traces = tracesOf(x.traces), ids = new Set(traces.map(t => t.id));
  if (x.links?.logs !== undefined) {
    const logs = c.logs?.find(l => l.id === x.links!.logs);
    if (!logs) problems.push(`links: no logs ${x.links.logs}`);
    else {
      const field = x.links.field ?? correlationFieldOf(logs.logs), records = recordsOf(logs.logs);
      if (!fieldNames(records).includes(field)) problems.push(`links: no record of logs ${logs.id} has the field ${field}`);
      else if (!records.some(r => ids.has(String(r.fields[field])))) problems.push(`links: no record of logs ${logs.id} carries a trace id of the set in ${field}`);
    }
  } else if (x.links?.field !== undefined) problems.push('links: field needs logs');
  const exemplars = x.traces.exemplars ?? [];
  if (x.links?.dashboard !== undefined) {
    const d = c.dashboards?.find(y => y.id === x.links!.dashboard)?.dashboard;
    if (!d) problems.push(`links: no dashboard ${x.links.dashboard}`);
    else for (const e of exemplars) {
      if (!d.series.some(s => s.id === e.series)) problems.push(`the exemplar at minute ${e.minute}: no series ${e.series} on dashboard ${x.links.dashboard}`);
      if (e.minute >= d.minutes) problems.push(`the exemplar at minute ${e.minute} is outside the dashboard (0…${d.minutes - 1})`);
    }
  } else if (exemplars.length) problems.push('exemplars need links.dashboard');
  const names = labelNames(traces);
  for (const l of x.labels ?? []) if (!names.includes(l)) problems.push(`no span has the label ${l}`);
  return problems;
}
