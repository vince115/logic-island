import { roundHalfUp } from './history';

/*
 * CICD-0 devops-explorer stage D2 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §6): the deployment-simulator. A fleet of
 * identical instances moves from one version to the next with a strategy, minute by minute. An invented teaching model
 * (not any orchestrator, load balancer or vendor): every quantity is a whole number, and the rules are fixed here so a
 * learner can redo each minute by hand.
 *
 * Minute t covers [t, t + 1). At the start of a minute the strategy acts (removes and starts instances, moves traffic,
 * applies migrations and flag changes that are due); then the minute's requests are served; a gate is judged at the end
 * of its window's last minute and its verdict acts at the start of the next minute.
 * - An instance started at minute t is ready from minute t + ⌈startSeconds ÷ 60⌉ and serves from then on; a removed
 *   instance serves nothing in the minute it is removed. Running instances = ready + starting.
 * - Every ready instance serves up to `capacityRpm` requests a minute; requests beyond capacity are dropped (not served).
 * - recreate and rolling spread the minute's requests over all ready instances (each version's share follows its ready
 *   count); blue-green and canary route a weight (percent) of the requests to the new version's pool and the rest to the
 *   old one, and each pool's capacity caps what it serves.
 * - Splitting a whole number of requests by weights: each part gets ⌊total × weight ÷ Σweights⌋, and the requests left
 *   over go one each to the parts with the largest remainders (ties: the earlier part; the old version comes before the
 *   new, requests without a flagged feature before those with it).
 * - Errors: each (version, feature path) has its own error rate in ‰ and its own carried remainder:
 *   errors = ⌊(served × ‰ + carry) ÷ 1000⌋, carry = (served × ‰ + carry) mod 1000. The totals are therefore exact
 *   (⌊Σserved × ‰ ÷ 1000⌋ for a constant rate). A version that needs a column the schema does not have fails every request
 *   it serves (1000 ‰); requests on a flagged feature path use the flag's error rate.
 */

export const MAX_INSTANCES = 20;
export const MAX_MINUTES = 120;
export const MAX_STEPS = 10;

export interface Fleet {
  /** How many instances serve the service (the desired count, before and after the rollout). */
  instances: number;
  /** Requests a minute one ready instance can serve. */
  capacityRpm: number;
  /** Requests a minute the service receives (constant over the timeline). */
  rpm: number;
}
export interface AppVersion {
  id: string;
  label: string;
  /** Share of the requests it serves that fail, in ‰ (0–1000). */
  errorPermille: number;
  /** Its 95th-percentile latency in milliseconds (a declared figure; canary and blue-green gates may check it). */
  p95Ms: number;
  /** Seconds from start until an instance is ready; it serves from minute ⌈startSeconds ÷ 60⌉ after it started. */
  startSeconds: number;
  /** Columns of the database it needs: every request it serves fails while one of them does not exist. */
  requires?: string[];
}
/** A count of instances, or a percentage of the fleet (`25%`): maxSurge rounds up and maxUnavailable down. */
export type InstanceAmount = number | `${number}%`;
export type Strategy =
  | { kind: 'recreate' }
  | { kind: 'rolling'; maxSurge: InstanceAmount; maxUnavailable: InstanceAmount }
  /** Green starts beside blue; after it is ready and verified for `verifyMinutes` (smoke tests, no users) all traffic
   *  switches; blue is kept `keepBlueMinutes` for an instant rollback, then removed. */
  | { kind: 'blue-green'; verifyMinutes: number; keepBlueMinutes: number }
  /** Each step sends `weight` % of the traffic to the new version for `holdMinutes`; the last step's weight is 100. */
  | { kind: 'canary'; steps: CanaryStep[] };
export interface CanaryStep { weight: number; holdMinutes: number }
export type StrategyKind = Strategy['kind'];
export const STRATEGY_KINDS = ['recreate', 'rolling', 'blue-green', 'canary'] as const satisfies readonly StrategyKind[];
/**
 * A promotion gate (canary steps, the blue-green watch): over the window, the new version must serve at least
 * `minRequests` requests (otherwise the evidence is insufficient, which counts as failing) and keep its error rate
 * (errors × 1000 ≤ max × requests, ‰) or its declared p95 (≤ max ms) within `max`. Recreate and rolling ignore it.
 */
