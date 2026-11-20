import type { MockBlueprint } from '@/content/trials/mock-exams';
import type { ExamPaper, Question, Source } from '@/content/trials/schema';
import { FREE_CODE } from '@/content/trials/schema';
import type { DrawSpec } from './draw';
import { publishedRevision, subjectQuestions } from './mock-assembly';

/*
 * Docs 35: free practice. A subject with at least one published question gets a practice paper of its own, apart from the
 * mock exam: it needs no syllabus quotas, so it exists as soon as one question is published. It draws min(FREE_COUNT,
 * published) questions from the subject's published pool at random, never repeating one (src/lib/trials/draw.ts), and is
 * scored and explained like any paper. The mock exam keeps its quotas (mock-assembly.ts): a pool that cannot fill them
 * gives practice and no mock, never a mock padded with repeated or missing questions.
 */
export const FREE_COUNT = 10;
const MINUTES_PER_QUESTION = 5;

/** The published pool of a blueprint's subject as practice sees it: its question types, current published revision. */
export function practicePool(bp: MockBlueprint, questions: Question[], sources: Map<string, Source>, recorded: Record<string, string>) {
  return subjectQuestions(bp, questions).flatMap(q => {
    const { revision } = publishedRevision(q, sources, recorded);
    return revision !== undefined && bp.questionTypes.includes(q.type) ? [{ q, revision }] : [];
  }).sort((a, b) => a.q.id.localeCompare(b.q.id));
}

export function practicePapers(blueprints: MockBlueprint[], questions: Question[], sources: Map<string, Source>, recorded: Record<string, string>, conflicts: [string, string][]): ExamPaper[] {
  const seen = new Set<string>();
  return blueprints.flatMap(bp => {
    if (seen.has(bp.subjectId)) return [];
    seen.add(bp.subjectId);
    const pool = practicePool(bp, questions, sources, recorded);
    if (!pool.length) return [];
    const count = Math.min(FREE_COUNT, pool.length), ids = new Set(pool.map(p => p.q.id));
    const draw: DrawSpec = { count, coverage: { [FREE_CODE]: count }, conflicts: conflicts.filter(([a, b]) => ids.has(a) && ids.has(b)) };
    return [{
      id: `${bp.id}-free`, kind: 'generated', free: true, examMode: 'extended-practice', subjectId: bp.subjectId,
      title: `${bp.title} 自由練習`,
      description: `從已發布的 ${pool.length} 題中隨機抽 ${count} 題，不依考綱配額，不會重複出同一題；交卷後可看答案與解析。`,
      durationMinutes: Math.max(10, count * MINUTES_PER_QUESTION),
      items: pool.map(p => ({ questionId: p.q.id, revision: p.revision, points: bp.pointsPerQuestion })), draw,
      shuffle: { questions: false, options: false },
      note: '自由練習不是模擬考：題數依目前已發布的題目決定（最多 10 題），不代表考綱覆蓋，成績不換算官方分數，也不判定通過與否。',
      modes: ['mock'], version: '1.0.0', modeLabel: '自由練習', questionTypes: bp.questionTypes,
      result: { ...bp.result, ...bp.result.score === 'points' ? { groupBy: 'item' as const } : {} },
    } satisfies ExamPaper];
  });
}
