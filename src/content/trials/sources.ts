import type { Source } from './schema';

/*
 * T.0 sources: the official pages each exam is described from, and the bases the original questions are written
 * against (docs/exam-system/02_EXAM_SOURCE_INVENTORY.md, checked 2026-11-03). Official pages are linked, never copied:
 * their licences stay unconfirmed except the Ministry of Examination's, whose past papers are free to use.
 */
const IPAS_UPLOADS = 'https://www.ipas.org.tw/api/proxy/uploads';
const IPAS_PAPERS: [id: string, sitting: string, subject: string, file: string][] = [
  ['114-4-s1', '114 年第四梯次', '科目 1', '114年第四梯次初級AI應用規劃師第一科人工智慧基礎概論(當次試題公告114_20251226000442.pdf'],
  ['114-4-s2', '114 年第四梯次', '科目 2', '114年第四梯次初級AI應用規劃師第二科生成式AI應用與規劃(當次試題公告114_20251226000507.pdf'],
  ['115-1-s1', '115 年第一次', '科目 1', '115年第一次初級AI應用規劃師_第一科_人工智慧基礎概論_公告試題_20260410164304.pdf'],
  ['115-1-s2', '115 年第一次', '科目 2', '115年第一次初級AI應用規劃師_第二科_生成式AI應用與規劃_公告試題_20260410164328.pdf'],
  ['115-2-s1', '115 年第二次', '科目 1', '115年第二次初級AI應用規劃師_第一科_人工智慧基礎概論_公告試題_20260604212644.pdf'],
  ['115-2-s2', '115 年第二次', '科目 2', '115年第二次初級AI應用規劃師_第二科_生成式AI應用與規劃_公告試題_20260604212719.pdf'],
  ['115-3-s1', '115 年第三次', '科目 1', '115年第三次初級AI應用規劃師_第一科_人工智慧基礎概論_公告試題_20260906220418.pdf'],
  ['115-3-s2', '115 年第三次', '科目 2', '115年第三次初級AI應用規劃師_第二科_生成式AI應用與規劃_公告試題_20260906220452.pdf'],
];

