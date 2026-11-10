import { recoverAfter, type TimelineScript } from './recovery';
import { ANOMALIES, ANOMALY_TEXT, LEVELS, runSchedule, weakestSafeLevel, type Anomaly, type Level, type Model, type Schedule } from './schedule';

/*
 * Phase F.1c: the answers of DB14/DB15's transaction exercises, computed by the engines (never typed into the lesson),
 * and the check of a learner's answer. Messages say what is wrong without giving the right value.
 */

export type TxTask =
  | { task: 'recovery'; script: TimelineScript; crashAfter: number }
  | { task: 'final'; schedule: Schedule; model: Model; level: Level }
  | { task: 'anomalies'; schedule: Schedule; model: Model; level: Level }
  | { task: 'level'; schedule: Schedule; model: Model; anomalies: Anomaly[] };
/** Values per item; a set of anomalies; or a level ('none': no level of the model prevents it). */
export type TxAnswer = Record<string, number> | Anomaly[] | Level | 'none';

export function expectedAnswer(t: TxTask): TxAnswer {
  switch (t.task) {
    case 'recovery': return recoverAfter(t.script, t.crashAfter).state;
    case 'final': return runSchedule(t.schedule, t.model, t.level).final;
    case 'anomalies': return ANOMALIES.filter(a => runSchedule(t.schedule, t.model, t.level).anomalies.some(x => x.kind === a));
    case 'level': return weakestSafeLevel(t.schedule, t.model, t.anomalies) ?? 'none';
  }
}

export function checkTxAnswer(t: TxTask, answer: TxAnswer): { ok: boolean; messages: string[] } {
  const expected = expectedAnswer(t), messages: string[] = [];
  if (t.task === 'recovery' || t.task === 'final') {
    const want = expected as Record<string, number>, got = answer as Record<string, number>;
    for (const item of Object.keys(want)) {
      if (got[item] === undefined || Number.isNaN(got[item])) messages.push(`還沒有填 ${item}。`);
      else if (got[item] !== want[item]) messages.push(t.task === 'recovery'
        ? `${item} 不對：當機時日誌裡有哪些交易已經有 COMMIT 紀錄？只有它們的修改會被重做。`
        : `${item} 不對：逐步看誰等待、誰被中止，最後只有已提交的寫入會留下。`);
    }
  } else if (t.task === 'anomalies') {
    const want = new Set(expected as Anomaly[]), got = new Set(answer as Anomaly[]);
    for (const a of ANOMALIES) {
      if (want.has(a) && !got.has(a)) messages.push(`漏了一種實際發生的異常（提示：檢查「${ANOMALY_TEXT[a]}」的定義）。`);
      if (!want.has(a) && got.has(a)) messages.push(`「${ANOMALY_TEXT[a]}」在這個排程與等級下沒有發生：看看讀取時有沒有等待，或讀到的是哪一個版本。`);
    }
  } else if (answer !== expected) {
    messages.push(expected === 'none' ? '這個模型的等級都擋不住它。' : (LEVELS as readonly string[]).indexOf(answer as string) < LEVELS.indexOf(expected as Level)
      ? '這個等級還擋不住：在它之下異常仍然發生。' : '這個等級擋得住，但不是最弱的：試試更低一級。');
  }
  return { ok: !messages.length, messages };
}
