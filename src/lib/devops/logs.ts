import { isSeed, mulberry32 } from '@/lib/llm/prng';

/*
 * CICD-0 devops-explorer stage D4 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.4), part of the monitoring-dashboard
 * activity: centralized logs. An invented teaching model on authored data (示意資料), not any log product:
 * - A record has a time (whole seconds from the start of the log, written as a number or as "m:ss"), the service and host
 *   that wrote it, a level (debug < info < warn < error), a message and its structured fields (string or number values).
 * - The lesson writes the records that matter (an incident, a slow request followed across services) and may add bulk
 *   normal traffic from a seeded generator (src/lib/llm/prng.ts), so it need not hand-write hundreds of lines. The
 *   generator is deterministic: the server render, the browser and the tests produce the same records.
 * - Optional raw lines (as a program might print them) contrast unstructured text with structured records.
 *
 * Generated traffic, record k = 0, 1… count − 1, six draws u of mulberry32(seed) each, in this order:
 *   ts = from + ⌊u × (to − from)⌋, service = services[⌊u × S⌋], host = `${service}-${⌊u × hosts⌋ + 1}`,
 *   path = paths[⌊u × P⌋], user_id = `u-${1000 + ⌊u × users⌋}`, duration_ms = min + ⌊u × (max − min + 1)⌋;
 *   level info, message `GET ${path} 200`, fields request_id (`${idPrefix}${k + 1}`, four digits at least), user_id,
 *   path, status 200, duration_ms.
 * All records (written and generated) are ordered by time; at the same second written records come first, each group in
 * its own order. Each record gets its 1-based position (`n`).
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = typeof LOG_LEVELS[number];
export const LEVEL_LABEL: Record<LogLevel, string> = { debug: '除錯', info: '資訊', warn: '警告', error: '錯誤' };
export const levelRank = (l: LogLevel) => LOG_LEVELS.indexOf(l);

export type FieldValue = string | number;
/** A record as the lesson writes it; `ts` is whole seconds or "m:ss". */
export interface LogRecordInput {
  ts: number | string; service: string; host: string; level: LogLevel; message: string;
  fields?: Record<string, FieldValue>;
}
/** A record of the log, in time order. */
export interface LogRecord { n: number; ts: number; service: string; host: string; level: LogLevel; message: string; fields: Record<string, FieldValue>; generated: boolean }

export interface LogTraffic {
  seed: number;
  /** Records to generate (1–3000). */
  count: number;
  /** Seconds [from, to) the records fall in. */
  from: number; to: number;
  services: string[];
  /** Hosts per service (1–9, default 2). */
  hosts?: number;
  paths: string[];
  /** Distinct users (1–100000, default 500). */
  users?: number;
  durationMs: { min: number; max: number };
  /** The request ids' prefix (default "req-"). */
  idPrefix?: string;
}
export interface LogSet {
  /** The field that carries the correlation id (default request_id). */
  correlationField?: string;
  records: LogRecordInput[];
  traffic?: LogTraffic;
  /** Raw lines as a program printed them (unstructured text, JSON or key=value), by id. */
  raw?: { id: string; text: string }[];
  /** Records a day in production, for retention sizing. */
  perDay?: number;
}

export const MAX_LOG_SECONDS = 7 * 24 * 3600;
export const MAX_RECORDS = 5000;
export const RESERVED_FIELDS = ['ts', 'service', 'host', 'level', 'message'] as const;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;
export const isFieldName = (s: string) => FIELD_NAME.test(s) && !(RESERVED_FIELDS as readonly string[]).includes(s);
export const correlationFieldOf = (s: LogSet) => s.correlationField ?? 'request_id';