export const sources: Source[] = [
  { id: 'apcs-official-site', kind: 'official-syllabus', issuer: '國立臺灣師範大學資訊工程學系（教育部高中職程式設計適性精進計畫）',
    title: 'APCS 大學程式設計先修檢測：檢測內容與時程', url: 'https://apcs.csie.ntnu.edu.tw/index.php/info-v2/', retrievedAt: '2026-11-03',
    license: 'unconfirmed', attribution: 'APCS 大學程式設計先修檢測官方網站' },
  { id: 'ipas-aiap-official-site', kind: 'official-syllabus', issuer: '經濟部產業發展署（執行：工業技術研究院）',
    title: 'iPAS AI 應用規劃師：學習資源', url: 'https://www.ipas.org.tw/certification/AIAP/learning-resources', retrievedAt: '2026-11-03',
    license: 'unconfirmed', attribution: 'iPAS 經濟部產業人才能力鑑定 AI 應用規劃師專區' },
  // T.2B-1 (docs/exam-system/09 §0, §2): the 115 brochure and the 115.06 syllabus set the iPAS originals' format and scope.
  // Their licence is unconfirmed: only the syllabus codes and names are cited, never their text.
  { id: 'ipas-aiap-brochure-115', kind: 'official-syllabus', issuer: '經濟部產業發展署（執行：工業技術研究院）',
    title: '115 年度 AI 應用規劃師能力鑑定簡章（初、中級）', url: `${IPAS_UPLOADS}/certification_attachment/8039a24c849c4fb4a6dd7f942576d4f8/115年度AI應用規劃師能力鑑定簡章(初、中級)_0410_20260410144503.pdf`,
    retrievedAt: '2026-11-03', license: 'unconfirmed', attribution: '經濟部產業發展署 iPAS《115 年度 AI 應用規劃師能力鑑定簡章》', version: '115.04' },
  { id: 'ipas-aiap-syllabus-115-06', kind: 'official-syllabus', issuer: '經濟部產業發展署（執行：工業技術研究院）',
    title: 'AI 應用規劃師能力鑑定 評鑑內容範圍參考', url: `${IPAS_UPLOADS}/certification_attachment/8039a24c849c4fb4a6dd7f942576d4f8/AI應用規劃師能力鑑定_評鑑內容範圍參考_11506_20260602161501.pdf`,
    retrievedAt: '2026-11-03', license: 'unconfirmed', attribution: '經濟部產業發展署 iPAS《AI 應用規劃師能力鑑定 評鑑內容範圍參考》115.06 更新', version: '115.06' },
  { id: 'basis-ipas-aiap-basic', kind: 'original-basis', issuer: 'Logic Island', title: '依 iPAS AI 應用規劃師（初級）評鑑內容範圍（115.06）撰寫的原創題',
    url: `${IPAS_UPLOADS}/certification_attachment/8039a24c849c4fb4a6dd7f942576d4f8/AI應用規劃師能力鑑定_評鑑內容範圍參考_11506_20260602161501.pdf`, retrievedAt: '2026-11-03',
    license: 'original', basedOn: ['ipas-aiap-syllabus-115-06', 'ipas-aiap-brochure-115'] },
  // The published basic-level papers: read for statistics only (09 §2.2), never imported, never cited by a question.
  ...IPAS_PAPERS.map(([id, sitting, subject, file]): Source => ({
    id: `ipas-aiap-basic-paper-${id}`, kind: 'official-paper', issuer: '經濟部產業發展署（執行：工業技術研究院）',
    title: `${sitting}初級 AI 應用規劃師 ${subject} 公告試題`, url: `${IPAS_UPLOADS}/certification_resource/bf93f438f7be48d295c1b40a34d79f3d/${file}`,
    retrievedAt: '2026-11-03', license: 'unconfirmed', attribution: `經濟部產業發展署 iPAS ${sitting}初級 AI 應用規劃師公告試題`, version: sitting, researchOnly: true,
  })),
  { id: 'moex-past-papers', kind: 'official-paper', issuer: '考選部', title: '考畢試題查詢平臺（含測驗題答案）',
    url: 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx', retrievedAt: '2026-11-03', license: 'free-use-statute',
    attribution: '考選部考畢試題' },
  // T.1 first import batch: one paper and its answer key, from the platform's open-data list of paper and key files.
  { id: 'moex-114-pukao-3448', kind: 'official-paper', issuer: '考選部', title: '114 年公務人員普通考試 資訊處理類科《計算機概要》試題（代號 3448）',
    url: 'https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx?t=Q&code=114080&c=448&s=2607&q=1', retrievedAt: '2026-11-03', license: 'free-use-statute',
    attribution: '考選部考畢試題：114 年公務人員普通考試《計算機概要》' },
  { id: 'moex-114-pukao-3448-key', kind: 'official-answer-key', issuer: '考選部', title: '114 年公務人員普通考試 資訊處理類科《計算機概要》測驗式試題標準答案',
    url: 'https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx?t=S&code=114080&c=448&s=2607&q=1', retrievedAt: '2026-11-03', license: 'free-use-statute',
    attribution: '考選部測驗式試題標準答案' },
  { id: 'tabf-bank-exams', kind: 'official-syllabus', issuer: '各公股行庫（試務：財團法人台灣金融研訓院）', title: '台灣金融研訓院受託甄試專區',
    url: 'https://www.tabf.org.tw/Exam.aspx', retrievedAt: '2026-11-03', license: 'unconfirmed', attribution: '台灣金融研訓院受託甄試專區' },
  // T.3B (docs/exam-system/23, 26): CCAR-F. The exam guide and the certification page set the exam's format and scope;
  // their licence is unconfirmed (Anthropic keeps all rights, docs/exam-system/26 §1), so only the domain names and the
  // task-statement codes are cited, and the task statements are paraphrased. Its sample questions are never used.
  { id: 'ccarf-exam-guide-1-0', kind: 'official-syllabus', issuer: 'Anthropic', title: 'Claude Certified Architect – Foundations Exam Guide',
    url: 'https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F6nizmqk8tpzpfjvt6qmmav7rh%2Fpublic%2F1783542750%2FClaude+Certified+Architect+%E2%80%93+Foundations+Exam+Guide.pdf', retrievedAt: '2026-11-05', license: 'unconfirmed',
    attribution: 'Anthropic《Claude Certified Architect – Foundations Exam Guide》Version 1.0（Effective July 2026）', version: '1.0' },
  { id: 'ccarf-certification-page', kind: 'official-syllabus', issuer: 'Anthropic（Anthropic Partner Academy）', title: 'Claude Certified Architect – Foundations：認證報名頁',
    url: 'https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification', retrievedAt: '2026-11-05', license: 'unconfirmed',
    attribution: 'Anthropic Partner Academy：Claude Certified Architect – Foundations' },
  { id: 'basis-ccarf', kind: 'original-basis', issuer: 'Logic Island', title: '依 CCAR-F 考試指南 1.0 版五大 domain 與任務陳述撰寫的原創練習題（非官方）',
    url: 'https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F6nizmqk8tpzpfjvt6qmmav7rh%2Fpublic%2F1783542750%2FClaude+Certified+Architect+%E2%80%93+Foundations+Exam+Guide.pdf', retrievedAt: '2026-11-05', license: 'original', basedOn: ['ccarf-exam-guide-1-0'] },
  { id: 'basis-apcs-reading', kind: 'original-basis', issuer: 'Logic Island', title: '依 APCS 官網「程式識讀」評量架構撰寫的原創示例',
    url: 'https://apcs.csie.ntnu.edu.tw/index.php/questionstypes/', retrievedAt: '2026-11-03', license: 'original' },
  { id: 'basis-bank-it', kind: 'original-basis', issuer: 'Logic Island', title: '依一般資訊類筆試範圍撰寫的原創示例（未依特定行庫簡章核對）',
    url: 'https://www.tabf.org.tw/Exam.aspx', retrievedAt: '2026-11-03', license: 'original' },
];
