import type { Database, SqlJsStatic, SqlValue as RawValue } from 'sql.js';
import { DATASETS, type DatasetId } from './datasets';
import { checkPlan, planOfLast, type PlanRequirement, type PlanStep } from './plan';

/*
 * Phase F.1a SQL engine: runs SQL on an in-memory SQLite database (sql.js) and compares results. Pure functions over a
 * sql.js instance, shared by the browser worker (src/lib/sql/worker.ts) and the Node tests (tests/sql-engine.test.ts),
 * so what the tests check is what the page runs. Nothing leaves the browser: no network, no files, no server.
 */

export type SqlValue = string | number | null;
export interface SqlTable { columns: string[]; rows: SqlValue[][] }
export interface StatementResult extends SqlTable { truncated: boolean }
export type RunResult =
  | { ok: true; results: StatementResult[]; changes: number; statements: number }
  | { ok: false; error: string; hint?: string };

/**
 * Limits per run. Time: the worker cannot be interrupted while SQLite runs, so the page terminates it after timeoutMs
 * (src/lib/sql/client.ts; a new worker gets startupMs more to load SQLite); rows stop being read at maxRows, which also ends an endless recursive query that streams
 * rows; maxPages caps how much data a run can add (4 KiB pages).
 */
export const SQL_LIMITS = { maxLength: 4000, maxStatements: 20, maxRows: 200, timeoutMs: 3000, startupMs: 10000, maxPages: 2048 } as const;

/** A fresh database holding one dataset, with foreign keys enforced (SQLite leaves them off by default). */
export function openDataset(SQL: SqlJsStatic, dataset: DatasetId): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  if (DATASETS[dataset].setup) db.run(DATASETS[dataset].setup);
  db.run(`PRAGMA max_page_count = ${SQL_LIMITS.maxPages};`);
  return db;
}

const value = (v: RawValue): SqlValue => v instanceof Uint8Array ? `[BLOB ${v.length} bytes]` : v;

/**
 * Rows changed so far on this connection. A statement's own change count is the difference before and after it:
 * sqlite3_changes() (getRowsModified) keeps the last INSERT/UPDATE/DELETE's count through DDL such as CREATE INDEX.
 */
function totalChanges(db: Database): number {
  for (const statement of db.iterateStatements('SELECT total_changes()')) {
    try { statement.step(); return Number(statement.get()[0]); } finally { statement.free(); }
  }
  return 0;
}

/** The `?` placeholders of one statement, ignoring quoted text and comments (F.1d: parameterized queries). */
export function placeholderCount(statementSql: string): number {
  const bare = statementSql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g, '');
  return (bare.match(/\?/g) ?? []).length;
}

/**
 * Runs every statement in order and keeps the result of each query; stops at the first error. F.1d: `params` are bound
 * to every statement that has `?` placeholders, in order, the way an application's driver sends a parameterized
 * query; a statement must have exactly as many placeholders as there are values. Values are never put into the SQL
 * text, so a value can never change what the statement means.
 */
export function runSql(db: Database, sql: string, params?: readonly SqlValue[]): RunResult {
  if (!sql.trim()) return { ok: false, error: 'empty', hint: '請先輸入 SQL 敘述。' };
  if (sql.length > SQL_LIMITS.maxLength) return { ok: false, error: 'too long', hint: `SQL 最多 ${SQL_LIMITS.maxLength} 個字元。` };
  const results: StatementResult[] = [];
  let changes = 0, statements = 0;
  try {
    let before = totalChanges(db);
    for (const statement of db.iterateStatements(sql)) {
      if (++statements > SQL_LIMITS.maxStatements) { statement.free(); return { ok: false, error: 'too many statements', hint: `一次最多執行 ${SQL_LIMITS.maxStatements} 個敘述。` }; }
      try {
        if (params) {
          const count = placeholderCount(statement.getSQL());
          if (count && count !== params.length)
            return { ok: false, error: 'parameter count', hint: `這個敘述有 ${count} 個 ?，但給了 ${params.length} 個參數值。` };
          if (count) statement.bind(params as SqlValue[]);
        }
        const columns = statement.getColumnNames();
        const rows: SqlValue[][] = [];
        let truncated = false;
        while (statement.step()) {
          if (rows.length === SQL_LIMITS.maxRows) { truncated = true; break; }
          rows.push(statement.get().map(value));
        }
        if (columns.length) results.push({ columns, rows, truncated });
      } finally { statement.free(); }
      const after = totalChanges(db);
      changes += after - before;
      before = after;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error, hint: explainError(error) };
  }
  return { ok: true, results, changes, statements };
}

