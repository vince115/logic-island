import type { MockBlueprint } from '@/content/trials/mock-exams';
import { contentText, currentRevisionOf, isDate, revisionHash, type Question, type Source, type TrialBank } from '@/content/trials/schema';
import { drawPaper, drawProblems } from './draw';
import { assembleMockPapers, bankShortages, drawItemOf, drawSpecOf, publishedRevision, subjectQuestions } from './mock-assembly';
import { checkLedger, examResolver, lifecycleOf, type Ledger } from './lifecycle';
import { integrityFailures, verifyManifest, type Manifest } from './integrity';
import { nextSeq } from './ledger-order';
import { replayLedger, replayMismatches } from './ledger-replay';
import { checkPaperVersions, paperVersionFailures, type PaperVersions } from './paper-versions';
import { VOLATILITY_REGISTERS, volatilityFailures, volatilityReport, type Register } from './volatility';

/*
 * Shared Trial System T.2F: the release preflight (docs/exam-system/22 §2). Every check reads; none writes, approves
 * or publishes. A `fail` is a safety or integrity problem that must stop a release (the CLI exits non-zero); a `warn`
 * needs a human look; `skip` means the input was not given (a build directory, a running server).
 *
 * Readiness (whether the published pool can draw a paper yet) is not a safety problem: an exam that is not ready stays
 * 「題目準備中」 and gets no route. It fails only for the exams named in `requireReady` — the release that means to ship them.
 */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export interface Check { id: string; title: string; status: CheckStatus; details: string[] }

export interface PreflightInput {
  bank: TrialBank;
  sources: Map<string, Source>;
  ledger: Ledger;
  /** published-hashes.json. */
  recorded: Record<string, string>;
  /** The published hashes a release must keep exactly (tests/fixtures/published-hashes-baseline.json). */
  baseline: Record<string, string>;
  /** The questions the site may show (playableQuestions). */
  playable: Question[];
  blueprints: MockBlueprint[];
  conflicts: [string, string][];
  /** YYYY-MM-DD. */
  today: string;
  requireReady?: string[];
  /** Seeds drawn per blueprint in the assembly check. */
  seeds?: number;
  /** Days after which an official source should be checked again. */
  sourceMaxAgeDays?: number;
  /** T.3F: src/content/trials/assessment-manifest.json. Without it the integrity check fails (fail closed). */
  manifest?: Manifest;
  /** T.3F: each exam's volatility register (VOLATILITY_REGISTERS). A missing one fails (fail closed). */
  volatility?: Record<string, Register>;
  /** T.3G: src/content/trials/paper-versions.json. Without it the fixed paper check fails (fail closed). */
  paperVersions?: PaperVersions;
}

const check = (id: string, title: string, fails: string[], warns: string[] = [], info: string[] = []): Check =>
  ({ id, title, status: fails.length ? 'fail' : warns.length ? 'warn' : 'pass', details: [...fails, ...warns.map(w => `warn: ${w}`), ...info] });
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const keyOf = (q: Question) => `${q.id}@${q.currentRevision}`;
const tagIndex = (bank: TrialBank) => new Map(bank.tags.map(t => [t.id, t]));

