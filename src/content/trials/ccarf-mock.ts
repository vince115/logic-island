import type { MockBlueprint, MockMode } from './mock-exams';

/*
 * T.3B: the CCAR-F practice exam as a blueprint (docs/exam-system/24 §2, 25 §5, 26). Like the iPAS ones it gives papers
 * only from questions published through the T.2C gate, once the published pool fills every task-statement quota and
 * holds at least 60 questions; until then the exam stays 「題目準備中」 and no route is built.
 *
 * Official (Exam Guide 1.0, Effective July 2026): 60 scenario-based questions, single-answer and multiple-response,
 * 120 minutes, a scaled score of 100–1,000 with 720 to pass. Anthropic publishes no raw-to-scaled conversion, so Logic
 * Island shows neither a scaled score nor a pass verdict: only the number right, the accuracy and each domain.
 * Logic Island's own rules: 1 point a question, exact-match scoring of multiple-response (no partial credit), and the
 * per-task-statement quotas below (docs/exam-system/24 §2 「卷」, sized from the official domain weights).
 */
const RULES = '每題答對計 1 題；複選題須選對全部正確選項且沒有多選才算答對（Logic Island 的計分規則，官方未公布複選題是否給部分分數）';
const UNOFFICIAL = '這是 Logic Island 的非官方模擬考，題目全部為原創，不是 Anthropic 的試題，也不代表正式考試結果；不換算官方尺度分數（100–1,000），也不判定通過與否。官方考試以英文與日文進行。';
export const ccarfModes: MockMode[] = [
  { examMode: 'official-style', idSuffix: 'official', titleSuffix: '模擬考（官方題數與時間）', durationMinutes: 120,
    note: `依官方考試指南 1.0 版的題數與時間：60 題、120 分鐘。${RULES}。${UNOFFICIAL}` },
  { examMode: 'extended-practice', idSuffix: 'practice', titleSuffix: '延長練習模式', durationMinutes: 150,
    note: `延長練習模式：60 題、150 分鐘（官方為 120 分鐘）。${RULES}。${UNOFFICIAL}` },
];

export const ccarfBlueprints: MockBlueprint[] = [
  { id: 'ccarf-foundations', examId: 'ccarf', subjectId: 'ccarf-2026-07.foundations', title: 'CCAR-F 原創練習卷',
    description: '60 題 Logic Island 原創情境題（單選與複選），每次依五大 domain 與 30 項任務陳述的配額抽題。', questionCount: 60, pointsPerQuestion: 1,
    coverage: {
      'D1.1': 3, 'D1.2': 2, 'D1.3': 2, 'D1.4': 3, 'D1.5': 2, 'D1.6': 2, 'D1.7': 2,
      'D2.1': 3, 'D2.2': 2, 'D2.3': 2, 'D2.4': 2, 'D2.5': 2,
      'D3.1': 2, 'D3.2': 2, 'D3.3': 2, 'D3.4': 2, 'D3.5': 2, 'D3.6': 2,
      'D4.1': 2, 'D4.2': 2, 'D4.3': 2, 'D4.4': 2, 'D4.5': 2, 'D4.6': 2,
      'D5.1': 2, 'D5.2': 2, 'D5.3': 1, 'D5.4': 2, 'D5.5': 1, 'D5.6': 1,
    },
    // [concept, application, scenario], about 5/15/80 (docs/exam-system/25 §4). T.3D (docs/exam-system/28 §3): a cap on
    // the whole paper, at most 3 concept and 9 application questions, so at least 48 of the 60 are scenarios. Per-item
    // targets (1.0.0–1.1.0) left three questions no paper could draw and put twelve on every paper.
    shapeMax: [3, 9, 60],
    // T.3D: every paper that keeps the quotas, the conflict pairs and the shape cap is equally likely.
    sampling: 'uniform',
    questionTypes: ['single-choice', 'multiple-response'],
    result: { score: 'raw-correct', groupBy: 'topic', notice: UNOFFICIAL },
    publication: { minimumPool: 60, note: '已發布題至少 60 題，且 30 項任務陳述的已發布題數都達到每卷配額，才產生考卷' },
    modes: ccarfModes, version: '1.2.0' },
];