/** A short explanation in Chinese of SQLite's most common messages (the original message is shown too). */
export function explainError(message: string): string | undefined {
  const rules: [RegExp, string][] = [
    [/no such table/, '找不到這張表：檢查表名的拼法，可用的表列在「資料表」中。'],
    [/no such column/, '找不到這個欄位：檢查欄位名稱的拼法，或欄位是不是屬於 FROM 中的另一張表。'],
    [/ambiguous column name/, '欄位名稱有歧義：兩張表都有這個欄位，請寫成「表名.欄位」或「別名.欄位」。'],
    [/syntax error/, '語法錯誤：檢查關鍵字的順序（SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT）、逗號與引號是否成對。'],
    [/incomplete input/, '敘述沒有寫完：可能少了右括號、引號或條件。'],
    [/misuse of aggregate/, '彙總函式用錯位置：WHERE 不能使用 COUNT、SUM 等彙總函式，分組後的條件請放在 HAVING。'],
    [/UNIQUE constraint failed/, '違反唯一性：主鍵或唯一欄位的值已經存在。'],
    [/NOT NULL constraint failed/, '違反 NOT NULL：這個欄位必須有值。'],
    [/FOREIGN KEY constraint failed/, '違反參考完整性：外鍵指向的資料列不存在，或還有其他資料列參考這一列。'],
    [/CHECK constraint failed/, '違反 CHECK 約束：這筆資料不符合資料表定義的條件。'],
    [/table \S+ already exists/, '資料表已經存在：先「重設資料」，或改用 CREATE TABLE IF NOT EXISTS。'],
    [/datatype mismatch/, '型別不符：例如 INTEGER PRIMARY KEY 只能存整數。'],
    [/database or disk is full/, '資料量超過練習場的上限，請重設資料。'],
    [/aggregate functions are not allowed in the GROUP BY clause/, 'GROUP BY 不能使用彙總函式。'],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1];
}

// ---- comparing results -------------------------------------------------------------------------------------------
export interface CompareOptions {
  /** The order of rows matters (the task asks for ORDER BY). */
  ordered: boolean;
  /** Column names must match too (the task names them, e.g. with AS); otherwise only count and position. */
  columnNames?: boolean;
}
export type Verdict = { ok: true } | { ok: false; reason: 'error' | 'no-result' | 'columns' | 'row-count' | 'rows' | 'order' | 'plan'; message: string };

/** Numbers compare by value (85 and 85.0 are equal; averages to 6 decimals); text exactly; NULL only with NULL. */
const normal = (v: SqlValue) => typeof v === 'number' ? Number(v.toFixed(6)) : v;
const key = (row: SqlValue[]) => JSON.stringify(row.map(normal));

export function compareTables(actual: SqlTable, expected: SqlTable, options: CompareOptions): Verdict {
  if (actual.columns.length !== expected.columns.length)
    return { ok: false, reason: 'columns', message: `欄位數不同：預期 ${expected.columns.length} 個欄位，你的結果有 ${actual.columns.length} 個。` };
  if (options.columnNames && actual.columns.some((c, i) => c.toLowerCase() !== expected.columns[i].toLowerCase()))
    return { ok: false, reason: 'columns', message: `欄位名稱或順序不同：預期 ${expected.columns.join(', ')}。` };
  if (actual.rows.length !== expected.rows.length)
    return { ok: false, reason: 'row-count', message: `資料列數不同：預期 ${expected.rows.length} 列，你的結果有 ${actual.rows.length} 列。` };
  const a = actual.rows.map(key), e = expected.rows.map(key);
  if (options.ordered && a.every((k, i) => k === e[i])) return { ok: true };
  const sorted = (list: string[]) => [...list].sort();
  const same = sorted(a).every((k, i) => k === sorted(e)[i]);
  if (!same) return { ok: false, reason: 'rows', message: '資料列的內容不同：有些列多了、少了或值不一樣。' };
  return options.ordered ? { ok: false, reason: 'order', message: '資料列都對，但順序不同：檢查 ORDER BY。' } : { ok: true };
}

