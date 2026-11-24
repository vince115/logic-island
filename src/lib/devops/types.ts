import type { AlertCondition } from './alerts';
import type { Dashboard } from './dashboard';
import type { DeploymentHistory } from './history';
import type { IncidentMetric } from './incident';
import type { LogFilter } from './log-query';
import type { LogSet } from './logs';
import type { Gate, RolloutScenario, Strategy } from './rollout';
import type { SamplingPolicy } from './sampling';
import type { BurnCondition, SloScenario } from './slo';
import type { TraceSet } from './traces';

/*
 * CICD-0 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md): the shape of `content.devops`, the devops-explorer capability's
 * part of a lesson. Explorers are shown in the lesson's sections by id, like any example; exercises name what they ask
 * (a query on the lesson's explorers) and never write the answer: src/lib/devops/check.ts computes it from the data.
 * D1 (histories), D2 (rollouts), D3 (dashboards), D4 (logs), D5 (traces) and D6 (SLOs) are built.
 */

/** D1: a service's deployment history, with its DORA metrics computed in the browser. 示意資料. */
export interface HistoryExplorer { id: string; title: string; description: string; history: DeploymentHistory }
/** D2 (deployment-simulator): a fleet moving from one version to the next, simulated minute by minute. 示意資料. */
export interface RolloutExplorer { id: string; title: string; description: string; scenario: RolloutScenario }
/** D3 (monitoring-dashboard): per-minute series, incidents and alert rules evaluated minute by minute. 示意資料. */
export interface DashboardExplorer { id: string; title: string; description: string; dashboard: Dashboard }
/**
 * D4 (monitoring-dashboard): centralized logs with filters, group counts, a correlation trace and a masking editor.
 * `masking` are the rules the editor starts with; `checks` (optional) are values the editor reports as still seen or lost.
 */
export interface LogsExplorer { id: string; title: string; description: string; logs: LogSet; masking?: string[]; checks?: { mustHide: string[]; mustKeep: string[] } }
/**
 * D5 (monitoring-dashboard): distributed traces with a waterfall, self time and the critical path, sampling and
 * cardinality. `links.logs` names a logs explorer of the lesson whose records carry trace ids (in `links.field`, default
 * its correlation field); `links.dashboard` a dashboard whose series the set's exemplars name. `labels` are the labels
 * the cardinality calculator starts with (default service, name, status).
 */
export interface TracesExplorer {
  id: string; title: string; description: string; traces: TraceSet;
  links?: { logs?: string; field?: string; dashboard?: string };
  labels?: string[];
}

/**
 * D6 (monitoring-dashboard): an SLO on bucketed good and total events, its error budget, burn rates, multi-window
 * burn-rate alerts (the scenario's `alerts`; the explorer starts from the first) and an optional SLA credit table.
 */
export interface SloExplorer { id: string; title: string; description: string; slo: SloScenario }

export const DORA_METRICS = ['deployments', 'deploy-days', 'per-week', 'changes', 'lead-time-median', 'failed', 'change-fail-rate', 'recovery-median', 'detect-median'] as const;
export type DoraMetric = typeof DORA_METRICS[number];
/** The four DORA metrics a history can be ranked by (frequency: higher is better; the others: lower is better). */
export const DORA_RANKED = ['per-week', 'lead-time-median', 'change-fail-rate', 'recovery-median'] as const satisfies readonly DoraMetric[];
export const ROLLOUT_METRICS = ['errors', 'errors-from', 'errors-to', 'dropped', 'affected', 'peak-instances', 'extra-instance-minutes', 'dropped-minutes',
  'completed-at', 'rolled-back-at', 'switch-at', 'aborted-step', 'outcome', 'final-version', 'running-at', 'served-to-at', 'gate-requests', 'gate-errors', 'gate-permille'] as const;
