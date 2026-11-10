/*
 * Phase F.1b normalization engine (DB10): functional dependencies over a small relation (at most MAX_ATTRIBUTES
 * attributes, so every subset can be tried). Pure functions, shared by the lesson page (the normalization-steps
 * activity) and the tests: attribute closure, candidate keys, the FDs that hold on part of a relation, the highest
 * normal form a relation meets, and whether a decomposition is lossless and preserves the dependencies. What the page
 * tells the learner is computed here, never typed into the lesson.
 */

export type Attr = string;
export interface FD { lhs: Attr[]; rhs: Attr[] }
export const MAX_ATTRIBUTES = 10;
/** From weakest to strongest; 1NF is assumed (every value atomic): the lesson teaches 1NF separately. */
export const NORMAL_FORMS = ['1NF', '2NF', '3NF', 'BCNF'] as const;
export type NormalForm = typeof NORMAL_FORMS[number];
export const atLeast = (nf: NormalForm, target: NormalForm) => NORMAL_FORMS.indexOf(nf) >= NORMAL_FORMS.indexOf(target);

/** X⁺: every attribute X determines under `fds`. */
export function closure(attrs: Iterable<Attr>, fds: readonly FD[]): Set<Attr> {
  const result = new Set(attrs);
  for (let changed = true; changed;) {
    changed = false;
    for (const fd of fds) if (fd.lhs.every(a => result.has(a))) for (const a of fd.rhs) if (!result.has(a)) { result.add(a); changed = true; }
  }
  return result;
}

const subset = (a: readonly Attr[], b: Set<Attr> | readonly Attr[]) => { const set = b instanceof Set ? b : new Set(b); return a.every(x => set.has(x)); };
export const isSuperkey = (attrs: readonly Attr[], relation: readonly Attr[], fds: readonly FD[]) => subset(relation, closure(attrs, fds));

/** Every subset of `attrs` (in `attrs` order), smallest first. */
function subsets(attrs: readonly Attr[]): Attr[][] {
  if (attrs.length > MAX_ATTRIBUTES) throw new Error(`at most ${MAX_ATTRIBUTES} attributes`);
  const all: Attr[][] = [];
  for (let mask = 0; mask < 1 << attrs.length; mask++) all.push(attrs.filter((_, i) => mask & (1 << i)));
  return all.sort((a, b) => a.length - b.length);
}

/** The minimal superkeys, in attribute order. */
export function candidateKeys(relation: readonly Attr[], fds: readonly FD[]): Attr[][] {
  const keys: Attr[][] = [];
  for (const s of subsets(relation)) if (!keys.some(k => subset(k, s)) && isSuperkey(s, relation, fds)) keys.push(s);
  return keys;
}

/**
 * The dependencies that hold on `sub` (a projection of the relation): X → A for X ⊆ sub and A ∈ X⁺ ∩ sub, A ∉ X, kept
 * only with a minimal left side, one attribute on the right. Enough to judge keys and normal forms of `sub`.
 */
export function projectFds(sub: readonly Attr[], fds: readonly FD[]): FD[] {
  const found: FD[] = [];
  for (const x of subsets(sub)) {
    const reach = closure(x, fds);
    for (const a of sub) {
      if (x.includes(a) || !reach.has(a)) continue;
      if (found.some(fd => fd.rhs[0] === a && subset(fd.lhs, x))) continue;
      found.push({ lhs: x, rhs: [a] });
    }
  }
  return found;
}

/** Why a relation is not in the next normal form: the dependency that breaks it. */
export interface NfViolation { form: '2NF' | '3NF' | 'BCNF'; fd: FD; reason: string }
export interface RelationAnalysis { attributes: Attr[]; fds: FD[]; keys: Attr[][]; prime: Attr[]; form: NormalForm; violation?: NfViolation }

export const showSet = (attrs: readonly Attr[]) => attrs.length === 1 ? attrs[0] : `{${attrs.join(', ')}}`;
export const showFd = (fd: FD) => `${showSet(fd.lhs)} → ${showSet(fd.rhs)}`;

