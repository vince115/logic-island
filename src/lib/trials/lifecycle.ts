import { currentRevisionOf, isDate, revisionHash, type Publication, type Question, type Review, type ReviewCheck, type TrialBank } from '@/content/trials/schema';
import ledgerFile from '@/content/trials/ledger.json';
import { RECORDED_HASH, UNSEQUENCED, nextSeq, precedes, sequenceProblems, stamp, type LedgerEvent } from './ledger-order';

/*
 * Shared Trial System T.2C: review and publication lifecycle (docs/exam-system/19).
 *
 *   in-review ──(human approval bound to {question, revision, hash})──▶ approved ──(explicit publication)──▶ published
 *
 * The ledger (src/content/trials/ledger.json) is append-only: every human decision and every publication, each naming
 * the exact revision and content hash it was made on. A decision on revision 1 says nothing about revision 2, so an
 * edited question goes back to review. AI quality checks never enter the ledger: they are not approvals.
 *
 * Nothing here writes files; the CLIs (scripts/trials/review.ts, publish.ts) do, all files or none. The site never
 * imports this module or the ledger (tests/trials-lifecycle.test.ts checks that).
 *
 * T.3B: one ledger for every certification, each record naming the exam (certification) of its question. A decision
 * file may name its exam; a decision on a question of another exam is refused, so a CCAR-F question can never be
 * decided in an iPAS review (or the other way round).
 *
 * T.3F (docs/exam-system/30 §4–5): withdrawal. A published revision can be revoked by an append-only revocation record
 * naming its question, revision and hash; nothing is deleted. Per revision the events alternate — published (a recorded
 * hash from before T.2C, or a publication), revoked, published again, … — and the revision is live while publications
 * outnumber revocations. A revoked revision leaves every new paper at once (its status becomes `revoked`). Publishing it
 * again is a republication: it names itself (`republishes`), and needs a human approval given after the withdrawal,
 * so an approval given before the withdrawal never brings it back (T.3G: "after" by sequence; see below).
 *
 * T.3G (docs/exam-system/31 §2–4): ordering. Dates alone cannot order two events of one day, so every record appended
 * from T.3G carries a sequence number and an event id (src/lib/trials/ledger-order.ts); a publication names the approval
 * it rests on (one approval, one publication) and a withdrawal the publication it withdraws. An approval authorizes a
 * republication only if it comes after the withdrawal: by sequence, or by a strictly later date for records written
 * before T.3G. The same date without sequence numbers is unknown order, and unknown is refused.
 */
/** The exam (certification) a question belongs to, or undefined when its subjects span several or none. */
export type ExamOf = (q: Question) => string | undefined;
export function examResolver(bank: Pick<TrialBank, 'subjects' | 'editions'>): ExamOf {
  const editionExam = new Map(bank.editions.map(e => [e.id, e.examId]));
  const subjectExam = new Map(bank.subjects.map(s => [s.id, editionExam.get(s.editionId)]));
  return q => { const exams = new Set(q.appearances.map(a => subjectExam.get(a.subjectId))); return exams.size === 1 ? [...exams][0] : undefined; };
}
export const LEDGER_FORMAT = 'logic-island.trials-ledger/1';
export const DECISIONS_FORMAT = 'logic-island.trials-review/1';
/** A review session shows and decides 10–25 questions at a time; fewer is allowed for the last part of a batch. */
export const MAX_DECISIONS = 25;

export type Role = 'review' | 'publish';
export interface Reviewer { id: string; name: string; roles: Role[] }
export type Verdict = Review['verdict'];
/** T.3G: a record's place in the ledger's one sequence and its content-bound id (absent on records written before T.3G). */
export interface Sequenced { seq?: number; eventId?: string }
export interface LedgerReview extends Sequenced { exam?: string; questionId: string; revision: number; hash: string; by: string; at: string; verdict: Verdict; checks: ReviewCheck[]; note?: string }
export interface LedgerPublication extends Publication, Sequenced {
  exam?: string; questionId: string; /** T.3F: publishes a revoked revision again. */ republishes?: true;
  /** T.3G: the event id of the approval this publication rests on (each approval authorizes one publication). */
  approval?: string;
}
/** T.3F: the withdrawal of one published revision (append-only; the publication it withdraws stays in the ledger). */
export interface LedgerRevocation extends Sequenced {
  exam?: string; questionId: string; revision: number; hash: string; by: string; at: string; reason: string;
  /** T.3G: the event id of the publication withdrawn, or RECORDED_HASH / UNSEQUENCED for one without an id. */
  withdraws?: string;
}
/** `revocations` is absent from ledgers written before T.3F: read it as empty. */
export interface Ledger { format: typeof LEDGER_FORMAT; reviewers: Reviewer[]; reviews: LedgerReview[]; publications: LedgerPublication[]; revocations?: LedgerRevocation[] }

