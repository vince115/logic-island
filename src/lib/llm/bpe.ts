/*
 * LLM-0 (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md §3.1): a byte-level BPE tokenizer driven by a lesson's own
 * merge table, the token-explorer's engine. Pure and deterministic; the tables are small and authored for teaching
 * (示意資料), never a real model's vocabulary.
 *
 * - Text is UTF-8 bytes: one CJK character is three bytes, so it starts as three byte tokens and needs merges to become one.
 * - The vocabulary is fixed by the table: ids 0–255 are the 256 bytes, then one id per merge in rank order
 *   (256 + rank), then the special tokens in the order listed.
 * - A token is written (its *spelling*) as text, with `<0xHH>` for a byte that is not part of a whole UTF-8 character
 *   (`<0xE5><0xAD>` is the first two bytes of 學). `<0xHH>` in a spelling always means that byte.
 * - Special tokens (`<|endoftext|>`) are matched in the text before anything else and are never split or merged.
 * - The rest of the text is cut into pre-tokens (`words`: an optional leading space and a run of letters, of digits or of
 *   other symbols, or whitespace, like GPT-2's pattern without its English contractions; `none`: the whole segment), and
 *   merges never cross a pre-token.
 * - Encoding applies the merges in rank order: while some adjacent pair has a rank, the pair with the lowest rank is
 *   merged everywhere it occurs (left to right, without overlap). Each such merge is one step of the trace.
 */

// ---- UTF-8 --------------------------------------------------------------------------------------------------------
const encoder = new TextEncoder();
export const utf8 = (text: string): number[] => [...encoder.encode(text)];
const hex = (b: number) => `<0x${b.toString(16).toUpperCase().padStart(2, '0')}>`;

/** Bytes as text: whole UTF-8 characters as themselves, any other byte as `<0xHH>` (never throws). */
export function bytesToText(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    const length = b < 0x80 ? 1 : b >= 0xC2 && b <= 0xDF ? 2 : b >= 0xE0 && b <= 0xEF ? 3 : b >= 0xF0 && b <= 0xF4 ? 4 : 0;
    const tail = bytes.slice(i + 1, i + length);
    if (length && tail.length === length - 1 && tail.every(c => c >= 0x80 && c <= 0xBF)) {
      let cp = length === 1 ? b : b & (0xFF >> (length + 1));
      for (const c of tail) cp = (cp << 6) | (c & 0x3F);
      // Overlong forms, surrogates and code points above U+10FFFF are not characters.
      const min = [0, 0, 0x80, 0x800, 0x10000][length];
      if (cp >= min && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) { out += String.fromCodePoint(cp); i += length; continue; }
    }
    out += hex(b);
    i += 1;
  }
  return out;
}

/** A spelling's bytes: `<0xHH>` is that byte, every other character its UTF-8 bytes. */
export function spellingBytes(spelling: string): number[] {
  const bytes: number[] = [];
  for (const part of spelling.split(/(<0x[0-9A-Fa-f]{2}>)/)) {
    if (!part) continue;
    if (/^<0x[0-9A-Fa-f]{2}>$/.test(part)) bytes.push(parseInt(part.slice(3, 5), 16));
    else bytes.push(...utf8(part));
  }
  return bytes;
}
export const spelling = (bytes: readonly number[]) => bytesToText(bytes);

// ---- tables -------------------------------------------------------------------------------------------------------
export const PRETOKENIZERS = ['words', 'none'] as const;
export type Pretokenizer = typeof PRETOKENIZERS[number];
/** GPT-2's pre-tokenizer without the English contractions (\p{L} letters, including CJK; \p{N} digits). */
const WORDS = / ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
export function pretokenize(text: string, mode: Pretokenizer = 'words'): string[] {
  if (!text) return [];
  return mode === 'none' ? [text] : text.match(WORDS) ?? [];
}

/** A lesson's tokenizer: merges in rank order (each a pair of token spellings) and special tokens. 示意資料. */
export interface BpeTable {
  merges: [string, string][];
  /** Special tokens, e.g. `<|endoftext|>`; their ids follow the merges. */
  special?: string[];
  pretokenize?: Pretokenizer;
}

export interface VocabToken { id: number; bytes: number[]; spelling: string; special: boolean; /** The merge that made it (256 + rank). */ rank?: number }
export interface Vocabulary {
  tokens: VocabToken[];
  /** "left,right" → rank. */
  ranks: Map<string, number>;
  byBytes: Map<string, number>;
  special: Map<string, number>;
}
const key = (bytes: readonly number[]) => bytes.join(',');

