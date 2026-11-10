import { mulberry32, shuffleIds } from './shuffle';

/*
 * T.0 Shared Exam Engine: one timed mock session from start to result, as pure functions (docs/exam-system/05 §4).
 * Every function takes the old session and the time, and returns a new session; nothing reads the clock or storage,
 * so the browser components and the tests drive it the same way. A session freezes, when it starts, everything it is
 * graded on (revision, content hash, points, option order, the correct options), so later edits to a question never
 * change a past result.
 *
 * T.3B: a multiple-response item asks for exactly `select` options (it says so on the page); the learner toggles them
 * with toggleOption, never more than `select`. Every item is graded by exact match: the set of selected options must
 * equal the set of correct ones — no partial credit, Logic Island's rule (not a claim about any official scoring).
 *
 * T.3H (docs/exam-system/32 §3): a session is one attempt (its id is the attempt id) and freezes its exam and, per
 * item, the hash version next to the revision and content hash; each graded item names the revision and hash it was
 * graded on. An ended session is final: store.ts never replaces it, so it is never graded again.
 */
export const ENGINE_VERSION = 'trials-engine/1';

/** What the engine needs of a paper; built on the server from the bank (src/lib/trials/views.ts). */
export interface EngineItem {
  questionId: string; revision: number; hash: string; points: number; optionIds: string[]; fixed: string[]; correct: string[]; tags: string[];
  /** T.3B: how many options a multiple-response item asks for; left out (one) for single-answer items. */
  select?: number;
  /** T.3H: the version of `hash` (schema.ts revisionHash): 1 legacy, 2 with explanations. */
  hashVersion?: 1 | 2;
}
export interface EnginePaper {
  id: string; version: string; durationMinutes: number; passPoints?: number; shuffleOptions: boolean; items: EngineItem[];
  /** T.2E: the mode of a generated paper, and the snapshot of the published pool its items were drawn from. */
  examMode?: 'official-style' | 'extended-practice'; snapshot?: string;
  /** T.3H: the exam the paper belongs to, frozen into each session. */
  examId?: string;
}

export type SessionStatus = 'in-progress' | 'submitted' | 'expired' | 'abandoned';
export interface UserAnswer { selected: string[]; at: string }
export interface SessionItem {
  questionId: string; revision: number; hash: string; points: number;
  optionOrder: string[]; correct: string[]; tags: string[];
  /** T.3B: frozen from the paper when the session starts; one when left out. */
  select?: number;
  /** T.3H: frozen from the paper; absent on sessions started before T.3H (hashVersionOf reads it from the hash). */
  hashVersion?: 1 | 2;
  answer?: UserAnswer;
  /** T.2D: flagged by the learner to check again before submitting; not graded. */
  marked?: boolean;
}
export interface ItemResult {
  questionId: string; earned: number; max: number; correct: boolean; answered: boolean;
  /** T.3H: the revision and content hash this item was graded on (absent on results graded before T.3H). */
  revision?: number; hash?: string;
}
export interface ExamResult {
  gradedAt: string; engineVersion: string;
  score: number; maxScore: number; passPoints?: number; passed?: boolean;
  answered: number; correct: number;
  perItem: ItemResult[];
  byTag: Record<string, { earned: number; max: number }>;
}
export interface ExamSession {
  id: string; paperId: string; paperVersion: string; mode: 'mock';
  startedAt: string; deadline: string; endedAt?: string;
  status: SessionStatus; seed: number;
  passPoints?: number;
  /**
   * T.2E: what rebuilds a drawn paper (docs/exam-system/21 §7): the seed drew it from the pool `snapshot`; the items keep
   * the drawn ids, revisions, hashes and order; with the mode, the start time and the time limit.
   */
  examMode?: EnginePaper['examMode']; snapshot?: string; durationMinutes?: number;
  /** T.3H: the exam of the paper when the session started; absent on sessions started before T.3H. */
  examId?: string;
  items: SessionItem[];
  result?: ExamResult;
}