/** The ledger is sound, and every question's status is what the ledger and the recorded hashes say it is. */
export function ledgerCheck({ bank, ledger, recorded }: PreflightInput): Check {
  const fails = checkLedger(ledger, bank.questions, examResolver(bank), recorded);
  for (const q of bank.questions) {
    const rev = currentRevisionOf(q);
    if (!rev) { fails.push(`${q.id}: no current revision`); continue; }
    const s = lifecycleOf(q, ledger, recorded[keyOf(q)]), hash = revisionHash(rev);
    if (q.review.status === 'published' && recorded[keyOf(q)] !== hash && !s.publication) fails.push(`${q.id}: published without a recorded hash or a publication of r${rev.revision}`);
    if (q.review.status === 'approved' && !s.approved) fails.push(`${q.id}: approved without a human approval of r${rev.revision} ${hash} in the ledger`);
    // T.3F: a withdrawal in the ledger takes effect: the question is revoked, never published, until republished.
    if (s.revoked && q.review.status !== 'revoked') fails.push(`${q.id}: r${rev.revision} is withdrawn in the ledger (${s.revoked.at}), yet ${q.review.status}`);
    if (q.review.status === 'revoked' && !s.revoked) fails.push(`${q.id}: revoked without a withdrawal of r${rev.revision} ${hash} in the ledger`);
    // Published before T.2C, a question keeps the review notes of its batch file; its recorded hash vouches for it.
    if (recorded[keyOf(q)] === hash) continue;
    if (q.review.reviews.some(r => r.reviewer !== 'human')) fails.push(`${q.id}: a review record that is not a human's`);
    const inLedger = ledger.reviews.filter(e => e.questionId === q.id).length;
    if (q.review.reviews.length !== inLedger) fails.push(`${q.id}: ${q.review.reviews.length} review records, ${inLedger} in the ledger — a record did not come from the ledger`);
  }
  // T.3F: synthetic reviewers and records belong to test fixtures only; one in the real ledger would forge an approval.
  const synthetic = /synthetic/i;
  for (const r of ledger.reviewers) if (synthetic.test(r.id) || synthetic.test(r.name)) fails.push(`ledger reviewer ${r.id}: a synthetic (test) reviewer`);
  for (const e of [...ledger.reviews, ...ledger.publications, ...ledger.revocations ?? []]) if (synthetic.test(e.by) || synthetic.test(JSON.stringify(e))) fails.push(`ledger record ${e.questionId} r${e.revision}: synthetic (test) data`);
  return check('ledger', 'Publication ledger', fails, [], [`${ledger.reviews.length} reviews, ${ledger.publications.length} publications, ${(ledger.revocations ?? []).length} withdrawals, ${ledger.reviewers.length} reviewers`]);
}

/**
 * T.3G: the ledger replayed event by event agrees with the lifecycle: no event the state machine refuses (a duplicate, a
 * publication without an approval in force, a withdrawal of what is not live, an unknown same-day order), and the same
 * revisions live and approved either way. The sequence itself is checked with the ledger (checkLedger).
 */
export function ledgerReplayCheck({ bank, ledger, recorded }: PreflightInput): Check {
  const examOf = examResolver(bank), r = replayLedger(ledger, bank.questions, recorded, examOf);
  const fails = [...r.violations, ...replayMismatches(ledger, bank.questions, r, recorded)];
  const unsequenced = r.events - r.sequenced;
  return check('ledger-replay', 'Ledger event order and replay', fails, unsequenced ? [`${unsequenced} record(s) written before event ordering: ordered by date only`] : [],
    [`${r.events} events (${r.sequenced} sequenced, last ${nextSeq(ledger) - 1}); ${r.states.size} revisions with records, ${[...r.states.values()].filter(s => s.live).length} live through the ledger`]);
}

/** Every recorded hash is the content of the revision it names; every published question is the content that was published. */
export function revisionHashCheck({ bank, recorded, sources }: PreflightInput): Check {
  const fails: string[] = [], byId = new Map(bank.questions.map(q => [q.id, q]));
  for (const [key, hash] of Object.entries(recorded)) {
    const [id, r] = key.split('@'), q = byId.get(id), rev = q?.revisions.find(x => x.revision === Number(r));
    if (!q || !rev) fails.push(`published-hashes ${key}: no such question revision`);
    else if (revisionHash(rev) !== hash) fails.push(`published-hashes ${key}: ${hash} is not its content (${revisionHash(rev)})`);
  }
  for (const q of bank.questions.filter(x => x.review.status === 'published')) {
    const { reason } = publishedRevision(q, sources, recorded);
    if (reason && !reason.includes('not published')) fails.push(`${q.id}: ${reason}`);
  }
  return check('revision-hash', 'Revision / hash', fails);
}

/** The published set only grows through the gate: every baseline hash is kept, every new one has a publication. */
export function publishedRegressionCheck({ bank, ledger, recorded, baseline }: PreflightInput): Check {
  const fails: string[] = [];
  for (const [key, hash] of Object.entries(baseline)) {
    if (!(key in recorded)) fails.push(`${key}: removed from published-hashes.json`);
    else if (recorded[key] !== hash) fails.push(`${key}: hash changed ${hash} → ${recorded[key]}`);
  }
  const added = Object.keys(recorded).filter(k => !(k in baseline));
  for (const key of added) {
    const [id, r] = key.split('@');
    if (!ledger.publications.some(p => p.questionId === id && p.revision === Number(r) && p.hash === recorded[key])) fails.push(`${key}: added without a publication in the ledger`);
  }
  const published = bank.questions.filter(q => q.review.status === 'published').length;
  return check('published-hashes', 'Published question count and hash regression', fails, [],
    [`${published} published questions; ${Object.keys(recorded).length} recorded hashes (baseline ${Object.keys(baseline).length}, added through the gate ${added.length})`]);
}

