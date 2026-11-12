import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { DATASETS, DATASET_IDS } from '../src/lib/sql/datasets';
import { SQL_LIMITS, checkSql, compareTables, crashStates, lastTable, openDataset, probeOutcomes, runSql, type SqlCheckSpec, type SqlTable } from '../src/lib/sql/engine';

// Phase F.1a: the SQL engine (src/lib/sql/engine.ts) on the real SQLite build the playground runs, here in Node.
let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });
const run = (sql: string, dataset: 'school' | 'shop' | 'company' | 'empty' | 'registrar' = 'school') => { const db = openDataset(SQL, dataset); try { return runSql(db, sql); } finally { db.close(); } };
const table = (sql: string, dataset: 'school' | 'shop' | 'company' | 'empty' | 'registrar' = 'school') => lastTable(run(sql, dataset))!;

describe('datasets (F.1a)', () => {
  it('load the rows they describe, and the variants keep the same tables', () => {
    const count = (dataset: (typeof DATASET_IDS)[number], t: string) => { const db = openDataset(SQL, dataset); try { return lastTable(runSql(db, `SELECT COUNT(*) FROM ${t}`))!.rows[0][0]; } finally { db.close(); } };
    expect(['students', 'courses', 'enrollments'].map(t => count('school', t))).toEqual([8, 5, 14]);
    expect(['customers', 'products', 'orders'].map(t => count('shop', t))).toEqual([5, 5, 8]);
    for (const id of DATASET_IDS) for (const t of DATASETS[id].tables) expect(Number(count(id, t.name)), `${id}.${t.name}`).toBeGreaterThan(0);
    expect(DATASETS['school-b'].tables).toBe(DATASETS.school.tables);
    expect(DATASETS['shop-b'].tables).toBe(DATASETS.shop.tables);
    expect(DATASETS['company-b'].tables).toBe(DATASETS.company.tables);
    expect(['departments', 'employees'].map(t => count('company', t))).toEqual([4, 12]);
    // F.1b: the empty database has no table at all; the learner creates them.
    expect(DATASETS.empty.tables).toEqual([]);
    expect(table("SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table'", 'empty').rows).toEqual([[0]]);
    expect(DATASETS['registrar-b'].tables).toBe(DATASETS.registrar.tables);
  });

  it('registrar (F.1b): the anomalies DB10 finds with SQL', () => {
    const offices = 'SELECT major FROM course_records GROUP BY major HAVING COUNT(DISTINCT major_office) > 1 ORDER BY major';
    const regB = (sql: string) => { const db = openDataset(SQL, 'registrar-b'); try { return lastTable(runSql(db, sql))!.rows; } finally { db.close(); } };
    expect(table(offices, 'registrar').rows).toEqual([['資訊工程']]);
    expect(regB(offices)).toEqual([['資訊管理'], ['電機工程']]);
    expect(regB('SELECT course_id FROM course_records GROUP BY course_id HAVING COUNT(DISTINCT course_title) > 1')).toEqual([['PH101']]);
    expect(table('SELECT COUNT(*), COUNT(DISTINCT student_id), COUNT(DISTINCT course_id) FROM course_records', 'registrar').rows).toEqual([[9, 5, 3]]);
  });

  it('company (F.1b): salary ties, a department without staff, a four-level hierarchy', () => {
    expect(table('SELECT dept_id, salary, COUNT(*) FROM employees GROUP BY dept_id, salary HAVING COUNT(*) > 1 ORDER BY dept_id', 'company').rows).toEqual([[1, 72000, 2], [2, 61000, 2]]);
    expect(table('SELECT d.name FROM departments d LEFT JOIN employees e ON e.dept_id = d.id WHERE e.id IS NULL', 'company').rows).toEqual([['法務部']]);
    expect(table(`WITH RECURSIVE chain(id, depth) AS (SELECT id, 1 FROM employees WHERE manager_id IS NULL
      UNION ALL SELECT e.id, depth + 1 FROM employees e JOIN chain c ON e.manager_id = c.id) SELECT MAX(depth), COUNT(*) FROM chain`, 'company').rows).toEqual([[4, 12]]);
    expect(run('SELECT ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC, id) FROM employees', 'company').ok).toBe(true);
  });

  it('keep the edge cases the lessons rely on', () => {
    expect(table("SELECT name FROM students WHERE email IS NULL ORDER BY id").rows).toEqual([['陳志豪'], ['黃雅婷']]);
    expect(table('SELECT COUNT(*), COUNT(score) FROM enrollments').rows).toEqual([[14, 12]]);
    expect(table('SELECT s.name FROM students s LEFT JOIN enrollments e ON e.student_id = s.id WHERE e.student_id IS NULL').rows).toEqual([['蔡宜蓁']]);
    expect(table('SELECT c.id FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id WHERE e.course_id IS NULL').rows).toEqual([['AR101']]);
    expect(table('SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL', 'shop').rows).toEqual([['李淑芬']]);
    expect(table('SELECT p.name FROM products p LEFT JOIN orders o ON o.product_id = p.id WHERE o.id IS NULL', 'shop').rows).toEqual([['筆電支架']]);
  });
});