const ms = (iso: string) => Date.parse(iso);
/** Points are kept to two decimals (2.5 per question); sums are done in hundredths to avoid float drift. */
const sum = (values: number[]) => values.reduce((a, v) => a + Math.round(v * 100), 0) / 100;

/** T.3H: the version of a content hash, read from its form (`v2-` and 16 hex digits, or 8 hex digits); never guessed. */
export function hashVersionOf(hash: string): 1 | 2 | undefined {
  return /^v2-[0-9a-f]{16}$/.test(hash) ? 2 : /^[0-9a-f]{8}$/.test(hash) ? 1 : undefined;
}

export function startSession(paper: EnginePaper, now: string, { id, seed }: { id: string; seed: number }): ExamSession {
  const random = mulberry32(seed);
  return {
    id, paperId: paper.id, paperVersion: paper.version, mode: 'mock', startedAt: now, status: 'in-progress', seed,
    deadline: new Date(ms(now) + paper.durationMinutes * 60_000).toISOString(), durationMinutes: paper.durationMinutes,
    ...paper.passPoints !== undefined ? { passPoints: paper.passPoints } : {},
    ...paper.examMode ? { examMode: paper.examMode } : {}, ...paper.snapshot ? { snapshot: paper.snapshot } : {},
    ...paper.examId ? { examId: paper.examId } : {},
    items: paper.items.map(it => ({
      questionId: it.questionId, revision: it.revision, hash: it.hash, points: it.points, correct: it.correct, tags: it.tags,
      ...it.select !== undefined && it.select > 1 ? { select: it.select } : {},
      ...it.hashVersion ? { hashVersion: it.hashVersion } : {},
      optionOrder: paper.shuffleOptions ? shuffleIds(it.optionIds, it.fixed, random) : [...it.optionIds],
    })),
  };
}

/** Milliseconds left; 0 once the deadline has passed. */
export const remaining = (s: ExamSession, now: string) => Math.max(0, ms(s.deadline) - ms(now));
export const isOver = (s: ExamSession, now: string) => s.status === 'in-progress' && remaining(s, now) === 0;

/** How many options an item asks for. */
export const selectOf = (i: { select?: number }) => i.select ?? 1;

/**
 * Chooses the one option of a single-answer item; ignored once the session has ended or its time is up, for an unknown
 * question or option, and for a multiple-response item (use toggleOption).
 */
export function answerQuestion(s: ExamSession, questionId: string, optionId: string, now: string): ExamSession {
  if (s.status !== 'in-progress' || remaining(s, now) === 0) return s;
  const item = s.items.find(i => i.questionId === questionId);
  if (!item || !item.optionOrder.includes(optionId) || selectOf(item) > 1) return s;
  if (item.answer?.selected.length === 1 && item.answer.selected[0] === optionId) return s;
  return { ...s, items: s.items.map(i => i === item ? { ...i, answer: { selected: [optionId], at: now } } : i) };
}

/**
 * T.3B: selects or clears one option of a multiple-response item (a single-answer item: selects it, like
 * answerQuestion). Selecting beyond the item's `select` is refused: the learner clears one first. Clearing the last
 * option leaves the item unanswered. Same guards as answerQuestion.
 */
export function toggleOption(s: ExamSession, questionId: string, optionId: string, now: string): ExamSession {
  const item = s.items.find(i => i.questionId === questionId);
  if (!item || selectOf(item) === 1) return answerQuestion(s, questionId, optionId, now);
  if (s.status !== 'in-progress' || remaining(s, now) === 0 || !item.optionOrder.includes(optionId)) return s;
  const was = [...new Set(item.answer?.selected ?? [])];
  const selected = was.includes(optionId) ? was.filter(id => id !== optionId) : [...was, optionId];
  if (selected.length > selectOf(item)) return s;
  // Kept in the order the options are shown, so the stored answer does not depend on the order of the clicks.
  const ordered = item.optionOrder.filter(id => selected.includes(id));
  const next: SessionItem = { ...item, answer: { selected: ordered, at: now } };
  if (!ordered.length) delete next.answer;
  return { ...s, items: s.items.map(i => i === item ? next : i) };
}

