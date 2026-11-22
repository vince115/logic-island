import { bpeTableProblems, crossEntropy, decode, encode, perplexity, spelling, trainBpe, tokenCost, vocabulary, type BpeTable, type LogBase } from './bpe';
import { cosine, dot, embeddingSpaceProblems, findVector, nearest, norm, project, type EmbeddingSpace, type Metric } from './embedding';
import { isSeed } from './prng';
import { contextFor, distribution, generate, settingsProblems, toyModelProblems, type DecodeSettings, type ToyModel } from './sampling';

/*
 * LLM-0 (2026-11-22, docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md): the llm-explorer lesson capability. A lesson of
 * the large-language-models or generative-ai island carries explorers (`content.llm`), shown in its sections by id like
 * any example, and exercises checked by value. Everything is computed in the browser from the lesson's own small,
 * authored data (示意資料): a BPE merge table (token-explorer), a recorded toy model of next-token logits
 * (sampling-explorer) and hand-written vectors (embedding-space). There is no real model, API call or key anywhere.
 *
 * Every exercise writes its answer, and says where it comes from (a query on the lesson's explorers); llmContentProblems
 * recomputes each answer from the data, checks that every typical mistake is rejected, and that the explorers' recorded
 * data is consistent (a table whose merges resolve, training that reproduces the table, probabilities that sum to 1,
 * per-token probabilities that match the tokens, vectors with a well-defined projection).
 */

// ---- explorers ----------------------------------------------------------------------------------------------------
/** Recorded per-token probabilities of a text under a model (LLM05: cross-entropy and perplexity). 示意資料. */
export interface TokenScoring { id: string; label: string; text: string; probabilities: number[] }
export interface TokenizerExplorer {
  id: string; title: string; description: string;
  table: BpeTable;
  /** The text shown first; the learner can edit it. */
  text: string;
  /** Other texts offered as buttons. */
  presets?: string[];
  /** Price per 1,000 tokens for the cost estimate (an illustrative price, not any provider's). */
  pricePer1k?: number;
  /** Where the merges come from: training on this corpus must give exactly the table's merges. */
  training?: { corpus: string; minCount?: number };
  scoring?: TokenScoring[];
}
export interface SamplingExplorer {
  id: string; title: string; description: string;
  model: ToyModel;
  /** The tokens generation starts from. */
  prompt: string[];
  settings: DecodeSettings & { seed: number };
  /** At most this many generated tokens (1–40). */
  maxSteps: number;
}
export type EmbeddingExplorer = { id: string; title: string; description: string; space: EmbeddingSpace };

// ---- exercises ----------------------------------------------------------------------------------------------------
/** Where an answer comes from. `explorer` is the id of an explorer of the lesson, of the kind the query needs. */
export type LlmQuery =
  | { of: 'tokens' | 'token-ids'; explorer: string; text: string }
  | { of: 'token-count' | 'byte-count' | 'merge-steps'; explorer: string; text: string }
  | { of: 'decode'; explorer: string; ids: number[] }
  | { of: 'cost'; explorer: string; text: string }
  /** The merge learned at `rank` (0 is the first) from the explorer's training corpus: the merged token. */
  | { of: 'trained-merge'; explorer: string; rank: number }
  | { of: 'cross-entropy'; explorer: string; scoring: string; base: LogBase }
  | { of: 'perplexity'; explorer: string; scoring: string }
  /** The final probability of `token` after `context` with these settings. */
  | { of: 'probability'; explorer: string; context: string[]; token: string; settings: DecodeSettings }
  /** The candidates that survive the settings (a set). */
  | { of: 'kept'; explorer: string; context: string[]; settings: DecodeSettings }
  | { of: 'greedy'; explorer: string; context: string[] }
  /** The tokens generated from the explorer's prompt (in order). */
  | { of: 'generate'; explorer: string; settings: DecodeSettings; seed: number; steps: number }
  | { of: 'cosine' | 'dot'; explorer: string; a: string; b: string }
  | { of: 'norm'; explorer: string; item: string }
  /** The label of the item most similar to `item` (k = 1), or the k most similar in order. */
  | { of: 'nearest'; explorer: string; item: string; k?: number; metric?: Metric }
  | { of: 'projection'; explorer: string; item: string; axis: 'x' | 'y' };