/** Nothing unpublished can reach a page: the playable list, the fixed papers and the generated papers. */
export function exposureDataCheck({ bank, playable, recorded, sources, blueprints, conflicts }: PreflightInput): Check {
  const fails: string[] = [], ok = new Set(playable.map(q => q.id));
  for (const q of playable) if (q.review.status !== 'published') fails.push(`${q.id}: playable while ${q.review.status}`);
  for (const p of bank.papers) {
    for (const i of p.items) if (!ok.has(i.questionId)) fails.push(`paper ${p.id}: ${i.questionId} is not playable`);
    if (p.kind === 'generated') {
      const bp = blueprints.find(b => p.id.startsWith(`${b.id}-`));
      if (!bp) { fails.push(`paper ${p.id}: generated without a blueprint`); continue; }
      const report = assembleMockPapers(bp, bank.questions, sources, recorded, conflicts, tagIndex(bank));
      if (!report.papers.length) fails.push(`paper ${p.id}: its blueprint is not ready, yet the paper exists`);
      for (const i of p.items) if (publishedRevision(bank.questions.find(q => q.id === i.questionId)!, sources, recorded).revision !== i.revision) fails.push(`paper ${p.id}: ${i.questionId} r${i.revision} is not its published revision`);
    }
  }
  return check('exposure-data', 'Unpublished question exposure (data)', fails, [], [`${playable.length} playable questions, ${bank.papers.length} papers`]);
}

/** Per blueprint: how far the published pool is from every syllabus quota. */
export function coverageCheck({ bank, sources, recorded, blueprints, conflicts, requireReady = [] }: PreflightInput): Check {
  const fails: string[] = [], warns: string[] = [], info: string[] = [];
  for (const bp of blueprints) {
    const r = assembleMockPapers(bp, bank.questions, sources, recorded, conflicts, tagIndex(bank));
    const missing = Object.entries(bp.coverage).reduce((n, [code, quota]) => n + Math.max(0, quota - r.pool.filter(p => p.code === code).length), 0);
    const line = `${bp.id}: ${r.pool.length} published of ${subjectQuestions(bp, bank.questions).length}; ${missing ? `${missing} more published questions needed (${Object.entries(bp.coverage).filter(([code, quota]) => r.pool.filter(p => p.code === code).length < quota).length} syllabus items short)` : 'every syllabus quota met'}`;
    if (missing && requireReady.includes(bp.examId)) fails.push(`${line} — the release requires ${bp.examId} to be ready`);
    else info.push(missing ? `${line}; stays 題目準備中` : line);
  }
  return check('syllabus-coverage', 'Syllabus coverage of the published pool', fails, warns, info);
}

