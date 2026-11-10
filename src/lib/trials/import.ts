import {
  CODE_LANGUAGES, CURRENT_HASH_VERSION, LICENSE_DISPLAY, QUESTION_TYPES, STEM_SHAPES, STEM_TRAITS, contentText, isDate, overdueReviews, revisionHash, validateTrials,
  type Answer, type Appearance, type Block, type CodeLanguage, type Content, type GeneratedBatch, type Origin, type Question,
  type QuestionRevision, type QuestionType, type Review, type StemShape, type StemTrait, type TrialBank, type TrialContext,
} from '@/content/trials/schema';
import { asReview, checkLedger, committedLedger, examResolver, lifecycleOf, type Ledger } from './lifecycle';

/*
 * Shared Trial System T.1: the question import flow (Prompt 7). A batch file (src/content/trials/batches/*.json) is
 * checked — its shape, duplicates, answers against the official key, licences and reviews — merged into the bank and
 * the whole bank validated again; the result is a report and, only when asked to write, the generated questions and
 * the published hashes. Pure: the CLI (scripts/trials/import.ts) reads and writes the files.
 *
 * Nothing here adds a review or upgrades a status. T.2C (docs/exam-system/19): a question's status comes from the
 * review ledger alone — `approved` once a human approved its current revision and hash, `published` only once that
 * revision went through the publication gate (scripts/trials/publish.ts). Reviews written in a batch file are notes and
 * approve nothing. Questions published before T.2C keep their recorded hash in published-hashes.json and stay published.
 */
export const IMPORT_FORMAT = 'logic-island.trials-import/1';
export const GENERATED_FORMAT = 'logic-island.trials-generated/1';

/** Plain text (one paragraph) or blocks. */
export type ImportText = string | Block[];
export interface ImportQuestion {
  id: string;
  type: QuestionType;
  /** The number in the official paper; required when the batch has an answer key. */
  number?: string;
  /** Overrides the batch's source. */
  source?: string;
  stem: ImportText;
  /** Shorthand: a code block after the stem, then `stemAfter`. */
  code?: { language: CodeLanguage; text: string };
  stemAfter?: string;
  /** In written order; they get the ids a, b, c… */
  options: ImportText[];
  /**
   * A letter, A for the first option. With an answer key it may be left out (the key is used) or must agree with it.
   * T.3B: a multiple-response question gives its correct letters in option order (e.g. "AC"); it asks for that many.
   */
  answer?: string;
  explanation?: ImportText;
  /** T.3B: why each option is right or wrong, one per option in written order (required for multiple-response). */
  optionNotes?: ImportText[];
  /** T.3B: the public documents the answer is traced to, and when each was checked (Question.references). */
  references?: { title: string; url: string; checkedAt: string }[];
  /** T.3B: why a meta.volatile question can go out of date, and when it was last checked (Question.volatility). */
  volatility?: { reason: string; checkedAt: string };
  tags: string[];
  lessons?: string[];
  /** T.2B-1: islands still being planned whose future lessons will teach the question (links.plannedIslands). */
  plannedIslands?: string[];
  appearances?: Appearance[];
  /** T.2B-1 metadata, outside the revisions: changing them adds no revision and touches no hash. */
  stemShape?: StemShape;
  stemTraits?: StemTrait[];
  reviewBy?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  verifiedBy?: 'executed' | 'hand-trace';
  interpretationNote?: string;
  reviews?: Review[];
  /** Required when the question was imported before and what a learner sees has changed: a new revision is added. */
  change?: { kind: 'editorial' | 'content' | 'answer'; note: string; at: string };
}
export interface ImportBatch {
  format: typeof IMPORT_FORMAT;
  batch: { id: string; title: string; preparedBy: { kind: 'human' | 'ai'; name: string }; preparedAt: string; note?: string };
  origin: Origin;
  source: string;
  /** The official answer key, by question number. A value that is not a single letter (e.g. 一律給分) holds that question. */
  answerKey?: { sourceId: string; answers: Record<string, string> };
  /** The official paper the questions appeared in: each question gets an `appeared-in` appearance with its number. */
  paper?: { subjectId: string; paperId: string };
  /** Numbers of the official paper left out, and why (figures, voided questions…). */
  skipped?: { number: string; reason: string }[];
  fidelity?: string;
  generatedBy?: { model: string; at: string; note?: string };
  revisionNote: string;
  /** Applied to every question, after its own. */
  reviews: Review[];
  questions: ImportQuestion[];
}

