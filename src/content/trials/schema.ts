/*
 * Shared Trial System T.0 (Exam Engine MVP): the question bank's shape and the checks it must pass (validateTrials),
 * after docs/exam-system/04_QUESTION_SCHEMA.md. Static data, like the curriculum: exams, their editions and subjects,
 * sources, tags, questions with their revisions, papers and entry points. The learner's sessions and review records
 * live in the browser (src/lib/trials/store.ts), never here, and nothing here knows about the 3D world.
 */

export const QUESTION_TYPES = ['single-choice', 'multiple-choice', 'multiple-response', 'true-false', 'fill-in', 'code-reading', 'code-implementation', 'essay'] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
/**
 * The types the engine can render and grade: one correct option, or (T.3B) `multiple-response` — the learner selects
 * exactly `answer.select` options, and only the exact set of correct options scores (Logic Island's rule, no partial
 * credit). `multiple-choice` (any number of correct options, unstated) stays unsupported.
 */
export const MVP_TYPES = ['single-choice', 'code-reading', 'multiple-response'] as const satisfies readonly QuestionType[];

// ---- content ---------------------------------------------------------------------------------------------------
export const CODE_LANGUAGES = ['C', 'C++', 'Java', 'Python', 'JavaScript', 'SQL', 'pseudocode'] as const;
export type CodeLanguage = typeof CODE_LANGUAGES[number];
/** Text may hold `inline code` between backticks (rendered by Rich). */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'code'; language: CodeLanguage; text: string; indentationPreserved: boolean }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; head: string[]; rows: string[][]; caption?: string }
  /** No formula renderer is installed (04 §2.7): `fallback` is what the page shows. */
  | { type: 'math'; tex: string; fallback: string }
  /** Assets are not part of the MVP; validateTrials rejects images in published questions. */
  | { type: 'image'; assetId: string };
export type Content = Block[];

// ---- catalog -----------------------------------------------------------------------------------------------------
export type ExamFamily = 'certification' | 'civil-service' | 'recruitment' | 'school-assessment';
/** Content status, never a learner's progress: available once a paper can be taken. */
export type ExamStatus = 'planned' | 'available' | 'retired';
export interface Exam {
  id: string;
  name: string;
  nameEn: string;
  issuer: string;
  family: ExamFamily;
  /** The archipelago it belongs to (src/content/world regions), for grouping; where its entries sit is entries.ts. */
  archipelago: 'cs' | 'ai';
  official: { url: string; sourceId: string };
  disclaimer: string;
  /**
   * T.3B: how the codes of this exam's official syllabus are written (regular expressions over the whole code): an item
   * (iPAS L11101, CCAR-F D1.1) and the topic it sits under (L111, D1). Required before any tag may carry an item of it.
   */
  syllabusCodes?: { item: string; topic: string };
}
export interface ExamEdition {
  id: string;
  examId: string;
  label: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  basis: { sourceId: string; checkedAt: string }[];
  reviewBy: string;
}
export interface ExamSubject {
  id: string;
  editionId: string;
  name: string;
  /** The official format as far as the basis states it; unknown values are left out, never guessed. */
  format: { durationMinutes?: number; questionCount?: number; totalPoints?: number; passPoints?: number };
  questionTypes: QuestionType[];
  note?: string;
  /**
   * T.2B-1: how Logic Island scores its own mock papers of this subject where the official format stops short (e.g. no
   * published points per question). Always Logic Island's rule, never presented as the official one; `note` says so.
   */
  mockScoring?: { pointsPerQuestion: number; passPoints: number; note: string };
}

// ---- sources and licences ----------------------------------------------------------------------------------------
/** There is deliberately no kind for privately compiled question banks: they are never collected. */
export type SourceKind = 'official-paper' | 'official-sample' | 'official-answer-key' | 'official-syllabus' | 'original-basis';
export type License = 'free-use-statute' | 'permission-granted' | 'unconfirmed' | 'original';
export interface Source {
  id: string;
  kind: SourceKind;
  issuer: string;
  title: string;
  url: string;
  retrievedAt: string;
  license: License;
  /** Required whenever a question from it must be credited. */
  attribution?: string;
  /** The document's own version or edition as printed on it (e.g. 115.06), when it has one. */
  version?: string;
  /** T.2B-1: an original basis names the official documents that set its scope (official-syllabus sources). */
  basedOn?: string[];
  /** T.2B-1: kept for research and statistics only; no question may cite it, so none of its text enters the bank. */
  researchOnly?: true;
}
export interface DisplayRights { text: boolean; options: boolean; answer: boolean; explanation: boolean; attributionRequired: boolean }
/** What a licence allows at most; a question may narrow it, never widen it. */
export const LICENSE_DISPLAY: Record<License, DisplayRights> = {
  'free-use-statute': { text: true, options: true, answer: true, explanation: true, attributionRequired: true },
  'permission-granted': { text: true, options: true, answer: true, explanation: true, attributionRequired: true },
  unconfirmed: { text: false, options: false, answer: false, explanation: false, attributionRequired: true },
  original: { text: true, options: true, answer: true, explanation: true, attributionRequired: false },
};

export type Origin = 'official-original' | 'official-sample' | 'original' | 'adapted-from-official';
export interface Provenance {
  origin: Origin;
  sourceId: string;
  locator?: { questionNumber: string; page?: number };
  fidelity?: string;
  excludedParts?: { part: string; reason: string }[];
}
export interface Appearance { kind: 'appeared-in' | 'targets'; subjectId: string; paperId?: string; number?: string; relevance?: 'core' | 'related' }

