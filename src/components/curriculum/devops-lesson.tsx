import type { LessonContent } from '@/content/curriculum/schema';
import { correctOption, devopsQueryValue, formatDevopsValue, simulatePlan } from '@/lib/devops/check';
import { strategyText } from '@/lib/devops/rollout';
import type { DevopsExercise, DevopsLessonContent } from '@/lib/devops/types';
import { DeploymentHistoryView, DevopsExerciseBox, RolloutSimulatorView } from './devops-explorer';
import { Rich } from './rich';
import styles from './curriculum.module.css';

/*
 * CICD-0: the devops-explorer capability's part of a lesson page: the histories and rollouts by id, for the sections that
 * show them, and the exercises, whose reference answers are computed here from the lesson's data.
 */

export function devopsExamples(content: LessonContent): [string, React.ReactNode][] {
  const devops = content.devops;
  if (!devops) return [];
  return [
    ...(devops.histories ?? []).map(x => [x.id, <DeploymentHistoryView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(devops.rollouts ?? []).map(x => [x.id, <RolloutSimulatorView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
  ];
}

/** What the exercises check, said once above them. */
export const DEVOPS_EXERCISE_NOTICE = 'DevOps 練習的答案由課內的示意資料算出（部署紀錄的 DORA 指標、逐分鐘的部署模擬），再和你的答案比對：數字要完全相同，時間一律以分鐘計；部署規劃題會用你的參數重新模擬一次，再檢查題目的條件。課程不連線到任何真實的服務或平台。';

function Reference({ exercise, content }: { exercise: DevopsExercise; content: DevopsLessonContent }) {
  if (exercise.kind === 'choice') return <p>答案：<Rich text={exercise.options[correctOption(exercise, content)].label}/></p>;
  if (exercise.kind === 'rollout-plan') {
    const r = simulatePlan(exercise.plan, content, exercise.plan.reference);
    return <p>其中一種設定：{strategyText(exercise.plan.reference)}；模擬結果：錯誤 {r.totals.errors}、丟棄 {r.totals.dropped}、尖峰 {r.totals.peakInstances} 個、額外的執行個體分鐘 {r.totals.extraInstanceMinutes}{r.completedAt !== undefined ? `，第 ${r.completedAt} 分鐘完成` : ''}。</p>;
  }
  const blanks = exercise.kind === 'table' ? exercise.blanks : [exercise.blank];
  return <ul>{blanks.map(b => <li key={b.id}><Rich text={b.label}/>：<code>{formatDevopsValue(devopsQueryValue(b.query, content))}</code></li>)}</ul>;
}

export function DevopsExerciseView({ exercise, content }: { exercise: DevopsExercise; content: DevopsLessonContent }) {
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <DevopsExerciseBox exercise={exercise} content={content}/>
    <details className={styles.details}><summary>提示（{exercise.hints.length}）</summary><ul>{exercise.hints.map(h => <li key={h}><Rich text={h}/></li>)}</ul></details>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary><ul>{exercise.mistakes.map(m => <li key={m.why}><Rich text={m.why}/></li>)}</ul></details>
    <details className={styles.details}><summary>參考解答</summary>
      <Reference exercise={exercise} content={content}/>
      <p><Rich text={exercise.explanation}/></p>
    </details>
  </article>;
}