export type QuestionOutcome = 'new' | 'unchanged' | 'revised' | 'metadata';
export interface QuestionLine {
  id: string; number?: string; type: QuestionType; answer?: string; answerCheck: string; licence: string;
  status: 'published' | 'approved' | 'in-review' | 'revoked'; outcome?: QuestionOutcome; held: string[]; hash?: string;
}
export interface ImportPlan {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lines: QuestionLine[];
  bankProblems: string[];
  /** Present when ok: what --write puts on disk. */
  output?: GeneratedBatch;
  hashes?: Record<string, string>;
}

/** Where a batch file lives; the generated file records this path, however the CLI was given it (T.1.1, I1). */
export const batchFileOf = (batchId: string) => `src/content/trials/batches/${batchId}.json`;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const blocks = (t: ImportText): Content => typeof t === 'string' ? [{ type: 'p', text: t }] : t;
/** Text compared for duplicates: width (NFKC), case and spacing folded. Punctuation stays: in code `<` and `>` matter. */
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

// ---- shape -------------------------------------------------------------------------------------------------------
function checkText(at: string, t: unknown, fail: (m: string) => void) {
  if (typeof t === 'string') { if (!t.trim()) fail(`${at} is empty`); return; }
  if (!Array.isArray(t) || !t.length) { fail(`${at} is text or a non-empty list of blocks`); return; }
  t.forEach((b, i) => {
    const where = `${at}[${i}]`;
    if (!isObject(b)) return fail(`${where} is a block`);
    if (b.type === 'p') { if (typeof b.text !== 'string' || !b.text.trim()) fail(`${where} needs text`); }
    else if (b.type === 'code') {
      if (!(CODE_LANGUAGES as readonly unknown[]).includes(b.language)) fail(`${where} has an unknown language`);
      if (typeof b.text !== 'string' || typeof b.indentationPreserved !== 'boolean') fail(`${where} needs text and indentationPreserved`);
    } else if (b.type === 'list') { if (!Array.isArray(b.items) || !b.items.every(x => typeof x === 'string')) fail(`${where} needs string items`); }
    else if (b.type === 'table') { if (!Array.isArray(b.head) || !Array.isArray(b.rows)) fail(`${where} needs head and rows`); }
    else if (b.type === 'math') { if (typeof b.tex !== 'string' || typeof b.fallback !== 'string') fail(`${where} needs tex and fallback`); }
    else if (b.type === 'image') fail(`${where}: images need the asset registry, which does not exist yet`);
    else fail(`${where} has an unknown block type`);
  });
}
function checkReview(at: string, r: unknown, fail: (m: string) => void) {
  if (!isObject(r)) return fail(`${at} is a review`);
  if (typeof r.by !== 'string' || !['human', 'ai'].includes(r.reviewer as string) || typeof r.at !== 'string' || !DATE.test(r.at)
    || !['approve', 'changes', 'reject'].includes(r.verdict as string) || !Array.isArray(r.checks)) fail(`${at} needs by, reviewer, at (YYYY-MM-DD), verdict and checks`);
}

