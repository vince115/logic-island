import { createHash } from 'node:crypto';
import { canonical } from './integrity';
import type { Ledger, LedgerPublication, LedgerReview, LedgerRevocation } from './lifecycle';

/*
 * Shared Trial System T.3G: ledger event ordering (docs/exam-system/31 §2–3).
 *
 * Until T.3F a ledger record carried a date and nothing else that placed it in time, so two events on the same day —
 * an approval and a withdrawal — could not be told apart, and an approval given just before a withdrawal could pass
 * for one given after it. From T.3G every record the CLIs append carries:
 *
 *   - `seq`: its place in one sequence shared by reviews, publications and withdrawals (1, 2, 3, … without gaps), and
 *   - `eventId`: `<kind>-<seq>-<16 hex of SHA-256 over the record>`, so an edited or forged record no longer matches.
 *
 * A publication names the approval it rests on (`approval`, an event id; one approval authorizes one publication) and a
 * withdrawal names the publication it withdraws (`withdraws`). Records written before T.3G have neither: they keep
 * their meaning, nothing rewrites them, and nothing invents an order for them. Between two records that are not both
 * sequenced only the dates speak, and the same date is unknown order: wherever the order decides an authorization (a
 * republication, a withdrawal), unknown is refused. Which exam a record belongs to is checked where the bank's exams
 * are known (checkLedger with an exam resolver, as every CLI and the preflight call it). Node-only (node:crypto).
 */
export type EventKind = 'review' | 'publication' | 'revocation';
export type LedgerEvent = LedgerReview | LedgerPublication | LedgerRevocation;
export interface Placed { kind: EventKind; list: 'reviews' | 'publications' | 'revocations'; index: number; event: LedgerEvent }
/** What `withdraws` names when the withdrawn publication is the recorded hash of a question published before T.2C. */
export const RECORDED_HASH = 'recorded-hash';
/** What `withdraws` names when the withdrawn publication is a record written before T.3G (it has no event id). */
export const UNSEQUENCED = 'unsequenced-publication';

const LISTS = [['reviews', 'review'], ['publications', 'publication'], ['revocations', 'revocation']] as const;
/** Every record of the ledger with its kind and place in its list, in list order (reviews, publications, withdrawals). */
export function placed(ledger: Ledger): Placed[] {
  return LISTS.flatMap(([list, kind]) => ((ledger[list] ?? []) as LedgerEvent[]).map((event, index) => ({ kind, list, index, event })));
}

export const isSequenced = (e: LedgerEvent) => e.seq !== undefined;
/** The digest that an event id carries: the whole record but its id, keys sorted. */
export const eventDigest = (kind: EventKind, e: LedgerEvent) => {
  const rest: Record<string, unknown> = { ...e, kind };
  delete rest.eventId;
  return createHash('sha256').update(canonical(rest)).digest('hex').slice(0, 16);
};
export const eventIdOf = (kind: EventKind, e: LedgerEvent) => `${kind}-${e.seq}-${eventDigest(kind, e)}`;
/** The next sequence number: one after the highest in the ledger. */
export const nextSeq = (ledger: Ledger) => Math.max(0, ...placed(ledger).map(p => p.event.seq ?? 0)) + 1;
/** A new record with its sequence number and event id. */
export function stamp<T extends LedgerEvent>(kind: EventKind, e: T, seq: number): T {
  const sequenced = { ...e, seq };
  delete sequenced.eventId;
  return { ...sequenced, eventId: eventIdOf(kind, sequenced) };
}

/**
 * Whether `a` happened before `b`: by sequence number when both have one; otherwise by date, where the same date is
 * unknown (`strict`) or, for the one rule that has always read it so (an approval on the day of its publication,
 * written before T.3G), before.
 */
export function precedes(a: LedgerEvent, b: LedgerEvent, strict = true): boolean | 'unknown' {
  if (isSequenced(a) && isSequenced(b)) return a.seq! < b.seq!;
  if (a.at !== b.at) return a.at < b.at;
  return strict ? 'unknown' : true;
}