export type RolloutMetric = typeof ROLLOUT_METRICS[number];
/** The rollout metrics two strategies can be compared by (lower is better). */
export const SERIES_METRICS = ['value-at', 'max', 'min', 'max-at', 'signal'] as const;
export type SeriesMetric = typeof SERIES_METRICS[number];
export const ALERT_METRICS = ['first-firing', 'first-resolved', 'notifications', 'false-alerts', 'missed', 'detected', 'detection-delay', 'firing-minutes', 'state-at', 'value-at'] as const;
export type AlertMetric = typeof ALERT_METRICS[number];
export const LOG_METRICS = ['count', 'first-ts', 'last-ts', 'max', 'max-by', 'top', 'distinct'] as const;
export type LogMetric = typeof LOG_METRICS[number];
export const CORRELATE_METRICS = ['services', 'elapsed', 'records', 'first-error-service', 'last-service'] as const;
export type CorrelateMetric = typeof CORRELATE_METRICS[number];
export const RETENTION_METRICS = ['avg-bytes', 'bytes-per-day', 'total-bytes', 'total-mb', 'total-gb'] as const;
export type RetentionMetric = typeof RETENTION_METRICS[number];
export const TRACE_METRICS = ['spans', 'duration', 'self-time', 'critical-services', 'bottleneck', 'bottleneck-time', 'error-spans', 'percentile', 'slowest', 'log-records', 'exemplar'] as const;
export type TraceMetric = typeof TRACE_METRICS[number];
export const SAMPLING_METRICS = ['traces', 'error-traces', 'slow-traces', 'kept', 'kept-errors', 'kept-slow', 'spans', 'kept-spans', 'spans-per-day', 'kept-spans-per-day'] as const;
export type SamplingMetric = typeof SAMPLING_METRICS[number];
export const SLO_METRICS = ['sli', 'slo-met', 'total-events', 'bad-events', 'budget-events', 'consumed', 'consumed-pct', 'remaining', 'remaining-pct',
  'burn-rate-at', 'exhausted-at', 'hours-left', 'sla-credit'] as const;
export type SloMetric = typeof SLO_METRICS[number];
export const BURN_METRICS = ['first-firing', 'first-resolved', 'notifications', 'false-alerts', 'missed', 'detected', 'detection-delay', 'firing-minutes', 'state-at'] as const;
export type BurnMetric = typeof BURN_METRICS[number];
export const ROLLOUT_RANKED = ['errors', 'dropped', 'affected', 'peak-instances', 'extra-instance-minutes', 'completed-at'] as const satisfies readonly RolloutMetric[];

