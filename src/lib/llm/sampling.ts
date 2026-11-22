import { isSeed, mulberry32 } from './prng';

/*
 * LLM-0 (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md §3.2): the sampling-explorer's engine. A lesson records a toy
 * "model": for a few contexts, the next-token candidates with their logits (or probabilities). Nothing here is a real
 * model's output (示意資料). The decoding settings work as in common implementations (Hugging Face's logits warpers):
 *
 * 1. temperature T > 0: p = softmax(logits / T) (the maximum is subtracted first, which does not change the result).
 *    T = 0 is greedy decoding: the argmax (the first listed candidate on a tie) gets probability 1.
 * 2. Candidates are sorted by that probability, highest first (a tie keeps the listed order).
 * 3. top-k (k ≥ 1; 0 is off): only the first k stay; the rest get 0 and the kept ones are renormalised.
 * 4. top-p (0 < p ≤ 1; 1 is off): the smallest prefix of the sorted, renormalised list whose cumulative probability
 *    reaches p stays (so the candidate that crosses p is kept, and at least one always is); renormalised again.
 *
 * Sampling draws u from the seeded generator (prng.ts) and walks the kept candidates in sorted order, adding up their
 * probabilities; the first candidate whose running total exceeds u is chosen. Every sampling step draws exactly one u
 * (even when one candidate is left), and greedy decoding draws none, so a seed gives one fixed sequence of choices.
 * Probabilities recorded instead of logits are read as logits ln p (so T = 1 gives them back).
 */

export interface Candidate { token: string; logit?: number; probability?: number }
/** The candidates after one context: the tokens that came before (the last ones; [] matches any text). */
export interface ToyContext { context: string[]; candidates: Candidate[] }
export interface ToyModel {
  contexts: ToyContext[];
  /** Generation stops after this token, e.g. `<|endoftext|>`. */
  end?: string;
}
export interface DecodeSettings { temperature: number; topK?: number; topP?: number }

