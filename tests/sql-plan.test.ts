import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { checkSql, lastTable, openDataset, runSql, type SqlCheckSpec } from '../src/lib/sql/engine';
import { checkPlan, classify, describePlan, planOfLast } from '../src/lib/sql/plan';

// Phase F.1c: query plans (DB11, DB12) on the real SQLite build, and the generated sales datasets.
let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });
const plan = (sql: string, dataset: 'sales' | 'shop' = 'sales') => { const db = openDataset(SQL, dataset); try { const p = planOfLast(db, sql); if ('error' in p) throw new Error(p.error); return p; } finally { db.close(); } };

describe('query plans (F.1c)', () => {
  it('classifies SQLite\'s plan lines', () => {
    expect(classify('SCAN orders')).toEqual({ kind: 'scan', table: 'orders' });
    expect(classify('SCAN o USING COVERING INDEX idx_o_c')).toEqual({ kind: 'index-scan', table: 'o', index: 'idx_o_c', covering: true });
    expect(classify('SEARCH orders USING INDEX idx_o_c (customer_id=?)')).toEqual({ kind: 'search', table: 'orders', index: 'idx_o_c', covering: false });
    expect(classify('SEARCH c USING INTEGER PRIMARY KEY (rowid=?)')).toEqual({ kind: 'search', table: 'c', index: 'PRIMARY KEY', covering: false });
    expect(classify('SEARCH o USING AUTOMATIC COVERING INDEX (customer_id=?)')).toMatchObject({ kind: 'search', table: 'o', covering: true });
    expect(classify('USE TEMP B-TREE FOR ORDER BY')).toEqual({ kind: 'temp-btree' });
    expect(classify('LIST SUBQUERY 1')).toEqual({ kind: 'other' });
    expect(classify('SCAN o LEFT-JOIN')).toEqual({ kind: 'scan', table: 'o' });
  });

  it('plans the last statement after running the ones before it', () => {
    expect(plan("SELECT * FROM orders WHERE customer_id = 42").map(s => s.kind)).toEqual(['scan']);
    const indexed = plan('CREATE INDEX by_customer ON orders(customer_id); SELECT * FROM orders WHERE customer_id = 42');
    expect(indexed).toMatchObject([{ kind: 'search', table: 'orders', index: 'by_customer' }]);
    expect(describePlan(plan("SELECT name FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE quantity > 4)"))).toContain('  SCAN orders');
    expect(planOfLast(openDataset(SQL, 'sales'), 'SELECT * FROM nowhere')).toEqual({ error: 'no such table: nowhere' });
  });

  it('counts full scans of tables and indexes, not of a CTE or subquery result; the scans inside those count', () => {
    const cte = plan('WITH t AS (SELECT product_id, SUM(quantity) AS q FROM orders GROUP BY product_id) SELECT p.id, t.q FROM t JOIN products p ON p.id = t.product_id');
    expect(cte.map(s => s.kind)).toEqual(['other', 'scan', 'temp-btree', 'derived-scan', 'search']);
    expect(checkPlan(cte, { maxFullScans: 1 })).toBeUndefined();
    expect(checkPlan(cte, { maxFullScans: 0 })).toMatch(/全表掃描 orders/);
    const derived = plan('SELECT * FROM (SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id) WHERE n > 20');
    expect(derived.filter(s => s.kind === 'derived-scan').map(s => s.table)).toEqual(['(subquery-1)']);
    // The inner table of a LEFT JOIN read in full is a full scan (here with automatic indexes off).
    const left = plan('PRAGMA automatic_index = OFF; SELECT c.id, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id');
    expect(checkPlan(left, { maxFullScans: 1 })).toMatch(/2 次全部掃描（c、o）/);
  });

  it('checks a plan against a requirement and says what is missing', () => {
    const scan = plan("SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on");
    expect(checkPlan(scan, { maxFullScans: 0 })).toMatch(/仍然全表掃描 orders/);
    const index = plan('CREATE INDEX i ON orders(customer_id); SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on');
    expect(checkPlan(index, { maxFullScans: 0 })).toBeUndefined();
    expect(checkPlan(index, { maxFullScans: 0, noTempSort: true })).toMatch(/額外排序/);
    const both = plan('CREATE INDEX i ON orders(customer_id, ordered_on); SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on');
    expect(checkPlan(both, { maxFullScans: 0, noTempSort: true, indexOn: ['orders'] })).toBeUndefined();
    // Wrapping the column in a function hides it from the index.
    expect(checkPlan(plan("CREATE INDEX d ON orders(ordered_on); SELECT COUNT(*) FROM orders WHERE substr(ordered_on, 1, 7) = '2025-03'"), { maxFullScans: 0 })).toMatch(/全表掃描/);
    expect(checkPlan(plan("CREATE INDEX d ON orders(ordered_on); SELECT COUNT(*) FROM orders WHERE ordered_on >= '2025-03-01' AND ordered_on < '2025-04-01'"), { maxFullScans: 0 })).toBeUndefined();
  });

  it('checks index exercises by requirement, so any index that does the job passes, whatever its name', () => {
    const spec: SqlCheckSpec = { solution: 'CREATE INDEX idx_orders_customer ON orders(customer_id);', ordered: false,
      checks: [{ dataset: 'sales' }, { dataset: 'sales-b', hidden: true }],
      probes: [{ label: '某位顧客的訂單', sql: 'SELECT * FROM orders WHERE customer_id = 7', plan: { maxFullScans: 0 } },
        { label: '訂單數不變', sql: 'SELECT COUNT(*) FROM orders' }] };
    const ok = (sql: string) => checkSql(SQL, spec, sql).map(o => o.verdict.ok);
    expect(ok(spec.solution)).toEqual([true, true]);
    expect(ok('CREATE INDEX x ON orders(customer_id, ordered_on);')).toEqual([true, true]);
    const wrong = checkSql(SQL, spec, 'CREATE INDEX x ON orders(product_id);');
    expect(wrong.map(o => o.verdict.ok)).toEqual([false, false]);
    expect(wrong[0].verdict).toMatchObject({ reason: 'plan', message: expect.stringMatching(/檢查「某位顧客的訂單」：查詢計畫仍然全表掃描 orders/) });
    expect(ok('DELETE FROM orders WHERE customer_id = 7; CREATE INDEX x ON orders(customer_id);')).toEqual([false, false]);
  });

  it('checks a rewrite by its result and by its plan', () => {
    const spec: SqlCheckSpec = { solution: "SELECT COUNT(*) FROM orders WHERE ordered_on >= '2025-03-01' AND ordered_on < '2025-04-01';", ordered: true,
      checks: [{ dataset: 'sales' }, { dataset: 'sales-b', hidden: true }], plan: { maxFullScans: 0 } };
    const prefix = 'CREATE INDEX idx_orders_date ON orders(ordered_on); ';
    expect(checkSql(SQL, { ...spec, solution: prefix + spec.solution }, prefix + "SELECT COUNT(*) FROM orders WHERE ordered_on BETWEEN '2025-03-01' AND '2025-03-31';").map(o => o.verdict.ok)).toEqual([true, true]);
    const slow = checkSql(SQL, { ...spec, solution: prefix + spec.solution }, prefix + "SELECT COUNT(*) FROM orders WHERE substr(ordered_on, 1, 7) = '2025-03';");
    expect(slow[0].verdict).toMatchObject({ ok: false, reason: 'plan', message: expect.stringMatching(/^結果正確，但查詢計畫仍然全表掃描/) });
  });

  it('checks the plan of a parameterized query too, after every parameter set gives the right rows (F.1d)', () => {
    const prefix = 'CREATE INDEX idx_orders_customer ON orders(customer_id); ';
    const spec: SqlCheckSpec = { solution: `${prefix}SELECT COUNT(*) FROM orders WHERE customer_id = ?;`, ordered: true,
      checks: [{ dataset: 'sales' }, { dataset: 'sales-b', hidden: true }], plan: { maxFullScans: 0 },
      paramSets: [{ label: '顧客 7', values: [7] }, { label: '顧客 42', values: [42], hidden: true }] };
    expect(checkSql(SQL, spec, spec.solution).map(o => o.verdict.ok)).toEqual([true, true]);
    const slow = checkSql(SQL, spec, `${prefix}SELECT COUNT(*) FROM orders WHERE customer_id + 0 = ?;`);
    expect(slow[0].verdict).toMatchObject({ ok: false, reason: 'plan', message: expect.stringMatching(/^結果正確，但查詢計畫仍然全表掃描/) });
  });
});

describe('sales datasets (F.1c)', () => {
  it('are generated the same way every time, with every customer and product used', () => {
    const counts = (d: 'sales' | 'sales-b') => { const db = openDataset(SQL, d); try {
      return lastTable(runSql(db, 'SELECT (SELECT COUNT(*) FROM customers), (SELECT COUNT(*) FROM products), (SELECT COUNT(*) FROM orders), (SELECT COUNT(DISTINCT customer_id) FROM orders), (SELECT COUNT(DISTINCT product_id) FROM orders), (SELECT MIN(ordered_on) || \'..\' || MAX(ordered_on) FROM orders)'))!.rows[0];
    } finally { db.close(); } };
    expect(counts('sales')).toEqual([2000, 200, 30000, 2000, 200, '2025-01-01..2026-10-02']);
    expect(counts('sales-b')).toEqual([1500, 150, 24000, 1500, 150, expect.stringMatching(/^2024-06-0\d\.\.2026-0[23]-\d\d$/)]);
    expect(counts('sales')).toEqual(counts('sales'));
    const db = openDataset(SQL, 'sales');
    try { expect(lastTable(runSql(db, "SELECT name FROM sqlite_schema WHERE type = 'index'"))!.rows).toEqual([]); } finally { db.close(); }
  });
});
