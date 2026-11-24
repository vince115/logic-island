import type { LessonContent } from '@/content/curriculum/schema';
import { correctOption, devopsQueryValue, formatDevopsValue, simulatePlan } from '@/lib/devops/check';
import { strategyText } from '@/lib/devops/rollout';
import type { DevopsExercise, DevopsLessonContent } from '@/lib/devops/types';
import { alertConstraintTexts, dashboardById } from '@/lib/devops/dashboard-check';
import { conditionText } from '@/lib/devops/alerts';
import { evaluateOn, seriesOf } from '@/lib/devops/dashboard';
import { evaluateRedact, redactAnswer } from '@/lib/devops/logs-check';
import { policyText } from '@/lib/devops/sampling';
import { sampleForTask, samplingConstraintTexts } from '@/lib/devops/sampling-check';
import { burnConditionText, evaluateBurn } from '@/lib/devops/burn';
import { inMinutes, sloById } from '@/lib/devops/slo-check';
import { SloExplorerView } from './slo-view';
import { MonitoringDashboardView } from './dashboard-view';
import { LogViewer } from './log-viewer';
import { TracesExplorerView } from './trace-view';
import { DeploymentHistoryView, DevopsExerciseBox, RolloutSimulatorView } from './devops-explorer';
import { Rich } from './rich';
import styles from './curriculum.module.css';

/*
 * CICD-0: the devops-explorer capability's part of a lesson page: the histories, rollouts, dashboards, logs, traces and SLOs by id, for the sections that
 * show them, and the exercises, whose reference answers are computed here from the lesson's data.
 */

