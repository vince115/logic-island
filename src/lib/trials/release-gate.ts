import { currentRevisionOf, revisionHash, type Question } from '@/content/trials/schema';
import { lifecycleOf, type Ledger } from './lifecycle';

/*
 * Shared Trial System T.3I: the release authorization gate (docs/exam-system/33 §10;
 * docs/exam-system/governance/RELEASE_AUTHORIZATION_CHECKLIST.md). Pure: it reads the evidence it is given and decides
 * nothing else. It never approves, publishes or writes.
 *
 * Each gate needs one kind of evidence, and only that kind satisfies it:
 *   engineering  checked by the code here, on this machine (engineering-verified);
 *   human        recorded by an authorized person (human-verified): the ledger's human approvals, a compliance record,
 *                an explicit release authorization;
 *   remote       observed on GitHub (remote-verified): a CI run on the release commit, branch protection.
 * Engineering-verified never stands in for human or remote. A gate without its evidence is not-verified; one whose
 * evidence contradicts the release (a stale or refused decision, an unapproved priority-1 question) is blocked.
 * `releasable` is true only when every gate is verified by its own kind — and never on synthetic evidence: a drill
 * with SYNTHETIC fixtures can show `wouldRelease`, never `releasable`.
 */
export type GateKind = 'engineering' | 'human' | 'remote';
export type GateStatus = 'engineering-verified' | 'human-verified' | 'remote-verified' | 'not-verified' | 'blocked';
export interface GateResult { id: string; title: string; kind: GateKind; status: GateStatus; details: string[] }
export interface ReleaseEvidence {
  /** id@revision of every question the release would publish. */
  targets: string[];
  questions: Question[];
  ledger: Ledger;
  /** The commit to be released. */
  head: string;
  /** Local results by preflight check id ('pass' or not); absent means not run. */
  checks: Partial<Record<'ledger' | 'ledger-replay' | 'assessment-integrity' | 'paper-versions' | 'exposure-data' | 'bundle-leak' | 'routes' | 'probe', string>>;
  /** Question ids of priority 1 in the review queues. */
  priority1: string[];
  /** A revocation and republication drill run on SYNTHETIC fixtures (tests/trials-release-gate.test.ts). */
  rollbackDrill?: { passed: boolean; at: string };
  remote?: { ciRun?: { url: string; sha: string; conclusion: string }; protection?: { branch: string; requiredCheck: string; enforced: boolean } };
  compliance?: { by: string; at: string; scope: string };
  authorization?: { by: string; at: string; targets: string[]; head: string };
}

const SYNTHETIC = /synthetic|fixture|\bai\b|claude|bot/i;
const isSynthetic = (who: string | undefined) => !who || SYNTHETIC.test(who);
const KIND_STATUS: Record<GateKind, GateStatus> = { engineering: 'engineering-verified', human: 'human-verified', remote: 'remote-verified' };

