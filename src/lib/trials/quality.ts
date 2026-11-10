import type { MockBlueprint } from '@/content/trials/mock-exams';
import { contentText, currentRevisionOf, revisionHash, syllabusCodeOf, type Question } from '@/content/trials/schema';
import { DrawError, SHAPES, drawPaper, type DrawItem, type DrawSpec } from './draw';
import { drawItemOf, drawSpecOf, subjectQuestions, type TagIndex } from './mock-assembly';
import { checkLedger, type ExamOf, type Ledger } from './lifecycle';
import { similarityFlags, type SimilarityItem } from './similarity';

/*
 * Shared Trial System T.3D (docs/exam-system/28 §6): quality metrics of one blueprint's bank and of its papers. Every
 * number is computed from the bank and from real draws over the subject's current revisions as if all were published
 * (in memory only: nothing is approved, published or written). scripts/trials/quality.ts prints the report.
 * T.3E (docs/exam-system/29 §9–10): draw latency, the candidate pool, and the integrity of revisions, content hash
 * versions, published hashes and the ledger, with the reasons a quality gate fails.
 */
const domainOf = (code: string) => code.split('.')[0];
const count = <T>(xs: T[], key: (x: T) => string | number) =>
  xs.reduce<Record<string, number>>((o, x) => { const k = String(key(x)); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const range = (xs: number[]) => xs.length ? { min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((a, x) => a + x, 0) / xs.length } : { min: 0, max: 0, mean: 0 };

export interface BankMetrics {
  questions: number;
  byDomain: Record<string, number>;
  /** Per syllabus item: bank count, paper quota, shapes and types, conflict pairs inside the item. */
  items: { code: string; bank: number; quota: number; shapes: Record<string, number>; types: Record<string, number>; innerConflicts: number }[];
  uncovered: string[];
  difficulty: Record<string, number>;
  shapes: Record<string, number>;
  types: Record<string, number>;
  scenarioRatio: number;
  /** Single-choice answer letters, and the letter sets of multiple-response answers. */
  singleLetters: Record<string, number>;
  multipleLetters: Record<string, number>;
  /** How often the correct option is the longest or the shortest one (ties count), against what chance would give. */
  lengthBias: { longest: number; shortest: number; chance: number };
  similarity: { total: number; byKind: Record<string, number> };
  conflicts: { pairs: number; inner: number; across: number; maxDegree: number };
  volatile: { count: number; nextReview?: string };
}

export function bankMetrics(bp: MockBlueprint, questions: Question[], conflicts: [string, string][], tags: TagIndex): BankMetrics {
  const mine = subjectQuestions(bp, questions), code = (q: Question) => syllabusCodeOf(q, tags) ?? '';
  const codeOf = new Map(mine.map(q => [q.id, code(q)])), ids = new Set(mine.map(q => q.id));
  const edges = conflicts.filter(([a, b]) => ids.has(a) && ids.has(b));
  const degree = count(edges.flat(), id => id);
  let longest = 0, shortest = 0, chance = 0;
  const singleLetters: Record<string, number> = {}, multipleLetters: Record<string, number> = {};
  for (const q of mine) {
    const rev = currentRevisionOf(q)!, a = rev.answer;
    if (a?.kind !== 'choice' || !rev.options) continue;
    const lengths = rev.options.map(o => contentText(o.body).length), letters = a.correct.map(id => 'ABCDEFGH'[rev.options!.findIndex(o => o.id === id)]).sort().join('');
    if (a.correct.length > 1) multipleLetters[letters] = (multipleLetters[letters] ?? 0) + 1; else singleLetters[letters] = (singleLetters[letters] ?? 0) + 1;
    const at = a.correct.map(id => rev.options!.findIndex(o => o.id === id));
    if (at.some(i => lengths[i] === Math.max(...lengths))) longest++;
    if (at.some(i => lengths[i] === Math.min(...lengths))) shortest++;
    chance += a.correct.length / lengths.length;
  }
  const items: SimilarityItem[] = mine.map(q => ({ id: q.id, stem: contentText(currentRevisionOf(q)!.stem ?? []), options: (currentRevisionOf(q)!.options ?? []).map(o => contentText(o.body)), corpus: 'bank' }));
  const flags = similarityFlags(items, items).filter(f => f.id < f.other);
  const reviews = mine.filter(q => q.tags.includes('meta.volatile')).map(q => q.reviewBy).filter((d): d is string => !!d).sort();
  return {
    questions: mine.length,
    byDomain: count(mine, q => domainOf(code(q))),
    items: Object.entries(bp.coverage).map(([c, quota]) => {
      const qs = mine.filter(q => code(q) === c);
      return { code: c, bank: qs.length, quota, shapes: count(qs, q => q.stemShape ?? 'unknown'), types: count(qs, q => q.type), innerConflicts: edges.filter(([a, b]) => codeOf.get(a) === c && codeOf.get(b) === c).length };
    }),
    uncovered: Object.keys(bp.coverage).filter(c => !mine.some(q => code(q) === c)),
    difficulty: count(mine, q => currentRevisionOf(q)!.difficulty?.level ?? 'none'),
    shapes: count(mine, q => q.stemShape ?? 'unknown'),
    types: count(mine, q => q.type),
    scenarioRatio: mine.filter(q => q.stemShape === 'scenario').length / (mine.length || 1),
    singleLetters, multipleLetters,
    lengthBias: { longest, shortest, chance: Math.round(chance * 10) / 10 },
    similarity: { total: flags.length, byKind: count(flags, f => f.kind) },
    conflicts: { pairs: edges.length, inner: edges.filter(([a, b]) => codeOf.get(a) === codeOf.get(b)).length, across: edges.filter(([a, b]) => codeOf.get(a) !== codeOf.get(b)).length, maxDegree: Math.max(0, ...Object.values(degree)) },
    volatile: { count: reviews.length, ...reviews.length ? { nextReview: reviews[0] } : {} },
  };
}

/** Why a question is on every paper, or on none: found by drawing again without one rule at a time. */
export type DrawCause = 'quota' | 'conflicts' | 'shapes' | 'algorithm';
export interface DrawMetrics {
  seeds: number;
  succeeded: number;
  uniquePapers: number;
  violations: { duplicate: number; itemQuota: number; domainQuota: number; conflicts: number; shapes: number };
  /** Uniform draws that found no paper keeping every rule and fell back to the greedy draw. */
  fallbacks: number;
  frequency: { id: string; code: string; drawn: number; expected: number }[];
  never: { id: string; cause: DrawCause }[];
  always: { id: string; cause: DrawCause }[];
  domains: Record<string, { min: number; max: number; mean: number }>;
  multipleResponse: { min: number; max: number; mean: number };
  shapes: Record<string, { min: number; max: number; mean: number }>;
  /** T.3E: questions the draw chooses from (the subject's current revisions). */
  poolSize: number;
  /** T.3E: milliseconds per draw over the seeds (machine-dependent: compare runs on one machine). */
  latency: { mean: number; p50: number; p95: number; p99: number; max: number };
}
const percentile = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)] : 0;