export function devopsExamples(content: LessonContent): [string, React.ReactNode][] {
  const devops = content.devops;
  if (!devops) return [];
  return [
    ...(devops.histories ?? []).map(x => [x.id, <DeploymentHistoryView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(devops.rollouts ?? []).map(x => [x.id, <RolloutSimulatorView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(devops.dashboards ?? []).map(x => [x.id, <MonitoringDashboardView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(devops.logs ?? []).map(x => [x.id, <LogViewer key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(devops.traces ?? []).map(x => [x.id, <TracesExplorerView key={x.id} explorer={x} content={devops}/>] as [string, React.ReactNode]),
    ...(devops.slos ?? []).map(x => [x.id, <SloExplorerView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
  ];
}

/** What the exercises check, said once above them. */
export const DEVOPS_EXERCISE_NOTICE = 'DevOps 練習的答案由課內的示意資料算出（部署紀錄的 DORA 指標、逐分鐘的部署模擬、儀表板的告警評估），再和你的答案比對：數字要完全相同，時間一律以分鐘計；部署規劃題與告警規則題會用你的設定重新模擬或評估一次，再檢查題目的條件。課程不連線到任何真實的服務或平台。';
/** D4: the notice of a lesson with logs (lessons without logs keep DEVOPS_EXERCISE_NOTICE word for word). */
export const DEVOPS_LOGS_NOTICE = 'DevOps 練習的答案由課內的示意資料算出（部署紀錄的 DORA 指標、逐分鐘的部署模擬、儀表板的告警評估、日誌的篩選與關聯），再和你的答案比對：數字要完全相同；部署與告警的時間以分鐘計，日誌的時間寫成「分:秒」或秒數；部署規劃題與告警規則題會用你的設定重新模擬或評估一次，再檢查題目的條件；遮蔽題會把你的規則套用到課程的日誌，再檢查該隱藏的值都看不到、該保留的值都還在。課程不連線到任何真實的服務或平台。';
/** D5: the notice of a lesson with traces (lessons without them keep the notices above word for word). */
export const DEVOPS_TRACES_NOTICE = 'DevOps 練習的答案由課內的示意資料算出（儀表板的告警評估、日誌的篩選與關聯、追蹤的時間、自身時間與關鍵路徑、取樣與基數），再和你的答案比對：數字要完全相同；告警的時間以分鐘計，日誌的時間寫成「分:秒」或秒數，追蹤的時間以毫秒計；告警規則題與取樣規劃題會用你的設定重新評估或取樣一次，再檢查題目的條件。課程不連線到任何真實的服務或平台。';
/** D6: the notice of a lesson with SLOs (lessons without them keep the notices above word for word). */
export const DEVOPS_SLO_NOTICE = 'DevOps 練習的答案由課內的示意資料算出（儀表板的告警評估、SLI 與錯誤預算、消耗率與消耗率告警、SLA 的補償），再和你的答案比對：數字要完全相同，照題目的小數位數填；時間以分鐘計（時段的開始），消耗率填倍數（例如 14.4）；告警規則題與消耗率告警題會用你的設定重新評估一次，再檢查題目的條件。課程不連線到任何真實的服務或平台。';
export const devopsExerciseNotice = (c: DevopsLessonContent) => c.slos?.length ? DEVOPS_SLO_NOTICE : c.traces?.length ? DEVOPS_TRACES_NOTICE : c.logs?.length ? DEVOPS_LOGS_NOTICE : DEVOPS_EXERCISE_NOTICE;

function Reference({ exercise, content }: { exercise: DevopsExercise; content: DevopsLessonContent }) {
  if (exercise.kind === 'choice') return <p>答案：<Rich text={exercise.options[correctOption(exercise, content)].label}/></p>;
  if (exercise.kind === 'rollout-plan') {
    const r = simulatePlan(exercise.plan, content, exercise.plan.reference);
    return <p>其中一種設定：{strategyText(exercise.plan.reference)}；模擬結果：錯誤 {r.totals.errors}、丟棄 {r.totals.dropped}、尖峰 {r.totals.peakInstances} 個、額外的執行個體分鐘 {r.totals.extraInstanceMinutes}{r.completedAt !== undefined ? `，第 ${r.completedAt} 分鐘完成` : ''}。</p>;
  }
  if (exercise.kind === 'alert-rule') {
    const d = dashboardById(content, exercise.plan.dashboard), ref = exercise.plan.reference, r = evaluateOn(d, ref);
    return <p>其中一條規則：{conditionText(ref, seriesOf(d, ref.series))}；評估結果：通知 {r.notifications} 次、誤報 {r.falseAlerts} 次、漏掉 {r.missed} 個事故{r.incidents.length ? `；偵測延遲 ${r.incidents.map(i => `${i.label} ${i.delay === undefined ? '漏掉' : `${i.delay} 分鐘`}`).join('、')}` : ''}（條件：{alertConstraintTexts(exercise.plan.constraints).join('；')}）。</p>;
  }
  if (exercise.kind === 'redact') {
    const o = evaluateRedact(exercise.redact, content, redactAnswer(exercise.redact.reference)).outcome;
    return <><p>其中一組規則（一行一條）：</p><pre>{exercise.redact.reference.join('\n')}</pre>
      <p>改動了 {o?.masked ?? 0} 個值；必須隱藏的 {exercise.redact.mustHide.length} 個值都看不到，必須保留的 {exercise.redact.mustKeep.length} 個值都還在。</p></>;
  }
  if (exercise.kind === 'sampling-plan') {
    const r = sampleForTask(exercise.sampling, content, exercise.sampling.reference);
    return <p>其中一種設定：{policyText(exercise.sampling.reference)}；取樣結果：保留 {r.kept}／{r.traces} 個追蹤、有錯誤的 {r.keptErrors}／{r.errorTraces} 個
      {r.slow ? `、慢於 ${r.slow.threshold} ms 的 ${r.slow.kept}／${r.slow.total} 個` : ''}{r.keptSpansPerDay !== undefined ? `，估計每天 ${r.keptSpansPerDay.toLocaleString('en-US')} 個 span` : ''}
      （條件：{samplingConstraintTexts(exercise.sampling.constraints).join('；')}）。</p>;
  }
  if (exercise.kind === 'burn-alert') {
    const s = sloById(content, exercise.burn.slo), ref = exercise.burn.reference, r = inMinutes(evaluateBurn(s, ref), s.bucketMinutes);
    return <p>其中一種設定：{burnConditionText(ref)}；評估結果：通知 {r.notifications} 次、誤報 {r.falseAlerts} 次、漏掉 {r.missed} 個事故{r.incidents.length ? `；偵測延遲 ${r.incidents.map(i => `${i.label} ${i.delay === undefined ? '漏掉' : `${i.delay} 分鐘`}`).join('、')}` : ''}（條件：{alertConstraintTexts(exercise.burn.constraints).join('；')}）。</p>;
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