/** Problems with the file's shape; an empty list means the rest of the checks can run. */
export function checkBatchShape(raw: unknown): string[] {
  const problems: string[] = [];
  const fail = (m: string) => problems.push(m);
  if (!isObject(raw)) return ['the batch file is a JSON object'];
  if (raw.format !== IMPORT_FORMAT) fail(`format is "${IMPORT_FORMAT}"`);
  const b = raw.batch;
  if (!isObject(b) || typeof b.id !== 'string' || !ID.test(b.id) || typeof b.title !== 'string' || typeof b.preparedAt !== 'string' || !DATE.test(b.preparedAt)
    || !isObject(b.preparedBy) || !['human', 'ai'].includes(b.preparedBy.kind as string) || typeof b.preparedBy.name !== 'string')
    fail('batch needs id (kebab-case), title, preparedBy {kind: human|ai, name} and preparedAt (YYYY-MM-DD)');
  if (!['official-original', 'official-sample', 'original', 'adapted-from-official'].includes(raw.origin as string)) fail('origin is official-original, official-sample, original or adapted-from-official');
  if (typeof raw.source !== 'string') fail('source names a source id');
  if (typeof raw.revisionNote !== 'string' || !raw.revisionNote.trim()) fail('revisionNote says what this import is');
  if (raw.answerKey !== undefined && (!isObject(raw.answerKey) || typeof raw.answerKey.sourceId !== 'string' || !isObject(raw.answerKey.answers)))
    fail('answerKey is {sourceId, answers: {number: letter}}');
  if (raw.paper !== undefined && (!isObject(raw.paper) || typeof raw.paper.subjectId !== 'string' || typeof raw.paper.paperId !== 'string'))
    fail('paper is {subjectId, paperId}');
  if (raw.generatedBy !== undefined && (!isObject(raw.generatedBy) || typeof raw.generatedBy.model !== 'string' || typeof raw.generatedBy.at !== 'string'))
    fail('generatedBy is {model, at}');
  if (!Array.isArray(raw.reviews)) fail('reviews is a list (it may be empty)');
  else raw.reviews.forEach((r, i) => checkReview(`reviews[${i}]`, r, fail));
  if (!Array.isArray(raw.questions) || !raw.questions.length) { fail('questions is a non-empty list'); return problems; }
  raw.questions.forEach((q, i) => {
    const at = `questions[${i}]${isObject(q) && typeof q.id === 'string' ? ` (${q.id})` : ''}`;
    if (!isObject(q)) return fail(`${at} is an object`);
    if (typeof q.id !== 'string' || !ID.test(q.id)) fail(`${at}.id is kebab-case`);
    if (!(QUESTION_TYPES as readonly unknown[]).includes(q.type)) fail(`${at}.type is unknown`);
    if (q.number !== undefined && typeof q.number !== 'string') fail(`${at}.number is a string`);
    checkText(`${at}.stem`, q.stem, fail);
    if (q.code !== undefined && (!isObject(q.code) || !(CODE_LANGUAGES as readonly unknown[]).includes(q.code.language) || typeof q.code.text !== 'string'))
      fail(`${at}.code is {language, text}`);
    if (!Array.isArray(q.options)) fail(`${at}.options is a list`);
    else q.options.forEach((o, n) => checkText(`${at}.options[${n}]`, o, fail));
    if (q.answer !== undefined && (typeof q.answer !== 'string' || ![...q.answer].every(l => LETTERS.includes(l)) || new Set(q.answer).size !== q.answer.length
      || (q.type === 'multiple-response' ? q.answer.length < 2 : q.answer.length !== 1))) fail(`${at}.answer is a letter A–F (a multiple-response question: two or more different letters)`);
    if (q.explanation !== undefined) checkText(`${at}.explanation`, q.explanation, fail);
    if (q.optionNotes !== undefined) { if (!Array.isArray(q.optionNotes)) fail(`${at}.optionNotes is a list`); else q.optionNotes.forEach((o, n) => checkText(`${at}.optionNotes[${n}]`, o, fail)); }
    if (q.references !== undefined && (!Array.isArray(q.references) || !q.references.every(r => isObject(r) && typeof r.title === 'string' && typeof r.url === 'string' && typeof r.checkedAt === 'string' && isDate(r.checkedAt))))
      fail(`${at}.references is a list of {title, url, checkedAt (YYYY-MM-DD)}`);
    if (q.volatility !== undefined && (!isObject(q.volatility) || typeof q.volatility.reason !== 'string' || typeof q.volatility.checkedAt !== 'string' || !isDate(q.volatility.checkedAt)))
      fail(`${at}.volatility is {reason, checkedAt (YYYY-MM-DD)}`);
    if (!Array.isArray(q.tags) || !q.tags.every(t => typeof t === 'string')) fail(`${at}.tags is a list of tag ids`);
    if (q.difficulty !== undefined && ![1, 2, 3, 4, 5].includes(q.difficulty as number)) fail(`${at}.difficulty is 1–5`);
    for (const k of ['lessons', 'plannedIslands'] as const) if (q[k] !== undefined && (!Array.isArray(q[k]) || !q[k].every(x => typeof x === 'string'))) fail(`${at}.${k} is a list of ids`);
    if (q.stemShape !== undefined && !(STEM_SHAPES as readonly unknown[]).includes(q.stemShape)) fail(`${at}.stemShape is ${STEM_SHAPES.join(', ')}`);
    if (q.stemTraits !== undefined && (!Array.isArray(q.stemTraits) || !q.stemTraits.every(t => (STEM_TRAITS as readonly unknown[]).includes(t))))
      fail(`${at}.stemTraits is a list of ${STEM_TRAITS.join(', ')}`);
    if (q.reviewBy !== undefined && (typeof q.reviewBy !== 'string' || !isDate(q.reviewBy))) fail(`${at}.reviewBy is a date (YYYY-MM-DD)`);
    if (q.reviews !== undefined) { if (!Array.isArray(q.reviews)) fail(`${at}.reviews is a list`); else q.reviews.forEach((r, n) => checkReview(`${at}.reviews[${n}]`, r, fail)); }
    if (q.change !== undefined && (!isObject(q.change) || !['editorial', 'content', 'answer'].includes(q.change.kind as string)
      || typeof q.change.note !== 'string' || typeof q.change.at !== 'string' || !DATE.test(q.change.at))) fail(`${at}.change is {kind, note, at}`);
  });
  return problems;
}

