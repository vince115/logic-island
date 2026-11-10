/*
 * Phase F.1c transaction timeline, two sessions (DB15): transactions interleaved step by step, run under a concurrency
 * model and an isolation level; what each read returns, who waits, who is aborted, the final committed values, and the
 * anomalies that really happened are all computed here (the lesson only writes the schedule).
 *
 * Two teaching models, each labelled on the page:
 * - locking: strict two-phase locking, the textbook way to define the four SQL levels. Writes take exclusive (X) locks
 *   held to the end. READ UNCOMMITTED reads take no lock; READ COMMITTED takes a shared (S) lock only for the read;
 *   REPEATABLE READ keeps S locks on the rows it read; SERIALIZABLE also locks the range a COUNT looked at, so an INSERT
 *   into it waits. A wait that would close a cycle (deadlock) aborts the transaction that asked.
 * - mvcc: multiversion snapshots as in PostgreSQL. Reads never wait. READ COMMITTED takes a new snapshot per statement;
 *   REPEATABLE READ keeps the first statement's snapshot, and updating a row someone committed after that snapshot aborts
 *   the transaction (first updater wins). SERIALIZABLE (PostgreSQL's SSI) is not simulated; READ UNCOMMITTED behaves as
 *   READ COMMITTED in PostgreSQL, so neither is offered here.
 * Values are integers; a write sets a value, or a value read earlier into a variable plus a delta (what an application
 * does after SELECT). COUNT counts rows whose value is at least `min`.
 */

export const LEVELS = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'] as const;
export type Level = typeof LEVELS[number];
export type Model = 'locking' | 'mvcc';
export const MODEL_LEVELS: Record<Model, readonly Level[]> = { locking: LEVELS, mvcc: ['READ COMMITTED', 'REPEATABLE READ'] };
export const ANOMALIES = ['dirty-read', 'non-repeatable-read', 'phantom', 'lost-update'] as const;
export type Anomaly = typeof ANOMALIES[number];
export const ANOMALY_TEXT: Record<Anomaly, string> = { 'dirty-read': '髒讀', 'non-repeatable-read': '不可重複讀', phantom: '幻讀', 'lost-update': '遺失更新' };

export type Op =
  | { op: 'read'; item: string; into?: string }
  | { op: 'write'; item: string; value: number | { from: string; delta: number } }
  | { op: 'count'; min: number }
  | { op: 'insert'; item: string; value: number }
  | { op: 'commit' }
  | { op: 'abort' };
export type ScheduleStep = { tx: string } & Op;
export interface Schedule { items: Record<string, number>; steps: ScheduleStep[] }

export interface TxEvent {
  /** Order of execution (a step that waited runs later than its place in the schedule). */
  time: number;
  /** Index into schedule.steps. */
  step: number;
  tx: string;
  text: string;
  result: 'ok' | 'wait' | 'aborted' | 'skipped';
  value?: number;
}
export interface ScheduleResult {
  events: TxEvent[];
  final: Record<string, number>;
  /** unfinished: the schedule ended before its COMMIT or ROLLBACK (for example while it waited). */
  outcome: Record<string, 'committed' | 'aborted' | 'unfinished'>;
  anomalies: { kind: Anomaly; tx: string; item?: string; text: string }[];
}

export function describeOp(s: ScheduleStep): string {
  switch (s.op) {
    case 'read': return `讀 ${s.item}${s.into && s.into !== s.item ? `（存入 ${s.into}）` : ''}`;
    case 'write': return typeof s.value === 'number' ? `寫 ${s.item} = ${s.value}` : `寫 ${s.item} = ${s.value.from} ${s.value.delta >= 0 ? '+' : '−'} ${Math.abs(s.value.delta)}`;
    case 'count': return `COUNT(值 ≥ ${s.min})`;
    case 'insert': return `新增 ${s.item} = ${s.value}`;
    case 'commit': return 'COMMIT';
    case 'abort': return 'ROLLBACK';
  }
}

interface Version { value: number; writer: string | null; commit: number | null }
interface Tx {
  name: string; vars: Record<string, { value: number; item: string; time: number }>; snapshot?: number; done?: 'committed' | 'aborted';
  /** Each write, and when the read it was computed from happened (a value read earlier into a variable, plus a delta). */
  writes: { item: string; time: number; fromRead?: number }[];
}
interface ReadRecord { tx: string; item: string; value: number; writer: string | null; dirty: boolean; time: number; ownWriteBefore: boolean }

