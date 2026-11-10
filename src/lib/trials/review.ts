import { hashVersionOf, type ExamSession } from './engine';

/*
 * T.0 review book rules (docs/exam-system/05 §4.3): one record per question across every session. A wrong or
 * unanswered question goes into the book; answering it right twice in a row (in a later session or a retry from the
 * book) marks it mastered; a mastered question answered wrong comes back. Abandoned sessions do not count.
 *
 * T.3H (docs/exam-system/32 §4): the question id alone does not say which question was answered. Each attempt keeps
 * the content it answered (revision, content hash and its version), the exam, the paper and its version, the attempt
 * (session) id and what was chosen, so identityOf can tell the book whether today's question is still that content.
 */
export const MASTERED_STREAK = 2;
export const KEPT_ATTEMPTS = 5;

export type ReviewStatus = 'new' | 'reviewing' | 'mastered';
export interface ReviewAttempt {
  sessionId?: string; revision: number; correct: boolean; at: string;
  /** T.3H: the content answered; absent on attempts recorded before T.3H that no stored session could confirm. */
  hash?: string; hashVersion?: 1 | 2;
  /** T.3H: where it was answered (absent for a retry in the book: no exam paper). */
  examId?: string; paperId?: string; paperVersion?: string;
  /** T.3H: the option ids chosen and the right ones, in the order they were shown. */
  answer?: { selected: string[]; correct: string[]; order: string[] };
}
export interface ReviewRecord { questionId: string; status: ReviewStatus; correctStreak: number; lastWrongAt?: string; attempts: ReviewAttempt[] }
export type Reviews = Record<string, ReviewRecord>;

/** One answer to one question, from a graded session or a retry in the book. */
export function recordAttempt(reviews: Reviews, questionId: string, attempt: ReviewAttempt): Reviews {
  const old = reviews[questionId];
  const attempts = [...old?.attempts ?? [], attempt].slice(-KEPT_ATTEMPTS);
  let record: ReviewRecord;
  if (!attempt.correct) record = { questionId, status: 'reviewing', correctStreak: 0, lastWrongAt: attempt.at, attempts };
  else {
    const streak = (old?.correctStreak ?? 0) + 1;
    // Only a question that was once wrong can become mastered; one never missed stays new (not in the book).
    const status: ReviewStatus = !old || old.status === 'new' ? 'new' : streak >= MASTERED_STREAK ? 'mastered' : old.status === 'mastered' ? 'mastered' : 'reviewing';
    record = { questionId, status, correctStreak: streak, ...old?.lastWrongAt ? { lastWrongAt: old.lastWrongAt } : {}, attempts };
  }
  return { ...reviews, [questionId]: record };
}

/** Folds a graded session into the book (submitted or expired; anything else changes nothing). */
export function recordSession(reviews: Reviews, s: ExamSession): Reviews {
  if (!s.result || (s.status !== 'submitted' && s.status !== 'expired')) return reviews;
  return s.result.perItem.reduce((book, r, n) => {
    const item = s.items[n], hashVersion = item.hashVersion ?? hashVersionOf(item.hash);
    return recordAttempt(book, r.questionId, {
      sessionId: s.id, revision: item.revision, hash: item.hash, ...hashVersion ? { hashVersion } : {}, correct: r.correct, at: s.endedAt ?? s.result!.gradedAt,
      ...s.examId ? { examId: s.examId } : {}, paperId: s.paperId, paperVersion: s.paperVersion,
      answer: { selected: item.answer?.selected ?? [], correct: item.correct, order: item.optionOrder },
    });
  }, reviews);
}

/** The questions to review, most recently missed first. */
export const inReview = (reviews: Reviews) => Object.values(reviews).filter(r => r.status === 'reviewing').sort((a, b) => (b.lastWrongAt ?? '').localeCompare(a.lastWrongAt ?? ''));

/**
 * T.3H (docs/exam-system/32 §4): what today's question is to a record in the book, judged by the record's latest
 * attempt — never by the id alone:
 *   - `current`: the same content hash (an explanation-only revision under the legacy hash keeps it: what was graded is
 *     unchanged) in one of the question's exams: it can be practised as the one answered;
 *   - `revised`: other content in another revision now: today's version may be practised, labelled as a new version;
 *   - `legacy`: the attempt was recorded without a content hash in the same revision: not confirmed either way;
 *   - `withdrawn`: no longer on the site (withdrawn or retired): only the saved record is shown;
 *   - `other-exam` / `mismatch` (the same revision with other content): the record and the question do not belong
 *     together; neither the question nor a retry is offered.
 */
export type ReviewIdentity =
  | { state: 'current' } | { state: 'revised'; from: number; to: number } | { state: 'legacy'; revision: number }
  | { state: 'withdrawn' } | { state: 'other-exam'; recorded: string } | { state: 'mismatch'; revision: number };
export function identityOf(record: ReviewRecord, now: { revision: number; hash: string; exams: string[] } | undefined): ReviewIdentity {
  if (!now) return { state: 'withdrawn' };
  const last = record.attempts.at(-1), exam = record.attempts.findLast(a => a.examId)?.examId;
  if (exam && !now.exams.includes(exam)) return { state: 'other-exam', recorded: exam };
  if (!last) return { state: 'legacy', revision: now.revision };
  if (last.hash !== undefined && last.hash === now.hash) return { state: 'current' };
  if (last.revision !== now.revision) return { state: 'revised', from: last.revision, to: now.revision };
  return last.hash === undefined ? { state: 'legacy', revision: last.revision } : { state: 'mismatch', revision: last.revision };
}