/** Where an answer comes from: a question about the lesson's explorers, computed by check.ts. */
export type DevopsQuery =
  | { task: 'dora'; history: string; metric: DoraMetric }
  /** The id of the history that does best on the metric (it must be unique). */
  | { task: 'dora-best'; histories: string[]; metric: typeof DORA_RANKED[number] }
  /**
   * A number or word from a rollout's simulation. `strategy` and `gate` replace the scenario's (gate: null removes it);
   * `minute` is needed by running-at and served-to-at, `step` (1-based; 0 is the blue-green watch) by the gate metrics.
   */
  | { task: 'rollout'; rollout: string; metric: RolloutMetric; strategy?: Strategy; gate?: Gate | null; minute?: number; step?: number }
  /** The id of the candidate strategy that does best (lowest) on the metric (it must be unique). */
  | { task: 'rollout-best'; rollout: string; candidates: { id: string; strategy: Strategy }[]; metric: typeof ROLLOUT_RANKED[number] }
  /** D3: a series' value at a minute (`minute`), its max or min, the first minute of its max, or its golden signal. */
  | { task: 'series'; dashboard: string; series: string; metric: SeriesMetric; minute?: number }
  /**
   * D3: a number or state from a rule's evaluation: the id of one of the dashboard's rules, or a condition written in
   * the query. detection-delay needs `incident`; state-at and value-at need `minute`.
   */
  | { task: 'alert'; dashboard: string; rule: string | AlertCondition; metric: AlertMetric; incident?: string; minute?: number }
  /** D3: an incident's times from its recorded events, or its severity from the dashboard's matrix. */
  | { task: 'incident'; dashboard: string; incident: string; metric: IncidentMetric }
  /**
   * D4: a number or word from the records that meet `filter`: how many, the first or last time, the largest value of
   * `field` (max), the `report` field (default the correlation field) of the record with the largest `field` (max-by),
   * the most frequent value of `group` (service, level, host or a field; top), the number of distinct values of `field`.
   */
  | { task: 'logs'; logs: string; metric: LogMetric; filter?: LogFilter; field?: string; report?: string; group?: string }
  /** D4: a request followed by its correlation id: the services in order, the seconds from first to last record… */
  | { task: 'correlate'; logs: string; id: string; metric: CorrelateMetric }
  /** D4: retention sizing; perDay and avgBytes come from the query, or else from the log set (perDay, its records' average). */
  | { task: 'retention'; logs?: string; perDay?: number; avgBytes?: number; days: number; metric: RetentionMetric }
  /** D4: whether a raw line is structured (JSON or key=value) or unstructured text, or how many fields it has. */
  | { task: 'log-format'; logs: string; line: string; metric: 'format' | 'fields' }
  /**
   * D5: a number or word from a trace (`trace`, its id): spans, duration, the self time of `span` (its id, or its name
   * when unique), the critical path's services, the bottleneck service and its time on the path, error spans, the log
   * records that carry its id (log-records, through the explorer's links). Of all traces: the `p`-th percentile (default
   * 95) of the durations, the slowest trace's id, the trace of an exemplar (`series`, `minute`).
   */
  | { task: 'trace'; traces: string; metric: TraceMetric; trace?: string; span?: string; p?: number; series?: string; minute?: number }
  /** D5: counts after sampling with `policy` (default: keep everything); slow-traces and kept-slow need `slowerThan`. */
  | { task: 'sampling'; traces: string; metric: SamplingMetric; policy?: SamplingPolicy; slowerThan?: number }
  /**
   * D5: the most series of a metric with these labels (series), or one label's distinct values (distinct). A label is
   * named (its distinct values counted in the traces' spans) or given with its count ({ name: 'user_id', values: 50000 }).
   */
  | { task: 'cardinality'; traces?: string; labels: (string | { name: string; values: number })[]; metric: 'series' | 'distinct' }
  /**
   * D6: a number or word from an SLO scenario (`slo`, its explorer's id). Buckets are indices (bucket t covers minutes
   * [t × B, (t + 1) × B)); answers about time are in minutes. sli, slo-met, total-events, bad-events and sla-credit are
   * over buckets [from, to) (default all); consumed, consumed-pct, remaining and remaining-pct after bucket `at` (default
   * the last); burn-rate-at and hours-left need `at` and `window` (minutes); exhausted-at is the first bucket's start
   * minute after which the budget is used up.
   */
  | { task: 'slo'; slo: string; metric: SloMetric; from?: number; to?: number; at?: number; window?: number }
  /**
   * D6: a number or state from a burn-rate alert's evaluation: one of the scenario's alerts by id, or a condition written
   * in the query. Times are in minutes; detection-delay needs `incident`, state-at needs `at` (a bucket).
   */
  | { task: 'burn'; slo: string; rule: string | BurnCondition; metric: BurnMetric; incident?: string; at?: number };

export interface DevopsBlank { id: string; label: string; query: DevopsQuery }
/** What a rollout plan must achieve (each limit inclusive); completeBy also needs the rollout to complete. */
export interface PlanConstraints {
  maxErrors?: number; maxDropped?: number; maxAffected?: number; maxPeakInstances?: number; maxExtraInstanceMinutes?: number;
  completeBy?: number; outcome?: 'completed' | 'rolled-back';
  /** CICD-5: the rollout must end because a gate judged a sufficient sample and failed (not an insufficient one). */
  gateFailed?: true;
}
/**
 * rollout-plan: the learner sets the strategy's parameters; the checker simulates the rollout with them and checks the
 * constraints (any plan that meets them passes). `reference` is one plan that does, shown as a reference solution.
 */
