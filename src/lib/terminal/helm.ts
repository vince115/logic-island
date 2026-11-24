import type { FsState } from './fs';
import { clockOf } from './processes';
import { settleKube } from './kube-settle';
import { readConfig } from './kubectl-config';
import { readPath } from './shell';
import { KUBE_VERSION } from './kube-model';
import { loadChart, localChart, type Chart } from './helm-chart';
import { mergeMaps, parseSet, parseValues } from './helm-values';
import type { VMap } from './helm-value';
import { HELM_COMMIT } from './helm-render';
import { installCommand, rollbackCommand, uninstallCommand, upgradeCommand } from './helm-install';
import { getCommand, historyCommand, listCommand, statusCommand } from './helm-info';
import { pullCommand, repoChart, repoCommand, searchCommand, showCommand } from './helm-repo';
import { createCommand, lintCommand, packageCommand, templateCommand } from './helm-tools';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §8): the helm command (Helm v3.16.4) on the helm profile. Flags are
 * read as pflag does (--flag=value, --flag value, -n value, -nvalue, repeated --set and -f); the cluster is the one
 * kubectl uses (~/.kube/config, its context's namespace), settled to the clock first; errors are printed as "Error: …"
 * with status 1, as helm's main does.
 */

export interface HelmIo { out(line: string): void; err(line: string): void }
export interface HFlags { values: Record<string, string[]>; bools: Set<string> }
export interface Hx { state: FsState; flags: HFlags; pos: string[]; io: HelmIo; now: number; ns: string; nsGiven: boolean; cluster: boolean }
export type HelmResult = { state: FsState; status: number };
export const HELM_VERSION = 'v3.16.4';
export const UNREACHABLE = 'Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp 127.0.0.1:8080: connect: connection refused';
/** helm template's DefaultCapabilities (client-go v0.31 in Helm v3.16). */
export const TEMPLATE_KUBE_VERSION = 'v1.31.0';
export const API_VERSIONS = ['v1', 'apps/v1', 'batch/v1', 'networking.k8s.io/v1', 'storage.k8s.io/v1', 'autoscaling/v2', 'policy/v1', 'rbac.authorization.k8s.io/v1'];
export const kubeVersionOf = (x: Hx) => x.cluster ? KUBE_VERSION : TEMPLATE_KUBE_VERSION;

const VALUE = ['namespace', 'values', 'set', 'set-string', 'timeout', 'version', 'output', 'revision', 'max', 'untardir', 'destination', 'show-only', 'description', 'max-col-width', 'kube-context', 'dry-run'];
const BOOL = ['create-namespace', 'wait', 'atomic', 'generate-name', 'install', 'reuse-values', 'reset-values', 'all-namespaces', 'all', 'keep-history', 'untar', 'debug', 'short', 'versions', 'devel',
  'uninstalled', 'deployed', 'failed', 'pending', 'superseded', 'help', 'strict', 'quiet', 'force', 'no-hooks', 'skip-crds', 'cleanup-on-fail', 'client'];
const SHORT_VALUE: Record<string, string> = { n: 'namespace', f: 'values', o: 'output', s: 'show-only', d: 'destination' };
const SHORT_BOOL: Record<string, string> = { A: 'all-namespaces', a: 'all', q: 'short', l: 'versions', h: 'help' };
const PROSE = ['dependency', 'plugin', 'registry', 'push', 'test', 'verify', 'completion', 'env', 'get-hooks'];
const COMMANDS = ['install', 'upgrade', 'list', 'ls', 'status', 'history', 'hist', 'rollback', 'uninstall', 'un', 'delete', 'del', 'get', 'template', 'lint', 'show', 'inspect', 'repo', 'search', 'pull', 'fetch',
  'create', 'package', 'version'];

/** pflag: flags anywhere, -- ends them; --dry-run alone is client. */
function parseFlags(args: readonly string[]): { flags: HFlags; pos: string[] } | { error: string } {
  const values: Record<string, string[]> = {}, bools = new Set<string>(), pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { pos.push(...args.slice(i + 1)); break; }
    const long = /^--([a-z][a-z-]*)(?:=(.*))?$/s.exec(a);
    if (long) {
      const [, name, eq] = long;
      if (name === 'dry-run') { (values[name] ??= []).push(eq ?? 'client'); continue; }
      if (VALUE.includes(name)) { if (eq !== undefined) (values[name] ??= []).push(eq); else if (i + 1 < args.length) (values[name] ??= []).push(args[++i]); else return { error: `flag needs an argument: --${name}` }; }
      else if (BOOL.includes(name)) { if (eq === 'false') bools.delete(name); else bools.add(name); }
      else return { error: `unknown flag: --${name}` };
      continue;
    }
    if (/^-[A-Za-z]/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (SHORT_VALUE[c]) { const v = a.slice(j + 1).replace(/^=/, ''); if (v) (values[SHORT_VALUE[c]] ??= []).push(v); else if (i + 1 < args.length) (values[SHORT_VALUE[c]] ??= []).push(args[++i]); else return { error: `flag needs an argument: '${c}' in -${c}` }; break; }
        if (SHORT_BOOL[c]) { bools.add(SHORT_BOOL[c]); continue; }
        return { error: `unknown shorthand flag: '${c}' in ${a}` };
      }
      continue;
    }
    pos.push(a);
  }
  return { flags: { values, bools }, pos };
}
export const flag = (x: Pick<Hx, 'flags'>, name: string) => x.flags.values[name]?.at(-1);
export const fail = (x: Pick<Hx, 'io' | 'state'>, msg: string, state = x.state): HelmResult => { x.io.err(`Error: ${msg}`); return { state, status: 1 }; };

