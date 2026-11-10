import { digestOf } from './digest';
import { hashVersionOf, type ExamSession, type SessionStatus } from './engine';
import { recordSession, type ReviewAttempt, type ReviewRecord, type Reviews } from './review';

/*
 * T.0 trial records in this browser's localStorage, apart from lesson progress (src/lib/progress.ts, untouched): the
 * sessions taken and the review book. The rules are progress.ts's: versioned; unreadable data is copied to a backup
 * key before it is replaced; data from a newer version is shown read-only and never overwritten. Old sessions are
 * dropped beyond a cap so storage stays small.
 *
 * T.3H (docs/exam-system/32 §3–5): version 2.
 *   - Version-1 data is migrated in memory on every read (pure, so reading it twice gives the same store) and is
 *     written as version 2 only on the next write, after its exact text has been copied to TRIALS_V1_BACKUP_KEY
 *     (once; use-trials.ts). Nothing is cleared. A site rolled back to version 1 sees version 2 as newer data: it shows
 *     it read-only and never writes over it; downgradeToV1 gives the version-1 form back.
 *   - A record that cannot be read (a session or review of the wrong shape, a result that does not match its items, a
 *     second session with the same id) is kept in `quarantine` exactly as it was, never silently dropped, and never
 *     used: the rest of the records stay usable.
 *   - A migrated review attempt gets the content hash of what it answered only from the stored session it names, when
 *     that session holds the same question in the same revision. Otherwise its identity stays unknown (legacy): no
 *     hash is taken from the bank as it is today.
 *   - An ended session is final: putSession never replaces it (no regrading, no edit, no resumed abandoned session).
 *
 * T.3I (docs/exam-system/33 §6–7): a quarantined record has a stable id (a digest of what it was), so the same record
 * found again is kept once. Whole-store text that cannot be read is no longer copied to the single TRIALS_BACKUP_KEY
 * slot: use-trials.ts keeps each such text under its own key (quarantine.ts) before anything is written over it.
 */
export const TRIALS_KEY = 'logic-island.trials';
export const TRIALS_BACKUP_KEY = 'logic-island.trials.backup';
/** T.3H: the version-1 text exactly as it was, saved before the first version-2 write and never overwritten. */
export const TRIALS_V1_BACKUP_KEY = 'logic-island.trials.v1-backup';
export const TRIALS_VERSION = 2;
/** Ended sessions kept per paper (unfinished ones are always kept). */
export const KEPT_PER_PAPER = 10;

/** T.3H: a stored record that could not be read, kept as it was. T.3I: `id` names it (stable across reads). */
export interface Quarantined { id?: string; kind: 'session' | 'review'; key?: string; reason: string; raw: unknown }
export interface TrialStore { version: typeof TRIALS_VERSION; sessions: ExamSession[]; reviews: Reviews; quarantine: Quarantined[] }
export interface LoadedTrials {
  store: TrialStore; writable: boolean;
  /** Text that could not be read as a store; kept (quarantine.ts) before the first write replaces it. */
  backup?: string; backupReason?: 'unreadable' | 'unknown-version';
  /** T.3H: read from version-1 data, whose text is `raw`; saved to TRIALS_V1_BACKUP_KEY before the first write. */
  migrated?: { from: 1; raw: string };
}

export const emptyTrials = (): TrialStore => ({ version: TRIALS_VERSION, sessions: [], reviews: {}, quarantine: [] });

const STATUSES: SessionStatus[] = ['in-progress', 'submitted', 'expired', 'abandoned'];
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const isHashVersion = (v: unknown) => v === undefined || v === 1 || v === 2;