export const committedLedger = ledgerFile as Ledger;

const VERDICTS: Verdict[] = ['approve', 'changes', 'reject'];
const CHECKS: ReviewCheck[] = ['answer-verified', 'code-executed', 'source-checked', 'license-checked', 'wording', 'accessibility'];

/** What an approval must confirm before the question may be published (the same rules validateTrials applies). */
export function requiredChecks(q: Question): ReviewCheck[] {
  return [...q.review.generatedBy ? ['answer-verified' as const] : [], ...q.provenance.origin !== 'original' ? ['source-checked' as const] : []];
}

/** The ledger's review entries in the shape a question's review state records. */
export const asReview = (e: LedgerReview): Review => ({ by: e.by, reviewer: 'human', at: e.at, verdict: e.verdict, checks: e.checks, ...e.note ? { note: e.note } : {}, revision: e.revision, hash: e.hash });

/** One revision's publication history: its publications and revocations, oldest first, and whether it is live now. */
export interface Exposure {
  /** The hash is in published-hashes.json (published before T.2C, or recorded by a publication through the gate). */
  recorded: boolean;
  /** Published before T.2C: recorded with no first publication record of its own (the first event of its history). */
  legacy: boolean;
  publications: LedgerPublication[]; revocations: LedgerRevocation[]; live: boolean;
}
export function exposureOf(ledger: Ledger, questionId: string, revision: number, hash: string, recordedHash?: string): Exposure {
  const same = (e: { questionId: string; revision: number; hash: string }) => e.questionId === questionId && e.revision === revision && e.hash === hash;
  const recorded = recordedHash === hash, publications = ledger.publications.filter(same), revocations = (ledger.revocations ?? []).filter(same);
  // A publication through the gate also records its hash: then that publication, not the record, is the first event.
  const legacy = recorded && !(publications[0] && !publications[0].republishes);
  return { recorded, legacy, publications, revocations, live: (legacy ? 1 : 0) + publications.length > revocations.length };
}

export interface LifecycleState {
  /** The latest human decision on the current revision and hash, if any. */
  decision?: LedgerReview;
  /** That decision approves the current content and confirms every required check. */
  approved: boolean;
  /** The publication of the current revision, if one was made through the gate. */
  publication?: LedgerPublication;
  /** Why the question is not published, in Traditional Chinese, for the import report. */
  held: string[];
  /** T.3F: the withdrawal that took the current revision off the site, while it is not published again. */
  revoked?: LedgerRevocation;
}

/**
 * Where one question stands, from the ledger alone. `recordedHash` is the current revision's entry in
 * published-hashes.json: questions published before T.2C have one and no publication record (they stay published).
 */
