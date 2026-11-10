import { BASE_FILES, CI_BASE_FORMAT, ZERO_SHA, resolveBase, type BaseResolution, type CiEvent, type GitReader } from './ci-base';
import { appendOnlyFailures, canonical, type Manifest } from './integrity';
import { ledgerAppendOnlyFailures } from './ledger-order';
import type { Ledger } from './lifecycle';
import { paperVersionsAppendOnly, type PaperVersions } from './paper-versions';

/*
 * Shared Trial System T.3I: the explicit CI bootstrap (docs/exam-system/33 §2–3).
 *
 * The append-only checks compare the release files with a trusted base. Before the first push of trials/mvp no base
 * holds them: the merge-base with main predates every release file. T.3H compared "without a base" whenever a file
 * was absent there — silently, for any event and any branch. T.3I removes that: a resolved base that lacks the release
 * files fails, except in the one situation a committed declaration names, which is then a bootstrap and says so.
 *
 * A bootstrap is allowed only when every one of these holds (bootstrapEligibility):
 *   - the base was resolved and trusted (resolveBase): a missing, shallow or unrelated base never becomes a bootstrap;
 *   - the declaration (BOOTSTRAP_DECLARATION, in the pushed commit) is well formed;
 *   - the event is the declared one: the first push of the declared branch in the declared repository, or a pull
 *     request from that branch into the default branch;
 *   - the resolved base is exactly the declared base, and holds none of the release files (a base that holds any of
 *     them is a trusted base and is compared with; one that holds some of them is never a bootstrap);
 *   - the declared anchor is in the history of the head, and holds the release files byte for byte as declared;
 *   - the head holds them byte for byte as declared.
 * Anything else fails closed. The declaration pins the baseline: it does not prove the history before it (UNVERIFIABLE).
 */
export const BOOTSTRAP_FORMAT = 'logic-island.trials-ci-bootstrap/1';
export const DECLARATION_FORMAT = 'logic-island.trials-ci-bootstrap-declaration/1';
export const BOOTSTRAP_DECLARATION = 'docs/exam-system/governance/ci-bootstrap.json';
/** The files the baseline pins: those the base comparison reads, and the published hashes. */
export const BOOTSTRAP_FILES = { ...BASE_FILES, 'published-hashes': 'src/content/trials/published-hashes.json' } as const;
export type BootstrapFile = keyof typeof BOOTSTRAP_FILES;

export interface BootstrapDeclaration {
  format: typeof DECLARATION_FORMAT;
  repository: string;
  branch: string;
  defaultBranch: string;
  /** The trusted base the first run resolves (the merge-base with the default branch). */
  base: string;
  /** A commit of the branch whose release files are the baseline. */
  anchor: string;
  /** sha256 of each release file at the anchor. */
  files: Record<BootstrapFile, string>;
  declaredAt: string;
  note?: string;
}
export interface BootstrapGit extends GitReader {
  /** Whether `path` exists in `commit`. */
  has(commit: string, path: string): boolean;
  /** sha256 (hex) of `path` in `commit`, when it exists. */
  digestAt(commit: string, path: string): string | undefined;
}
export interface EligibilityCheck { id: string; ok: boolean; detail: string }
export interface Eligibility { eligible: boolean; checks: EligibilityCheck[] }

const SHA = /^[0-9a-f]{40}$/, DIGEST = /^[0-9a-f]{64}$/;

export function declarationProblems(raw: unknown): string[] {
  const d = raw as Partial<BootstrapDeclaration> | null;
  if (!d || typeof d !== 'object') return ['no declaration'];
  const out: string[] = [];
  if (d.format !== DECLARATION_FORMAT) out.push(`format is not ${DECLARATION_FORMAT}`);
  for (const k of ['repository', 'branch', 'defaultBranch'] as const) if (typeof d[k] !== 'string' || !d[k]) out.push(`${k} missing`);
  for (const k of ['base', 'anchor'] as const) if (typeof d[k] !== 'string' || !SHA.test(d[k])) out.push(`${k} is not a full commit SHA`);
  if (typeof d.declaredAt !== 'string' || Number.isNaN(Date.parse(d.declaredAt))) out.push('declaredAt is not a date');
  const files: Record<string, unknown> = d.files && typeof d.files === 'object' ? d.files : {};
  for (const k of Object.keys(BOOTSTRAP_FILES)) { const v = files[k]; if (typeof v !== 'string' || !DIGEST.test(v)) out.push(`files.${k} is not a sha256 digest`); }
  for (const k of Object.keys(files)) if (!(k in BOOTSTRAP_FILES)) out.push(`files.${k} is not a release file`);
  return out;
}

/** Which release files the base holds: 'all', 'none' or 'some' (never a bootstrap, never compared in part). */
export function baseHolds(git: Pick<BootstrapGit, 'has'>, base: string): { state: 'all' | 'none' | 'some'; present: string[]; absent: string[] } {
  const present: string[] = [], absent: string[] = [];
  for (const [key, file] of Object.entries(BASE_FILES)) (git.has(base, file) ? present : absent).push(key);
  return { state: !absent.length ? 'all' : !present.length ? 'none' : 'some', present, absent };
}

