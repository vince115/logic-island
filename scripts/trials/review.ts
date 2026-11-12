import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceById, tagById, trialBank } from '@/content/trials';
import { mockBlueprints } from '@/content/trials/mock-exams';
import { privateFile } from '@/content/trials/private-bank';
import { examResolver, planDecisions } from '@/lib/trials/lifecycle';
import { REVIEW_QUEUES, checkReviewQueue, reviewSummary, selectForReview, subjectProgress, type RiskInput } from '@/lib/trials/review-ops';
import { ROOT, readHashes, readLedger, rebuild } from './ledger-io';
import { buildPacket, type ReviewQueue } from './review-packet';
import { writeAllOrNothing } from './write-files';

/*
 * Shared Trial System T.2C: the batch review workflow (docs/exam-system/19). Local only: the site has no review page.
 *
 *   review.ts status [--exam ipas-aiap-basic]                       progress, from the ledger (reads only)
 *   review.ts queue [--subject s1] [--syllabus L11302] [--sort risk|id] [--limit N]   questions to review (reads only)
 *   review.ts packet <batch id> --out <dir> [--from 1] [--count 25]  a review packet and its decision template (reads only)
 *   review.ts packet --subject s1 [--syllabus L11302] [--sort risk] --out <dir> [--from 1] [--count 10–25]
 *     … [--priority 1] [--first id,id,…]                          T.3E: one queue priority; these questions first
 *   review.ts summary [--out <file.md>]                               subject progress, quotas and risk ranking (no answers)
 *   review.ts apply <decisions.json>                                  dry run: checks every decision, writes nothing
 *   review.ts apply <decisions.json> --confirm <N>                    records all N decisions or none
 *
 * Applying adds the decisions to the ledger and rebuilds the generated questions, so approved questions become
 * `approved`. It never publishes (that is scripts/trials/publish.ts).
 *
 * T.2F (docs/exam-system/22 §1): queue, filtered packets and summary rank questions by the risk flags of the review
 * queue (src/lib/trials/review-ops.ts). Ranking is advice from the AI checks; it never records a decision.
 *
 * T.3B: `--exam` (default ipas-aiap-basic; ccarf for CCAR-F) picks the exam's own review queue file, which must hold
 * questions of that exam only; packets and decision files name the exam, and decisions on another exam's question
 * are refused. Every ledger record names its exam.
 */
const args = process.argv.slice(2), [command, subject] = args;
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const exam = opt('--exam') ?? 'ipas-aiap-basic';
const examOf = examResolver(trialBank);
if (!REVIEW_QUEUES[exam]) { console.error(`no review queue for exam ${exam} (known: ${Object.keys(REVIEW_QUEUES).join(', ')})`); process.exit(2); }
const queue: ReviewQueue = JSON.parse(readFileSync(privateFile(REVIEW_QUEUES[exam]), 'utf8'));
const queueProblems = checkReviewQueue(queue, exam, trialBank.questions, examOf);
if (queueProblems.length) { console.error(['review queue refused:', ...queueProblems.map(p => `- ${p}`)].join('\n')); process.exit(1); }
const ledger = readLedger();
const risk = new Map<string, RiskInput>(queue.items.map(i => [i.id, i]));
const filter = () => ({ subject: opt('--subject'), syllabus: opt('--syllabus'), sort: (opt('--sort') ?? 'id') as 'risk' | 'id',
  ...opt('--priority') ? { priority: Number(opt('--priority')) as 1 | 2 | 3 } : {}, ...opt('--first') ? { first: opt('--first')!.split(',') } : {} });
const progress = () => mockBlueprints.filter(bp => bp.examId === exam).map(bp => subjectProgress(bp, trialBank.questions, sourceById, readHashes(), tagById));
const writePacket = (name: string, questions: typeof trialBank.questions, from: number, count: number) => {
  const out = opt('--out');
  if (!out) { console.error('packet needs --out <dir> (outside the site; the packet holds unpublished answers)'); process.exit(2); }
  const p = buildPacket(questions.filter(q => examOf(q) === exam), trialBank.tags, ledger, queue, from, count, readHashes(), exam);
  mkdirSync(out, { recursive: true });
  const file = `${name}-${String(from).padStart(2, '0')}-${p.questions.length}`;
  writeFileSync(path.join(out, `${file}.md`), p.markdown);
  writeFileSync(path.join(out, `${file}.decisions.json`), `${JSON.stringify(p.template, null, 1)}\n`);
  console.log(`wrote ${file}.md and ${file}.decisions.json in ${out} (${p.questions.length} questions; nothing in the bank changed)`);
};