describe('running SQL (F.1a)', () => {
  it('runs SELECT with WHERE, ORDER BY and JOIN', () => {
    expect(table("SELECT name, grade FROM students WHERE class = '甲' ORDER BY grade DESC, id")).toEqual({ columns: ['name', 'grade'], rows: [['張家豪', 11], ['王小明', 10], ['李佳穎', 10]], truncated: false });
    expect(table(`SELECT s.name, c.title, e.score FROM enrollments e JOIN students s ON s.id = e.student_id
      JOIN courses c ON c.id = e.course_id WHERE e.score >= 90 ORDER BY e.score DESC`).rows).toEqual([['黃雅婷', '資料庫概論', 95], ['王小明', '程式設計', 92], ['林怡君', '資料結構', 90]]);
  });

  it('keeps the columns of an empty result', () => {
    expect(table('SELECT id, name FROM students WHERE grade > 12')).toEqual({ columns: ['id', 'name'], rows: [], truncated: false });
  });

  it('reports SQLite errors with a hint, and stops at the first one', () => {
    const syntax = run('SELEC name FROM students');
    expect(syntax).toMatchObject({ ok: false, error: expect.stringMatching(/syntax error/) });
    expect(syntax.ok || syntax.hint).toMatch(/語法錯誤/);
    expect(run('SELECT nme FROM students')).toMatchObject({ ok: false, error: 'no such column: nme', hint: expect.stringMatching(/找不到這個欄位/) });
    expect(run('SELECT * FROM student')).toMatchObject({ ok: false, hint: expect.stringMatching(/找不到這張表/) });
    expect(run('SELECT id FROM students JOIN courses')).toMatchObject({ ok: false, hint: expect.stringMatching(/歧義/) });
    expect(run('SELECT class FROM students WHERE COUNT(*) > 1 GROUP BY class')).toMatchObject({ ok: false, hint: expect.stringMatching(/HAVING/) });
    expect(run('SELECT 1; SELECT * FROM nowhere; SELECT 2')).toMatchObject({ ok: false, error: 'no such table: nowhere' });
    expect(run('   ')).toMatchObject({ ok: false, error: 'empty' });
  });

  it('keeps changes within one session until reset, and a fresh dataset is always the same', () => {
    const db = openDataset(SQL, 'school');
    expect(runSql(db, "INSERT INTO students VALUES (9, '新同學', '甲', 10, NULL)")).toMatchObject({ ok: true, changes: 1 });
    expect(lastTable(runSql(db, 'SELECT COUNT(*) FROM students'))!.rows).toEqual([[9]]);
    expect(lastTable(runSql(db, 'SELECT COUNT(*) FROM students'))!.rows).toEqual([[9]]);
    // DDL changes no row (getRowsModified would still say 1 from the INSERT).
    expect(runSql(db, 'CREATE INDEX students_by_class ON students(class); SELECT COUNT(*) FROM students')).toMatchObject({ ok: true, changes: 0 });
    expect(runSql(db, "UPDATE enrollments SET score = score + 1 WHERE course_id = 'CS101'")).toMatchObject({ ok: true, changes: 4 });
    db.close();
    expect(run('CREATE INDEX i ON enrollments(score)')).toMatchObject({ ok: true, changes: 0 });
    expect(table('SELECT COUNT(*) FROM students').rows).toEqual([[8]]);
    expect(run('SELECT * FROM enrollments ORDER BY student_id, course_id')).toEqual(run('SELECT * FROM enrollments ORDER BY student_id, course_id'));
  });

  it('enforces keys and foreign keys', () => {
    expect(run("INSERT INTO students VALUES (1, '重複', '甲', 10, NULL)")).toMatchObject({ ok: false, hint: expect.stringMatching(/唯一性/) });
    expect(run("INSERT INTO enrollments VALUES (99, 'CS101', 80)")).toMatchObject({ ok: false, hint: expect.stringMatching(/參考完整性/) });
    expect(run("DELETE FROM students WHERE id = 1")).toMatchObject({ ok: false, hint: expect.stringMatching(/參考完整性/) });
  });

  it('limits rows, statements, length and data size', () => {
    const endless = run('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT x FROM n');
    expect(endless.ok && endless.results[0]).toMatchObject({ truncated: true });
    expect(endless.ok && endless.results[0].rows).toHaveLength(SQL_LIMITS.maxRows);
    expect(run('SELECT 1;'.repeat(SQL_LIMITS.maxStatements + 1))).toMatchObject({ ok: false, error: 'too many statements' });
    expect(run(`SELECT '${'x'.repeat(SQL_LIMITS.maxLength)}'`)).toMatchObject({ ok: false, error: 'too long' });
    expect(run(`CREATE TABLE big(b); WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 20000)
      INSERT INTO big SELECT zeroblob(4000) FROM n`)).toMatchObject({ ok: false, hint: expect.stringMatching(/上限/) });
  });
});

