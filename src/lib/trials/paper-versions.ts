import { currentRevisionOf, isPlayable, paperOriginOf, revisionHash, withdrawnItems, type ExamPaper, type Question, type Source, type TrialBank } from '@/content/trials/schema';
import { canonical } from './integrity';
import type { ExamOf } from './lifecycle';

/*
 * Shared Trial System T.3G: fixed paper versions (docs/exam-system/31 §5–7).
 *
 * A fixed paper is its items, and each item is a question in one revision. The registry
 * (src/content/trials/paper-versions.json) records every version of every fixed paper exactly: each item's question,
 * revision, content hash and points, with the paper's exam, subject, time and pass mark. It is append-only. So:
 *
 *   - a version, once registered, never changes: a paper whose items resolve to other revisions or hashes than its
 *     registered version is an unannounced substitution and fails;
 *   - a session of an earlier version stays identifiable (paper id + version name the exact questions it held);
 *   - withdrawing a question puts its paper under maintenance (schema.ts withdrawnItems) until a human writes a new
 *     version without it; planPaperRevision proposes that version and never picks a replacement question.
 *
 * Nothing here writes; the integrity CLI appends a new version after a human changed the paper (--append --confirm N).
 */
export const PAPER_VERSIONS_FORMAT = 'logic-island.trials-paper-versions/1';
export interface PaperVersionItem { questionId: string; revision: number; hash: string; points: number }
export interface PaperVersion {
  paperId: string; version: string; exam: string; subjectId: string; durationMinutes: number; passPoints?: number;
  items: PaperVersionItem[];
}
export interface PaperVersions { format: typeof PAPER_VERSIONS_FORMAT; note: string; versions: PaperVersion[] }

const key = (v: { paperId: string; version: string }) => `${v.paperId}@${v.version}`;

/** A fixed paper as it stands now, every item pinned to its revision and content hash. */
export function paperVersionOf(paper: ExamPaper, questions: ReadonlyMap<string, Question>, subjectExam: (subjectId: string) => string | undefined): PaperVersion {
  return {
    paperId: paper.id, version: paper.version, exam: subjectExam(paper.subjectId) ?? '(unknown)', subjectId: paper.subjectId, durationMinutes: paper.durationMinutes,
    ...paper.passPoints !== undefined ? { passPoints: paper.passPoints } : {},
    items: paper.items.map(it => {
      const q = questions.get(it.questionId), rev = q && (it.revision !== undefined ? q.revisions.find(r => r.revision === it.revision) : currentRevisionOf(q));
      return { questionId: it.questionId, revision: rev?.revision ?? -1, hash: rev ? revisionHash(rev) : '(missing)', points: it.points };
    }),
  };
}

export const subjectExamOf = (bank: Pick<TrialBank, 'subjects' | 'editions'>) => (subjectId: string) =>
  bank.editions.find(e => e.id === bank.subjects.find(s => s.id === subjectId)?.editionId)?.examId;

export interface PaperVersionReport {
  problems: string[];
  /** Fixed paper versions in the bank that the registry does not hold yet (a human changed a paper). */
  unregistered: PaperVersion[];
  /** Fixed papers under maintenance: their withdrawn items. */
  maintenance: { paperId: string; version: string; withdrawn: string[] }[];
  registered: number;
}