/** Why a stored session cannot be used, or undefined when its shape is intact. */
function sessionProblem(raw: unknown): string | undefined {
  const s = raw as Partial<ExamSession> | null;
  if (!s || typeof s !== 'object') return 'not a session';
  if (!(typeof s.id === 'string' && typeof s.paperId === 'string' && typeof s.paperVersion === 'string' && STATUSES.includes(s.status as SessionStatus)
    && isTime(s.startedAt) && isTime(s.deadline) && typeof s.seed === 'number' && Array.isArray(s.items)
    && (s.examMode === undefined || s.examMode === 'official-style' || s.examMode === 'extended-practice')
    && (s.snapshot === undefined || typeof s.snapshot === 'string') && (s.durationMinutes === undefined || typeof s.durationMinutes === 'number')
    && (s.examId === undefined || typeof s.examId === 'string'))) return 'session fields';
  if (!s.items.every(i => !!i && typeof i.questionId === 'string' && typeof i.revision === 'number' && typeof i.hash === 'string' && typeof i.points === 'number' && isStrings(i.optionOrder) && isStrings(i.correct) && isStrings(i.tags)
    && (i.answer === undefined || (isStrings(i.answer.selected) && isTime(i.answer.at))) && (i.marked === undefined || typeof i.marked === 'boolean')
    && (i.select === undefined || (Number.isInteger(i.select) && i.select > 1 && i.select < i.optionOrder.length)) && isHashVersion(i.hashVersion))) return 'session items';
  if (s.status !== 'in-progress' && s.status !== 'abandoned' && !s.result) return 'ended without a result';
  const r = s.result;
  if (r && !(isTime(r.gradedAt) && typeof r.engineVersion === 'string' && typeof r.score === 'number' && typeof r.maxScore === 'number'
    && typeof r.answered === 'number' && typeof r.correct === 'number' && !!r.byTag && typeof r.byTag === 'object' && Array.isArray(r.perItem))) return 'result fields';
  // T.3H: each graded item is the session's item in the same place, so a result is never shown against other questions.
  if (r && (r.perItem.length !== s.items.length || !r.perItem.every((p, n) => !!p && p.questionId === s.items![n].questionId && typeof p.earned === 'number' && typeof p.max === 'number'
    && typeof p.correct === 'boolean' && typeof p.answered === 'boolean' && (p.revision === undefined || p.revision === s.items![n].revision) && (p.hash === undefined || p.hash === s.items![n].hash)))) return 'result does not match its items';
  return undefined;
}
function reviewProblem(id: string, raw: unknown): string | undefined {
  const r = raw as Partial<ReviewRecord> | null;
  if (!r || typeof r !== 'object' || typeof r.questionId !== 'string' || !['new', 'reviewing', 'mastered'].includes(r.status as string) || typeof r.correctStreak !== 'number' || !Array.isArray(r.attempts)) return 'review fields';
  if (r.questionId !== id) return 'review filed under another question';
  if (!r.attempts.every(a => !!a && typeof a.revision === 'number' && typeof a.correct === 'boolean' && isTime(a.at) && (a.hash === undefined || typeof a.hash === 'string') && isHashVersion(a.hashVersion))) return 'review attempts';
  return undefined;
}

const quarantineId = (q: Omit<Quarantined, 'id'>) => digestOf(JSON.stringify([q.kind, q.key ?? null, q.raw ?? null]));
/** Sessions and reviews as stored: the readable ones, and the rest kept in quarantine. */
function sorted(d: Partial<TrialStore>): TrialStore {
  const quarantine: Quarantined[] = [], held = new Set<string>();
  // T.3I: each set-aside record once, with its id; one kept before T.3I gets its id from what it holds.
  const hold = (q: Quarantined) => { const id = typeof q.id === 'string' ? q.id : quarantineId(q); if (!held.has(id)) { held.add(id); quarantine.push({ ...q, id }); } };
  for (const q of Array.isArray(d.quarantine) ? d.quarantine : []) if (q && typeof q === 'object') hold(q as Quarantined);
  const sessions: ExamSession[] = [], ids = new Set<string>();
  for (const raw of Array.isArray(d.sessions) ? d.sessions : []) {
    const problem = sessionProblem(raw) ?? (ids.has((raw as ExamSession).id) ? 'a second session with this id' : undefined);
    if (problem) hold({ kind: 'session', reason: problem, raw });
    else { sessions.push(raw as ExamSession); ids.add((raw as ExamSession).id); }
  }
  const reviews: Reviews = {};
  for (const [id, raw] of Object.entries(d.reviews && typeof d.reviews === 'object' ? d.reviews : {})) {
    const problem = reviewProblem(id, raw);
    if (problem) hold({ kind: 'review', key: id, reason: problem, raw });
    else reviews[id] = raw as ReviewRecord;
  }
  return { version: TRIALS_VERSION, sessions, reviews, quarantine };
}