export function lifecycleOf(q: Question, ledger: Ledger, recordedHash?: string): LifecycleState {
  const rev = currentRevisionOf(q)!, hash = revisionHash(rev);
  const decisions = ledger.reviews.filter(e => e.questionId === q.id && e.revision === rev.revision && e.hash === hash);
  const decision = decisions[decisions.length - 1];
  const missing = decision?.verdict === 'approve' ? requiredChecks(q).filter(c => !decision.checks.includes(c)) : [];
  const x = exposureOf(ledger, q.id, rev.revision, hash, recordedHash);
  const revoked = x.revocations[x.revocations.length - 1];
  // T.3F/T.3G: after a withdrawal only an approval that comes after it counts; a same-day pair without sequence numbers
  // cannot be ordered, so it does not count either.
  const after = revoked && decision ? precedes(revoked, decision) : undefined;
  const approved = decision?.verdict === 'approve' && !missing.length && (!revoked || after === true);
  const publication = x.live ? x.publications[x.publications.length - 1] : undefined;
  const held: string[] = [];
  // Published before T.2C and never withdrawn: its recorded hash vouches for it. Any other publication stands only on
  // an approval (a forged publication record never makes a question published).
  if (x.live && x.legacy && !revoked) return { decision, approved, publication, held };
  if (!x.live && revoked) {
    held.push(`第 ${rev.revision} 版已撤回（${revoked.at}：${revoked.reason}）`);
    if (approved) held.push('已重新核准，尚未重新發布（需以 --republish 明確重新發布）');
    else if (decision?.verdict === 'approve' && after === 'unknown') held.push(`核准與撤回同在 ${decision.at} 且沒有事件序號，無法確認先後，需重新人工核准`);
    return { decision, approved, held, revoked };
  }
  if (!decision) held.push(`第 ${rev.revision} 版（${hash}）尚無人工審核`);
  else if (decision.verdict === 'changes') held.push(`第 ${rev.revision} 版經人工審核要求修改`);
  else if (decision.verdict === 'reject') held.push(`第 ${rev.revision} 版經人工審核退回`);
  else if (missing.length) held.push(`核准未確認：${missing.join('、')}`);
  else if (!approved && after === 'unknown') held.push(`核准與撤回同在 ${decision.at} 且沒有事件序號，無法確認先後，需重新人工核准`);
  else if (!approved) held.push(`核准（${decision.at}）早於撤回（${revoked!.at}），需重新人工核准`);
  else if (!publication) held.push('已核准，尚未發布（發布需另外執行發布動作）');
  return { decision, approved, publication, held };
}