/** The table a run ends with: the last query's result. */
export const lastTable = (run: RunResult): StatementResult | undefined => run.ok ? run.results.at(-1) : undefined;

// ---- checking an exercise ------------------------------------------------------------------------------------------
/**
 * Phase F.1b: a statement run after the learner's SQL, for exercises that change data or define tables (DDL, DML). Its
 * outcome (a query's result, or whether the statement was accepted or rejected) is compared with the reference
 * solution's, so the check looks at what the database does, not at how the SQL is written. Hidden probes run on the
 * hidden checks only.
 */
export interface SqlProbe {
  label: string; sql: string; hidden?: boolean;
  /** F.1c: a query whose plan (EXPLAIN QUERY PLAN) must meet this requirement, e.g. after the learner's CREATE INDEX. */
  plan?: PlanRequirement;
}
export type ProbeOutcome = { kind: 'table'; table: SqlTable } | { kind: 'accepted' } | { kind: 'rejected'; error: string }
  | { kind: 'plan'; steps: PlanStep[]; problem?: string };

/**
 * What a SQL exercise is checked with: the reference solution, run on each dataset, gives the expected result. F.1c:
 * `plan` — the learner's last statement must also have a query plan meeting this requirement.
 */
export interface SqlCheckSpec extends CompareOptions {
  solution: string; checks: { dataset: DatasetId; hidden?: boolean }[]; probes?: SqlProbe[]; plan?: PlanRequirement;
  /**
   * F.1d: the query is run once per parameter set, the learner's and the reference's with the same values, as an
   * application would call it with different inputs (including hostile ones); hidden sets only on hidden checks.
   */
  paramSets?: { label: string; values: SqlValue[]; hidden?: boolean }[];
  /**
   * F.1d: crash consistency. After every statement of the SQL a crash is simulated (an open transaction is rolled back,
   * as recovery would) and `probe` reads the state; each state the learner's SQL can leave must be one the reference's
   * can leave too, so changes outside one transaction (a half-done transfer) are caught.
   */
  atomic?: { probe: string };
}
export interface CheckOutcome {
  dataset: DatasetId; hidden: boolean; verdict: Verdict; actual?: SqlTable; expected?: SqlTable;
  /** The visible probe that differed: its label and SQL, and both outcomes. */
  probe?: { label: string; sql: string; expected: ProbeOutcome; actual: ProbeOutcome };
}

const probeOutcome = (run: RunResult): ProbeOutcome => !run.ok ? { kind: 'rejected', error: run.error }
  : run.results.length ? { kind: 'table', table: { columns: run.results.at(-1)!.columns, rows: run.results.at(-1)!.rows } } : { kind: 'accepted' };

function planOutcome(db: Database, sql: string, requirement: PlanRequirement): ProbeOutcome {
  const steps = planOfLast(db, sql);
  return 'error' in steps ? { kind: 'rejected', error: steps.error } : { kind: 'plan', steps, problem: checkPlan(steps, requirement) };
}

/** Runs `sql` on a fresh copy of `dataset`, then each probe in order on the same database (none if `sql` fails). Each probe is one statement. */
export function probeOutcomes(SQL: SqlJsStatic, dataset: DatasetId, sql: string, probes: readonly SqlProbe[]): { run: RunResult; outcomes: ProbeOutcome[] } {
  const db = openDataset(SQL, dataset);
  try {
    const run = runSql(db, sql);
    return { run, outcomes: run.ok ? probes.map(p => p.plan ? planOutcome(db, p.sql, p.plan) : probeOutcome(runSql(db, p.sql))) : [] };
  } finally { db.close(); }
}