export function bootstrapEligibility(event: CiEvent, resolution: BaseResolution, declaration: unknown, git: BootstrapGit): Eligibility {
  const checks: EligibilityCheck[] = [], check = (id: string, ok: boolean, detail: string) => { checks.push({ id, ok, detail }); return ok; };
  const done = () => ({ eligible: checks.every(c => c.ok), checks });
  if (!check('resolved', resolution.ok && !!resolution.base, resolution.ok ? `base ${resolution.base} (${resolution.strategy})` : `no trusted base: ${resolution.reason}`)) return done();
  const problems = declarationProblems(declaration);
  if (!check('declaration', !problems.length, problems.length ? `${BOOTSTRAP_DECLARATION}: ${problems.join('; ')}` : `${BOOTSTRAP_DECLARATION} is well formed`)) return done();
  const d = declaration as BootstrapDeclaration, p = event.payload, base = resolution.base!, head = resolution.head;

  const repo = p.repository?.full_name;
  const firstPush = event.name === 'push' && !!p.before && ZERO_SHA.test(p.before) && p.ref === `refs/heads/${d.branch}` && resolution.strategy === 'new-branch-merge-base';
  // T.3J: and from the declared repository itself. A fork's branch of the same name is another branch: in a pull_request
  // event `repository` is the base repository, so only head.repo says where the head comes from.
  const pullRequest = event.name === 'pull_request' && p.pull_request?.head?.ref === d.branch && p.pull_request?.head?.repo?.full_name === d.repository
    && p.pull_request?.base?.ref === d.defaultBranch && (resolution.strategy === 'pull-request-base' || resolution.strategy === 'pull-request-merge-base');
  check('event', repo === d.repository && p.repository?.default_branch === d.defaultBranch && (firstPush || pullRequest),
    `${event.name} in ${repo ?? '(no repository)'}${event.name === 'push' ? ` to ${p.ref ?? '(no ref)'}, before ${p.before ?? '(none)'}` : ''}: `
    + (firstPush || pullRequest ? 'the declared first run' : `only the first push of ${d.branch} or a pull request from it (in ${d.repository}, not a fork) into ${d.defaultBranch}, in ${d.repository}`));
  check('base', base === d.base, base === d.base ? `the resolved base is the declared base ${d.base}` : `the resolved base ${base} is not the declared base ${d.base}`);
  const holds = baseHolds(git, base);
  check('base-without-release-files', holds.state === 'none', holds.state === 'none' ? 'the base holds no release file: nothing to compare with'
    : holds.state === 'all' ? 'the base holds every release file: it is a trusted base, compare with it' : `the base holds ${holds.present.join(', ')} but not ${holds.absent.join(', ')}: never a bootstrap`);
  const anchored = !!git.commit(d.anchor) && git.isAncestor(d.anchor, head);
  check('anchor', anchored, anchored ? `the anchor ${d.anchor} is in the history of ${head}` : `the anchor ${d.anchor} is not in the history of ${head}`);
  const differ = (commit: string) => (Object.keys(BOOTSTRAP_FILES) as BootstrapFile[]).filter(k => git.digestAt(commit, BOOTSTRAP_FILES[k]) !== d.files[k]);
  const atAnchor = anchored ? differ(d.anchor) : Object.keys(BOOTSTRAP_FILES);
  check('anchor-files', !atAnchor.length, atAnchor.length ? `differ from the declaration at the anchor: ${atAnchor.join(', ')}` : 'every release file at the anchor is as declared');
  const atHead = differ(head);
  check('head-files', !atHead.length, atHead.length ? `differ from the declaration at the head: ${atHead.join(', ')} (declare the new baseline, or compare with a trusted base)` : 'every release file at the head is as declared');
  return done();
}

export type BaseMode = 'compare' | 'bootstrap';
export interface BaseDecision { resolution: BaseResolution; mode?: BaseMode; eligibility?: Eligibility }
/**
 * T.3I: what a CI run compares with (trials:ci-base). A trusted base that holds every release file: compare. One that
 * holds none: a bootstrap if this is the declared run, else fail. One that holds some: fail. No trusted base: fail —
 * never a bootstrap. `payload` undefined: the event file was not a JSON object.
 */
