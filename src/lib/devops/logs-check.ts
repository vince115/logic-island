import type { DevopsValue } from './check';
import { averageBytes, fieldNames, filterRecords, FIELD_OPS, groupCounts, lineFormat, MAX_AVG_BYTES, MAX_RETENTION_DAYS, retention, traceOf, type LogFilter } from './log-query';
import { correlationFieldOf, LEVEL_LABEL, LOG_LEVELS, logRecords, logSetProblems, tsText, type LogRecord, type LogSet } from './logs';
import { countOf, parseMaskRules, redactMessages, redactOutcome, textsOf, type RedactOutcome } from './redact';
import { CORRELATE_METRICS, LOG_METRICS, RETENTION_METRICS, type DevopsLessonContent, type DevopsQuery, type LogsExplorer, type RedactTask } from './types';

/*
 * CICD-0 devops-explorer stage D4 exercises (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.4): the logs, correlate,
 * retention and log-format queries, computed from the lesson's log sets, and the redact task, which applies the learner's
 * masking rules and checks mustHide and mustKeep. check.ts dispatches to these.
 */

const num = (value: number, unit: string, decimals = 0): DevopsValue => ({ type: 'number', value, decimals, unit });
const text = (value: string, shown: string, aliases: string[]): DevopsValue => ({ type: 'text', value, shown, aliases: [value, shown, ...aliases] });
/** A time as text: m:ss (or h:mm:ss) and the seconds, with or without 秒. */
const time = (s: number): DevopsValue => text(tsText(s), tsText(s), [String(s), `${s}秒`, `${s} 秒`, tsText(s).padStart(5, '0'), `0:${tsText(s).padStart(5, '0')}`]);
const FORMAT_TEXT = {
  structured: ['結構化', ['structured', '結構化日誌', '結構化的', 'json', 'logfmt']],
  unstructured: ['非結構化', ['unstructured', 'raw', '純文字', '非結構化日誌', '非結構化的', 'text']],
} as const;

export function logsExplorerById(c: DevopsLessonContent, id: string): LogsExplorer {
  const found = c.logs?.find(x => x.id === id);
  if (!found) throw new Error(`no logs ${id}`);
  return found;
}
const cache = new WeakMap<LogSet, LogRecord[]>();
/** The records of a log set (computed once per set object). */
export function recordsOf(s: LogSet): LogRecord[] {
  let r = cache.get(s);
  if (!r) { r = logRecords(s); cache.set(s, r); }
  return r;
}

/** Whether a filter only names what the records have; throws with the reason when it does not. */
export function checkFilter(f: LogFilter, records: readonly LogRecord[]): void {
  if (f.minLevel !== undefined && !(LOG_LEVELS as readonly string[]).includes(f.minLevel)) throw new Error(`unknown level ${f.minLevel}`);
  if (f.service !== undefined && !records.some(r => r.service === f.service)) throw new Error(`no record of service ${f.service}`);
  if (f.from !== undefined && f.to !== undefined && f.from >= f.to) throw new Error('the time range needs from < to');
  const names = fieldNames(records);
  for (const c of f.fields ?? []) {
    if (!names.includes(c.name)) throw new Error(`no record has the field ${c.name}`);
    if (!(FIELD_OPS as readonly string[]).includes(c.op ?? '=')) throw new Error(`unknown operator ${c.op}`);
    if ((c.op ?? '=').match(/[<>]/) && typeof c.value !== 'number') throw new Error(`${c.op} compares numbers`);
  }
}

