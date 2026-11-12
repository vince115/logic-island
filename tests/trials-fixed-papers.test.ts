import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceById, trialBank } from '../src/content/trials';
import { trialContext } from '../src/content/trials/context';
import { mockBlueprints } from '../src/content/trials/mock-exams';
import { isPlayable, validateTrials, withdrawnItems, type ExamPaper, type TrialBank } from '../src/content/trials/schema';
import { examResolver } from '../src/lib/trials/lifecycle';
import {
  PAPER_VERSIONS_FORMAT, appendPaperVersions, checkPaperVersions, paperVersionFailures, paperVersionOf, paperVersionsAppendOnly, planPaperRevision, subjectExamOf, type PaperVersions,
} from '../src/lib/trials/paper-versions';
import { exposureNeedles, paperVersionCheck } from '../src/lib/trials/preflight';
import registryFile from '../src/content/trials/paper-versions.json';
import manifestFile from '../src/content/trials/assessment-manifest.json';
import type { Manifest } from '../src/lib/trials/integrity';
import published from '../src/content/trials/published-hashes.json';
import baseline from './fixtures/published-hashes-baseline.json';
import { replan, revoke, syntheticWorld, type World } from './helpers/publication-harness';

// Shared Trial System T.3G (docs/exam-system/31 §4–8): the 53 questions published before T.2C sit in three fixed
// papers. Withdrawing one puts its paper under maintenance; a human then writes a new version without it. Everything is
// drilled in memory with a SYNTHETIC reviewer; the committed files are compared byte for byte at the end.
const ROOT = path.join(__dirname, '..');
const digest = (rel: string) => createHash('sha256').update(readFileSync(path.join(ROOT, rel))).digest('hex');
const protectedFiles = ['src/content/trials/ledger.json', 'src/content/trials/published-hashes.json', 'src/content/trials/assessment-manifest.json', 'src/content/trials/paper-versions.json', 'src/content/trials/papers.ts',
  ...readdirSync(path.join(ROOT, 'src/content/trials/generated')).map(f => `src/content/trials/generated/${f}`)];
const before = new Map(protectedFiles.map(f => [f, digest(f)]));

const registry = registryFile as PaperVersions;
const examOf = examResolver(trialBank);
const APCS = 'apcs-reading-mock-a', WITHDRAWN = 'orig-apcs-read-03', MOEX = 'moex-114-pukao-3448', MOEX_Q = 'moex-114-pukao-3448-q05';
const fixed = trialBank.papers.filter(p => p.kind === 'fixed');
const paperOf = (bank: TrialBank, id: string) => bank.papers.find(p => p.id === id)!;
const byId = (bank: TrialBank) => new Map(bank.questions.map(q => [q.id, q]));

// The withdrawal drill: withdraw one APCS original (recorded hash, no publication record) and rebuild its batch.
const w0 = syntheticWorld();
const plan = revoke(w0, [WITHDRAWN], '2026-12-10', 'SYNTHETIC: legacy fixed-paper withdrawal drill');
const out: World = replan({ ...w0, ledger: plan.ledger! }, 'mvp-originals');

describe('Phase 4: the 53 legacy published questions and their fixed papers', () => {
  it('three fixed papers hold exactly the 53, each pinned in the registry to the recorded hash', () => {
    expect(fixed.map(p => [p.id, p.version, p.items.length])).toEqual([[APCS, '1.0.0', 7], ['bank-it-mock-a', '1.0.0', 6], [MOEX, '1.0.0', 40]]);
    const legacy = trialBank.questions.filter(q => q.review.status === 'published').map(q => q.id).sort();
    expect(fixed.flatMap(p => p.items.map(i => i.questionId)).sort()).toEqual(legacy);
    expect(legacy).toHaveLength(53);
    expect(registry.format).toBe(PAPER_VERSIONS_FORMAT);
    expect(registry.versions.map(v => `${v.paperId}@${v.version}`)).toEqual([`${APCS}@1.0.0`, 'bank-it-mock-a@1.0.0', `${MOEX}@1.0.0`]);
    for (const it of registry.versions.flatMap(v => v.items)) expect(it.hash).toBe((published as Record<string, string>)[`${it.questionId}@${it.revision}`]);
    expect(checkPaperVersions(registry, trialBank, examOf)).toEqual({ problems: [], unregistered: [], maintenance: [], registered: 3 });
  });
  it('no generated (drawn) paper holds any of them: they are reachable through their fixed paper only', () => {
    const legacy = new Set(fixed.flatMap(p => p.items.map(i => i.questionId)));
    expect(trialBank.papers.filter(p => p.kind === 'generated').flatMap(p => p.items).some(i => legacy.has(i.questionId))).toBe(false);
    expect([...new Set(mockBlueprints.map(b => b.examId))].sort()).toEqual(['ccarf', 'ipas-aiap-basic']);
  });
});