/** "m:ss" or whole seconds as a number of seconds (undefined when it is neither). */
export function parseTs(ts: number | string): number | undefined {
  if (typeof ts === 'number') return Number.isInteger(ts) && ts >= 0 ? ts : undefined;
  const m = /^(\d+):([0-5]\d)$/.exec(ts.normalize('NFKC').trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(ts.trim()) ? Number(ts.trim()) : undefined;
}
/** Seconds as the explorer writes them: m:ss, or h:mm:ss from an hour on. */
export function tsText(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The generated records, in generation order (before sorting). */
export function generateTraffic(t: LogTraffic): Omit<LogRecord, 'n'>[] {
  const next = mulberry32(t.seed), pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  const prefix = t.idPrefix ?? 'req-', hosts = t.hosts ?? 2, users = t.users ?? 500;
  return Array.from({ length: t.count }, (_, k) => {
    const ts = t.from + Math.floor(next() * (t.to - t.from));
    const service = pick(t.services), host = `${service}-${Math.floor(next() * hosts) + 1}`, path = pick(t.paths);
    const user = `u-${1000 + Math.floor(next() * users)}`, duration = t.durationMs.min + Math.floor(next() * (t.durationMs.max - t.durationMs.min + 1));
    return { ts, service, host, level: 'info' as const, message: `GET ${path} 200`, generated: true,
      fields: { request_id: `${prefix}${String(k + 1).padStart(4, '0')}`, user_id: user, path, status: 200, duration_ms: duration } };
  });
}

/** Every record of the log (written and generated), in time order and numbered; assumes logSetProblems is empty. */
export function logRecords(s: LogSet): LogRecord[] {
  const written = s.records.map(r => ({ ...r, ts: parseTs(r.ts)!, fields: { ...r.fields }, generated: false }));
  const all = [...written, ...s.traffic ? generateTraffic(s.traffic) : []];
  // Array.prototype.sort is stable: written records before generated ones at the same second.
  return all.sort((a, b) => a.ts - b.ts).map((r, i) => ({ ...r, n: i + 1 }));
}

/** A record as one JSON line (the shape a log shipper sends): ts, service, host, level, message, then the fields. */
export const jsonLine = (r: Pick<LogRecord, 'ts' | 'service' | 'host' | 'level' | 'message' | 'fields'>) =>
  JSON.stringify({ ts: r.ts, service: r.service, host: r.host, level: r.level, message: r.message, ...r.fields });
/** The UTF-8 size of a text in bytes (counted by code point, so the browser and Node agree). */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (const ch of text) { const c = ch.codePointAt(0)!; n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** Everything that makes a log set unusable. */
export function logSetProblems(s: LogSet): string[] {
  const problems: string[] = [];
  const cf = correlationFieldOf(s);
  if (!isFieldName(cf)) problems.push(`the correlation field ${cf} is not a field name`);
  if (!s.records.length) problems.push('needs at least one written record');
  s.records.forEach((r, i) => {
    const at = `record ${i + 1}`;
    const ts = parseTs(r.ts);
    if (ts === undefined || ts > MAX_LOG_SECONDS) problems.push(`${at}: ts is whole seconds or "m:ss" within ${MAX_LOG_SECONDS} seconds`);
    if (!r.service?.trim() || !r.host?.trim() || !r.message?.trim()) problems.push(`${at}: needs a service, a host and a message`);
    if (!(LOG_LEVELS as readonly string[]).includes(r.level)) problems.push(`${at}: level is one of ${LOG_LEVELS.join(', ')}`);
    for (const [k, v] of Object.entries(r.fields ?? {})) {
      if (!isFieldName(k)) problems.push(`${at}: ${k} is not a field name (letters, digits, _ and ., not ${RESERVED_FIELDS.join(', ')})`);
      if (!(typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v)))) problems.push(`${at}: field ${k} is a string or a whole number`);
    }
  });
  const t = s.traffic;
  if (t) {
    if (!isSeed(t.seed)) problems.push('traffic: the seed is a whole number 0…4294967295');
    if (!whole(t.count, 1, 3000)) problems.push('traffic: count is 1…3000');
    if (!whole(t.from, 0, MAX_LOG_SECONDS) || !whole(t.to, t.from + 1, MAX_LOG_SECONDS)) problems.push(`traffic: 0 ≤ from < to ≤ ${MAX_LOG_SECONDS}`);
    if (!t.services.length || t.services.some(x => !x.trim())) problems.push('traffic: needs services');
    if (!t.paths.length || t.paths.some(x => !x.trim())) problems.push('traffic: needs paths');
    if (t.hosts !== undefined && !whole(t.hosts, 1, 9)) problems.push('traffic: hosts is 1…9');
    if (t.users !== undefined && !whole(t.users, 1, 100_000)) problems.push('traffic: users is 1…100000');
    if (!whole(t.durationMs.min, 0, 600_000) || !whole(t.durationMs.max, t.durationMs.min, 600_000)) problems.push('traffic: 0 ≤ durationMs.min ≤ max ≤ 600000');
    if (cf !== 'request_id') problems.push('traffic: generated records carry request_id, so the correlation field must be request_id');
    if (!problems.length) {
      const prefix = t.idPrefix ?? 'req-';
      const clash = s.records.find(r => typeof r.fields?.request_id === 'string' && r.fields.request_id.startsWith(prefix) && /^\d+$/.test(r.fields.request_id.slice(prefix.length)));
      if (clash) problems.push(`traffic: the written request id ${clash.fields!.request_id} looks like a generated one (${prefix}0001…); use another prefix`);
    }
  }
  if (s.records.length + (t?.count ?? 0) > MAX_RECORDS) problems.push(`at most ${MAX_RECORDS} records`);
  const rawIds = new Set<string>();
  for (const l of s.raw ?? []) {
    if (!l.id?.trim() || !l.text?.trim()) problems.push('a raw line needs an id and a text');
    if (rawIds.has(l.id)) problems.push(`duplicate raw line ${l.id}`);
    rawIds.add(l.id);
  }
  if (s.perDay !== undefined && !whole(s.perDay, 1, 100_000_000)) problems.push('perDay is 1…100000000');
  return problems;
}
