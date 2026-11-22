/*
 * LLM-0 (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md §3.4): the embedding-space explorer's engine. A lesson writes
 * small vectors by hand (2–16 dimensions; 示意資料, never a real model's embeddings) and the page computes everything
 * else: dot products, norms, cosine similarity, nearest neighbours and a 2D projection.
 *
 * Two kinds of space, kept apart in the data: a token embedding table (rows of a model's embedding matrix, one per
 * token, looked up by token id) and document embeddings (one vector per sentence or document, from an embedding model,
 * compared with a query). Only a document space has queries.
 *
 * The projection is PCA, computed deterministically: centre the items' vectors (their mean is the origin), take the
 * covariance C = XᵀX / n, and find its leading eigenvectors by power iteration with deflation. Each iteration starts from
 * the fixed vector (1, 1/2, 1/3, …, 1/d), normalised, and stops when the vector moves less than 1e-13 (at most 10,000
 * iterations). Each axis's sign is fixed so that its largest component (in absolute value; the first on a tie) is
 * positive. A point's coordinates are its centred vector's dot products with the first two axes; queries use the items'
 * mean and axes. projectionProblems refuses a space whose axes are not well defined (points on a line, or two
 * eigenvalues too close for the axis to be unique).
 */

export interface TokenEmbedding { id: string; token: string; tokenId?: number; vector: number[]; group?: string }
export interface DocumentEmbedding { id: string; text: string; vector: number[]; group?: string }
export type EmbeddingSpace =
  | { kind: 'token'; dimensions?: string[]; items: TokenEmbedding[] }
  | { kind: 'document'; dimensions?: string[]; items: DocumentEmbedding[]; queries?: DocumentEmbedding[] };
export type EmbeddingItem = TokenEmbedding | DocumentEmbedding;

export const MIN_DIMENSIONS = 2, MAX_DIMENSIONS = 16;
export const labelOf = (item: EmbeddingItem) => 'token' in item ? item.token : item.text;

export function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`vectors of ${a.length} and ${b.length} dimensions`);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export const norm = (a: readonly number[]) => Math.sqrt(dot(a, a));
export function cosine(a: readonly number[], b: readonly number[]): number {
  const n = norm(a) * norm(b);
  if (!(n > 0)) throw new Error('cosine similarity of a zero vector');
  return dot(a, b) / n;
}

export type Metric = 'cosine' | 'dot';
export interface Neighbour { id: string; label: string; score: number }
/**
 * The items most similar to `of` (an item or query id), highest score first; a tie keeps the items' order. The item
 * itself is left out.
 */
export function nearest(space: EmbeddingSpace, of: string, k = space.items.length, metric: Metric = 'cosine'): Neighbour[] {
  const target = findVector(space, of);
  const score = metric === 'cosine' ? cosine : dot;
  return space.items.map((item, i) => ({ item, i, score: score(target.vector, item.vector) }))
    .filter(x => x.item.id !== of)
    .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, k)
    .map(x => ({ id: x.item.id, label: labelOf(x.item), score: x.score }));
}
export function findVector(space: EmbeddingSpace, id: string): EmbeddingItem {
  const all: EmbeddingItem[] = [...space.items, ...(space.kind === 'document' ? space.queries ?? [] : [])];
  const found = all.find(x => x.id === id);
  if (!found) throw new Error(`no item or query ${id}`);
  return found;
}

// ---- PCA ----------------------------------------------------------------------------------------------------------
const TOLERANCE = 1e-13, MAX_ITERATIONS = 10_000;
export interface Projection {
  mean: number[];
  /** The two axes (unit vectors). */
  axes: [number[], number[]];
  /** The covariance's eigenvalues for the first three axes (the third is 0 in two dimensions). */
  eigenvalues: number[];
  /** Each axis's share of the total variance. */
  explained: [number, number];
  points: Record<string, [number, number]>;
  /** Whether each power iteration converged (an eigenvector to 1e-9 of its eigenvalue). */
  converged: boolean;
}

function powerIteration(c: number[][]): { vector: number[]; value: number; converged: boolean } {
  const d = c.length;
  const mul = (v: number[]) => c.map(row => dot(row, v));
  let v = Array.from({ length: d }, (_, i) => 1 / (i + 1));
  const n0 = norm(v);
  v = v.map(x => x / n0);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const w = mul(v), n = norm(w);
    if (!(n > 0)) return { vector: v, value: 0, converged: true };
    const next = w.map(x => x / n);
    const moved = Math.sqrt(next.reduce((s, x, j) => s + (x - v[j]) ** 2, 0));
    v = next;
    if (moved < TOLERANCE) break;
  }
  // Sign: the largest component (the first on a tie) is positive.
  let big = 0;
  for (let j = 1; j < d; j++) if (Math.abs(v[j]) > Math.abs(v[big]) + 1e-12) big = j;
  if (v[big] < 0) v = v.map(x => -x);
  const value = dot(v, mul(v));
  const residual = norm(mul(v).map((x, j) => x - value * v[j]));
  return { vector: v, value, converged: residual <= 1e-9 * Math.max(1, Math.abs(value)) };
}