// ---- questions ---------------------------------------------------------------------------------------------------
export interface Option { id: string; label?: string; body: Content; fixedPosition?: boolean }
export type Answer =
  | {
    kind: 'choice'; correct: string[]; official: boolean; verifiedBy?: 'official-key' | 'executed' | 'hand-trace'; interpretationNote?: string;
    /** T.3B: how many options a multiple-response question asks for (it says so on the page); equals the correct count. */
    select?: number;
  }
  | { kind: 'text'; accept: string[]; normalize: string[]; official: boolean }
  | { kind: 'rubric'; criteria: { id: string; text: string; points?: number }[]; finalValue?: string; official: boolean };

export type ReviewCheck = 'answer-verified' | 'code-executed' | 'source-checked' | 'license-checked' | 'wording' | 'accessibility';
/**
 * A review. T.2C: a decision from the review ledger names the revision it was made on and that revision's hash, and
 * counts only for that exact content; reviews written in a batch file (no revision) are notes from before T.2C.
 */
export interface Review {
  by: string; reviewer: 'human' | 'ai'; at: string; verdict: 'approve' | 'changes' | 'reject'; checks: ReviewCheck[]; note?: string;
  revision?: number; hash?: string;
}
/** T.2C: the explicit act that put one revision on the site (src/content/trials/ledger.json). */
export interface Publication { revision: number; hash: string; by: string; at: string; note?: string }
export interface ReviewState {
  /** T.3F: `revoked` — published once, withdrawn through the ledger; never playable until published again. */
  status: 'draft' | 'generated' | 'in-review' | 'approved' | 'published' | 'retired' | 'revoked';
  /** Required when an AI model wrote the question. */
  generatedBy?: { model: string; at: string; note?: string };
  reviews: Review[];
  /** T.2C: present when the question was published through the publication gate (not for questions published before it). */
  publication?: Publication;
}

export interface QuestionRevision {
  revision: number;
  change: 'initial' | 'editorial' | 'content' | 'answer';
  note: string;
  at: string;
  /** Left out for metadata-only questions (licence unconfirmed). */
  stem?: Content;
  topicSummary?: string;
  options?: Option[];
  answer?: Answer;
  explanation?: {
    origin: 'official' | 'logic-island-original'; body: Content;
    /** T.3B: why each option is right or wrong, by option id (required for every option of a multiple-response question). */
    options?: { optionId: string; body: Content }[];
  };
  points?: number;
  difficulty?: { level: 1 | 2 | 3 | 4 | 5; basis: 'reviewer-estimate' | 'author-estimate' | 'measured' };
  display: DisplayRights;
  /**
   * T.3E (docs/exam-system/29 §2–3): which content hash identifies this revision. Absent: the legacy hash 1 of T.0–T.3D,
   * kept for every revision written before it so published hashes, ledger records and sessions stay valid. 2 also
   * covers the explanation and every option's explanation; the importer gives it to new questions and new revisions.
   */
  hashVersion?: 2;
}
/** T.3E: the content hash version the importer gives every new question and new revision. */
export const CURRENT_HASH_VERSION = 2 as const;

/** T.2B-1: what kind of thinking a stem asks for (plan 11 §3): recall a concept, apply it, or analyse a scenario. */
export const STEM_SHAPES = ['concept', 'application', 'scenario'] as const;
export type StemShape = typeof STEM_SHAPES[number];
/** Features of a stem's wording, alongside its shape: a negative stem is emphasised on the page (04 §2.3). */
export const STEM_TRAITS = ['negative', 'regulation', 'matching-in-options'] as const;
export type StemTrait = typeof STEM_TRAITS[number];

export interface Question {
  id: string;
  type: QuestionType;
  provenance: Provenance;
  appearances: Appearance[];
  tags: string[];
  /** Complete lessons (Lesson IDs), Interactive Lab Island labs (courses.ts slugs), world activities, planned islands. */
  links: { lessons?: string[]; labs?: string[]; activities?: string[]; plannedIslands?: string[] };
  review: ReviewState;
  currentRevision: number;
  /** Every published revision, oldest first; never edited or removed once published. */
  revisions: QuestionRevision[];
  retired?: { at: string; reason: string; replacedBy?: string };
  /*
   * T.2B-1 question metadata. Unlike a revision (frozen once published) these can change without a new revision; none
   * is part of revisionHash, so none touches a session's grade. They replace the never-used revision-level stemShape
   * and reviewBy of T.0.
   */
  stemShape?: StemShape;
  stemTraits?: StemTrait[];
  /** When the question must next be checked (fast-moving tools, rules); past due is a warning, never an automatic change. */
  reviewBy?: string;
  /**
   * T.3B: the public technical documents the answer is traced to, each with the date it was checked against them. Like
   * reviewBy, outside the revisions: rechecking a reference adds no revision.
   */
  references?: { title: string; url: string; checkedAt: string }[];
  /** T.3B: why the question can go out of date (a parameter, flag or file format), when it is tagged meta.volatile. */
  volatility?: { reason: string; checkedAt: string };
}

/**
 * T.2B-1: an item of an official syllabus, exactly as the syllabus names it. Only codes printed in the cited syllabus
 * are recorded; Logic Island's own sub-topics are ordinary tags without one.
 */
export interface SyllabusItem {
  /** The official code (e.g. L11101); the tag's id ends with it in lower case. */
  code: string;
  name: string;
  subjectId: string;
  /** The topic it sits under (e.g. L111 人工智慧概念). */
  parent: { code: string; name: string };
  /** The syllabus version, as printed on the source. */
  version: string;
  sourceId: string;
  /**
   * T.3B: `name` is Logic Island's Traditional Chinese rendering of the official wording, not the official text (CCAR-F:
   * the exam guide's licence is unconfirmed, so its task statements are paraphrased, never copied).
   */
  paraphrased?: true;
}
export interface Tag { id: string; name: string; lessons?: string[]; aliases?: string[]; syllabus?: SyllabusItem }