export function releaseGate(e: ReleaseEvidence): { gates: GateResult[]; wouldRelease: boolean; synthetic: boolean; releasable: boolean } {
  const gates: GateResult[] = [], synthetic: string[] = [];
  const gate = (id: string, title: string, kind: GateKind, status: 'ok' | 'not-verified' | 'blocked', details: string[]) =>
    gates.push({ id, title, kind, status: status === 'ok' ? KIND_STATUS[kind] : status, details });
  const byId = new Map(e.questions.map(q => [q.id, q]));
  const targets = e.targets.map(t => { const [id, rev] = t.split('@'); const q = byId.get(id); return { t, id, rev: Number(rev), q, current: q && currentRevisionOf(q) }; });
  const reviewer = (id: string) => e.ledger.reviewers.find(r => r.id === id);

  // Remote: only what GitHub reports about this exact commit.
  const run = e.remote?.ciRun;
  gate('remote-ci', 'Remote CI passed on the release commit', 'remote', run && run.conclusion === 'success' && run.sha === e.head ? 'ok' : 'not-verified',
    [run ? `${run.url}: ${run.conclusion} on ${run.sha}${run.sha !== e.head ? ` (not the release commit ${e.head})` : ''}` : 'no remote CI run recorded (a local run is not a remote run)']);
  const prot = e.remote?.protection;
  gate('protected-branch', 'Protected branch configured', 'remote', prot?.enforced && prot.requiredCheck === 'gates' ? 'ok' : 'not-verified',
    [prot ? `${prot.branch}: ${prot.enforced ? 'enforced' : 'not enforced'}, required check ${prot.requiredCheck}` : 'not observed on GitHub']);

  // Human: the ledger's decisions on the exact current content, by a reviewer who is a person.
  const review = targets.map(x => {
    if (!x.q || !x.current) return { x, state: 'blocked' as const, why: `${x.t}: no such question` };
    if (x.current.revision !== x.rev) return { x, state: 'blocked' as const, why: `${x.t}: the current revision is ${x.current.revision}` };
    const s = lifecycleOf(x.q, e.ledger);
    if (s.decision && s.decision.verdict !== 'approve') return { x, state: 'blocked' as const, why: `${x.t}: the latest decision is ${s.decision.verdict}` };
    if (!s.approved || !s.decision) return { x, state: 'not-verified' as const, why: `${x.t}: no human approval of the current content` };
    if (isSynthetic(s.decision.by) || isSynthetic(reviewer(s.decision.by)?.name)) synthetic.push(`approval of ${x.t} by ${s.decision.by}`);
    return { x, state: 'ok' as const, why: `${x.t}: approved by ${s.decision.by} on ${s.decision.at} (${s.decision.hash})` };
  });
  const worst = (r: { state: string }[]) => r.some(v => v.state === 'blocked') ? 'blocked' : r.some(v => v.state !== 'ok') || !r.length ? 'not-verified' : 'ok';
  gate('human-review', 'Human review completed', 'human', worst(review), review.length ? review.map(v => v.why) : ['no target named']);
  const c = e.compliance;
  if (c && isSynthetic(c.by)) synthetic.push(`compliance record by ${c.by}`);
  gate('compliance', 'Compliance review completed', 'human', c?.by && c.at && c.scope ? 'ok' : 'not-verified', [c ? `${c.by} on ${c.at}: ${c.scope}` : 'no compliance record (AI checks are not a compliance review)']);

  // Engineering: what this code can check against the bank and the ledger.
  const exact = targets.map(x => {
    if (!x.q || !x.current) return { state: 'blocked', why: `${x.t}: no such question` };
    const s = lifecycleOf(x.q, e.ledger), hash = revisionHash(x.current);
    if (x.current.revision !== x.rev) return { state: 'blocked', why: `${x.t}: names revision ${x.rev}, the current one is ${x.current.revision} (a stale approval never carries over)` };
    if (!s.approved) return { state: 'not-verified', why: `${x.t}: no approval bound to ${hash}` };
    return { state: s.decision!.hash === hash ? 'ok' : 'blocked', why: `${x.t}: approved ${s.decision!.hash}, current ${hash}` };
  });
  gate('exact-hash', 'Exact revision and hash approved', 'engineering', worst(exact), exact.map(v => v.why));
  const p1 = new Set(e.priority1), open = review.filter(v => p1.has(v.x.id) && v.state !== 'ok');
  gate('priority-1', 'No unresolved priority-1 blockers', 'engineering', open.length ? 'blocked' : 'ok',
    open.length ? open.map(v => `priority 1: ${v.why}`) : [`${review.filter(v => p1.has(v.x.id)).length} priority-1 target(s), each approved`]);
  const local = (id: string, title: string, ids: (keyof ReleaseEvidence['checks'])[]) => {
    const missing = ids.filter(i => e.checks[i] === undefined), failed = ids.filter(i => e.checks[i] !== undefined && e.checks[i] !== 'pass');
    gate(id, title, 'engineering', failed.length ? 'blocked' : missing.length ? 'not-verified' : 'ok', [...failed.map(i => `${i}: ${e.checks[i]}`), ...missing.map(i => `${i}: not run`)]);
  };
  local('leak-scan', 'Unpublished content leak scan passed', ['exposure-data', 'bundle-leak', 'routes', 'probe']);
  local('ledger-integrity', 'Ledger integrity passed', ['ledger', 'ledger-replay']);
  local('paper-versions', 'Paper-version integrity passed', ['assessment-integrity', 'paper-versions']);
  const drill = e.rollbackDrill;
  gate('rollback', 'Rollback / revocation procedure tested', 'engineering', drill?.passed ? 'ok' : drill ? 'blocked' : 'not-verified', [drill ? `drill ${drill.passed ? 'passed' : 'failed'} on ${drill.at}` : 'no drill recorded']);

  // The explicit authorization: a person, for exactly these targets on exactly this commit.
  const a = e.authorization;
  if (a && isSynthetic(a.by)) synthetic.push(`authorization by ${a.by}`);
  const sameTargets = !!a && [...a.targets].sort().join() === [...e.targets].sort().join();
  gate('authorization', 'Explicit release authorization received', 'human', a && sameTargets && a.head === e.head ? 'ok' : a ? 'blocked' : 'not-verified',
    [!a ? 'no release authorization' : !sameTargets ? 'the authorization names other targets' : a.head !== e.head ? `the authorization is for ${a.head}, not ${e.head}` : `${a.by} on ${a.at}`]);

  const wouldRelease = gates.every(g => g.status === KIND_STATUS[g.kind]);
  return { gates, wouldRelease, synthetic: synthetic.length > 0, releasable: wouldRelease && !synthetic.length };
}