type LogsQuery = Extract<DevopsQuery, { task: 'logs' | 'correlate' | 'retention' | 'log-format' }>;
/** A D4 query's value; throws when it names something the log set does not have. */
export function logsQueryValue(q: LogsQuery, c: DevopsLessonContent): DevopsValue {
  if (q.task === 'retention') {
    if (!(RETENTION_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown retention metric ${q.metric}`);
    const set = q.logs === undefined ? undefined : logsExplorerById(c, q.logs).logs;
    const perDay = q.perDay ?? set?.perDay, avg = q.avgBytes ?? (set ? averageBytes(recordsOf(set)) : undefined);
    if (perDay === undefined || avg === undefined) throw new Error('retention needs perDay and avgBytes (from the query or a log set)');
    const ok = (x: number, max: number) => Number.isInteger(x) && x >= 1 && x <= max;
    if (!ok(perDay, 100_000_000) || !ok(avg, MAX_AVG_BYTES) || !ok(q.days, MAX_RETENTION_DAYS)) throw new Error(`retention takes perDay 1…100000000, avgBytes 1…${MAX_AVG_BYTES}, days 1…${MAX_RETENTION_DAYS}`);
    const r = retention(perDay, avg, q.days);
    if (r.total > 4e15) throw new Error('the total is too large to compute exactly');
    switch (q.metric) {
      case 'avg-bytes': return num(r.avgBytes, '位元組');
      case 'bytes-per-day': return num(r.bytesPerDay, '位元組');
      case 'total-bytes': return num(r.total, '位元組');
      case 'total-mb': return num(r.totalMb, 'MB');
      case 'total-gb': return num(r.totalGbTenths / 10, 'GB', 1);
    }
  }
  const set = logsExplorerById(c, q.logs).logs, records = recordsOf(set);
  if (q.task === 'log-format') {
    const line = set.raw?.find(l => l.id === q.line);
    if (!line) throw new Error(`no raw line ${q.line}`);
    const f = lineFormat(line.text);
    if (q.metric === 'fields') return num(f.fields, '個');
    if (q.metric !== 'format') throw new Error(`unknown log-format metric ${q.metric}`);
    const [shown, aliases] = FORMAT_TEXT[f.format];
    return text(f.format, shown, [...aliases]);
  }
  if (q.task === 'correlate') {
    if (!(CORRELATE_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown correlate metric ${q.metric}`);
    const t = traceOf(records, correlationFieldOf(set), q.id);
    if (!t) throw new Error(`no record has ${correlationFieldOf(set)} ${q.id}`);
    switch (q.metric) {
      case 'services': return { ...text(t.services.join(' → '), t.services.join(' → '), [t.services.join(', ')]), list: t.services } as DevopsValue;
      case 'elapsed': return num(t.elapsed, '秒');
      case 'records': return num(t.steps.length, '筆');
      case 'first-error-service': if (!t.firstError) throw new Error(`request ${q.id} has no error record`); return text(t.firstError.service, t.firstError.service, []);
      case 'last-service': { const s = t.services[t.services.length - 1]; return text(s, s, []); }
    }
  }
  if (!(LOG_METRICS as readonly string[]).includes(q.metric)) throw new Error(`unknown logs metric ${q.metric}`);
  checkFilter(q.filter ?? {}, records);
  const hits = filterRecords(records, q.filter);
  const need = (k: 'field' | 'group') => { const v = q[k]; if (!v) throw new Error(`${q.metric} needs ${k}`); return v; };
  const numeric = () => {
    const f = need('field');
    const xs = hits.filter(r => typeof r.fields[f] === 'number');
    if (!xs.length) throw new Error(`no matching record has a number in ${f}`);
    return { f, xs, max: Math.max(...xs.map(r => r.fields[f] as number)) };
  };
  switch (q.metric) {
    case 'count': return num(hits.length, '筆');
    case 'first-ts': case 'last-ts':
      if (!hits.length) throw new Error('no record matches the filter');
      return time(q.metric === 'first-ts' ? hits[0].ts : hits[hits.length - 1].ts);
    case 'max': { const { f, max } = numeric(); return num(max, f.endsWith('_ms') ? 'ms' : ''); }
    case 'max-by': {
      const { f, xs, max } = numeric(), top = xs.filter(r => r.fields[f] === max), report = q.report ?? correlationFieldOf(set);
      if (top.length > 1) throw new Error(`${top.length} records share the largest ${f} (${max})`);
      const v = top[0].fields[report];
      if (v === undefined) throw new Error(`the record with the largest ${f} has no ${report}`);
      return text(String(v), String(v), []);
    }
    case 'top': {
      const g = groupCounts(hits, need('group')).groups;
      if (!g.length) throw new Error('no matching record to group');
      if (g[1] && g[1].count === g[0].count) throw new Error(`${g[0].key} and ${g[1].key} tie on the count`);
      const k = g[0].key;
      return text(k, k, q.group === 'level' && k in LEVEL_LABEL ? [LEVEL_LABEL[k as keyof typeof LEVEL_LABEL]] : []);
    }
    case 'distinct': return num(groupCounts(hits, need('field')).groups.length, '個');
  }
}

// ---- the redact task ----------------------------------------------------------------------------------------------
export const REDACT_FIELD = { rules: '遮蔽規則（一行一條，例如 field password 或 pattern email）' } as const;
export const redactAnswer = (rules: readonly string[]) => ({ rules: rules.join('\n') });

/** The learner's rules applied to the task's log set (undefined when a line cannot be read). */
export function evaluateRedact(task: RedactTask, c: DevopsLessonContent, answer: Record<string, string>): { outcome?: RedactOutcome; messages: string[] } {
  const set = logsExplorerById(c, task.logs).logs, records = recordsOf(set);
  const { rules, issues } = parseMaskRules(answer.rules ?? '', fieldNames(records));
  if (issues.length) return { messages: issues };
  if (!rules.length) return { messages: ['還沒有寫任何遮蔽規則。'] };
  const outcome = redactOutcome(records, set.raw ?? [], rules, task.mustHide, task.mustKeep);
  return { outcome, messages: redactMessages(outcome) };
}
export function checkRedact(task: RedactTask, c: DevopsLessonContent, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const { outcome, messages } = evaluateRedact(task, c, answer);
  return { ok: !!outcome && !messages.length, messages };
}

/** Values the checks name must be in the data, and not on both lists. */
function valueProblems(set: LogSet, mustHide: readonly string[], mustKeep: readonly string[]): string[] {
  const problems: string[] = [], texts = textsOf(recordsOf(set), set.raw ?? []);
  for (const v of [...mustHide, ...mustKeep]) {
    if (!v.trim()) problems.push('mustHide and mustKeep values are not empty');
    else if (!countOf(texts, v)) problems.push(`the value ${v} is not in the log`);
  }
  for (const v of mustHide) if (mustKeep.includes(v)) problems.push(`${v} is on both mustHide and mustKeep`);
  return problems;
}
/** What the validator checks in a logs explorer (beyond its log set) and in a redact task. */
export function logsExplorerProblems(x: LogsExplorer): string[] {
  const problems = logSetProblems(x.logs);
  if (problems.length) return problems;
  const names = fieldNames(recordsOf(x.logs));
  if (x.masking) problems.push(...parseMaskRules(x.masking.join('\n'), names).issues.map(i => `the masking rules: ${i}`));
  if (x.checks) problems.push(...valueProblems(x.logs, x.checks.mustHide, x.checks.mustKeep));
  return problems;
}
export function redactTaskProblems(task: RedactTask, c: DevopsLessonContent): string[] {
  const x = logsExplorerById(c, task.logs);
  if (logSetProblems(x.logs).length) return [];
  const problems = valueProblems(x.logs, task.mustHide, task.mustKeep);
  if (!task.mustHide.length) problems.push('a redact task needs at least one mustHide value');
  if (problems.length) return problems;
  const { outcome, messages } = evaluateRedact(task, c, redactAnswer(task.reference));
  if (!outcome) problems.push(`the reference rules: ${messages.join(' ')}`);
  else if (messages.length) problems.push(`the reference rules fail: ${messages.join(' ')}`);
  return problems;
}