/** Every problem with the ledger against the bank; an empty list means its records can be trusted. */
export function checkLedger(ledger: Ledger, questions: Question[], examOf?: ExamOf, recorded?: Record<string, string>): string[] {
  const problems: string[] = [];
  if (ledger.format !== LEDGER_FORMAT) problems.push(`ledger: format is "${LEDGER_FORMAT}"`);
  const people = new Map(ledger.reviewers.map(r => [r.id, r]));
  const byId = new Map(questions.map(q => [q.id, q]));
  const entry = (kind: string, e: { exam?: string; questionId: string; revision: number; hash: string; by: string; at: string }, role: Role, i: number) => {
    const at = `ledger ${kind}[${i}] (${e.questionId} r${e.revision})`;
    const q = byId.get(e.questionId), rev = q?.revisions.find(r => r.revision === e.revision);
    // T.3B: with the bank's exams known, every record names its question's exam.
    if (q && examOf && e.exam !== examOf(q)) problems.push(`${at}: ${e.exam === undefined ? 'names no exam' : `names exam ${e.exam}`}, the question belongs to ${examOf(q) ?? 'no single exam'}`);
    if (!q) problems.push(`${at}: unknown question`);
    else if (!rev) problems.push(`${at}: the question has no revision ${e.revision}`);
    else if (revisionHash(rev) !== e.hash) problems.push(`${at}: hash ${e.hash} is not the content of revision ${e.revision} (${revisionHash(rev)})`);
    if (!people.get(e.by)?.roles.includes(role)) problems.push(`${at}: ${e.by} may not ${role}`);
    if (!isDate(e.at)) problems.push(`${at}: at is a date (YYYY-MM-DD)`);
  };
  ledger.reviews.forEach((e, i) => {
    entry('reviews', e, 'review', i);
    if (!VERDICTS.includes(e.verdict)) problems.push(`ledger reviews[${i}]: verdict is approve, changes or reject`);
    if (!Array.isArray(e.checks) || !e.checks.every(c => CHECKS.includes(c))) problems.push(`ledger reviews[${i}]: unknown check`);
  });
  const revocations = ledger.revocations ?? [];
  if (ledger.revocations !== undefined && !Array.isArray(ledger.revocations)) problems.push('ledger: revocations is a list');
  // T.3G: the sequence itself (ids, numbers, gaps, collisions, dates), then what each record names.
  problems.push(...sequenceProblems(ledger));
  const reviewById = new Map(ledger.reviews.filter(e => e.eventId).map(e => [e.eventId!, e]));
  const usedApproval = new Map<string, number>();
  const sameKey = (a: LedgerEvent, b: LedgerEvent) => a.questionId === b.questionId && a.revision === b.revision && a.hash === b.hash;
  /** The approval a publication rests on: the one it names (T.3G), else the latest decision on its content before it. */
  const approvalOf = (p: LedgerPublication) => p.approval !== undefined ? reviewById.get(p.approval)
    : ledger.reviews.filter(e => sameKey(e, p) && precedes(e, p, false) === true).pop();
  ledger.publications.forEach((p, i) => {
    entry('publications', p, 'publish', i);
    const k = `${p.questionId}@${p.revision}`, at = `ledger publications[${i}]`;
    // A publication stands only on an approval of the same content made before it, and still the latest decision then.
    const approval = approvalOf(p), q = byId.get(p.questionId);
    const latest = ledger.reviews.filter(e => sameKey(e, p) && precedes(e, p, false) === true).pop();
    if (p.seq !== undefined && p.approval === undefined) problems.push(`${at}: ${k} is sequenced but names no approval (approval: <event id>)`);
    if (p.approval !== undefined && !approval) problems.push(`${at}: ${k} names approval ${p.approval}, which is not in the ledger`);
    else if (p.approval !== undefined && approval) {
      if (!sameKey(approval, p)) problems.push(`${at}: ${k} names approval ${p.approval} of other content (${approval.questionId}@${approval.revision} ${approval.hash})`);
      if (approval.exam !== p.exam) problems.push(`${at}: ${k} names approval ${p.approval} of exam ${approval.exam ?? '(none)'}, not ${p.exam ?? '(none)'}`);
      if (precedes(approval, p) !== true) problems.push(`${at}: ${k} names approval ${p.approval}, which does not come before it`);
      else if (latest && latest !== approval) problems.push(`${at}: ${k} names approval ${p.approval}, but a later decision (${latest.eventId ?? latest.at}) replaced it`);
      usedApproval.set(p.approval, (usedApproval.get(p.approval) ?? 0) + 1);
    }
    if (!approval || approval.verdict !== 'approve' || (q && requiredChecks(q).some(c => !approval.checks.includes(c))))
      problems.push(`${at}: ${k} was published without a human approval of that revision and hash`);
  });
  for (const [id, n] of usedApproval) if (n > 1) problems.push(`ledger: approval ${id} authorizes ${n} publications (an approval is used once)`);
  revocations.forEach((r, i) => {
    entry('revocations', r, 'publish', i);
    if (typeof r.reason !== 'string' || !r.reason.trim()) problems.push(`ledger revocations[${i}]: a withdrawal says why (reason)`);
    if (r.seq !== undefined && r.withdraws === undefined) problems.push(`ledger revocations[${i}]: ${r.questionId}@${r.revision} is sequenced but names no publication it withdraws (withdraws)`);
  });
  // T.3F: per revision, publications and revocations alternate, starting from a recorded hash or a publication.
  // T.3G: each in order — by sequence, or by a strictly later date; the same date without sequence numbers is refused.
  const keys = new Set([...ledger.publications, ...revocations].map(e => `${e.questionId}@${e.revision}@${e.hash}`));
  for (const key of keys) {
    const [id, r, hash] = key.split('@'), k = `${id}@${r}`;
    const x = exposureOf(ledger, id, Number(r), hash, recorded?.[k]);
    const base = x.legacy ? 1 : 0, live = base + x.publications.length - x.revocations.length;
    if (live > 1) problems.push(`ledger: ${k} is published twice without a withdrawal between`);
    if (live < 0) problems.push(`ledger: ${k} is withdrawn more often than it was published`);
    x.revocations.forEach((v, j) => {
      const published = j - base < 0 ? undefined : x.publications[j - base];
      if (published) {
        const order = precedes(published, v);
        if (order === 'unknown') problems.push(`ledger: ${k} withdrawal ${j + 1} (${v.at}) cannot be ordered after the publication it withdraws (same date, no sequence numbers)`);
        else if (!order) problems.push(`ledger: ${k} withdrawal ${j + 1} (${v.at}) comes before the publication it withdraws (${published.at})`);
      }
      const expected = published ? published.eventId ?? UNSEQUENCED : j - base < 0 ? RECORDED_HASH : undefined;
      if (v.withdraws !== undefined && expected !== undefined && v.withdraws !== expected) problems.push(`ledger: ${k} withdrawal ${j + 1} names ${v.withdraws}, but withdraws ${expected}`);
    });
    x.publications.forEach((p, j) => {
      const before = x.revocations[j + base - 1];
      if (!before) { if (p.republishes) problems.push(`ledger: ${k} is marked as a republication but was never withdrawn`); return; }
      if (!p.republishes) problems.push(`ledger: ${k} is published again after its withdrawal without saying so (republishes)`);
      const order = precedes(before, p);
      if (order === 'unknown') problems.push(`ledger: ${k} is published again on the day of its withdrawal (${p.at}) with no sequence numbers to order them`);
      else if (!order) problems.push(`ledger: ${k} is published again (${p.at}) before its withdrawal (${before.at})`);
      const approval = approvalOf(p);
      if (!approval || approval.verdict !== 'approve' || precedes(before, approval) !== true)
        problems.push(`ledger: ${k} is published again without a human approval that comes after its withdrawal (${before.at}${before.seq ? `, sequence ${before.seq}` : ''})`);
    });
  }
  return problems;
}

