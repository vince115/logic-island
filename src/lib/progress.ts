/*
 * Phase E.1 learning progress, kept in this browser's localStorage (there is no account or server yet). Versioned so a
 * later format can migrate it; it never throws away what it cannot read: unreadable data is copied to a backup key
 * first, and data from a newer version is left untouched (read-only) instead of being overwritten.
 */
export const STORAGE_KEY = 'logic-island.progress';
export const BACKUP_KEY = 'logic-island.progress.backup';
export const PROGRESS_VERSION = 1;
/** A lesson is complete when the reading is confirmed and the quiz reaches this share of correct answers. */
export const PASS_RATIO = 2 / 3;

export type LessonStatus = 'not-started' | 'in-progress' | 'completed';
export interface LessonProgress {
  startedAt: string;
  readAt?: string;
  /** Best quiz result so far. */
  quiz?: { correct: number; total: number; at: string };
  completedAt?: string;
}
export interface Progress { version: typeof PROGRESS_VERSION; lessons: Record<string, LessonProgress> }
/** What was read from storage, and whether it may be written back. */
export interface Loaded { progress: Progress; writable: boolean; backup?: string }

export const empty = (): Progress => ({ version: PROGRESS_VERSION, lessons: {} });
export const quizPassed = (quiz?: LessonProgress['quiz']) => !!quiz && quiz.total > 0 && quiz.correct >= Math.ceil(quiz.total * PASS_RATIO);
export function statusOf(entry: LessonProgress | undefined): LessonStatus {
  if (!entry) return 'not-started';
  return entry.completedAt ? 'completed' : 'in-progress';
}

const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
/** Keeps only well-formed entries of a version-1 record. */
function clean(lessons: unknown): Record<string, LessonProgress> {
  if (!lessons || typeof lessons !== 'object') return {};
  const out: Record<string, LessonProgress> = {};
  for (const [id, raw] of Object.entries(lessons as Record<string, unknown>)) {
    const e = raw as Partial<LessonProgress> | null;
    if (!e || !isTime(e.startedAt)) continue;
    const quiz = e.quiz && Number.isInteger(e.quiz.correct) && Number.isInteger(e.quiz.total) && e.quiz.correct >= 0 && e.quiz.correct <= e.quiz.total && isTime(e.quiz.at) ? e.quiz : undefined;
    out[id] = { startedAt: e.startedAt, ...(isTime(e.readAt) ? { readAt: e.readAt } : {}), ...(quiz ? { quiz } : {}), ...(isTime(e.completedAt) ? { completedAt: e.completedAt } : {}) };
  }
  return out;
}

/**
 * Reads what storage holds. Nothing: empty. Version 1: as is (malformed entries dropped). A newer version: shown as
 * empty and not writable, so this older page cannot overwrite it. Anything else (not JSON, no version): empty and
 * writable, with the raw text returned as `backup` for the caller to keep before writing.
 */
export function parse(raw: string | null): Loaded {
  if (raw === null) return { progress: empty(), writable: true };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { progress: empty(), writable: true, backup: raw }; }
  const version = (data as { version?: unknown } | null)?.version;
  if (version === PROGRESS_VERSION) return { progress: { version: PROGRESS_VERSION, lessons: clean((data as Progress).lessons) }, writable: true };
  if (typeof version === 'number' && version > PROGRESS_VERSION) return { progress: empty(), writable: false };
  return { progress: empty(), writable: true, backup: raw };
}

/** Completes a lesson once both conditions hold; a completed lesson stays completed. */
function settle(entry: LessonProgress, now: string): LessonProgress {
  return !entry.completedAt && entry.readAt && quizPassed(entry.quiz) ? { ...entry, completedAt: now } : entry;
}
const touch = (p: Progress, id: string, now: string) => p.lessons[id] ?? { startedAt: now };
const put = (p: Progress, id: string, entry: LessonProgress): Progress => ({ ...p, lessons: { ...p.lessons, [id]: entry } });

/** Opening a lesson starts it (once). */
export const start = (p: Progress, id: string, now: string): Progress => p.lessons[id] ? p : put(p, id, { startedAt: now });
/** The learner confirms they read the lesson. */
export const markRead = (p: Progress, id: string, now: string): Progress => put(p, id, settle({ ...touch(p, id, now), readAt: touch(p, id, now).readAt ?? now }, now));
/** A quiz attempt; only a better result replaces the stored one. */
export function recordQuiz(p: Progress, id: string, correct: number, total: number, now: string): Progress {
  const entry = touch(p, id, now);
  const better = !entry.quiz || correct / total > entry.quiz.correct / entry.quiz.total;
  return put(p, id, settle(better ? { ...entry, quiz: { correct, total, at: now } } : entry, now));
}