/** Runs a schedule under a model and level. */
export function runSchedule(schedule: Schedule, model: Model, level: Level): ScheduleResult {
  if (!MODEL_LEVELS[model].includes(level)) throw new Error(`${model} does not offer ${level}`);
  const versions = new Map<string, Version[]>(Object.entries(schedule.items).map(([k, v]) => [k, [{ value: v, writer: null, commit: 0 }]]));
  const txs = new Map<string, Tx>();
  const tx = (name: string) => { if (!txs.has(name)) txs.set(name, { name, vars: {}, writes: [] }); return txs.get(name)!; };
  const sLocks = new Map<string, Set<string>>(), xLocks = new Map<string, string>();
  const reads: ReadRecord[] = [], counts: { tx: string; min: number; result: number; time: number }[] = [];
  const events: TxEvent[] = [];
  let time = 0, clock = 0;
  const RANGE = '*range*';

  const active = (name: string | null) => !!name && !txs.get(name)?.done;
  const latest = (item: string) => versions.get(item)!.at(-1)!;
  const current = (item: string) => latest(item).value;
  /** MVCC: the version a transaction sees. */
  const visible = (t: Tx, item: string, snapshot: number): Version | undefined => {
    const list = versions.get(item) ?? [];
    const own = [...list].reverse().find(v => v.writer === t.name && v.commit === null);
    return own ?? [...list].reverse().find(v => v.commit !== null && v.commit <= snapshot);
  };
  const snapshotFor = (t: Tx) => {
    if (level === 'REPEATABLE READ') return t.snapshot ??= clock;
    return clock;
  };

  // ---- locking ----------------------------------------------------------------------------------------------------
  /** Who blocks `t` from taking the lock (empty: it can). */
  const blockers = (t: Tx, item: string, mode: 'S' | 'X'): string[] => {
    const x = xLocks.get(item), s = [...(sLocks.get(item) ?? [])];
    if (mode === 'S') return x && x !== t.name ? [x] : [];
    return [...(x && x !== t.name ? [x] : []), ...s.filter(h => h !== t.name)];
  };
  const take = (t: Tx, item: string, mode: 'S' | 'X') => {
    if (mode === 'X') { xLocks.set(item, t.name); sLocks.get(item)?.delete(t.name); }
    else if (xLocks.get(item) !== t.name) { if (!sLocks.has(item)) sLocks.set(item, new Set()); sLocks.get(item)!.add(t.name); }
  };
  const release = (t: Tx) => {
    for (const [item, holder] of [...xLocks]) if (holder === t.name) xLocks.delete(item);
    for (const set of sLocks.values()) set.delete(t.name);
  };
  const waitsFor = new Map<string, string[]>();
  const deadlock = (from: string, to: string[]): boolean => {
    const seen = new Set<string>(), stack = [...to];
    while (stack.length) { const n = stack.pop()!; if (n === from) return true; if (seen.has(n)) continue; seen.add(n); stack.push(...(waitsFor.get(n) ?? [])); }
    return false;
  };

  const record = (step: number, t: string, text: string, result: TxEvent['result'], value?: number) =>
    events.push({ time: ++time, step, tx: t, text, result, ...(value !== undefined ? { value } : {}) });

  const finish = (t: Tx, how: 'committed' | 'aborted') => {
    if (how === 'committed') {
      const at = ++clock;
      for (const list of versions.values()) for (const v of list) if (v.writer === t.name && v.commit === null) v.commit = at;
    } else {
      for (const [item, list] of versions) {
        const kept = list.filter(v => !(v.writer === t.name && v.commit === null));
        if (kept.length) versions.set(item, kept); else versions.delete(item);
      }
    }
    t.done = how;
    release(t);
    waitsFor.delete(t.name);
  };

  /** Tries one step; 'wait' with the blockers when it cannot run yet. */
  type Attempt = { kind: 'ok'; text?: string; value?: number } | { kind: 'wait'; on: string[] } | { kind: 'abort'; text: string };
  const attempt = (s: ScheduleStep): Attempt => {
    const t = tx(s.tx);
    const lockRead = (item: string): Attempt | undefined => {
      if (model !== 'locking' || level === 'READ UNCOMMITTED') return undefined;
      const on = blockers(t, item, 'S');
      if (on.length) return { kind: 'wait', on };
      if (level !== 'READ COMMITTED') take(t, item, 'S');
      return undefined;
    };
    switch (s.op) {
      case 'read': {
        if (!versions.has(s.item)) return { kind: 'ok', text: `${describeOp(s)}：沒有這一列` };
        const blocked = lockRead(s.item);
        if (blocked) return blocked;
        const v = model === 'mvcc' ? visible(t, s.item, snapshotFor(t)) : latest(s.item);
        if (!v) return { kind: 'ok', text: `${describeOp(s)}：快照中沒有這一列` };
        t.vars[s.into ?? s.item] = { value: v.value, item: s.item, time: time + 1 };
        reads.push({ tx: t.name, item: s.item, value: v.value, writer: v.writer, dirty: v.writer !== null && v.writer !== t.name && v.commit === null, time: time + 1,
          ownWriteBefore: t.writes.some(w => w.item === s.item) });
        return { kind: 'ok', value: v.value };
      }
      case 'count': {
        const items = [...versions.keys()];
        if (model === 'locking' && level !== 'READ UNCOMMITTED') {
          const on = [...new Set(items.flatMap(item => blockers(t, item, 'S')))];
          if (level === 'SERIALIZABLE') on.push(...blockers(t, RANGE, 'S'));
          if (on.length) return { kind: 'wait', on: [...new Set(on)] };
          if (level !== 'READ COMMITTED') for (const item of items) if (current(item) >= s.min) take(t, item, 'S');
          if (level === 'SERIALIZABLE') take(t, RANGE, 'S');
        }
        const value = model === 'mvcc'
          ? items.filter(item => { const v = visible(t, item, snapshotFor(t)); return v && v.value >= s.min; }).length
          : items.filter(item => current(item) >= s.min).length;
        counts.push({ tx: t.name, min: s.min, result: value, time: time + 1 });
        return { kind: 'ok', value };
      }
      case 'write':
      case 'insert': {
        const item = s.item;
        if (s.op === 'insert' && versions.has(item)) return { kind: 'ok', text: `${describeOp(s)}：已有這一列，沒有新增` };
        if (s.op === 'write' && !versions.has(item)) return { kind: 'ok', text: `${describeOp(s)}：沒有這一列` };
        if (model === 'locking') {
          const on = [...blockers(t, item, 'X'), ...(s.op === 'insert' && level === 'SERIALIZABLE' ? blockers(t, RANGE, 'X') : [])];
          if (on.length) return { kind: 'wait', on: [...new Set(on)] };
          take(t, item, 'X');
        } else if (s.op === 'write') {
          const holder = versions.get(item)!.find(v => v.commit === null && v.writer !== t.name);
          if (holder && active(holder.writer)) return { kind: 'wait', on: [holder.writer!] };
          const snap = snapshotFor(t);
          if (level === 'REPEATABLE READ' && (latest(item).commit ?? 0) > snap)
            return { kind: 'abort', text: `${describeOp(s)}：別的交易在快照之後已提交這一列，無法序列化，交易被中止` };
        }
        const from = s.op === 'write' && typeof s.value !== 'number' ? s.value : undefined;
        const value = s.op === 'insert' ? s.value : from ? (t.vars[from.from]?.value ?? 0) + from.delta : s.value as number;
        // A lost update needs a write computed from an earlier read of the same row.
        const fromRead = from && t.vars[from.from]?.item === item ? t.vars[from.from].time : undefined;
        const list = versions.get(item) ?? [];
        const own = list.find(v => v.writer === t.name && v.commit === null);
        if (own) own.value = value; else versions.set(item, [...list, { value, writer: t.name, commit: null }]);
        t.writes.push({ item, time: time + 1, ...(fromRead !== undefined ? { fromRead } : {}) });
        return { kind: 'ok', value };
      }
      case 'commit': return { kind: 'ok' };
      case 'abort': return { kind: 'ok' };
    }
  };

  // Each transaction's steps wait in its own queue while it is blocked; after every step, all queues are retried.
  const queues = new Map<string, number[]>();
  const blocked = new Set<string>();
  const run = (i: number): boolean => {
    const s = schedule.steps[i], t = tx(s.tx);
    if (t.done) { record(i, s.tx, `${describeOp(s)}：交易已結束，略過`, 'skipped'); return true; }
    const a = attempt(s);
    if (a.kind === 'wait') {
      if (deadlock(t.name, a.on)) {
        record(i, s.tx, `${describeOp(s)}：等待 ${a.on.join('、')} 會形成死結，${s.tx} 被選為犧牲者並中止`, 'aborted');
        finish(t, 'aborted');
        return true;
      }
      waitsFor.set(t.name, a.on);
      if (!blocked.has(t.name)) record(i, s.tx, `${describeOp(s)}：等待 ${a.on.join('、')} 釋放鎖`, 'wait');
      blocked.add(t.name);
      return false;
    }
    if (a.kind === 'abort') { record(i, s.tx, a.text, 'aborted'); finish(t, 'aborted'); return true; }
    waitsFor.delete(t.name);
    const resumed = blocked.delete(t.name);
    if (s.op === 'commit') { record(i, s.tx, `COMMIT${resumed ? '（等待結束）' : ''}`, 'ok'); finish(t, 'committed'); return true; }
    if (s.op === 'abort') { record(i, s.tx, `ROLLBACK${resumed ? '（等待結束）' : ''}`, 'ok'); finish(t, 'aborted'); return true; }
    const shown = a.value === undefined || a.text ? '' : s.op === 'write' && typeof s.value !== 'number' ? `（寫入 ${a.value}）` : s.op === 'write' || s.op === 'insert' ? '' : ` → ${a.value}`;
    record(i, s.tx, `${a.text ?? describeOp(s)}${shown}${resumed ? '（等待結束後執行）' : ''}`, 'ok', a.value);
    return true;
  };
  /** Runs a transaction's queued steps until one waits. */
  const drain = (name: string) => {
    const q = queues.get(name) ?? [];
    while (q.length && run(q[0])) q.shift();
  };
  const drainAll = () => {
    for (let progress = true; progress;) {
      progress = false;
      for (const name of [...queues.keys()]) {
        const before = queues.get(name)!.length;
        if (before) { drain(name); if (queues.get(name)!.length !== before) progress = true; }
      }
    }
  };
  schedule.steps.forEach((s, i) => {
    if (!queues.has(s.tx)) queues.set(s.tx, []);
    queues.get(s.tx)!.push(i);
    drainAll();
  });
  for (const [name, q] of queues) for (const i of q) record(i, name, `${describeOp(schedule.steps[i])}：仍在等待（排程結束）`, 'wait');

  const final: Record<string, number> = {};
  for (const [item, list] of versions) { const v = [...list].reverse().find(x => x.commit !== null); if (v) final[item] = v.value; }
  const outcome: ScheduleResult['outcome'] = {};
  for (const t of txs.values()) outcome[t.name] = t.done ?? 'unfinished';

  // ---- anomalies, from what happened ---------------------------------------------------------------------------------
  const anomalies: ScheduleResult['anomalies'] = [];
  for (const r of reads) if (r.dirty) anomalies.push({ kind: 'dirty-read', tx: r.tx, item: r.item, text: `${r.tx} 讀到 ${r.writer} 尚未提交的 ${r.item} = ${r.value}` });
  for (const [i, a] of reads.entries()) for (const b of reads.slice(i + 1))
    if (a.tx === b.tx && a.item === b.item && a.value !== b.value && !b.ownWriteBefore && !a.ownWriteBefore)
      anomalies.push({ kind: 'non-repeatable-read', tx: a.tx, item: a.item, text: `${a.tx} 兩次讀 ${a.item}，先得到 ${a.value}、再得到 ${b.value}` });
  for (const [i, a] of counts.entries()) for (const b of counts.slice(i + 1))
    if (a.tx === b.tx && a.min === b.min && a.result !== b.result)
      anomalies.push({ kind: 'phantom', tx: a.tx, text: `${a.tx} 兩次執行同一個 COUNT，先得到 ${a.result}、再得到 ${b.result}` });
  for (const t of txs.values()) {
    if (t.done !== 'committed') continue;
    for (const w of t.writes) {
      if (w.fromRead === undefined) continue;
      const lost = [...txs.values()].find(u => u !== t && u.done === 'committed' && u.writes.some(x => x.item === w.item && x.time > w.fromRead! && x.time < w.time));
      if (lost) anomalies.push({ kind: 'lost-update', tx: t.name, item: w.item, text: `${t.name} 依舊的讀取值寫入 ${w.item}，蓋掉了 ${lost.name} 已提交的更新` });
    }
  }
  return { events, final, outcome, anomalies: dedupe(anomalies) };
}

function dedupe<T extends { kind: string; tx: string; item?: string }>(list: T[]): T[] {
  return list.filter((a, i) => list.findIndex(b => b.kind === a.kind && b.tx === a.tx && b.item === a.item) === i);
}

/** The weakest level (of the model) at which none of `anomalies` happens in this schedule; undefined if none prevents it. */
export function weakestSafeLevel(schedule: Schedule, model: Model, anomalies: readonly Anomaly[]): Level | undefined {
  return MODEL_LEVELS[model].find(level => !runSchedule(schedule, model, level).anomalies.some(a => anomalies.includes(a.kind)));
}