// ---- review decisions --------------------------------------------------------------------------------------------
export interface Decision { questionId: string; revision: number; hash: string; verdict: Verdict; checks: ReviewCheck[]; note?: string }
/** T.3B: `exam` names the certification the file decides on; every decision must be on a question of it. */
export interface DecisionFile { format: typeof DECISIONS_FORMAT; exam?: string; by: string; at: string; decisions: Decision[] }
export interface LedgerPlan { ok: boolean; errors: string[]; ledger?: Ledger; added: number }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Records a reviewer's decisions on a batch of questions: all of them or none. Each decision names the revision and
 * hash the reviewer saw; a question edited since then (a new revision, or the same revision with other content) is
 * rejected as stale. `confirm` must equal the number of decisions — the explicit confirmation step.
 */
export function planDecisions(raw: unknown, questions: Question[], ledger: Ledger, confirm?: number, examOf?: ExamOf): LedgerPlan {
  const errors: string[] = [];
  if (!isObject(raw) || raw.format !== DECISIONS_FORMAT || typeof raw.by !== 'string' || typeof raw.at !== 'string' || !Array.isArray(raw.decisions))
    return { ok: false, errors: [`a decision file is {format: "${DECISIONS_FORMAT}", by, at, decisions: [...]}`], added: 0 };
  const file = raw as unknown as DecisionFile;
  const reviewer = ledger.reviewers.find(r => r.id === file.by);
  if (!reviewer?.roles.includes('review')) errors.push(`${file.by} is not a reviewer in the ledger`);
  if (!isDate(file.at)) errors.push('at is a date (YYYY-MM-DD)');
  if (!file.decisions.length) errors.push('there is no decision');
  if (file.decisions.length > MAX_DECISIONS) errors.push(`${file.decisions.length} decisions: at most ${MAX_DECISIONS} at a time`);
  if (confirm !== file.decisions.length) errors.push(`not confirmed: confirm the ${file.decisions.length} decisions explicitly (--confirm ${file.decisions.length})`);
  const byId = new Map(questions.map(q => [q.id, q])), ids = new Set<string>();
  file.decisions.forEach((d, i) => {
    const at = `decisions[${i}] (${isObject(d) ? String(d.questionId) : '?'})`;
    if (!isObject(d)) return errors.push(`${at}: is a decision`);
    const q = byId.get(d.questionId);
    if (!q) return errors.push(`${at}: unknown question`);
    if (ids.has(q.id)) errors.push(`${at}: decided twice in the same file`);
    if (file.exam !== undefined && (!examOf || examOf(q) !== file.exam)) errors.push(`${at}: belongs to exam ${examOf?.(q) ?? '(unknown)'}, not the file's exam ${file.exam}`);
    ids.add(q.id);
    const rev = currentRevisionOf(q)!;
    if (d.revision !== rev.revision) errors.push(`${at}: decides revision ${d.revision}, but the current revision is ${rev.revision} (stale: review the current one)`);
    else if (d.hash !== revisionHash(rev)) errors.push(`${at}: hash ${d.hash} is not the current content (${revisionHash(rev)}): stale`);
    if (!VERDICTS.includes(d.verdict)) errors.push(`${at}: verdict is approve, changes or reject`);
    if (!Array.isArray(d.checks) || !d.checks.every(c => CHECKS.includes(c))) errors.push(`${at}: unknown check`);
    else if (d.verdict === 'approve') {
      const missing = requiredChecks(q).filter(c => !d.checks.includes(c));
      if (missing.length) errors.push(`${at}: an approval confirms ${missing.join(', ')}`);
    }
    if (d.verdict !== 'approve' && !d.note?.trim()) errors.push(`${at}: a ${d.verdict} decision says why (note)`);
    // T.3G: an approval that is already in force is a duplicate, never a second authorization.
    if (d.verdict === 'approve' && d.revision === rev.revision && d.hash === revisionHash(rev)) {
      const state = lifecycleOf(q, ledger);
      if (state.approved) errors.push(`${at}: revision ${rev.revision} is already approved (${state.decision!.eventId ?? state.decision!.at}): a duplicate approval is not recorded`);
    }
  });
  if (errors.length) return { ok: false, errors, added: 0 };
  const examOfId = (id: string) => { const q = byId.get(id); return q && examOf?.(q); };
  const seq = nextSeq(ledger);
  const added: LedgerReview[] = file.decisions.map((d, i) => stamp('review', { ...examOfId(d.questionId) ? { exam: examOfId(d.questionId) } : {}, questionId: d.questionId, revision: d.revision, hash: d.hash, by: file.by, at: file.at, verdict: d.verdict, checks: d.checks, ...d.note ? { note: d.note } : {} }, seq + i));
  return { ok: true, errors, ledger: { ...ledger, reviews: [...ledger.reviews, ...added] }, added: added.length };
}