/** The table's problems: spellings that do not resolve, merges of tokens that do not exist yet, repeated tokens. */
export function bpeTableProblems(table: BpeTable): string[] {
  const problems: string[] = [];
  if (!Array.isArray(table.merges)) return ['merges must be a list'];
  if (table.pretokenize && !(PRETOKENIZERS as readonly string[]).includes(table.pretokenize)) problems.push(`unknown pre-tokenizer ${table.pretokenize}`);
  const known = new Set<string>(Array.from({ length: 256 }, (_, b) => key([b])));
  table.merges.forEach(([left, right], rank) => {
    const l = spellingBytes(left), r = spellingBytes(right);
    if (!l.length || !r.length) { problems.push(`merge ${rank} has an empty side`); return; }
    if (!known.has(key(l))) problems.push(`merge ${rank} (${left} + ${right}): ${left} is not a token before it`);
    if (!known.has(key(r))) problems.push(`merge ${rank} (${left} + ${right}): ${right} is not a token before it`);
    const merged = key([...l, ...r]);
    if (known.has(merged)) problems.push(`merge ${rank} (${left} + ${right}) makes a token that already exists`);
    known.add(merged);
  });
  const special = table.special ?? [];
  if (new Set(special).size !== special.length) problems.push('a special token is listed twice');
  for (const s of special) if (!s.trim() || /\s/.test(s)) problems.push(`special token "${s}" must be non-empty without spaces`);
  return problems;
}

const vocabularies = new WeakMap<BpeTable, Vocabulary>();
/** The table's vocabulary (bytes, merges, special tokens); throws on a table with problems. Cached per table object. */
export function vocabulary(table: BpeTable): Vocabulary {
  const cached = vocabularies.get(table);
  if (cached) return cached;
  const problems = bpeTableProblems(table);
  if (problems.length) throw new Error(`invalid BPE table: ${problems.join('; ')}`);
  const tokens: VocabToken[] = Array.from({ length: 256 }, (_, b) => ({ id: b, bytes: [b], spelling: bytesToText([b]), special: false }));
  const ranks = new Map<string, number>(), byBytes = new Map<string, number>(tokens.map(t => [key(t.bytes), t.id]));
  table.merges.forEach(([left, right], rank) => {
    const l = byBytes.get(key(spellingBytes(left)))!, r = byBytes.get(key(spellingBytes(right)))!;
    const bytes = [...tokens[l].bytes, ...tokens[r].bytes], id = 256 + rank;
    tokens.push({ id, bytes, spelling: bytesToText(bytes), special: false, rank });
    ranks.set(`${l},${r}`, rank);
    byBytes.set(key(bytes), id);
  });
  const special = new Map<string, number>();
  for (const s of table.special ?? []) {
    const id = tokens.length;
    tokens.push({ id, bytes: utf8(s), spelling: s, special: true });
    special.set(s, id);
  }
  const v = { tokens, ranks, byBytes, special };
  vocabularies.set(table, v);
  return v;
}

// ---- encoding -----------------------------------------------------------------------------------------------------
export interface MergeStep {
  rank: number;
  left: number; right: number; merged: number;
  /** How many times the pair was merged in this step. */
  count: number;
  /** Every token id after this step. */
  ids: number[];
}
export interface Encoding {
  ids: number[];
  /** Token ids before any merge: the bytes (and the special tokens). */
  start: number[];
  steps: MergeStep[];
  bytes: number;
}

/** Splits the text at special tokens (the leftmost match, the longest when two start at the same place). */
function splitSpecial(text: string, special: Map<string, number>): ({ special: number } | { text: string })[] {
  const names = [...special.keys()].sort((a, b) => b.length - a.length);
  const parts: ({ special: number } | { text: string })[] = [];
  let rest = text;
  while (rest) {
    let at = -1, found = '';
    for (const n of names) { const i = rest.indexOf(n); if (i >= 0 && (at < 0 || i < at)) { at = i; found = n; } }
    if (at < 0) { parts.push({ text: rest }); break; }
    if (at > 0) parts.push({ text: rest.slice(0, at) });
    parts.push({ special: special.get(found)! });
    rest = rest.slice(at + found.length);
  }
  return parts;
}

/** Merges every non-overlapping occurrence of (left, right), left to right; returns how many. */
function mergePair(word: number[], left: number, right: number, merged: number): number {
  let count = 0;
  for (let i = 0; i < word.length - 1; i++) if (word[i] === left && word[i + 1] === right) { word.splice(i, 2, merged); count++; }
  return count;
}

/** Encodes text with the table, with every merge step (see the module comment for the rules). */
export function encode(table: BpeTable, text: string): Encoding {
  const v = vocabulary(table);
  // Each pre-token is a "word" of ids; a special token is a word of its own that never merges.
  const words: { ids: number[]; special: boolean }[] = [];
  for (const part of splitSpecial(text, v.special)) {
    if ('special' in part) words.push({ ids: [part.special], special: true });
    else for (const w of pretokenize(part.text, table.pretokenize)) words.push({ ids: utf8(w), special: false });
  }
  const flat = () => words.flatMap(w => w.ids);
  const start = flat(), steps: MergeStep[] = [];
  for (;;) {
    let best = Infinity, pair: [number, number] | undefined;
    for (const w of words) if (!w.special) for (let i = 0; i < w.ids.length - 1; i++) {
      const rank = v.ranks.get(`${w.ids[i]},${w.ids[i + 1]}`);
      if (rank !== undefined && rank < best) { best = rank; pair = [w.ids[i], w.ids[i + 1]]; }
    }
    if (!pair) break;
    const merged = 256 + best;
    let count = 0;
    for (const w of words) if (!w.special) count += mergePair(w.ids, pair[0], pair[1], merged);
    steps.push({ rank: best, left: pair[0], right: pair[1], merged, count, ids: flat() });
  }
  return { ids: flat(), start, steps, bytes: utf8(text).length };
}