describe('Phase 5–6: withdrawing a legacy question puts its paper under maintenance (no rebuild refused, nothing replaced)', () => {
  it('the rebuild now succeeds: the question is revoked, the bank validates, the 57 hashes stay', () => {
    expect(plan.ok).toBe(true);
    const q = byId(out.bank).get(WITHDRAWN)!;
    expect([q.review.status, isPlayable(q, sourceById)]).toEqual(['revoked', false]);
    expect(validateTrials(out.bank, trialContext())).toEqual([]);
    expect(out.hashes).toEqual(baseline);
  });
  it('the paper is under maintenance: same version, same items (nothing substituted), the withdrawn one reported', () => {
    const p = paperOf(out.bank, APCS);
    expect([p.version, p.items.map(i => i.questionId)]).toEqual(['1.0.0', paperOf(trialBank, APCS).items.map(i => i.questionId)]);
    expect(withdrawnItems(p, byId(out.bank))).toEqual([WITHDRAWN]);
    const r = checkPaperVersions(registry, out.bank, examOf);
    expect([r.problems, r.unregistered, r.maintenance]).toEqual([[], [], [{ paperId: APCS, version: '1.0.0', withdrawn: [WITHDRAWN] }]]);
    const c = paperVersionCheck({ bank: out.bank, paperVersions: registry, manifest: manifestFile as Manifest } as Parameters<typeof paperVersionCheck>[0]);
    expect([c.status, c.details[0]]).toEqual(['warn', `warn: ${APCS}@1.0.0: under maintenance, 1 withdrawn item(s); no new session until a new version`]);
  });
  it('the withdrawn question becomes an exposure needle: its id and stem must not reach any page', () => {
    const playable = out.bank.questions.filter(q => isPlayable(q, sourceById));
    expect(exposureNeedles(out.bank, playable, mockBlueprints, out.bank.papers.map(p => p.id))).toContain(WITHDRAWN);
    expect(exposureNeedles(trialBank, trialBank.questions.filter(q => isPlayable(q, sourceById)), mockBlueprints, trialBank.papers.map(p => p.id))).not.toContain(WITHDRAWN);
  });
  it('the other papers and every other question are exactly as they were', () => {
    const others = (w: World) => w.bank.questions.filter(q => q.id !== WITHDRAWN).map(q => [q.id, q.review.status, q.currentRevision]);
    expect(others(out)).toEqual(others(w0));
    expect(checkPaperVersions(registry, out.bank, examOf).maintenance.map(m => m.paperId)).toEqual([APCS]);
  });
});