if (command === 'status') {
  const qs = trialBank.questions.filter(q => q.id.startsWith(`${exam}-`));
  const batches = [...new Set(qs.map(q => q.id.split('-').slice(0, -1).join('-')))];
  console.log(`# ${exam} 審核進度\n\n| 批次 | 題數 | 審稿中 | 已核准 | 已發布 | 文件層級核准（僅供參考） | 第一優先 |\n|---|---:|---:|---:|---:|---:|---:|`);
  for (const b of batches) {
    const in_ = qs.filter(q => q.id.startsWith(`${b}-`)), items = queue.items.filter(i => i.id.startsWith(`${b}-`));
    const n = (s: string) => in_.filter(q => q.review.status === s).length;
    console.log(`| ${b} | ${in_.length} | ${n('in-review')} | ${n('approved')} | ${n('published')} | ${items.filter(i => i.documentApproval).length} | ${items.filter(i => i.priority === 1).length} |`);
  }
  console.log(`\n第一優先：${queue.items.filter(i => i.priority === 1).map(i => `${i.id}（${i.flags.join('、')}）`).join('；')}`);
  console.log(`審核帳本：${ledger.reviews.length} 筆審核、${ledger.publications.length} 筆發布。`);
  for (const p of progress()) {
    console.log(`\n## ${p.title}：審稿中 ${p.totals.inReview}、已核准 ${p.totals.approved}、可用已發布 ${p.totals.published}；${p.ready ? '可以組卷' : `距離可組卷尚缺 ${p.missingPublished} 題已發布題`}`);
    console.log(`\n| 考綱 | 每卷配額 | 題庫 | 審稿中 | 已核准 | 已發布 | 尚缺發布 | 未核准配額 |\n|---|---:|---:|---:|---:|---:|---:|---:|`);
    for (const r of p.rows) console.log(`| ${r.code} | ${r.quota} | ${r.bank} | ${r.inReview} | ${r.approved} | ${r.published} | ${r.missingPublished} | ${r.unapprovedQuota} |`);
  }
} else if (command === 'queue') {
  const list = selectForReview(trialBank.questions, exam, risk, tagById, filter()), limit = Number(opt('--limit') ?? list.length);
  console.log(`| 題號 | 考綱 | 風險分數 | 原因 |\n|---|---|---:|---|`);
  for (const r of list.slice(0, limit)) console.log(`| ${r.question.id} | ${r.code} | ${r.score} | ${r.reasons.join('、') || '—'} |`);
  console.log(`\n${Math.min(limit, list.length)} / ${list.length} 題審稿中（排序是 AI 檢查的建議，不是審核紀錄）`);
} else if (command === 'packet' && subject && !subject.startsWith('--')) {
  writePacket(subject, trialBank.questions.filter(q => q.id.startsWith(`${subject}-`)), Number(opt('--from') ?? 1), Number(opt('--count') ?? 25));
} else if (command === 'packet' && opt('--subject')) {
  const f = filter(), list = selectForReview(trialBank.questions, exam, risk, tagById, f).map(r => r.question);
  const count = Number(opt('--count') ?? 25);
  if (count < 10 || count > 25) { console.error('a filtered packet holds 10–25 questions (--count)'); process.exit(2); }
  writePacket([exam, f.subject, f.syllabus?.toUpperCase(), f.priority ? `p${f.priority}` : '', f.sort === 'risk' ? 'risk' : ''].filter(Boolean).join('-'), list, Number(opt('--from') ?? 1), count);
} else if (command === 'summary') {
  const md = reviewSummary(exam, progress(), selectForReview(trialBank.questions, exam, risk, tagById, { sort: 'risk' }), ledger, new Date().toISOString().slice(0, 10));
  const out = opt('--out');
  if (out) { writeFileSync(out, md); console.log(`wrote ${out} (ids and counts only)`); } else console.log(md);
} else if (command === 'apply' && subject) {
  const confirm = opt('--confirm');
  const raw = JSON.parse(readFileSync(subject, 'utf8'));
  const plan = planDecisions(raw, trialBank.questions, ledger, confirm === undefined ? Array.isArray(raw?.decisions) ? raw.decisions.length : 0 : Number(confirm), examOf);
  if (!plan.ok) { console.error(['decisions refused (nothing was changed):', ...plan.errors.map(e => `- ${e}`)].join('\n')); process.exit(1); }
  const verdicts = (raw.decisions as { verdict: string }[]).reduce<Record<string, number>>((n, d) => ({ ...n, [d.verdict]: (n[d.verdict] ?? 0) + 1 }), {});
  if (confirm === undefined) {
    console.log(`dry run: ${plan.added} valid decisions (${Object.entries(verdicts).map(([v, n]) => `${v} ${n}`).join(', ')}). Record them with --confirm ${plan.added}.`);
    process.exit(0);
  }
  const result = rebuild(plan.ledger!, ledger);
  if (!result.ok) { console.error(['decisions refused (nothing was changed):', ...result.errors.map(e => `- ${e}`)].join('\n')); process.exit(1); }
  writeAllOrNothing(result.files);
  console.log(`recorded ${plan.added} decisions; wrote ${result.files.map(f => path.relative(ROOT, f.path)).join(', ')}`);
} else {
  console.error('usage: review.ts status | queue [--subject s1] [--syllabus CODE] [--sort risk] [--limit N] | packet <batch id> --out <dir> [--from N] [--count N]'
    + ' | packet --subject s1 [--syllabus CODE] [--sort risk] --out <dir> [--from N] [--count 10–25] | summary [--out file.md] | apply <decisions.json> [--confirm N]');
  process.exit(2);
}
