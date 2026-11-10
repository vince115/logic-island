/*
 * Phase F.1c transaction timeline, one session (DB14): transactions run one statement at a time against named values
 * (account balances), every change is first appended to a write-ahead log, and the learner can crash the system after
 * any step. Recovery keeps exactly the transactions whose COMMIT record reached the log and discards the others.
 *
 * A teaching model of the WAL idea, not of one product's file format: log records are written before the data they
 * describe, COMMIT forces the log to disk, and data pages may be written at any time, so after a crash the log alone
 * decides. Statements outside BEGIN … COMMIT run in autocommit mode (each is its own transaction), as in SQLite and
 * PostgreSQL. A statement that would break the check (`min`) is rejected and changes nothing; the transaction stays
 * open, and the script decides what follows (ROLLBACK, or carry on) — SQLite behaves this way; PostgreSQL instead marks
 * the whole transaction failed, which the lesson says in words.
 */

export type TxStep =
  | { op: 'begin' }
  | { op: 'update'; item: string; delta: number; note?: string }
  | { op: 'savepoint'; name: string }
  | { op: 'rollback-to'; name: string }
  | { op: 'release'; name: string }
  | { op: 'commit' }
  | { op: 'rollback' };

export interface TimelineScript { items: Record<string, number>; min?: number; steps: TxStep[] }

export type LogRecord =
  | { kind: 'begin'; tx: number }
  | { kind: 'update'; tx: number; item: string; before: number; after: number }
  | { kind: 'commit'; tx: number }
  | { kind: 'abort'; tx: number };

export interface StepState {
  step: number;
  /** What the step did, in Chinese. */
  text: string;
  outcome: 'ok' | 'rejected' | 'error';
  /** Values every other session sees (committed). */
  committed: Record<string, number>;
  /** Values inside the open transaction, if one is open. */
  working?: Record<string, number>;
  /** The open transaction's number, if any. */
  open?: number;
  log: LogRecord[];
}

/** Each step's state after it runs; step 0 is the start. */
export function runTimeline(script: TimelineScript): StepState[] {
  let committed = { ...script.items }, working: Record<string, number> | undefined, tx = 0, open: number | undefined;
  let savepoints: { name: string; values: Record<string, number>; logLength: number }[] = [];
  const log: LogRecord[] = [];
  const states: StepState[] = [{ step: 0, text: '開始', outcome: 'ok', committed: { ...committed }, log: [] }];
  const snapshot = (step: number, text: string, outcome: StepState['outcome']) =>
    states.push({ step, text, outcome, committed: { ...committed }, ...(working ? { working: { ...working }, open } : {}), log: [...log] });

  script.steps.forEach((s, i) => {
    const step = i + 1;
    switch (s.op) {
      case 'begin':
        if (open !== undefined) return snapshot(step, 'BEGIN：已經在交易中（錯誤，沒有效果）', 'error');
        open = ++tx; working = { ...committed }; savepoints = [];
        log.push({ kind: 'begin', tx: open });
        return snapshot(step, `BEGIN：開始交易 T${open}`, 'ok');
      case 'update': {
        const auto = open === undefined, id = auto ? ++tx : open!;
        const values = auto ? { ...committed } : working!;
        if (!(s.item in values)) return snapshot(step, `UPDATE ${s.item}：沒有這個項目（錯誤）`, 'error');
        const before = values[s.item], after = before + s.delta;
        const label = `UPDATE ${s.item} ${s.delta >= 0 ? '+' : '−'} ${Math.abs(s.delta)}${s.note ? `（${s.note}）` : ''}`;
        if (script.min !== undefined && after < script.min)
          return snapshot(step, `${label}：違反 CHECK（不能低於 ${script.min}），敘述被拒絕，資料不變${auto ? '' : '；交易仍開著'}`, 'rejected');
        if (auto) log.push({ kind: 'begin', tx: id });
        log.push({ kind: 'update', tx: id, item: s.item, before, after });
        values[s.item] = after;
        if (auto) { log.push({ kind: 'commit', tx: id }); committed = values; return snapshot(step, `${label}（自動提交，T${id}）`, 'ok'); }
        return snapshot(step, `${label}（T${id}，尚未提交）`, 'ok');
      }
      case 'savepoint':
        if (open === undefined) return snapshot(step, `SAVEPOINT ${s.name}：不在交易中（本模型視為錯誤）`, 'error');
        savepoints.push({ name: s.name, values: { ...working! }, logLength: log.length });
        return snapshot(step, `SAVEPOINT ${s.name}`, 'ok');
      case 'rollback-to': {
        const at = savepoints.map(p => p.name).lastIndexOf(s.name);
        if (open === undefined || at < 0) return snapshot(step, `ROLLBACK TO ${s.name}：沒有這個儲存點（錯誤）`, 'error');
        const point = savepoints[at];
        working = { ...point.values };
        // The changes after the savepoint are undone: log them as compensating updates, so recovery stays log-driven.
        const undone = log.slice(point.logLength).filter((r): r is Extract<LogRecord, { kind: 'update' }> => r.kind === 'update' && r.tx === open);
        for (const r of [...undone].reverse()) log.push({ kind: 'update', tx: open, item: r.item, before: r.after, after: r.before });
        savepoints = savepoints.slice(0, at + 1);
        return snapshot(step, `ROLLBACK TO ${s.name}：撤銷儲存點之後的 ${undone.length} 個修改，交易仍開著`, 'ok');
      }
      case 'release': {
        const at = savepoints.map(p => p.name).lastIndexOf(s.name);
        if (open === undefined || at < 0) return snapshot(step, `RELEASE ${s.name}：沒有這個儲存點（錯誤）`, 'error');
        savepoints = savepoints.slice(0, at);
        return snapshot(step, `RELEASE ${s.name}：保留修改，移除儲存點`, 'ok');
      }
      case 'commit':
        if (open === undefined) return snapshot(step, 'COMMIT：不在交易中（錯誤）', 'error');
        log.push({ kind: 'commit', tx: open });
        committed = working!; working = undefined;
        snapshot(step, `COMMIT：T${open} 的提交紀錄寫入日誌，修改生效`, 'ok');
        open = undefined;
        return;
      case 'rollback':
        if (open === undefined) return snapshot(step, 'ROLLBACK：不在交易中（錯誤）', 'error');
        log.push({ kind: 'abort', tx: open });
        working = undefined;
        snapshot(step, `ROLLBACK：放棄 T${open} 的所有修改`, 'ok');
        open = undefined;
        return;
    }
  });
  return states;
}

export interface Recovery { state: Record<string, number>; redone: number[]; discarded: number[] }

/**
 * After a crash right after `step` (0 = before anything ran): replay the log from the initial values, keeping the
 * updates of transactions that have a COMMIT record and dropping every other transaction's updates.
 */
export function recoverAfter(script: TimelineScript, step: number): Recovery {
  const states = runTimeline(script);
  const log = states[Math.min(step, states.length - 1)].log;
  const committed = new Set(log.filter(r => r.kind === 'commit').map(r => r.tx));
  const started = [...new Set(log.filter(r => r.kind === 'begin').map(r => r.tx))];
  const state = { ...script.items };
  for (const r of log) if (r.kind === 'update' && committed.has(r.tx)) state[r.item] = r.after;
  return { state, redone: started.filter(t => committed.has(t)), discarded: started.filter(t => !committed.has(t)) };
}
