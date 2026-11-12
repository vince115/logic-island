import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trialBank } from '@/content/trials';
import { contentText, currentRevisionOf, type Content } from '@/content/trials/schema';
import type { ImportBatch, ImportText } from '@/lib/trials/import';
import { itemsFromPaperText, similarityFlags, THRESHOLDS, type SimilarityItem } from '@/lib/trials/similarity';

/*
 * Shared Trial System T.2B-2: duplicate and similarity check for a batch of original questions, before it is imported.
 *
 *   pnpm trials:similarity src/content/trials/batches/<batch>.json                      against the batch and the bank
 *   … --against <folder or .txt files>                                                 also against local paper text
 *   … --report <file.md>                                                               save the report as well
 *
 * Paper text is read from local files only and never written anywhere: the report names a paper question by file and
 * number, and quotes at most the shared run. Flags are for a human reviewer; this script never changes a question.
 */
// The first plain argument is the batch; plain arguments after --against are paper text; --report takes one value.
let file: string | undefined, reportAt: string | undefined, mode: 'batch' | 'against' = 'batch';
const against: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--report') reportAt = process.argv[++i];
  else if (a === '--against') mode = 'against';
  else if (mode === 'against') against.push(a);
  else file ??= a;
}
if (!file) {
  console.error('usage: pnpm trials:similarity <batch.json> [--against <folder or .txt files>…] [--report <report.md>]');
  process.exit(2);
}

const text = (t: ImportText) => typeof t === 'string' ? t : contentText(t as Content);
const batch = JSON.parse(readFileSync(file, 'utf8')) as ImportBatch;
const candidates: SimilarityItem[] = batch.questions.map(q => ({ id: q.id, stem: text(q.stem), options: q.options.map(text), corpus: 'batch' }));
const inBatch = new Set(candidates.map(c => c.id));
const bank: SimilarityItem[] = trialBank.questions.filter(q => !inBatch.has(q.id)).flatMap(q => {
  const rev = currentRevisionOf(q);
  return rev ? [{ id: q.id, stem: contentText(rev.stem ?? []), options: rev.options?.map(o => contentText(o.body)) ?? [], corpus: 'logic-island' }] : [];
});
const paperFiles = against.flatMap(p => statSync(p).isDirectory() ? readdirSync(p).filter(f => f.endsWith('.txt')).sort().map(f => path.join(p, f)) : [p]);
const papers = paperFiles.flatMap(f => itemsFromPaperText(readFileSync(f, 'utf8'), path.basename(f, '.txt')));

const flags = similarityFlags(candidates, [...bank, ...papers]);
const report = [
  `# 相似度檢查：${batch.batch.id}`,
  '',
  `- 候選題：${candidates.length} 題；比對對象：批次內其他題、Logic Island 題庫 ${bank.length} 題、本機試題文字 ${papers.length} 題（${paperFiles.length} 個檔案）`,
  `- 門檻：共同片段 ≥ ${THRESHOLDS.run} 字；題幹 5-gram Jaccard > ${THRESHOLDS.stemNgrams}；≥ ${THRESHOLDS.sharedOptions} 個選項相同或幾乎相同（不計少於 ${THRESHOLDS.optionLength} 字的選項；2-gram Jaccard 或長度比 ≥ ${THRESHOLDS.optionNgrams}）；遮蔽數字與英文後題幹加選項 Jaccard > ${THRESHOLDS.template}`,
  `- 結果：**${flags.length} 個訊號**（只供人工複查，不是著作權判定）`,
  '',
  ...flags.length ? ['| 題目 | 比對對象 | 來源 | 類型 | 說明 |', '|---|---|---|---|---|',
    ...flags.map(f => `| \`${f.id}\` | \`${f.other}\` | ${f.corpus} | ${f.kind} | ${f.detail.replace(/\|/g, '\\|')} |`)] : ['沒有任何訊號。'],
  '',
].join('\n');
console.log(report);
if (reportAt) writeFileSync(reportAt, report);