// ---- publication -------------------------------------------------------------------------------------------------
/**
 * The publication gate: publishes the named revisions (`id@revision`), all of them or none. Each must be the current
 * revision, its content hash recomputed now must equal the one the human approved, and the latest human decision on it
 * must be an approval with the required checks. `confirm` must equal the number of targets.
 */
export function planPublication(targets: string[], questions: Question[], ledger: Ledger, by: string, at: string, confirm?: number, recorded: Record<string, string> = {}, examOf?: ExamOf, options: { republish?: boolean; exam?: string } = {}): LedgerPlan {
  const errors: string[] = [];
  if (!ledger.reviewers.find(r => r.id === by)?.roles.includes('publish')) errors.push(`${by} may not publish`);
  if (!isDate(at)) errors.push('at is a date (YYYY-MM-DD)');
  if (!targets.length) errors.push('nothing to publish');
  if (confirm !== targets.length) errors.push(`not confirmed: confirm the ${targets.length} publications explicitly (--confirm ${targets.length})`);
  const byId = new Map(questions.map(q => [q.id, q])), added: LedgerPublication[] = [];
  for (const t of new Set(targets)) {
    const m = /^(.+)@(\d+)$/.exec(t);
    if (!m) { errors.push(`${t}: name a revision as <question id>@<revision>`); continue; }
    const q = byId.get(m[1]), revision = Number(m[2]);
    if (!q) { errors.push(`${t}: unknown question`); continue; }
    const rev = currentRevisionOf(q)!, hash = revisionHash(rev);
    if (revision !== rev.revision) { errors.push(`${t}: only the current revision (${rev.revision}) can be published`); continue; }
    if (options.exam !== undefined && examOf?.(q) !== options.exam) { errors.push(`${t}: belongs to exam ${examOf?.(q) ?? '(unknown)'}, not ${options.exam}`); continue; }
    const x = exposureOf(ledger, q.id, revision, hash, recorded[t]);
    if (x.live) { errors.push(`${t}: already published`); continue; }
    // T.3F: a withdrawn revision comes back only through an explicit republication on a new approval.
    const withdrawn = x.revocations[x.revocations.length - 1];
    if (withdrawn && !options.republish) { errors.push(`${t}: was withdrawn on ${withdrawn.at}; publishing it again needs --republish and a human approval that comes after the withdrawal`); continue; }
    if (!withdrawn && options.republish) { errors.push(`${t}: was never withdrawn, so it cannot be republished`); continue; }
    if (withdrawn && at < withdrawn.at) { errors.push(`${t}: cannot be published again before its withdrawal (${withdrawn.at})`); continue; }
    const state = lifecycleOf(q, ledger, recorded[t]);
    if (!state.approved) { errors.push(`${t}: not approved (${state.held.join('；') || '尚無人工核准'})`); continue; }
    if (state.decision!.hash !== hash) { errors.push(`${t}: the approved hash ${state.decision!.hash} is not the content now (${hash})`); continue; }
    if (state.decision!.at > at) { errors.push(`${t}: the approval (${state.decision!.at}) is dated after the publication (${at})`); continue; }
    // T.3G: the publication names its approval; an approval written before event ids, or one already used, authorizes nothing new.
    const approval = state.decision!.eventId;
    if (!approval) { errors.push(`${t}: the approval (${state.decision!.at}) was recorded before ledger event ordering (no event id): a new human approval is needed`); continue; }
    if (ledger.publications.some(p => p.approval === approval)) { errors.push(`${t}: approval ${approval} has already authorized a publication; it cannot be used again`); continue; }
    added.push({ ...examOf?.(q) ? { exam: examOf(q) } : {}, questionId: q.id, revision, hash, by, at, ...withdrawn ? { republishes: true as const } : {}, approval });
  }
  if (errors.length) return { ok: false, errors, added: 0 };
  const seq = nextSeq(ledger);
  return { ok: true, errors, ledger: { ...ledger, publications: [...ledger.publications, ...added.map((p, i) => stamp('publication', p, seq + i))] }, added: added.length };
}

