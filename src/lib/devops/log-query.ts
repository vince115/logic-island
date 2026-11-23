import { roundHalfUp } from './history';
import { jsonLine, levelRank, utf8Bytes, type FieldValue, type LogLevel, type LogRecord } from './logs';

/*
 * CICD-0 D4 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.4): what the log viewer does with the records. There is no
 * query language: a filter is a set of controls (service, lowest level, field conditions, a time range), and the rest are
 * fixed operations: group counts, following a correlation id across services, retention sizing and telling structured
 * lines from unstructured ones.
 */

export const FIELD_OPS = ['=', '!=', '>', '>=', '<', '<='] as const;
export type FieldOp = typeof FIELD_OPS[number];
export interface FieldCondition { name: string; op?: FieldOp; value: FieldValue }
/** Every part is optional; a record matches when it meets all of them. */
export interface LogFilter {
  service?: string;
  /** This level and the ones above it (debug < info < warn < error). */
  minLevel?: LogLevel;
  fields?: FieldCondition[];
  /** Seconds [from, to). */
  from?: number; to?: number;
}

/**
 * A field condition: = and != compare the text of the value (200 equals "200"); >, >=, <, <= need a number on both sides.
 * A record without the field never meets a condition on it, not even !=.
 */
export function meetsField(r: LogRecord, c: FieldCondition): boolean {
  const v = r.fields[c.name];
  if (v === undefined) return false;
  const op = c.op ?? '=';
  if (op === '=') return String(v) === String(c.value);
  if (op === '!=') return String(v) !== String(c.value);
  if (typeof v !== 'number' || typeof c.value !== 'number') return false;
  return op === '>' ? v > c.value : op === '>=' ? v >= c.value : op === '<' ? v < c.value : v <= c.value;
}
export const matchesFilter = (r: LogRecord, f: LogFilter) => (f.service === undefined || r.service === f.service)
  && (f.minLevel === undefined || levelRank(r.level) >= levelRank(f.minLevel))
  && (f.from === undefined || r.ts >= f.from) && (f.to === undefined || r.ts < f.to)
  && (f.fields ?? []).every(c => meetsField(r, c));
export const filterRecords = (records: readonly LogRecord[], f: LogFilter = {}) => records.filter(r => matchesFilter(r, f));

/** What to group by: service, level, host, or a field's name. */
export type GroupBy = string;
const keyOf = (r: LogRecord, by: GroupBy): string | undefined =>
  by === 'service' ? r.service : by === 'level' ? r.level : by === 'host' ? r.host : r.fields[by] === undefined ? undefined : String(r.fields[by]);
/** Counts per value, most first, then by value (text order); records without the field are counted under `missing`. */
export function groupCounts(records: readonly LogRecord[], by: GroupBy): { groups: { key: string; count: number }[]; missing: number } {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const r of records) { const k = keyOf(r, by); if (k === undefined) missing++; else counts.set(k, (counts.get(k) ?? 0) + 1); }
  const groups = [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { groups, missing };
}

/** The fields the records carry, in the order they first appear. */
export function fieldNames(records: readonly LogRecord[]): string[] {
  const names = new Set<string>();
  for (const r of records) for (const k of Object.keys(r.fields)) names.add(k);
  return [...names];
}

export interface TraceStep { record: LogRecord; delta: number; since: number }
export interface Trace { id: string; steps: TraceStep[]; services: string[]; elapsed: number; firstError?: LogRecord }
/**
 * The records that carry a correlation id, in time order (records at the same second keep the log's order): each with
 * the seconds since the previous one (`delta`, 0 for the first) and since the first (`since`). `services` are the
 * services in the order the request reached them, a service named again only after another one; `elapsed` is the last
 * record's time minus the first's.
 */
export function traceOf(records: readonly LogRecord[], field: string, id: string): Trace | undefined {
  const hits = records.filter(r => r.fields[field] !== undefined && String(r.fields[field]) === id);
  if (!hits.length) return undefined;
  const t0 = hits[0].ts;
  const steps = hits.map((record, i) => ({ record, delta: i ? record.ts - hits[i - 1].ts : 0, since: record.ts - t0 }));
  const services = hits.map(r => r.service).filter((s, i, all) => i === 0 || all[i - 1] !== s);
  return { id, steps, services, elapsed: hits[hits.length - 1].ts - t0, firstError: hits.find(r => r.level === 'error') };
}
/** The correlation ids that appear on more than one record (a request followed across services), by first appearance. */
export function sharedIds(records: readonly LogRecord[], field: string): string[] {
  const seen = new Map<string, number>();
  for (const r of records) { const v = r.fields[field]; if (v !== undefined) seen.set(String(v), (seen.get(String(v)) ?? 0) + 1); }
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}

/**
 * Retention sizing, integer math: the average size of a record is the log's JSON-lines bytes (each line plus its newline)
 * ÷ records, rounded half up to whole bytes; bytes a day = records a day × average bytes; total = bytes a day × days.
 * MB and GB are decimal (10^6 and 10^9 bytes): MB rounded half up to whole MB, GB to one decimal (tenths).
 */
export function averageBytes(records: readonly LogRecord[]): number {
  const total = records.reduce((sum, r) => sum + utf8Bytes(jsonLine(r)) + 1, 0);
  return roundHalfUp(total, records.length);
}
export interface Retention { perDay: number; avgBytes: number; days: number; bytesPerDay: number; total: number; totalMb: number; totalGbTenths: number }
export function retention(perDay: number, avgBytes: number, days: number): Retention {
  const bytesPerDay = perDay * avgBytes, total = bytesPerDay * days;
  return { perDay, avgBytes, days, bytesPerDay, total, totalMb: roundHalfUp(total, 1_000_000), totalGbTenths: roundHalfUp(total, 100_000_000) };
}
export const MAX_RETENTION_DAYS = 3650;
export const MAX_AVG_BYTES = 100_000;

/**
 * A raw line's format: a JSON object, or key=value pairs (two at least, every token one; values may be double-quoted),
 * is structured; anything else is unstructured text. `fields` is how many fields a structured line has (0 otherwise).
 */
export function lineFormat(text: string): { format: 'structured' | 'unstructured'; kind: 'json' | 'logfmt' | 'text'; fields: number } {
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      const v: unknown = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return { format: 'structured', kind: 'json', fields: Object.keys(v).length };
    } catch { /* not JSON: falls through */ }
  }
  const tokens = t.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  if (tokens.length >= 2 && tokens.every(x => /^[A-Za-z_][\w.]*=(?:"[^"]*"|[^\s"=]*)$/.test(x))) return { format: 'structured', kind: 'logfmt', fields: tokens.length };
  return { format: 'unstructured', kind: 'text', fields: 0 };
}
