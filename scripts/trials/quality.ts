import { writeFileSync } from 'node:fs';
import { tagById, trialBank } from '@/content/trials';
import { conflictPairs } from '@/content/trials/conflicts';
import { mockBlueprints } from '@/content/trials/mock-exams';
import { hasPrivateBank } from '@/content/trials/private-bank';
import { checkLedger, examResolver } from '@/lib/trials/lifecycle';
import { replayLedger } from '@/lib/trials/ledger-replay';
import { bankMetrics, drawMetrics, gateFailures, integrityMetrics, qualityReport } from '@/lib/trials/quality';
import { integrityFailures, verifyManifest } from '@/lib/trials/integrity';
import { readHashes, readLedger, readManifest } from './ledger-io';

/*
 * Shared Trial System T.3D–T.3E (docs/exam-system/28 §6, 29 §10): the quality report and gate of an exam's banks and
 * papers.
 *
 *   pnpm trials:quality --exam ccarf                          report to stdout (1,000 seeds, 1, 2, 3 …)
 *   … --seeds 10000 --report <file.md> --json <file.json>     more seeds; save the report and a machine-readable copy
 *   … --strict-utilization                                    also fail when a question is never drawn or on every paper
 *   … --max-p99-ms 50                                         also fail when the 99th-percentile draw time is over 50 ms
 *
 * Read-only: the bank's current revisions are drawn as if published, in memory; nothing in the bank, the ledger or the
 * published hashes is written. Exit codes: 0 every gate passed; 1 a gate failed (the reasons are printed and in the
 * JSON); 2 usage error.
 *
 * T.3F: the gate also verifies the exam's revisions against the assessment manifest (docs/exam-system/30 §3).
 * T.3G: and the ledger as it concerns the exam: its records, their order and references, and its replay (31 §9).
 */
let exam: string | undefined, seeds = 1000, reportAt: string | undefined, jsonAt: string | undefined, strictUtilization = false, maxP99Ms: number | undefined;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--exam') exam = process.argv[++i];
  else if (a === '--seeds') seeds = Number(process.argv[++i]);
  else if (a === '--report') reportAt = process.argv[++i];
  else if (a === '--json') jsonAt = process.argv[++i];
  else if (a === '--strict-utilization') strictUtilization = true;
  else if (a === '--max-p99-ms') maxP99Ms = Number(process.argv[++i]);
  else { exam = undefined; break; }
}
const blueprints = mockBlueprints.filter(b => b.examId === exam);
if (!blueprints.length || !Number.isInteger(seeds) || seeds < 1 || (maxP99Ms !== undefined && !(maxP99Ms > 0))) {
  console.error(`usage: pnpm trials:quality --exam <${[...new Set(mockBlueprints.map(b => b.examId))].join('|')}> [--seeds <n>] [--report <file.md>] [--json <file.json>] [--strict-utilization] [--max-p99-ms <ms>]`);
  process.exit(2);
}
const examOf = examResolver(trialBank);
const integrity = integrityMetrics(trialBank.questions, readHashes(), readLedger(), examOf, exam);
const mine = trialBank.questions.filter(q => examOf(q) === exam), ids = new Set(mine.map(q => q.id));
// T.3J (docs/exam-system/34): an exam whose questions are all unpublished has none here without the private bank, and
// there is nothing to draw. Said so, in the report too; it is never a pass of the gate (the private bank's own run is).
if (!mine.length && !hasPrivateBank) {
  const skipped = 'not run: every question of this exam is in the private bank, which is not checked out';
  if (jsonAt) writeFileSync(jsonAt, `${JSON.stringify({ format: 'logic-island.trials-quality/1', exam, seeds, passed: null, skipped }, null, 1)}\n`);
  console.log(`quality gate (${exam}): ${skipped}`);
  process.exit(0);
}
const manifest = readManifest();
const assessment = manifest ? verifyManifest(mine, { ...manifest, entries: Object.fromEntries(Object.entries(manifest.entries).filter(([k]) => ids.has(k.slice(0, k.lastIndexOf('@'))))) }) : undefined;
const assessmentFailures = assessment ? integrityFailures(assessment) : ['no assessment manifest: integrity cannot be shown'];
// T.3G: the ledger's records of this exam's questions — sound, in order, and replayed without a refused event.
const ledger = readLedger(), hashes = readHashes();
const replay = replayLedger(ledger, trialBank.questions, hashes, examOf);
const mineLabel = (s: string) => [...ids].some(id => s.includes(`${id} `) || s.includes(`${id}@`) || s.includes(`(${id}`));
const ledgerFailures = [...checkLedger(ledger, trialBank.questions, examOf, hashes), ...replay.violations].filter(mineLabel).map(f => `ledger: ${f}`);
const ledgerSummary = { records: [...ledger.reviews, ...ledger.publications, ...ledger.revocations ?? []].filter(e => ids.has(e.questionId)).length,
  sequenced: [...ledger.reviews, ...ledger.publications, ...ledger.revocations ?? []].filter(e => ids.has(e.questionId) && e.seq !== undefined).length, failures: ledgerFailures };
const results = blueprints.map(bp => {
  const bank = bankMetrics(bp, trialBank.questions, conflictPairs(), tagById);
  const draws = drawMetrics(bp, trialBank.questions, conflictPairs(), tagById, seeds);
  const failures = gateFailures(bp, draws, integrity, { strictUtilization, ...maxP99Ms !== undefined ? { maxP99Ms } : {} });
  return { bp, bank, draws, failures };
});
const failures = [...new Set([...results.flatMap(r => r.failures), ...assessmentFailures, ...ledgerFailures])];
const text = results.map(r => qualityReport(r.bp, r.bank, r.draws, integrity, r.failures)).join('\n');
if (reportAt) writeFileSync(reportAt, text);
if (jsonAt) writeFileSync(jsonAt, JSON.stringify({
  format: 'logic-island.trials-quality/1', exam, seeds, seedRange: [1, seeds], options: { strictUtilization, maxP99Ms: maxP99Ms ?? null },
  passed: !failures.length, failures, integrity, ledger: ledgerSummary, assessment: assessment && { ok: assessment.ok, revisions: assessment.revisions, hashVersions: assessment.hashVersions, mismatched: assessment.mismatched, unrecorded: assessment.unrecorded, missing: assessment.missing },
  blueprints: results.map(r => ({ id: r.bp.id, version: r.bp.version, sampling: r.bp.sampling ?? 'greedy', bank: r.bank, draws: r.draws, failures: r.failures })),
}, null, 1) + '\n');
console.log(text);
console.log(`\n## 評量內容完整性（manifest）\n\n- ${assessment ? `${assessment.revisions} 個版本（舊版雜湊 ${assessment.hashVersions.legacy}、第 2 版 ${assessment.hashVersions.v2}）；${assessment.ok ? '全部與紀錄一致' : `${assessmentFailures.length} 項不一致`}` : '缺少 manifest'}`);
console.log(`\n## 帳本（本考試）\n\n- ${ledgerSummary.records} 筆紀錄（${ledgerSummary.sequenced} 筆有事件序號）；${ledgerFailures.length ? `${ledgerFailures.length} 項問題` : '順序、引用與重播一致'}`);
if (failures.length) console.error(`quality gate failed:\n${failures.map(f => `  - ${f}`).join('\n')}`);
process.exit(failures.length ? 1 : 0);