export function helm(state0: FsState, args: readonly string[], io: HelmIo): HelmResult {
  const [cmd, ...rest] = args;
  if (!cmd) { ['The Kubernetes package manager', '', 'Usage:', '  helm [command]', '', "Use \"helm [command] --help\" for more information about a command."].forEach(l => io.out(l)); return { state: state0, status: 0 }; }
  if (PROSE.includes(cmd)) { io.err(`（模擬環境不模擬 helm ${cmd}，課文會說明它）`); return { state: state0, status: 1 }; }
  if (!COMMANDS.includes(cmd)) { io.err(`Error: unknown command "${cmd}" for "helm"`); io.err("Run 'helm --help' for usage."); return { state: state0, status: 1 }; }
  const p = parseFlags(rest);
  if ('error' in p) { io.err(`Error: ${p.error}`); return { state: state0, status: 1 }; }
  const cfg = readConfig(state0), ctx = cfg.ok ? cfg.contexts.find(c => c.name === (flag(p, 'kube-context') ?? cfg.current)) : undefined;
  const state = state0.kube ? settleKube(state0) : state0, nsFlag = flag(p, 'namespace');
  const x: Hx = { state, flags: p.flags, pos: p.pos, io, now: clockOf(state).now, ns: nsFlag ?? ctx?.namespace ?? 'default', nsGiven: nsFlag !== undefined, cluster: !!state.kube && !!ctx };
  switch (cmd) {
    case 'version':
      io.out(x.flags.bools.has('short') ? `${HELM_VERSION}+g${HELM_COMMIT.slice(0, 7)}` : `version.BuildInfo{Version:"${HELM_VERSION}", GitCommit:"${HELM_COMMIT}", GitTreeState:"clean", GoVersion:"go1.22.7"}`);
      return { state, status: 0 };
    case 'install': return installCommand(x);
    case 'upgrade': return upgradeCommand(x);
    case 'list': case 'ls': return listCommand(x);
    case 'status': return statusCommand(x);
    case 'history': case 'hist': return historyCommand(x);
    case 'rollback': return rollbackCommand(x);
    case 'uninstall': case 'un': case 'delete': case 'del': return uninstallCommand(x);
    case 'get': return getCommand(x);
    case 'template': return templateCommand(x);
    case 'lint': return lintCommand(x);
    case 'show': case 'inspect': return showCommand(x);
    case 'repo': return repoCommand(x);
    case 'search': return searchCommand(x);
    case 'pull': case 'fetch': return pullCommand(x);
    case 'create': return createCommand(x);
    default: return packageCommand(x);
  }
}

/** The chart an argument names: a folder or archive on the workstation, else REPO/NAME from a repository's index. */
export function locateChart(x: Hx, word: string): { chart: Chart } | { error: string } {
  const local = localChart(x.state, word);
  if (local && 'error' in local) return local;
  const got = local ?? repoChart(x, word, flag(x, 'version'));
  if ('error' in got) return got;
  const c = loadChart(got.files);
  return 'error' in c ? c : { chart: c };
}
/** The user-supplied values: -f files in order, then --set, then --set-string. */
export function userValues(x: Hx): VMap | { error: string } {
  let v: VMap = {};
  for (const f of x.flags.values.values ?? []) {
    const r = f === '-' ? { error: 'ENOENT' } : readPath(x.state, f);
    if ('error' in r) return { error: `open ${f}: no such file or directory` };
    const parsed = parseValues(r.text, `failed to parse ${f}`);
    if ('error' in parsed) return { error: parsed.error as string };
    v = mergeMaps(v, parsed);
  }
  for (const [key, typedStr] of [['set', false], ['set-string', true]] as const) for (const s of x.flags.values[key] ?? []) {
    const r = parseSet(s, v, typedStr);
    if ('error' in r) return { error: `failed parsing --${key} data: ${r.error}` };
    v = r;
  }
  return v;
}
export const givenValues = (x: Hx) => !!(x.flags.values.values?.length || x.flags.values.set?.length || x.flags.values['set-string']?.length);
/** Go's time.ParseDuration for --timeout (seconds; null: invalid). */
export function durationOf(text: string): number | null {
  if (!/^(\d+(\.\d+)?(h|m|s|ms))+$/.test(text) && text !== '0') return null;
  let s = 0;
  for (const [, n, , u] of text.matchAll(/(\d+(\.\d+)?)(h|m|s|ms)/g)) s += Number(n) * (u === 'h' ? 3600 : u === 'm' ? 60 : u === 's' ? 1 : 0.001);
  return Math.ceil(s);
}