/** Compares one probe's outcomes; the message names the probe unless it is hidden. */
function compareProbe(probe: SqlProbe, actual: ProbeOutcome, expected: ProbeOutcome, options: CompareOptions): Verdict {
  const name = probe.hidden ? '一個隱藏的檢查敘述' : `檢查「${probe.label}」`;
  // F.1c: a plan probe is judged by its requirement (the reference meets it too, tested), not by the reference's plan.
  if (actual.kind === 'plan' && actual.problem) return { ok: false, reason: 'plan', message: `${name}：${actual.problem}` };
  if (actual.kind === 'plan') return { ok: true };
  if (expected.kind === 'rejected' && actual.kind !== 'rejected')
    return { ok: false, reason: 'rows', message: `${name}應該被拒絕，但你的資料庫接受了它：檢查約束（NOT NULL、UNIQUE、CHECK、外鍵）是否寫齊。` };
  if (expected.kind !== 'rejected' && actual.kind === 'rejected') {
    const hint = explainError(actual.error);
    return { ok: false, reason: 'error', message: `${name}應該可以執行，但被拒絕：${probe.hidden ? '' : actual.error}${hint ? `（${hint}）` : ''}` };
  }
  if (expected.kind === 'table') {
    if (actual.kind !== 'table') return { ok: false, reason: 'no-result', message: `${name}應該查得到結果。` };
    const verdict = compareTables(actual.table, expected.table, options);
    return verdict.ok ? verdict : { ...verdict, message: `${name}的結果不同：${verdict.message}` };
  }
  return { ok: true };
}

/**
 * Runs the learner's SQL and the reference solution on fresh copies of each dataset and compares the results, so any
 * query giving the same table is accepted and nothing depends on how the SQL is written. With probes (F.1b), the
 * probes' outcomes are compared instead of the learner's own last result. Hidden checks return only the verdict,
 * never the expected rows.
 */
export function checkSql(SQL: SqlJsStatic, spec: SqlCheckSpec, sql: string): CheckOutcome[] {
  return spec.checks.map(({ dataset, hidden = false }) => {
    const fresh = (text: string) => { const db = openDataset(SQL, dataset); try { return runSql(db, text); } finally { db.close(); } };
    const failed = (run: RunResult): Verdict | undefined => run.ok ? undefined : { ok: false, reason: 'error', message: run.hint ? `${run.error}（${run.hint}）` : run.error };
    if (spec.probes?.length) {
      const probes = spec.probes.filter(p => hidden || !p.hidden);
      const reference = probeOutcomes(SQL, dataset, spec.solution, probes);
      if (!reference.run.ok) throw new Error(`reference solution fails on ${dataset}: ${reference.run.error}`);
      const learner = probeOutcomes(SQL, dataset, sql, probes);
      const error = failed(learner.run);
      if (error) return { dataset, hidden, verdict: error };
      for (const [i, probe] of probes.entries()) {
        const verdict = compareProbe(probe, learner.outcomes[i], reference.outcomes[i], spec);
        if (verdict.ok) continue;
        if (hidden || probe.hidden) return { dataset, hidden, verdict };
        const [actual, expected] = [learner.outcomes[i], reference.outcomes[i]];
        return { dataset, hidden, verdict, probe: { label: probe.label, sql: probe.sql, actual, expected },
          ...(actual.kind === 'table' && expected.kind === 'table' ? { actual: actual.table, expected: expected.table } : {}) };
      }
      return { dataset, hidden, verdict: spec.atomic ? atomicVerdict(SQL, dataset, spec.solution, sql, spec.atomic.probe) : { ok: true } };
    }
    if (spec.paramSets?.length) return paramCheck(SQL, spec, sql, dataset, hidden);
    const expected = lastTable(fresh(spec.solution));
    if (!expected) throw new Error(`reference solution gives no result on ${dataset}`);
    const run = fresh(sql);
    const actual = lastTable(run);
    let verdict: Verdict = failed(run)
      ?? (!actual ? { ok: false, reason: 'no-result', message: '沒有查詢結果：最後一個敘述要是 SELECT。' } : compareTables(actual, expected, spec));
    if (verdict.ok && spec.plan) verdict = planVerdict(SQL, dataset, sql, spec.plan);
    return { dataset, hidden, verdict, ...(hidden ? {} : { actual, expected }) };
  });
}

