import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { curriculum, lessons } from '../src/content/curriculum';
import { checkSql, compareTables, lastTable, openDataset, probeOutcomes, runSql, type SqlValue } from '../src/lib/sql/engine';
import { hasCapability, sqlCheckSpec } from '../src/content/curriculum/schema';
import type { DatasetId } from '../src/lib/sql/datasets';

// Phase F.1a: every SQL lesson's examples, presets and exercises, run on the real SQLite build the playground uses.
let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });
const run = (dataset: DatasetId, sql: string, params?: SqlValue[]) => { const db = openDataset(SQL, dataset); try { return runSql(db, sql, params); } finally { db.close(); } };

const sqlLessons = lessons.filter(l => hasCapability(l, 'sql'));

describe('SQL lessons (F.1a, F.1b)', () => {
  it('exist and have SQL content', () => {
    expect(sqlLessons.length).toBeGreaterThan(0);
    for (const l of sqlLessons) expect(curriculum.contents[l.lessonId]?.sql, l.lessonId).toBeDefined();
  });

  for (const lesson of sqlLessons) {
    describe(`${lesson.lessonId} sql`, () => {
      const content = () => curriculum.contents[lesson.lessonId]!.sql!;

      it('examples give exactly the results the page shows', () => {
        for (const example of content().examples) {
          const result = run(example.dataset, example.sql);
          expect(result.ok ? 'ok' : result.error, example.id).toBe('ok');
          const table = lastTable(result)!;
          expect(table, example.id).toBeDefined();
          expect(table.truncated, example.id).toBe(false);
          expect({ columns: table.columns, rows: table.rows }, example.id).toEqual(example.result);
        }
      });

      it('presets run without errors', () => {
        for (const preset of content().presets) {
          const result = run(content().dataset, preset.sql);
          expect(result.ok ? 'ok' : `${result.error}`, preset.label).toBe('ok');
        }
      });

      it('exercises: the solution and every alternative pass, every typical mistake fails, hidden data tells them apart', () => {
        for (const exercise of content().exercises) {
          const s = sqlCheckSpec(exercise);
          for (const sql of [exercise.solution, ...exercise.alternatives])
            expect(checkSql(SQL, s, sql).map(o => o.verdict.ok ? 'pass' : o.verdict.message), `${exercise.id}: ${sql}`).toEqual(s.checks.map(() => 'pass'));
          for (const mistake of exercise.mistakes)
            expect(checkSql(SQL, s, mistake.sql).some(o => !o.verdict.ok), `${exercise.id} mistake should fail: ${mistake.sql}`).toBe(true);
          if (exercise.probes) {
            // F.1b: hidden probes, or hidden data that changes what the probes see, so copying visible outcomes fails.
            const visible = probeOutcomes(SQL, exercise.dataset, exercise.solution, exercise.probes.filter(p => !p.hidden)).outcomes;
            const differs = exercise.hidden.some(d => JSON.stringify(probeOutcomes(SQL, d, exercise.solution, exercise.probes!.filter(p => !p.hidden)).outcomes) !== JSON.stringify(visible));
            expect(differs || exercise.probes.some(p => p.hidden), exercise.id).toBe(true);
            continue;
          }
          // F.1d: an exercise with parameter sets is run with its first visible set, as the visible check does.
          const params = exercise.paramSets?.find(p => !p.hidden)?.values;
          const visible = lastTable(run(exercise.dataset, exercise.solution, params))!;
          expect(visible.rows.length, `${exercise.id} visible result`).toBeGreaterThan(0);
          // A hidden dataset (or a hidden parameter set) must change the answer, or copying the visible rows would pass.
          const differs = (t: ReturnType<typeof lastTable>) => !compareTables(t!, visible, { ordered: exercise.ordered }).ok;
          expect(exercise.hidden.some(d => differs(lastTable(run(d, exercise.solution, params))))
            || !!exercise.paramSets?.some(p => p.hidden && differs(lastTable(run(exercise.dataset, exercise.solution, p.values)))), exercise.id).toBe(true);
        }
        // F.1d: lessons on `sales` rebuild its 30,000 orders for every check (DB12 takes about 4 s alone), so allow for a busy machine.
      }, 30_000);
    });
  }
});
