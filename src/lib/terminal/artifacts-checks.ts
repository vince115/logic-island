import { resolvePath, type FsState } from './fs';
import { FORGE_URL } from './git-state';
import { Git, validRefName } from './git-core';
import { forgeOf } from './actions-checks';
import { settleArt } from './artifacts-run';
import { ARTIFACTS_LIMITS, nameProblem } from './artifacts-lesson';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §7): the checks secret and variable — a forge repository has
 * (or no longer has) an Actions secret or variable, at repository level or an environment's; a secret is checked by name
 * only, never by value. A registry check may take its tag from a commit (tag: 'sha-' plus the branch's current commit),
 * so a lesson can check the image a workflow pushed for the learner's own commit.
 */

export type ArtifactsCheck =
  | { kind: 'secret'; repo: string; name: string; env?: string; absent?: true }
  | { kind: 'variable'; repo: string; name: string; env?: string; absent?: true; value?: string };
/** A registry check's commit: the tag is the check's tag followed by this branch's current commit (length: its first characters). */
export interface RegistryCommit { repo: string; ref?: string; length?: number }

const silent = { out: () => {}, err: () => {}, user: 'root' };
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;
const repoOk = (r: unknown) => typeof r === 'string' && (normalized(r) || FORGE_URL.test(r));
const where = (c: ArtifactsCheck) => `${c.repo}${c.env ? ` 的 environment ${c.env}` : ''}`;

export function describeArtifactsCheck(c: ArtifactsCheck): string {
  const what = c.kind === 'secret' ? `Actions secret ${c.name}` : `Actions variable ${c.name}`;
  if (c.absent) return `${where(c)} 應該沒有 ${what}`;
  return `${where(c)} 應該有 ${what}${c.kind === 'variable' && c.value !== undefined ? `（值是「${c.value}」）` : ''}`;
}

/** Why the check fails after the commands (null: it holds). */
export function artifactsFailure(c: ArtifactsCheck, end: FsState): string | null {
  const g = new Git(settleArt(end), silent), f = forgeOf(g, c.repo);
  if (typeof f === 'string') return f;
  const list = (c.kind === 'secret' ? f.site?.secrets : f.site?.variables) ?? [];
  const v = list.find(x => x.name === c.name.toUpperCase() && x.env === c.env), noun = c.kind === 'secret' ? 'secret' : 'variable';
  if (c.absent) return v ? `仍有這個 ${noun}` : null;
  if (!v) return `沒有這個 ${noun}${c.env ? `（environment ${c.env}）` : ''}`;
  if (c.kind === 'variable' && c.value !== undefined && v.value !== c.value) return `它的值是「${v.value}」`;
  return null;
}

/** The problems of the check's data (it needs an artifacts machine). */
export function artifactsCheckProblems(c: ArtifactsCheck, artifacts: boolean): string | null {
  if (!artifacts || !repoOk(c.repo)) return `a ${c.kind} check needs an artifacts machine (engine stage E29) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)`;
  if (nameProblem(c.name)) return `a ${c.kind} check's name: ${nameProblem(c.name)}`;
  if (c.env !== undefined && (typeof c.env !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(c.env))) return `a ${c.kind} check's env is an environment name`;
  if (c.absent !== undefined && c.absent !== true) return `a ${c.kind} check's absent must be true`;
  if (c.kind === 'secret' && 'value' in c) return 'a secret check never names a value (check the name only)';
  if (c.kind === 'variable' && c.value !== undefined && (typeof c.value !== 'string' || c.value.length > ARTIFACTS_LIMITS.value || c.absent)) return 'a variable check\'s value is a text (not with absent)';
  return null;
}

/** The tag a registry check with a commit means on the state (undefined: the repository or branch is not there). */
export function commitTag(tag: string, commit: RegistryCommit, end: FsState): string | undefined {
  const g = new Git(settleArt(end), silent), f = forgeOf(g, commit.repo);
  if (typeof f === 'string') return undefined;
  const sha = f.refs.get(commit.ref ? `refs/heads/${commit.ref}` : f.head);
  return sha ? `${tag}${sha.slice(0, commit.length ?? 40)}` : undefined;
}
export const describeCommit = (commit: RegistryCommit) => `${commit.ref ?? '預設分支'}目前的 commit${commit.length ? `（前 ${commit.length} 字）` : ''}`;
export function commitProblem(commit: RegistryCommit, artifacts: boolean): string | null {
  if (!artifacts || !repoOk(commit?.repo)) return 'a registry check\'s commit needs an artifacts machine (engine stage E29) and a repo';
  if (commit.ref !== undefined && (typeof commit.ref !== 'string' || !validRefName(commit.ref))) return 'a registry check\'s commit ref is a branch name';
  if (commit.length !== undefined && !(Number.isInteger(commit.length) && commit.length >= 7 && commit.length <= 40)) return 'a registry check\'s commit length is 7..40';
  return null;
}