/** The registry against the bank: its format, each registered version still readable, each fixed paper as registered. */
export function checkPaperVersions(registry: PaperVersions | undefined, bank: TrialBank, examOf: ExamOf): PaperVersionReport {
  const problems: string[] = [], unregistered: PaperVersion[] = [], maintenance: PaperVersionReport['maintenance'] = [];
  if (!registry) return { problems: ['no paper version registry given (src/content/trials/paper-versions.json)'], unregistered, maintenance, registered: 0 };
  if (registry.format !== PAPER_VERSIONS_FORMAT) problems.push(`paper versions: format is "${PAPER_VERSIONS_FORMAT}"`);
  const questions = new Map(bank.questions.map(q => [q.id, q])), subjectExam = subjectExamOf(bank);
  const seen = new Map<string, PaperVersion>();
  for (const v of registry.versions ?? []) {
    if (seen.has(key(v))) problems.push(`paper version ${key(v)}: registered twice`);
    seen.set(key(v), v);
    // A registered version stays identifiable: every item's revision still exists with that content.
    for (const it of v.items) {
      const q = questions.get(it.questionId), rev = q?.revisions.find(r => r.revision === it.revision);
      if (!q) problems.push(`paper version ${key(v)}: ${it.questionId} is not in the bank`);
      else if (!rev) problems.push(`paper version ${key(v)}: ${it.questionId} has no revision ${it.revision}`);
      else if (revisionHash(rev) !== it.hash) problems.push(`paper version ${key(v)}: ${it.questionId} r${it.revision} is not the content ${it.hash}`);
      else if (examOf(q) !== undefined && examOf(q) !== v.exam) problems.push(`paper version ${key(v)}: ${it.questionId} belongs to ${examOf(q)}`);
    }
  }
  for (const p of bank.papers.filter(x => x.kind === 'fixed')) {
    const now = paperVersionOf(p, questions, subjectExam), was = seen.get(key(now));
    if (!was) unregistered.push(now);
    else if (canonical(was) !== canonical(now)) {
      const changed = now.items.filter((it, i) => canonical(it) !== canonical(was.items[i])).map(it => it.questionId);
      problems.push(`paper ${key(now)}: differs from its registered version${changed.length ? ` (${changed.join(', ')})` : ' (paper settings or item count)'}: a change to a fixed paper is a new version, never a silent substitution`);
    }
    const withdrawn = withdrawnItems(p, questions);
    if (withdrawn.length) maintenance.push({ paperId: p.id, version: p.version, withdrawn });
  }
  return { problems, unregistered, maintenance, registered: seen.size };
}

/** Problems that stop a release: registry problems and fixed paper versions it does not hold. */
export const paperVersionFailures = (r: PaperVersionReport) => [...r.problems, ...r.unregistered.map(v => `paper ${key(v)}: not in the paper version registry (register it: trials:integrity --append)`)];

/** The registry at `head` keeps every version of `base` exactly. */
export function paperVersionsAppendOnly(base: PaperVersions, head: PaperVersions): string[] {
  const now = new Map((head.versions ?? []).map(v => [key(v), v]));
  return (base.versions ?? []).flatMap(v => !now.has(key(v)) ? [`paper version ${key(v)}: removed from the registry`]
    : canonical(now.get(key(v))) !== canonical(v) ? [`paper version ${key(v)}: changed in the registry (versions are append-only)`] : []);
}

/** The registry with `added` appended (never replacing a version). */
export const appendPaperVersions = (registry: PaperVersions, added: PaperVersion[]): PaperVersions => ({ ...registry, versions: [...registry.versions, ...added] });

export interface PaperRevisionPlan { ok: boolean; errors: string[]; paper?: ExamPaper; entry?: PaperVersion; removed: string[]; decisions: string[] }
/**
 * Proposes the next version of a fixed paper under maintenance: the same items in the same order without the withdrawn
 * ones, each pinned to its revision, under a new version name. Nothing replaces a removed question, and what the removal
 * changes (the total, the pass mark, an official paper no longer whole) is listed for the human who decides. A proposal
 * only: the caller writes nothing.
 *
 * T.3H (docs/exam-system/32 §6): never for an official original — without one of its questions it is no longer the
 * official paper, so it keeps its identity (under maintenance, or retired by a human); planAdaptedPaper proposes an
 * adapted practice paper under an id of its own instead.
 */
