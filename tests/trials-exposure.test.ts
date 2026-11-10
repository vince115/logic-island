import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { examStatus, playableById, playableQuestions, trialBank } from '../src/content/trials';
import { currentRevisionOf, revisionHash } from '../src/content/trials/schema';
import { committedLedger, examResolver, planDecisions, planPublication, DECISIONS_FORMAT } from '../src/lib/trials/lifecycle';
import { paperView, reviewViews } from '../src/lib/trials/views';
import { rebuild } from '../scripts/trials/ledger-io';
import published from '../src/content/trials/published-hashes.json';
import { hasPrivateBank } from '../src/content/trials/private-bank';

// Shared Trial System T.2C: what can reach a browser, and who can change what (docs/exam-system/19 §4).
const ROOT = path.join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const siteFiles = ['src/app', 'src/components'].flatMap(d => files(path.join(ROOT, d))).filter(f => /\.(tsx?|jsx?|mjs)$/.test(f));

describe('unpublished content never reaches a page', () => {
  it('the pages look questions up among the 53 published ones only', () => {
    expect(playableQuestions).toHaveLength(53);
    expect([...playableById.keys()].some(id => id.startsWith('ipas-'))).toBe(false);
    expect(trialBank.questions.filter(q => q.review.status !== 'published').every(q => !playableById.has(q.id))).toBe(true);
  });

  it('every view a page builds — the review book and every paper — holds published questions only', () => {
    const shown = [...reviewViews().map(v => v.id), ...trialBank.papers.flatMap(p => paperView(p.id)!.questions.map(v => v.id))];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every(id => playableById.has(id))).toBe(true);
  });

  it('the iPAS exam has no paper, so no trial route is generated for it', () => {
    expect(examStatus('ipas-aiap-basic')).toBe('planned');
    expect(trialBank.papers.some(p => p.items.some(i => i.questionId.startsWith('ipas-')))).toBe(false);
  });
});

describe('review and publication are not reachable from the site', () => {
  it('no page or component imports the importer, the lifecycle, the mock preview, the ledger, the hashes or a script', () => {
    // T.2D: nor the test-only mock preview, which builds papers from unpublished questions; T.2F: nor the review and preflight tools.
    // T.3F: nor the integrity guard (node:crypto), the volatility check, the assessment manifest or a register.
    // T.3G: nor the ledger order and replay (node:crypto), the paper version registry or its checks.
    const forbidden = /@\/lib\/trials\/(import|lifecycle|ledger-order|ledger-replay|paper-versions|mock-preview|review-ops|preflight|integrity|volatility|quality)|ledger\.json|published-hashes|assessment-manifest|paper-versions\.json|-volatility\.json|scripts\/trials|review-queue/;
    expect(siteFiles.filter(f => forbidden.test(readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f))).toEqual([]);
  });

  it('there is no API route, server action or middleware: the site cannot write anything', () => {
    expect(files(path.join(ROOT, 'src/app')).filter(f => /\/route\.(ts|js)x?$/.test(f))).toEqual([]);
    expect(files(path.join(ROOT, 'src')).filter(f => /\.(tsx?|jsx?)$/.test(f) && /^\s*['"]use server['"]/m.test(readFileSync(f, 'utf8')))).toEqual([]);
    expect(['src/middleware.ts', 'src/proxy.ts', 'middleware.ts', 'proxy.ts'].filter(f => existsSync(path.join(ROOT, f)))).toEqual([]);
  });

  it('the trial pages are prerendered from fixed params and 404 without the feature flag', () => {
    for (const page of ['src/app/trials/[exam]/page.tsx', 'src/app/trials/[exam]/[paper]/page.tsx', 'src/app/trials/[exam]/[paper]/result/page.tsx']) {
      const text = readFileSync(path.join(ROOT, page), 'utf8');
      expect(text, page).toMatch(/export const dynamicParams = false;/);
      expect(text, page).toMatch(/trialsEnabled\(\)/);
    }
    for (const page of ['src/app/trials/page.tsx', 'src/app/trials/review/page.tsx']) expect(readFileSync(path.join(ROOT, page), 'utf8')).toMatch(/if \(!trialsEnabled\(\)\) notFound\(\);/);
  });
});

// T.3J: the subject is an unpublished question, in the private bank.
describe.skipIf(!hasPrivateBank)('the gate, end to end, without writing a file', () => {
  it('an approved and published revision is rebuilt as published with its hash added; nothing else changes', () => {
    const q = trialBank.questions.find(x => x.id === 'ipas-aiap-basic-a-01')!, rev = currentRevisionOf(q)!, hash = revisionHash(rev);
    const approved = planDecisions({ format: DECISIONS_FORMAT, by: 'owner', at: '2026-11-05', decisions: [{ questionId: q.id, revision: rev.revision, hash, verdict: 'approve', checks: ['answer-verified'] }] }, trialBank.questions, committedLedger, 1, examResolver(trialBank)).ledger!;
    const onlyApproved = rebuild(approved, committedLedger);
    expect(onlyApproved.ok).toBe(true);
    expect(onlyApproved.statuses.get(q.id)).toBe('approved');
    expect(onlyApproved.files.map(f => path.relative(ROOT, f.path))).toEqual(['private/question-bank/generated/2026-11-03-ipas-aiap-basic-a.json', 'src/content/trials/ledger.json']);

    const gated = planPublication([`${q.id}@${rev.revision}`], trialBank.questions, approved, 'owner', '2026-11-05', 1, published, examResolver(trialBank)).ledger!;
    const result = rebuild(gated, committedLedger);
    expect(result.statuses.get(q.id)).toBe('published');
    const hashes = JSON.parse(result.files.find(f => f.path.endsWith('published-hashes.json'))!.content);
    expect(Object.keys(hashes).filter(k => !(k in published))).toEqual([`${q.id}@${rev.revision}`]);
    expect(Object.entries(published).every(([k, v]) => hashes[k] === v)).toBe(true);
    // Only that question changed status.
    expect([...result.statuses].filter(([id, s]) => id.startsWith('ipas-') && s !== 'in-review')).toEqual([[q.id, 'published']]);
  });
});
