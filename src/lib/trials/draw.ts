import type { EnginePaper } from './engine';
import { mulberry32, shuffleIds } from './shuffle';

/*
 * T.2E dynamic paper assembly (docs/exam-system/21 §4): one paper of `count` questions drawn from a subject's pool of
 * published revisions, by a seed. Pure and client-safe: the runner draws when a session starts, and the session keeps
 * what it drew (ids, revisions, hashes, order) so a reload never draws again.
 *
 * Hard rules, never relaxed: only pool items (the server builds the pool from published revisions of one subject),
 * no repeated id, exactly `coverage[code]` questions per syllabus item, `count` in all. A pool that cannot meet them
 * draws nothing (DrawError lists the shortages).
 * Soft rules, in this order: as few similarity-conflict pairs on the paper as possible, then question shapes as close
 * to the per-item targets as possible. A conflict that cannot be avoided stays on the paper and is reported, never
 * hidden.
 * T.3D (docs/exam-system/28 §3): a spec may instead cap the shapes of the whole paper (`shapeMax`). The cap comes first,
 * before conflicts: a candidate that would exceed it is taken only when nothing else is left, and any excess is
 * reported in `shapeGap`. A spec without `shapeMax` draws exactly as before.
 * T.3D: `sampling: 'uniform'` draws each syllabus item's questions uniformly and keeps the first paper that breaks no
 * conflict pair and no shape limit (rejection sampling): every such paper is equally likely, so a question is not drawn
 * less just because its item comes later. If none is found within UNIFORM_TRIES, the greedy draw below is used and the
 * result says so (`fallback`).
 * Same pool snapshot + same seed → same paper: candidates are ordered by id before the seeded shuffle, so the order the
 * pool arrives in does not matter.
 */
export type Shape = 'concept' | 'application' | 'scenario';
export const SHAPES: Shape[] = ['concept', 'application', 'scenario'];
export interface DrawItem { questionId: string; revision: number; hash: string; code: string; shape?: Shape }
export interface DrawSpec {
  count: number;
  /** Questions per syllabus item code; their sum is `count`. Listed in syllabus order: the paper keeps it. */
  coverage: Record<string, number>;
  /** Wanted [concept, application, scenario] per syllabus item (soft). */
  shapes?: Record<string, [number, number, number]>;
  /** T.3D: at most [concept, application, scenario] on the whole paper. */
  shapeMax?: [number, number, number];
  /** T.3D: 'uniform' samples among the papers that keep every rule; greedy (the default) otherwise. */
  sampling?: 'uniform';
  /** Similarity conflict graph: pairs that should not share a paper (soft). */
  conflicts: [string, string][];
}
export interface DrawResult {
  /** The drawn question ids, in paper order. */
  ids: string[];
  /** Conflict pairs that could not be kept apart within the syllabus quotas. */
  conflicts: [string, string][];
  /** How far the shapes are from the targets (sum of absolute differences) plus any excess over `shapeMax`; 0 = on target. */
  shapeGap: number;
  snapshot: string;
  /** T.3D: a uniform draw that found no paper keeping every rule and fell back to the greedy draw. */
  fallback?: true;
}
export class DrawError extends Error {
  constructor(public problems: string[]) { super(problems.join('\n')); }
}
/** Attempts with different shuffles; the best (fewest conflicts, then smallest shape gap, then earliest) is kept. */
export const DRAW_ATTEMPTS = 12;
/** T.3D: papers a uniform draw tries before it falls back (the CCAR-F bank needs about 33 on average). */
export const UNIFORM_TRIES = 20_000;

