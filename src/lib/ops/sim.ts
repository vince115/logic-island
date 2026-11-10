/*
 * Phase F.1d architecture-diagram activity (DB19): what a backup plan can restore after a failure, and what readers see
 * on a replica. Deterministic teaching models (times are whole minutes or seconds, sizes are given), not any product:
 * - Backups: full backups, incremental backups (each holds the changes since the previous backup of any kind) and,
 *   optionally, continuous archiving of the write-ahead log every few minutes. Restoring to the latest possible point
 *   uses the last full backup before the failure, every incremental after it, then the archived log up to the last
 *   archived segment. Data written after the recovery point is lost: that gap is the achieved RPO; the restore time
 *   (sum of the steps) is the RTO estimate.
 * - Replication: a primary and one replica. Asynchronous: a write reaches the replica `lag` seconds after it commits on
 *   the primary. Synchronous: the commit waits until the replica has it, so the replica is never behind (the cost is
 *   commit latency, which the lesson discusses in words). A failover at time f promotes the replica: asynchronous writes
 *   that had not reached it are lost.
 */

export interface BackupPlan {
  /** Minutes since the start of the scenario. */
  fullAt: number[];
  incrementalAt: number[];
  /** Archive the write-ahead log every this many minutes (continuous archiving); absent: no log archiving. */
  logEvery?: number;
  /** Minutes each restore step takes. */
  restore: { full: number; incremental: number; logPerHour: number };
}
export type RestoreStep = { kind: 'full' | 'incremental'; at: number } | { kind: 'log'; from: number; to: number };
export interface RestoreResult { steps: RestoreStep[]; recoveryPoint: number; dataLoss: number; restoreMinutes: number }

export function planRestore(plan: BackupPlan, failureAt: number): RestoreResult | undefined {
  const full = Math.max(...plan.fullAt.filter(t => t <= failureAt));
  if (!Number.isFinite(full)) return undefined;
  const incrementals = plan.incrementalAt.filter(t => t > full && t <= failureAt).sort((a, b) => a - b);
  const steps: RestoreStep[] = [{ kind: 'full', at: full }, ...incrementals.map(at => ({ kind: 'incremental' as const, at }))];
  let recoveryPoint = incrementals.at(-1) ?? full;
  if (plan.logEvery) {
    const lastArchived = Math.floor(failureAt / plan.logEvery) * plan.logEvery;
    if (lastArchived > recoveryPoint) { steps.push({ kind: 'log', from: recoveryPoint, to: lastArchived }); recoveryPoint = lastArchived; }
  }
  const log = steps.find((s): s is Extract<RestoreStep, { kind: 'log' }> => s.kind === 'log');
  const restoreMinutes = plan.restore.full + incrementals.length * plan.restore.incremental
    + (log ? Math.ceil((log.to - log.from) / 60 * plan.restore.logPerHour) : 0);
  return { steps, recoveryPoint, dataLoss: failureAt - recoveryPoint, restoreMinutes };
}

export interface ReplicationScenario {
  mode: 'async' | 'sync';
  /** Seconds a write takes to reach the replica (asynchronous mode). */
  lag: number;
  initial: Record<string, number>;
  writes: { at: number; key: string; value: number }[];
  reads: { at: number; key: string; from: 'primary' | 'replica'; label: string }[];
  /** Promote the replica at this second. */
  failoverAt?: number;
}
export interface ReadResult { label: string; at: number; key: string; from: 'primary' | 'replica'; value: number; primaryValue: number; stale: boolean }
export interface ReplicationResult { reads: ReadResult[]; lost: ReplicationScenario['writes']; afterFailover?: Record<string, number> }

export function simulateReplication(s: ReplicationScenario): ReplicationResult {
  const arrives = (w: ReplicationScenario['writes'][number]) => s.mode === 'sync' ? w.at : w.at + s.lag;
  const writes = [...s.writes].sort((a, b) => a.at - b.at);
  const valueAt = (key: string, t: number, onReplica: boolean) =>
    writes.filter(w => w.key === key && (onReplica ? arrives(w) : w.at) <= t).at(-1)?.value ?? s.initial[key];
  const reads = s.reads.map(r => {
    const primaryValue = valueAt(r.key, r.at, false), value = r.from === 'primary' ? primaryValue : valueAt(r.key, r.at, true);
    return { label: r.label, at: r.at, key: r.key, from: r.from, value, primaryValue, stale: value !== primaryValue };
  });
  if (s.failoverAt === undefined) return { reads, lost: [] };
  const f = s.failoverAt;
  const lost = writes.filter(w => w.at <= f && arrives(w) > f);
  const afterFailover = Object.fromEntries(Object.keys(s.initial).map(k => [k, valueAt(k, f, true)]));
  return { reads, lost, afterFailover };
}
