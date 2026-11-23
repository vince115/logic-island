import type { FsState } from './fs';
import { inputLines, keep, stepPath, writeKept, type ArtPlan } from './artifacts-job';
import { sizeOf, type CacheEntry } from './artifacts-model';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §2): actions/cache@v4. The step restores: it looks for the key
 * exactly, then for the newest cache whose key starts with the key or a restore key (in order), first among the caches of
 * the job's own ref, then a pull request's base branch, then the default branch — only caches saved with the same paths
 * (GitHub's cache version) and saved by then. Its post step (after a successful job) saves the paths under the key unless
 * the key matched exactly or a cache with that key already exists for the ref (keys are never overwritten).
 */

export interface CacheStep {
  state: FsState; lines: string[]; ok: boolean; outputs: Record<string, string>; seconds: number;
  /** true: the key matched exactly; false: a restore key (or nothing) matched. */
  hit: boolean;
  save?: { key: string; version: string; paths: string[] };
}
export interface CacheSave { lines: string[]; entry?: CacheEntry; seconds: number }

const input = (withs: readonly (readonly [string, string])[], k: string) => withs.find(w => w[0] === k)?.[1];
const sizeLine = (n: number) => `Cache Size: ~${Math.round(n / 1048576)} MB (${n} B)`;
const newest = (a: CacheEntry, b: CacheEntry) => b.at - a.at || b.id - a.id;

/** The cache a restore finds (exact: the primary key itself). */
export function findCache(caches: readonly CacheEntry[], scopes: readonly string[], keys: readonly string[], version: string, t: number): { entry: CacheEntry; exact: boolean } | undefined {
  const usable = caches.filter(c => c.at <= t && c.version === version);
  for (const scope of scopes) {
    const mine = usable.filter(c => c.ref === scope);
    const exact = mine.find(c => c.key === keys[0]);
    if (exact) return { entry: exact, exact: true };
    for (const k of keys) { const m = mine.filter(c => c.key.startsWith(k)).sort(newest)[0]; if (m) return { entry: m, exact: false }; }
  }
  return undefined;
}

/** The restore step of actions/cache (with: path, key, restore-keys, fail-on-cache-miss, lookup-only). */
export function restoreCache(state: FsState, withs: readonly (readonly [string, string])[], plan: ArtPlan, workspace: string, t: number): CacheStep {
  const paths = inputLines(input(withs, 'path')), key = (input(withs, 'key') ?? '').trim(), restore = inputLines(input(withs, 'restore-keys'));
  const fail = (line: string): CacheStep => ({ state, lines: [`##[error]${line}`], ok: false, outputs: {}, seconds: 0, hit: false });
  if (!paths.length) return fail('Input required and not supplied: path');
  if (!key) return fail('Input required and not supplied: key');
  if (key.length > 512 || key.includes(',')) return fail(`Key Validation Error: ${key} cannot contain commas.`);
  const version = paths.join('\n'), found = findCache(plan.caches, plan.scopes, [key, ...restore], version, t);
  if (!found) {
    if (input(withs, 'fail-on-cache-miss')?.trim() === 'true') return fail(`Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${key}`);
    return { state, lines: [`Cache not found for input keys: ${[key, ...restore].join(', ')}`], ok: true, outputs: { 'cache-hit': '' }, seconds: 1, hit: false, save: { key, version, paths } };
  }
  const { entry, exact } = found, lookup = input(withs, 'lookup-only')?.trim() === 'true';
  const lines = lookup ? [`Cache found and can be restored from key: ${entry.key}`]
    : [sizeLine(entry.size), `/usr/bin/tar -xf /home/runner/work/_temp/cache/cache.tzst -P -C ${workspace} --use-compress-program unzstd`, 'Cache restored successfully', `Cache restored from key: ${entry.key}`];
  return {
    state: lookup ? state : writeKept(state, entry.files), lines, ok: true, outputs: { 'cache-hit': String(exact), ...lookup ? {} : { 'cache-primary-key': key, 'cache-matched-key': entry.key } }, seconds: 1, hit: exact,
    ...exact ? {} : { save: { key, version, paths } },
  };
}

/** The post step: saves the paths under the key (an exact hit: nothing to save). */
export function saveCache(state: FsState, save: CacheStep['save'], hitKey: string | undefined, plan: ArtPlan, workspace: string, ref: string, runId: number, t: number): CacheSave {
  if (!save) return { lines: [`Cache hit occurred on the primary key ${hitKey}, not saving cache.`], seconds: 0 };
  const files = keep(state, save.paths.map(p => stepPath(workspace, p)));
  if (!files.length) return { lines: ['##[warning]Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.'], seconds: 0 };
  if (plan.caches.some(c => c.key === save.key && c.ref === ref && c.version === save.version))
    return { lines: [`##[warning]Failed to save: Unable to reserve cache with key ${save.key}, another job may be creating this cache.`], seconds: 0 };
  const size = sizeOf(files), entry: CacheEntry = { id: plan.ids.cache++, key: save.key, version: save.version, ref, files, size, at: t + 1, runId };
  return {
    lines: [`/usr/bin/tar --posix -cf cache.tzst --exclude cache.tzst -P -C ${workspace} --files-from manifest.txt --use-compress-program zstdmt`, sizeLine(size), 'Cache saved successfully', `Cache saved with key: ${save.key}`],
    entry, seconds: 1,
  };
}
