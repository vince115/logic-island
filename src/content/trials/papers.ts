import type { ExamPaper } from './schema';

/*
 * T.0 papers: fixed mock papers of the original questions. Smaller than the official format, timed at about the
 * official pace (APCS 程式識讀: 90 minutes for 30 questions), with a practice pass mark that is not an official one.
 */
export const papers: ExamPaper[] = [
  { id: 'apcs-reading-mock-a', kind: 'fixed', subjectId: 'apcs-current.reading', title: '程式識讀 模擬卷 A',
    description: '7 題原創程式識讀題，涵蓋程式追蹤、填空、除錯、效能分析與計算邏輯。', durationMinutes: 21,
    items: ['01', '02', '03', '04', '05', '06', '07'].map(n => ({ questionId: `orig-apcs-read-${n}`, points: 10 })),
    shuffle: { questions: false, options: false }, passPoints: 42,
    note: '縮小版：官方為 30 題、100 分；及格線 60% 是練習用的參考，非官方標準。', modes: ['mock'], version: '1.0.0' },
  { id: 'bank-it-mock-a', kind: 'fixed', subjectId: 'bank-it-general.it', title: '資訊類綜合 模擬卷 A',
    description: '6 題原創單選題：資訊安全、網路、資料庫與程式追蹤。', durationMinutes: 12,
    items: ['01', '02', '04', '05', '06', '09'].map(n => ({ questionId: `orig-bank-${n}`, points: 10 })),
    shuffle: { questions: false, options: true }, passPoints: 36,
    note: '各行庫的題數、時間與及格標準不同；及格線 60% 是練習用的參考。', modes: ['mock'], version: '1.0.0' },
  // T.1: the first official paper, in its own order and options (the letters match the official key).
  { id: 'moex-114-pukao-3448', kind: 'fixed', subjectId: 'moex-info-processing-114.pukao-computer', title: '114 年普考《計算機概要》原卷',
    description: '考選部 114 年公務人員普通考試資訊處理類科試題，40 題單一選擇題，依原卷題序；原卷禁止使用電子計算器。', durationMinutes: 60,
    items: Array.from({ length: 40 }, (_, i) => ({ questionId: `moex-114-pukao-3448-q${String(i + 1).padStart(2, '0')}`, points: 2.5 })),
    shuffle: { questions: false, options: false },
    note: '正式考試依全部科目的成績錄取，單一科目沒有及格線，所以這份練習卷不設及格線。答案依考選部公告，解析由 Logic Island 撰寫，非官方解答。',
    modes: ['mock'], version: '1.0.0' },
];