// ---- withdrawal (T.3F) -----------------------------------------------------------------------------------------
/**
 * The withdrawal gate: revokes the named published revisions (`id@revision`), all of them or none. Each must be the
 * current revision and live (published, not already withdrawn); `by` may publish; a reason is required; `confirm`
 * must equal the number of targets. Nothing is deleted: the publication stays in the ledger and a revocation is
 * appended. With `exam`, every target must be a question of that exam.
 */
export function planRevocation(targets: string[], questions: Question[], ledger: Ledger, by: string, at: string, reason: string, confirm?: number, recorded: Record<string, string> = {}, examOf?: ExamOf, exam?: string): LedgerPlan {
  const errors: string[] = [];
  if (!ledger.reviewers.find(r => r.id === by)?.roles.includes('publish')) errors.push(`${by} may not withdraw a publication`);
  if (!isDate(at)) errors.push('at is a date (YYYY-MM-DD)');
  if (!reason?.trim()) errors.push('a withdrawal says why (--reason)');
  if (!targets.length) errors.push('nothing to withdraw');
  if (new Set(targets).size !== targets.length) errors.push('a revision is named twice');
  if (confirm !== targets.length) errors.push(`not confirmed: confirm the ${targets.length} withdrawals explicitly (--confirm ${targets.length})`);
  const byId = new Map(questions.map(q => [q.id, q])), added: LedgerRevocation[] = [];
  for (const t of new Set(targets)) {
    const m = /^(.+)@(\d+)$/.exec(t);
    if (!m) { errors.push(`${t}: name a revision as <question id>@<revision>`); continue; }
    const q = byId.get(m[1]), revision = Number(m[2]);
    if (!q) { errors.push(`${t}: unknown question`); continue; }
    if (exam !== undefined && examOf?.(q) !== exam) { errors.push(`${t}: belongs to exam ${examOf?.(q) ?? '(unknown)'}, not ${exam}`); continue; }
    const rev = currentRevisionOf(q)!, hash = revisionHash(rev);
    if (revision !== rev.revision) { errors.push(`${t}: only the current revision (${rev.revision}) is on the site`); continue; }
    const x = exposureOf(ledger, q.id, revision, hash, recorded[t]);
    if (!x.live) { errors.push(x.revocations.length ? `${t}: already withdrawn` : `${t}: not published`); continue; }
    const last = x.publications[x.publications.length - 1];
    if (last && at < last.at) { errors.push(`${t}: cannot be withdrawn (${at}) before it was published (${last.at})`); continue; }
    // T.3G: the withdrawal names the publication it withdraws (the recorded hash for one published before T.2C).
    const withdraws = last ? last.eventId ?? UNSEQUENCED : RECORDED_HASH;
    added.push({ ...examOf?.(q) ? { exam: examOf(q) } : {}, questionId: q.id, revision, hash, by, at, reason: reason.trim(), withdraws });
  }
  if (errors.length) return { ok: false, errors, added: 0 };
  const seq = nextSeq(ledger);
  return { ok: true, errors, ledger: { ...ledger, revocations: [...ledger.revocations ?? [], ...added.map((r, i) => stamp('revocation', r, seq + i))] }, added: added.length };
}
