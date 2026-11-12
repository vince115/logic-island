/*
 * Shared Trial System T.2B-2: a minimal duplicate and similarity check for original questions, run before an import
 * (docs/exam-system/12 §5.4, G8). Every flag is a signal for a human reviewer, never a copyright finding: short
 * technical terms and standard option lists (for example the four Vs of big data) legitimately recur.
 */
export interface SimilarityItem { id: string; stem: string; options: string[]; corpus: string }
export type SimilarityKind = 'same-stem' | 'shared-run' | 'stem-ngrams' | 'options' | 'same-template';
export interface SimilarityFlag { id: string; other: string; corpus: string; kind: SimilarityKind; score: number; detail: string }

/** 12 §5.4: a common run of 12 characters or more, or 5-gram Jaccard above 0.3, sends the question back. */
export const THRESHOLDS = { run: 12, stemNgrams: 0.3, optionNgrams: 0.6, optionLength: 4, sharedOptions: 3, template: 0.5 } as const;

/** Letters and digits only: width, case, spacing and punctuation do not count. */
export const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** Numbers and Latin words masked, so a question that only swaps figures or names still matches its template. */
const masked = (s: string) => normalize(s).replace(/\d+(\.\d+)?/g, '#').replace(/[a-z]+/g, 'w');

const grams = (s: string, n: number) => {
  const out = new Set<string>();
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  if (!out.size && s) out.add(s);
  return out;
};
export function jaccard(a: string, b: string, n = 5): number {
  const x = grams(a, n), y = grams(b, n);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
}
/** The longest run of characters the two texts share (normalized). */
export function longestRun(a: string, b: string): string {
  let best = 0, end = 0, prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) {
      row[j] = prev[j - 1] + 1;
      if (row[j] > best) { best = row[j]; end = i; }
    }
    prev = row;
  }
  return a.slice(end - best, end);
}
/**
 * Options of `a` that read the same as one of `b`'s, nearly so (one contains the other and they are close in length), or
 * share most character pairs. Options under 4 characters (figures, single terms) say nothing about copying and are skipped.
 */
function sharedOptions(a: string[], b: string[]): number {
  const usable = (list: string[]) => list.map(normalize).filter(o => o.length >= THRESHOLDS.optionLength);
  const bb = usable(b), near = (o: string, p: string) => o === p || jaccard(o, p, 2) >= THRESHOLDS.optionNgrams
    || ((o.includes(p) || p.includes(o)) && Math.min(o.length, p.length) / Math.max(o.length, p.length) >= THRESHOLDS.optionNgrams);
  return usable(a).filter(o => bb.some(p => near(o, p))).length;
}

/** Compares every candidate with the other candidates and with each reference item (an existing bank, local papers). */
export function similarityFlags(candidates: SimilarityItem[], references: SimilarityItem[]): SimilarityFlag[] {
  const flags: SimilarityFlag[] = [];
  candidates.forEach((q, i) => {
    const stem = normalize(q.stem), all = masked([q.stem, ...[...q.options].sort()].join('|'));
    for (const r of [...candidates.slice(i + 1), ...references]) {
      if (r.id === q.id) continue;
      const add = (kind: SimilarityKind, score: number, detail: string) => flags.push({ id: q.id, other: r.id, corpus: r.corpus, kind, score, detail });
      const other = normalize(r.stem);
      if (stem && stem === other) { add('same-stem', 1, '題幹相同'); continue; }
      const run = longestRun(stem, other);
      if (run.length >= THRESHOLDS.run) add('shared-run', run.length, `共同片段 ${run.length} 字：「${run}」`);
      const j = jaccard(stem, other);
      if (j > THRESHOLDS.stemNgrams) add('stem-ngrams', j, `題幹 5-gram Jaccard ${j.toFixed(2)}`);
      const shared = r.options.length ? sharedOptions(q.options, r.options) : 0;
      if (shared >= THRESHOLDS.sharedOptions) add('options', shared, `${shared} 個選項相同或幾乎相同`);
      const t = jaccard(all, masked([r.stem, ...[...r.options].sort()].join('|')));
      if (t > THRESHOLDS.template) add('same-template', t, `遮蔽數字與英文後，題幹加選項 5-gram Jaccard ${t.toFixed(2)}`);
    }
  });
  return flags;
}

/**
 * Splits locally kept paper text into items for comparison: a question starts at a line opening with its number
 * ("12." "12、" "12．"), which a printed answer letter may precede ("B 12."), and options are read from "(A)" … "(D)"
 * markers when present. The text never leaves the machine.
 */
export function itemsFromPaperText(text: string, corpus: string): SimilarityItem[] {
  const start = /^\s*(?:[A-D]\s+)?(\d{1,3})\s*[.、．]\s*/;
  return text.split(/\n(?=\s*(?:[A-D]\s+)?\d{1,3}\s*[.、．])/).map(block => block.trim()).filter(block => start.test(block)).map(block => {
    const number = block.match(start)![1];
    const parts = block.replace(start, '').split(/[(（]\s*[A-DＡ-Ｄ]\s*[)）]/);
    return { id: `${corpus}#${number}`, stem: parts[0], options: parts.slice(1).map(p => p.trim()).filter(Boolean), corpus };
  });
}
