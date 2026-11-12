import initSqlJs, { type Database } from 'sql.js';
import type { DatasetId } from './datasets';
import { checkSql, openDataset, runSql, type SqlCheckSpec, type SqlValue } from './engine';
import { runStrategy, type SequenceStrategy } from './sequence';

/*
 * Phase F.1a: the SQL playground's Web Worker. It owns one in-memory database (the playground's dataset, kept between
 * runs until reset) and runs SQL off the main thread, so a slow query never freezes the page; the page terminates the
 * worker when a run takes too long. The WebAssembly file is bundled from the sql.js package (no network request).
 */
export type SqlRequest =
  | { id: number; type: 'run'; dataset: DatasetId; sql: string; params?: SqlValue[] }
  | { id: number; type: 'reset'; dataset: DatasetId }
  | { id: number; type: 'check'; spec: SqlCheckSpec; sql: string }
  | { id: number; type: 'sequence'; dataset: DatasetId; strategy: SequenceStrategy };

const wasm = new URL('sql.js/dist/sql-wasm-browser.wasm', import.meta.url);
const engine = initSqlJs({ locateFile: () => wasm.href });
let db: { dataset: DatasetId; database: Database } | undefined;

async function session(dataset: DatasetId, fresh = false) {
  const SQL = await engine;
  if (fresh || db?.dataset !== dataset) { db?.database.close(); db = { dataset, database: openDataset(SQL, dataset) }; }
  return db.database;
}

/** The worker's global scope, typed here so the module needs no webworker lib (the project compiles with the DOM lib). */
const scope = self as unknown as { onmessage: (event: MessageEvent<SqlRequest>) => void; postMessage(message: unknown): void };

scope.onmessage = async (event: MessageEvent<SqlRequest>) => {
  const request = event.data;
  // F.1d: SQLite and the dataset are loaded; from here on the page's time limit counts (the first run no longer gets the
  // startup allowance for its query too).
  const started = () => scope.postMessage({ id: request.id, started: true });
  try {
    if (request.type === 'run') {
      // F.1c: how long SQLite took, measured here so page work does not count (DB12 compares before and after tuning).
      const db = await session(request.dataset); started();
      const start = performance.now();
      const result = runSql(db, request.sql, request.params);
      scope.postMessage({ id: request.id, result: { ...result, elapsedMs: performance.now() - start } });
    }
    else if (request.type === 'reset') { await session(request.dataset, true); scope.postMessage({ id: request.id, result: { ok: true } }); }
    else if (request.type === 'sequence') {
      // F.1d: each strategy runs on its own fresh copy of the dataset, so strategies never affect each other.
      const db = openDataset(await engine, request.dataset); started();
      const start = performance.now();
      try { scope.postMessage({ id: request.id, result: { ...runStrategy(db, request.strategy), elapsedMs: performance.now() - start } }); } finally { db.close(); }
    }
    else { const SQL = await engine; started(); scope.postMessage({ id: request.id, result: checkSql(SQL, request.spec, request.sql) }); }
  } catch (e) {
    scope.postMessage({ id: request.id, result: { ok: false, error: e instanceof Error ? e.message : String(e) } });
  }
};