export interface Gate { metric: 'error-rate' | 'p95'; max: number; minRequests: number }
/** A schema change at the start of minute `at`: expand adds columns, contract drops them. */
export interface Migration { at: number; kind: 'expand' | 'contract'; columns: string[] }
/** A feature flag in a version's code: `percent` of that version's requests take the feature's path from minute `at`. */
export interface FeatureFlag { id: string; label: string; version: string; errorPermille: number; exposure: { at: number; percent: number }[] }

export interface RolloutScenario {
  fleet: Fleet;
  from: AppVersion;
  to: AppVersion;
  strategy: Strategy;
  gate?: Gate;
  /** The columns the database has at minute 0. */
  schema?: string[];
  migrations?: Migration[];
  flags?: FeatureFlag[];
  /** The timeline's length in minutes (1–120). */
  minutes: number;
}

export type Side = 'from' | 'to';
export interface PoolCount { ready: number; starting: number }
export interface MinuteRow {
  minute: number;
  instances: Record<Side, PoolCount>;
  /** Running instances (ready + starting, both versions). */
  running: number;
  /** blue-green and canary: the percent of traffic routed to the new version; recreate and rolling: undefined. */
  weight?: number;
  requests: number;
  served: Record<Side, number>;
  /** Of `served`, the requests on a flagged feature path. */
  feature: Record<Side, number>;
  errors: Record<Side, number>;
  dropped: number;
  /** Whether each version is missing a column it needs this minute (all its requests fail). */
  incompatible: Record<Side, boolean>;
  schema: string[];
  /** Flag exposure (percent) this minute, by flag id. */
  exposure: Record<string, number>;
  /** What happened at the start of the minute (and a gate's verdict at its end), in words. */
  events: string[];
}
export interface GateResult {
  /** The canary step (1-based), or 0 for the blue-green watch. */
  step: number;
  from: number;
  /** The window's last minute (inclusive). */
  to: number;
  requests: number;
  errors: number;
  /** errors ÷ requests in ‰, rounded half up (0 without requests). */
  permille: number;
  p95Ms: number;
  verdict: 'pass' | 'fail' | 'insufficient';
}
export type Outcome = 'completed' | 'rolled-back' | 'in-progress';
export interface RolloutResult {
  rows: MinuteRow[];
  outcome: Outcome;
  /** The first minute only the new version runs, at the full count, with all the traffic. */
  completedAt?: number;
  /** The minute traffic went back to the old version for good (the new version's instances removed). */
  rolledBackAt?: number;
  /** blue-green: the minute all traffic switched to green. */
  switchAt?: number;
  /** canary: the step (1-based) whose gate failed. */
  abortedStep?: number;
  gates: GateResult[];
  totals: {
    requests: number; served: number; dropped: number;
    errors: number; errorsBy: Record<Side, number>;
    /** errors + dropped. */
    affected: number;
    peakInstances: number;
    /** Σ max(0, running − fleet.instances) over the minutes: what keeping two versions at once costs. */
    extraInstanceMinutes: number;
    /** Minutes in which some requests were dropped. */
    droppedMinutes: number;
  };
  /** The resolved rolling parameters (instances), when the strategy is rolling. */
  rolling?: { surge: number; unavailable: number };
}

/** Minutes from start until ready. */
export const startMinutes = (v: AppVersion) => Math.ceil(v.startSeconds / 60);

const PERCENT = /^(\d{1,3})%$/;
/** Whether a value is a count (whole number ≥ 0) or a percentage 0%–100%. */
export function isAmount(a: unknown): a is InstanceAmount {
  if (typeof a === 'number') return Number.isInteger(a) && a >= 0;
  const m = typeof a === 'string' ? PERCENT.exec(a) : null;
  return !!m && Number(m[1]) <= 100;
}
/**
 * maxSurge and maxUnavailable in instances: a percentage of the fleet rounds up for surge and down for unavailable (as
 * Kubernetes resolves them), a count is taken as is (unavailable at most the fleet). When both come out 0, unavailable
 * becomes 1 so the rollout can progress; both given as the count 0 is refused by validation.
 */
