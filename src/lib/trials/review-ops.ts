import type { MockBlueprint } from '@/content/trials/mock-exams';
import { syllabusCodeOf, type Question, type Source } from '@/content/trials/schema';
import { publishedRevision, subjectQuestions, type TagIndex } from './mock-assembly';

/*
 * Shared Trial System T.2F: review operations (docs/exam-system/22 §1). Pure views over the bank, the ledger state the
 * import already folded into each question, and the review queue: which questions to read first, how far each subject
 * is from a paper. Nothing here records a decision: the AI checks in the queue only rank questions, and only a human's
 * decisions file applied through scripts/trials/review.ts reaches the ledger.
 */

/**
 * T.3B: each certification has its own review queue file; a queue names its exam, and every item in it must be a
 * question of that exam, so a CCAR-F question can never be queued (or packeted) for iPAS review.
 */
/** T.3J: paths inside the private bank (privateFile in src/content/trials/private-bank.ts): queues name unpublished questions. */
export const REVIEW_QUEUES: Record<string, string> = {
  'ipas-aiap-basic': 'data/ipas-review-queue.json',
  ccarf: 'data/ccarf-review-queue.json',
};
/** Problems with a review queue for `exam`; empty when every item is a known question of that exam, once. */
export function checkReviewQueue(queue: { exam: string; items: { id: string }[] }, exam: string, questions: Question[], examOf: (q: Question) => string | undefined): string[] {
  const problems: string[] = [], byId = new Map(questions.map(q => [q.id, q])), seen = new Set<string>();
  if (queue.exam !== exam) problems.push(`the queue is for ${queue.exam}, not ${exam}`);
  for (const i of queue.items) {
    const q = byId.get(i.id);
    if (seen.has(i.id)) problems.push(`${i.id}: queued twice`);
    seen.add(i.id);
    if (!q) problems.push(`${i.id}: unknown question`);
    else if (examOf(q) !== exam) problems.push(`${i.id}: a question of ${examOf(q) ?? 'no single exam'}, not ${exam}`);
  }
  return problems;
}

/** The queue entry of a question (data/ipas-review-queue.json in the private bank), as far as ranking needs it. */
export interface RiskInput { priority: 1 | 2 | 3; flags: string[]; confirm?: string; overlapsWith: string[] }

const FLAG_WEIGHT: Record<string, number> = { legal: 30, 'similarity-medium': 20, volatile: 20, redesigned: 15 };
const PRIORITY_WEIGHT = { 1: 100, 2: 50, 3: 0 } as const;

/** A review risk score: higher is read first. Priority first, then legal, similarity, volatile and redesign flags. */
export function riskOf(q: Question, item?: RiskInput): { score: number; reasons: string[] } {
  if (!item) return { score: q.tags.includes('meta.volatile') ? 20 : 0, reasons: q.tags.includes('meta.volatile') ? ['volatile'] : [] };
  const reasons = [`priority ${item.priority}`, ...item.flags.filter(f => f in FLAG_WEIGHT)];
  let score = PRIORITY_WEIGHT[item.priority] + item.flags.reduce((n, f) => n + (FLAG_WEIGHT[f] ?? 0), 0);
  if (item.overlapsWith.length) { score += 5 * item.overlapsWith.length; reasons.push(`overlap ×${item.overlapsWith.length}`); }
  if (item.confirm) { score += 10; reasons.push('confirm'); }
  return { score, reasons };
}

export interface ReviewFilter {
  /** A subject id or its last part (`s1`). */
  subject?: string;
  /** A syllabus item code (L11302). */
  syllabus?: string;
  /** Review statuses to include; in review only by default. */
  statuses?: string[];
  sort?: 'risk' | 'id';
  /** T.3E: only questions of this review-queue priority. */
  priority?: 1 | 2 | 3;
  /** T.3E: these questions first, in this order (the rest follow by `sort`). */
  first?: string[];
}

export const matchesSubject = (q: Question, subject: string) => q.appearances.some(a => a.subjectId === subject || a.subjectId.endsWith(`.${subject}`));

export interface Ranked { question: Question; code: string; score: number; reasons: string[] }

/** The questions of `exam` that pass the filter, ranked (risk: highest first, ties by id). */
export function selectForReview(questions: Question[], exam: string, queue: Map<string, RiskInput>, tags: TagIndex, f: ReviewFilter = {}): Ranked[] {
  const statuses = f.statuses ?? ['in-review'];
  const list = questions
    .filter(q => q.id.startsWith(`${exam}-`) && statuses.includes(q.review.status))
    .filter(q => !f.subject || matchesSubject(q, f.subject))
    .filter(q => !f.syllabus || syllabusCodeOf(q, tags) === f.syllabus.toUpperCase())
    .filter(q => !f.priority || queue.get(q.id)?.priority === f.priority)
    .map(q => ({ question: q, code: syllabusCodeOf(q, tags) ?? '', ...riskOf(q, queue.get(q.id)) }));
  const sorted = f.sort === 'risk' ? list.sort((a, b) => b.score - a.score || a.question.id.localeCompare(b.question.id)) : list;
  const first = f.first ?? [], at = (r: Ranked) => first.includes(r.question.id) ? first.indexOf(r.question.id) : first.length;
  return first.length ? [...sorted].sort((a, b) => at(a) - at(b)) : sorted;
}

