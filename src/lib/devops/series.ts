import { isSeed, mulberry32 } from '@/lib/llm/prng';

/*
 * CICD-0 devops-explorer stage D3 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10): the per-minute metric series of a
 * monitoring dashboard (the monitoring-dashboard activity). An invented teaching model on authored data (示意資料):
 * - Minute t covers [t, t + 1); a dashboard has `minutes` minutes (1–360), each series one whole number ≥ 0 per minute.
 * - Every series is tagged with one of the four golden signals (latency, traffic, errors, saturation) and has a unit.
 * - A series is written out (`values`) or generated from a declared shape (`shape`), so an author need not hand-write
 *   about 180 points. Generation is deterministic: the same shape gives the same values in the server render, the
 *   browser and the tests (the seeded Mulberry32 of src/lib/llm/prng.ts, never Math.random).
 *
 * Generated value at minute t, in this order:
 *   baseline
 *   + noise:  ⌊u_t × (2 × noise + 1)⌋ − noise, with u_t the t-th draw of mulberry32(seed) (one draw per minute, t = 0, 1…),
 *             a whole number in −noise…noise (noise 0 draws nothing)
 *   + each change, in the order declared:
 *       step  { at, delta }:              delta from minute `at` on
 *       ramp  { from, to, delta }:        ⌊delta × (t − from + 1) ÷ (to − from)⌋ for from ≤ t < to, then delta from `to` on
 *       spike { at, minutes, delta }:     delta for at ≤ t < at + minutes, nothing afterwards
 *   then clamped to 0 and above.
 */

export const GOLDEN_SIGNALS = ['latency', 'traffic', 'errors', 'saturation'] as const;
export type GoldenSignal = typeof GOLDEN_SIGNALS[number];
export const SIGNAL_LABEL: Record<GoldenSignal, string> = { latency: '延遲', traffic: '流量', errors: '錯誤', saturation: '飽和度' };
/** What a learner may type for each signal (the English names and common Chinese words). */
export const SIGNAL_ALIASES: Record<GoldenSignal, string[]> = {
  latency: ['latency', '延遲', '回應時間', '延遲時間'],
  traffic: ['traffic', '流量', '請求量'],
  errors: ['errors', 'error', '錯誤', '錯誤率'],
  saturation: ['saturation', '飽和度', '飽和', '使用率'],
};

export const MAX_DASHBOARD_MINUTES = 360;
export const MAX_NOISE = 100_000;
export const MAX_VALUE = 10_000_000;

export type SeriesChange =
  | { kind: 'step'; at: number; delta: number }
  | { kind: 'ramp'; from: number; to: number; delta: number }
  | { kind: 'spike'; at: number; minutes: number; delta: number };
export interface SeriesShape { seed: number; baseline: number; noise?: number; changes?: SeriesChange[] }
export interface MetricSeries {
  id: string;
  label: string;
  /** The unit the values are in (ms, ‰, 個／分鐘, %…). */
  unit: string;
  signal: GoldenSignal;
  /** One whole number ≥ 0 per minute of the dashboard, or… */
  values?: number[];
  /** …the shape it is generated from. */
  shape?: SeriesShape;
}

function changeAt(c: SeriesChange, t: number): number {
  switch (c.kind) {
    case 'step': return t >= c.at ? c.delta : 0;
    case 'ramp': return t < c.from ? 0 : t >= c.to ? c.delta : Math.floor(c.delta * (t - c.from + 1) / (c.to - c.from));
    case 'spike': return t >= c.at && t < c.at + c.minutes ? c.delta : 0;
  }
}

/** The values of a generated series, minute 0 … minutes − 1. */
export function generateSeries(shape: SeriesShape, minutes: number): number[] {
  const noise = shape.noise ?? 0, next = mulberry32(shape.seed);
  return Array.from({ length: minutes }, (_, t) => {
    const jitter = noise ? Math.floor(next() * (2 * noise + 1)) - noise : 0;
    const v = shape.baseline + jitter + (shape.changes ?? []).reduce((sum, c) => sum + changeAt(c, t), 0);
    return Math.max(0, v);
  });
}

/** A series' values (written out or generated). */
export const seriesValues = (s: MetricSeries, minutes: number): number[] => s.values ?? generateSeries(s.shape!, minutes);

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** Everything that makes a series unusable on a dashboard of `minutes` minutes. */
export function seriesProblems(s: MetricSeries, minutes: number): string[] {
  const problems: string[] = [];
  if (!s.id?.trim() || !s.label?.trim() || !s.unit?.trim()) problems.push('needs an id, a label and a unit');
  if (!(GOLDEN_SIGNALS as readonly string[]).includes(s.signal)) problems.push(`signal must be one of ${GOLDEN_SIGNALS.join(', ')}`);
  if (!!s.values === !!s.shape) { problems.push('needs either values or a shape (not both)'); return problems; }
  if (s.values) {
    if (s.values.length !== minutes) problems.push(`has ${s.values.length} values for ${minutes} minutes`);
    if (s.values.some(v => !whole(v, 0, MAX_VALUE))) problems.push(`values are whole numbers 0…${MAX_VALUE}`);
    return problems;
  }
  const sh = s.shape!;
  if (!isSeed(sh.seed)) problems.push('the seed is a whole number 0…4294967295');
  if (!whole(sh.baseline, 0, MAX_VALUE)) problems.push(`the baseline is a whole number 0…${MAX_VALUE}`);
  if (sh.noise !== undefined && !whole(sh.noise, 0, MAX_NOISE)) problems.push(`the noise amplitude is a whole number 0…${MAX_NOISE}`);
  for (const [i, c] of (sh.changes ?? []).entries()) {
    const at = `change ${i + 1} (${c.kind})`;
    if (!whole(c.delta, -MAX_VALUE, MAX_VALUE) || c.delta === 0) problems.push(`${at}: delta is a whole number other than 0`);
    if (c.kind === 'ramp') {
      if (!whole(c.from, 0, minutes - 1) || !whole(c.to, c.from + 1, minutes)) problems.push(`${at}: 0 ≤ from < to ≤ ${minutes}`);
    } else if (!whole(c.at, 0, minutes - 1)) problems.push(`${at}: at is a minute of the dashboard (0…${minutes - 1})`);
    if (c.kind === 'spike' && !whole(c.minutes, 1, minutes)) problems.push(`${at}: lasts 1…${minutes} minutes`);
    if (!['step', 'ramp', 'spike'].includes(c.kind)) problems.push(`${at}: unknown kind`);
  }
  return problems;
}