/** A value a query gives: a number, a text, or a list (ids or tokens; ordered or a set). */
export type LlmValue =
  | { type: 'number'; value: number }
  | { type: 'text'; value: string; /** One token's spelling: compared with its spaces (typed ␣), as list items are. */ token?: boolean }
  | { type: 'list'; items: string[]; ordered: boolean; separator: 'space' | 'bar' };

/** A blank to fill: a written answer (text, or a number compared within `tolerance`) and where it comes from. */
export interface LlmBlank { id: string; label: string; query: LlmQuery; answer: string | number; tolerance?: number }
export type LlmExercise = {
  id: string; title: string; statement: string; hints: string[]; explanation: string;
  /** Typical wrong answers, in the same shape as the learner's (see answerKeys); each must fail the check. */
  mistakes: { answer: Record<string, string>; why: string }[];
} & (
  | { kind: 'field'; blank: LlmBlank }
  | { kind: 'number'; blank: LlmBlank }
  | { kind: 'choice'; query: LlmQuery; options: string[]; answer: number; tolerance?: number }
  | { kind: 'table'; blanks: LlmBlank[] }
);

export interface LlmLessonContent {
  tokenizers?: TokenizerExplorer[];
  samplers?: SamplingExplorer[];
  embeddings?: EmbeddingExplorer[];
  exercises: LlmExercise[];
}
export const llmExplorers = (c: LlmLessonContent) => [...c.tokenizers ?? [], ...c.samplers ?? [], ...c.embeddings ?? []];
/** The keys of a learner's answer: `value` (field, number), `choice` (an option's index), or each blank's id (table). */
export const answerKeys = (e: LlmExercise): string[] => e.kind === 'table' ? e.blanks.map(b => b.id) : e.kind === 'choice' ? ['choice'] : ['value'];
export const blanksOf = (e: LlmExercise): LlmBlank[] => e.kind === 'table' ? e.blanks : e.kind === 'choice' ? [] : [e.blank];

const byId = <T extends { id: string }>(list: readonly T[] | undefined, id: string, what: string): T => {
  const found = list?.find(x => x.id === id);
  if (!found) throw new Error(`no ${what} ${id}`);
  return found;
};