// ---- papers and entries ------------------------------------------------------------------------------------------
export interface PaperItem { questionId: string; revision?: number; points: number }
/**
 * T.2E: how a generated paper is drawn from its pool (src/lib/trials/draw.ts): `count` questions, exactly
 * `coverage[code]` per official syllabus item, keeping the conflict pairs apart and the shapes near target if possible.
 */
/**
 * T.3B: how a paper's result is shown (src/components/trials/result-report.tsx), set by its blueprint. `points` shows the
 * score and any pass verdict; `raw-correct` shows only the number right and the accuracy — for exams whose official score
 * is scaled with no published conversion, where Logic Island never shows an official-looking score or verdict.
 * `groupBy` is the syllabus level the per-item table reports: each item, or the topic (domain) above it.
 */
export interface ResultPolicy { score: 'points' | 'raw-correct'; groupBy: 'item' | 'topic'; notice?: string }

export interface PaperDraw {
  count: number;
  coverage: Record<string, number>;
  shapes?: Record<string, [number, number, number]>;
  /** T.3D: at most [concept, application, scenario] on the whole paper (instead of per-item targets). */
  shapeMax?: [number, number, number];
  /** T.3D: sample uniformly among the papers that keep every rule (src/lib/trials/draw.ts). */
  sampling?: 'uniform';
  conflicts: [string, string][];
}
/** T.2E: the official-style mock (the subject's official format) or the longer practice paper. */
export type ExamMode = 'official-style' | 'extended-practice';
export interface ExamPaper {
  id: string;
  /**
   * `fixed`: the items are the paper. `generated` (T.2E): the items are the published pool, and each session draws
   * `draw.count` of them by its seed.
   */
  kind: 'fixed' | 'generated';
  draw?: PaperDraw;
  examMode?: ExamMode;
  /** Where the pass mark comes from, when it is the official one rather than a practice line. */
  passBasis?: string;
  subjectId: string;
  title: string;
  description: string;
  durationMinutes: number;
  items: PaperItem[];
  shuffle: { questions: boolean; options: boolean };
  passPoints?: number;
  /** Why the paper's size or total differs from the official format, or what its pass mark means. */
  note?: string;
  modes: ('mock')[];
  version: string;
  /** T.3B: what a generated paper's blueprint sets — its mode's name, the question types it holds, how results show. */
  modeLabel?: string;
  questionTypes?: QuestionType[];
  result?: ResultPolicy;
  /**
   * T.3H (docs/exam-system/32 §6): an adapted practice paper, made from a fixed paper (an official original that lost a
   * question, usually) by a human: its own id, the paper and version it comes from; never named an original.
   */
  adaptedFrom?: { paperId: string; version: string };
  /** T.3H: retired by a human (YYYY-MM-DD, and why): it takes no new session; past results stay readable. */
  retired?: { since: string; reason: string };
}

export type TrialPlace = { kind: 'region'; regionId: 'cs' | 'ai' } | { kind: 'island'; islandId: string } | { kind: 'hub' };
export interface TrialEntry { id: string; examId: string; place: TrialPlace; label: string; order: number }

export interface TrialBank {
  exams: Exam[];
  editions: ExamEdition[];
  subjects: ExamSubject[];
  sources: Source[];
  tags: Tag[];
  questions: Question[];
  papers: ExamPaper[];
  entries: TrialEntry[];
}
/**
 * Questions written by the import flow (scripts/trials/import.ts) from one batch file in src/content/trials/batches:
 * src/content/trials/generated/<batch id>.json. Never edited by hand; change the batch file and import it again.
 */
export interface GeneratedBatch { format: 'logic-island.trials-generated/1'; batch: { id: string; title: string; file: string }; questions: Question[] }

/** What the bank is checked against: the rest of the site, supplied by the caller. */
export interface TrialContext { completeLessonIds: Set<string>; labIds: Set<string>; activityIds: Set<string>; islandIds: Set<string>; regionIds: Set<string> }

// ---- helpers -----------------------------------------------------------------------------------------------------
export const currentRevisionOf = (q: Question) => q.revisions.find(r => r.revision === q.currentRevision);
/** Questions a learner answers: the items of a fixed paper, the drawn count of a generated one (T.2E). */
export const paperQuestionCount = (p: ExamPaper) => p.kind === 'generated' && p.draw ? p.draw.count : p.items.length;
/** The points a learner can score; a generated paper gives every question the same points. */
export const paperTotalPoints = (p: ExamPaper) => p.kind === 'generated' && p.draw
  ? Math.round(p.draw.count * (p.items[0]?.points ?? 0) * 100) / 100
  : p.items.reduce((a, i) => a + Math.round(i.points * 100), 0) / 100;
/**
 * T.3G: the items of a fixed paper whose question was withdrawn (revoked). A paper holding any is under maintenance: it
 * takes no new session, its withdrawn questions never reach the site, and nothing replaces them; a new paper version
 * without them (docs/exam-system/31 §6) ends the maintenance. Generated papers draw from published questions only.
 */
export const withdrawnItems = (p: ExamPaper, questions: ReadonlyMap<string, Question>): string[] =>
  p.kind === 'fixed' ? p.items.filter(it => questions.get(it.questionId)?.review.status === 'revoked').map(it => it.questionId) : [];