describe('comparing results (F.1a)', () => {
  const t = (rows: SqlTable['rows'], columns = ['a', 'b']): SqlTable => ({ columns, rows });
  it('compares by value and, when asked, by order and column names', () => {
    expect(compareTables(t([[1, 'x'], [2, 'y']]), t([[2, 'y'], [1, 'x']]), { ordered: false })).toEqual({ ok: true });
    expect(compareTables(t([[1, 'x'], [2, 'y']]), t([[2, 'y'], [1, 'x']]), { ordered: true })).toMatchObject({ ok: false, reason: 'order' });
    expect(compareTables(t([[85, null]]), t([[85.0, null]]), { ordered: true })).toEqual({ ok: true });
    expect(compareTables(t([[80.3333333333]]), t([[80.33333333334]]), { ordered: true })).toEqual({ ok: true });
    expect(compareTables(t([[null]]), t([[0]]), { ordered: true })).toMatchObject({ ok: false, reason: 'rows' });
    expect(compareTables(t([[1]], ['x']), t([[1]], ['y']), { ordered: true })).toEqual({ ok: true });
    expect(compareTables(t([[1]], ['x']), t([[1]], ['y']), { ordered: true, columnNames: true })).toMatchObject({ ok: false, reason: 'columns' });
    expect(compareTables(t([[1, 2]]), t([[1]], ['a']), { ordered: true })).toMatchObject({ ok: false, reason: 'columns' });
    expect(compareTables(t([[1, 2]]), t([[1, 2], [3, 4]]), { ordered: false })).toMatchObject({ ok: false, reason: 'row-count' });
  });

  it('accepts any query with the right result, on the visible and the hidden data', () => {
    const spec = { solution: "SELECT name FROM students WHERE grade = 10 AND email IS NOT NULL", ordered: false,
      checks: [{ dataset: 'school' as const }, { dataset: 'school-b' as const, hidden: true }] };
    for (const sql of [spec.solution, "SELECT s.name FROM students AS s WHERE NOT (s.grade <> 10 OR s.email IS NULL);",
      "SELECT name FROM students WHERE grade IN (10) EXCEPT SELECT name FROM students WHERE email IS NULL"])
      expect(checkSql(SQL, spec, sql).map(o => o.verdict.ok), sql).toEqual([true, true]);
    // Hard-coding the visible answer passes the visible data only.
    const cheat = checkSql(SQL, spec, "SELECT name FROM students WHERE id IN (1, 2)");
    expect(cheat.map(o => o.verdict.ok)).toEqual([true, false]);
    expect(cheat[1]).not.toHaveProperty('expected');
    expect(cheat[0].expected?.rows).toEqual([['王小明'], ['李佳穎']]);
    expect(checkSql(SQL, spec, 'SELEC name')[0].verdict).toMatchObject({ ok: false, reason: 'error' });
    expect(checkSql(SQL, spec, "UPDATE students SET grade = 11")[0].verdict).toMatchObject({ ok: false, reason: 'no-result' });
  });

  it('runs each check on a fresh copy, so the learner’s changes cannot help or hurt', () => {
    const spec = { solution: 'SELECT COUNT(*) FROM students', ordered: true, checks: [{ dataset: 'school' as const }] };
    expect(checkSql(SQL, spec, "DELETE FROM enrollments; DELETE FROM students; SELECT COUNT(*) + 8 FROM students")[0].verdict.ok).toBe(true);
    expect(checkSql(SQL, spec, 'SELECT COUNT(*) FROM students')[0].verdict.ok).toBe(true);
  });
});