export function resolveRolling(instances: number, maxSurge: InstanceAmount, maxUnavailable: InstanceAmount) {
  const pct = (a: InstanceAmount) => typeof a === 'string' ? Number(PERCENT.exec(a)![1]) : undefined;
  const ps = pct(maxSurge), pu = pct(maxUnavailable);
  const surge = ps === undefined ? maxSurge as number : Math.ceil(instances * ps / 100);
  let unavailable = Math.min(instances, pu === undefined ? maxUnavailable as number : Math.floor(instances * pu / 100));
  if (surge === 0 && unavailable === 0) unavailable = 1;
  return { surge, unavailable };
}

/** A whole number split by integer weights: floor shares, then the leftovers to the largest remainders (ties: earlier). */
export function splitByWeights(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const parts = weights.map(w => Math.floor(total * w / sum));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ i, r: (total * w) % sum })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) { if (!left) break; if (weights[i] > 0) { parts[i]++; left--; } }
  return parts;
}

interface Instance { side: Side; readyAt: number }

/** Simulates the scenario minute by minute (validate it with rolloutProblems first). */
export function simulateRollout(s: RolloutScenario): RolloutResult {
  const N = s.fleet.instances, cap = s.fleet.capacityRpm, R = s.fleet.rpm;
  const version = { from: s.from, to: s.to };
  const start = { from: startMinutes(s.from), to: startMinutes(s.to) };
  let pool: Instance[] = Array.from({ length: N }, () => ({ side: 'from' as Side, readyAt: -1 }));
  const count = (side: Side, t: number, readyOnly: boolean) => pool.filter(i => i.side === side && (!readyOnly || i.readyAt <= t)).length;
  const add = (side: Side, n: number, t: number, events: string[]) => {
    if (n <= 0) return;
    for (let k = 0; k < n; k++) pool.push({ side, readyAt: t + start[side] });
    events.push(`啟動 ${n} 個 ${version[side].label}（第 ${t + start[side]} 分鐘就緒）`);
  };
  const remove = (side: Side, n: number, events: string[], newest = false) => {
    if (n <= 0) return;
    // The old version's instances are all alike; the new version's newest instances are removed first.
    const idx = pool.map((x, i) => [x, i] as const).filter(([x]) => x.side === side).map(([, i]) => i);
    const drop = new Set((newest ? idx.reverse() : idx).slice(0, n));
    pool = pool.filter((_, i) => !drop.has(i));
    events.push(`移除 ${n} 個 ${version[side].label}`);
  };

  // Strategy state.
  const kind = s.strategy.kind;
  const rolling = s.strategy.kind === 'rolling' ? resolveRolling(N, s.strategy.maxSurge, s.strategy.maxUnavailable) : undefined;
  const steps = s.strategy.kind === 'canary' ? s.strategy.steps : [];
  let weight: number | undefined = kind === 'blue-green' || kind === 'canary' ? 0 : undefined;
  let completedAt: number | undefined, rolledBackAt: number | undefined, switchAt: number | undefined, abortedStep: number | undefined;
  // A pending gate window and what to do when it ends; canary's current step.
  let window: { step: number; from: number; to: number; requests: number; errors: number } | undefined;
  let verdictAt: number | undefined, lastVerdict: GateResult['verdict'] | undefined;
  let stepIndex = 0, weightAt: number | undefined;
  const gates: GateResult[] = [];

  const schema = new Set(s.schema ?? []);
  const migrations = [...(s.migrations ?? [])].map((m, i) => ({ m, i })).sort((a, b) => a.m.at - b.m.at || a.i - b.i).map(x => x.m);
  const flagOf: Partial<Record<Side, FeatureFlag>> = {};
  for (const f of s.flags ?? []) for (const side of ['from', 'to'] as const) if (version[side].id === f.version) flagOf[side] = f;
  const exposureAt = (f: FeatureFlag, t: number) => [...f.exposure].filter(e => e.at <= t).sort((a, b) => a.at - b.at).at(-1)?.percent ?? 0;
  const carry = new Map<string, number>();
  const errorsOf = (key: string, served: number, permille: number) => {
    const total = served * permille + (carry.get(key) ?? 0);
    carry.set(key, total % 1000);
    return Math.floor(total / 1000);
  };

  const rows: MinuteRow[] = [];
  const done = () => completedAt !== undefined || rolledBackAt !== undefined;
  for (let t = 0; t < s.minutes; t++) {
    const events: string[] = [];
    for (const m of migrations) if (m.at === t) {
      for (const c of m.columns) { if (m.kind === 'expand') schema.add(c); else schema.delete(c); }
      events.push(`結構變更（${m.kind === 'expand' ? '擴充' : '收縮'}）：${m.kind === 'expand' ? '新增' : '刪除'}欄位 ${m.columns.join('、')}`);
    }
    for (const f of s.flags ?? []) {
      const now = exposureAt(f, t);
      if (t === 0 ? now > 0 : now !== exposureAt(f, t - 1)) events.push(`功能旗標「${f.label}」開放 ${now}%`);
    }

    // The strategy acts.
    if (!done()) {
      if (kind === 'recreate') {
        if (t === 0) { remove('from', N, events); add('to', N, t, events); }
      } else if (kind === 'rolling') {
        const { surge, unavailable } = rolling!;
        const old = count('from', t, false), newReady = count('to', t, true);
        const k = Math.min(old, Math.max(0, old + newReady - (N - unavailable)));
        remove('from', k, events);
        const c = Math.min(N - count('to', t, false), Math.max(0, N + surge - (old - k + count('to', t, false))));
        add('to', c, t, events);
      } else if (kind === 'blue-green' && s.strategy.kind === 'blue-green') {
        const { verifyMinutes, keepBlueMinutes } = s.strategy;
        if (t === 0) add('to', N, t, events);
        if (t === start.to + verifyMinutes) {
          weight = 100; switchAt = t; events.push(`流量全部切到 ${s.to.label}`);
          if (s.gate) window = { step: 0, from: t, to: t + keepBlueMinutes - 1, requests: 0, errors: 0 };
        }
        if (switchAt !== undefined && t === switchAt + keepBlueMinutes) {
          if (lastVerdict && lastVerdict !== 'pass') {
            weight = 0; remove('to', count('to', t, false), events, true); rolledBackAt = t; events.push(`回滾：流量切回 ${s.from.label}`);
          } else { remove('from', count('from', t, false), events); completedAt = t; events.push('部署完成'); }
        }
      } else if (kind === 'canary') {
        const startStep = (at: number) => {
          const target = Math.ceil(N * steps[stepIndex].weight / 100), have = count('to', at, false);
          add('to', target - have, at, events);
          weightAt = target > have ? at + start.to : at;
        };
        if (t === 0) startStep(0);
        if (verdictAt === t) {
          verdictAt = undefined;
          if (lastVerdict && lastVerdict !== 'pass') {
            weight = 0; remove('to', count('to', t, false), events, true); rolledBackAt = t; abortedStep = stepIndex + 1;
            events.push(`回滾：第 ${stepIndex + 1} 步的閘門未通過，流量切回 ${s.from.label}`);
          } else if (stepIndex === steps.length - 1) {
            remove('from', count('from', t, false), events); completedAt = t; events.push('部署完成');
          } else { stepIndex++; startStep(t); }
        }
        if (!done() && weightAt === t) {
          const step = steps[stepIndex];
          weight = step.weight; weightAt = undefined;
          events.push(`第 ${stepIndex + 1} 步：${s.to.label} 承接 ${weight}% 流量，觀察 ${step.holdMinutes} 分鐘`);
          verdictAt = t + step.holdMinutes;
          if (s.gate) window = { step: stepIndex + 1, from: t, to: t + step.holdMinutes - 1, requests: 0, errors: 0 };
          else lastVerdict = 'pass';
        }
      }
      if (kind === 'recreate' || kind === 'rolling') {
        if (count('from', t, false) === 0 && count('to', t, true) === N && completedAt === undefined) { completedAt = t; events.push('部署完成'); }
      }
    }

    // Serve the minute's requests.
    const ready = { from: count('from', t, true), to: count('to', t, true) };
    const served = { from: 0, to: 0 };
    if (weight === undefined) {
      const total = Math.min(R, (ready.from + ready.to) * cap);
      [served.from, served.to] = splitByWeights(total, [ready.from, ready.to]);
    } else {
      const [aFrom, aTo] = splitByWeights(R, [100 - weight, weight]);
      served.from = Math.min(aFrom, ready.from * cap);
      served.to = Math.min(aTo, ready.to * cap);
    }
    const dropped = R - served.from - served.to;
    const incompatible = { from: (s.from.requires ?? []).some(c => !schema.has(c)), to: (s.to.requires ?? []).some(c => !schema.has(c)) };
    const feature = { from: 0, to: 0 }, errors = { from: 0, to: 0 };
    const exposure: Record<string, number> = {};
    for (const side of ['from', 'to'] as const) {
      const f = flagOf[side];
      const p = f ? exposureAt(f, t) : 0;
      if (f) exposure[f.id] = p;
      const [plain, flagged] = f ? splitByWeights(served[side], [100 - p, p]) : [served[side], 0];
      feature[side] = flagged;
      const rate = (path: number) => incompatible[side] ? 1000 : path;
      errors[side] = errorsOf(side, plain, rate(version[side].errorPermille)) + (f ? errorsOf(`${side}#${f.id}`, flagged, rate(f.errorPermille)) : 0);
    }
    const instances = {
      from: { ready: ready.from, starting: count('from', t, false) - ready.from },
      to: { ready: ready.to, starting: count('to', t, false) - ready.to },
    };
    const row: MinuteRow = { minute: t, instances, running: pool.length, ...(weight !== undefined ? { weight } : {}), requests: R, served, feature, errors, dropped,
      incompatible, schema: [...schema].sort(), exposure, events };
    rows.push(row);

    // A gate window collects the new version's requests; judged at the end of its last minute.
    if (window && t >= window.from && t <= window.to) {
      window.requests += served.to; window.errors += errors.to;
      if (t === window.to) {
        const g = s.gate!;
        const verdict: GateResult['verdict'] = window.requests < g.minRequests ? 'insufficient'
          : g.metric === 'error-rate' ? (window.errors * 1000 <= g.max * window.requests ? 'pass' : 'fail')
          : (s.to.p95Ms <= g.max ? 'pass' : 'fail');
        lastVerdict = verdict;
        gates.push({ step: window.step, from: window.from, to: window.to, requests: window.requests, errors: window.errors,
          permille: window.requests ? roundHalfUp(window.errors * 1000, window.requests) : 0, p95Ms: s.to.p95Ms, verdict });
        events.push(`閘門${window.step ? `（第 ${window.step} 步）` : ''}：${verdict === 'pass' ? '通過' : verdict === 'fail' ? '未通過' : '樣本不足（視同未通過）'}`);
        window = undefined;
      }
    }
  }

  const sum = (f: (r: MinuteRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const errorsBy = { from: sum(r => r.errors.from), to: sum(r => r.errors.to) };
  const dropped = sum(r => r.dropped);
  return {
    rows,
    outcome: completedAt !== undefined ? 'completed' : rolledBackAt !== undefined ? 'rolled-back' : 'in-progress',
    ...(completedAt !== undefined ? { completedAt } : {}), ...(rolledBackAt !== undefined ? { rolledBackAt } : {}),
    ...(switchAt !== undefined ? { switchAt } : {}), ...(abortedStep !== undefined ? { abortedStep } : {}),
    gates,
    totals: {
      requests: sum(r => r.requests), served: sum(r => r.served.from + r.served.to), dropped,
      errors: errorsBy.from + errorsBy.to, errorsBy, affected: errorsBy.from + errorsBy.to + dropped,
      peakInstances: Math.max(0, ...rows.map(r => r.running)),
      extraInstanceMinutes: sum(r => Math.max(0, r.running - N)),
      droppedMinutes: rows.filter(r => r.dropped > 0).length,
    },
    ...(rolling ? { rolling } : {}),
  };
}

const whole = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/**
 * Problems with a strategy's parameters for a fleet of `instances`, in English (validation) and in Chinese (the explorer's
 * controls and the rollout-plan exercises, where the learner sets them).
 */
export function strategyIssues(st: Strategy, instances: number): { en: string; zh: string }[] {
  const issues: { en: string; zh: string }[] = [];
  const add = (en: string, zh: string) => issues.push({ en, zh });
  switch (st.kind) {
    case 'recreate': break;
    case 'rolling':
      if (!isAmount(st.maxSurge) || !isAmount(st.maxUnavailable)) add('maxSurge and maxUnavailable are counts (whole numbers ≥ 0) or percentages 0%–100%', 'maxSurge 與 maxUnavailable 要填整數個數（≥ 0）或 0%–100% 的百分比。');
      else if (st.maxSurge === 0 && st.maxUnavailable === 0) add('maxSurge and maxUnavailable cannot both be 0', 'maxSurge 與 maxUnavailable 不能同時是 0：既不能多開、也不能少一個，更新就無法前進。');
      else if (typeof st.maxSurge === 'number' && st.maxSurge > instances) add(`maxSurge is at most the fleet (${instances})`, `maxSurge 最多是執行個體總數 ${instances}。`);
      break;
    case 'blue-green':
      if (!whole(st.verifyMinutes, 0, MAX_MINUTES)) add('verifyMinutes is a whole number ≥ 0', '驗證時間要填 0 以上的整數分鐘。');
      if (!whole(st.keepBlueMinutes, 1, MAX_MINUTES)) add('keepBlueMinutes is a whole number ≥ 1', '保留藍色環境的時間要填 1 以上的整數分鐘。');
      break;
    case 'canary': {
      if (!st.steps.length || st.steps.length > MAX_STEPS) add(`a canary has 1…${MAX_STEPS} steps`, `金絲雀發布要有 1 到 ${MAX_STEPS} 步。`);
      st.steps.forEach((x, i) => {
        if (!whole(x.weight, 1, 100)) add(`step ${i + 1}: weight is 1…100`, `第 ${i + 1} 步的流量比例要是 1 到 100 的整數。`);
        if (!whole(x.holdMinutes, 1, MAX_MINUTES)) add(`step ${i + 1}: holdMinutes is a whole number ≥ 1`, `第 ${i + 1} 步的觀察時間要是 1 以上的整數分鐘。`);
        if (i > 0 && !(x.weight > st.steps[i - 1].weight)) add(`step ${i + 1}: weights increase step by step`, `第 ${i + 1} 步的流量比例要比前一步大。`);
      });
      if (st.steps.length && st.steps.at(-1)!.weight !== 100) add('the last step sends 100% of the traffic', '最後一步要把 100% 的流量交給新版本。');
      break;
    }
    default: add(`unknown strategy ${(st as { kind: string }).kind}`, '不認得的部署策略。');
  }
  return issues;
}
export const strategyProblems = (st: Strategy, instances: number) => strategyIssues(st, instances).map(i => i.en);

/** Everything that makes a scenario unusable (the declared strategy must also finish, or roll back, within the timeline). */
export function rolloutProblems(s: RolloutScenario): string[] {
  const problems: string[] = [];
  const { fleet } = s;
  if (!whole(fleet.instances, 1, MAX_INSTANCES)) problems.push(`instances must be 1…${MAX_INSTANCES}`);
  if (!whole(fleet.capacityRpm, 1, 1_000_000)) problems.push('capacityRpm is a whole number ≥ 1');
  if (!whole(fleet.rpm, 0, 1_000_000)) problems.push('rpm is a whole number 0…1,000,000');
  if (!whole(s.minutes, 1, MAX_MINUTES)) problems.push(`minutes must be 1…${MAX_MINUTES}`);
  for (const v of [s.from, s.to]) {
    if (!v.id?.trim() || !v.label?.trim()) problems.push('a version needs an id and a label');
    if (!whole(v.errorPermille, 0, 1000)) problems.push(`version ${v.id}: errorPermille is 0…1000`);
    if (!whole(v.p95Ms, 0, 600_000)) problems.push(`version ${v.id}: p95Ms is a whole number ≥ 0`);
    if (!whole(v.startSeconds, 0, 3600)) problems.push(`version ${v.id}: startSeconds is 0…3600`);
  }
  if (s.from.id === s.to.id) problems.push('the two versions need different ids');
  if (problems.length) return problems;
  problems.push(...strategyProblems(s.strategy, fleet.instances));
  if (s.gate) {
    if (s.gate.metric !== 'error-rate' && s.gate.metric !== 'p95') problems.push(`unknown gate metric ${s.gate.metric}`);
    if (!whole(s.gate.max, 0, s.gate.metric === 'error-rate' ? 1000 : 600_000)) problems.push('the gate max is a whole number (‰ for error-rate, ms for p95)');
    if (!whole(s.gate.minRequests, 0)) problems.push('the gate minRequests is a whole number ≥ 0');
  }
  const columns = new Set(s.schema ?? []);
  if ((s.schema ?? []).length !== columns.size) problems.push('the schema lists a column twice');
  [...(s.migrations ?? [])].sort((a, b) => a.at - b.at).forEach(m => {
    if (!whole(m.at, 0, s.minutes - 1)) problems.push(`a migration happens at a minute of the timeline (0…${s.minutes - 1})`);
    if (m.kind !== 'expand' && m.kind !== 'contract') problems.push(`unknown migration kind ${m.kind}`);
    if (!m.columns.length) problems.push('a migration changes at least one column');
    for (const c of m.columns) {
      if (m.kind === 'expand') { if (columns.has(c)) problems.push(`expand adds ${c}, which already exists`); columns.add(c); }
      else { if (!columns.has(c)) problems.push(`contract drops ${c}, which does not exist`); columns.delete(c); }
    }
  });
  const flagged = new Set<string>(), flagIds = new Set<string>();
  for (const f of s.flags ?? []) {
    if (!f.id?.trim() || !f.label?.trim()) problems.push('a flag needs an id and a label');
    if (flagIds.has(f.id)) problems.push(`duplicate flag ${f.id}`);
    flagIds.add(f.id);
    if (f.version !== s.from.id && f.version !== s.to.id) problems.push(`flag ${f.id}: version ${f.version} is not ${s.from.id} or ${s.to.id}`);
    if (flagged.has(f.version)) problems.push(`flag ${f.id}: a version has at most one flag`);
    flagged.add(f.version);
    if (!whole(f.errorPermille, 0, 1000)) problems.push(`flag ${f.id}: errorPermille is 0…1000`);
    if (!f.exposure.length) problems.push(`flag ${f.id}: needs its exposure schedule`);
    for (const e of f.exposure) if (!whole(e.at, 0, s.minutes - 1) || !whole(e.percent, 0, 100)) problems.push(`flag ${f.id}: exposure is a percent 0…100 from a minute of the timeline`);
    if (new Set(f.exposure.map(e => e.at)).size !== f.exposure.length) problems.push(`flag ${f.id}: two exposure changes at the same minute`);
  }
  if (problems.length) return problems;
  const r = simulateRollout(s);
  if (r.outcome === 'in-progress') problems.push(`the ${s.strategy.kind} rollout neither completes nor rolls back within ${s.minutes} minutes`);
  return problems;
}

/** A strategy in words (for tables, answers and the explorer's summary). */
export function strategyText(st: Strategy): string {
  switch (st.kind) {
    case 'recreate': return '重建（先停舊版，再啟動新版）';
    case 'rolling': return `滾動更新（maxSurge ${st.maxSurge}、maxUnavailable ${st.maxUnavailable}）`;
    case 'blue-green': return `藍綠部署（驗證 ${st.verifyMinutes} 分鐘、保留藍色 ${st.keepBlueMinutes} 分鐘）`;
    case 'canary': return `金絲雀發布（${st.steps.map(x => `${x.weight}%／${x.holdMinutes} 分`).join(' → ')}）`;
  }
}
export const STRATEGY_LABEL: Record<StrategyKind, string> = { recreate: '重建', rolling: '滾動更新', 'blue-green': '藍綠部署', canary: '金絲雀發布' };