export function decideBase(name: string, payload: CiEvent['payload'] | undefined, git: BootstrapGit, declaration: unknown, remote = 'origin'): BaseDecision {
  if (!payload) return { resolution: { format: CI_BASE_FORMAT, ok: false, event: name, head: git.head(), reason: 'the event payload is not a JSON object' } };
  const event: CiEvent = { name, payload }, resolution = resolveBase(event, git, remote);
  if (!resolution.ok || !resolution.base) return { resolution };
  const holds = baseHolds(git, resolution.base);
  if (holds.state === 'all') return { resolution, mode: 'compare' };
  if (holds.state === 'some') return { resolution: { ...resolution, ok: false, reason: `the base ${resolution.base} holds ${holds.present.join(', ')} but not ${holds.absent.join(', ')}: a release file cannot be compared in part` } };
  const eligibility = bootstrapEligibility(event, resolution, declaration, git);
  if (eligibility.eligible) return { resolution, mode: 'bootstrap', eligibility };
  return { eligibility, resolution: { ...resolution, ok: false,
    reason: `the base ${resolution.base} holds no release file and this run is not the declared bootstrap: ${eligibility.checks.filter(c => !c.ok).map(c => `${c.id}: ${c.detail}`).join('; ')}` } };
}

/** One release file through the commits of the branch, oldest first (`text` null where the file is absent). */
export interface FileVersion { commit: string; text: string | null }
/**
 * T.3I: the release files through the local history, base to head: what Git shows, which is consistent with append-only
 * or not. It proves nothing about the history before it was pushed (it could have been rewritten), so a bootstrap
 * reports it apart from the checks of the current state; a break here still fails the bootstrap.
 */
export function historyReplay(file: BootstrapFile, versions: FileVersion[]): { commits: number; failures: string[]; notes: string[] } {
  const failures: string[] = [], notes: string[] = [];
  let prev: { commit: string; data: unknown } | undefined;
  for (const v of versions) {
    if (v.text === null) { if (prev) failures.push(`${file}: removed at ${v.commit.slice(0, 7)}`); continue; }
    let data: unknown;
    try { data = JSON.parse(v.text); } catch { failures.push(`${file}: not JSON at ${v.commit.slice(0, 7)}`); continue; }
    if (prev) {
      const at = (fs: string[]) => fs.map(f => `${f} (${prev!.commit.slice(0, 7)} → ${v.commit.slice(0, 7)})`);
      if (file === 'manifest') failures.push(...at(appendOnlyFailures(prev.data as Manifest, data as Manifest)));
      else if (file === 'paper-versions') failures.push(...at(paperVersionsAppendOnly(prev.data as PaperVersions, data as PaperVersions)));
      else if (file === 'ledger') failures.push(...at(ledgerAppendOnlyFailures(prev.data as Ledger, data as Ledger)));
      else {
        const before = prev.data as Record<string, string>, now = data as Record<string, string>;
        const changed = Object.keys(before).filter(k => k in now && canonical(now[k]) !== canonical(before[k]));
        const removed = Object.keys(before).filter(k => !(k in now));
        failures.push(...at(changed.map(k => `published-hashes ${k}: recorded hash changed`)));
        if (removed.length) notes.push(`published-hashes: ${removed.length} entr(y/ies) removed at ${v.commit.slice(0, 7)} (a withdrawal removes them; the ledger names withdrawals only since it exists)`);
      }
    }
    prev = { commit: v.commit, data };
  }
  return { commits: versions.filter(v => v.text !== null).length, failures, notes };
}

/** What a bootstrap cannot prove, whatever its checks say. */
export const UNVERIFIABLE = [
  'The history before the first push: the branch was never on the remote, so its commits (and their dates and authors, which are unsigned) could have been rewritten before it was pushed. The local replay shows only that the history as pushed is consistent with append-only.',
  'The 57 published hashes were recorded before the ledger existed: their publication has no ledger record, approval or reviewer, and the ledger cannot replay them.',
  'That the published questions were reviewed by a human: the bank and the published hashes say what was published, not who approved it.',
  'That the declaration\'s baseline is right: it is trusted because the owner reviews the commit that adds it, not because CI checks it.',
  'That the assessment manifest\'s earliest entries were recorded when their revisions were written: the manifest exists since T.3F; earlier revisions were recorded then from the bank as it was.',
] as const;
export const TRUST_ASSUMPTIONS = [
  'The declaration in the pushed commit names the baseline, and the repository owner has reviewed it (CODEOWNERS covers it once enabled).',
  'GitHub delivers the event payload and checks out the pushed commit with its full history (fetch-depth: 0).',
  'The default branch on the remote still holds the declared base (the merge-base is recomputed, never taken from the declaration).',
  'The runner and the pinned actions are not compromised (actions are pinned to commit SHAs: docs/exam-system/governance/ACTION_PINS.md).',
] as const;
export const FUTURE_COMPARISON = [
  'Every later push of the branch compares with the previous tip (push-before or force-push-before): the bootstrap commit becomes the first trusted base.',
  'Every pull request compares with its base, which must hold every release file once the branch is merged; a base holding some of them fails.',
  'A new branch whose merge-base holds no release file and is not the declared run fails closed: push it after the release files reach the default branch, or open a pull request.',
  'Changing the release files before the first push needs a new declaration (new digests and anchor), reviewed like any release change.',
] as const;