/** The token ids' text: their bytes joined and read as UTF-8 (`<0xHH>` for bytes that are not a whole character). */
export function decode(table: BpeTable, ids: readonly number[]): string {
  const v = vocabulary(table);
  for (const id of ids) if (!Number.isInteger(id) || !v.tokens[id]) throw new Error(`unknown token id ${id}`);
  return bytesToText(ids.flatMap(id => v.tokens[id].bytes));
}

export const countTokens = (table: BpeTable, text: string) => encode(table, text).ids.length;
/** The cost of `tokens` at `pricePer1k` per 1,000 tokens (no rounding: the page rounds what it shows). */
export const tokenCost = (tokens: number, pricePer1k: number) => tokens * pricePer1k / 1000;

// ---- training -----------------------------------------------------------------------------------------------------
export interface TrainingStep { rank: number; left: string; right: string; merged: string; count: number }

/**
 * Learns `merges` merges from a corpus, deterministically. The corpus is cut into pre-tokens (as when encoding, special
 * tokens are not used here) and every word starts as its bytes. Each round counts every adjacent pair in every word
 * (overlapping pairs too, weighted by how often the word occurs), takes the pair counted most often and merges it
 * everywhere. Ties: the pair seen first when reading the corpus from the start (words in order of first appearance, pairs
 * left to right). Training stops early when no pair occurs at least `minCount` times (default 2).
 */
export function trainBpe(corpus: string, merges: number, { minCount = 2, pretokenize: mode = 'words' as Pretokenizer } = {}): { merges: [string, string][]; steps: TrainingStep[] } {
  const counts = new Map<string, { ids: number[]; count: number }>();
  for (const w of pretokenize(corpus, mode)) {
    const entry = counts.get(w);
    if (entry) entry.count++; else counts.set(w, { ids: utf8(w), count: 1 });
  }
  const words = [...counts.values()];
  const tokens: number[][] = Array.from({ length: 256 }, (_, b) => [b]);
  const out: [string, string][] = [], steps: TrainingStep[] = [];
  while (out.length < merges) {
    const pairs = new Map<string, { count: number; order: number; left: number; right: number }>();
    let order = 0;
    for (const w of words) for (let i = 0; i < w.ids.length - 1; i++) {
      const k = `${w.ids[i]},${w.ids[i + 1]}`, p = pairs.get(k);
      if (p) p.count += w.count; else pairs.set(k, { count: w.count, order: order++, left: w.ids[i], right: w.ids[i + 1] });
    }
    let best: { count: number; order: number; left: number; right: number } | undefined;
    for (const p of pairs.values()) if (!best || p.count > best.count || (p.count === best.count && p.order < best.order)) best = p;
    if (!best || best.count < minCount) break;
    const id = tokens.length;
    tokens.push([...tokens[best.left], ...tokens[best.right]]);
    for (const w of words) mergePair(w.ids, best.left, best.right, id);
    const left = bytesToText(tokens[best.left]), right = bytesToText(tokens[best.right]);
    out.push([left, right]);
    steps.push({ rank: out.length - 1, left, right, merged: bytesToText(tokens[id]), count: best.count });
  }
  return { merges: out, steps };
}

// ---- scoring (LLM05) ----------------------------------------------------------------------------------------------
export type LogBase = 2 | 'e';
const log = (p: number, base: LogBase) => base === 2 ? Math.log2(p) : Math.log(p);
/** −log p of one token: its log-loss (bits with base 2, nats with base e). */
export function logLoss(p: number, base: LogBase = 2): number {
  if (!(p > 0 && p <= 1)) throw new Error(`probability ${p} is not in (0, 1]`);
  return 0 - log(p, base); // 0 − x, so that p = 1 gives 0, not −0
}
/** The mean log-loss of the tokens' recorded probabilities: the cross-entropy of the text under the model. */
export function crossEntropy(probabilities: readonly number[], base: LogBase = 2): number {
  if (!probabilities.length) throw new Error('no probabilities');
  let sum = 0;
  for (const p of probabilities) sum += logLoss(p, base);
  return sum / probabilities.length;
}
/** e^(cross-entropy in nats) = 2^(cross-entropy in bits): the effective number of choices per token. */
export const perplexity = (probabilities: readonly number[]) => Math.exp(crossEntropy(probabilities, 'e'));
