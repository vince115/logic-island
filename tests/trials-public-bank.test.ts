import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { trialBank } from '../src/content/trials';
import { conflictPairs } from '../src/content/trials/conflicts';
import { publicBatches } from '../src/content/trials/generated';
import { hasPrivateBank, privateBatches } from '../src/content/trials/private-bank';
import { contentText, currentRevisionOf, revisionHash } from '../src/content/trials/schema';
import published from '../src/content/trials/published-hashes.json';
import { keyOf, verifyManifest, type Manifest } from '../src/lib/trials/integrity';

// Shared Trial System T.3J (docs/exam-system/34): this repository is public, so it holds published questions only;
// every unpublished question — its text, answers, explanations and the files about it — is in the private bank.
const ROOT = path.join(__dirname, '..');
const own = publicBatches.flatMap(b => b.questions), ownIds = new Set(own.map(q => q.id));
const manifestText = readFileSync(path.join(ROOT, 'src/content/trials/assessment-manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText) as Manifest;

describe('the public bank', () => {
  it('holds published (or once published, then withdrawn) questions only', () => {
    expect(own.filter(q => !['published', 'revoked'].includes(q.review.status)).map(q => q.id)).toEqual([]);
  });
  it('holds every published question a deployment from this repository shows: each recorded hash is a question here', () => {
    const missing = Object.keys(published).filter(k => !ownIds.has(k.slice(0, k.lastIndexOf('@'))));
    expect(missing).toEqual([]);
  });
  it('its assessment manifest holds the entries of its own questions only, and they all match', () => {
    const keys = Object.keys(manifest.entries);
    expect(keys.filter(k => !ownIds.has(k.slice(0, k.lastIndexOf('@'))))).toEqual([]);
    expect(keys.sort()).toEqual(own.flatMap(q => q.revisions.map(r => keyOf(q, r))).sort());
    const r = verifyManifest(own, manifest);
    expect([r.ok, r.mismatched, r.unrecorded, r.missing]).toEqual([true, [], [], []]);
  });
  it('the manifest holds digests only', () => {
    for (const q of own) {
      const stem = contentText(currentRevisionOf(q)?.stem ?? []).replace(/\s+/g, '');
      if (stem.length >= 16) expect(manifestText.includes(stem.slice(0, 16)), q.id).toBe(false);
    }
  });
  it('the private bank stays out of git', () => {
    expect(readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n')).toContain('/private/');
  });
});

describe.skipIf(hasPrivateBank)('without the private bank (the public repository and its CI)', () => {
  it('the bank is the published questions alone, and no conflict pair names a question it does not hold', () => {
    expect(trialBank.questions.map(q => q.id)).toEqual([...ownIds].sort((a, b) => trialBank.questions.findIndex(q => q.id === a) - trialBank.questions.findIndex(q => q.id === b)));
    expect(trialBank.questions.every(q => q.review.status === 'published')).toBe(true);
    expect(conflictPairs().every(([a, b]) => ownIds.has(a) && ownIds.has(b))).toBe(true);
  });
});

describe.skipIf(!hasPrivateBank)('with the private bank', () => {
  it('its questions are none of this repository\'s, and none of them is published', () => {
    const theirs = privateBatches.flatMap(b => b.questions);
    expect(theirs.filter(q => ownIds.has(q.id)).map(q => q.id)).toEqual([]);
    expect(theirs.filter(q => (published as Record<string, string>)[`${q.id}@${q.currentRevision}`] === revisionHash(currentRevisionOf(q)!)).map(q => q.id)).toEqual([]);
  });
  it('the bank keeps its file order: the batches merged by id', () => {
    const ids = trialBank.questions.map(q => q.id);
    expect(ids.indexOf('ipas-aiap-basic-a-01')).toBeLessThan(ids.indexOf('moex-114-pukao-3448-q01'));
  });
});
