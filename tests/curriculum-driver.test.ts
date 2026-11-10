import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { curriculum, lessons } from '../src/content/curriculum';
import { hasCapability } from '../src/content/curriculum/schema';
import { COMPILE_TIMEOUT_MS, runProcess } from './support/run-program';

/*
 * Phase F.1d: the driver code of the database lessons (driver-code capability). Python (sqlite3, standard library) and
 * JavaScript (node:sqlite, built into Node) run and must print exactly the lesson's output; Java (JDBC, java.sql in
 * the JDK) is compiled, since running it needs a SQLite JDBC driver the project does not ship.
 */
const javac = (() => { const r = spawnSync('javac', ['-version']); return r.status === 0; })();
const nodeSqlite = (() => { try { return !!process.getBuiltinModule?.('node:sqlite'); } catch { return false; } })();
const driverLessons = lessons.filter(l => hasCapability(l, 'driver-code'));

describe('database driver code (F.1d)', () => {
  it('lessons with driver code exist once DB16 is written', () => {
    for (const l of driverLessons) expect(curriculum.contents[l.lessonId]?.driverCode?.examples.length, l.lessonId).toBeGreaterThan(0);
  });
  for (const lesson of driverLessons) for (const example of curriculum.contents[lesson.lessonId]!.driverCode!.examples) {
    const { Python, JavaScript, Java } = example.code;
    if (Python) it(`${lesson.lessonId} ${example.id} Python`, () => {
      expect(runProcess('python3', ['-c', Python]).stdout.trimEnd()).toBe(example.output.trimEnd());
    });
    if (JavaScript) it.skipIf(!nodeSqlite)(`${lesson.lessonId} ${example.id} JavaScript`, () => {
      expect(runProcess(process.execPath, ['--no-warnings', '-e', JavaScript]).stdout.trimEnd()).toBe(example.output.trimEnd());
    });
    if (Java) it.skipIf(!javac)(`${lesson.lessonId} ${example.id} Java compiles`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'logic-island-jdbc-'));
      writeFileSync(join(dir, 'Main.java'), Java);
      runProcess('javac', ['--release', '17', join(dir, 'Main.java')], '', COMPILE_TIMEOUT_MS);
    }, COMPILE_TIMEOUT_MS);
  }
});