/** The subject's current revisions as a draw pool, as if every one were published (a dry run). */
export const capacityPool = (bp: MockBlueprint, questions: Question[], tags: TagIndex): DrawItem[] =>
  subjectQuestions(bp, questions).map(q => drawItemOf(q, q.currentRevision, tags));

function frequencies(pool: DrawItem[], spec: DrawSpec, seeds: number): Map<string, number> {
  const use = new Map(pool.map(p => [p.questionId, 0]));
  for (let seed = 1; seed <= seeds; seed++) for (const id of drawPaper(pool, spec, seed).ids) use.set(id, use.get(id)! + 1);
  return use;
}

export function drawMetrics(bp: MockBlueprint, questions: Question[], conflicts: [string, string][], tags: TagIndex, seeds: number, causeSeeds = Math.min(seeds, 1000)): DrawMetrics {
  const pool = capacityPool(bp, questions, tags), spec = drawSpecOf(bp, conflicts, new Set(pool.map(p => p.questionId)));
  const byId = new Map(questions.map(q => [q.id, q])), codeOf = new Map(pool.map(p => [p.questionId, p.code])), shapeOf = new Map(pool.map(p => [p.questionId, p.shape ?? 'unknown']));
  const pairs = new Set(spec.conflicts.map(([a, b]) => `${a}\n${b}`));
  const domainQuota = count(Object.entries(bp.coverage).flatMap(([c, n]) => Array<string>(n).fill(domainOf(c))), d => d);
  const use = new Map(pool.map(p => [p.questionId, 0])), papers = new Set<string>();
  const v = { duplicate: 0, itemQuota: 0, domainQuota: 0, conflicts: 0, shapes: 0 };
  const domains: Record<string, number[]> = {}, mr: number[] = [], shapes: Record<string, number[]> = {};
  let succeeded = 0, fallbacks = 0;
  const times: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    let ids: string[];
    const t0 = performance.now();
    try { const d = drawPaper(pool, spec, seed); ids = d.ids; if (d.shapeGap && spec.shapeMax) v.shapes++; if (d.fallback) fallbacks++; }
    catch (e) { if (e instanceof DrawError) continue; throw e; }
    finally { times.push(performance.now() - t0); }
    succeeded++;
    if (new Set(ids).size !== ids.length || ids.length !== bp.questionCount) v.duplicate++;
    const perItem = count(ids, id => codeOf.get(id)!), perDomain = count(ids, id => domainOf(codeOf.get(id)!));
    if (Object.entries(bp.coverage).some(([c, n]) => perItem[c] !== n)) v.itemQuota++;
    if (Object.entries(domainQuota).some(([d, n]) => perDomain[d] !== n)) v.domainQuota++;
    const chosen = new Set(ids);
    if ([...chosen].some(a => [...chosen].some(b => pairs.has(`${a}\n${b}`)))) v.conflicts++;
    for (const [d, n] of Object.entries(perDomain)) (domains[d] ??= []).push(n);
    mr.push(ids.filter(id => byId.get(id)?.type === 'multiple-response').length);
    const perShape = count(ids, id => shapeOf.get(id)!);
    for (const s of SHAPES) (shapes[s] ??= []).push(perShape[s] ?? 0);
    for (const id of ids) use.set(id, use.get(id)! + 1);
    papers.add([...ids].sort().join());
  }
  // Causes: draw again with one rule lifted; a question that then varies was held by that rule.
  const lifted = {
    conflicts: frequencies(pool, { ...spec, conflicts: [] }, causeSeeds),
    shapes: frequencies(pool, { count: spec.count, coverage: spec.coverage, conflicts: spec.conflicts }, causeSeeds),
  };
  const cause = (id: string, extreme: (n: number) => boolean): DrawCause => {
    const c = codeOf.get(id)!;
    if (pool.filter(p => p.code === c).length === bp.coverage[c]) return 'quota';
    if (!extreme(lifted.conflicts.get(id)! / causeSeeds)) return 'conflicts';
    if (!extreme(lifted.shapes.get(id)! / causeSeeds)) return 'shapes';
    return 'algorithm';
  };
  const frequency = pool.map(p => ({ id: p.questionId, code: p.code, drawn: use.get(p.questionId)! / (succeeded || 1), expected: bp.coverage[p.code] / pool.filter(x => x.code === p.code).length }));
  return {
    seeds, succeeded, uniquePapers: papers.size, violations: v, fallbacks, frequency,
    never: frequency.filter(f => f.drawn === 0).map(f => ({ id: f.id, cause: cause(f.id, r => r === 0) })),
    always: frequency.filter(f => f.drawn === 1).map(f => ({ id: f.id, cause: cause(f.id, r => r === 1) })),
    domains: Object.fromEntries(Object.entries(domains).map(([d, xs]) => [d, range(xs)])),
    multipleResponse: range(mr),
    shapes: Object.fromEntries(Object.entries(shapes).map(([s, xs]) => [s, range(xs)])),
    poolSize: pool.length,
    latency: (() => {
      const sorted = [...times].sort((a, b) => a - b), r = (x: number) => Math.round(x * 1000) / 1000;
      return { mean: r(range(times).mean), p50: r(percentile(sorted, 50)), p95: r(percentile(sorted, 95)), p99: r(percentile(sorted, 99)), max: r(sorted.at(-1) ?? 0) };
    })(),
  };
}