/** F.1c: the plan of the learner's last statement (after running the ones before it) against the requirement. */
function planVerdict(SQL: SqlJsStatic, dataset: DatasetId, sql: string, requirement: PlanRequirement): Verdict {
  const db = openDataset(SQL, dataset);
  try {
    const steps = planOfLast(db, sql);
    if ('error' in steps) return { ok: false, reason: 'error', message: steps.error };
    const problem = checkPlan(steps, requirement);
    return problem ? { ok: false, reason: 'plan', message: `結果正確，但${problem}` } : { ok: true };
  } finally { db.close(); }
}

/** F.1d: the parameter sets of a query exercise, one after another; the first that differs decides. */
function paramCheck(SQL: SqlJsStatic, spec: SqlCheckSpec, sql: string, dataset: DatasetId, hidden: boolean): CheckOutcome {
  const fresh = (text: string, values: SqlValue[]) => { const db = openDataset(SQL, dataset); try { return runSql(db, text, values); } finally { db.close(); } };
  for (const set of spec.paramSets!.filter(p => hidden || !p.hidden)) {
    const expected = lastTable(fresh(spec.solution, set.values));
    if (!expected) throw new Error(`reference solution gives no result on ${dataset} with ${set.label}`);
    const run = fresh(sql, set.values), actual = lastTable(run);
    const name = set.hidden ? '一組隱藏的參數' : `參數「${set.label}」`;
    const verdict: Verdict = !run.ok ? { ok: false, reason: 'error', message: `${name}：${run.hint ? `${run.error}（${run.hint}）` : run.error}` }
      : !actual ? { ok: false, reason: 'no-result', message: `${name}：沒有查詢結果，最後一個敘述要是 SELECT。` }
      : compareTables(actual, expected, spec);
    if (!verdict.ok) return { dataset, hidden, verdict: run.ok && actual ? { ...verdict, message: `${name}：${verdict.message}` } : verdict,
      ...(hidden || set.hidden ? {} : { actual, expected }) };
  }
  // The plan does not depend on the values bound (EXPLAIN QUERY PLAN leaves `?` unbound), so it is checked once.
  return { dataset, hidden, verdict: spec.plan ? planVerdict(SQL, dataset, sql, spec.plan) : { ok: true } };
}

/** The states `probe` sees if the system crashes after each statement of `sql` (an open transaction is rolled back). */
export function crashStates(SQL: SqlJsStatic, dataset: DatasetId, sql: string, probe: string): string[] {
  const states = new Set<string>();
  for (let k = 0; k <= SQL_LIMITS.maxStatements; k++) {
    const db = openDataset(SQL, dataset);
    try {
      let done = 0, stopped = false;
      try {
        for (const statement of db.iterateStatements(sql)) {
          if (done === k) { statement.free(); break; }
          try { for (let n = 0; n < SQL_LIMITS.maxRows && statement.step(); n++); } finally { statement.free(); }
          done++;
        }
      } catch { stopped = true; }
      try { db.exec('ROLLBACK'); } catch { /* no transaction was open */ }
      const seen = runSql(db, probe);
      states.add(seen.ok ? JSON.stringify(seen.results.at(-1)?.rows ?? []) : `error: ${seen.error.replace(/:.*/, '')}`);
      if (stopped || done < k) break;
    } finally { db.close(); }
  }
  return [...states];
}

function atomicVerdict(SQL: SqlJsStatic, dataset: DatasetId, solution: string, sql: string, probe: string): Verdict {
  const allowed = new Set(crashStates(SQL, dataset, solution, probe));
  const extra = crashStates(SQL, dataset, sql, probe).filter(state => !allowed.has(state));
  return extra.length ? { ok: false, reason: 'rows', message: '當機測試：如果在你的 SQL 執行到一半時當機，資料可能停在參考解答不會出現的狀態（例如只做了一半的轉帳）。相關的修改要放在同一筆交易裡，提交之前當機就全部不算。' } : { ok: true };
}
