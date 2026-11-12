import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { openDataset } from '../src/lib/sql/engine';
import { batchedSql, runStrategy, type SequenceStrategy } from '../src/lib/sql/sequence';

// Phase F.1d: the round-trip sequences behind DB16 (N+1, JOIN, batched IN), run on the real SQLite build.
let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });
const run = (s: SequenceStrategy) => { const db = openDataset(SQL, 'shop'); try { return runStrategy(db, s); } finally { db.close(); } };
const customers = { sql: "SELECT id, name FROM customers WHERE city = '台北' ORDER BY id" };

describe('round-trip sequences (F.1d)', () => {
  it('N+1: one query for the list, then one per row', () => {
    const r = run({ label: 'N+1', note: '', first: customers, then: { sql: 'SELECT id, product_id FROM orders WHERE customer_id = ? ORDER BY id', column: 'id', mode: 'per-row' } });
    expect(r.trips.map(t => t.params)).toEqual([[], [1], [3]]);
    expect(r.trips.map(t => 'error' in t.result ? -1 : t.result.rows.length)).toEqual([2, 3, 2]);
    expect(r.rows).toBe(7);
  });

  it('a JOIN gets the same orders in one round trip; a batched IN in two', () => {
    const join = run({ label: 'JOIN', note: '', first: { sql: "SELECT c.id, o.id FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.city = ? ORDER BY o.id", params: ['台北'] } });
    expect([join.trips.length, join.rows]).toEqual([1, 5]);
    const batched = run({ label: 'IN', note: '', first: customers, then: { sql: 'SELECT id FROM orders WHERE customer_id IN (?) ORDER BY id', column: 'id', mode: 'batched' } });
    expect(batched.trips.map(t => [t.sql.includes('(?, ?)'), t.params])).toEqual([[false, []], [true, [1, 3]]]);
    expect(batched.rows).toBe(2 + 5);
    expect(batchedSql('… IN (?)', 3)).toBe('… IN (?, ?, ?)');
  });

  it('reports a wrong follow-up instead of failing silently', () => {
    const r = run({ label: 'x', note: '', first: customers, then: { sql: 'SELECT 1', column: 'customer', mode: 'per-row' } });
    expect(r.trips.at(-1)!.result).toEqual({ error: '第一個查詢沒有 customer 欄位' });
  });
});