/** Keys, prime attributes and the highest normal form of `sub`, with the first dependency that stops it going higher. */
export function analyzeRelation(sub: readonly Attr[], fds: readonly FD[]): RelationAnalysis {
  const projected = projectFds(sub, fds), keys = candidateKeys(sub, projected);
  const prime = sub.filter(a => keys.some(k => k.includes(a)));
  const base = { attributes: [...sub], fds: projected, keys, prime };
  const superkey = (x: Attr[]) => isSuperkey(x, sub, projected);
  const partial = projected.find(fd => !prime.includes(fd.rhs[0]) && keys.some(k => fd.lhs.length < k.length && subset(fd.lhs, k)));
  if (partial) return { ...base, form: '1NF', violation: { form: '2NF', fd: partial,
    reason: `非鍵屬性 ${partial.rhs[0]} 只相依於候選鍵的一部分 ${showSet(partial.lhs)}（部分相依）` } };
  const transitive = projected.find(fd => !superkey(fd.lhs) && !prime.includes(fd.rhs[0]));
  if (transitive) return { ...base, form: '2NF', violation: { form: '3NF', fd: transitive,
    reason: `${showSet(transitive.lhs)} 不是超鍵，卻決定非鍵屬性 ${transitive.rhs[0]}（遞移相依）` } };
  const bcnf = projected.find(fd => !superkey(fd.lhs));
  if (bcnf) return { ...base, form: '3NF', violation: { form: 'BCNF', fd: bcnf,
    reason: `${showSet(bcnf.lhs)} 不是超鍵，卻決定 ${bcnf.rhs[0]}（${bcnf.rhs[0]} 是鍵屬性，所以仍符合 3NF）` } };
  return { ...base, form: 'BCNF' };
}

/** The chase: a decomposition is lossless when joining the parts gives back exactly the original rows. */
export function isLossless(relation: readonly Attr[], parts: readonly Attr[][], fds: readonly FD[]): boolean {
  // One row per part: the attributes it holds are "a" (distinguished), the others a symbol unique to that row.
  const rows = parts.map((part, i) => new Map(relation.map(a => [a, part.includes(a) ? 'a' : `b${i}`])));
  const single = fds.flatMap(fd => fd.rhs.map(r => ({ lhs: fd.lhs, rhs: r })));
  for (let changed = true; changed;) {
    changed = false;
    for (const fd of single) for (const r1 of rows) for (const r2 of rows) {
      if (r1 === r2 || !fd.lhs.every(a => r1.get(a) === r2.get(a))) continue;
      const [v1, v2] = [r1.get(fd.rhs)!, r2.get(fd.rhs)!];
      if (v1 === v2) continue;
      // Equate the two symbols everywhere, preferring the distinguished one.
      const [keep, drop] = v1 === 'a' || (v2 !== 'a' && v1 < v2) ? [v1, v2] : [v2, v1];
      for (const row of rows) if (row.get(fd.rhs) === drop) row.set(fd.rhs, keep);
      changed = true;
    }
  }
  return rows.some(row => relation.every(a => row.get(a) === 'a'));
}

/** Each dependency can be checked inside the parts, without joining them (the standard closure-in-parts test). */
export function lostDependencies(parts: readonly Attr[][], fds: readonly FD[]): FD[] {
  return fds.filter(fd => {
    const z = new Set(fd.lhs);
    for (let changed = true; changed;) {
      changed = false;
      for (const part of parts) {
        const reach = closure(part.filter(a => z.has(a)), fds);
        for (const a of part) if (reach.has(a) && !z.has(a)) { z.add(a); changed = true; }
      }
    }
    return !fd.rhs.every(a => z.has(a));
  });
}

export interface DecompositionAnalysis {
  parts: RelationAnalysis[];
  /** Attributes of the original relation that no part keeps. */
  missing: Attr[];
  lossless: boolean;
  lost: FD[];
  /** Parts whose attributes all sit inside another part (they add nothing). */
  redundant: number[];
  /** The weakest normal form among the parts. */
  form: NormalForm;
}

export function analyzeDecomposition(relation: readonly Attr[], parts: readonly Attr[][], fds: readonly FD[]): DecompositionAnalysis {
  const analyses = parts.map(p => analyzeRelation(p, fds));
  return {
    parts: analyses,
    missing: relation.filter(a => !parts.some(p => p.includes(a))),
    lossless: isLossless(relation, parts, fds),
    lost: lostDependencies(parts, fds),
    redundant: parts.flatMap((p, i) => parts.some((q, j) => j !== i && subset(p, q) && (p.length < q.length || j < i)) ? [i] : []),
    form: analyses.reduce<NormalForm>((weakest, a) => atLeast(a.form, weakest) ? weakest : a.form, 'BCNF'),
  };
}
