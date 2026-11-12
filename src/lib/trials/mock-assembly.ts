import type { MockBlueprint } from '@/content/trials/mock-exams';
import { currentRevisionOf, isPlayable, revisionHash, syllabusCodeOf, syllabusOf, type ExamPaper, type Question, type Source, type Tag } from '@/content/trials/schema';
import { drawProblems, type DrawItem, type DrawSpec } from './draw';

/*
 * T.2D/T.2E: a mock blueprint becomes papers only from published content (docs/exam-system/21 §3). The pool of a
 * subject is the questions whose current revision is published through the T.2C gate — its publication record names
 * that revision and its hash — or was published before T.2C (its hash recorded in published-hashes.json). In review,
 * approved, stale or mismatched content never joins the pool, and nothing else fills a gap: while the pool cannot meet
 * every syllabus quota the blueprint is not ready and the exam stays 「題目準備中」.
 *
 * A ready blueprint gives one generated paper per mode (official-style, extended-practice): its items are the pool,
 * pinned to the published revisions, and each session draws its 50 (src/lib/trials/draw.ts).
 *
 * T.3B: any exam's blueprint. A question's syllabus item comes from its tags' `syllabus` (the tag registry is passed in),
 * the question types, result display and the minimum published pool from the blueprint itself.
 */
export type TagIndex = ReadonlyMap<string, Tag>;
export interface AssemblyReport {
  blueprintId: string;
  /** The blueprint or the bank is wrong: no paper can be built, published or not. */
  errors: string[];
  /** Subject questions left out of the pool because their current revision is not published (yet). */
  pending: string[];
  /** Why the published pool cannot draw a paper yet (a syllabus item short of questions). */
  shortages: string[];
  /** The published pool, as the draw sees it. */
  pool: DrawItem[];
  papers: ExamPaper[];
}

/** The bank's questions of the blueprint's subject. */
export const subjectQuestions = (bp: MockBlueprint, questions: Question[]) => questions.filter(q => q.appearances.some(a => a.subjectId === bp.subjectId));

/** What must hold for any pool of the blueprint, published or not: the bank can fill every quota, conflicts are sound. */
export function checkBlueprint(bp: MockBlueprint, questions: Question[], conflicts: [string, string][], tags: TagIndex): string[] {
  const errors: string[] = [], byId = new Map(questions.map(q => [q.id, q])), mine = subjectQuestions(bp, questions);
  const total = Object.values(bp.coverage).reduce((a, n) => a + n, 0);
  if (total !== bp.questionCount) errors.push(`${bp.id}: coverage adds up to ${total}, not ${bp.questionCount}`);
  if (bp.publication.minimumPool < bp.questionCount) errors.push(`${bp.id}: the minimum published pool (${bp.publication.minimumPool}) is smaller than a paper (${bp.questionCount})`);
  if (!bp.questionTypes.length) errors.push(`${bp.id}: names no question type`);
  if (!bp.shapes === !bp.shapeMax) errors.push(`${bp.id}: needs either per-item shape targets or paper shape limits`);
  if (bp.shapes) for (const [code, n] of Object.entries(bp.coverage)) {
    const shape = bp.shapes[code];
    if (!shape || shape.reduce((a, x) => a + x, 0) !== n) errors.push(`${bp.id}: shape targets of ${code} do not add up to ${n}`);
  }
  if (bp.sampling === 'uniform' && bp.shapes) errors.push(`${bp.id}: a uniform draw keeps paper shape limits, not per-item targets`);
  if (bp.shapeMax && bp.shapeMax.reduce((a, x) => a + x, 0) < bp.questionCount) errors.push(`${bp.id}: the shape limits allow fewer than ${bp.questionCount} questions`);
  for (const q of mine) {
    if (!bp.questionTypes.includes(q.type)) errors.push(`${bp.id}: ${q.id} is a ${q.type} question, not ${bp.questionTypes.join(' or ')}`);
    if (!q.appearances.every(a => a.subjectId === bp.subjectId)) errors.push(`${bp.id}: ${q.id} belongs to another subject too`);
    const { item, problem } = syllabusOf(q, tags);
    if (!item) errors.push(`${bp.id}: ${q.id} has no syllabus item of the blueprint (${problem})`);
    else if (!(item.code in bp.coverage)) errors.push(`${bp.id}: ${q.id} has no syllabus item of the blueprint (${item.code})`);
  }
  for (const [a, b] of conflicts) {
    const x = byId.get(a), y = byId.get(b);
    if (!x || !y || a === b) { errors.push(`conflict ${a}/${b} names an unknown question or one question twice`); continue; }
    const subject = (q: Question) => q.appearances.map(p => p.subjectId).join();
    if (subject(x) !== subject(y)) errors.push(`conflict ${a}/${b} joins two subjects`);
  }
  return errors;
}

/**
 * T.3B: syllabus items the whole bank (published or not) cannot fill yet — a bank still being written (CCAR-F batch A).
 * Not an error of the blueprint: the published pool is short too, so no paper is built.
 */
