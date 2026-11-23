import { isInside, parentOf, resolvePath, subtreeOf, type FsNode, type FsState } from './fs';
import type { Objects } from './git';
import type { ForgeRepo } from './git-state';
import type { DockerRegistry } from './registry';
import type { TokenPermissions } from './workflow-perms';
import type { ActionsEffect, ArtifactEntry, CacheEntry, KeptFile } from './artifacts-model';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §4): what a job on an artifacts machine's runner has besides
 * E28's — the secrets and variables its environment selects (and the texts to mask), the caches and the run's artifacts it
 * can see, a copy of the forge repository with the job's GITHUB_TOKEN (so git push and gh obey its permissions), the
 * registries as they are now. After each run: step the changes it made to the forge and the registries become effects.
 */

export interface ArtPlan {
  runId: number; url: string; web: string;
  secrets: Readonly<Record<string, string>>; vars: Readonly<Record<string, string>>;
  /** Secret values line by line (longest first); ::add-mask:: adds to the job's list. */
  masks: readonly string[];
  /** Caches the job may restore (the site's and this attempt's so far; each restore looks at the ones saved by then). */
  caches: CacheEntry[];
  /** The refs whose caches it may use, in order (its own, a pull request's base, the default branch). */
  scopes: readonly string[];
  /** The run's artifacts so far (kept jobs' from earlier attempts and this attempt's). */
  artifacts: ArtifactEntry[];
  /** The next artifact and cache IDs (the job takes them in turn). */
  ids: { artifact: number; cache: number };
  registries?: readonly DockerRegistry[];
  forge?: ForgeRepo;
  /** Artifact retention (days) when the step does not say. */
  retention: number;
}

export const BOT = { login: 'github-actions[bot]', name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.example' };
export const RUNNER_HOME = '/home/runner';

/** The runner with the job's world: the forge copy (the bot cannot bypass protection), the GITHUB_TOKEN, the registries. */
export function prepareArt(state: FsState, plan: ArtPlan, permissions: TokenPermissions, objects: Objects): FsState {
  const forge = plan.forge ? [{ ...plan.forge, ...plan.forge.site ? { site: { ...plan.forge.site, permission: 'write' as const } } : {} }] : [];
  const git = { objects: state.git?.objects ?? objects, repos: state.git?.repos ?? [], forge, account: BOT, token: { permissions: { ...permissions }, login: BOT.login } };
  const docker = state.docker && plan.registries ? { ...state.docker, registries: plan.registries } : state.docker;
  return { ...state, git, ...docker ? { docker } : {} };
}

/** A path a step names: ~/… is the runner's home, a relative path is under the workspace. */
export const stepPath = (workspace: string, p: string) => resolvePath({ cwd: workspace, home: RUNNER_HOME }, p.trim());
/** The lines of a multi-line input (empty lines and surrounding spaces dropped). */
export const inputLines = (v: string | undefined) => (v ?? '').split('\n').map(l => l.trim()).filter(Boolean);

/** The files and folders at or under these paths (absolute paths, sorted). */
export function keep(state: FsState, paths: readonly string[]): KeptFile[] {
  const out = new Map<string, KeptFile>();
  for (const p of paths) for (const q of subtreeOf(state.nodes, p)) {
    const n = state.nodes.get(q);
    if (n?.kind === 'file') out.set(q, { path: q, kind: 'file', mode: n.mode, content: n.content ?? '' });
    else if (n?.kind === 'dir') out.set(q, { path: q, kind: 'dir', mode: n.mode });
  }
  return [...out.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
}
/** Writes kept files under a folder (paths relative to it; absolute ones as they are), creating folders as the runner. */
export function writeKept(state: FsState, files: readonly KeptFile[], under = '/'): FsState {
  const nodes = new Map(state.nodes), owner = state.user;
  const mkdirs = (d: string) => {
    const missing: string[] = [];
    for (let at = d; !nodes.has(at); at = parentOf(at)) missing.push(at);
    for (const x of missing.reverse()) nodes.set(x, { kind: 'dir', mode: 0o755, owner });
  };
  for (const f of files) {
    const path = f.path.startsWith('/') ? f.path : `${under === '/' ? '' : under}/${f.path}`;
    if (f.kind === 'dir') { mkdirs(path); continue; }
    mkdirs(parentOf(path));
    nodes.set(path, { kind: 'file', mode: f.mode, owner, content: f.content ?? '' } as FsNode);
  }
  return { ...state, nodes };
}
/** Kept files relative to a root folder (the root itself left out). */
export const relativeTo = (files: readonly KeptFile[], root: string): KeptFile[] =>
  files.filter(f => f.path !== root && isInside(f.path, root)).map(f => ({ ...f, path: f.path.slice(root === '/' ? 1 : root.length + 1) }));

/** What a run: step changed in the world: refs it pushed (and their objects) and registries it pushed to. */
export function stepEffect(before: FsState, after: FsState, plan: ArtPlan, t: number, base: Objects): ActionsEffect | undefined {
  const was = before.git?.forge[0]?.refs, now = after.git?.forge[0]?.refs;
  const refs: [string, string][] = [];
  if (was && now) for (const [r, sha] of now) if (was.get(r) !== sha) refs.push([r, sha]);
  const registries = after.docker?.registries !== before.docker?.registries ? after.docker?.registries : undefined;
  if (!refs.length && !registries) return undefined;
  const objects = refs.length ? [...after.git!.objects].filter(([id]) => !base.has(id)).map(([, o]) => o) : [];
  return { at: t, url: plan.url, runId: plan.runId, ...refs.length ? { refs, objects } : {}, ...registries ? { registries } : {} };
}
