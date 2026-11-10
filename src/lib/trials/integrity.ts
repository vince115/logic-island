import { createHash } from 'node:crypto';
import type { Question, QuestionRevision } from '@/content/trials/schema';
import { revisionHash } from '@/content/trials/schema';

/*
 * Shared Trial System T.3F: the assessment integrity guard (docs/exam-system/30 §2–3).
 *
 * The content hash identifies a revision in the ledger, the published hashes and every session, and it never changes.
 * The legacy hash (version 1) covers stem, options, answer and points only, so a revision written before T.3E could
 * have its explanation or an option's explanation edited in place without its identity changing. The manifest closes
 * that gap without touching any identity: for every revision it records a SHA-256 fingerprint of everything that was
 * assessed and taught — stem, options, answer, points, explanation, each option's explanation, the question type and
 * the display rights — plus one digest per part, so a mismatch names what changed.
 *
 * Verification only reads. Nothing here repairs, migrates or recomputes a content hash; a legitimate change is a new
 * revision (version 2 hash, a new review), and the manifest only ever gains entries for revisions it has not seen
 * (`appendEntries`). Node-only (node:crypto): no page may import it (tests/trials-exposure.test.ts).
 */
export const MANIFEST_FORMAT = 'logic-island.trials-assessment-manifest/1';
export const PARTS = ['stem', 'options', 'answer', 'points', 'explanation', 'optionExplanations', 'config'] as const;
export type Part = typeof PARTS[number];

export interface ManifestEntry {
  /** 1: legacy content hash; 2: version 2. */
  hashVersion: 1 | 2;
  /** The revision's content hash when it was recorded (its identity; never recomputed into the manifest). */
  contentHash: string;
  /** SHA-256 of every part, in order. */
  fingerprint: string;
  /** The first 16 hex digits of each part's SHA-256. */
  parts: Record<Part, string>;
}
export interface Manifest { format: typeof MANIFEST_FORMAT; algorithm: 'sha256'; covers: readonly Part[]; entries: Record<string, ManifestEntry> }