/** The blueprints are sound, the whole bank could fill a paper once published, and ready pools draw valid papers. */
export function assemblyCheck({ bank, sources, recorded, blueprints, conflicts, seeds = 50, requireReady = [] }: PreflightInput): Check {
  const fails: string[] = [], warns: string[] = [], info: string[] = [], tags = tagIndex(bank);
  for (const bp of blueprints) {
    const report = assembleMockPapers(bp, bank.questions, sources, recorded, conflicts, tags);
    fails.push(...report.errors);
    // T.3B: a bank still being written cannot fill a paper even if all of it were published; not a safety problem
    // (no paper is built), unless the release means to ship that exam.
    const short = bankShortages(bp, bank.questions, tags);
    if (short.length) {
      (requireReady.includes(bp.examId) ? fails : info).push(`${bp.id} (whole bank): ${short.length} syllabus items short of a paper; capacity draw skipped${requireReady.includes(bp.examId) ? '' : ', stays 題目準備中'}`);
      continue;
    }
    // Capacity: the subject's current revisions as if all were published (a dry run; nothing is published).
    const all = subjectQuestions(bp, bank.questions).map(q => drawItemOf(q, q.currentRevision, tags));
    const ids = new Set(all.map(p => p.questionId));
    const spec = drawSpecOf(bp, conflicts, ids);
    const problems = drawProblems(all, spec);
    if (problems.length) { fails.push(...problems.map(p => `${bp.id} (whole bank): ${p}`)); continue; }
    const pools: [string, typeof all][] = [['whole bank', all], ...report.papers.length ? [['published pool', report.pool] as [string, typeof all]] : []];
    for (const [name, pool] of pools) {
      const poolIds = new Set(pool.map(p => p.questionId)), poolSpec = { ...spec, conflicts: spec.conflicts.filter(([a, b]) => poolIds.has(a) && poolIds.has(b)) };
      let clashes = 0, gaps = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const d = drawPaper(pool, poolSpec, seed);
        if (d.ids.length !== bp.questionCount || new Set(d.ids).size !== d.ids.length) fails.push(`${bp.id} (${name}) seed ${seed}: ${d.ids.length} questions, ${new Set(d.ids).size} distinct`);
        const code = new Map(pool.map(p => [p.questionId, p.code]));
        for (const [c, n] of Object.entries(bp.coverage)) if (d.ids.filter(id => code.get(id) === c).length !== n) fails.push(`${bp.id} (${name}) seed ${seed}: ${c} quota not met`);
        if (d.ids.some(id => !poolIds.has(id))) fails.push(`${bp.id} (${name}) seed ${seed}: drew outside the pool`);
        clashes += d.conflicts.length; gaps += d.shapeGap;
        // T.3D: paper shape limits are a hard rule.
        if (bp.shapeMax && d.shapeGap) fails.push(`${bp.id} (${name}) seed ${seed}: over the paper shape limits`);
      }
      if (clashes) warns.push(`${bp.id} (${name}): ${clashes} conflict pairs kept together over ${seeds} seeds`);
      info.push(`${bp.id} (${name}): ${seeds} seeds drawn, ${clashes} conflicts, shape gap ${gaps}`);
    }
  }
  return check('assembly', 'Exam assembly', fails, warns, info);
}

/** The conflict graph names existing questions of one subject, once each. */
export function conflictCheck({ bank, conflicts }: PreflightInput): Check {
  const fails: string[] = [], byId = new Map(bank.questions.map(q => [q.id, q])), seen = new Set<string>();
  const subject = (q: Question) => q.appearances.map(a => a.subjectId).sort().join();
  for (const [a, b] of conflicts) {
    const k = [a, b].sort().join('/');
    if (a === b) fails.push(`${k}: a question conflicts with itself`);
    if (seen.has(k)) fails.push(`${k}: listed twice`);
    seen.add(k);
    const x = byId.get(a), y = byId.get(b);
    if (!x || !y) fails.push(`${k}: unknown question`);
    else if (subject(x) !== subject(y)) fails.push(`${k}: joins two subjects`);
  }
  return check('conflicts', 'Conflict graph', fails, [], [`${conflicts.length} pairs`]);
}

/** Volatile questions carry a review date; a published one past it stops the release, any other is a warning. */
export function volatileCheck({ bank, today }: PreflightInput): Check {
  const fails: string[] = [], warns: string[] = [];
  const volatile = bank.questions.filter(q => !q.retired && q.tags.includes('meta.volatile'));
  for (const q of volatile) {
    if (!q.reviewBy || !isDate(q.reviewBy)) { fails.push(`${q.id}: volatile without a review date`); continue; }
    const left = days(today, q.reviewBy);
    if (left < 0) (q.review.status === 'published' ? fails : warns).push(`${q.id}: review date ${q.reviewBy} has passed (${q.review.status})`);
    else if (left <= 30) warns.push(`${q.id}: review date ${q.reviewBy} in ${left} days`);
  }
  for (const e of bank.editions) {
    if (e.reviewBy < today) (bank.papers.some(p => bank.subjects.find(s => s.id === p.subjectId)?.editionId === e.id) ? fails : warns).push(`edition ${e.id}: review date ${e.reviewBy} has passed`);
  }
  const next = volatile.map(q => q.reviewBy!).sort()[0];
  return check('volatile', 'Volatile question review dates', fails, warns, [`${volatile.length} volatile questions${next ? `; next review ${next}` : ''}`]);
}