const projections = new WeakMap<EmbeddingSpace, Projection>();
/** The space's PCA projection to two dimensions (cached per space object). */
export function project(space: EmbeddingSpace): Projection {
  const cached = projections.get(space);
  if (cached) return cached;
  const vectors = space.items.map(i => i.vector), n = vectors.length, d = vectors[0]?.length ?? 0;
  const mean = Array.from({ length: d }, (_, j) => vectors.reduce((s, v) => s + v[j], 0) / n);
  const centred = vectors.map(v => v.map((x, j) => x - mean[j]));
  let c = Array.from({ length: d }, (_, a) => Array.from({ length: d }, (_, b) => centred.reduce((s, v) => s + v[a] * v[b], 0) / n));
  const total = c.reduce((s, row, j) => s + row[j], 0);
  const found: { vector: number[]; value: number; converged: boolean }[] = [];
  for (let k = 0; k < Math.min(3, d); k++) {
    const e = powerIteration(c);
    found.push(e);
    c = c.map((row, a) => row.map((x, b) => x - e.value * e.vector[a] * e.vector[b]));
  }
  const axes = [found[0].vector, found[1].vector] as [number[], number[]];
  const at = (v: readonly number[]): [number, number] => { const x = v.map((y, j) => y - mean[j]); return [dot(x, axes[0]), dot(x, axes[1])]; };
  const all = [...space.items, ...(space.kind === 'document' ? space.queries ?? [] : [])];
  const p: Projection = {
    mean, axes, eigenvalues: [found[0].value, found[1].value, found[2]?.value ?? 0],
    explained: total > 0 ? [found[0].value / total, found[1].value / total] : [0, 0],
    points: Object.fromEntries(all.map(i => [i.id, at(i.vector)])), converged: found.every(e => e.converged),
  };
  projections.set(space, p);
  return p;
}

/** Why the two axes are not well defined: the points span less than a plane, or two eigenvalues are (almost) equal. */
export function projectionProblems(space: EmbeddingSpace): string[] {
  const { eigenvalues: [l1, l2, l3], converged } = project(space);
  const problems: string[] = [];
  if (!(l1 > 1e-9) || !(l2 > 1e-9 * l1)) problems.push('the points lie on a line or a point: no 2D projection');
  else if (l1 - l2 < 1e-3 * l1 || l2 - l3 < 1e-3 * l1) problems.push('two eigenvalues are almost equal, so the projection axes are not unique: change a vector');
  else if (!converged) problems.push('the projection did not converge');
  return problems;
}

/** The space's own problems: dimensions, finite and non-zero vectors, unique ids and labels, a well-defined projection. */
export function embeddingSpaceProblems(space: EmbeddingSpace): string[] {
  const problems: string[] = [];
  if (space.kind !== 'token' && space.kind !== 'document') return [`unknown kind ${(space as { kind: string }).kind}`];
  if (space.items.length < 3) problems.push('needs at least three items');
  const all: EmbeddingItem[] = [...space.items, ...(space.kind === 'document' ? space.queries ?? [] : [])];
  if ('queries' in space && space.kind !== 'document') problems.push('only a document space has queries');
  const d = space.items[0]?.vector.length ?? 0;
  if (d < MIN_DIMENSIONS || d > MAX_DIMENSIONS) problems.push(`vectors have ${MIN_DIMENSIONS}–${MAX_DIMENSIONS} dimensions, not ${d}`);
  if (space.dimensions && space.dimensions.length !== d) problems.push(`names ${space.dimensions.length} dimensions for vectors of ${d}`);
  const ids = new Set<string>(), labels = new Set<string>();
  for (const item of all) {
    if (ids.has(item.id)) problems.push(`duplicate id ${item.id}`);
    ids.add(item.id);
    const label = labelOf(item);
    if (!label?.trim()) problems.push(`${item.id} needs a ${space.kind === 'token' ? 'token' : 'text'}`);
    if (labels.has(label)) problems.push(`two items are both "${label}"`);
    labels.add(label);
    if (item.vector.length !== d) problems.push(`${item.id} has ${item.vector.length} dimensions, not ${d}`);
    else if (item.vector.some(x => !Number.isFinite(x))) problems.push(`${item.id} has a value that is not a finite number`);
    else if (!(norm(item.vector) > 0)) problems.push(`${item.id} is the zero vector (no direction, no cosine similarity)`);
  }
  if (space.kind === 'token') {
    const tokenIds = space.items.flatMap(i => i.tokenId === undefined ? [] : [i.tokenId]);
    if (tokenIds.some(t => !Number.isInteger(t) || t < 0) || new Set(tokenIds).size !== tokenIds.length) problems.push('token ids must be distinct integers ≥ 0');
  }
  if (!problems.length) problems.push(...projectionProblems(space));
  return problems;
}