/** Problems with the sequence itself: ids, numbers, gaps, collisions, dates out of order, records written after it began. */
export function sequenceProblems(ledger: Ledger): string[] {
  const problems: string[] = [], all = placed(ledger);
  const at = (p: Placed) => `ledger ${p.list}[${p.index}] (${p.event.questionId} r${p.event.revision})`;
  const bySeq = new Map<number, Placed[]>(), byId = new Map<string, Placed[]>();
  for (const p of all) {
    const e = p.event;
    if (e.eventId !== undefined && e.seq === undefined) problems.push(`${at(p)}: an event id without a sequence number`);
    if (e.seq === undefined) continue;
    if (!Number.isInteger(e.seq) || e.seq < 1) { problems.push(`${at(p)}: seq is a whole number from 1`); continue; }
    bySeq.set(e.seq, [...bySeq.get(e.seq) ?? [], p]);
    if (e.eventId === undefined) problems.push(`${at(p)}: a sequenced record has an event id`);
    else {
      byId.set(e.eventId, [...byId.get(e.eventId) ?? [], p]);
      if (e.eventId !== eventIdOf(p.kind, e)) problems.push(`${at(p)}: event id ${e.eventId} does not match the record (edited or forged; expected ${eventIdOf(p.kind, e)})`);
    }
  }
  for (const [seq, ps] of bySeq) if (ps.length > 1) problems.push(`ledger: sequence ${seq} is used ${ps.length} times (${ps.map(at).join(', ')})`);
  for (const [id, ps] of byId) if (ps.length > 1) problems.push(`ledger: event id ${id} appears ${ps.length} times (a duplicated event)`);
  const seqs = [...bySeq.keys()].sort((a, b) => a - b);
  for (let n = 1, i = 0; i < seqs.length; n++) { if (seqs[i] === n) i++; else problems.push(`ledger: sequence ${n} is missing (a gap: a record removed or never written)`); }
  for (const [list] of LISTS) {
    const events = (ledger[list] ?? []) as LedgerEvent[];
    let last = 0;
    events.forEach((e, i) => {
      if (e.seq === undefined) { if (last) problems.push(`ledger ${list}[${i}] (${e.questionId} r${e.revision}): a record without a sequence number after sequenced ones (every new record is sequenced)`); return; }
      if (e.seq <= last) problems.push(`ledger ${list}[${i}] (${e.questionId} r${e.revision}): sequence ${e.seq} comes after ${last} in the list`);
      last = Math.max(last, e.seq);
    });
  }
  const ordered = all.filter(p => Number.isInteger(p.event.seq)).sort((a, b) => a.event.seq! - b.event.seq!);
  for (let i = 1; i < ordered.length; i++) {
    const [a, b] = [ordered[i - 1].event, ordered[i].event];
    if (b.at < a.at) problems.push(`ledger: sequence ${b.seq} (${b.at}) is dated before sequence ${a.seq} (${a.at})`);
  }
  return problems;
}

/**
 * The ledger at `head` keeps the ledger at `base` as it was and only appends to it: every earlier record unchanged and
 * in place, every reviewer kept, and every appended record sequenced after the base's.
 */
export function ledgerAppendOnlyFailures(base: Ledger, head: Ledger): string[] {
  const failures: string[] = [];
  if (head.format !== base.format) failures.push(`ledger: format changed from ${base.format} to ${head.format}`);
  for (const r of base.reviewers) if (canonical(head.reviewers.find(x => x.id === r.id)) !== canonical(r)) failures.push(`ledger reviewer ${r.id}: removed or changed`);
  const top = nextSeq(base) - 1;
  for (const [list] of LISTS) {
    const was = (base[list] ?? []) as LedgerEvent[], now = (head[list] ?? []) as LedgerEvent[];
    if (now.length < was.length) failures.push(`ledger ${list}: ${was.length - now.length} record(s) removed`);
    was.forEach((e, i) => { if (i < now.length && canonical(now[i]) !== canonical(e)) failures.push(`ledger ${list}[${i}] (${e.questionId} r${e.revision}): changed in place (the ledger is append-only)`); });
    now.slice(was.length).forEach((e, i) => {
      if (e.seq === undefined) failures.push(`ledger ${list}[${was.length + i}] (${e.questionId} r${e.revision}): appended without a sequence number`);
      else if (e.seq <= top) failures.push(`ledger ${list}[${was.length + i}] (${e.questionId} r${e.revision}): appended with sequence ${e.seq}, not after the base's ${top}`);
    });
  }
  return failures;
}