export interface IntegrityMetrics {
  questions: number;
  revisions: number;
  /** Revisions by content hash version: legacy (1) and 2. */
  hashVersions: { legacy: number; v2: number };
  /** Revisions written after another of the same question went to version 2, but back on the legacy hash. */
  backwards: string[];
  /** Published hashes checked, and those that are not the content of their revision. */
  published: { checked: number; mismatched: string[] };
  /** Ledger records that do not match the bank (unknown question or revision, wrong hash, wrong exam). */
  ledger: string[];
}

/** The integrity of one exam's revisions, hashes and records (all of the bank when `exam` is left out). */
export function integrityMetrics(questions: Question[], published: Record<string, string>, ledger: Ledger, examOf: ExamOf, exam?: string): IntegrityMetrics {
  const mine = questions.filter(q => !exam || examOf(q) === exam), ids = new Set(mine.map(q => q.id)), byId = new Map(mine.map(q => [q.id, q]));
  const revisions = mine.flatMap(q => q.revisions);
  const keys = Object.entries(published).filter(([k]) => ids.has(k.split('@')[0]));
  return {
    questions: mine.length, revisions: revisions.length,
    hashVersions: { legacy: revisions.filter(r => r.hashVersion === undefined).length, v2: revisions.filter(r => r.hashVersion === 2).length },
    backwards: mine.flatMap(q => q.revisions.filter((r, i) => i && q.revisions[i - 1].hashVersion === 2 && r.hashVersion !== 2).map(r => `${q.id}@${r.revision}`)),
    published: { checked: keys.length, mismatched: keys.filter(([k, h]) => { const [id, n] = k.split('@'), r = byId.get(id)?.revisions[Number(n) - 1]; return !r || revisionHash(r) !== h; }).map(([k]) => k) },
    ledger: checkLedger({ ...ledger, reviews: ledger.reviews.filter(e => ids.has(e.questionId)), publications: ledger.publications.filter(e => ids.has(e.questionId)), revocations: (ledger.revocations ?? []).filter(e => ids.has(e.questionId)) }, questions, examOf, published),
  };
}

