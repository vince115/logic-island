import { currentRevisionOf, isDate, revisionHash, type Question } from '@/content/trials/schema';
import type { ExamOf } from './lifecycle';

/*
 * Shared Trial System T.3F: version-sensitive questions (docs/exam-system/30 §8).
 *
 * A question tagged meta.volatile rests on product behaviour that can change (an API field, a Claude Code setting, an
 * MCP version). Its metadata says why, when it was checked and when it must be checked again (reviewBy); its references
 * name the official sources. The register (docs/exam-system/data/<exam>-volatility.json) records, per question, the
 * technical verification of its claims, bound to the revision and content hash that was verified. Two things are kept
 * apart on purpose:
 *
 *   - source availability: whether the official pages still answer (an HTTP check, `--check-sources`), and
 *   - technical correctness: whether the claim was verified against them, by whom (AI or a human) and when.
 *
 * A page that still answers proves nothing about the claim. A new revision, a passed review date or an unregistered
 * question makes the claim `pending-verification`; nothing here changes an answer, a revision or the register.
 */
export const VOLATILITY_FORMAT = 'logic-island.trials-volatility-register/1';
/**
 * The register of each exam that keeps one (the release preflight and trials:volatility require it while the bank has
 * questions of that exam). T.3J: a path inside the private bank, since the register names unpublished questions.
 */
export const VOLATILITY_REGISTERS: Record<string, string> = { ccarf: 'data/ccarf-volatility.json' };
export type Technical = 'ai-checked' | 'human-verified' | 'pending-verification';
export interface RegisterEntry {
  id: string; revision: number; hash: string;
  /** The technical verification of the claim on that revision (an AI check is never a human approval). */
  technical: { status: Technical; at: string; by: 'ai' | string; note?: string };
  /** The last check that the official pages answer; says nothing about the claim. */
  sources: { status: 'available' | 'unavailable' | 'not-checked'; at?: string };
}
export interface Register { format: typeof VOLATILITY_FORMAT; exam: string; note: string; entries: RegisterEntry[] }

export const FLAGS = ['overdue', 'due-soon', 'missing-source', 'exam-guide-only', 'missing-review-date', 'source-unavailable', 'revision-changed', 'unregistered'] as const;
export type Flag = typeof FLAGS[number];
export interface VolatileRow {
  id: string; revision: number; hash: string; status: string; products: string[]; sources: string[];
  checkedAt?: string; reviewBy?: string; daysLeft?: number; reason?: string;
  technical: Technical; technicalBy?: string; technicalAt?: string;
  availability: 'available' | 'unavailable' | 'not-checked'; flags: Flag[];
}
export interface VolatilityReport {
  exam: string; today: string; dueSoonDays: number; rows: VolatileRow[];
  counts: Record<Flag, number> & { questions: number; pending: number };
  /** Register entries for questions that are gone or no longer volatile. */
  stale: string[];
  problems: string[];
}

const EXAM_GUIDE = /Exam\+Guide|Exam%20Guide|exam-guide/i;
/** The product a reference documents, from its address. */
export function productOf(url: string): string {
  const u = new URL(url);
  if (EXAM_GUIDE.test(url)) return 'Exam Guide';
  if (u.hostname === 'code.claude.com') return u.pathname.includes('/agent-sdk') ? 'Claude Agent SDK' : 'Claude Code';
  if (u.hostname === 'platform.claude.com' || u.hostname === 'docs.claude.com') return u.pathname.includes('/agent-sdk') ? 'Claude Agent SDK' : 'Claude API';
  if (u.hostname === 'modelcontextprotocol.io') return 'Model Context Protocol';
  if (u.hostname.endsWith('anthropic.com')) return 'Anthropic guidance';
  return u.hostname;
}
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Problems with the register file itself. */
export function checkRegister(register: Register, exam: string): string[] {
  const p: string[] = [];
  if (register?.format !== VOLATILITY_FORMAT) p.push(`register: format is "${VOLATILITY_FORMAT}"`);
  if (register?.exam !== exam) p.push(`register: exam is ${exam}`);
  const seen = new Set<string>();
  for (const e of register?.entries ?? []) {
    if (seen.has(e.id)) p.push(`register ${e.id}: listed twice`);
    seen.add(e.id);
    if (!['ai-checked', 'human-verified', 'pending-verification'].includes(e.technical?.status)) p.push(`register ${e.id}: technical status is ai-checked, human-verified or pending-verification`);
    if (!isDate(e.technical?.at ?? '')) p.push(`register ${e.id}: technical.at is a date`);
    if (e.technical?.status === 'human-verified' && (!e.technical.by || e.technical.by === 'ai')) p.push(`register ${e.id}: a human verification names the human`);
    if (e.technical?.status === 'ai-checked' && e.technical.by !== 'ai') p.push(`register ${e.id}: an AI check is by "ai"`);
    if (!['available', 'unavailable', 'not-checked'].includes(e.sources?.status)) p.push(`register ${e.id}: sources status is available, unavailable or not-checked`);
  }
  return p;
}

