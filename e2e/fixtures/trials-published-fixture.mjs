// Shared Trial System browser acceptance (docs/exam-system/22 §4, 27 §10, 28 §8): turns a THROWAWAY COPY of the
// repository into a test build in which every question whose id starts with one of the given prefixes counts as
// published, so those exams' generated mock papers get routes. It never runs on a git checkout: the build it enables
// holds unpublished questions and must only be served on 127.0.0.1 and deleted afterwards.
//
//   node e2e/fixtures/trials-published-fixture.mjs <copy dir> ipas- ccarf-     (e.g. a `git archive HEAD | tar -x` copy)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function applyFixture(dirArg, prefixes) {
  const dir = path.resolve(dirArg ?? '');
  if (!dirArg || existsSync(path.join(dir, '.git'))) {
    console.error('refused: give the directory of a throwaway copy without .git (never the repository itself)');
    process.exit(2);
  }
  if (!prefixes.length || prefixes.some(p => !/^[a-z]+-$/.test(p))) {
    console.error('give one or more question id prefixes, e.g. ipas- ccarf-');
    process.exit(2);
  }
  const file = path.join(dir, 'src/content/trials/index.ts');
  let s = readFileSync(file, 'utf8');
  if (s.includes('E2E FIXTURE')) { console.log('already applied'); process.exit(0); }
  const from = 'const questions = generatedBatches.flatMap(b => b.questions);';
  if (!s.includes(from)) { console.error('index.ts changed: update the fixture'); process.exit(1); }
  const test = `[${prefixes.map(p => `'${p}'`).join(', ')}].some(p => q.id.startsWith(p))`;
  s = s.replace(from, `// E2E FIXTURE (throwaway copy only): every question of ${prefixes.join(' ')} counts as published.
const questions = generatedBatches.flatMap(b => b.questions).map(q => ${test} ? { ...q, review: { ...q.review, status: 'published' as const } } : q);
const fixtureHashes: Record<string, string> = { ...published, ...Object.fromEntries(questions.filter(q => ${test}).map(q => [\`\${q.id}@\${q.currentRevision}\`, revisionHash(currentRevisionOf(q)!)])) };`);
  s = s.replace("import { isPlayable, paperOriginOf, paperStatusOf, withdrawnItems, type ExamPaper, type ExamStatus, type TrialBank } from './schema';", "import { currentRevisionOf, isPlayable, paperOriginOf, paperStatusOf, revisionHash, withdrawnItems, type ExamPaper, type ExamStatus, type TrialBank } from './schema';");
  s = s.replace('new Map(sources.map(s => [s.id, s])), published, conflictPairs(),', 'new Map(sources.map(s => [s.id, s])), fixtureHashes, conflictPairs(),');
  if (!s.includes('fixtureHashes, conflictPairs(),') || !s.includes('revisionHash, withdrawnItems, type ExamPaper')) { console.error('index.ts changed: update the fixture'); process.exit(1); }
  writeFileSync(file, s);
  console.log(`applied to ${path.relative(process.cwd(), file) || file} (${prefixes.join(' ')})`);
}

if (import.meta.url === `file://${process.argv[1]}`) applyFixture(process.argv[2], process.argv.slice(3));