/**
 * T.3H (docs/exam-system/32 §6): what a paper is. An official original is a fixed paper of official questions only,
 * not adapted from another: it keeps its identity, so it is never revised into a paper with fewer or other questions
 * under its own id. An adapted paper names its source. Anything else is a practice paper.
 */
export type PaperOrigin = 'official-original' | 'adapted' | 'practice';
export function paperOriginOf(p: ExamPaper, questions: ReadonlyMap<string, Question>): PaperOrigin {
  if (p.adaptedFrom) return 'adapted';
  return p.kind === 'fixed' && p.items.length > 0 && p.items.every(it => { const q = questions.get(it.questionId); return !!q && q.provenance.origin !== 'original'; }) ? 'official-original' : 'practice';
}
/** T.3H: whether a paper takes new sessions: retired (by a human), under maintenance (a withdrawn item) or open. */
export type PaperStatus = 'open' | 'maintenance' | 'retired';
export const paperStatusOf = (p: ExamPaper, questions: ReadonlyMap<string, Question>): PaperStatus =>
  p.retired ? 'retired' : withdrawnItems(p, questions).length ? 'maintenance' : 'open';
/** A question can be put on a paper and shipped to the site: published, fully displayable and of an MVP type. */
export function isPlayable(q: Question, sources: Map<string, Source>): boolean {
  const rev = currentRevisionOf(q), source = sources.get(q.provenance.sourceId);
  return !!rev && !!source && q.review.status === 'published' && !q.retired && (MVP_TYPES as readonly string[]).includes(q.type)
    && rev.display.text && rev.display.options && rev.display.answer && source.license !== 'unconfirmed';
}
const fnv1a = (text: string, basis: number) => {
  let h = basis;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};
/**
 * The content hash of a revision: what identifies it in the ledger, the published hashes and every session (FNV-1a
 * over a stable serialization; client-safe). Version 1 (legacy, 8 hex digits) covers what a learner sees and is graded
 * on: stem, options, answer (with the selection count) and points. Version 2 (`v2-` and 16 hex digits) also covers the
 * explanation and each option's explanation, so a reviewed explanation cannot change unnoticed. Neither covers review
 * or operational metadata (tags, references, volatility, difficulty, display rights): those never change what was
 * assessed. docs/exam-system/29 §2.
 */
export function revisionHash(rev: QuestionRevision): string {
  if (rev.hashVersion === 2) {
    const text = JSON.stringify(['v2', rev.stem, rev.options, rev.answer, rev.points, rev.explanation]);
    return `v2-${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x050c5d1f)}`;
  }
  return fnv1a(JSON.stringify([rev.stem, rev.options, rev.answer, rev.points]), 0x811c9dc5);
}
const blockText = (b: Block) => b.type === 'p' ? b.text : b.type === 'code' ? b.text : b.type === 'math' ? b.fallback : b.type === 'list' ? b.items.join('\n') : b.type === 'table' ? [...b.head, ...b.rows.flat()].join('|') : b.assetId;
export const contentText = (c: Content) => c.map(blockText).join('\n');
const ID = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;
/** A real calendar date written YYYY-MM-DD. */
export const isDate = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d.getTime()) && d.toISOString().startsWith(s); };
/** Questions whose review date has passed on `today` (YYYY-MM-DD): a warning to act on, never a change to the bank. */
export const overdueReviews = (questions: Question[], today: string) =>
  questions.filter(q => !q.retired && q.reviewBy !== undefined && q.reviewBy < today).map(q => ({ questionId: q.id, reviewBy: q.reviewBy! }));
const TWO_DECIMALS = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;

/**
 * T.3B: a question's official syllabus item, read from the `syllabus` of its tags (any exam: iPAS ipas.l11101 → L11101,
 * CCAR-F ccarf.d1-1 → D1.1), never from a tag's spelling. Resolves only with exactly one syllabus tag and no unknown tag;
 * otherwise `problem` says why (validateTrials reports the same questions), and the question joins no mock pool.
 */
export function syllabusOf(q: Question, tags: ReadonlyMap<string, Tag>): { item?: SyllabusItem; problem?: string } {
  const unknown = q.tags.filter(t => !tags.has(t));
  if (unknown.length) return { problem: `unknown tag ${unknown.join(', ')}` };
  const items = q.tags.flatMap(t => tags.get(t)!.syllabus ?? []);
  if (items.length > 1) return { problem: `several syllabus items (${items.map(i => i.code).join(', ')})` };
  return items.length ? { item: items[0] } : { problem: 'no syllabus item' };
}
export const syllabusCodeOf = (q: Question, tags: ReadonlyMap<string, Tag>) => syllabusOf(q, tags).item?.code;
/** The tag id suffix of a syllabus code: lower case, dots as hyphens (L11101 → l11101, D1.1 → d1-1). */
export const syllabusSlug = (code: string) => code.toLowerCase().replace(/\./g, '-');
/** T.3B: whether an item asks for several options (multiple-response); single-answer items take one. */
export const selectCountOf = (q: Question, rev: QuestionRevision) => q.type === 'multiple-response' && rev.answer?.kind === 'choice' ? rev.answer.select ?? rev.answer.correct.length : 1;

/**
 * T.2E: a generated paper draws `draw.count` questions of equal points from its pool; returns the drawn paper's total.
 * The pool can meet every syllabus quota, conflicts name pool questions, and an official-style paper keeps the subject's
 * official format (duration, question count, total and pass mark) exactly.
 */
