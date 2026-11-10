import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { curriculum, getLessonById } from '../src/content/curriculum';
import { hasCapability, type LessonLanguage } from '../src/content/curriculum/schema';
import { COMPILE_TIMEOUT_MS, runProcess } from './support/run-program';

/*
 * Phase E.1: every code example and every exercise reference solution of the complete lessons runs, as
 * tests/examples.test.ts does for the six labs: Python 3, C++17 (g++), and Java 17 when a JDK is on PATH (otherwise
 * those cases are skipped and reported as Not Executed; e.g. PATH="<JDK>/bin:$PATH"). Exercise solutions run against
 * every test case. 2026-11-02: JavaScript runs on Node.js (the runtime of these tests) for the lessons that offer it.
 */
const javaAvailable = spawnSync('javac', ['-version']).status === 0;
const compiled = new Map<string, string>();

/**
 * Runs one program with `stdin` and returns its standard output without trailing whitespace (leading spaces count).
 * Phase F.1c: through runProcess (tests/support/run-program.ts): explicit stdin, captured stderr, a timeout that kills
 * the child.
 */
function run(language: LessonLanguage, code: string, stdin = ''): string {
  if (language === 'Python') return runProcess('python3', ['-c', code], stdin).stdout.trimEnd();
  if (language === 'JavaScript') return runProcess(process.execPath, ['-e', code], stdin).stdout.trimEnd();
  const key = `${language}\n${code}`;
  if (!compiled.has(key)) {
    const dir = mkdtempSync(join(tmpdir(), `logic-island-${language === 'C++' ? 'cpp' : 'java'}-`));
    if (language === 'C++') {
      writeFileSync(join(dir, 'main.cpp'), code);
      runProcess('g++', ['-std=c++17', '-Wall', '-Werror', join(dir, 'main.cpp'), '-o', join(dir, 'main')], '', COMPILE_TIMEOUT_MS);
    } else {
      writeFileSync(join(dir, 'Main.java'), code);
      // --release 17: the lessons promise Java 17 and later, so a newer JDK must not accept newer APIs.
      runProcess('javac', ['--release', '17', join(dir, 'Main.java')], '', COMPILE_TIMEOUT_MS);
    }
    compiled.set(key, dir);
  }
  const dir = compiled.get(key)!;
  return (language === 'C++' ? runProcess(join(dir, 'main'), [], stdin) : runProcess('java', ['-cp', dir, 'Main'], stdin)).stdout.trimEnd();
}
const runs = (language: LessonLanguage) => language === 'Java' ? it.skipIf(!javaAvailable) : it;

// Phase F.1b: only lessons declaring program-code have programs; SQL runs in tests/curriculum-sql.test.ts, ER and
// normalization answers in tests/curriculum-db.test.ts.
for (const [id, content] of Object.entries(curriculum.contents).filter(([id]) => hasCapability(getLessonById(id)!, 'program-code'))) describe(`${id} code (E.1)`, () => {
  for (const language of getLessonById(id)!.supportedLanguages) {
    for (const example of content!.examples) runs(language)(`${language} example ${example.id}`, () => {
      expect(run(language, example.code[language]!, example.stdin)).toBe((example.outputByLanguage?.[language] ?? example.output).trimEnd());
    }, 30_000);
    for (const exercise of content!.exercises) runs(language)(`${language} exercise ${exercise.id}: ${exercise.tests.length} tests and the samples`, () => {
      for (const test of [...exercise.samples, ...exercise.tests]) expect(run(language, exercise.solution[language]!, test.input), `${test.kind}: ${test.input}`).toBe(test.output.trimEnd());
    }, 60_000);
    // Starter code must at least compile (it reads the input and leaves the rest to the learner).
    for (const exercise of content!.exercises.filter(e => e.starter)) runs(language)(`${language} exercise ${exercise.id} starter runs`, () => {
      expect(() => run(language, exercise.starter![language]!, exercise.samples[0].input)).not.toThrow();
    }, 30_000);
  }
});
