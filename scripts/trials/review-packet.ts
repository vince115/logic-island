import { contentText, currentRevisionOf, revisionHash, type Block, type Content, type Question, type Tag } from '@/content/trials/schema';
import { DECISIONS_FORMAT, MAX_DECISIONS, lifecycleOf, requiredChecks, type DecisionFile, type Ledger } from '@/lib/trials/lifecycle';

/*
 * Shared Trial System T.2C: a review packet — 10 to 25 questions to read, with what the AI checks found, and a decision
 * template to fill in. Pure: building a packet reads the bank and changes nothing (the CLI only writes the two files
 * where it is told to). The packet holds answers and explanations of unpublished questions: keep it out of the site and
 * out of version control.
 */
export const MIN_PACKET = 10;
export interface QueueItem {
  id: string; doc: string; aiQa: 'passed'; similarityRisk: string; priority: 1 | 2 | 3; flags: string[]; confirm?: string; overlapsWith: string[];
  documentApproval?: { level: 'document'; revision: number; answer: string; at: string; note: string };
  /** T.3C–T.3E: what the answer rests on, the packet group, and an AI pre-review (never a human decision). */
  sourceStatus?: 'official-docs' | 'exam-guide-primary' | 'inferred';
  packet?: string;
  aiReview?: { at: string; verdict: string; by: 'ai'; note: string };
}
export interface ReviewQueue { format: 'logic-island.trials-review-queue/1'; exam: string; note: string; items: QueueItem[] }

const FLAG: Record<string, string> = {
  legal: '法規', volatile: '易變', 'similarity-medium': '相似性中', redesigned: '匯入前重新設計', overlap: '考點重疊',
};
const STATUS: Record<string, string> = { 'in-review': '審稿中', approved: '已核准（未發布）', published: '已發布', revoked: '已撤回' };
const LETTERS = 'ABCDEF';