/** The official-style modes keep the subject's official format, and say which brochure version they follow. */
export function officialSourceCheck({ bank, sources, blueprints, today, sourceMaxAgeDays = 180 }: PreflightInput): Check {
  const fails: string[] = [], warns: string[] = [], info: string[] = [];
  for (const bp of blueprints) {
    const subject = bank.subjects.find(s => s.id === bp.subjectId), edition = bank.editions.find(e => e.id === subject?.editionId);
    if (!subject || !edition) { fails.push(`${bp.id}: no subject or edition ${bp.subjectId}`); continue; }
    const versions = edition.basis.map(b => sources.get(b.sourceId)).filter((s): s is Source => !!s?.version).map(s => s.version!);
    for (const b of edition.basis) {
      if (!sources.has(b.sourceId)) fails.push(`${edition.id}: basis ${b.sourceId} is not a source`);
      else if (days(b.checkedAt, today) > sourceMaxAgeDays) warns.push(`${edition.id}: ${b.sourceId} last checked ${b.checkedAt} (over ${sourceMaxAgeDays} days)`);
    }
    for (const m of bp.modes) {
      if (m.examMode !== 'official-style') continue;
      const f = subject.format;
      if (m.durationMinutes !== f.durationMinutes) fails.push(`${bp.id} official-style: ${m.durationMinutes} minutes, the brochure says ${f.durationMinutes}`);
      if (bp.questionCount !== f.questionCount) fails.push(`${bp.id} official-style: ${bp.questionCount} questions, the brochure says ${f.questionCount}`);
      // T.3B: the official total and pass mark only where the official format states them (none for a scaled score).
      if (f.totalPoints !== undefined && bp.questionCount * bp.pointsPerQuestion !== f.totalPoints) fails.push(`${bp.id} official-style: ${bp.questionCount * bp.pointsPerQuestion} points, the brochure says ${f.totalPoints}`);
      if (m.passPoints !== f.passPoints) fails.push(`${bp.id} official-style: pass ${m.passPoints}, the brochure says ${f.passPoints}`);
      if (m.passPoints !== undefined && (!m.passBasis || !versions.some(v => m.passBasis!.includes(v)))) fails.push(`${bp.id} official-style: the pass basis names no brochure version (${versions.join(', ')})`);
    }
    if (bp.result.score === 'raw-correct' && bp.modes.some(m => m.passPoints !== undefined)) fails.push(`${bp.id}: shows only the number right, yet a mode gives a pass verdict`);
    info.push(`${bp.id}: edition ${edition.id}, sources ${versions.join(' / ')}`);
  }
  return check('official-source', 'Official brochure version', fails, warns, [...new Set(info)]);
}

// ---- the build -------------------------------------------------------------------------------------------------

/** Strings that only unpublished content has: question ids, a stretch of each stem, unready paper ids, review files. */
export function exposureNeedles(bank: TrialBank, playable: Question[], blueprints: MockBlueprint[], readyPaperIds: string[]): string[] {
  const shown = playable.map(q => contentText([...currentRevisionOf(q)?.stem ?? [], ...currentRevisionOf(q)?.options?.flatMap(o => o.body) ?? []])).join('\n');
  // T.3F: nor the assessment manifest and the volatility register (tooling files the site never reads).
  // T.3G: nor the paper version registry.
  const ok = new Set(playable.map(q => q.id)), needles = new Set<string>(['trials-ledger', 'trials-review-queue', 'logic-island.trials-review/1', 'trials-assessment-manifest', 'trials-volatility-register', 'trials-paper-versions']);
  for (const q of bank.questions.filter(x => !ok.has(x.id))) {
    needles.add(q.id);
    const stem = contentText(currentRevisionOf(q)?.stem ?? []).replace(/\s+/g, '');
    if (stem.length >= 24) needles.add(stem.slice(8, 24));
  }
  for (const bp of blueprints) for (const m of bp.modes) if (!readyPaperIds.includes(`${bp.id}-${m.idSuffix}`)) needles.add(`${bp.id}-${m.idSuffix}`);
  // A needle that a shown question also contains would flag published content: drop it.
  return [...needles].filter(n => !shown.replace(/\s+/g, '').includes(n));
}

