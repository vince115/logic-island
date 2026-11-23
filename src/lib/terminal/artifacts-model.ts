import type { GitObject, Sha } from './git';
import type { DockerRegistry } from './registry';
import type { HostEffect } from './deploy-hosts';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md): what the artifacts profile keeps on top of E28. A forge
 * repository's site holds its Actions secrets and variables (repository level and per environment), its caches (each
 * scoped to the ref that saved it) and the artifacts of its runs. A job's results carry what it left behind — the caches
 * it saved, the artifacts it uploaded and its effects on the world (refs it pushed with the GITHUB_TOKEN, registries it
 * pushed images to) — so a remembered attempt reproduces them. Effects wait in CiState.art.pending until the clock reaches
 * the moment the step made them.
 */

/** A secret (the value is never shown) or a variable; env: an environment's, else the repository's. */
export interface ActionsValue { name: string; value: string; env?: string; updatedAt: number }

/** A file kept by a cache or an artifact (path: absolute for a cache, relative to the artifact's root for an artifact). */
export interface KeptFile { path: string; kind: 'file' | 'dir'; mode: number; content?: string }

export interface CacheEntry {
  id: number; key: string;
  /** The paths it was saved with (a restore needs the same paths: GitHub's cache version). */
  version: string;
  /** The ref whose runs saved it (refs/heads/main, refs/pull/1/merge). */
  ref: string;
  files: readonly KeptFile[]; size: number;
  at: number; runId: number;
}
export interface ArtifactEntry {
  id: number; name: string; runId: number; attempt: number; jobId: number;
  files: readonly KeptFile[]; size: number;
  at: number; expiresAt: number;
}
/** A change a run makes to the world at a moment (a step's end). */
export interface ActionsEffect {
  at: number; url: string; runId: number;
  /** Refs the job pushed (with the GITHUB_TOKEN) and the objects they need. */
  refs?: readonly [string, Sha][];
  objects?: readonly GitObject[];
  /** The registries after a docker push from the runner. */
  registries?: readonly DockerRegistry[];
  /** E31: the deploy hosts the step changed (over ssh, or by curl's requests), as they were after it. */
  hosts?: readonly HostEffect[];
}
/** What a job left behind (kept on its result so a remembered attempt brings it back). */
export interface JobArt { caches: readonly CacheEntry[]; artifacts: readonly ArtifactEntry[]; effects: readonly ActionsEffect[] }
export const noArt = (): JobArt => ({ caches: [], artifacts: [], effects: [] });

/** E29's part of the machine's CI state: the artifact and cache ID counters and the effects not yet due. */
export interface ArtState { artifact: number; cache: number; pending: readonly ActionsEffect[] }

/** The site's E29 data (on ForgeSite). */
export interface SiteArt {
  secrets?: readonly ActionsValue[];
  variables?: readonly ActionsValue[];
  environments?: readonly string[];
  caches?: readonly CacheEntry[];
  artifacts?: readonly ArtifactEntry[];
}

export const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const bytes = (s: string) => new TextEncoder().encode(s).length;
export const sizeOf = (files: readonly KeptFile[]) => files.reduce((n, f) => n + (f.kind === 'file' ? bytes(f.content ?? '') : 0), 0);

/** The values a job sees: the repository's, overridden by its environment's (names are upper case). */
export function scoped(list: readonly ActionsValue[] | undefined, env: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of list ?? []) if (v.env === undefined) out[v.name] = v.value;
  if (env !== undefined) for (const v of list ?? []) if (v.env === env) out[v.name] = v.value;
  return out;
}

/** The texts to mask: each secret value, line by line (GitHub masks every line of a multi-line secret), longest first. */
export function masksOf(values: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const v of values) for (const line of v.split('\n')) if (line.trim()) out.add(line);
  return [...out].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}
export const maskText = (masks: readonly string[], text: string) => masks.reduce((t, m) => (m && m !== '***' ? t.split(m).join('***') : t), text);

/** gh's sizes (cache list): 1.2 KiB, 3 B. */
export function sizeText(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n / 1024, k = 0;
  while (v >= 1024 && k < units.length - 1) { v /= 1024; k++; }
  return `${v.toFixed(2).replace(/\.?0+$/, '')} ${units[k]}`;
}