const text = (c: Content): string => c.map((b: Block) => b.type === 'table'
  ? ['| ' + b.head.map(h => h || '　').join(' | ') + ' |', '|' + '---|'.repeat(b.head.length), ...b.rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n')
  : b.type === 'code' ? '```\n' + b.text + '\n```' : b.type === 'list' ? b.items.map(i => `- ${i}`).join('\n') : contentText([b])).join('\n\n');

export interface Packet { markdown: string; template: DecisionFile; questions: Question[] }

/** Questions `from` (1-based position in the batch) onward, `count` of them (10–25, fewer only at the end of a batch). */
export function buildPacket(batch: Question[], tags: Tag[], ledger: Ledger, queue: ReviewQueue | undefined, from: number, count: number, recorded: Record<string, string> = {}, exam?: string): Packet {
  if (count > MAX_DECISIONS || count < 1) throw new Error(`a packet holds ${MIN_PACKET}–${MAX_DECISIONS} questions`);
  const questions = batch.slice(from - 1, from - 1 + count);
  if (!questions.length) throw new Error('no question in that range');
  if (questions.length < MIN_PACKET && from - 1 + count < batch.length) throw new Error(`a packet holds at least ${MIN_PACKET} questions, unless it is the end of the batch`);
  const tagName = new Map(tags.map(t => [t.id, t.name])), syllabus = new Set(tags.filter(t => t.syllabus).map(t => t.id));
  const queued = new Map((queue?.items ?? []).map(i => [i.id, i]));
  const out: string[] = [
    `# 審核包：${questions[0].id} – ${questions[questions.length - 1].id}（${questions.length} 題）`, '',
    '- 本文件只供閱讀，產生它不會改變任何題目的狀態。內含未發布題目的答案與解析：不要提交到版本控制，也不要放到網站上。',
    '- 決定填在同名的 `.decisions.json`：`by` 填審核者 ID、`at` 填審核日期（兩者刻意留空，不預填任何人）；每題的 `verdict` 填 `approve`、`changes` 或 `reject`；`changes` 與 `reject` 要在 `note` 寫明原因；核准時 `checks` 須包含「需確認」列出的項目。',
    '- 每題末的「人工審核」欄由審核者本人填寫；AI 預審、AI QA 與版本敏感度只是參考，不得填入人工決定。',
    '- AI 自動品質檢查通過（AI QA Passed）≠ 人工核准（Human Approved）≠ 發布（Published）。文件層級核准只供參考，不會轉成正式核准。',
    `- 套用：\`node … scripts/trials/review.ts apply <檔案> --confirm <題數>\`（題數必須等於檔案中的決定數，全部有效才會寫入）。`, '',
  ];
  // T.3F: reviewer and date stay blank: the reviewer fills them in (planDecisions refuses a file without a real reviewer).
  const template: DecisionFile = { format: DECISIONS_FORMAT, ...exam ? { exam } : {}, by: '', at: '', decisions: [] };
  const SOURCE: Record<string, string> = { 'official-docs': '官方技術文件', 'exam-guide-primary': '主要依 Exam Guide（無技術文件佐證）', inferred: '由多份官方文件推論' };
  for (const q of questions) {
    const rev = currentRevisionOf(q)!, hash = revisionHash(rev), item = queued.get(q.id), state = lifecycleOf(q, ledger, recorded[`${q.id}@${rev.revision}`]);
    const domain = q.tags.map(t => tags.find(x => x.id === t)?.syllabus?.parent).find(Boolean);
    const answer = rev.answer?.kind === 'choice' ? rev.answer.correct.map(id => LETTERS[rev.options!.findIndex(o => o.id === id)]).sort().join('') : '—';
    const risky = item?.priority === 1;
    out.push(`## ${risky ? '⚠ 高風險　' : ''}\`${q.id}\`　第 ${rev.revision} 版（\`${hash}\`）`, '');
    out.push('| 項目 | 內容 |', '|---|---|',
      `| 狀態 | ${STATUS[q.review.status] ?? q.review.status}${state.held.length ? `：${state.held.join('；')}` : ''} |`,
      ...domain ? [`| 領域 | ${domain.code} ${domain.name} |`] : [],
      `| 考綱 | ${q.tags.filter(t => syllabus.has(t) || !t.includes('.')).map(t => tagName.get(t) ?? t).join('、') || '—'} |`,
      `| 子主題 | ${q.tags.filter(t => !syllabus.has(t) && t !== 'meta.volatile').map(t => tagName.get(t) ?? t).join('、')} |`,
      `| 題型 | ${q.type}${rev.answer?.kind === 'choice' && rev.answer.select ? `（選 ${rev.answer.select} 個）` : ''} |`,
      `| 題型／難度 | ${q.stemShape ?? '—'}／${rev.difficulty?.level ?? '—'} |`,
      `| 時效 | ${q.reviewBy ? `易變，複查日 ${q.reviewBy}${q.volatility ? `（${q.volatility.reason}；${q.volatility.checkedAt} 查證）` : ''}` : '—'} |`,
      `| 風險標記 | ${[risky ? '第一優先' : '', item?.sourceStatus === 'exam-guide-primary' ? '僅依 Exam Guide' : '', q.tags.includes('meta.volatile') ? '版本敏感' : '', ...item?.flags.map(f => FLAG[f] ?? f) ?? []].filter(Boolean).join('、') || '—'} |`,
      `| 參考文件 | ${q.references?.map(r => `[${r.title}](${r.url})（${r.checkedAt}）`).join('；') || '—'} |`,
      `| 內容雜湊 | ${rev.hashVersion === 2 ? '第 2 版（含解析）' : '舊版（第 1 版：題幹、選項、答案、配分）'}；版本歷史 ${q.revisions.map(r => `r${r.revision} ${revisionHash(r)}`).join(' → ')} |`,
      `| 答案依據 | ${item?.sourceStatus ? SOURCE[item.sourceStatus] : '—'} |`,
      `| AI 自動檢查 | ${item ? 'AI QA Passed（不是人工核准）' : '—'} |`,
      ...item?.aiReview ? [`| AI 技術預審 | ${item.aiReview.verdict}（${item.aiReview.at}，AI，**不是人工審核**） |`] : [],
      `| 相似性風險 | ${item?.similarityRisk ?? '—'} |`,
      `| 標記 | ${item?.flags.length ? item.flags.map(f => FLAG[f] ?? f).join('、') : '—'} |`,
      `| 避免同卷 | ${item?.overlapsWith.length ? item.overlapsWith.map(id => `\`${id}\``).join('、') : '—'} |`,
      `| 待人工確認 | ${item?.confirm ?? '—'} |`,
      `| 需確認 | ${requiredChecks(q).join('、') || '—'} |`,
      ...item?.documentApproval ? [`| 文件層級核准 | 第 ${item.documentApproval.revision} 版、答案 ${item.documentApproval.answer}、${item.documentApproval.at}：${item.documentApproval.note}${item.documentApproval.revision !== rev.revision ? '（**版本已不同，必須重新審核**）' : ''} |`] : [],
      '');
    out.push('**題幹**', '', text(rev.stem ?? []), '', '**選項**', '');
    (rev.options ?? []).forEach((o, i) => { const note = rev.explanation?.options?.find(e => e.optionId === o.id); out.push(`- （${LETTERS[i]}）${text(o.body)}${note ? `\n  - 選項解析：${text(note.body)}` : ''}`); });
    out.push('', `**答案**：（${answer}）`, '');
    if (rev.explanation) out.push('**解析**', '', text(rev.explanation.body), '');
    out.push('**人工審核（審核者本人填寫；AI 不填）**', '', '| 欄位 | 填寫 |', '|---|---|', '| 決定（approve／changes／reject） | 　 |', '| 審核者 | 　 |', '| 審核日期 | 　 |', '| 原因／備註 | 　 |', '');
    template.decisions.push({ questionId: q.id, revision: rev.revision, hash, verdict: null as unknown as 'approve', checks: [], note: '' });
  }
  return { markdown: out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', template, questions };
}