describe('Phase 5: a new paper version without the withdrawn question', () => {
  const proposal = planPaperRevision(paperOf(out.bank, APCS), out.bank, sourceById, '1.1.0');
  const revised: TrialBank = { ...out.bank, papers: out.bank.papers.map(p => p.id === APCS ? proposal.paper! : p) };
  it('is proposed with the same items in order, pinned, without the withdrawn one, and lists what a human must decide', () => {
    expect([proposal.ok, proposal.removed]).toEqual([true, [WITHDRAWN]]);
    expect(proposal.paper!.items.map(i => i.questionId)).toEqual(paperOf(trialBank, APCS).items.map(i => i.questionId).filter(id => id !== WITHDRAWN));
    expect(proposal.paper!.items.every(i => i.revision === 1)).toBe(true);
    expect(proposal.decisions).toEqual(['total 70 → 60 points (7 → 6 questions): the description and note must say so', 'pass mark 42 was 60% of 70; it would be 70% of 60: a human sets the new one']);
  });
  it('validates, ends the maintenance, and must be registered before release (append-only; version 1.0.0 stays readable)', () => {
    expect(validateTrials(revised, trialContext())).toEqual([]);
    const r = checkPaperVersions(registry, revised, examOf);
    expect([r.maintenance, r.unregistered.map(v => `${v.paperId}@${v.version}`)]).toEqual([[], [`${APCS}@1.1.0`]]);
    expect(paperVersionFailures(r)).toEqual([`paper ${APCS}@1.1.0: not in the paper version registry (register it: trials:integrity --append)`]);
    const appended = appendPaperVersions(registry, r.unregistered);
    expect(checkPaperVersions(appended, revised, examOf)).toMatchObject({ problems: [], unregistered: [], registered: 4 });
    expect(paperVersionsAppendOnly(registry, appended)).toEqual([]);
    // The historical version is still there, exactly, and still names the withdrawn question in its revision and hash.
    expect(appended.versions[0]).toEqual(registry.versions[0]);
    expect(appended.versions[0].items.find(i => i.questionId === WITHDRAWN)).toEqual({ questionId: WITHDRAWN, revision: 1, hash: baseline[`${WITHDRAWN}@1` as keyof typeof baseline], points: 10 });
  });
  it('a rewritten or dropped registered version is refused', () => {
    const edited = { ...registry, versions: [{ ...registry.versions[0], passPoints: 36 }, ...registry.versions.slice(1)] };
    expect(paperVersionsAppendOnly(registry, edited)).toEqual([`paper version ${APCS}@1.0.0: changed in the registry (versions are append-only)`]);
    expect(paperVersionsAppendOnly(registry, { ...registry, versions: registry.versions.slice(1) })).toEqual([`paper version ${APCS}@1.0.0: removed from the registry`]);
  });
  it('a silent substitution under the same version is refused: another question, or another revision', () => {
    const swap = (p: ExamPaper): ExamPaper => ({ ...p, items: p.items.map(i => i.questionId === WITHDRAWN ? { ...i, questionId: 'orig-apcs-read-07' } : i) });
    const swapped: TrialBank = { ...trialBank, papers: trialBank.papers.map(p => p.id === APCS ? swap(p) : p) };
    expect(checkPaperVersions(registry, swapped, examOf).problems[0]).toMatch(new RegExp(`^paper ${APCS}@1.0.0: differs from its registered version \\(orig-apcs-read-07`));
    const q = byId(trialBank).get('moex-114-pukao-3448-q01')!;
    const pinnedOld: TrialBank = { ...trialBank, papers: trialBank.papers.map(p => p.id === MOEX ? { ...p, items: p.items.map(i => i.questionId === q.id ? { ...i, revision: 1 } : i) } : p) };
    expect(q.currentRevision).toBe(2);
    expect(checkPaperVersions(registry, pinnedOld, examOf).problems).toEqual([`paper ${MOEX}@1.0.0: differs from its registered version (${q.id}): a change to a fixed paper is a new version, never a silent substitution`]);
  });
  it('refuses to propose for a paper without withdrawn items, a reused version name, or a paper with nothing left; refuses an official original', () => {
    expect(planPaperRevision(paperOf(trialBank, APCS), trialBank, sourceById, '1.1.0').errors).toEqual([`${APCS}: holds no withdrawn question; nothing to revise`]);
    expect(planPaperRevision(paperOf(out.bank, APCS), out.bank, sourceById, '1.0.0').errors).toEqual([`${APCS}: the new version is a new x.y.z name (now 1.0.0)`]);
    const all = revoke(w0, paperOf(trialBank, 'bank-it-mock-a').items.map(i => i.questionId), '2026-12-10', 'SYNTHETIC');
    const empty = replan({ ...w0, ledger: all.ledger! }, 'mvp-originals');
    expect(planPaperRevision(paperOf(empty.bank, 'bank-it-mock-a'), empty.bank, sourceById, '1.1.0').errors).toEqual(['bank-it-mock-a: every item is withdrawn; the paper stays under maintenance']);
    const moex = revoke(w0, [MOEX_Q], '2026-12-10', 'SYNTHETIC');
    const moexOut = replan({ ...w0, ledger: moex.ledger! }, 'moex-114');
    expect(validateTrials(moexOut.bank, trialContext())).toEqual([]);
    // T.3H (docs/exam-system/32 §6): an official original is never revised without its questions under its own id.
    expect(planPaperRevision(paperOf(moexOut.bank, MOEX), moexOut.bank, sourceById, '1.1.0')).toMatchObject({ ok: false,
      errors: [`${MOEX}: an official original is never revised without its questions under its own id; keep it under maintenance, retire it, or propose an adapted practice paper (planAdaptedPaper)`] });
  });
});

describe('after the drill', () => {
  it('no protected file changed: ledger, hashes, manifest, paper registry, papers and generated batches are byte-identical', () => {
    expect(protectedFiles.filter(f => digest(f) !== before.get(f))).toEqual([]);
    expect(trialBank.questions.filter(q => q.review.status === 'revoked')).toEqual([]);
    expect(Object.keys(published)).toHaveLength(57);
    expect(subjectExamOf(trialBank)(paperOf(trialBank, APCS).subjectId)).toBe('apcs');
    expect(paperVersionOf(paperOf(trialBank, APCS), byId(trialBank), subjectExamOf(trialBank))).toEqual(registry.versions[0]);
  });
});