export function planPaperRevision(paper: ExamPaper, bank: TrialBank, sources: ReadonlyMap<string, Source>, version: string): PaperRevisionPlan {
  const errors: string[] = [], decisions: string[] = [], questions = new Map(bank.questions.map(q => [q.id, q]));
  if (paper.kind !== 'fixed') errors.push(`${paper.id}: only a fixed paper has versions of its own (a generated paper draws from the published pool)`);
  if (paperOriginOf(paper, questions) === 'official-original') errors.push(`${paper.id}: an official original is never revised without its questions under its own id; keep it under maintenance, retire it, or propose an adapted practice paper (planAdaptedPaper)`);
  const removed = withdrawnItems(paper, questions);
  if (!removed.length) errors.push(`${paper.id}: holds no withdrawn question; nothing to revise`);
  if (version === paper.version || !/^\d+\.\d+\.\d+$/.test(version)) errors.push(`${paper.id}: the new version is a new x.y.z name (now ${paper.version})`);
  const kept = paper.items.filter(it => !removed.includes(it.questionId));
  if (removed.length && !kept.length) errors.push(`${paper.id}: every item is withdrawn; the paper stays under maintenance`);
  const unplayable = kept.filter(it => !isPlayable(questions.get(it.questionId)!, sources as Map<string, Source>)).map(it => it.questionId);
  if (unplayable.length) errors.push(`${paper.id}: ${unplayable.join(', ')} cannot be kept (not published)`);
  if (errors.length) return { ok: false, errors, removed, decisions };
  const next: ExamPaper = { ...paper, version, items: kept.map(it => ({ ...it, revision: it.revision ?? questions.get(it.questionId)!.currentRevision })) };
  const before = paper.items.reduce((a, i) => a + i.points, 0), after = kept.reduce((a, i) => a + i.points, 0);
  decisions.push(`total ${before} → ${after} points (${paper.items.length} → ${kept.length} questions): the description and note must say so`);
  if (paper.passPoints !== undefined) decisions.push(`pass mark ${paper.passPoints} was ${Math.round(paper.passPoints / before * 100)}% of ${before}; it would be ${Math.round(paper.passPoints / after * 100)}% of ${after}: a human sets the new one`);
  const entry = paperVersionOf(next, questions, subjectExamOf(bank));
  return { ok: true, errors, paper: next, entry, removed, decisions };
}

/**
 * T.3H (docs/exam-system/32 §6): proposes an adapted practice paper from a fixed paper under maintenance (an official
 * original, typically): a new id, version 1.0.0 unless given, `adaptedFrom` naming the paper and version it comes from,
 * the kept items pinned to their revisions, and a title that no longer says 原卷. Nothing replaces a removed question,
 * and no pass mark is carried over: the total, the pass mark, the wording and what becomes of the original stay human
 * decisions, listed in `decisions`. A proposal only: the caller writes nothing and registers nothing.
 */
export function planAdaptedPaper(original: ExamPaper, bank: TrialBank, sources: ReadonlyMap<string, Source>, id: string, version = '1.0.0'): PaperRevisionPlan {
  const errors: string[] = [], decisions: string[] = [], questions = new Map(bank.questions.map(q => [q.id, q]));
  if (original.kind !== 'fixed') errors.push(`${original.id}: only a fixed paper is adapted`);
  if (id === original.id || bank.papers.some(p => p.id === id)) errors.push(`${id}: an adapted paper needs an id of its own, unused`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`${id}: the version is x.y.z`);
  const removed = withdrawnItems(original, questions), kept = original.items.filter(it => !removed.includes(it.questionId));
  if (!removed.length) errors.push(`${original.id}: holds no withdrawn question; nothing to adapt`);
  if (removed.length && !kept.length) errors.push(`${original.id}: every item is withdrawn; nothing to adapt`);
  const unplayable = kept.filter(it => !isPlayable(questions.get(it.questionId)!, sources as Map<string, Source>)).map(it => it.questionId);
  if (unplayable.length) errors.push(`${original.id}: ${unplayable.join(', ')} cannot be kept (not published)`);
  if (errors.length) return { ok: false, errors, removed, decisions };
  const { passPoints: _pass, passBasis: _basis, retired: _retired, ...rest } = original;
  void _pass; void _basis; void _retired;
  const title = /原卷/.test(original.title) ? original.title.replace(/原卷/g, '改編練習卷') : `${original.title}（改編練習卷）`;
  const paper: ExamPaper = {
    ...rest, id, version, title, adaptedFrom: { paperId: original.id, version: original.version },
    items: kept.map(it => ({ ...it, revision: it.revision ?? questions.get(it.questionId)!.currentRevision })),
  };
  const before = original.items.reduce((a, i) => a + i.points, 0), after = kept.reduce((a, i) => a + i.points, 0);
  decisions.push(
    `total ${before} → ${after} points (${original.items.length} → ${kept.length} questions): a human decides whether that total stands`,
    original.passPoints !== undefined ? `pass mark: ${original.passPoints} of ${before} is not carried over; a human sets one or none` : 'pass mark: none, as on the original; a human confirms',
    `title "${title}", description and note: a human writes them; they must say it is an adapted practice paper and which questions are missing`,
    `${original.id}: stays under maintenance, or a human retires it; it is never served with fewer questions as the original`,
  );
  return { ok: true, errors, paper, entry: paperVersionOf(paper, questions, subjectExamOf(bank)), removed, decisions };
}