/** A query's value, computed from the lesson's explorers; throws when it names something they do not have. */
export function llmQueryValue(q: LlmQuery, c: LlmLessonContent): LlmValue {
  const num = (value: number): LlmValue => ({ type: 'number', value });
  switch (q.of) {
    case 'tokens': case 'token-ids': case 'token-count': case 'byte-count': case 'merge-steps': case 'cost': case 'decode': {
      const t = byId(c.tokenizers, q.explorer, 'tokenizer');
      if (q.of === 'decode') return { type: 'text', value: decode(t.table, q.ids) };
      const e = encode(t.table, q.text);
      if (q.of === 'tokens') return { type: 'list', items: e.ids.map(id => vocabulary(t.table).tokens[id].spelling), ordered: true, separator: 'bar' };
      if (q.of === 'token-ids') return { type: 'list', items: e.ids.map(String), ordered: true, separator: 'space' };
      if (q.of === 'token-count') return num(e.ids.length);
      if (q.of === 'byte-count') return num(e.bytes);
      if (q.of === 'merge-steps') return num(e.steps.length);
      if (t.pricePer1k === undefined) throw new Error(`tokenizer ${t.id} has no price`);
      return num(tokenCost(e.ids.length, t.pricePer1k));
    }
    case 'trained-merge': {
      const t = byId(c.tokenizers, q.explorer, 'tokenizer');
      if (!t.training) throw new Error(`tokenizer ${t.id} has no training corpus`);
      const step = trainBpe(t.training.corpus, t.table.merges.length, { minCount: t.training.minCount, pretokenize: t.table.pretokenize }).steps[q.rank];
      if (!step) throw new Error(`training learns no merge ${q.rank}`);
      return { type: 'text', value: step.merged, token: true };
    }
    case 'cross-entropy': case 'perplexity': {
      const s = byId(byId(c.tokenizers, q.explorer, 'tokenizer').scoring, q.scoring, 'scoring');
      return num(q.of === 'perplexity' ? perplexity(s.probabilities) : crossEntropy(s.probabilities, q.base));
    }
    case 'probability': case 'kept': case 'greedy': {
      const s = byId(c.samplers, q.explorer, 'sampler');
      const ctx = s.model.contexts.find(x => JSON.stringify(x.context) === JSON.stringify(q.context));
      if (!ctx) throw new Error(`sampler ${s.id} has no context [${q.context.join(' ')}]`);
      if (q.of === 'greedy') return { type: 'text', value: distribution(ctx.candidates, { temperature: 0 }).find(r => r.kept)!.token, token: true };
      const p = settingsProblems(q.settings);
      if (p.length) throw new Error(p.join('; '));
      const rows = distribution(ctx.candidates, q.settings);
      if (q.of === 'kept') return { type: 'list', items: rows.filter(r => r.kept).map(r => r.token), ordered: false, separator: 'bar' };
      const row = rows.find(r => r.token === q.token);
      if (!row) throw new Error(`context [${q.context.join(' ')}] has no candidate ${q.token}`);
      return num(row.probability);
    }
    case 'generate': {
      const s = byId(c.samplers, q.explorer, 'sampler');
      const p = settingsProblems(q.settings);
      if (p.length) throw new Error(p.join('; '));
      if (!Number.isInteger(q.steps) || q.steps < 1 || q.steps > s.maxSteps) throw new Error(`steps must be 1…${s.maxSteps}`);
      return { type: 'list', items: generate(s.model, s.prompt, q.settings, q.seed, q.steps).steps.map(x => x.token), ordered: true, separator: 'bar' };
    }
    case 'cosine': case 'dot': case 'norm': case 'nearest': case 'projection': {
      const space = byId(c.embeddings, q.explorer, 'embedding space').space;
      if (q.of === 'norm') return num(norm(findVector(space, q.item).vector));
      if (q.of === 'projection') { findVector(space, q.item); return num(project(space).points[q.item][q.axis === 'x' ? 0 : 1]); }
      if (q.of !== 'nearest') { const a = findVector(space, q.a).vector, b = findVector(space, q.b).vector; return num(q.of === 'cosine' ? cosine(a, b) : dot(a, b)); }
      const k = q.k ?? 1, found = nearest(space, q.item, k, q.metric);
      return k === 1 ? { type: 'text', value: found[0].label } : { type: 'list', items: found.map(n => n.label), ordered: true, separator: 'bar' };
    }
  }
}

// ---- checking -----------------------------------------------------------------------------------------------------
/** Text compared without surrounding or repeated whitespace; ␣ (how the page shows a space in a token) is a space. */
const normText = (s: string) => s.normalize('NFC').replace(/␣/g, ' ').replace(/\s+/g, ' ').trim();
/** A number as the learner may type it: full-width digits, a percent sign, spaces around. */
export function parseNumber(text: string): number | undefined {
  const t = text.normalize('NFKC').replace(/\s+/g, '').replace(/，/g, ',');
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%?)$/i.exec(t);
  if (!m) return undefined;
  return Number(m[1]) / (m[2] ? 100 : 1);
}
/**
 * A token as typed: spaces around it are separators, while ␣ and ↵ (how the page shows a space or a line break inside a
 * token) are part of it. A token's leading space matters in BPE: ` low` and `low` are different tokens.
 */
const normToken = (s: string) => s.normalize('NFC').trim().replace(/␣/g, ' ').replace(/↵/g, '\n');
/** A token as the page shows it (and as the learner types it): a space as ␣, a line break as ↵. */
const shownToken = (s: string) => s.replace(/ /g, '␣').replace(/\n/g, '↵');
/** A list as typed: ids split on spaces, commas, 、 or |; tokens on |, 、 or line breaks (write a space in a token as ␣). */
export const splitList = (text: string, separator: 'space' | 'bar') => separator === 'space'
  ? text.split(/[\s,，、|]+/).map(normText).filter(Boolean)
  : text.split(/[|、\n]+/).map(normToken).filter(t => t.length > 0);

