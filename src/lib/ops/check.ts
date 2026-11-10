import { planRestore, simulateReplication, type BackupPlan, type ReplicationScenario } from './sim';

/*
 * Phase F.1d: DB19's exercises. The answers are computed by the simulator (src/lib/ops/sim.ts), never written into the
 * lesson; a learner's numbers are compared with them, and the messages point at the reasoning, not the value.
 */
export type OpsTask =
  | { task: 'restore'; plan: BackupPlan; failureAt: number }
  | { task: 'replica-read'; scenario: ReplicationScenario; read: string }
  | { task: 'failover'; scenario: ReplicationScenario };

/** The numbers a learner enters for each task, with their labels. */
export const OPS_FIELDS: Record<OpsTask['task'], Record<string, string>> = {
  restore: { recoveryPoint: '最多能還原到第幾分鐘', dataLoss: '會遺失幾分鐘的資料' },
  'replica-read': { value: '這次讀取得到的值' },
  failover: { lost: '切換後遺失幾筆寫入' },
};

export function expectedOpsAnswer(t: OpsTask): Record<string, number> {
  switch (t.task) {
    case 'restore': {
      const r = planRestore(t.plan, t.failureAt);
      if (!r) throw new Error('no full backup before the failure');
      return { recoveryPoint: r.recoveryPoint, dataLoss: r.dataLoss };
    }
    case 'replica-read': {
      const r = simulateReplication(t.scenario).reads.find(x => x.label === t.read);
      if (!r) throw new Error(`no read labelled ${t.read}`);
      return { value: r.value };
    }
    case 'failover': return { lost: simulateReplication(t.scenario).lost.length };
  }
}

const HINTS: Record<string, string> = {
  recoveryPoint: '從故障前最後一次完整備份開始，接上之後的每一次增量備份；有持續封存日誌的話，最多能再往前推到最後一段封存的日誌。',
  dataLoss: '資料損失是故障時間減去能還原到的時間。',
  value: '算一下這筆寫入什麼時候才到達複本：讀取的時間點之前已經到達的最新寫入，才是複本上看得到的值。',
  lost: '非同步複寫時，切換的那一刻還沒到達複本的已提交寫入，在新的主機上都不存在。',
};

export function checkOpsAnswer(t: OpsTask, answer: Record<string, number>): { ok: boolean; messages: string[] } {
  const expected = expectedOpsAnswer(t), messages: string[] = [];
  for (const [field, value] of Object.entries(expected)) {
    const got = answer[field];
    if (got === undefined || Number.isNaN(got)) messages.push(`還沒有填「${OPS_FIELDS[t.task][field]}」。`);
    else if (got !== value) messages.push(`「${OPS_FIELDS[t.task][field]}」不對：${HINTS[field]}`);
  }
  return { ok: !messages.length, messages };
}
