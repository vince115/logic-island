import type { Database } from 'sql.js';
import type { SqlTable } from './engine';

/*
 * Phase F.1c query plans (DB11, DB12): SQLite's EXPLAIN QUERY PLAN rows read as steps (full scan, scan of an index,
 * index search, temporary B-tree for sorting), and requirements a plan must meet. Exercises are checked against the
 * requirement, never against the reference's plan text: learners name indexes and table aliases differently, and two
 * different indexes can both turn a scan into a search. The plan is SQLite's (3.49, no ANALYZE statistics); other
 * DBMS show plans differently.
 */

export type PlanKind = 'scan' | 'index-scan' | 'search' | 'derived-scan' | 'temp-btree' | 'other';
export interface PlanStep { id: number; parent: number; detail: string; kind: PlanKind; table?: string; index?: string; covering?: boolean }
export const PLAN_COLUMNS = ['id', 'parent', 'notused', 'detail'];
export const isPlanTable = (t: SqlTable) => t.columns.join() === PLAN_COLUMNS.join();

export const PLAN_KIND_TEXT: Record<PlanKind, string> = {
  scan: '全表掃描', 'index-scan': '掃描整個索引', search: '索引搜尋', 'derived-scan': '讀取中間結果', 'temp-btree': '額外排序（暫存 B 樹）', other: '其他步驟',
};

/** One EXPLAIN QUERY PLAN line, classified. `table` is the name SQLite prints: the alias when the query gives one. */
export function classify(detail: string): Pick<PlanStep, 'kind' | 'table' | 'index' | 'covering'> {
  // `LEFT-JOIN` marks the inner table of an outer join: still a full scan.
  let m = /^SCAN (\S+)(?: USING (COVERING )?INDEX (\S+))?(?: LEFT-JOIN)?$/.exec(detail);
  if (m) return m[3] ? { kind: 'index-scan', table: m[1], index: m[3], covering: !!m[2] } : { kind: 'scan', table: m[1] };
  m = /^SEARCH (\S+) USING (?:AUTOMATIC (?:PARTIAL )?)?(COVERING )?(INDEX (\S+)|INTEGER PRIMARY KEY|PRIMARY KEY)/.exec(detail);
  if (m) return { kind: 'search', table: m[1], index: m[4] ?? 'PRIMARY KEY', covering: !!m[2] };
  if (/^USE TEMP B-TREE FOR /.test(detail)) return { kind: 'temp-btree' };
  return { kind: 'other' };
}

/**
 * The plan's steps. A SCAN of a CTE or subquery's result (named by an earlier `MATERIALIZE x` or `CO-ROUTINE x`) reads
 * an intermediate result, not a table: it is a derived-scan and not counted as a full scan; the scans inside it are.
 */
export function planSteps(table: SqlTable): PlanStep[] {
  const derived = new Set(table.rows.flatMap(([, , , d]) => { const m = /^(?:MATERIALIZE|CO-ROUTINE) (\S+)$/.exec(String(d)); return m ? [m[1]] : []; }));
  return table.rows.map(([id, parent, , detail]) => {
    const step = { id: Number(id), parent: Number(parent), detail: String(detail), ...classify(String(detail)) };
    return step.kind === 'scan' && derived.has(step.table!) ? { ...step, kind: 'derived-scan' as const } : step;
  });
}

/** Runs every statement of `sql` (as the learner wrote it) and returns the plan of the last one. */
export function planOfLast(db: Database, sql: string, maxRows = 200): PlanStep[] | { error: string } {
  let last: string | undefined;
  try {
    for (const statement of db.iterateStatements(sql)) {
      try { last = statement.getSQL(); for (let n = 0; n < maxRows && statement.step(); n++); } finally { statement.free(); }
    }
    if (!last) return { error: 'empty' };
    const rows: SqlTable['rows'] = [];
    for (const statement of db.iterateStatements(`EXPLAIN QUERY PLAN ${last}`)) {
      try { while (statement.step()) rows.push(statement.get() as SqlTable['rows'][number]); } finally { statement.free(); }
    }
    return planSteps({ columns: PLAN_COLUMNS, rows });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What a plan must do. maxFullScans: at most this many full scans — of a table, or of a whole index, which still reads
 * every entry (0: every table is reached by searching an index or the primary key); noTempSort: no temporary B-tree, i.e. the order comes from an index; indexOn: each of these tables
 * (the name or alias SQLite prints) is read through an index (a search or a scan of an index).
 */
export interface PlanRequirement { maxFullScans?: number; noTempSort?: boolean; indexOn?: string[] }

/** undefined when the plan meets the requirement; otherwise what is wrong, in Chinese. */
export function checkPlan(steps: readonly PlanStep[], req: PlanRequirement): string | undefined {
  const scans = steps.filter(s => s.kind === 'scan' || s.kind === 'index-scan');
  const named = scans.map(s => s.kind === 'scan' ? s.table : `${s.table}（整個索引 ${s.index}）`).join('、');
  if (req.maxFullScans !== undefined && scans.length > req.maxFullScans)
    return req.maxFullScans === 0 ? `查詢計畫仍然全表掃描 ${named}：沒有用索引搜尋，每一筆都要讀過。`
      : `查詢計畫有 ${scans.length} 次全部掃描（${named}），最多只能 ${req.maxFullScans} 次。`;
  if (req.noTempSort && steps.some(s => s.kind === 'temp-btree')) return '查詢計畫還需要額外排序（USE TEMP B-TREE）：索引的欄位順序沒有涵蓋 ORDER BY。';
  for (const table of req.indexOn ?? [])
    if (!steps.some(s => s.table === table && (s.kind === 'search' || s.kind === 'index-scan')))
      return `查詢計畫沒有透過索引讀取 ${table}。`;
  return undefined;
}

/** One line per step, indented by depth, for the playground and feedback. */
export function describePlan(steps: readonly PlanStep[]): string[] {
  const depth = new Map<number, number>();
  return steps.map(s => { const d = s.parent ? (depth.get(s.parent) ?? 0) + 1 : 0; depth.set(s.id, d); return `${'  '.repeat(d)}${s.detail}`; });
}