/** JSON with object keys sorted, so a reordered file is not a change of content. */
export const canonical = (x: unknown): string => {
  if (x === undefined) return 'null';
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().filter(k => (x as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(x);
};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** What each part of a revision is, as the manifest sees it. */
export function partsOf(q: Pick<Question, 'id' | 'type'>, rev: QuestionRevision): Record<Part, unknown> {
  const { options: notes, ...explanation } = rev.explanation ?? {};
  return {
    stem: rev.stem, options: rev.options, answer: rev.answer, points: rev.points,
    explanation: rev.explanation ? explanation : undefined, optionExplanations: notes,
    config: { id: q.id, type: q.type, revision: rev.revision, hashVersion: rev.hashVersion ?? 1, display: rev.display },
  };
}

export function entryOf(q: Pick<Question, 'id' | 'type'>, rev: QuestionRevision): ManifestEntry {
  const p = partsOf(q, rev), text = PARTS.map(k => canonical(p[k]));
  return {
    hashVersion: rev.hashVersion ?? 1, contentHash: revisionHash(rev), fingerprint: sha(`${MANIFEST_FORMAT}\n${text.join('\n')}`),
    parts: Object.fromEntries(PARTS.map((k, i) => [k, sha(text[i]).slice(0, 16)])) as Record<Part, string>,
  };
}

export const keyOf = (q: Pick<Question, 'id'>, rev: Pick<QuestionRevision, 'revision'>) => `${q.id}@${rev.revision}`;

export interface Mismatch { key: string; parts: Part[]; contentHash?: { recorded: string; now: string }; hashVersion?: { recorded: number; now: number } }
export interface IntegrityReport {
  ok: boolean;
  revisions: number;
  hashVersions: { legacy: number; v2: number };
  /** Revisions whose content is not what the manifest recorded. */
  mismatched: Mismatch[];
  /** Revisions the manifest has never seen (a new revision not yet appended, or a question added without review). */
  unrecorded: string[];
  /** Manifest entries whose revision is gone from the bank (a revision must never be removed). */
  missing: string[];
  /** Problems with the manifest file itself. */
  problems: string[];
}

/** Compares every revision of the bank with the manifest; reads only, repairs nothing. */
export function verifyManifest(questions: Question[], manifest: Manifest): IntegrityReport {
  const problems: string[] = [];
  if (manifest?.format !== MANIFEST_FORMAT) problems.push(`manifest: format is "${MANIFEST_FORMAT}"`);
  if (manifest?.algorithm !== 'sha256') problems.push('manifest: algorithm is sha256');
  if (JSON.stringify(manifest?.covers) !== JSON.stringify(PARTS)) problems.push(`manifest: covers ${PARTS.join(', ')}`);
  const entries = manifest?.entries ?? {}, seen = new Set<string>(), mismatched: Mismatch[] = [], unrecorded: string[] = [];
  let legacy = 0, v2 = 0;
  for (const q of questions) for (const rev of q.revisions) {
    const key = keyOf(q, rev), now = entryOf(q, rev), was = entries[key];
    if (rev.hashVersion === 2) v2++; else legacy++;
    seen.add(key);
    if (!was) { unrecorded.push(key); continue; }
    const parts = PARTS.filter(p => was.parts?.[p] !== now.parts[p]);
    const m: Mismatch = { key, parts };
    if (was.contentHash !== now.contentHash) m.contentHash = { recorded: was.contentHash, now: now.contentHash };
    if (was.hashVersion !== now.hashVersion) m.hashVersion = { recorded: was.hashVersion, now: now.hashVersion };
    if (parts.length || m.contentHash || m.hashVersion || was.fingerprint !== now.fingerprint) mismatched.push(m);
  }
  const missing = Object.keys(entries).filter(k => !seen.has(k));
  return { ok: !problems.length && !mismatched.length && !unrecorded.length && !missing.length, revisions: legacy + v2, hashVersions: { legacy, v2 }, mismatched, unrecorded, missing, problems };
}

/** One line per problem, naming revisions, parts and hashes only (never question text or answers). */
export function integrityFailures(r: IntegrityReport): string[] {
  return [
    ...r.problems,
    ...r.mismatched.map(m => `${m.key}: ${[m.parts.length ? `changed ${m.parts.join(', ')}` : '', m.contentHash ? `content hash ${m.contentHash.recorded} → ${m.contentHash.now}` : '', m.hashVersion ? `hash version ${m.hashVersion.recorded} → ${m.hashVersion.now}` : ''].filter(Boolean).join('; ') || 'fingerprint differs'} — edit through a new revision, never in place`),
    ...r.unrecorded.map(k => `${k}: not in the assessment manifest (append it with trials:integrity --append after review of the diff)`),
    ...r.missing.map(k => `${k}: in the manifest but gone from the bank (a revision is never removed)`),
  ];
}

/** Entries of `base` (an earlier manifest) that `current` changed or dropped: the manifest only ever grows. */
export function appendOnlyFailures(base: Manifest, current: Manifest): string[] {
  const out: string[] = [];
  for (const [k, e] of Object.entries(base.entries ?? {})) {
    const now = current.entries?.[k];
    if (!now) out.push(`${k}: removed from the manifest`);
    else if (canonical(now) !== canonical(e)) out.push(`${k}: its manifest entry was rewritten`);
  }
  return out;
}

/**
 * The manifest with entries added for revisions it has not seen. Refuses (returns problems, no manifest) while any
 * recorded revision mismatches or is missing: a tampered revision is never written over.
 */
export function appendEntries(questions: Question[], manifest: Manifest | undefined): { manifest?: Manifest; added: string[]; problems: string[] } {
  const base: Manifest = manifest ?? { format: MANIFEST_FORMAT, algorithm: 'sha256', covers: PARTS, entries: {} };
  const r = verifyManifest(questions, base);
  const problems = [...r.problems, ...integrityFailures({ ...r, unrecorded: [] })];
  if (problems.length) return { added: [], problems };
  const entries = { ...base.entries };
  const byKey = new Map(questions.flatMap(q => q.revisions.map(rev => [keyOf(q, rev), [q, rev] as const])));
  for (const k of r.unrecorded) { const [q, rev] = byKey.get(k)!; entries[k] = entryOf(q, rev); }
  return { manifest: { ...base, entries: Object.fromEntries(Object.keys(entries).sort().map(k => [k, entries[k]])) }, added: r.unrecorded, problems: [] };
}