/** Whether a typed answer gives the value (a number within `tolerance`, the same text, the same list). */
export function matchesValue(value: LlmValue, text: string, tolerance = 0): boolean {
  if (value.type === 'number') { const x = parseNumber(text); return x !== undefined && Math.abs(x - value.value) <= tolerance + 1e-12; }
  if (value.type === 'text') return value.token ? normToken(text) === value.value.normalize('NFC') : normText(text) === normText(value.value);
  // Tokens keep their spaces (typed as ␣); ids are compared as text.
  const got = splitList(text, value.separator), want = value.separator === 'space' ? value.items.map(normText).filter(Boolean) : value.items.map(i => i.normalize('NFC')).filter(t => t.length > 0);
  if (!value.ordered) { got.sort(); want.sort(); }
  return got.length === want.length && got.every((g, i) => g === want[i]);
}

/** The shape of a query's value, known without the data: what the learner types and how it is compared. */
export type LlmShape = { type: 'number' } | { type: 'text'; token?: boolean } | { type: 'list'; ordered: boolean; separator: 'space' | 'bar' };
export function shapeOf(q: LlmQuery): LlmShape {
  switch (q.of) {
    case 'tokens': case 'generate': return { type: 'list', ordered: true, separator: 'bar' };
    case 'kept': return { type: 'list', ordered: false, separator: 'bar' };
    case 'token-ids': return { type: 'list', ordered: true, separator: 'space' };
    case 'nearest': return (q.k ?? 1) > 1 ? { type: 'list', ordered: true, separator: 'bar' } : { type: 'text' };
    case 'trained-merge': case 'greedy': return { type: 'text', token: true };
    case 'decode': return { type: 'text' };
    default: return { type: 'number' };
  }
}

/** A blank's written answer as a value (a list parsed the way the learner's is). */
function writtenValue(blank: LlmBlank): LlmValue {
  const shape = shapeOf(blank.query);
  if (typeof blank.answer === 'number') return { type: 'number', value: blank.answer };
  if (shape.type === 'list') return { ...shape, items: splitList(blank.answer, shape.separator) };
  return shape.type === 'text' && shape.token ? { type: 'text', value: normToken(blank.answer), token: true } : { type: 'text', value: blank.answer };
}