export function bankShortages(bp: MockBlueprint, questions: Question[], tags: TagIndex): string[] {
  const mine = subjectQuestions(bp, questions);
  return Object.entries(bp.coverage).flatMap(([code, n]) => {
    const have = mine.filter(q => syllabusCodeOf(q, tags) === code).length;
    return have < n ? [`${bp.id}: the bank has ${have} questions for ${code}, a paper needs ${n}`] : [];
  });
}

/** The published revision of a question that a paper may use, or why it may not be used. */
export function publishedRevision(q: Question, sources: Map<string, Source>, recorded: Record<string, string>): { revision?: number; reason?: string } {
  const rev = currentRevisionOf(q);
  if (!rev) return { reason: 'no current revision' };
  const hash = revisionHash(rev), key = `${q.id}@${rev.revision}`, pub = q.review.publication;
  if (q.review.status !== 'published' || !isPlayable(q, sources)) return { reason: `${q.review.status}, not published` };
  if (pub) {
    if (pub.revision !== rev.revision || pub.hash !== hash) return { reason: `stale publication record (r${pub.revision} ${pub.hash}, content r${rev.revision} ${hash})` };
    if (recorded[key] !== hash) return { reason: `published hash missing or different for ${key}` };
    return { revision: rev.revision };
  }
  // Published before T.2C: only its recorded hash vouches for it.
  if (recorded[key] !== hash) return { reason: `no publication record and no recorded hash for ${key}` };
  return { revision: rev.revision };
}

/** The draw's view of a question: id, pinned revision and hash, syllabus item and shape. */
export const drawItemOf = (q: Question, revision: number, tags: TagIndex): DrawItem => {
  const rev = q.revisions.find(r => r.revision === revision)!;
  return { questionId: q.id, revision, hash: revisionHash(rev), code: syllabusCodeOf(q, tags) ?? '', ...q.stemShape ? { shape: q.stemShape } : {} };
};

/** Production assembly: papers only when the published pool can fill every quota; otherwise the report says why not. */
/** The draw spec of a blueprint over a pool: its quotas, its shape rule and the conflict pairs inside the pool. */
export const drawSpecOf = (bp: MockBlueprint, conflicts: [string, string][], ids: Set<string>): DrawSpec => ({
  count: bp.questionCount, coverage: bp.coverage, ...bp.shapes ? { shapes: bp.shapes } : {}, ...bp.shapeMax ? { shapeMax: bp.shapeMax } : {}, ...bp.sampling ? { sampling: bp.sampling } : {},
  conflicts: conflicts.filter(([a, b]) => ids.has(a) && ids.has(b)),
});

export function assembleMockPapers(bp: MockBlueprint, questions: Question[], sources: Map<string, Source>, recorded: Record<string, string>, conflicts: [string, string][], tags: TagIndex): AssemblyReport {
  const errors = checkBlueprint(bp, questions, conflicts, tags), pending: string[] = [], pool: DrawItem[] = [];
  for (const q of subjectQuestions(bp, questions)) {
    const { revision, reason } = publishedRevision(q, sources, recorded);
    if (revision === undefined) pending.push(`${q.id}: ${reason}`);
    else pool.push(drawItemOf(q, revision, tags));
  }
  const codes = Object.keys(bp.coverage);
  pool.sort((x, y) => codes.indexOf(x.code) - codes.indexOf(y.code) || x.questionId.localeCompare(y.questionId));
  const ids = new Set(pool.map(p => p.questionId));
  const spec = drawSpecOf(bp, conflicts, ids);
  const shortages = drawProblems(pool, spec);
  if (pool.length < bp.publication.minimumPool) shortages.push(`${pool.length} published, the blueprint needs at least ${bp.publication.minimumPool}`);
  const ready = !errors.length && !shortages.length;
  return { blueprintId: bp.id, errors, pending, shortages, pool, papers: ready ? bp.modes.map(m => paperOf(bp, m, pool, spec)) : [] };
}

export const paperOf = (bp: MockBlueprint, mode: MockBlueprint['modes'][number], pool: DrawItem[], draw: DrawSpec): ExamPaper => ({
  id: `${bp.id}-${mode.idSuffix}`, kind: 'generated', examMode: mode.examMode, subjectId: bp.subjectId, title: `${bp.title} ${mode.titleSuffix}`,
  description: bp.description, durationMinutes: mode.durationMinutes,
  items: pool.map(p => ({ questionId: p.questionId, revision: p.revision, points: bp.pointsPerQuestion })), draw,
  // Options keep their written order: the explanations name them by letter.
  shuffle: { questions: false, options: false },
  ...mode.passPoints !== undefined ? { passPoints: mode.passPoints, passBasis: mode.passBasis } : {},
  note: mode.note, modes: ['mock'], version: bp.version,
  modeLabel: mode.titleSuffix, questionTypes: bp.questionTypes, result: bp.result,
});

/** The papers the site may build. None, until enough iPAS questions are published to fill a subject's quotas. */
export const readyMockPapers = (blueprints: MockBlueprint[], questions: Question[], sources: Map<string, Source>, recorded: Record<string, string>, conflicts: [string, string][], tags: TagIndex) =>
  blueprints.flatMap(bp => assembleMockPapers(bp, questions, sources, recorded, conflicts, tags).papers);