/** FNV-1a over the sorted pool (id, revision, hash): two pools with the same snapshot draw the same papers. */
export function poolSnapshot(pool: DrawItem[]): string {
  const text = pool.map(p => `${p.questionId}@${p.revision}:${p.hash}`).sort().join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** What keeps a pool from drawing a paper; empty when it can. */
export function drawProblems(pool: DrawItem[], spec: DrawSpec): string[] {
  const problems: string[] = [], seen = new Set<string>();
  for (const p of pool) { if (seen.has(p.questionId)) problems.push(`${p.questionId} is in the pool twice`); seen.add(p.questionId); }
  const total = Object.values(spec.coverage).reduce((a, n) => a + n, 0);
  if (total !== spec.count) problems.push(`coverage adds up to ${total}, not ${spec.count}`);
  for (const [code, n] of Object.entries(spec.coverage)) {
    const have = pool.filter(p => p.code === code).length;
    if (have < n) problems.push(`${code}: ${have} published, ${n} needed`);
  }
  const extra = pool.filter(p => !(p.code in spec.coverage));
  if (extra.length) problems.push(`outside the syllabus items: ${extra.map(p => p.questionId).join(', ')}`);
  return problems;
}

export function drawPaper(pool: DrawItem[], spec: DrawSpec, seed: number): DrawResult {
  const problems = drawProblems(pool, spec);
  if (problems.length) throw new DrawError(problems);
  const random = mulberry32(seed);
  const ids = new Set(pool.map(p => p.questionId));
  const graph = new Map<string, Set<string>>();
  for (const [a, b] of spec.conflicts) {
    if (!ids.has(a) || !ids.has(b)) continue; // an edge to an unpublished question cannot bite
    (graph.get(a) ?? graph.set(a, new Set()).get(a)!).add(b);
    (graph.get(b) ?? graph.set(b, new Set()).get(b)!).add(a);
  }
  const groups = new Map(Object.keys(spec.coverage).map(code => [code, pool.filter(p => p.code === code).sort((x, y) => x.questionId.localeCompare(y.questionId))]));
  // Tightest syllabus items first (least choice per slot), so the scarce ones are not boxed in by conflicts.
  const codes = Object.keys(spec.coverage).sort((a, b) => spec.coverage[b] / groups.get(b)!.length - spec.coverage[a] / groups.get(a)!.length || a.localeCompare(b));

  if (spec.sampling === 'uniform') {
    const items = Object.keys(spec.coverage);
    for (let attempt = 0; attempt < UNIFORM_TRIES; attempt++) {
      const ids = items.flatMap(code => shuffleIds(groups.get(code)!.map(p => p.questionId), [], random).slice(0, spec.coverage[code]));
      const chosen = new Set(ids);
      if ([...chosen].some(id => [...graph.get(id) ?? []].some(other => chosen.has(other)))) continue;
      const onPaper = [0, 0, 0];
      for (const p of pool) if (chosen.has(p.questionId) && p.shape) onPaper[SHAPES.indexOf(p.shape)]++;
      if (spec.shapeMax && onPaper.some((n, i) => n > spec.shapeMax![i])) continue;
      return { ids, conflicts: [], shapeGap: 0, snapshot: poolSnapshot(pool) };
    }
  }
  let best: { picked: Map<string, DrawItem[]>; conflicts: [string, string][]; gap: number; excess: number } | undefined;
  for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt++) {
    const chosen = new Set<string>(), picked = new Map<string, DrawItem[]>(), onPaper = [0, 0, 0];
    for (const code of codes) {
      const order = shuffleIds(groups.get(code)!.map(p => p.questionId), [], random);
      const rank = new Map(order.map((id, i) => [id, i]));
      const want = [...spec.shapes?.[code] ?? [0, 0, 0]], mine: DrawItem[] = [];
      for (let slot = 0; slot < spec.coverage[code]; slot++) {
        const left = groups.get(code)!.filter(p => !chosen.has(p.questionId));
        const score = (p: DrawItem) => {
          const clashes = [...graph.get(p.questionId) ?? []].filter(id => chosen.has(id)).length;
          const s = p.shape ? SHAPES.indexOf(p.shape) : -1;
          const over = spec.shapeMax && s >= 0 && onPaper[s] >= spec.shapeMax[s] ? 1 : 0;
          return [over, clashes, spec.shapes?.[code] && s >= 0 && want[s] <= 0 ? 1 : 0, rank.get(p.questionId)!];
        };
        const next = left.map(p => ({ p, k: score(p) })).sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2] || x.k[3] - y.k[3])[0].p;
        chosen.add(next.questionId); mine.push(next);
        if (next.shape) { want[SHAPES.indexOf(next.shape)]--; onPaper[SHAPES.indexOf(next.shape)]++; }
      }
      picked.set(code, mine);
    }
    const conflicts = spec.conflicts.filter(([a, b]) => chosen.has(a) && chosen.has(b)).map(([a, b]) => [a, b] as [string, string]);
    const gap = Object.entries(spec.shapes ?? {}).reduce((sum, [code, target]) => sum + SHAPES.reduce((s, shape, i) =>
      s + Math.abs(target[i] - (picked.get(code) ?? []).filter(p => p.shape === shape).length), 0), 0);
    const excess = spec.shapeMax ? spec.shapeMax.reduce((sum, max, i) => sum + Math.max(0, onPaper[i] - max), 0) : 0;
    const better = !best || excess < best.excess || (excess === best.excess && (conflicts.length < best.conflicts.length || (conflicts.length === best.conflicts.length && gap < best.gap)));
    if (better) best = { picked, conflicts, gap, excess };
    if (!conflicts.length && !gap && !excess) break;
  }
  // Paper order: syllabus items as the spec lists them; within an item, the seeded order it was drawn in.
  return { ids: Object.keys(spec.coverage).flatMap(code => best!.picked.get(code)!.map(p => p.questionId)), conflicts: best!.conflicts, shapeGap: best!.gap + best!.excess, snapshot: poolSnapshot(pool), ...spec.sampling === 'uniform' ? { fallback: true as const } : {} };
}

/**
 * Whether a session's frozen items can still be shown from this pool: every item must be there with the same revision
 * and content hash. If not, the session cannot be rebuilt as it was and must not be replaced by a different paper.
 */
export function unrestorable(items: { questionId: string; revision: number; hash: string }[], pool: { questionId: string; revision: number; hash: string }[]): string[] {
  const byId = new Map(pool.map(p => [p.questionId, p]));
  return items.filter(i => { const p = byId.get(i.questionId); return !p || p.revision !== i.revision || p.hash !== i.hash; }).map(i => i.questionId);
}

/**
 * T.3G (docs/exam-system/31 §8): why an unfinished session cannot go on with the paper the page has now — items that
 * are gone or not as they were (withdrawn, revised), or, for a fixed paper, another version of it. Such a session is
 * never resumed, graded or completed with other questions; the learner is told and may abandon it.
 */
export function unresumable(session: { paperVersion: string; items: { questionId: string; revision: number; hash: string }[] }, engine: { version: string; items: { questionId: string; revision: number; hash: string }[] }, fixed: boolean): { items: string[]; version?: { from: string; to: string } } {
  return { items: unrestorable(session.items, engine.items), ...fixed && session.paperVersion !== engine.version ? { version: { from: session.paperVersion, to: engine.version } } : {} };
}

/** The engine paper of a new session: a fixed paper as it is; a generated one with the questions drawn by `seed`. */
export function sessionPaper(engine: EnginePaper, draw: { spec: DrawSpec; pool: DrawItem[] } | undefined, seed: number): EnginePaper {
  if (!draw) return engine;
  const drawn = drawPaper(draw.pool, draw.spec, seed), byId = new Map(engine.items.map(i => [i.questionId, i]));
  return { ...engine, items: drawn.ids.map(id => byId.get(id)!), snapshot: drawn.snapshot };
}
