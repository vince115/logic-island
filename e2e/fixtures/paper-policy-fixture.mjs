// Shared Trial System T.3H browser acceptance (docs/exam-system/32 §6, §10): in a THROWAWAY COPY, the paper policy as a
// human might apply it — the MOEX official original loses one question (moex-114-pukao-3448-q05 counts as withdrawn),
// an adapted practice paper without it is added under its own id, and the bank paper is retired. Combine it with the
// other fixtures in the same copy if wanted; serve the build on 127.0.0.1 only and delete the copy afterwards.
//
//   node e2e/fixtures/paper-policy-fixture.mjs <copy dir>      (e.g. a `git archive HEAD | tar -x` copy)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WITHDRAWN = 'moex-114-pukao-3448-q05', ADAPTED = 'moex-114-pukao-3448-adapted-e2e', RETIRED = 'bank-it-mock-a';

const dirArg = process.argv[2], dir = path.resolve(dirArg ?? '');
if (!dirArg || existsSync(path.join(dir, '.git'))) {
  console.error('refused: give the directory of a throwaway copy without .git (never the repository itself)');
  process.exit(2);
}
const indexFile = path.join(dir, 'src/content/trials/index.ts'), papersFile = path.join(dir, 'src/content/trials/papers.ts');
let index = readFileSync(indexFile, 'utf8'), papers = readFileSync(papersFile, 'utf8');
if (index.includes('E2E PAPER POLICY FIXTURE')) { console.log('already applied'); process.exit(0); }
const anchor = 'export const trialBank: TrialBank = {', retiredAt = `{ id: '${RETIRED}', kind: 'fixed',`;
if (!index.includes(anchor) || !/\nconst questions = /.test(index) || !papers.includes(retiredAt) || !papers.trimEnd().endsWith('];')) {
  console.error('index.ts or papers.ts changed: update the fixture');
  process.exit(1);
}
index = index.replace(anchor, `// E2E PAPER POLICY FIXTURE (throwaway copy only): ${WITHDRAWN} counts as withdrawn (revoked).
for (const [i, q] of questions.entries()) if (q.id === '${WITHDRAWN}') questions[i] = { ...q, review: { ...q.review, status: 'revoked' } };
${anchor}`);
papers = papers.replace(retiredAt, `${retiredAt} retired: { since: '2026-12-20', reason: 'E2E 測試：改版為新試卷' },`) + `
// E2E PAPER POLICY FIXTURE (throwaway copy only): an adapted practice paper without the withdrawn question.
const moex = papers.find(p => p.id === 'moex-114-pukao-3448')!;
papers.push({ ...moex, id: '${ADAPTED}', title: '114 年普考《計算機概要》改編練習卷（E2E）', version: '1.0.0',
  description: '改編自 114 年普考《計算機概要》試題，缺 1 題（已撤回），共 39 題；不是完整的官方原卷。',
  note: '缺 1 題，總分 97.5 分；不設及格線。', adaptedFrom: { paperId: moex.id, version: moex.version },
  items: moex.items.filter(i => i.questionId !== '${WITHDRAWN}') });
`;
writeFileSync(indexFile, index);
writeFileSync(papersFile, papers);
console.log(`applied to ${dir} (${WITHDRAWN} withdrawn, ${ADAPTED} added, ${RETIRED} retired)`);
