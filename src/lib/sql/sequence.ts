import type { Database } from 'sql.js';
import { runSql, type SqlTable, type SqlValue } from './engine';

/*
 * Phase F.1d protocol-sequence activity (DB16): the round trips an application makes to the database for one task,
 * the way a driver or an ORM would send them. A strategy is a first query and, optionally, a follow-up query sent once
 * per row of the first result with that row's value as its parameter (the N+1 pattern), or once with all those values
 * at once (a batched IN). Every query really runs on SQLite, so the counts and rows on the page are measured.
 */

export interface SequenceStrategy {
  label: string;
  note: string;
  first: { sql: string; params?: SqlValue[] };
  /** Sent after `first`: per row (one round trip each), or batched (one round trip, every value as a parameter). */
  then?: { sql: string; column: string; mode: 'per-row' | 'batched' };
}
export interface RoundTrip { sql: string; params: SqlValue[]; result: SqlTable | { error: string } }
export interface SequenceRun { trips: RoundTrip[]; rows: number }

/** The SQL of a batched follow-up for `n` values: its single `(?)` becomes `(?, ?, …)`. */
export const batchedSql = (sql: string, n: number) => sql.replace('(?)', `(${Array.from({ length: Math.max(1, n) }, () => '?').join(', ')})`);

export function runStrategy(db: Database, strategy: SequenceStrategy, maxTrips = 60): SequenceRun {
  const trips: RoundTrip[] = [];
  const send = (sql: string, params: SqlValue[] = []) => {
    const run = runSql(db, sql, params.length ? params : undefined);
    const last: SqlTable | undefined = run.ok ? run.results.at(-1) : undefined;
    const result: SqlTable | { error: string } = run.ok ? last ?? { columns: [], rows: [] } : { error: run.hint ? `${run.error}（${run.hint}）` : run.error };
    trips.push({ sql, params, result: 'error' in result ? result : { columns: result.columns, rows: result.rows } });
    return 'error' in result ? undefined : result;
  };
  const first = send(strategy.first.sql, strategy.first.params);
  if (first && strategy.then) {
    const at = first.columns.indexOf(strategy.then.column);
    if (at < 0) trips.push({ sql: strategy.then.sql, params: [], result: { error: `第一個查詢沒有 ${strategy.then.column} 欄位` } });
    else {
      const values = [...new Set(first.rows.map(r => r[at]))];
      if (strategy.then.mode === 'batched') send(batchedSql(strategy.then.sql, values.length), values);
      else for (const v of values.slice(0, maxTrips - 1)) send(strategy.then.sql, [v]);
    }
  }
  return { trips, rows: trips.reduce((n, t) => n + ('error' in t.result ? 0 : t.result.rows.length), 0) };
}