/** T.2D: flags or unflags a question to check later; like an answer, only while the session runs and time is left. */
export function toggleMark(s: ExamSession, questionId: string, now: string): ExamSession {
  if (s.status !== 'in-progress' || remaining(s, now) === 0) return s;
  const item = s.items.find(i => i.questionId === questionId);
  if (!item) return s;
  return { ...s, items: s.items.map(i => i === item ? { ...i, marked: !i.marked } : i) };
}

/** Exact match over sets: duplicates collapse; an option outside `allowed` (when given), a missing or extra one is wrong. */
export function exactMatch(selected: string[], correct: string[], allowed?: string[]): boolean {
  const picked = new Set(selected);
  return picked.size > 0 && picked.size === new Set(correct).size && correct.every(c => picked.has(c)) && (!allowed || [...picked].every(p => allowed.includes(p)));
}

export function grade(s: ExamSession, now: string): ExamResult {
  const perItem = s.items.map(i => {
    const answered = (i.answer?.selected.length ?? 0) > 0;
    const correct = answered && exactMatch(i.answer!.selected, i.correct, i.optionOrder);
    return { questionId: i.questionId, earned: correct ? i.points : 0, max: i.points, correct, answered, revision: i.revision, hash: i.hash };
  });
  const byTag: ExamResult['byTag'] = {};
  s.items.forEach((item, n) => {
    for (const tag of item.tags) {
      const t = byTag[tag] ??= { earned: 0, max: 0 };
      t.earned = sum([t.earned, perItem[n].earned]); t.max = sum([t.max, perItem[n].max]);
    }
  });
  const score = sum(perItem.map(p => p.earned)), maxScore = sum(perItem.map(p => p.max));
  return {
    gradedAt: now, engineVersion: ENGINE_VERSION, score, maxScore,
    ...s.passPoints !== undefined ? { passPoints: s.passPoints, passed: score >= s.passPoints } : {},
    answered: perItem.filter(p => p.answered).length, correct: perItem.filter(p => p.correct).length, perItem, byTag,
  };
}

/**
 * Ends the session and freezes its result: `submitted` before the deadline, `expired` once it has passed (graded on
 * what was answered in time, which is all answerQuestion accepts). An ended session is returned unchanged.
 */
export function finish(s: ExamSession, now: string): ExamSession {
  if (s.status !== 'in-progress') return s;
  const late = remaining(s, now) === 0;
  const endedAt = late ? s.deadline : now;
  return { ...s, status: late ? 'expired' : 'submitted', endedAt, result: grade(s, endedAt) };
}

/** Gives up an unfinished session: not graded and not counted in the review book. */
export const abandon = (s: ExamSession, now: string): ExamSession => s.status === 'in-progress' ? { ...s, status: 'abandoned', endedAt: now } : s;

export const unanswered = (s: ExamSession) => s.items.filter(i => !i.answer?.selected.length).length;
export const markedCount = (s: ExamSession) => s.items.filter(i => i.marked).length;

/** T.2D: a graded result in the terms a learner reads: right, wrong and blank counts, accuracy and the time used. */
export function summary(s: ExamSession) {
  const r = s.result!;
  const wrong = r.answered - r.correct, blank = r.perItem.length - r.answered;
  const usedMs = Math.max(0, Date.parse(s.endedAt ?? r.gradedAt) - Date.parse(s.startedAt));
  return { total: r.perItem.length, correct: r.correct, wrong, blank, accuracy: r.perItem.length ? r.correct / r.perItem.length : 0, usedMs };
}