/**
 * Where every volatile question of `exam` stands on `today`. `availability` holds the result of a live check of the
 * reference URLs (absent: not checked now; the register's last check is shown instead).
 */
export function volatilityReport(questions: Question[], examOf: ExamOf, exam: string, register: Register | undefined, today: string,
  options: { dueSoonDays?: number; availability?: Map<string, boolean> } = {}): VolatilityReport {
  const dueSoonDays = options.dueSoonDays ?? 30;
  const mine = questions.filter(q => examOf(q) === exam && !q.retired && q.tags.includes('meta.volatile'));
  const entries = new Map((register?.entries ?? []).map(e => [e.id, e]));
  const rows: VolatileRow[] = mine.map(q => {
    const rev = currentRevisionOf(q)!, hash = revisionHash(rev), e = entries.get(q.id), flags: Flag[] = [];
    const sources = (q.references ?? []).map(r => r.url), official = sources.filter(u => !EXAM_GUIDE.test(u));
    const daysLeft = q.reviewBy && isDate(q.reviewBy) ? days(today, q.reviewBy) : undefined;
    if (daysLeft === undefined) flags.push('missing-review-date');
    else if (daysLeft < 0) flags.push('overdue');
    else if (daysLeft <= dueSoonDays) flags.push('due-soon');
    if (!sources.length) flags.push('missing-source');
    else if (!official.length) flags.push('exam-guide-only');
    let availability: VolatileRow['availability'] = e?.sources.status ?? 'not-checked';
    if (options.availability) availability = sources.length && sources.every(u => options.availability!.get(u)) ? 'available' : sources.length ? 'unavailable' : 'not-checked';
    if (availability === 'unavailable') flags.push('source-unavailable');
    if (register && !e) flags.push('unregistered');
    if (e && (e.revision !== rev.revision || e.hash !== hash)) flags.push('revision-changed');
    // The claim needs verifying again when the verified content is not the content now, or its review date has passed.
    const technical: Technical = !e || flags.includes('revision-changed') || flags.includes('overdue') ? 'pending-verification' : e.technical.status;
    return {
      id: q.id, revision: rev.revision, hash, status: q.review.status, products: [...new Set(sources.map(productOf))], sources,
      checkedAt: q.volatility?.checkedAt, reviewBy: q.reviewBy, daysLeft, reason: q.volatility?.reason,
      technical, technicalBy: e?.technical.by, technicalAt: e?.technical.at, availability, flags,
    };
  });
  const ids = new Set(mine.map(q => q.id));
  const stale = [...entries.keys()].filter(id => !ids.has(id));
  const counts = Object.fromEntries(FLAGS.map(f => [f, rows.filter(r => r.flags.includes(f)).length])) as VolatilityReport['counts'];
  counts.questions = rows.length; counts.pending = rows.filter(r => r.technical === 'pending-verification').length;
  return { exam, today, dueSoonDays, rows, counts, stale, problems: register ? checkRegister(register, exam) : [] };
}

/**
 * What stops a release: a register that does not match the bank (an unregistered question, a verification of other
 * content, an entry for a question that is gone), a volatile question without a review date, and a published one past
 * it. Due-soon, Exam-Guide-only and in-review questions past their date are reported, not failed.
 */
export function volatilityFailures(r: VolatilityReport): string[] {
  return [
    ...r.problems,
    ...r.rows.filter(x => x.flags.includes('unregistered')).map(x => `${x.id}: volatile but not in the ${r.exam} volatility register`),
    ...r.rows.filter(x => x.flags.includes('revision-changed')).map(x => `${x.id}: the register verified other content than r${x.revision} ${x.hash}: verify it again (pending)`),
    ...r.rows.filter(x => x.flags.includes('missing-review-date')).map(x => `${x.id}: volatile without a review date`),
    ...r.rows.filter(x => x.flags.includes('overdue') && x.status === 'published').map(x => `${x.id}: published, review date ${x.reviewBy} has passed`),
    ...r.stale.map(id => `${id}: in the ${r.exam} volatility register but not a volatile question of the bank`),
  ];
}