// ---- plan --------------------------------------------------------------------------------------------------------
/** What a learner sees (and the explanation), compared to tell an unchanged question from a new revision. */
const seen = (r: QuestionRevision) => JSON.stringify([r.stem, r.options, r.answer, r.points, r.explanation, r.difficulty, r.display]);

/**
 * Checks a batch against the bank and plans the import. `bank` is the whole bank as the site builds it now (the
 * batch's earlier output included), `previous` that earlier output if there is one, `published` the recorded hashes.
 */
export function planImport(raw: unknown, bank: TrialBank, ctx: TrialContext, previous: GeneratedBatch | undefined, published: Record<string, string>, file: string, today?: string, ledger: Ledger = committedLedger): ImportPlan {
  const errors: string[] = [], warnings: string[] = [], lines: QuestionLine[] = [];
  const shape = checkBatchShape(raw);
  if (shape.length) return { ok: false, errors: shape.map(m => `shape: ${m}`), warnings, lines, bankProblems: [] };
  const batch = raw as ImportBatch;
  const canonical = batchFileOf(batch.batch.id);
  if (file !== canonical) warnings.push(`the batch file is ${file}, not ${canonical}: only a batch at its own location can be written (--write)`);
  const sources = new Map(bank.sources.map(s => [s.id, s]));
  const prior = new Map((previous?.questions ?? []).map(q => [q.id, q]));
  const others = bank.questions.filter(q => !prior.has(q.id));
  const otherIds = new Set(others.map(q => q.id));
  const prints = new Map<string, string>(), stems = new Map<string, string>();
  for (const q of others) {
    const rev = q.revisions.find(r => r.revision === q.currentRevision);
    if (!rev?.stem) continue;
    prints.set(fold(contentText(rev.stem)) + '|' + (rev.options ?? []).map(o => fold(contentText(o.body))).sort().join('|'), q.id);
    stems.set(fold(contentText(rev.stem)), q.id);
  }

  // The batch as a whole: its source, licence and key.
  const key = batch.answerKey;
  if (key) {
    const keySource = sources.get(key.sourceId);
    if (!keySource) errors.push(`answerKey: unknown source ${key.sourceId}`);
    else if (keySource.kind !== 'official-answer-key') errors.push(`answerKey: ${key.sourceId} is not an official answer key`);
  }
  if (batch.origin !== 'original' && !key) errors.push('an official batch carries the official answer key (answerKey)');
  if (batch.paper && !bank.subjects.some(s => s.id === batch.paper!.subjectId)) errors.push(`paper: unknown subject ${batch.paper.subjectId}`);
  if (previous && previous.batch.id !== batch.batch.id) errors.push(`the earlier output belongs to batch ${previous.batch.id}`);

  const ids = new Set<string>(), numbers = new Set<string>();
  const built: Question[] = [];
  for (const q of batch.questions) {
    const at = `question ${q.id}`;
    const fail = (m: string) => errors.push(`${at}: ${m}`);
    const held: string[] = [];
    const sourceId = q.source ?? batch.source, source = sources.get(sourceId);
    if (ids.has(q.id)) fail('listed twice in the batch');
    ids.add(q.id);
    if (otherIds.has(q.id)) fail('id already used by a question outside this batch');
    if (!source) { fail(`unknown source ${sourceId}`); continue; }
    if (source.researchOnly) { fail(`source ${source.id} is for research and statistics only: no question is imported from it`); continue; }

    // Licence: what the source allows decides what may be imported and shown.
    let licence: string = source.license;
    if (source.license === 'unconfirmed') fail(`source ${source.id} has an unconfirmed licence: its questions are not imported (metadata stays in docs/exam-system/data)`);
    if (batch.origin === 'original' && source.kind !== 'original-basis') fail('an original question cites an original basis');
    if (batch.origin !== 'original' && source.kind === 'original-basis') fail('an official question cites an official source');
    if (batch.origin === 'adapted-from-official' && source.license !== 'free-use-statute' && source.license !== 'permission-granted') fail('only freely usable or permitted questions may be adapted');
    if (source.license !== 'original' && !source.attribution) fail(`source ${source.id} needs an attribution`);
    if (source.license === 'free-use-statute') licence = 'free-use-statute（標示出處）';

    // Content.
    const stem: Content = [...blocks(q.stem), ...q.code ? [{ type: 'code' as const, language: q.code.language, text: q.code.text, indentationPreserved: true }] : [], ...q.stemAfter ? [{ type: 'p' as const, text: q.stemAfter }] : []];
    if (q.options.length < 2 || q.options.length > OPTION_IDS.length) fail(`has ${q.options.length} options (2–${OPTION_IDS.length})`);
    const options = q.options.slice(0, OPTION_IDS.length).map((o, i) => ({ id: OPTION_IDS[i], body: blocks(o) }));
    const folded = options.map(o => fold(contentText(o.body)));
    if (new Set(folded).size !== folded.length) fail('two options read the same');
    if (q.type === 'code-reading' && !stem.some(b => b.type === 'code')) fail('a code-reading question shows code');
    if (!(['single-choice', 'code-reading', 'multiple-response'] as QuestionType[]).includes(q.type)) fail(`type ${q.type} cannot be imported yet (the engine grades single-answer and multiple-response questions only)`);
    if (q.type === 'multiple-response' && key) fail('an official multiple-response question cannot be checked against a single-letter answer key');
    if (q.optionNotes && q.optionNotes.length !== q.options.length) fail(`has ${q.optionNotes.length} option notes for ${q.options.length} options`);
    if (q.type === 'multiple-response' && !q.optionNotes) fail('a multiple-response question explains every option (optionNotes)');

    // Answer: the key decides for official questions; the batch must agree with it.
    let letter = q.answer, answerCheck = '原創題，作者答案';
    if (key) {
      if (!q.number) fail('needs its official number to be checked against the answer key');
      else if (numbers.has(q.number)) fail(`number ${q.number} is listed twice`);
      else {
        numbers.add(q.number);
        const official = key.answers[q.number];
        if (official === undefined) fail(`the answer key has no question ${q.number}`);
        else if (!LETTERS.includes(official)) { held.push(`官方答案為「${official}」`); answerCheck = `官方答案「${official}」`; }
        else if (letter && letter !== official) fail(`answer ${letter} disagrees with the official key (${official})`);
        else { letter = official; answerCheck = '與官方答案相符'; }
      }
    } else if (q.verifiedBy === 'executed') answerCheck = '程式實際執行';
    if (!letter && !held.length) fail('has no answer');
    const indexes = [...letter ?? ''].map(l => LETTERS.indexOf(l));
    if (letter && indexes.some(i => i >= options.length)) fail(`answer ${letter} names no option`);
    if (q.type === 'multiple-response' && indexes.length >= options.length) fail('a multiple-response question leaves at least one option wrong');
    const answer: Answer | undefined = letter && indexes.every(i => i < options.length) ? {
      kind: 'choice', correct: indexes.map(i => OPTION_IDS[i]), official: !!key,
      ...q.type === 'multiple-response' ? { select: indexes.length } : {},
      ...key ? { verifiedBy: 'official-key' as const } : q.verifiedBy ? { verifiedBy: q.verifiedBy } : {},
      ...q.interpretationNote ? { interpretationNote: q.interpretationNote } : {},
    } : undefined;

    // Duplicates: the same question elsewhere is an error; the same stem with other options only a warning.
    const stemPrint = fold(contentText(stem)), print = stemPrint + '|' + [...folded].sort().join('|');
    const twin = prints.get(print);
    if (twin) fail(`duplicates ${twin} (same stem and options)`);
    else if (stems.has(stemPrint)) warnings.push(`${at}: same stem as ${stems.get(stemPrint)}, different options`);
    prints.set(print, q.id);
    stems.set(stemPrint, q.id);

    // Review notes written in the batch (before T.2C); they approve nothing. A note asking for changes still holds.
    const notes = [...q.reviews ?? [], ...batch.reviews];
    if (notes.some(r => r.verdict !== 'approve')) held.push('批次檔中有審稿意見要求修改或退回');

    const appearances: Appearance[] = [...batch.paper && q.number ? [{ kind: 'appeared-in' as const, subjectId: batch.paper.subjectId, paperId: batch.paper.paperId, number: q.number }] : [], ...q.appearances ?? []];
    const content: QuestionRevision = {
      revision: 1, change: 'initial', note: batch.revisionNote, at: batch.batch.preparedAt, stem, options, ...answer ? { answer } : {},
      ...q.explanation ? { explanation: { origin: 'logic-island-original' as const, body: blocks(q.explanation),
        ...q.optionNotes ? { options: q.optionNotes.slice(0, options.length).map((n, i) => ({ optionId: OPTION_IDS[i], body: blocks(n) })) } : {} } } : {},
      ...q.difficulty ? { difficulty: { level: q.difficulty, basis: 'author-estimate' as const } } : {},
      display: { ...LICENSE_DISPLAY[source.license] },
      // T.3E: new questions and new revisions are identified by the version 2 hash (explanations included).
      hashVersion: CURRENT_HASH_VERSION,
    };

    // Revisions: published ones are never rewritten. Changed content needs a change note and becomes a new revision.
    const before = prior.get(q.id);
    let revisions: QuestionRevision[] = [content], outcome: QuestionOutcome = 'new';
    if (before) {
      const last = before.revisions[before.revisions.length - 1];
      if (seen(last) === seen({ ...content, revision: last.revision })) { revisions = before.revisions; outcome = 'unchanged'; }
      else if (!q.change) fail(`what a learner sees changed since revision ${last.revision}: add "change" {kind, note, at} for a new revision`);
      else { revisions = [...before.revisions, { ...content, revision: last.revision + 1, change: q.change.kind, note: q.change.note, at: q.change.at }]; outcome = 'revised'; }
    } else if (q.change) fail('"change" is only for a question imported before');

    // T.2C status, from the ledger: published (recorded before, or through the gate), approved, or in review.
    const current = revisions[revisions.length - 1], recorded = published[`${q.id}@${current.revision}`];
    const state = lifecycleOf({ id: q.id, revisions, currentRevision: current.revision, provenance: { origin: batch.origin, sourceId }, review: { status: 'in-review', reviews: [], ...batch.generatedBy ? { generatedBy: batch.generatedBy } : {} } } as unknown as Question, ledger, recorded);
    held.push(...state.held);
    const viaGate = state.approved && !!state.publication;
    // T.3F: a withdrawn revision is `revoked` (never playable) until it is published again.
    const status: QuestionLine['status'] = state.revoked ? 'revoked' : held.length ? (state.approved && !held.some(h => !h.startsWith('已核准')) ? 'approved' : 'in-review') : 'published';
    const reviews = [...notes, ...ledger.reviews.filter(e => e.questionId === q.id).map(asReview)];

    const question: Question = {
      id: q.id, type: q.type,
      provenance: { origin: batch.origin, sourceId, ...q.number ? { locator: { questionNumber: q.number } } : {}, ...batch.fidelity ? { fidelity: batch.fidelity } : {} },
      appearances, tags: q.tags, links: { ...q.lessons ? { lessons: q.lessons } : {}, ...q.plannedIslands ? { plannedIslands: q.plannedIslands } : {} },
      review: { status, ...batch.generatedBy ? { generatedBy: batch.generatedBy } : {}, reviews, ...viaGate && status === 'published' ? { publication: { revision: state.publication!.revision, hash: state.publication!.hash, by: state.publication!.by, at: state.publication!.at } } : {} },
      currentRevision: revisions[revisions.length - 1].revision, revisions,
      ...q.stemShape ? { stemShape: q.stemShape } : {}, ...q.stemTraits ? { stemTraits: q.stemTraits } : {}, ...q.reviewBy ? { reviewBy: q.reviewBy } : {},
      ...q.references ? { references: q.references } : {}, ...q.volatility ? { volatility: q.volatility } : {},
    };
    if (before && outcome === 'unchanged' && JSON.stringify(before) !== JSON.stringify(question)) outcome = 'metadata';
    built.push(question);
    lines.push({ id: q.id, number: q.number, type: q.type, answer: letter, answerCheck, licence, status, outcome, held, hash: revisionHash(revisions[revisions.length - 1]) });
  }

  // Every question of the earlier output is still in the batch: removing one would silently unpublish it.
  for (const id of prior.keys()) if (!ids.has(id)) errors.push(`question ${id}: imported before but missing from the batch (retire it instead of deleting it)`);
  // The official paper: every number is imported or listed as skipped, with a reason.
  if (key) {
    const skipped = new Set((batch.skipped ?? []).map(s => s.number));
    for (const n of Object.keys(key.answers)) if (!numbers.has(n) && !skipped.has(n)) warnings.push(`answer key question ${n} is neither imported nor listed in skipped`);
  }

  // Review dates already past: reported, never acted on (the question, its answer and earlier grades stay as they are).
  if (today) for (const o of overdueReviews(built, today)) warnings.push(`question ${o.questionId}: review was due ${o.reviewBy}`);

  // The whole bank with this batch in place, and the hashes: recorded ones never change, new published ones are added.
  const merged: TrialBank = { ...bank, questions: [...others, ...built] };
  const builtIds = new Set(built.map(q => q.id));
  const bankProblems = [...validateTrials(merged, ctx), ...checkLedger(ledger, merged.questions, examResolver(merged), published).filter(p => [...builtIds].some(id => p.includes(`(${id} r`)))];
  const hashes: Record<string, string> = { ...published };
  for (const q of built) for (const r of q.revisions) {
    const k = `${q.id}@${r.revision}`, h = revisionHash(r);
    if (published[k] !== undefined && published[k] !== h) errors.push(`question ${q.id}: published revision ${r.revision} would change (${published[k]} → ${h})`);
    if (q.review.status === 'published' && published[k] === undefined) hashes[k] = h;
  }
  const ok = !errors.length && !bankProblems.length;
  return {
    ok, errors, warnings, lines, bankProblems,
    ...ok ? {
      output: { format: GENERATED_FORMAT, batch: { id: batch.batch.id, title: batch.batch.title, file: canonical }, questions: built },
      hashes: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))),
    } : {},
  };
}

