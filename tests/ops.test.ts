import { describe, expect, it } from 'vitest';
import { planRestore, simulateReplication, type BackupPlan, type ReplicationScenario } from '../src/lib/ops/sim';
import { checkOpsAnswer, expectedOpsAnswer } from '../src/lib/ops/check';

// Phase F.1d: the backup and replication simulator behind DB19, on cases worked out by hand.
const plan: BackupPlan = { fullAt: [0, 1440], incrementalAt: [360, 720, 1080, 1800], restore: { full: 30, incremental: 10, logPerHour: 6 } };

describe('backup and restore (F.1d)', () => {
  it('restores the last full backup and every incremental after it; without log archiving, the last backup is the recovery point', () => {
    expect(planRestore(plan, 1000)).toEqual({ steps: [{ kind: 'full', at: 0 }, { kind: 'incremental', at: 360 }, { kind: 'incremental', at: 720 }],
      recoveryPoint: 720, dataLoss: 280, restoreMinutes: 50 });
    // Right after a new full backup only that one is needed.
    expect(planRestore(plan, 1500)).toMatchObject({ steps: [{ kind: 'full', at: 1440 }], recoveryPoint: 1440, dataLoss: 60, restoreMinutes: 30 });
    expect(planRestore({ ...plan, fullAt: [600] }, 500)).toBeUndefined();
  });

  it('with continuous log archiving, replays the log up to the last archived segment', () => {
    const r = planRestore({ ...plan, logEvery: 5 }, 1003)!;
    expect(r).toEqual({ steps: [{ kind: 'full', at: 0 }, { kind: 'incremental', at: 360 }, { kind: 'incremental', at: 720 }, { kind: 'log', from: 720, to: 1000 }],
      recoveryPoint: 1000, dataLoss: 3, restoreMinutes: 50 + Math.ceil(280 / 60 * 6) });
    expect(planRestore({ ...plan, logEvery: 5 }, 720)!.steps.at(-1)).toEqual({ kind: 'incremental', at: 720 });
  });
});

const scenario: ReplicationScenario = { mode: 'async', lag: 3, initial: { stock: 10 },
  writes: [{ at: 10, key: 'stock', value: 9 }, { at: 20, key: 'stock', value: 8 }],
  reads: [{ at: 11, key: 'stock', from: 'replica', label: '下單後立刻查（複本）' }, { at: 11, key: 'stock', from: 'primary', label: '下單後立刻查（主機）' },
    { at: 14, key: 'stock', from: 'replica', label: '三秒後查（複本）' }], failoverAt: 21 };

describe('replication (F.1d)', () => {
  it('a replica lags behind an asynchronous primary; synchronous replication does not', () => {
    const r = simulateReplication(scenario);
    expect(r.reads.map(x => [x.value, x.stale])).toEqual([[10, true], [9, false], [9, false]]);
    expect(simulateReplication({ ...scenario, mode: 'sync' }).reads.map(x => x.stale)).toEqual([false, false, false]);
  });

  it('a failover loses the asynchronous writes that had not reached the replica', () => {
    expect(simulateReplication(scenario)).toMatchObject({ lost: [{ at: 20, value: 8 }], afterFailover: { stock: 9 } });
    expect(simulateReplication({ ...scenario, mode: 'sync' })).toMatchObject({ lost: [], afterFailover: { stock: 8 } });
    expect(simulateReplication({ ...scenario, failoverAt: 30 }).lost).toEqual([]);
  });

  it('checks answers against the simulator and explains a wrong number without giving it away', () => {
    const t = { task: 'restore' as const, plan: { ...plan, logEvery: 5 }, failureAt: 1003 };
    expect(expectedOpsAnswer(t)).toEqual({ recoveryPoint: 1000, dataLoss: 3 });
    expect(checkOpsAnswer(t, { recoveryPoint: 1000, dataLoss: 3 })).toEqual({ ok: true, messages: [] });
    expect(checkOpsAnswer(t, { recoveryPoint: 720, dataLoss: 283 }).messages).toHaveLength(2);
    expect(checkOpsAnswer({ task: 'replica-read', scenario, read: '下單後立刻查（複本）' }, { value: 9 }).messages[0]).toMatch(/什麼時候才到達複本/);
    expect(expectedOpsAnswer({ task: 'failover', scenario })).toEqual({ lost: 1 });
    expect(checkOpsAnswer({ task: 'failover', scenario }, { lost: NaN }).messages[0]).toMatch(/還沒有填/);
  });
});