export interface QuotaRow {
  code: string;
  /** Questions a paper draws for this item. */
  quota: number;
  bank: number; inReview: number; approved: number;
  /** Published and usable by a paper (current revision, matching hash). */
  published: number;
  /** Published questions still missing before a paper can draw this item. */
  missingPublished: number;
  /** Quota not yet covered by approved or published questions: what reviewers still have to approve. */
  unapprovedQuota: number;
}
export interface SubjectProgress {
  blueprintId: string; subjectId: string; title: string;
  rows: QuotaRow[];
  totals: { bank: number; inReview: number; approved: number; published: number; changes: number; rejected: number };
  /** Published questions missing, over all items, before an official-style paper can be drawn. */
  missingPublished: number;
  ready: boolean;
}

/** How far a subject is from a drawable paper, item by item. */
export function subjectProgress(bp: MockBlueprint, questions: Question[], sources: Map<string, Source>, recorded: Record<string, string>, tags: TagIndex): SubjectProgress {
  const mine = subjectQuestions(bp, questions);
  const usable = new Set(mine.filter(q => publishedRevision(q, sources, recorded).revision !== undefined).map(q => q.id));
  const latest = (q: Question) => q.review.reviews[q.review.reviews.length - 1]?.verdict;
  const rows = Object.entries(bp.coverage).map(([code, quota]): QuotaRow => {
    const of = mine.filter(q => syllabusCodeOf(q, tags) === code);
    const published = of.filter(q => usable.has(q.id)).length, approved = of.filter(q => q.review.status === 'approved').length;
    return { code, quota, bank: of.length, inReview: of.filter(q => q.review.status === 'in-review').length, approved, published,
      missingPublished: Math.max(0, quota - published), unapprovedQuota: Math.max(0, quota - published - approved) };
  });
  const missingPublished = rows.reduce((n, r) => n + r.missingPublished, 0);
  return {
    blueprintId: bp.id, subjectId: bp.subjectId, title: bp.title, rows, missingPublished, ready: missingPublished === 0,
    totals: {
      bank: mine.length, inReview: mine.filter(q => q.review.status === 'in-review').length, approved: mine.filter(q => q.review.status === 'approved').length,
      published: usable.size, changes: mine.filter(q => latest(q) === 'changes').length, rejected: mine.filter(q => latest(q) === 'reject').length,
    },
  };
}

/** The review summary as Markdown: ids, counts and flags only — no stem, option, answer or explanation. */
export function reviewSummary(exam: string, progress: SubjectProgress[], ranked: Ranked[], ledger: { reviews: unknown[]; publications: unknown[] }, at: string): string {
  const out = [
    `# ${exam} 審核摘要（${at}）`, '',
    '本摘要只列題號、數量與標記，不含題幹、選項、答案或解析。AI 自動品質檢查只用於排序，不是人工核准；核准只能由人工的決定檔透過 `review.ts apply` 寫入審核帳本。', '',
    `審核帳本：${ledger.reviews.length} 筆審核、${ledger.publications.length} 筆發布。`, '',
  ];
  for (const p of progress) {
    out.push(`## ${p.title}（\`${p.subjectId}\`）`, '',
      `題庫 ${p.totals.bank} 題：審稿中 ${p.totals.inReview}、已核准 ${p.totals.approved}、可用已發布 ${p.totals.published}、要求修改 ${p.totals.changes}、退回 ${p.totals.rejected}。`,
      p.ready ? '已發布題可以組成正式規格考卷。' : `距離可組成正式規格考卷，尚缺 **${p.missingPublished}** 題已發布題。`, '',
      '| 考綱 | 每卷配額 | 題庫 | 審稿中 | 已核准 | 已發布 | 尚缺發布 | 未核准配額 |', '|---|---:|---:|---:|---:|---:|---:|---:|',
      ...p.rows.map(r => `| ${r.code} | ${r.quota} | ${r.bank} | ${r.inReview} | ${r.approved} | ${r.published} | ${r.missingPublished} | ${r.unapprovedQuota} |`), '');
  }
  const top = ranked.slice(0, 25);
  out.push('## 優先審核（依風險排序，前 25 題）', '', '| 題號 | 考綱 | 風險分數 | 原因 |', '|---|---|---:|---|',
    ...top.map(r => `| \`${r.question.id}\` | ${r.code} | ${r.score} | ${r.reasons.join('、')} |`), '');
  return out.join('\n');
}
