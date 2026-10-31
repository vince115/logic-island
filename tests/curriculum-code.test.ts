import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Language } from '../src/content/courses';
import { curriculum } from '../src/content/curriculum';

/*
 * Phase E.1: every code example and every exercise reference solution of the complete lessons runs, as
 * tests/examples.test.ts does for the six labs: Python 3, C++17 (g++), and Java when a JDK is installed (otherwise
 * those cases are skipped and reported as Not Executed). Exercise solutions run against every test case.
 */
const javaAvailable = spawnSync('javac', ['-version']).status === 0;
const compiled = new Map<string, string>();

/** Runs one program with `stdin` and returns its trimmed standard output. */
function run(language: Language, code: string, stdin = ''): string {
  if (language === 'Python') return execFileSync('python3', ['-c', code], { input: stdin, encoding: 'utf8' }).trim();
  const key = `${language}\n${code}`;
  if (!compiled.has(key)) {
    const dir = mkdtempSync(join(tmpdir(), `logic-island-${language === 'C++' ? 'cpp' : 'java'}-`));
    if (language === 'C++') {
      writeFileSync(join(dir, 'main.cpp'), code);
      execFileSync('g++', ['-std=c++17', '-Wall', '-Werror', join(dir, 'main.cpp'), '-o', join(dir, 'main')]);
    } else {
      writeFileSync(join(dir, 'Main.java'), code);
      execFileSync('javac', [join(dir, 'Main.java')]);
    }
    compiled.set(key, dir);
  }
  const dir = compiled.get(key)!;
  return (language === 'C++'
    ? execFileSync(join(dir, 'main'), { input: stdin, encoding: 'utf8' })
    : execFileSync('java', ['-cp', dir, 'Main'], { input: stdin, encoding: 'utf8' })).trim();
}
const runs = (language: Language) => language === 'Java' ? it.skipIf(!javaAvailable) : it;

for (const [id, content] of Object.entries(curriculum.contents)) describe(`${id} code (E.1)`, () => {
  for (const language of ['Python', 'C++', 'Java'] as const) {
    for (const example of content!.examples) runs(language)(`${language} example ${example.id}`, () => {
      expect(run(language, example.code[language], example.stdin)).toBe((example.outputByLanguage?.[language] ?? example.output).trim());
    }, 30_000);
    for (const exercise of content!.exercises) runs(language)(`${language} exercise ${exercise.id}: ${exercise.tests.length} tests and the samples`, () => {
      for (const test of [...exercise.samples, ...exercise.tests]) expect(run(language, exercise.solution[language], test.input), `${test.kind}: ${test.input}`).toBe(test.output.trim());
    }, 60_000);
    // Starter code must at least compile (it reads the input and leaves the rest to the learner).
    for (const exercise of content!.exercises.filter(e => e.starter)) runs(language)(`${language} exercise ${exercise.id} starter runs`, () => {
      expect(() => run(language, exercise.starter![language], exercise.samples[0].input)).not.toThrow();
    }, 30_000);
  }
});