export interface RolloutPlanTask { rollout: string; strategy: 'rolling' | 'blue-green' | 'canary'; constraints: PlanConstraints; reference: Strategy }

/** What an alert rule must achieve on a dashboard (each limit inclusive); detectWithin also needs every incident detected. */
export interface AlertConstraints { detectWithin?: number; maxMissed?: number; maxFalseAlerts?: number; maxNotifications?: number }
/**
 * alert-rule: the learner writes a rule (series, comparison, threshold, optional window, for); the checker evaluates it
 * on the dashboard and checks the constraints (any rule that meets them passes). `reference` is one rule that does.
 */
export interface AlertPlanTask { dashboard: string; constraints: AlertConstraints; reference: AlertCondition }

/**
 * redact: the learner writes masking rules (src/lib/devops/redact.ts); after masking no value of mustHide may be seen
 * and every occurrence of each value of mustKeep must remain. `reference` is one set of rules that does.
 */
export interface RedactTask { logs: string; mustHide: string[]; mustKeep: string[]; reference: string[] }

/** What a sampling policy must achieve (keepSlowerThan: every trace slower than X ms; maxSpansPerDay inclusive). */
export interface SamplingConstraints { keepAllErrors?: true; keepSlowerThan?: number; maxSpansPerDay?: number }
/**
 * sampling-plan (D5): the learner sets the head ratio and the tail rules; the checker samples the traces with them and
 * checks the constraints (any policy that meets them passes). `reference` is one policy that does.
 */
export interface SamplingPlanTask { traces: string; constraints: SamplingConstraints; reference: SamplingPolicy }

/**
 * burn-alert (D6): the learner sets a burn-rate alert (long window, short window, factor); the checker evaluates it on
 * the scenario, bucket by bucket, and checks the constraints (detectWithin in minutes; any condition that meets them
 * passes). `reference` is one condition that does.
 */
export interface BurnAlertTask { slo: string; constraints: AlertConstraints; reference: BurnCondition }

export type DevopsExercise = {
  id: string; title: string; statement: string; hints: string[]; explanation: string;
  /** Typical wrong answers, in the shape of the learner's (see answerKeys); each must fail the check. */
  mistakes: { answer: Record<string, string>; why: string }[];
} & (
  | { kind: 'number'; blank: DevopsBlank }
  | { kind: 'field'; blank: DevopsBlank }
  /** Options carry the value they stand for; the data must make exactly one of them right. */
  | { kind: 'choice'; query: DevopsQuery; options: { value: string; label: string }[] }
  | { kind: 'table'; blanks: DevopsBlank[] }
  | { kind: 'rollout-plan'; plan: RolloutPlanTask }
  | { kind: 'alert-rule'; plan: AlertPlanTask }
  | { kind: 'redact'; redact: RedactTask }
  | { kind: 'sampling-plan'; sampling: SamplingPlanTask }
  | { kind: 'burn-alert'; burn: BurnAlertTask }
);

export interface DevopsLessonContent {
  histories?: HistoryExplorer[];
  rollouts?: RolloutExplorer[];
  dashboards?: DashboardExplorer[];
  logs?: LogsExplorer[];
  traces?: TracesExplorer[];
  slos?: SloExplorer[];
  exercises: DevopsExercise[];
}
export const devopsExplorers = (c: DevopsLessonContent) => [...c.histories ?? [], ...c.rollouts ?? [], ...c.dashboards ?? [], ...c.logs ?? [], ...c.traces ?? [], ...c.slos ?? []];