describe('checking by probes (F.1b)', () => {
  const ddl: SqlCheckSpec = {
    solution: 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, price INTEGER NOT NULL CHECK (price > 0));',
    ordered: false, checks: [{ dataset: 'empty' }, { dataset: 'empty', hidden: true }],
    probes: [
      { label: '一筆正常的商品', sql: "INSERT INTO items VALUES (1, '筆', 20)" },
      { label: '價格是負數', sql: "INSERT INTO items VALUES (2, '橡皮擦', -5)" },
      { label: '商品數量', sql: 'SELECT COUNT(*) FROM items' },
      { label: '名稱重複', sql: "INSERT INTO items VALUES (3, '筆', 30)", hidden: true },
    ],
  };
  const verdicts = (spec: SqlCheckSpec, sql: string) => checkSql(SQL, spec, sql).map(o => o.verdict.ok);

  it('records what each probe does after the SQL: a table, accepted or rejected', () => {
    const { run: r, outcomes } = probeOutcomes(SQL, 'empty', ddl.solution, ddl.probes!);
    expect(r.ok).toBe(true);
    expect(outcomes.map(o => o.kind)).toEqual(['accepted', 'rejected', 'table', 'rejected']);
    expect(outcomes[1]).toMatchObject({ error: expect.stringMatching(/CHECK constraint failed/) });
    expect(outcomes[2]).toEqual({ kind: 'table', table: { columns: ['COUNT(*)'], rows: [[1]] } });
  });

  it('accepts any definition that behaves the same, and runs hidden probes on hidden checks only', () => {
    expect(verdicts(ddl, ddl.solution)).toEqual([true, true]);
    expect(verdicts(ddl, `CREATE TABLE items (
      id INTEGER NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL,
      PRIMARY KEY (id), UNIQUE (name), CONSTRAINT positive CHECK (price >= 1));`)).toEqual([true, true]);
    // No CHECK: the negative price is accepted, and the count differs too.
    const noCheck = checkSql(SQL, ddl, 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, price INTEGER NOT NULL)');
    expect(noCheck.map(o => o.verdict.ok)).toEqual([false, false]);
    expect(noCheck[0].verdict).toMatchObject({ message: expect.stringMatching(/「價格是負數」應該被拒絕/) });
    expect(noCheck[0].probe).toMatchObject({ label: '價格是負數', expected: { kind: 'rejected' }, actual: { kind: 'accepted' } });
    // Only the hidden probe tells this one apart, and its message names no probe.
    const noUnique = checkSql(SQL, ddl, 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK (price > 0))');
    expect(noUnique.map(o => o.verdict.ok)).toEqual([true, false]);
    expect(noUnique[1].verdict).toMatchObject({ message: expect.stringMatching(/^一個隱藏的檢查敘述應該被拒絕/) });
    expect(noUnique[1]).not.toHaveProperty('probe');
    // The learner's own SQL failing is reported as such; a missing table makes the first probe fail.
    expect(checkSql(SQL, ddl, 'CREATE TABL items (id)')[0].verdict).toMatchObject({ ok: false, reason: 'error' });
    expect(checkSql(SQL, ddl, 'CREATE TABLE things (id INTEGER)')[0].verdict).toMatchObject({ ok: false, message: expect.stringMatching(/應該可以執行，但被拒絕：no such table: items/) });
  });

  it('checks data changes by the table they leave, on every dataset', () => {
    const dml: SqlCheckSpec = { solution: "UPDATE products SET price = price + 100 WHERE category = '配件'", ordered: true,
      checks: [{ dataset: 'shop' }, { dataset: 'shop-b', hidden: true }], probes: [{ label: '更新後的商品', sql: 'SELECT id, price FROM products ORDER BY id' }] };
    expect(verdicts(dml, "UPDATE products SET price = price + 100 WHERE category IN ('配件')")).toEqual([true, true]);
    // Hard-coded ids fit the visible shop only.
    expect(verdicts(dml, 'UPDATE products SET price = price + 100 WHERE id IN (4, 5)')).toEqual([true, false]);
    const wrong = checkSql(SQL, dml, 'UPDATE products SET price = price + 100');
    expect(wrong[0]).toMatchObject({ verdict: { ok: false }, probe: { label: '更新後的商品' }, expected: { columns: ['id', 'price'] } });
  });
});

