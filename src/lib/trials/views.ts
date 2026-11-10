import { getLessonById } from '@/content/curriculum';
import { examOfSubject, getPaper, getSubject, originOfPaper, playableById, playableQuestions, sourceById, tagById, withdrawnCountOf } from '@/content/trials';
import { currentRevisionOf, paperTotalPoints, revisionHash, selectCountOf, type Block, type CodeLanguage, type ExamMode, type ExamPaper, type PaperDraw, type Question, type QuestionType, type ResultPolicy } from '@/content/trials/schema';
import type { HlLines } from '@/lib/highlight/kinds';
import { highlight, type HighlightLanguage } from '@/lib/highlight/server';
import type { DrawItem } from './draw';
import type { EnginePaper } from './engine';
import { drawItemOf } from './mock-assembly';

/*
 * T.0: what the trial pages hand their client components, built on the server at build time. Code is highlighted
 * here (Shiki never reaches the browser); each paper's page carries only that paper's questions. T.2C: questions are
 * looked up among published ones only (playableById); a paper naming anything else fails the build. T.3G: except a
 * withdrawn item of a fixed paper, which puts the paper under maintenance and is left out of the page entirely.
 */
export type BlockView = Block & { tokens?: HlLines };
export interface LessonLink { id: string; title: string; slug: string }
export interface SourceNote { original: boolean; label: string; title: string; url: string; attribution?: string; number?: string }
export interface QuestionView {
  id: string; type: Question['type']; revision: number; hash: string;
  /** T.3H: the hash's version and every exam the question appears in, so a stored attempt is matched to this content. */
  hashVersion: 1 | 2; exams: string[];
  stem: BlockView[]; options: { id: string; body: BlockView[] }[];
  correct: string[]; answerOfficial: boolean; explanation?: BlockView[];
  /** T.3B: how many options to select (multiple-response; one otherwise), and why each option is right or wrong. */
  select: number; optionNotes?: Record<string, BlockView[]>;
  /** T.3B: the public documents the answer is traced to. */
  references?: { title: string; url: string; checkedAt: string }[];
  /** Who wrote the explanation, when it was not the exam's issuer (official questions get Logic Island explanations). */
  explanationNote?: string;
  /** T.2D: `syllabus` is the official item code when the tag is one (results group by it). */
  source: SourceNote; tags: { id: string; name: string; syllabus?: string; topic?: { code: string; name: string } }[]; lessons: LessonLink[];
}
export interface PaperView {
  id: string; examId: string; examName: string; subjectName: string; title: string; description: string; note?: string;
  durationMinutes: number; passPoints?: number; passBasis?: string; totalPoints: number; disclaimer: string;
  /** Questions a session answers (the drawn count of a generated paper). */
  questionCount: number; examMode?: ExamMode;
  /** T.3B: from the paper's blueprint — the mode's name, the question types, how the result is shown. */
  modeLabel?: string; questionTypes: QuestionType[]; result: ResultPolicy;
  /** T.2E: a generated paper — `engine.items` and `questions` are the published pool, and a session draws from `pool`. */
  draw?: { spec: PaperDraw; pool: DrawItem[] };
  /**
   * T.3G: a fixed paper with withdrawn items is under maintenance: it takes no new session, and its withdrawn questions
   * (never sent to the page, not even their ids) are missing from `engine` and `questions`. Past results stay readable.
   */
  maintenance?: { withdrawn: number };
  /** T.3G: a fixed paper — sessions of another version of it are not resumed (its items may differ). */
  fixed: boolean;
  /**
   * T.3H (docs/exam-system/32 §6): an official original, an adapted practice paper (with the paper and version it comes
   * from) or a practice paper; and a retired paper, which takes no new session while its past results stay readable.
   */
  origin: 'official-original' | 'adapted' | 'practice';
  adaptedFrom?: { paperId: string; version: string; title?: string };
  retired?: { since: string; reason: string };
  engine: EnginePaper; questions: QuestionView[];
}

// Shiki has no C grammar loaded; C reads correctly with the C++ one. Pseudocode stays plain.
const HL: Partial<Record<CodeLanguage, HighlightLanguage>> = { C: 'C++', 'C++': 'C++', Java: 'Java', Python: 'Python', JavaScript: 'JavaScript', SQL: 'SQL' };
const view = (blocks: Block[]): BlockView[] => blocks.map(b => b.type === 'code' && HL[b.language] ? { ...b, tokens: highlight(b.text, HL[b.language]!) } : b);

const lessonLink = (id: string): LessonLink[] => { const l = getLessonById(id); return l && l.lessonStatus === 'complete' ? [{ id, title: l.title, slug: l.slug }] : []; };
/** The question's own lessons, or else those of its tags. */
function lessonsOf(q: Question): LessonLink[] {
  const ids = q.links.lessons?.length ? q.links.lessons : [...new Set(q.tags.flatMap(t => tagById.get(t)?.lessons ?? []))];
  return ids.flatMap(lessonLink);
}

function sourceNote(q: Question): SourceNote {
  const s = sourceById.get(q.provenance.sourceId)!;
  return q.provenance.origin === 'original'
    ? { original: true, label: 'Logic Island 原創示例，非官方試題', title: s.title, url: s.url }
    : { original: false, label: '官方試題', title: s.title, url: s.url, attribution: s.attribution, ...q.provenance.locator ? { number: q.provenance.locator.questionNumber } : {} };
}

