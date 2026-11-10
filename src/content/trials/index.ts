import { trialEntries } from './entries';
import { editions, exams, subjects } from './exams';
import { papers } from './papers';
import { generatedBatches } from './generated';
import { conflictPairs } from './conflicts';
import { mockBlueprints } from './mock-exams';
import published from './published-hashes.json';
import { isPlayable, paperOriginOf, paperStatusOf, withdrawnItems, type ExamPaper, type ExamStatus, type TrialBank } from './schema';
import { sources } from './sources';
import { tags } from './tags';
import { readyMockPapers } from '@/lib/trials/mock-assembly';

/*
 * T.0 trial bank: the static data assembled, and lookups. Server-side data, like the world registry: pages pass what a
 * client component needs as props (src/lib/trials/views.ts) instead of importing it. What the bank is checked against
 * (trialContext) lives in ./context, so that pages and tests that only read the bank do not load the whole curriculum.
 */
// Every question comes from the import flow (scripts/trials/import.ts); see src/content/trials/batches.
const questions = generatedBatches.flatMap(b => b.questions);
export const trialBank: TrialBank = {
  exams, editions, subjects, sources, tags, entries: trialEntries, questions,
  // T.2D/T.2E: a mock blueprint gives papers only once its published pool fills every syllabus quota (src/lib/trials/mock-assembly.ts).
  papers: [...papers, ...readyMockPapers(mockBlueprints, questions, new Map(sources.map(s => [s.id, s])), published, conflictPairs(), new Map(tags.map(t => [t.id, t])))],
};


const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(x => [x.id, x]));
// Papers come from trialBank, so assembled mock papers are found like the fixed ones.
const examById = byId(exams), editionById = byId(editions), subjectById = byId(subjects), paperById = byId(trialBank.papers);
export const sourceById = byId(sources);
export const questionById = byId(trialBank.questions);
export const tagById = byId(tags);

export const getExam = (id: string) => examById.get(id);
export const getPaper = (id: string) => paperById.get(id);
export const getSubject = (id: string) => subjectById.get(id);
export const getEdition = (id: string) => editionById.get(id);
/** The exam a subject (and so a paper) belongs to. */
export const examOfSubject = (subjectId: string) => { const s = subjectById.get(subjectId); return s && examById.get(editionById.get(s.editionId)?.examId ?? ''); };
export const subjectsOfExam = (examId: string) => subjects.filter(s => editionById.get(s.editionId)?.examId === examId);
export const papersOfExam = (examId: string) => trialBank.papers.filter(p => examOfSubject(p.subjectId)?.id === examId);
/** Content status: an exam is available once one of its papers can be taken. */
export const examStatus = (examId: string): ExamStatus => papersOfExam(examId).length ? 'available' : 'planned';
/** Questions that may reach the site at all. */
export const playableQuestions = trialBank.questions.filter(q => isPlayable(q, sourceById));
/**
 * T.2C: the only question lookup the pages use (src/lib/trials/views.ts). Questions in review or approved but not yet
 * published are not in it, so no page can hand them to a client component even if a paper named one by mistake.
 */
export const playableById = byId(playableQuestions);
/** T.3G: how many items of a fixed paper are withdrawn; any puts the paper under maintenance (no new session). */
export const withdrawnCountOf = (p: ExamPaper) => withdrawnItems(p, questionById).length;
/** T.3H: whether the paper takes new sessions, and whether it is an official original, an adapted or a practice paper. */
export const statusOfPaper = (p: ExamPaper) => paperStatusOf(p, questionById);
export const originOfPaper = (p: ExamPaper) => paperOriginOf(p, questionById);

/** T.1 archipelago entries (Prompt 7): a region's exams for the world map pages, in entry order. Plain data for props. */
export interface RegionTrialEntry { id: string; label: string; href?: string; detail: string }
export const regionTrialEntries = (regionId: 'cs' | 'ai'): RegionTrialEntry[] => trialBank.entries
  .filter(e => e.place.kind === 'region' && e.place.regionId === regionId).sort((a, b) => a.order - b.order)
  .map(e => {
    const papers = papersOfExam(e.examId).length;
    return { id: e.id, label: e.label, ...papers ? { href: `/trials/${e.examId}` } : {}, detail: papers ? `${papers} 份試卷` : '題目準備中' };
  });