function generatedPaperCheck(p: ExamPaper, questions: Map<string, Question>, tags: ReadonlyMap<string, Tag>, subject: ExamSubject | undefined, fail: (at: string, message: string) => void): number {
  const at = `paper ${p.id}`, d = p.draw;
  if (!d) { fail(at, 'a generated paper has a draw'); return 0; }
  const points = new Set(p.items.map(i => i.points)), each = [...points][0] ?? 0;
  if (points.size !== 1) fail(at, 'a generated paper gives every question the same points');
  if (Object.values(d.coverage).reduce((a, n) => a + n, 0) !== d.count) fail(at, `draw coverage adds up to ${d.count}`);
  for (const [code, n] of Object.entries(d.coverage)) {
    const have = p.items.filter(i => questions.get(i.questionId) && syllabusCodeOf(questions.get(i.questionId)!, tags) === code).length;
    if (have < n) fail(at, `${code}: the pool has ${have} questions, the draw needs ${n}`);
    const shape = d.shapes?.[code];
    if (shape && shape.reduce((a, x) => a + x, 0) !== n) fail(at, `${code}: shape targets add up to ${n}`);
  }
  if (d.shapeMax && d.shapeMax.reduce((a, x) => a + x, 0) < d.count) fail(at, `the shape limits allow fewer than ${d.count} questions`);
  const pool = new Set(p.items.map(i => i.questionId));
  for (const [a, b] of d.conflicts) if (!pool.has(a) || !pool.has(b) || a === b) fail(at, `conflict ${a}/${b} names two different pool questions`);
  if (!p.examMode) fail(at, 'a generated paper has an exam mode');
  const f = subject?.format;
  // T.3B: the official total and pass mark are kept where the subject states them; a subject without them (a scaled
  // score, CCAR-F) gets no total check and no pass verdict.
  if (p.examMode === 'official-style') {
    if (!f || f.durationMinutes !== p.durationMinutes || f.questionCount !== d.count || f.passPoints !== p.passPoints || (f.totalPoints !== undefined && f.totalPoints !== d.count * each))
      fail(at, 'an official-style paper keeps the subject\'s official duration, question count, total and pass mark');
    if (p.passPoints !== undefined && !p.passBasis) fail(at, 'an official pass mark names where it comes from');
  }
  for (const i of p.items) {
    const q = questions.get(i.questionId);
    if (q && p.questionTypes && !p.questionTypes.includes(q.type)) fail(at, `${q.id} is a ${q.type} question, not one of ${p.questionTypes.join(', ')}`);
  }
  if (p.result?.score === 'raw-correct' && p.passPoints !== undefined) fail(at, 'a paper that shows only the number right gives no pass verdict');
  if (p.examMode === 'extended-practice' && p.passPoints !== undefined) fail(at, 'an extended-practice paper gives no pass verdict');
  return d.count * each;
}