/** Checks a learner's answer against the exercise's written answers (llmContentProblems proves they follow from the data). */
export function checkLlmAnswer(e: LlmExercise, answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  if (e.kind === 'choice') {
    const chosen = answer.choice?.trim();
    if (!chosen) messages.push('還沒有選擇答案。');
    else if (Number(chosen) !== e.answer) messages.push(`「${e.options[Number(chosen)] ?? chosen}」不對：回到探索器，用題目的設定再看一次。`);
    return { ok: !messages.length, messages };
  }
  for (const b of blanksOf(e)) {
    const got = answer[e.kind === 'table' ? b.id : 'value'] ?? '', label = b.label.replace(/`/g, '');
    if (!got.trim()) { messages.push(`還沒有填「${label}」。`); continue; }
    const want = writtenValue(b);
    if (want.type === 'number' && parseNumber(got) === undefined) messages.push(`「${label}」要填一個數字（可以用小數，例如 0.25，或百分比 25%）。`);
    else if (!matchesValue(want, got, b.tolerance ?? 0)) messages.push(`「${label}」不對：回到探索器，照題目的設定再算一次。`);
  }
  return { ok: !messages.length, messages };
}
/** The reference answer as the learner would type it. */
export function referenceAnswer(e: LlmExercise): Record<string, string> {
  if (e.kind === 'choice') return { choice: String(e.answer) };
  if (e.kind === 'table') return Object.fromEntries(e.blanks.map(b => [b.id, String(b.answer)]));
  return { value: String(e.blank.answer) };
}

// ---- validation ---------------------------------------------------------------------------------------------------
export const MAX_GENERATION = 40;

function tokenizerProblems(t: TokenizerExplorer): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`tokenizer ${t.id}: ${what}`);
  const tableProblems = bpeTableProblems(t.table);
  for (const p of tableProblems) fail(p);
  if (tableProblems.length) return problems;
  if (!t.text.trim()) fail('needs a text');
  for (const p of t.presets ?? []) if (!p.trim()) fail('has an empty preset');
  if (t.pricePer1k !== undefined && !(t.pricePer1k > 0 && Number.isFinite(t.pricePer1k))) fail('the price per 1,000 tokens must be a positive number');
  if (t.training) {
    if (!t.training.corpus.trim()) fail('training needs a corpus');
    const learned = trainBpe(t.training.corpus, t.table.merges.length, { minCount: t.training.minCount, pretokenize: t.table.pretokenize }).merges;
    const want = t.table.merges.map(([l, r]) => `${l} + ${r}`), got = learned.map(([l, r]) => `${l} + ${r}`);
    const at = want.findIndex((m, i) => m !== got[i]);
    if (at >= 0) fail(`training on the corpus gives ${got[at] === undefined ? 'no merge' : `"${got[at]}"`} at rank ${at}, but the table has "${want[at]}"`);
  }
  const scorings = new Set<string>();
  for (const s of t.scoring ?? []) {
    if (scorings.has(s.id)) fail(`duplicate scoring ${s.id}`);
    scorings.add(s.id);
    if (!s.label.trim()) fail(`scoring ${s.id} needs a label`);
    const n = encode(t.table, s.text).ids.length;
    if (s.probabilities.length !== n) fail(`scoring ${s.id} has ${s.probabilities.length} probabilities for ${n} tokens`);
    if (s.probabilities.some(p => !(p > 0 && p <= 1))) fail(`scoring ${s.id} has a probability outside (0, 1]`);
  }
  // Every spelling must say the same bytes back (a literal "<0x41>" in a merge would not).
  for (const tok of vocabulary(t.table).tokens) if (!tok.special && spelling(tok.bytes) !== tok.spelling) fail(`token ${tok.id} cannot be written back`);
  return problems;
}

function samplerProblems(s: SamplingExplorer): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`sampler ${s.id}: ${what}`);
  for (const p of toyModelProblems(s.model)) fail(p);
  for (const p of settingsProblems(s.settings)) fail(p);
  if (!isSeed(s.settings.seed)) fail(`seed ${s.settings.seed} must be an integer 0…4294967295`);
  if (!Number.isInteger(s.maxSteps) || s.maxSteps < 1 || s.maxSteps > MAX_GENERATION) fail(`maxSteps must be 1…${MAX_GENERATION}`);
  if (!problems.length && !contextFor(s.model, s.prompt)) fail('no context matches the prompt, so nothing can be generated');
  return problems;
}

/**
 * Everything the validator checks in `content.llm` (validateContent wires it in): unique ids, consistent explorers, and
 * exercises whose written answers follow from the data and whose typical mistakes are rejected.
 */
export function llmContentProblems(c: LlmLessonContent): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) problems.push(`duplicate id ${id}`); ids.add(id); };
  const explorers = llmExplorers(c);
  if (!explorers.length) problems.push('an llm-explorer lesson needs at least one explorer');
  for (const x of explorers) {
    unique(x.id);
    if (!x.title.trim() || !x.description.trim()) problems.push(`explorer ${x.id} needs a title and a description`);
  }
  for (const t of c.tokenizers ?? []) problems.push(...tokenizerProblems(t));
  for (const s of c.samplers ?? []) problems.push(...samplerProblems(s));
  for (const e of c.embeddings ?? []) problems.push(...embeddingSpaceProblems(e.space).map(p => `embedding space ${e.id}: ${p}`));
  if (problems.length) return problems;

  for (const e of c.exercises) {
    unique(e.id);
    const fail = (what: string) => problems.push(`exercise ${e.id}: ${what}`);
    if (!e.title.trim() || !e.statement.trim()) fail('needs a title and a statement');
    if (!e.hints.length || e.hints.some(h => !h.trim())) fail('needs hints');
    if (!e.explanation.trim()) fail('needs an explanation');
    if (!e.mistakes.length) fail('needs at least one typical mistake (it shows the check rejects it)');
    const keys = answerKeys(e);
    if (e.kind === 'table') {
      if (!e.blanks.length) fail('a table needs blanks');
      if (new Set(keys).size !== keys.length || keys.some(k => k === 'value' || k === 'choice')) fail('blank ids must be distinct (and not value or choice)');
    }
    let sound = true;
    for (const b of blanksOf(e)) {
      try {
        const derived = llmQueryValue(b.query, c);
        if (!b.label.trim()) fail(`blank ${b.id} needs a label`);
        if ((typeof b.answer === 'number') !== (derived.type === 'number')) {
          fail(`blank ${b.id}: the query gives a ${derived.type}, so the answer is ${derived.type === 'number' ? 'a number' : 'text'}`); sound = false; continue;
        }
        if (e.kind === 'number' && derived.type !== 'number') fail(`blank ${b.id}: a number exercise asks for a number`);
        if (e.kind === 'field' && derived.type === 'number') fail(`blank ${b.id}: a numeric answer is a number exercise`);
        if (derived.type === 'number') {
          const tol = b.tolerance ?? 0, answer = b.answer as number;
          if (!(tol >= 0) || (!Number.isInteger(derived.value) && !(tol > 0))) { fail(`blank ${b.id}: a non-integer answer needs a tolerance > 0`); sound = false; continue; }
          if (!(Math.abs(answer - derived.value) <= tol / 2 + 1e-12)) { fail(`blank ${b.id}: the answer ${answer} does not follow from the data (${derived.value}; it must be within half the tolerance ${tol})`); sound = false; }
        } else {
          const written = writtenValue(b);
          // Rejoined as the learner types it: a token's spaces and line breaks as ␣ and ↵, so they are not trimmed away.
          const text = written.type === 'list' ? (written.separator === 'space' ? written.items.join(' ') : written.items.map(shownToken).join('|')) : String(b.answer);
          if (!matchesValue(derived, text)) { fail(`blank ${b.id}: the answer "${b.answer}" does not follow from the data (${derived.type === 'list' ? derived.items.join(' | ') : derived.value})`); sound = false; }
        }
      } catch (err) { fail(`blank ${b.id}: ${(err as Error).message}`); sound = false; }
    }
    if (e.kind === 'choice') {
      try {
        const derived = llmQueryValue(e.query, c);
        if (e.options.length < 2 || new Set(e.options.map(o => o.normalize('NFC').trim())).size !== e.options.length) fail('needs at least two distinct options');
        if (!Number.isInteger(e.answer) || e.answer < 0 || e.answer >= e.options.length) { fail('the answer is not one of the options'); sound = false; }
        const matching = e.options.flatMap((o, i) => matchesValue(derived, o, e.tolerance ?? 0) ? [i] : []);
        if (matching.length !== 1 || matching[0] !== e.answer) { fail(`the data makes ${matching.length ? matching.map(i => `"${e.options[i]}"`).join(', ') : 'no option'} right, not only "${e.options[e.answer]}"`); sound = false; }
      } catch (err) { fail((err as Error).message); sound = false; }
    }
    if (!sound) continue;
    if (!checkLlmAnswer(e, referenceAnswer(e)).ok) fail('the reference answer fails its own check');
    for (const m of e.mistakes) {
      const unknown = Object.keys(m.answer).filter(k => !keys.includes(k));
      if (unknown.length) fail(`the typical mistake "${m.why}" answers ${unknown.join(', ')}, which the exercise does not ask`);
      else if (checkLlmAnswer(e, m.answer).ok) fail(`the typical mistake "${m.why}" passes the check`);
      if (!m.why.trim()) fail('a typical mistake needs its reason');
    }
  }
  return problems;
}
