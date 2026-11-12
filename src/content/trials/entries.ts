import type { TrialEntry } from './schema';

/*
 * T.0 entry points: which archipelago shows which exam (plan 05 §9.1). Only references: the exam by id and the place
 * by world region id. Moving an entry, or giving the hub or an island one, changes this file and nothing in the bank.
 */
export const trialEntries: TrialEntry[] = [
  { id: 'cs-apcs', examId: 'apcs', place: { kind: 'region', regionId: 'cs' }, label: 'APCS 程式檢測', order: 1 },
  { id: 'cs-moex', examId: 'moex-info-processing', place: { kind: 'region', regionId: 'cs' }, label: '高普考資訊處理', order: 2 },
  { id: 'cs-bank', examId: 'bank-it', place: { kind: 'region', regionId: 'cs' }, label: '銀行資訊類', order: 3 },
  { id: 'ai-ipas', examId: 'ipas-aiap-basic', place: { kind: 'region', regionId: 'ai' }, label: 'iPAS AI 應用規劃師', order: 1 },
  { id: 'ai-ccarf', examId: 'ccarf', place: { kind: 'region', regionId: 'ai' }, label: 'CCAR-F Claude 架構師（非官方練習）', order: 2 },
];
