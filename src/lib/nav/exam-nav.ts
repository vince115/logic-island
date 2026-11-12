import { examStatus, getExam, papersOfExam, statusOfPaper, trialBank } from '@/content/trials';
import type { ExamFamily } from '@/content/trials/schema';
import type { NavGroup, NavNode } from './site-nav';

/*
 * 2026-11-12: the exam side of the sidebar, built from the trial bank (exams, entry labels, papers). Only exams with a
 * paper link to a page; the others are listed as not yet open. Loaded only by pages of a build with the trial system.
 */
export const FAMILY_LABELS: Record<ExamFamily, string> = {
  certification: '認證考試', 'school-assessment': '程式檢定', 'civil-service': '國家考試', recruitment: '招考甄試',
};
const FAMILY_ORDER: ExamFamily[] = ['certification', 'school-assessment', 'civil-service', 'recruitment'];

/** The name an exam goes by on its entries (shorter than its official name), or its name. */
export const examLabel = (examId: string) => trialBank.entries.find(e => e.examId === examId)?.label ?? getExam(examId)?.name ?? examId;

export function examTree(): NavGroup[] {
  return FAMILY_ORDER.flatMap(family => {
    const exams = trialBank.exams.filter(e => e.family === family);
    if (!exams.length) return [];
    return [{ id: `e:${family}`, label: FAMILY_LABELS[family], hint: `${exams.length}`, children: exams.map((exam): NavNode => {
      if (examStatus(exam.id) !== 'available') return { id: `e:${exam.id}`, label: examLabel(exam.id), disabled: '尚未開放' };
      const papers = papersOfExam(exam.id);
      return { id: `e:${exam.id}`, label: examLabel(exam.id), children: [
        { id: `e:${exam.id}:intro`, label: '考試介紹與作答紀錄', href: `/trials/${exam.id}` },
        ...papers.map(p => ({ id: `e:${exam.id}:${p.id}`, label: p.title, code: statusOfPaper(p) === 'retired' ? '退場' : '模擬', href: `/trials/${exam.id}/${p.id}` })),
      ] };
    }) }];
  });
}

/** Where an exam sits, for the breadcrumb: its family. */
export const examFamilyLabel = (examId: string) => { const exam = getExam(examId); return exam ? FAMILY_LABELS[exam.family] : undefined; };