describe('parameters and crash consistency (F.1d)', () => {
  it('binds parameters to the statement\'s placeholders; a value never changes what the statement means', () => {
    const db = openDataset(SQL, 'shop');
    try {
      expect(lastTable(runSql(db, 'SELECT name FROM customers WHERE city = ? ORDER BY id', ['台北']))!.rows).toEqual([['陳美玲'], ['王雅雯']]);
      // An injection attempt is just a strange city name.
      expect(lastTable(runSql(db, 'SELECT name FROM customers WHERE city = ?', ["x' OR '1'='1"]))!.rows).toEqual([]);
      // Concatenated into the text, the same input rewrites the query.
      expect(lastTable(runSql(db, "SELECT name FROM customers WHERE city = 'x' OR '1'='1'"))!.rows).toHaveLength(5);
      expect(runSql(db, 'SELECT ? + ?', [1])).toMatchObject({ ok: false, error: 'parameter count', hint: expect.stringMatching(/2 個 \?/) });
      expect(lastTable(runSql(db, "SELECT '?' AS q, ? AS v -- why?", [7]))!.rows).toEqual([['?', 7]]);
      expect(lastTable(runSql(db, 'SELECT ? IS NULL', [null]))!.rows).toEqual([[1]]);
    } finally { db.close(); }
  });

  it('checks a query against every parameter set, including hostile ones, with hidden sets on hidden checks', () => {
    const spec: SqlCheckSpec = { solution: 'SELECT id, name FROM customers WHERE city = ?', ordered: false,
      checks: [{ dataset: 'shop' }, { dataset: 'shop-b', hidden: true }],
      paramSets: [{ label: '台北', values: ['台北'] }, { label: "惡意輸入 x' OR '1'='1", values: ["x' OR '1'='1"] }, { label: '新竹', values: ['新竹'], hidden: true }] };
    const ok = (sql: string) => checkSql(SQL, spec, sql).map(o => o.verdict.ok);
    expect(ok(spec.solution)).toEqual([true, true]);
    expect(ok('SELECT c.id, c.name FROM customers AS c WHERE c.city IN (?)')).toEqual([true, true]);
    const fixed = checkSql(SQL, spec, "SELECT id, name FROM customers WHERE city = '台北'");
    expect(fixed[0].verdict).toMatchObject({ ok: false, message: expect.stringMatching(/^參數「惡意輸入/) });
    expect(checkSql(SQL, spec, 'SELECT id, name FROM customers WHERE city = ? OR ? IS NOT NULL')[0].verdict).toMatchObject({ ok: false, reason: 'error' });
    expect(checkSql(SQL, spec, "SELECT id, name FROM customers WHERE city LIKE ? OR city = '新竹'").map(o => o.verdict.ok)).toEqual([true, false]);
  });

  it('crash consistency: changes inside one transaction pass; the same changes as autocommit statements do not', () => {
    const setup = 'CREATE TABLE a (id INTEGER PRIMARY KEY, bal INTEGER NOT NULL); INSERT INTO a VALUES (1, 100), (2, 0);';
    const tx = `${setup} BEGIN; UPDATE a SET bal = bal - 30 WHERE id = 1; UPDATE a SET bal = bal + 30 WHERE id = 2; COMMIT;`;
    const probe = 'SELECT id, bal FROM a ORDER BY id';
    expect(crashStates(SQL, 'empty', tx, probe)).toEqual(['error: no such table', '[]', '[[1,100],[2,0]]', '[[1,70],[2,30]]']);
    expect(crashStates(SQL, 'empty', `${setup} UPDATE a SET bal = bal - 30 WHERE id = 1; UPDATE a SET bal = bal + 30 WHERE id = 2;`, probe)).toContain('[[1,70],[2,0]]');
    const spec: SqlCheckSpec = { solution: tx, ordered: true, checks: [{ dataset: 'empty' }], probes: [{ label: '餘額', sql: probe }], atomic: { probe } };
    expect(checkSql(SQL, spec, tx)[0].verdict.ok).toBe(true);
    expect(checkSql(SQL, spec, `${setup} SAVEPOINT s; UPDATE a SET bal = bal + 30 WHERE id = 2; UPDATE a SET bal = bal - 30 WHERE id = 1; RELEASE s;`)[0].verdict.ok).toBe(true);
    const auto = checkSql(SQL, spec, `${setup} UPDATE a SET bal = bal - 30 WHERE id = 1; UPDATE a SET bal = bal + 30 WHERE id = 2;`);
    expect(auto[0].verdict).toMatchObject({ ok: false, message: expect.stringMatching(/^當機測試/) });
  });
});