export interface GateOptions { strictUtilization?: boolean; maxP99Ms?: number }
/** Why a quality gate fails; empty when it passes. Hard rules always; utilization and latency when asked. */
export function gateFailures(bp: MockBlueprint, draws: DrawMetrics, integrity: IntegrityMetrics, options: GateOptions = {}): string[] {
  const f: string[] = [], v = draws.violations;
  if (draws.succeeded !== draws.seeds) f.push(`${bp.id}: ${draws.seeds - draws.succeeded} of ${draws.seeds} draws failed`);
  for (const [rule, n] of Object.entries(v)) if (n) f.push(`${bp.id}: ${n} papers break the ${rule} rule`);
  if (bp.sampling === 'uniform' && draws.fallbacks) f.push(`${bp.id}: ${draws.fallbacks} uniform draws fell back to the greedy draw`);
  if (options.strictUtilization && draws.never.length) f.push(`${bp.id}: never drawn: ${draws.never.map(n => `${n.id} (${n.cause})`).join(', ')}`);
  if (options.strictUtilization && draws.always.length) f.push(`${bp.id}: on every paper: ${draws.always.map(n => `${n.id} (${n.cause})`).join(', ')}`);
  if (options.maxP99Ms !== undefined && draws.latency.p99 > options.maxP99Ms) f.push(`${bp.id}: p99 draw latency ${draws.latency.p99} ms over ${options.maxP99Ms} ms`);
  if (integrity.backwards.length) f.push(`revisions back on the legacy hash: ${integrity.backwards.join(', ')}`);
  if (integrity.published.mismatched.length) f.push(`published hashes that are not their content: ${integrity.published.mismatched.join(', ')}`);
  if (integrity.ledger.length) f.push(...integrity.ledger.map(p => `ledger: ${p}`));
  return f;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (r: { min: number; max: number; mean: number }) => `${r.min}–${r.max}（平均 ${r.mean.toFixed(2)}）`;
const kv = (o: Record<string, number>) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join('、') || '—';

/** The report as Markdown (Traditional Chinese, like the other trials reports). */
export function qualityReport(bp: MockBlueprint, bank: BankMetrics, draws: DrawMetrics, integrity?: IntegrityMetrics, failures: string[] = []): string {
  const L: string[] = [`# ${bp.title}（${bp.id} ${bp.version}）題庫品質報告`, '',
    `由題庫與實際抽題計算（${draws.seeds} 個 seed，把目前版本全部當作已發布、只在記憶體中；沒有核准、發布或寫入任何紀錄）。`, '',
    '## 題庫', '',
    `- 題數 ${bank.questions}；domain：${kv(bank.byDomain)}；沒有題目的考綱項目：${bank.uncovered.join('、') || '無'}`,
    `- 題型：${kv(bank.types)}；型態：${kv(bank.shapes)}；情境題比例 ${pct(bank.scenarioRatio)}；難度：${kv(bank.difficulty)}`,
    `- 單選正解位置：${kv(bank.singleLetters)}；複選正解組合：${kv(bank.multipleLetters)}`,
    `- 選項長度：正解是最長選項 ${bank.lengthBias.longest} 題、最短 ${bank.lengthBias.shortest} 題（隨機預期約各 ${bank.lengthBias.chance} 題）`,
    `- 相似度訊號（題庫內）：${bank.similarity.total}（${kv(bank.similarity.byKind)}）`,
    `- 衝突圖：${bank.conflicts.pairs} 組（同考綱項目內 ${bank.conflicts.inner}、跨項目 ${bank.conflicts.across}），單題最多 ${bank.conflicts.maxDegree} 組`,
    `- 版本相關題目 ${bank.volatile.count}，最早複查日 ${bank.volatile.nextReview ?? '—'}`, '',
    '| 考綱項目 | 題庫 | 每卷 | 型態 | 題型 | 項目內衝突 |', '|---|---:|---:|---|---|---:|',
    ...bank.items.map(i => `| ${i.code} | ${i.bank} | ${i.quota} | ${kv(i.shapes)} | ${kv(i.types)} | ${i.innerConflicts} |`), '',
    '## 抽題', '',
    `- 成功 ${draws.succeeded}／${draws.seeds}；不同考卷 ${draws.uniquePapers}；抽題方式 ${bp.sampling === 'uniform' ? `uniform（退回 greedy ${draws.fallbacks} 次）` : 'greedy'}`,
    `- 違規卷數：重複題 ${draws.violations.duplicate}、項目配額 ${draws.violations.itemQuota}、domain 配額 ${draws.violations.domainQuota}、衝突 ${draws.violations.conflicts}、型態上限 ${draws.violations.shapes}`,
    `- 每卷 domain：${Object.entries(draws.domains).sort(([a], [b]) => a.localeCompare(b)).map(([d, r]) => `${d} ${fmt(r)}`).join('；')}`,
    `- 每卷複選題 ${fmt(draws.multipleResponse)}；每卷型態：${SHAPES.map(s => `${s} ${fmt(draws.shapes[s] ?? { min: 0, max: 0, mean: 0 })}`).join('；')}`,
    `- 單題出現率 ${pct(Math.min(...draws.frequency.map(f => f.drawn)))}–${pct(Math.max(...draws.frequency.map(f => f.drawn)))}；候選題 ${draws.poolSize} 題`,
    `- 每卷抽題時間（毫秒，視機器而定）：平均 ${draws.latency.mean}、p50 ${draws.latency.p50}、p95 ${draws.latency.p95}、p99 ${draws.latency.p99}、最大 ${draws.latency.max}`,
    `- 從未抽到 ${draws.never.length}：${draws.never.map(n => `${n.id}（${n.cause}）`).join('、') || '無'}`,
    `- 每卷都出現 ${draws.always.length}：${draws.always.map(n => `${n.id}（${n.cause}）`).join('、') || '無'}`, '',
    '原因：quota＝題庫數等於每卷配額；conflicts／shapes＝拿掉該規則重抽後就會變動；algorithm＝規則都拿掉仍然如此。', '',
    '| 題目 | 考綱 | 出現率 | 期望（配額／題數） |', '|---|---|---:|---:|',
    ...draws.frequency.map(f => `| ${f.id} | ${f.code} | ${pct(f.drawn)} | ${pct(f.expected)} |`), ''];
  if (integrity) L.push('## 版本與雜湊完整性', '',
    `- 題目 ${integrity.questions}、版本 ${integrity.revisions}：舊版雜湊（第 1 版雜湊規則）${integrity.hashVersions.legacy}、第 2 版雜湊 ${integrity.hashVersions.v2}；退回舊雜湊的版本 ${integrity.backwards.length}`,
    `- 已發布雜湊檢查 ${integrity.published.checked} 筆，不符 ${integrity.published.mismatched.length} 筆；審核帳本問題 ${integrity.ledger.length}`, '');
  L.push('## 結果', '', failures.length ? failures.map(f => `- 未通過：${f}`).join('\n') : '- 通過：沒有違反任何品質門檻', '');
  return L.join('\n');
}
