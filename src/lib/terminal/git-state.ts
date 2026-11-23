import type { Entry, Files, Objects, Sha } from './git';
import type { ForgeAccount, ForgeSite } from './forge-state';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): what a machine of the git profile keeps besides its files. The
 * object store is shared by every repository of the machine (objects are named by their content); each repository knows
 * which commits it has (fetched, cloned, made here), so a commit only on the forge is not in a clone until it fetches.
 * The worktree is the machine's ordinary files with a .git folder (a placeholder: Git's own files are this data).
 */

/** The stages of a conflicted path (1 base, 2 ours, 3 theirs; a missing stage is a side that deleted or never had it). */
export interface Unmerged { base?: Entry; ours?: Entry; theirs?: Entry }
/** A merge, rebase or revert that stopped on conflicts (or a rebase in progress). */
export type GitOp =
  | { kind: 'merge'; head: Sha; message: string }
  | { kind: 'rebase'; onto: Sha; ontoName: string; orig: Sha; branch: string | null; todo: readonly Sha[]; done: readonly Sha[]; current: Sha }
  | { kind: 'revert'; commit: Sha; message: string };
export interface GitRepo {
  /** The worktree's folder (it holds the .git placeholder). */
  path: string;
  /** 'refs/heads/main' (attached) or a commit ID (detached). */
  head: string;
  /** Full ref names: refs/heads/…, refs/tags/…, refs/remotes/origin/…, refs/stash. */
  refs: ReadonlyMap<string, Sha>;
  /** Symbolic refs other than HEAD (refs/remotes/origin/HEAD → refs/remotes/origin/main). */
  symrefs: ReadonlyMap<string, string>;
  /** The index (stage 0); conflicted paths are in unmerged instead. */
  index: Files;
  unmerged: ReadonlyMap<string, Unmerged>;
  /** The repository's own configuration (.git/config): canonical keys (section and name lower case, subsection as written). */
  config: ReadonlyMap<string, string>;
  /** The commits and tag objects this repository has. */
  known: ReadonlySet<Sha>;
  op?: GitOp;
  origHead?: Sha;
  /** The branch (or commit) HEAD was on before the last switch (git switch -). */
  previous?: string;
  /** A detached HEAD: the name it was detached at (git status's HEAD detached at v1.0 / from …). */
  detached?: { name: string; at: Sha };
  /** git stash's entries, newest first. */
  stash: readonly Sha[];
}
/** A bare repository on the simulated forge (https://github.example/<owner>/<repo>.git). */
export interface ForgeRepo { url: string; head: string; refs: ReadonlyMap<string, Sha>; known: ReadonlySet<Sha>; /** E26 (forge profile): settings, protection and pull requests (forge-state.ts). */ site?: ForgeSite }
export interface GitState { objects: Objects; repos: readonly GitRepo[]; forge: readonly ForgeRepo[]; /** The lesson's commit labels → IDs (for checks that name a commit by its label). */ labels?: ReadonlyMap<string, Sha>; /** E26: the gh account logged in to github.example (forge profile). */ account?: ForgeAccount;
  /** E29: on a runner, the job's GITHUB_TOKEN (its permissions decide git push and gh). */ token?: RunnerToken }
/** E29: the GITHUB_TOKEN of a job on a runner. */
export interface RunnerToken { permissions: Readonly<Record<string, string>>; login: string }

export const FORGE_HOST = 'github.example';
/** A forge repository's URL: https://github.example/owner/repo.git */
export const FORGE_URL = /^https:\/\/github\.example\/[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}\.git$/;
