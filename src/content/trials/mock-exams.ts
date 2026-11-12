import { ccarfBlueprints } from './ccarf-mock';
import type { ExamMode, QuestionType, ResultPolicy } from './schema';

/*
 * T.2D/T.2E: the iPAS mock exams as blueprints — how many questions per syllabus item, how they are timed and scored.
 * A blueprint is not a paper: src/lib/trials/mock-assembly.ts turns it into papers only from questions whose current
 * revision went through the T.2C publication gate, and only once the published pool can fill every syllabus quota.
 * Until then the exam stays 「題目準備中」 and no route is built for it.
 *
 * T.2E (docs/exam-system/21): each paper is drawn per session from the subject's published pool (src/lib/trials/draw.ts),
 * in two modes that share one engine:
 * - official-style: the subject's official format from the 115 brochure (115.04): 50 questions, 75 minutes, 100 points,
 *   70 to pass. The 2 points a question are Logic Island's assumption (the brochure publishes no per-question points).
 * - extended-practice: the same draw with 120 minutes and no pass verdict.
 */
export interface MockMode {
  examMode: ExamMode; idSuffix: string;
  /** Shown after the blueprint's title and as the mode's name on the start page. */
  titleSuffix: string;
  /** Minutes; the official-style mode takes the subject's official duration instead (checked by validateTrials). */
  durationMinutes: number;
  /** Only the official-style mode shows a pass verdict, at the subject's official pass mark. */
  passPoints?: number; passBasis?: string;
  note: string;
}
/**
 * T.3B: what must be published before a blueprint gives papers, beyond filling every syllabus quota: at least
 * `minimumPool` questions in the published pool. Nothing here can publish a question; only the T.2C gate does.
 */
export interface PublicationPolicy { minimumPool: number; note: string }
export interface MockBlueprint {
  id: string; examId: string; subjectId: string; title: string; description: string;
  questionCount: number; pointsPerQuestion: number;
  /** T.3B: the question types a pool may hold (the engine grades each by exact match). */
  questionTypes: QuestionType[];
  /** T.3B: how a result is shown (score or number right, grouping), and what must be published first. */
  result: ResultPolicy;
  publication: PublicationPolicy;
  /** Questions per official syllabus item (docs/exam-system/12 §5.2), in syllabus order: every draw covers each item. */
  coverage: Record<string, number>;
  /** Wanted [concept, application, scenario] per item (12 §5.2, 20/20/60): a soft target of the draw. */
  shapes?: Record<string, [number, number, number]>;
  /** T.3D: at most [concept, application, scenario] on the whole paper, kept by every draw; used instead of `shapes`. */
  shapeMax?: [number, number, number];
  /** T.3D: draw uniformly among the papers that keep every rule, instead of the greedy draw. */
  sampling?: 'uniform';
  modes: MockMode[];
  version: string;
}

const PER_QUESTION = '每題 2 分是 Logic Island 的假設（簡章只公布每科 100 分，沒有公布每題配分或是否倒扣）';
const DRAWN = '每次開始作答時，依考綱比例從已發布的 Logic Island 原創題中抽出 50 題；不是官方試題，也不是官方認證';
export const OFFICIAL_BASIS = '依 115 年度簡章（115.04 版）單科 70 分及格';
export const mockModes: MockMode[] = [
  { examMode: 'official-style', idSuffix: 'official', titleSuffix: '模擬考（官方規格）', durationMinutes: 75, passPoints: 70, passBasis: OFFICIAL_BASIS,
    note: `官方規格模擬：依 115 年度簡章（115.04 版），每科 50 題單選、75 分鐘、滿分 100 分、單科 70 分及格；${PER_QUESTION}。${DRAWN}。通過與否只供自我評估，不代表正式考試結果。` },
  { examMode: 'extended-practice', idSuffix: 'practice', titleSuffix: '延長練習模式', durationMinutes: 120,
    note: `延長練習模式：50 題、120 分鐘（官方為 75 分鐘）、${PER_QUESTION}、滿分 100 分。因作答時間與官方不同，不顯示通過與否。${DRAWN}。` },
];

const IPAS_RESULT: ResultPolicy = { score: 'points', groupBy: 'item' };
const IPAS_PUBLICATION = (n: number): PublicationPolicy => ({ minimumPool: n, note: '每個考綱項目的已發布題數都達到每卷配額，才產生考卷' });

export const mockBlueprints: MockBlueprint[] = [
  { id: 'ipas-aiap-basic-s1', examId: 'ipas-aiap-basic', subjectId: 'ipas-aiap-basic-115.s1', title: '科目一 L11 人工智慧基礎概論',
    description: '50 題 Logic Island 原創單選題，每次依考綱比例抽題，涵蓋 L111～L114 的 9 項評鑑內容。', questionCount: 50, pointsPerQuestion: 2,
    coverage: { L11101: 3, L11102: 4, L11201: 4, L11202: 5, L11203: 3, L11301: 8, L11302: 11, L11401: 6, L11402: 6 },
    shapes: { L11101: [1, 1, 1], L11102: [1, 1, 2], L11201: [1, 1, 2], L11202: [1, 1, 3], L11203: [1, 0, 2], L11301: [1, 2, 5], L11302: [2, 2, 7], L11401: [1, 1, 4], L11402: [1, 1, 4] },
    questionTypes: ['single-choice'], result: IPAS_RESULT, publication: IPAS_PUBLICATION(50), modes: mockModes, version: '2.0.0' },
  { id: 'ipas-aiap-basic-s2', examId: 'ipas-aiap-basic', subjectId: 'ipas-aiap-basic-115.s2', title: '科目二 L12 生成式 AI 應用與規劃',
    description: '50 題 Logic Island 原創單選題，每次依考綱比例抽題，涵蓋 L121～L123 的 7 項評鑑內容。', questionCount: 50, pointsPerQuestion: 2,
    coverage: { L12101: 3, L12102: 3, L12201: 7, L12202: 9, L12301: 10, L12302: 9, L12303: 9 },
    shapes: { L12101: [1, 1, 1], L12102: [1, 0, 2], L12201: [2, 1, 4], L12202: [2, 2, 5], L12301: [1, 2, 7], L12302: [1, 2, 6], L12303: [2, 2, 5] },
    questionTypes: ['single-choice'], result: IPAS_RESULT, publication: IPAS_PUBLICATION(50), modes: mockModes, version: '2.0.0' },
  ...ccarfBlueprints,
];