export interface DistributionRow {
  token: string;
  /** Position in the recorded list. */
  index: number;
  logit: number;
  /** softmax at T = 1 (the recorded distribution). */
  base: number;
  /** softmax at the chosen temperature (before top-k and top-p). */
  scaled: number;
  kept: boolean;
  /** Why a candidate was cut: top-k, top-p or greedy. */
  cut?: 'top-k' | 'top-p' | 'greedy';
  /** The final probability (0 for a cut candidate). */
  probability: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
/** softmax(logits / T), T > 0, with the maximum subtracted first for numerical stability. */
export function softmax(logits: readonly number[], temperature = 1): number[] {
  if (!(temperature > 0)) throw new Error(`temperature ${temperature} must be > 0 (0 is greedy decoding)`);
  if (!logits.length) return [];
  const scaled = logits.map(l => l / temperature), max = Math.max(...scaled);
  const e = scaled.map(s => Math.exp(s - max)), z = sum(e);
  return e.map(x => x / z);
}
/** The argmax; the first one on a tie. */
export const argmax = (xs: readonly number[]) => xs.reduce((best, x, i) => x > xs[best] ? i : best, 0);

export const logitsOf = (candidates: readonly Candidate[]) => candidates.map(c => c.logit ?? Math.log(c.probability!));

/** A small slack for comparing a running total with top-p (sums of decimals are not exact in floating point). */
const EPS = 1e-12;

/** The distribution after temperature, top-k and top-p, sorted by the scaled probability (see the module comment). */
export function distribution(candidates: readonly Candidate[], { temperature, topK = 0, topP = 1 }: DecodeSettings): DistributionRow[] {
  const logits = logitsOf(candidates), base = softmax(logits, 1);
  const greedy = temperature === 0;
  const scaled = greedy ? base : softmax(logits, temperature);
  const rows: DistributionRow[] = candidates.map((c, index) => ({ token: c.token, index, logit: logits[index], base: base[index], scaled: scaled[index], kept: true, probability: 0 }));
  rows.sort((a, b) => b.scaled - a.scaled || a.index - b.index);
  if (greedy) {
    const top = argmax(logits);
    for (const r of rows) { r.kept = r.index === top; r.probability = r.kept ? 1 : 0; if (!r.kept) r.cut = 'greedy'; }
    return rows;
  }
  if (topK > 0) rows.forEach((r, i) => { if (i >= topK) { r.kept = false; r.cut = 'top-k'; } });
  let kept = rows.filter(r => r.kept), z = sum(kept.map(r => r.scaled));
  if (topP < 1) {
    let running = 0, done = false;
    for (const r of kept) {
      if (done) { r.kept = false; r.cut = 'top-p'; continue; }
      running += r.scaled / z;
      if (running >= topP - EPS) done = true;
    }
    kept = rows.filter(r => r.kept);
    z = sum(kept.map(r => r.scaled));
  }
  for (const r of kept) r.probability = r.scaled / z;
  return rows;
}

/** The kept candidate chosen by u ∈ [0, 1): the first, in sorted order, whose running total exceeds u. */
export function pick(rows: readonly DistributionRow[], u: number): DistributionRow {
  const kept = rows.filter(r => r.kept);
  let running = 0;
  for (const r of kept) { running += r.probability; if (u < running) return r; }
  return kept[kept.length - 1];
}

/** The longest recorded context that the tokens end with (contexts of the same length: the first listed). */
export function contextFor(model: ToyModel, tokens: readonly string[]): ToyContext | undefined {
  let best: ToyContext | undefined;
  for (const c of model.contexts) {
    if (c.context.length > tokens.length) continue;
    const tail = tokens.slice(tokens.length - c.context.length);
    if (c.context.every((t, i) => t === tail[i]) && (!best || c.context.length > best.context.length)) best = c;
  }
  return best;
}

export interface GenerationStep {
  context: string[];
  rows: DistributionRow[];
  /** The random number drawn for this step (none when greedy). */
  u?: number;
  token: string;
}
export interface Generation {
  steps: GenerationStep[];
  /** The prompt and the generated tokens. */
  tokens: string[];
  stop: 'end' | 'no-context' | 'max-steps';
}

/**
 * Generates token by token: at each step the longest matching context gives the candidates, the settings give the
 * distribution, and the token is the argmax (T = 0) or picked with the next number of the seeded generator. Stops after
 * the end token, when no context matches, or after `maxSteps` tokens.
 */
export function generate(model: ToyModel, prompt: readonly string[], settings: DecodeSettings, seed: number, maxSteps: number): Generation {
  if (!isSeed(seed)) throw new Error(`seed ${seed} must be an integer 0…4294967295`);
  const next = mulberry32(seed), tokens = [...prompt], steps: GenerationStep[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const context = contextFor(model, tokens);
    if (!context) return { steps, tokens, stop: 'no-context' };
    const rows = distribution(context.candidates, settings);
    const greedy = settings.temperature === 0;
    const u = greedy ? undefined : next();
    const chosen = greedy ? rows.find(r => r.kept)! : pick(rows, u!);
    steps.push({ context: context.context, rows, ...(u === undefined ? {} : { u }), token: chosen.token });
    tokens.push(chosen.token);
    if (model.end !== undefined && chosen.token === model.end) return { steps, tokens, stop: 'end' };
  }
  return { steps, tokens, stop: 'max-steps' };
}

/** A context's problems: too few candidates, repeated tokens, logits that are not numbers, probabilities that do not sum to 1. */
export function toyModelProblems(model: ToyModel): string[] {
  const problems: string[] = [];
  if (!model.contexts.length) problems.push('needs at least one context');
  const seen = new Set<string>();
  for (const c of model.contexts) {
    const name = `context [${c.context.join(' ')}]`;
    const k = JSON.stringify(c.context);
    if (seen.has(k)) problems.push(`${name} is listed twice`);
    seen.add(k);
    if (c.candidates.length < 2) problems.push(`${name} needs at least two candidates`);
    if (new Set(c.candidates.map(x => x.token)).size !== c.candidates.length) problems.push(`${name} repeats a candidate`);
    if (c.candidates.some(x => !x.token)) problems.push(`${name} has an empty token`);
    const logits = c.candidates.filter(x => x.logit !== undefined).length, probs = c.candidates.filter(x => x.probability !== undefined).length;
    if (!(logits === c.candidates.length && !probs) && !(probs === c.candidates.length && !logits)) { problems.push(`${name}: give every candidate a logit, or every candidate a probability`); continue; }
    if (logits && c.candidates.some(x => !Number.isFinite(x.logit))) problems.push(`${name} has a logit that is not a finite number`);
    if (probs) {
      if (c.candidates.some(x => !(x.probability! > 0 && x.probability! <= 1))) problems.push(`${name} has a probability outside (0, 1]`);
      else { const total = sum(c.candidates.map(x => x.probability!)); if (Math.abs(total - 1) > 1e-6) problems.push(`${name}: the probabilities sum to ${+total.toFixed(6)}, not 1`); }
    }
  }
  return problems;
}

export const TEMPERATURE_MAX = 3;
/** Settings a lesson may start from or ask about: T in [0, 3], k ≥ 0 (0 is off), p in (0, 1]. */
export function settingsProblems({ temperature, topK = 0, topP = 1 }: DecodeSettings): string[] {
  const problems: string[] = [];
  if (!(temperature >= 0 && temperature <= TEMPERATURE_MAX)) problems.push(`temperature ${temperature} must be in 0…${TEMPERATURE_MAX}`);
  if (!Number.isInteger(topK) || topK < 0) problems.push(`top-k ${topK} must be an integer ≥ 0`);
  if (!(topP > 0 && topP <= 1)) problems.push(`top-p ${topP} must be in (0, 1]`);
  return problems;
}