// ---- report ------------------------------------------------------------------------------------------------------
const OUTCOME: Record<QuestionOutcome, string> = { new: '新增', unchanged: '未變更', revised: '新版本', metadata: '僅更新中繼資料' };
const cell = (s: string) => s.replace(/\|/g, '\\|');

/** The import report (Traditional Chinese Markdown). Deterministic: the same batch and bank give the same report. */
export function importReport(raw: unknown, plan: ImportPlan, mode: 'dry-run' | 'write', file: string): string {
  const batch = isObject(raw) ? raw as Partial<ImportBatch> : {};
  const count = (o: QuestionOutcome) => plan.lines.filter(l => l.outcome === o).length;
  const held = plan.lines.filter(l => l.status !== 'published');
  const out: string[] = [
    `# 題庫匯入報告：${batch.batch?.id ?? '（無法讀取）'}`, '',
    `- 模式：${mode === 'dry-run' ? '**dry-run**（只檢查，沒有寫入任何檔案）' : '**寫入**'}`,
    `- 批次檔：\`${file}\``,
    ...batch.batch ? [`- 名稱：${batch.batch.title}`, `- 準備者：${batch.batch.preparedBy.kind === 'ai' ? 'AI' : '人工'}（${batch.batch.preparedBy.name}），${batch.batch.preparedAt}`] : [],
    ...batch.source ? [`- 來源：\`${batch.source}\`；類型：${batch.origin}${batch.answerKey ? `；答案依據：\`${batch.answerKey.sourceId}\`` : ''}`] : [],
    `- 結果：${plan.ok ? '**可以匯入**' : '**不能匯入**'}（錯誤 ${plan.errors.length}、題庫驗證問題 ${plan.bankProblems.length}、警告 ${plan.warnings.length}）`,
    `- 題目：${plan.lines.length} 題｜新增 ${count('new')}、未變更 ${count('unchanged')}、新版本 ${count('revised')}、僅更新中繼資料 ${count('metadata')}｜發布 ${plan.lines.length - held.length}、已核准未發布 ${held.filter(l => l.status === 'approved').length}、暫緩（審稿中）${held.filter(l => l.status === 'in-review').length}`,
    '',
  ];
  const list = (title: string, items: string[]) => out.push(`## ${title}`, '', ...items.length ? items.map(x => `- ${x}`) : ['- 無'], '');
  list('錯誤', plan.errors);
  list('題庫整體驗證（validateTrials）', plan.bankProblems);
  list('警告', plan.warnings);
  if (batch.skipped?.length) list('未匯入的原卷題號', batch.skipped.map(s => `第 ${s.number} 題：${s.reason}`));
  list('暫緩發布', held.map(l => `${l.id}：${l.held.join('；')}`));
  out.push('## 逐題', '', '| 題目 | 原卷題號 | 題型 | 答案 | 答案核對 | 授權 | 狀態 | 變更 | 雜湊 |', '|---|---|---|---|---|---|---|---|---|');
  for (const l of plan.lines) out.push(`| \`${l.id}\` | ${l.number ?? '—'} | ${l.type} | ${l.answer ?? '—'} | ${cell(l.answerCheck)} | ${cell(l.licence)} | ${l.status === 'published' ? '發布' : l.status === 'approved' ? '已核准' : l.status === 'revoked' ? '已撤回' : '審稿中'} | ${l.outcome ? OUTCOME[l.outcome] : '—'} | \`${l.hash ?? '—'}\` |`);
  out.push('', '## 檢查項目', '',
    '- 結構：格式版本、必要欄位、題型、選項 2～6 個、內容區塊、審稿紀錄格式。',
    '- 重複：題號與 id 不重複；題幹與選項（全形半形、大小寫與空白不計）和題庫其他題目相同視為重複；只有題幹相同列為警告。',
    '- 答案：單選題恰有一個正解；複選題（T.3B）有兩個以上不重複的正解、至少一個錯誤選項，並逐一解析每個選項；官方題逐題對照官方答案（批次內的答案必須一致，非單一字母的官方答案暫緩）；原卷每一題都已匯入或列出未匯入原因。',
    '- 授權：來源存在；授權未確認的來源不匯入任何題文；官方題標示出處；顯示權限取授權允許的上限，不放寬。',
    '- 審稿（T.2C）：匯入流程不新增審稿紀錄、不發布。狀態只看審核帳本：人工核准必須綁定目前的版本與雜湊（AI 撰寫的題目還要確認答案，官方題要與原卷核對）才是「已核准」；只有經過另外的發布動作才是「發布」。批次檔中的審稿紀錄只是註記，不構成核准。',
    '- 版本：已發布的版本雜湊不得改變；內容改變必須寫明變更並新增版本；先前匯入的題目不得從批次中刪除。',
    '');
  return out.join('\n');
}