/** The content a version-1 attempt answered, read from the session it names; unchanged when no session confirms it. */
function confirmed(attempt: ReviewAttempt, questionId: string, sessions: ExamSession[]): ReviewAttempt {
  if (attempt.hash !== undefined || !attempt.sessionId) return attempt;
  const s = sessions.find(x => x.id === attempt.sessionId), item = s?.items.find(i => i.questionId === questionId && i.revision === attempt.revision);
  if (!s || !item) return attempt;
  const hashVersion = item.hashVersion ?? hashVersionOf(item.hash);
  return { ...attempt, hash: item.hash, ...hashVersion ? { hashVersion } : {}, ...s.examId ? { examId: s.examId } : {}, paperId: s.paperId, paperVersion: s.paperVersion };
}

/** T.3H: version-1 data as version 2. Pure: the same text always gives the same store. */
export function migrateV1(d: Partial<TrialStore>): TrialStore {
  const store = sorted({ sessions: d.sessions, reviews: d.reviews });
  const reviews = Object.fromEntries(Object.entries(store.reviews).map(([id, r]) => [id, { ...r, attempts: r.attempts.map(a => confirmed(a, id, store.sessions)) }]));
  return { ...store, reviews };
}

/** T.3H: the version-1 form of a store, for a site rolled back to version 1 (it reads sessions and reviews only). */
export const downgradeToV1 = (store: TrialStore) => JSON.stringify({ version: 1, sessions: store.sessions, reviews: store.reviews });

export function parseTrials(raw: string | null): LoadedTrials {
  if (raw === null) return { store: emptyTrials(), writable: true };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { store: emptyTrials(), writable: true, backup: raw, backupReason: 'unreadable' }; }
  const version = (data as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > TRIALS_VERSION) return { store: emptyTrials(), writable: false };
  if (version === 1) return { store: migrateV1(data as Partial<TrialStore>), writable: true, migrated: { from: 1, raw } };
  if (version !== TRIALS_VERSION) return { store: emptyTrials(), writable: true, backup: raw, backupReason: 'unknown-version' };
  return { store: sorted(data as Partial<TrialStore>), writable: true };
}

/** Keeps every unfinished session and the newest ended ones of each paper. */
function capped(sessions: ExamSession[]): ExamSession[] {
  const ended = new Map<string, number>();
  return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).filter(s => {
    if (s.status === 'in-progress') return true;
    const n = (ended.get(s.paperId) ?? 0) + 1;
    ended.set(s.paperId, n);
    return n <= KEPT_PER_PAPER;
  }).reverse();
}

/**
 * Adds or replaces an unfinished session; a session that has just been graded is also folded into the review book once.
 * T.3H: an ended session is never replaced, so a graded result is never regraded or edited and an abandoned session
 * never runs again.
 */
export function putSession(store: TrialStore, session: ExamSession): TrialStore {
  const old = store.sessions.find(s => s.id === session.id);
  if (old && old.status !== 'in-progress') return store;
  const graded = !old?.result && !!session.result;
  return {
    ...store,
    sessions: capped([...store.sessions.filter(s => s.id !== session.id), session]),
    reviews: graded ? recordSession(store.reviews, session) : store.reviews,
  };
}

/** The paper's unfinished session, if any (there is at most one: starting a new one abandons the old). */
export const openSessionOf = (store: TrialStore, paperId: string) => store.sessions.find(s => s.paperId === paperId && s.status === 'in-progress');
export const getSession = (store: TrialStore, id: string) => store.sessions.find(s => s.id === id);
export const endedSessionsOf = (store: TrialStore, paperId: string) => store.sessions.filter(s => s.paperId === paperId && s.result).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