/** Every problem with the bank, as readable strings; an empty list means it may ship. */
export function validateTrials(bank: TrialBank, ctx: TrialContext): string[] {
  const problems: string[] = [];
  const fail = (at: string, message: string) => problems.push(`${at}: ${message}`);
  const index = <T extends { id: string }>(name: string, list: T[]) => {
    const map = new Map<string, T>();
    for (const item of list) {
      if (!ID.test(item.id)) fail(`${name} ${item.id}`, 'id must be kebab-case (dots separate levels)');
      if (map.has(item.id)) fail(`${name} ${item.id}`, 'duplicate id');
      map.set(item.id, item);
    }
    return map;
  };
  const exams = index('exam', bank.exams), editions = index('edition', bank.editions), subjects = index('subject', bank.subjects);
  const sources = index('source', bank.sources), tags = index('tag', bank.tags), questions = index('question', bank.questions);
  index('paper', bank.papers);
  index('entry', bank.entries);

  for (const e of bank.exams) if (!sources.has(e.official.sourceId)) fail(`exam ${e.id}`, `unknown source ${e.official.sourceId}`);
  for (const ed of bank.editions) {
    if (!exams.has(ed.examId)) fail(`edition ${ed.id}`, `unknown exam ${ed.examId}`);
    for (const b of ed.basis) if (!sources.has(b.sourceId)) fail(`edition ${ed.id}`, `unknown source ${b.sourceId}`);
  }
  for (const s of bank.subjects) {
    const at = `subject ${s.id}`, m = s.mockScoring, f = s.format;
    if (!editions.has(s.editionId)) fail(at, `unknown edition ${s.editionId}`);
    if (!m) continue;
    if (m.pointsPerQuestion <= 0 || !TWO_DECIMALS(m.pointsPerQuestion)) fail(at, 'mock points per question are positive with at most two decimals');
    if (!m.note.includes('Logic Island')) fail(at, 'the mock scoring note says it is Logic Island\'s rule, not the official one');
    const total = f.questionCount !== undefined ? f.questionCount * m.pointsPerQuestion : f.totalPoints;
    if (f.questionCount !== undefined && f.totalPoints !== undefined && Math.abs(total! - f.totalPoints) > 1e-9) fail(at, 'mock points per question times the official question count make the official total');
    if (m.passPoints <= 0 || (total !== undefined && m.passPoints > total)) fail(at, 'the mock pass mark lies within the total');
  }
  for (const t of bank.tags) {
    const at = `tag ${t.id}`, y = t.syllabus;
    for (const l of t.lessons ?? []) if (!ctx.completeLessonIds.has(l)) fail(at, `lesson ${l} is not a complete lesson`);
    if (!y) continue;
    // T.3B: each exam declares how its codes are written; a tag of an exam that declares none carries no syllabus item.
    const examOf = exams.get(editions.get(subjects.get(y.subjectId)?.editionId ?? '')?.examId ?? ''), rule = examOf?.syllabusCodes;
    if (examOf && !rule) fail(at, `exam ${examOf.id} declares no syllabus code format (syllabusCodes)`);
    else if (rule && (!new RegExp(`^(?:${rule.item})$`).test(y.code) || !new RegExp(`^(?:${rule.topic})$`).test(y.parent.code) || !y.code.startsWith(y.parent.code)))
      fail(at, `${y.code} is not an item code of ${examOf!.id} under its topic ${y.parent.code}`);
    if (!t.id.endsWith(`.${syllabusSlug(y.code)}`)) fail(at, `the id ends with the syllabus code (.${syllabusSlug(y.code)})`);
    if (!y.name.trim() || !y.parent.name.trim()) fail(at, 'a syllabus item and its topic have their official names');
    if (!subjects.has(y.subjectId)) fail(at, `unknown subject ${y.subjectId}`);
    const src = sources.get(y.sourceId);
    if (!src) fail(at, `unknown source ${y.sourceId}`);
    else if (src.kind !== 'official-syllabus') fail(at, `${y.sourceId} is not an official syllabus`);
    else if (src.version !== y.version) fail(at, `version ${y.version} is not the version of ${y.sourceId} (${src.version ?? 'none'})`);
  }
  for (const s of bank.sources) {
    const at = `source ${s.id}`;
    if (s.kind === 'original-basis' && s.license !== 'original') fail(at, 'an original basis is licensed as original');
    if (s.basedOn && s.kind !== 'original-basis') fail(at, 'only an original basis names the documents it is based on');
    for (const b of s.basedOn ?? []) if (sources.get(b)?.kind !== 'official-syllabus') fail(at, `${b} is not a known official syllabus`);
    if (s.researchOnly && (s.kind === 'original-basis' || s.license !== 'unconfirmed')) fail(at, 'research-only is for official documents whose licence is unconfirmed');
  }

  const onPaper = new Map<string, string[]>();
  for (const p of bank.papers) for (const it of p.items) onPaper.set(it.questionId, [...onPaper.get(it.questionId) ?? [], p.id]);

  for (const q of bank.questions) {
    const at = `question ${q.id}`, source = sources.get(q.provenance.sourceId);
    if (!source) { fail(at, `unknown source ${q.provenance.sourceId}`); continue; }
    if (source.researchOnly) fail(at, `source ${source.id} is for research only: no question cites it`);
    // Provenance: originals cite an original basis, official questions an official document.
    if (q.provenance.origin === 'original' && source.kind !== 'original-basis') fail(at, 'an original question cites an original basis');
    if (q.provenance.origin !== 'original' && source.kind === 'original-basis') fail(at, 'an official question cites an official source');
    if (q.provenance.origin === 'adapted-from-official' && source.license !== 'free-use-statute' && source.license !== 'permission-granted')
      fail(at, 'only freely usable or permitted questions may be adapted');
    if (source.license !== 'original' && !source.attribution) fail(at, `source ${source.id} needs an attribution`);
    // References.
    if (!q.appearances.length) fail(at, 'needs at least one appearance (an exam subject it belongs to)');
    for (const a of q.appearances) {
      if (!subjects.has(a.subjectId)) fail(at, `unknown subject ${a.subjectId}`);
      if (a.kind === 'appeared-in' && (!a.paperId || !a.number)) fail(at, 'an appearance in a paper names the paper and the number');
      if (a.kind === 'targets' && a.paperId) fail(at, 'a target names no paper');
    }
    if (!q.tags.length) fail(at, 'needs at least one tag');
    for (const t of q.tags) if (!tags.has(t)) fail(at, `unknown tag ${t}`);
    // T.3B: at most one official syllabus item, of a subject the question belongs to.
    const items = q.tags.flatMap(t => tags.get(t)?.syllabus ?? []);
    if (items.length > 1) fail(at, `has several syllabus items (${items.map(i => i.code).join(', ')}); a question tests one`);
    for (const i of items) if (!q.appearances.some(a => a.subjectId === i.subjectId)) fail(at, `syllabus item ${i.code} belongs to ${i.subjectId}, which the question does not target`);
    for (const r of q.references ?? []) if (!/^https:\/\//.test(r.url) || !r.title.trim() || !isDate(r.checkedAt)) fail(at, 'a reference has a title, an https URL and the date it was checked');
    if (q.volatility && (!q.tags.includes('meta.volatile') || !q.reviewBy || !isDate(q.volatility.checkedAt) || !q.volatility.reason.trim()))
      fail(at, 'a volatile question is tagged meta.volatile, has a reviewBy date, and says why and when it was checked');
    for (const l of q.links.lessons ?? []) if (!ctx.completeLessonIds.has(l)) fail(at, `lesson ${l} is not a complete lesson (planned ones go in plannedIslands)`);
    for (const l of q.links.labs ?? []) if (!ctx.labIds.has(l)) fail(at, `unknown lab ${l}`);
    for (const a of q.links.activities ?? []) if (!ctx.activityIds.has(a)) fail(at, `unknown activity ${a}`);
    for (const i of q.links.plannedIslands ?? []) if (!ctx.islandIds.has(i)) fail(at, `unknown island ${i}`);
    if (new Set(q.links.plannedIslands).size !== (q.links.plannedIslands ?? []).length) fail(at, 'lists a planned island twice');
    // T.2B-1 metadata.
    if (q.stemShape !== undefined && !(STEM_SHAPES as readonly string[]).includes(q.stemShape)) fail(at, `stemShape is ${STEM_SHAPES.join(', ')}`);
    if (q.stemTraits && (!q.stemTraits.every(t => (STEM_TRAITS as readonly string[]).includes(t)) || new Set(q.stemTraits).size !== q.stemTraits.length))
      fail(at, `stemTraits are distinct values of ${STEM_TRAITS.join(', ')}`);
    if (q.reviewBy !== undefined) {
      if (!isDate(q.reviewBy)) fail(at, 'reviewBy is a date (YYYY-MM-DD)');
      else if (q.revisions[0] && q.reviewBy <= q.revisions[0].at) fail(at, 'reviewBy comes after the question was written');
    }
    // Review state.
    const { status, generatedBy, reviews } = q.review;
    if (status === 'generated' && !generatedBy) fail(at, 'a generated question records what generated it');
    if (status === 'published' && generatedBy) {
      if (!reviews.some(r => r.reviewer === 'human' && r.verdict === 'approve')) fail(at, 'an AI-written question needs a human approval before it is published');
      if (!reviews.some(r => r.verdict === 'approve' && r.checks.includes('answer-verified'))) fail(at, 'an AI-written question needs a verified answer before it is published');
    }
    // T.2C: an approval or a publication holds only for the exact content it was made on.
    const current = currentRevisionOf(q), currentHash = current && revisionHash(current);
    const boundApproval = reviews.some(r => r.reviewer === 'human' && r.verdict === 'approve' && r.revision === q.currentRevision && r.hash === currentHash);
    if (status === 'approved' && !boundApproval) fail(at, 'an approved question has a human approval of its current revision and hash');
    if (q.review.publication) {
      const p = q.review.publication;
      if (status !== 'published') fail(at, 'a publication record belongs to a published question');
      if (p.revision !== q.currentRevision || p.hash !== currentHash) fail(at, `the publication record (r${p.revision} ${p.hash}) is not the current revision (r${q.currentRevision} ${currentHash})`);
      if (!boundApproval) fail(at, 'a publication needs a human approval of the same revision and hash');
    }
    // Official text is checked against the official document before it ships (a transcription can drop or merge text).
    if (status === 'published' && q.provenance.origin !== 'original' && !reviews.some(r => r.verdict === 'approve' && r.checks.includes('source-checked')))
      fail(at, 'an official question is checked against its source before it is published');
    if (q.retired?.replacedBy && !questions.has(q.retired.replacedBy)) fail(at, `replacedBy names unknown question ${q.retired.replacedBy}`);
    // Revisions.
    q.revisions.forEach((r, i) => { if (r.revision !== i + 1) fail(at, 'revisions are numbered 1, 2, 3… in order'); });
    // T.3E: a hash version never goes back: once a revision uses version 2, every later one does too.
    q.revisions.forEach((r, i) => {
      if (r.hashVersion !== undefined && r.hashVersion !== CURRENT_HASH_VERSION) fail(at, `revision ${r.revision} names an unknown hash version`);
      if (i && q.revisions[i - 1].hashVersion === 2 && r.hashVersion !== 2) fail(at, `revision ${r.revision} goes back to the legacy hash`);
    });
    if (!q.revisions.some(r => r.revision === q.currentRevision)) fail(at, `current revision ${q.currentRevision} does not exist`);
    for (const rev of q.revisions) {
      const r = `${at} r${rev.revision}`, allowed = LICENSE_DISPLAY[source.license];
      for (const k of ['text', 'options', 'answer', 'explanation'] as const) if (rev.display[k] && !allowed[k]) fail(r, `display.${k} is wider than the ${source.license} licence allows`);
      if (allowed.attributionRequired && !rev.display.attributionRequired) fail(r, 'the licence requires attribution');
      if (source.license === 'unconfirmed' && (rev.stem || rev.options || rev.answer || rev.explanation)) fail(r, 'an unconfirmed licence keeps metadata only: no stem, options, answer or explanation');
      if (rev.points !== undefined && (rev.points < 0 || !TWO_DECIMALS(rev.points))) fail(r, 'points are non-negative with at most two decimals');
      if (!rev.stem) { if (!rev.topicSummary) fail(r, 'a metadata-only revision has a topic summary'); continue; }
      const blocks = [...rev.stem, ...(rev.options ?? []).flatMap(o => o.body), ...(rev.explanation?.body ?? []), ...(rev.explanation?.options ?? []).flatMap(e => e.body)];
      for (const b of blocks) {
        if (b.type === 'code' && !b.indentationPreserved && status === 'published') fail(r, 'published code keeps its indentation (rebuild and check it first)');
        if (b.type === 'image') fail(r, 'images need the asset registry, which the MVP does not have');
        if (b.type === 'math' && !b.fallback.trim()) fail(r, 'a formula needs a plain-text fallback');
      }
      if (rev.answer?.kind === 'choice') {
        const options = rev.options ?? [], ids = options.map(o => o.id);
        if (options.length < 2) fail(r, 'needs at least two options');
        if (new Set(ids).size !== ids.length) fail(r, 'option ids are unique');
        if (new Set(options.map(o => contentText(o.body))).size !== options.length) fail(r, 'options differ from each other');
        for (const c of rev.answer.correct) if (!ids.includes(c)) fail(r, `answer names unknown option ${c}`);
        const single = q.type === 'single-choice' || q.type === 'code-reading' || q.type === 'true-false';
        if (single && rev.answer.correct.length !== 1) fail(r, 'a single-answer question has exactly one correct option');
        if (!single && q.type === 'multiple-choice' && !rev.answer.correct.length) fail(r, 'a multiple-choice question has at least one correct option');
        if (new Set(rev.answer.correct).size !== rev.answer.correct.length) fail(r, 'the answer names each correct option once');
        // T.3B: a multiple-response question states how many to select (that many are correct), and leaves a wrong one.
        if (q.type === 'multiple-response') {
          const n = rev.answer.correct.length;
          if (n < 2 || n >= options.length) fail(r, 'a multiple-response question has at least two correct options and at least one wrong one');
          if (rev.answer.select !== n) fail(r, `a multiple-response question asks for exactly its ${n} correct options (answer.select)`);
          if (options.length < 4) fail(r, 'a multiple-response question has at least four options');
        } else if (rev.answer.select !== undefined) fail(r, 'only a multiple-response question sets answer.select');
        const per = rev.explanation?.options ?? [];
        if (new Set(per.map(e => e.optionId)).size !== per.length || per.some(e => !ids.includes(e.optionId))) fail(r, 'option explanations name each known option once');
        if (q.type === 'multiple-response' && rev.explanation && per.length !== options.length) fail(r, 'a multiple-response question explains every option');
        if (q.type === 'code-reading' && !rev.stem.some(b => b.type === 'code')) fail(r, 'a code-reading question shows code');
      } else if (rev.answer && (MVP_TYPES as readonly string[]).includes(q.type)) fail(r, 'a choice question has a choice answer');
      if (status === 'published' && !rev.answer) fail(r, 'a published question has an answer');
    }
    if (source.license === 'unconfirmed' && onPaper.has(q.id)) fail(at, 'a question whose licence is unconfirmed is on no paper');
  }

  for (const p of bank.papers) {
    const at = `paper ${p.id}`, subject = subjects.get(p.subjectId);
    if (!subject) fail(at, `unknown subject ${p.subjectId}`);
    if (!p.items.length) fail(at, 'has at least one question');
    if (p.durationMinutes <= 0) fail(at, 'has a positive duration');
    const seen = new Set<string>();
    let total = 0;
    for (const it of p.items) {
      const q = questions.get(it.questionId);
      if (seen.has(it.questionId)) fail(at, `lists ${it.questionId} twice`);
      seen.add(it.questionId);
      total += it.points;
      if (it.points <= 0 || !TWO_DECIMALS(it.points)) fail(at, `${it.questionId}: points are positive with at most two decimals`);
      if (!q) { fail(at, `unknown question ${it.questionId}`); continue; }
      if (it.revision !== undefined && !q.revisions.some(r => r.revision === it.revision)) fail(at, `${it.questionId} has no revision ${it.revision}`);
      // T.3G: a withdrawn question puts its fixed paper under maintenance; anything else unplayable on a paper is an error.
      if (!isPlayable(q, sources) && !(p.kind === 'fixed' && q.review.status === 'revoked')) fail(at, `${it.questionId} is not playable (published, displayable, licensed and of an MVP type)`);
      if (!q.appearances.some(a => a.subjectId === p.subjectId)) fail(at, `${it.questionId} does not belong to subject ${p.subjectId}`);
    }
    if (p.kind === 'generated') total = generatedPaperCheck(p, questions, tags, subject, fail);
    else if (p.draw || p.examMode) fail(at, 'only a generated paper has a draw or an exam mode');
    // T.3H: an adapted paper is a fixed paper of its own, from a fixed paper of the same subject, never called the original.
    if (p.adaptedFrom) {
      const from = bank.papers.find(x => x.id === p.adaptedFrom!.paperId);
      if (p.kind !== 'fixed') fail(at, 'an adapted paper is a fixed paper');
      if (p.adaptedFrom.paperId === p.id) fail(at, 'an adapted paper has its own id, not the id of the paper it comes from');
      else if (!from || from.kind !== 'fixed') fail(at, `adapted from ${p.adaptedFrom.paperId}, which is not a fixed paper here`);
      else if (from.subjectId !== p.subjectId) fail(at, `adapted from ${from.id} of another subject`);
      if (!/^\d+\.\d+\.\d+$/.test(p.adaptedFrom.version)) fail(at, 'adapted from a paper version x.y.z');
      // Its name never says 原卷 (the description may say what it is not; the page labels it an adapted paper anyway).
      if (/原卷|official original/i.test(p.title)) fail(at, 'an adapted paper is never called the original paper');
    }
    if (p.retired && (!isDate(p.retired.since) || !p.retired.reason.trim())) fail(at, 'a retired paper names the date (YYYY-MM-DD) and the reason');
    if (p.passPoints !== undefined && (p.passPoints <= 0 || p.passPoints > total)) fail(at, 'the pass mark lies within the total');
    if (subject?.format.totalPoints !== undefined && Math.abs(total - subject.format.totalPoints) > 1e-9 && !p.note) fail(at, 'a total other than the official one is explained in a note');
    const mock = subject?.mockScoring;
    if (mock && (p.items.some(it => it.points !== mock.pointsPerQuestion) || p.passPoints !== mock.passPoints) && !p.note) fail(at, 'scoring other than the subject\'s mock scoring is explained in a note');
  }

  for (const e of bank.entries) {
    const at = `entry ${e.id}`;
    if (!exams.has(e.examId)) fail(at, `unknown exam ${e.examId}`);
    if (e.place.kind === 'region' && !ctx.regionIds.has(e.place.regionId)) fail(at, `unknown region ${e.place.regionId}`);
    if (e.place.kind === 'island' && !ctx.islandIds.has(e.place.islandId)) fail(at, `unknown island ${e.place.islandId}`);
    if (e.place.kind === 'region' && exams.get(e.examId) && exams.get(e.examId)!.archipelago !== e.place.regionId) fail(at, 'a region entry sits in its exam\'s archipelago');
  }
  return problems;
}
