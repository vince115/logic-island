import type { Exam, ExamEdition, ExamSubject } from './schema';

/*
 * T.0 exam catalog: four exams, their current editions and subjects. Formats are written only as far as the cited
 * source states them (docs/exam-system/02); anything unverified is left out instead of guessed.
 */
const DISCLAIMER = '非官方模擬，供自我練習；題目為 Logic Island 原創或依法可自由利用的官方試題，成績不代表正式考試結果。';

export const exams: Exam[] = [
  { id: 'apcs', name: 'APCS 大學程式設計先修檢測', nameEn: 'Advanced Placement Computer Science', issuer: '國立臺灣師範大學資訊工程學系',
    family: 'school-assessment', archipelago: 'cs', official: { url: 'https://apcs.csie.ntnu.edu.tw/', sourceId: 'apcs-official-site' }, disclaimer: DISCLAIMER },
  { id: 'moex-info-processing', name: '高普考資訊處理', nameEn: 'Civil Service Examination: Information Processing', issuer: '考選部',
    family: 'civil-service', archipelago: 'cs', official: { url: 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx', sourceId: 'moex-past-papers' }, disclaimer: DISCLAIMER },
  { id: 'bank-it', name: '銀行資訊人員甄試', nameEn: 'Bank IT Recruitment Examination', issuer: '各公股行庫（試務：台灣金融研訓院）',
    family: 'recruitment', archipelago: 'cs', official: { url: 'https://www.tabf.org.tw/Exam.aspx', sourceId: 'tabf-bank-exams' }, disclaimer: DISCLAIMER },
  { id: 'ipas-aiap-basic', name: 'iPAS AI 應用規劃師（初級）', nameEn: 'iPAS AI Application Planner (Basic)', issuer: '經濟部產業發展署',
    family: 'certification', archipelago: 'ai', official: { url: 'https://www.ipas.org.tw/certification/AIAP/learning-resources', sourceId: 'ipas-aiap-official-site' }, disclaimer: DISCLAIMER,
    syllabusCodes: { item: 'L\\d{5}', topic: 'L\\d{3}' } },
  // T.3B (docs/exam-system/23, 26): not affiliated with or endorsed by Anthropic; only Partner Network staff can sit it.
  { id: 'ccarf', name: 'Claude Certified Architect – Foundations（CCAR-F）', nameEn: 'Claude Certified Architect – Foundations', issuer: 'Anthropic',
    family: 'certification', archipelago: 'ai', official: { url: 'https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification', sourceId: 'ccarf-certification-page' },
    disclaimer: '非官方練習，供自我學習；題目全部是 Logic Island 原創，不是 Anthropic 的試題、範例題或考生回憶題。Logic Island 與 Anthropic 沒有合作或背書關係，成績不代表正式考試結果。',
    syllabusCodes: { item: 'D[1-5]\\.\\d', topic: 'D[1-5]' } },
];

export const editions: ExamEdition[] = [
  { id: 'apcs-current', examId: 'apcs', label: '現行制度（程式識讀＋程式實作）', basis: [{ sourceId: 'apcs-official-site', checkedAt: '2026-11-03' }], reviewBy: '2027-05-01' },
  { id: 'moex-info-processing-114', examId: 'moex-info-processing', label: '114 年', basis: [{ sourceId: 'moex-past-papers', checkedAt: '2026-11-03' }], reviewBy: '2027-11-01' },
  { id: 'bank-it-general', examId: 'bank-it', label: '一般資訊類筆試範圍（未依特定行庫簡章核對）', basis: [{ sourceId: 'tabf-bank-exams', checkedAt: '2026-11-03' }], reviewBy: '2027-05-01' },
  // T.2B-1: the 115 brochure (format and scoring) and the 115.06 syllabus (scope), as researched in docs/exam-system/09.
  { id: 'ipas-aiap-basic-115', examId: 'ipas-aiap-basic', label: '115 年度（評鑑內容範圍參考 115.06）',
    basis: [{ sourceId: 'ipas-aiap-brochure-115', checkedAt: '2026-11-03' }, { sourceId: 'ipas-aiap-syllabus-115-06', checkedAt: '2026-11-03' }, { sourceId: 'ipas-aiap-official-site', checkedAt: '2026-11-03' }],
    reviewBy: '2027-05-01' },
  // T.3B: Exam Guide 1.0 (Effective July 2026); Claude products change fast, so it is checked again within 90 days.
  { id: 'ccarf-2026-07', examId: 'ccarf', label: 'Exam Guide 1.0 版（Effective July 2026）', effectiveFrom: '2026-07-01',
    basis: [{ sourceId: 'ccarf-exam-guide-1-0', checkedAt: '2026-11-05' }, { sourceId: 'ccarf-certification-page', checkedAt: '2026-11-05' }], reviewBy: '2027-02-03' },
];

export const subjects: ExamSubject[] = [
  { id: 'apcs-current.reading', editionId: 'apcs-current', name: '程式識讀', format: { durationMinutes: 90, questionCount: 30, totalPoints: 100 }, questionTypes: ['code-reading', 'single-choice'],
    note: '單選題；C 或 Python 題本' },
  { id: 'apcs-current.implementation', editionId: 'apcs-current', name: '程式實作', format: { durationMinutes: 120, questionCount: 3, totalPoints: 300 }, questionTypes: ['code-implementation'],
    note: '分初級、中級、中高級、高級；Logic Island 尚無線上判題' },
  { id: 'moex-info-processing-114.pukao-computer', editionId: 'moex-info-processing-114', name: '普通考試・計算機概要', format: { durationMinutes: 60, questionCount: 40, totalPoints: 100 },
    questionTypes: ['single-choice', 'code-reading'], note: '單一選擇題，每題 2.5 分（114 年試題）' },
  { id: 'bank-it-general.it', editionId: 'bank-it-general', name: '資訊類綜合', format: {}, questionTypes: ['single-choice', 'code-reading'],
    note: '各行庫科目不同；範圍為資訊安全、網路、資料庫與程式設計' },
  // Format from the 115 brochure (§2.3, §4.2): 50 single-choice questions, 75 minutes, 100 points, 70 to pass a subject.
  ...([['s1', 'L11 人工智慧基礎概論'], ['s2', 'L12 生成式 AI 應用與規劃']] as const).map(([id, name]): ExamSubject => ({
    id: `ipas-aiap-basic-115.${id}`, editionId: 'ipas-aiap-basic-115', name,
    format: { durationMinutes: 75, questionCount: 50, totalPoints: 100, passPoints: 70 }, questionTypes: ['single-choice'],
    note: '電腦應試、單選題；單科 70 分及格。兩科同時報考者，平均 70 分以上且每科不低於 60 分才授證（簡章 115.04 版）。',
    mockScoring: { pointsPerQuestion: 2, passPoints: 70,
      note: 'Logic Island 模擬計分規則：每題 2 分、70 分及格。官方只公告每科 100 分、70 分及格，沒有公告每題配分或是否倒扣。' },
  })),
  // T.3B: Exam Guide 1.0 §3: 60 scenario-based items, 120 minutes; the score is scaled (no points or raw pass mark), so
  // the format leaves totalPoints and passPoints out.
  { id: 'ccarf-2026-07.foundations', editionId: 'ccarf-2026-07', name: 'Foundations', format: { durationMinutes: 120, questionCount: 60 },
    questionTypes: ['single-choice', 'multiple-response'],
    note: '全部是情境題，單選與複選（每題註明要選幾個）；從 6 個情境抽 4 個。尺度分數 100–1,000、720 分及格，官方未公布換算方式。官方考試以英文與日文進行，限 Claude Partner Network 成員報考（考試指南 1.0 版）。' },
];
