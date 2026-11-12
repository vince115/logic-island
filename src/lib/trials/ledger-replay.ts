import type { Question } from '@/content/trials/schema';
import { currentRevisionOf, revisionHash } from '@/content/trials/schema';
import { isSequenced, placed, type Placed } from './ledger-order';
import { exposureOf, lifecycleOf, requiredChecks, type ExamOf, type Ledger, type LedgerReview } from './lifecycle';

/*
 * Shared Trial System T.3G: ledger replay (docs/exam-system/31 §9). An independent second reading of the ledger: the
 * events are folded one by one, in their order, through the state machine of each revision —
 *
 *   approval ──▶ authorized ──(publication, consumes it)──▶ live ──(withdrawal, voids any approval)──▶ withdrawn ──▶ …
 *
 * — and an event the state does not allow (a publication with no approval in force, a second publication, a withdrawal
 * of what is not live, a record of another exam) is reported and left out, so a duplicate or forged event never moves
 * the state. The result must agree with what lifecycleOf and exposureOf say; any difference is a corrupted ledger.
 * Pure and read-only: it never writes or repairs the ledger.
 *
 * Order: sequenced records by sequence number. Records written before T.3G have only dates: they come first, by date;
 * on one date reviews before publications before withdrawals (the order the gates enforced when they were written),
 * and a date on which a revision has a withdrawal and another kind of record is reported as unknown order.
 */
export interface ReplayState {
  key: string; live: boolean;
  /** An approval in force and not yet used by a publication. */
  pending?: LedgerReview;
  withdrawals: number; publications: number; ordering: 'sequenced' | 'dated' | 'mixed';
}
export interface Replay { states: Map<string, ReplayState>; violations: string[]; events: number; sequenced: number }

const RANK = { review: 0, publication: 1, revocation: 2 } as const;
const label = (p: Placed) => `${p.kind} ${p.event.eventId ?? `${p.list}[${p.index}]`} (${p.event.questionId}@${p.event.revision})`;

/** The ledger's events in replay order. */
export function replayOrder(ledger: Ledger): Placed[] {
  const all = placed(ledger);
  const dated = all.filter(p => !isSequenced(p.event)).sort((a, b) => a.event.at.localeCompare(b.event.at) || RANK[a.kind] - RANK[b.kind] || a.index - b.index);
  return [...dated, ...all.filter(p => isSequenced(p.event)).sort((a, b) => a.event.seq! - b.event.seq!)];
}

export function replayLedger(ledger: Ledger, questions: Question[], recorded: Record<string, string> = {}, examOf?: ExamOf): Replay {
  const byId = new Map(questions.map(q => [q.id, q])), states = new Map<string, ReplayState>(), violations: string[] = [];
  const order = replayOrder(ledger);
  const state = (p: Placed) => {
    const e = p.event, key = `${e.questionId}@${e.revision}@${e.hash}`;
    if (!states.has(key)) {
      const x = exposureOf({ ...ledger, publications: [], revocations: [] }, e.questionId, e.revision, e.hash, recorded[`${e.questionId}@${e.revision}`]);
      // Published before T.2C: live from the start, unless the gate itself made its first publication.
      const first = ledger.publications.find(f => f.questionId === e.questionId && f.revision === e.revision && f.hash === e.hash);
      states.set(key, { key, live: x.recorded && !(first && !first.republishes), withdrawals: 0, publications: 0, ordering: isSequenced(e) ? 'sequenced' : 'dated' });
    }
    const s = states.get(key)!;
    if ((s.ordering === 'sequenced') !== isSequenced(e)) s.ordering = 'mixed';
    return s;
  };
  // Unknown order: one revision, one date, a withdrawal and another kind of record, none of them sequenced.
  const sameDay = new Map<string, Set<string>>();
  for (const p of order) if (!isSequenced(p.event)) {
    const k = `${p.event.questionId}@${p.event.revision}@${p.event.hash}@${p.event.at}`;
    sameDay.set(k, new Set([...sameDay.get(k) ?? [], p.kind]));
  }
  for (const [k, kinds] of sameDay) if (kinds.has('revocation') && kinds.size > 1) violations.push(`${k.split('@').slice(0, 2).join('@')}: a withdrawal and another record on ${k.split('@')[3]} with no sequence numbers: unknown order`);

  for (const p of order) {
    const e = p.event, s = state(p), q = byId.get(e.questionId);
    if (q && examOf && e.exam !== undefined && e.exam !== examOf(q)) { violations.push(`${label(p)}: names exam ${e.exam}, the question belongs to ${examOf(q)}: ignored`); continue; }
    if (p.kind === 'review') {
      const r = e as LedgerReview;
      s.pending = r.verdict === 'approve' && (!q || requiredChecks(q).every(c => r.checks.includes(c))) ? r : undefined;
    } else if (p.kind === 'publication') {
      const pub = e as Ledger['publications'][number];
      if (s.live) { violations.push(`${label(p)}: already live: ignored`); continue; }
      if (!s.pending) { violations.push(`${label(p)}: no approval in force${s.withdrawals ? ' since the withdrawal' : ''}: ignored`); continue; }
      if (pub.approval !== undefined && pub.approval !== s.pending.eventId) { violations.push(`${label(p)}: names approval ${pub.approval}, but the approval in force is ${s.pending.eventId ?? s.pending.at}: ignored`); continue; }
      if (!!pub.republishes !== s.withdrawals > 0) { violations.push(`${label(p)}: ${pub.republishes ? 'a republication of what was never withdrawn' : 'a republication that does not say so'}: ignored`); continue; }
      s.live = true; s.pending = undefined; s.publications++;
    } else {
      if (!s.live) { violations.push(`${label(p)}: not live: ignored`); continue; }
      s.live = false; s.pending = undefined; s.withdrawals++;
    }
  }
  return { states, violations, events: order.length, sequenced: order.filter(p => isSequenced(p.event)).length };
}

/**
 * Where the replay and the lifecycle disagree: whether each revision with ledger records is live, and whether the
 * current revision of each question is approved and waiting for a publication.
 */
export function replayMismatches(ledger: Ledger, questions: Question[], replay: Replay, recorded: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (const s of replay.states.values()) {
    const [id, r, hash] = s.key.split('@');
    const x = exposureOf(ledger, id, Number(r), hash, recorded[`${id}@${r}`]);
    if (x.live !== s.live) out.push(`${id}@${r}: the replay finds it ${s.live ? 'live' : 'not live'}, the lifecycle ${x.live ? 'live' : 'not live'}`);
  }
  for (const q of questions) {
    const rev = currentRevisionOf(q)!, key = `${q.id}@${rev.revision}@${revisionHash(rev)}`, s = replay.states.get(key);
    if (!s) continue;
    const state = lifecycleOf(q, ledger, recorded[`${q.id}@${rev.revision}`]);
    const waiting = state.approved && !s.live && !state.publication, replayed = !!s.pending && !s.live;
    if (waiting !== replayed) out.push(`${q.id}@${rev.revision}: the replay finds ${replayed ? 'an approval waiting' : 'no approval waiting'}, the lifecycle ${waiting ? 'an approval waiting' : 'none'}`);
  }
  return out;
}