describe('auth and documents datasets (F.1d)', () => {
  const rows = (dataset: 'auth' | 'auth-b' | 'documents' | 'documents-b', sql: string) => { const db = openDataset(SQL, dataset); try { return lastTable(runSql(db, sql))!.rows; } finally { db.close(); } };
  it('auth: an admin, an inactive account, a failed login without a user', () => {
    expect(rows('auth', "SELECT username FROM users WHERE role = 'admin' OR active = 0 ORDER BY id")).toEqual([['alice'], ['carol']]);
    expect(rows('auth', 'SELECT COUNT(*) FROM login_log WHERE user_id IS NULL')).toEqual([[1]]);
    expect(rows('auth-b', "SELECT COUNT(*) FROM users WHERE role = 'admin'")).toEqual([[2]]);
  });
  it('documents: JSON documents queried with SQLite\'s JSON functions; a key-value table; a graph walked by a recursive CTE', () => {
    expect(rows('documents', "SELECT id, json_extract(doc, '$.customer.name') FROM orders_doc WHERE json_extract(doc, '$.status') = 'pending' ORDER BY id")).toEqual([[3, '王雅雯'], [6, '陳美玲']]);
    expect(rows('documents', "SELECT SUM(json_extract(i.value, '$.qty') * json_extract(i.value, '$.price')) FROM orders_doc, json_each(orders_doc.doc, '$.items') AS i WHERE orders_doc.id = 1")).toEqual([[4270]]);
    expect(rows('documents', "SELECT json_extract(value, '$.user') FROM sessions_kv WHERE key = 'session:a1'")).toEqual([['alice']]);
    expect(rows('documents', "WITH RECURSIVE reach(u) AS (SELECT 'alice' UNION SELECT followee FROM follows JOIN reach ON follower = u) SELECT COUNT(*) - 1 FROM reach")).toEqual([[6]]);
    expect(rows('documents-b', 'SELECT COUNT(*) FROM orders_doc')).toEqual([[5]]);
  });
});