/** Files of the client bundle and the prerendered pages that hold any needle. */
export function leakCheck(files: { path: string; text: string }[] | undefined, needles: string[]): Check {
  if (!files) return { id: 'bundle-leak', title: 'Client bundle leakage', status: 'skip', details: ['no build directory given (--build .next)'] };
  const fails: string[] = [];
  for (const f of files) {
    const hit = needles.find(n => f.text.includes(n));
    if (hit) fails.push(`${f.path}: holds "${hit}"`);
  }
  return check('bundle-leak', 'Client bundle leakage', fails, [], [`${files.length} client and prerendered files scanned for ${needles.length} needles`]);
}

/**
 * The routes a build exposes: every /trials route is one of the allowed (an available exam, a built paper), and the
 * app has no route handler (an API) at all.
 */
export function routeCheck(routes: string[] | undefined, handlers: string[] | undefined, allowed: Set<string>, needles: string[]): Check {
  if (!routes) return { id: 'routes', title: 'Runtime route exposure', status: 'skip', details: ['no build directory given (--build .next)'] };
  const fails: string[] = [];
  for (const r of routes.filter(x => x === '/trials' || x.startsWith('/trials/'))) if (!allowed.has(r)) fails.push(`${r}: built, but not an available exam or paper`);
  for (const r of routes) { const n = needles.find(x => r.includes(x)); if (n) fails.push(`${r}: route names unpublished ${n}`); }
  for (const h of handlers ?? []) fails.push(`${h}: a route handler (API) is built`);
  return check('routes', 'Runtime route exposure', fails, [], [`${routes.length} prerendered routes, ${routes.filter(x => x.startsWith('/trials')).length} under /trials`]);
}

/** The /trials routes the bank allows: the hall, the review book, each available exam, each paper and its result. */
export function allowedTrialRoutes(bank: TrialBank): Set<string> {
  const examOf = (subjectId: string) => bank.editions.find(e => e.id === bank.subjects.find(s => s.id === subjectId)?.editionId)?.examId;
  const out = new Set(['/trials', '/trials/review']);
  for (const p of bank.papers) {
    const exam = examOf(p.subjectId);
    if (!exam) continue;
    out.add(`/trials/${exam}`); out.add(`/trials/${exam}/${p.id}`); out.add(`/trials/${exam}/${p.id}/result`);
  }
  return out;
}

/** T.3F: every revision is the content its manifest entry recorded (explanations included, legacy hash or not). */
export function assessmentIntegrityCheck({ bank, manifest }: PreflightInput): Check {
  if (!manifest) return check('assessment-integrity', 'Assessment integrity (manifest)', ['no assessment manifest given: integrity cannot be shown']);
  const r = verifyManifest(bank.questions, manifest);
  return check('assessment-integrity', 'Assessment integrity (manifest)', integrityFailures(r), [], [`${r.revisions} revisions (${r.hashVersions.legacy} legacy hash, ${r.hashVersions.v2} version 2) against ${Object.keys(manifest.entries).length} manifest entries`]);
}

/** T.3F: no record, blueprint pool or paper mixes certifications. */
export function crossExamCheck({ bank, blueprints, ledger, paperVersions }: PreflightInput): Check {
  const fails: string[] = [], examOf = examResolver(bank), byId = new Map(bank.questions.map(q => [q.id, q]));
  // A question of a drawn (blueprint) exam belongs to that exam alone. The original practice questions of the fixed
  // papers may target several exams (core and related); they hold no ledger record and enter no drawn paper.
  const subjectExam = (subjectId: string) => bank.editions.find(e => e.id === bank.subjects.find(s => s.id === subjectId)?.editionId)?.examId;
  const drawn = new Set(blueprints.map(b => b.examId));
  for (const q of bank.questions) {
    const exams = new Set(q.appearances.map(a => subjectExam(a.subjectId)));
    if (exams.size > 1 && [...exams].some(e => e && drawn.has(e))) fails.push(`${q.id}: belongs to ${[...exams].join(' and ')}`);
  }
  for (const bp of blueprints) for (const q of subjectQuestions(bp, bank.questions)) if (examOf(q) !== bp.examId) fails.push(`${bp.id}: ${q.id} belongs to ${examOf(q)}, not ${bp.examId}`);
  for (const p of bank.papers) for (const i of p.items) { const q = byId.get(i.questionId); if (q && examOf(q) !== undefined && examOf(q) !== subjectExam(p.subjectId)) fails.push(`paper ${p.id}: ${q.id} belongs to ${examOf(q)}`); }
  for (const e of [...ledger.reviews, ...ledger.publications, ...ledger.revocations ?? []]) { const q = byId.get(e.questionId); if (q && e.exam !== undefined && e.exam !== examOf(q)) fails.push(`ledger ${e.questionId} r${e.revision}: names exam ${e.exam}, the question belongs to ${examOf(q)}`); }
  // T.3G: a registered fixed paper version names the exam of its subject.
  for (const v of paperVersions?.versions ?? []) if (subjectExam(v.subjectId) !== v.exam) fails.push(`paper version ${v.paperId}@${v.version}: names exam ${v.exam}, its subject belongs to ${subjectExam(v.subjectId)}`);
  const exams = new Set(bank.questions.map(q => examOf(q)).filter(Boolean));
  return check('cross-exam', 'Cross-certification isolation', fails, [], [`${exams.size} exams; ${blueprints.length} blueprints and ${bank.papers.length} papers each draw from one exam`]);
}