/** Every exam the question appears in (an original may target subjects of two exams). */
const examsOf = (q: Question) => [...new Set(q.appearances.flatMap(a => examOfSubject(a.subjectId)?.id ?? []))].sort();

export function questionView(q: Question): QuestionView {
  const rev = currentRevisionOf(q)!;
  return {
    id: q.id, type: q.type, revision: rev.revision, hash: revisionHash(rev), hashVersion: rev.hashVersion ?? 1, exams: examsOf(q),
    stem: view(rev.stem ?? []),
    options: (rev.options ?? []).map(o => ({ id: o.id, body: view(o.body) })),
    correct: rev.answer?.kind === 'choice' ? rev.answer.correct : [], answerOfficial: !!rev.answer?.official, select: selectCountOf(q, rev),
    ...rev.display.explanation && rev.explanation?.options?.length ? { optionNotes: Object.fromEntries(rev.explanation.options.map(e => [e.optionId, view(e.body)])) } : {},
    ...q.references?.length ? { references: q.references } : {},
    ...rev.display.explanation && rev.explanation ? {
      explanation: view(rev.explanation.body),
      ...rev.explanation.origin === 'logic-island-original' ? { explanationNote: q.provenance.origin === 'original' ? 'Logic Island 撰寫' : 'Logic Island 撰寫，非官方解答' } : {},
    } : {},
    source: sourceNote(q), lessons: lessonsOf(q), tags: q.tags.map(t => {
      const tag = tagById.get(t);
      return { id: t, name: tag?.name ?? t, ...tag?.syllabus ? { syllabus: tag.syllabus.code, topic: tag.syllabus.parent } : {} };
    }),
  };
}

function enginePaper(paper: ExamPaper, examId: string): EnginePaper {
  // T.3G: only published items; a withdrawn one (its paper under maintenance) never reaches the page.
  const items = paper.items.filter(it => playableById.has(it.questionId));
  return {
    id: paper.id, version: paper.version, examId, durationMinutes: paper.durationMinutes, shuffleOptions: paper.shuffle.options,
    ...paper.passPoints !== undefined ? { passPoints: paper.passPoints } : {}, ...paper.examMode ? { examMode: paper.examMode } : {},
    items: items.map(it => {
      const q = playableById.get(it.questionId)!, rev = q.revisions.find(r => r.revision === (it.revision ?? q.currentRevision))!;
      return { questionId: q.id, revision: rev.revision, hash: revisionHash(rev), hashVersion: rev.hashVersion ?? 1, points: it.points, tags: q.tags,
        optionIds: (rev.options ?? []).map(o => o.id), fixed: (rev.options ?? []).filter(o => o.fixedPosition).map(o => o.id),
        correct: rev.answer?.kind === 'choice' ? rev.answer.correct : [], ...selectCountOf(q, rev) > 1 ? { select: selectCountOf(q, rev) } : {} };
    }),
  };
}

export function paperView(paperId: string): PaperView | undefined {
  const paper = getPaper(paperId), subject = paper && getSubject(paper.subjectId), exam = paper && examOfSubject(paper.subjectId);
  if (!paper || !subject || !exam) return undefined;
  const items = paper.items.filter(it => playableById.has(it.questionId)), withdrawn = withdrawnCountOf(paper);
  return {
    id: paper.id, examId: exam.id, examName: exam.name, subjectName: subject.name, title: paper.title, description: paper.description,
    ...paper.note ? { note: paper.note } : {}, durationMinutes: paper.durationMinutes,
    ...paper.passPoints !== undefined ? { passPoints: paper.passPoints } : {}, ...paper.passBasis ? { passBasis: paper.passBasis } : {},
    totalPoints: paperTotalPoints(paper), disclaimer: exam.disclaimer,
    questionCount: paper.draw && paper.kind === 'generated' ? paper.draw.count : paper.items.length, ...paper.examMode ? { examMode: paper.examMode } : {},
    ...paper.modeLabel ? { modeLabel: paper.modeLabel } : {},
    questionTypes: paper.questionTypes ?? [...new Set(items.map(it => playableById.get(it.questionId)!.type))],
    result: paper.result ?? { score: 'points', groupBy: 'item' },
    ...paper.kind === 'generated' && paper.draw ? { draw: { spec: paper.draw, pool: paper.items.map(it => drawItemOf(playableById.get(it.questionId)!, it.revision!, tagById)) } } : {},
    ...withdrawn ? { maintenance: { withdrawn } } : {}, fixed: paper.kind === 'fixed',
    origin: originOfPaper(paper), ...paper.retired ? { retired: paper.retired } : {},
    ...paper.adaptedFrom ? { adaptedFrom: { ...paper.adaptedFrom, ...getPaper(paper.adaptedFrom.paperId) ? { title: getPaper(paper.adaptedFrom.paperId)!.title } : {} } } : {},
    engine: enginePaper(paper, exam.id), questions: items.map(it => questionView(playableById.get(it.questionId)!)),
  };
}

/** Every question that can appear on the site, for the review book (small in the MVP; per-paper chunks later). */
export const reviewViews = () => playableQuestions.map(questionView);
