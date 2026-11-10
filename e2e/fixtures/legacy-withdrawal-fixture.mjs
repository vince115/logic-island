// Shared Trial System T.3G browser acceptance (docs/exam-system/31 §11): in a THROWAWAY COPY, one question published
// before T.2C (orig-apcs-read-03, an item of the APCS fixed paper) counts as withdrawn — as a withdrawal recorded in the
// ledger and the rebuild would leave it — so the paper is under maintenance. Combine it with the published fixtures in
// the same copy if wanted; serve the build on 127.0.0.1 only and delete the copy afterwards.
//
//   node e2e/fixtures/legacy-withdrawal-fixture.mjs <copy dir>      (e.g. a `git archive HEAD | tar -x` copy)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WITHDRAWN = 'orig-apcs-read-03';

const dirArg = process.argv[2], dir = path.resolve(dirArg ?? '');
if (!dirArg || existsSync(path.join(dir, '.git'))) {
  console.error('refused: give the directory of a throwaway copy without .git (never the repository itself)');
  process.exit(2);
}
const file = path.join(dir, 'src/content/trials/index.ts');
let s = readFileSync(file, 'utf8');
if (s.includes('E2E WITHDRAWAL FIXTURE')) { console.log('already applied'); process.exit(0); }
const anchor = 'export const trialBank: TrialBank = {';
if (!s.includes(anchor) || !/\nconst questions = /.test(s)) { console.error('index.ts changed: update the fixture'); process.exit(1); }
s = s.replace(anchor, `// E2E WITHDRAWAL FIXTURE (throwaway copy only): ${WITHDRAWN} counts as withdrawn (revoked).
for (const [i, q] of questions.entries()) if (q.id === '${WITHDRAWN}') questions[i] = { ...q, review: { ...q.review, status: 'revoked' } };
${anchor}`);
writeFileSync(file, s);
console.log(`applied to ${path.relative(process.cwd(), file) || file} (${WITHDRAWN} withdrawn)`);
