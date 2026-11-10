import type { MockBlueprint } from '@/content/trials/mock-exams';
import { currentRevisionOf, revisionHash, selectCountOf, type ExamMode, type Question } from '@/content/trials/schema';
import type { EnginePaper } from './engine';
import { checkBlueprint, drawItemOf, drawSpecOf, subjectQuestions, type TagIndex } from './mock-assembly';
import { getExam } from '@/content/trials';
import { questionView, type PaperView } from './views';

/*
 * T.2D/T.2E Local Preview / Test Mode: a generated mock paper whose pool is the subject's questions that are NOT
 * published (in review), so the exam experience can be tested before any iPAS question passes the T.2C gate. It runs
 * only under Vitest: it refuses to run in a build, a dev server or a browser, no page or component imports it
 * (tests/trials-exposure.test.ts), and it writes nothing — no review, no publication, no paper in the bank.
 */
function assertTestOnly() {
  if (process.env.NODE_ENV !== 'test' || !process.env.VITEST) throw new Error('mock preview runs only in tests (Vitest), never in a build or on the site');
}

export function previewPaperView(bp: MockBlueprint, questions: Question[], conflicts: [string, string][], tags: TagIndex, examMode: ExamMode = 'extended-practice'): PaperView {
  assertTestOnly();
  const errors = checkBlueprint(bp, questions, conflicts, tags);
  if (errors.length) throw new Error(errors.join('\n'));
  const mode = bp.modes.find(m => m.examMode === examMode)!;
  const codes = Object.keys(bp.coverage);
  const pool = subjectQuestions(bp, questions).map(q => drawItemOf(q, q.currentRevision, tags))
    .sort((x, y) => codes.indexOf(x.code) - codes.indexOf(y.code) || x.questionId.localeCompare(y.questionId));
  const byId = new Map(questions.map(q => [q.id, q])), ids = new Set(pool.map(p => p.questionId));
  const engine: EnginePaper = {
    id: `${bp.id}-${mode.idSuffix}-preview`, version: bp.version, durationMinutes: mode.durationMinutes, shuffleOptions: false, examMode,
    ...mode.passPoints !== undefined ? { passPoints: mode.passPoints } : {},
    items: pool.map(p => { const q = byId.get(p.questionId)!, rev = currentRevisionOf(q)!; return { questionId: q.id, revision: rev.revision, hash: revisionHash(rev), points: bp.pointsPerQuestion, tags: q.tags,
      optionIds: (rev.options ?? []).map(o => o.id), fixed: [], correct: rev.answer?.kind === 'choice' ? rev.answer.correct : [], ...selectCountOf(q, rev) > 1 ? { select: selectCountOf(q, rev) } : {} }; }),
  };
  return {
    id: engine.id, examId: bp.examId, examName: getExam(bp.examId)?.name ?? bp.examId, subjectName: bp.title, title: `${bp.title} ${mode.titleSuffix}（測試預覽）`, description: bp.description,
    modeLabel: mode.titleSuffix, questionTypes: bp.questionTypes, result: bp.result,
    note: mode.note, durationMinutes: mode.durationMinutes, totalPoints: bp.questionCount * bp.pointsPerQuestion, questionCount: bp.questionCount, examMode,
    ...mode.passPoints !== undefined ? { passPoints: mode.passPoints, passBasis: mode.passBasis } : {},
    draw: { spec: drawSpecOf(bp, conflicts, ids), pool }, fixed: false, origin: 'practice',
    disclaimer: '測試預覽：題目尚未發布，只在自動化測試中使用。', engine, questions: pool.map(p => questionView(byId.get(p.questionId)!)),
  };
}