/** T.3F: each volatility register matches the bank: every volatile question registered, verified on its current content. */
export function volatilityRegisterCheck({ bank, volatility, today }: PreflightInput): Check {
  const fails: string[] = [], warns: string[] = [], info: string[] = [], examOf = examResolver(bank);
  for (const exam of Object.keys(VOLATILITY_REGISTERS)) {
    const register = volatility?.[exam];
    // T.3J: without the private bank there is no question of the exam to register (the published ones are in fixed papers).
    if (!register && !bank.questions.some(q => examOf(q) === exam)) { info.push(`${exam}: no question of this exam in the bank; no register needed`); continue; }
    if (!register) { fails.push(`${exam}: no volatility register given (${VOLATILITY_REGISTERS[exam]} in the private bank)`); continue; }
    const r = volatilityReport(bank.questions, examOf, exam, register, today);
    fails.push(...volatilityFailures(r));
    warns.push(...r.rows.filter(x => x.flags.includes('due-soon') || x.flags.includes('overdue')).map(x => `${x.id}: review date ${x.reviewBy} (${x.daysLeft} days)`));
    info.push(`${exam}: ${r.counts.questions} volatile questions; technical ${['ai-checked', 'human-verified', 'pending-verification'].map(s => `${s} ${r.rows.filter(x => x.technical === s).length}`).join(', ')}; sources ${r.rows.filter(x => x.availability === 'available').length} last seen available`);
  }
  return check('volatility-register', 'Version-sensitive questions (register)', fails, warns, info);
}

/**
 * T.3G (docs/exam-system/31 §5–6): fixed papers and what they depend on. Every fixed paper is its registered version
 * exactly (no question swapped or revised under the same version), every registered version is still readable, and a
 * paper holding a withdrawn question is under maintenance (reported, not failed: it takes no new session).
 */
export function paperVersionCheck({ bank, paperVersions, manifest }: PreflightInput): Check {
  const r = checkPaperVersions(paperVersions, bank, examResolver(bank));
  // Historical session safety: every question a registered version held is fingerprinted, so a session taken on any
  // version can still be checked against exactly what it assessed.
  const unfingerprinted = (paperVersions?.versions ?? []).flatMap(v => v.items.filter(it => !manifest?.entries[`${it.questionId}@${it.revision}`]).map(it => `paper version ${v.paperId}@${v.version}: ${it.questionId} r${it.revision} is not in the assessment manifest`));
  return check('paper-versions', 'Fixed paper versions and dependencies', [...paperVersionFailures(r), ...unfingerprinted],
    r.maintenance.map(m => `${m.paperId}@${m.version}: under maintenance, ${m.withdrawn.length} withdrawn item(s); no new session until a new version`),
    [`${bank.papers.filter(p => p.kind === 'fixed').length} fixed papers, ${r.registered} registered versions`]);
}

/** Every data check, in report order. */
export function dataChecks(input: PreflightInput): Check[] {
  return [ledgerCheck, ledgerReplayCheck, revisionHashCheck, assessmentIntegrityCheck, paperVersionCheck, publishedRegressionCheck, exposureDataCheck, crossExamCheck, coverageCheck, assemblyCheck, conflictCheck, volatileCheck, volatilityRegisterCheck, officialSourceCheck].map(f => f(input));
}
