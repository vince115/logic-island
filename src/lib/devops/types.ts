import type { DeploymentHistory } from './history';
import type { Gate, RolloutScenario, Strategy } from './rollout';

/*
 * CICD-0 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md): the shape of `content.devops`, the devops-explorer capability's
 * part of a lesson. Explorers are shown in the lesson's sections by id, like any example; exercises name what they ask
 * (a query on the lesson's explorers) and never write the answer: src/lib/devops/check.ts computes it from the data.
 * D1 (histories) and D2 (rollouts) are built; D3 (dashboards) and D4 (logs) are planned and add their own parts.
 */

/** D1: a service's deployment history, with its DORA metrics computed in the browser. 示意資料. */
export interface HistoryExplorer { id: string; title: string; description: string; history: DeploymentHistory }
/** D2 (deployment-simulator): a fleet moving from one version to the next, simulated minute by minute. 示意資料. */
export interface RolloutExplorer { id: string; title: string; description: string; scenario: RolloutScenario }

export const DORA_METRICS = ['deployments', 'deploy-days', 'per-week', 'changes', 'lead-time-median', 'failed', 'change-fail-rate', 'recovery-median', 'detect-median'] as const;
export type DoraMetric = typeof DORA_METRICS[number];
/** The four DORA metrics a history can be ranked by (frequency: higher is better; the others: lower is better). */
export const DORA_RANKED = ['per-week', 'lead-time-median', 'change-fail-rate', 'recovery-median'] as const satisfies readonly DoraMetric[];
export const ROLLOUT_METRICS = ['errors', 'errors-from', 'errors-to', 'dropped', 'affected', 'peak-instances', 'extra-instance-minutes', 'dropped-minutes',
  'completed-at', 'rolled-back-at', 'switch-at', 'aborted-step', 'outcome', 'final-version', 'running-at', 'served-to-at', 'gate-requests', 'gate-errors', 'gate-permille'] as const;
export type RolloutMetric = typeof ROLLOUT_METRICS[number];
/** The rollout metrics two strategies can be compared by (lower is better). */
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
  | { task: 'rollout-best'; rollout: string; candidates: { id: string; strategy: Strategy }[]; metric: typeof ROLLOUT_RANKED[number] };

export interface DevopsBlank { id: string; label: string; query: DevopsQuery }
/** What a rollout plan must achieve (each limit inclusive); completeBy also needs the rollout to complete. */
export interface PlanConstraints {
  maxErrors?: number; maxDropped?: number; maxAffected?: number; maxPeakInstances?: number; maxExtraInstanceMinutes?: number;
  completeBy?: number; outcome?: 'completed' | 'rolled-back';
}
/**
 * rollout-plan: the learner sets the strategy's parameters; the checker simulates the rollout with them and checks the
 * constraints (any plan that meets them passes). `reference` is one plan that does, shown as a reference solution.
 */
export interface RolloutPlanTask { rollout: string; strategy: 'rolling' | 'blue-green' | 'canary'; constraints: PlanConstraints; reference: Strategy }

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
);

export interface DevopsLessonContent {
  histories?: HistoryExplorer[];
  rollouts?: RolloutExplorer[];
  exercises: DevopsExercise[];
}
export const devopsExplorers = (c: DevopsLessonContent) => [...c.histories ?? [], ...c.rollouts ?? []];
