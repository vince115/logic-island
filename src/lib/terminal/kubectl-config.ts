import type { FsState } from './fs';
import { readPath } from './shell';
import { parseYaml, YamlError } from './yaml';
import { toJson } from './kube-manifest';
import { kubeYaml, printObjects } from './kube-output';
import { arr, goTab, obj, str, type J, type JObj } from './kube-model';
import type { Flags, KubeIo, KubeResult } from './kubectl';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §2): ~/.kube/config — the clusters, users and contexts kubectl
 * reads, and kubectl config view (certificate data shown as DATA+OMITTED; --minify, --raw, -o jsonpath), current-context,
 * get-contexts, get-clusters, get-users, use-context and set-context (--current or a name; --namespace, --cluster, --user),
 * which write the file back the way client-go does (keys sorted, as kubectl -o yaml prints).
 */

export type KubeConfig = { ok: true; path: string; doc: JObj; current: string; contexts: { name: string; cluster: string; user: string; namespace?: string }[] } | { ok: false; path: string; error?: string };
const EMPTY: JObj = { apiVersion: 'v1', clusters: null, contexts: null, 'current-context': '', kind: 'Config', preferences: {}, users: null };

export function readConfig(state: FsState): KubeConfig {
  const path = `${state.home === '/' ? '' : state.home}/.kube/config`, r = readPath(state, path);
  if ('error' in r) return { ok: false, path };
  let doc: J;
  try { doc = toJson(parseYaml(r.text)); } catch (e) {
    if (e instanceof YamlError) return { ok: false, path, error: `error: error loading config file "${path}": ${e.message}` };
    throw e;
  }
  const d = obj(doc), contexts = arr(d.contexts).map(c => ({ name: str(obj(c).name) ?? '', cluster: str(obj(obj(c).context).cluster) ?? '', user: str(obj(obj(c).context).user) ?? '', namespace: str(obj(obj(c).context).namespace) }));
  return { ok: true, path, doc: d, current: str(d['current-context']) ?? '', contexts };
}

function redact(v: J, raw: boolean): J {
  if (raw || !v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => redact(x, raw));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /-data$/.test(k) && typeof x === 'string' ? 'DATA+OMITTED' : (k === 'token' || k === 'password') && typeof x === 'string' ? 'REDACTED' : redact(x, raw)]));
}
function minify(d: JObj, current: string): JObj {
  const ctx = arr(d.contexts).find(c => str(obj(c).name) === current);
  if (!ctx) return d;
  const c = obj(obj(ctx).context);
  return { ...d, clusters: arr(d.clusters).filter(x => str(obj(x).name) === str(c.cluster)), contexts: [ctx], users: arr(d.users).filter(x => str(obj(x).name) === str(c.user)) };
}
/** The state with the kubeconfig file's new content (its mode and owner stay). */
function save(state: FsState, path: string, d: JObj): FsState {
  const node = state.nodes.get(path), nodes = new Map(state.nodes);
  if (node?.kind === 'file') nodes.set(path, { ...node, content: `${kubeYaml(d).join('\n')}\n` });
  return { ...state, nodes };
}

export function configCommand(state: FsState, cfg: KubeConfig, pos: readonly string[], flags: Flags, io: KubeIo): KubeResult {
  const [sub, name] = pos, ok = (lines: string[]) => { lines.forEach(l => io.out(l)); return { state, status: 0 }; };
  const fail = (line: string) => { io.err(line); return { state, status: 1 }; };
  if (!cfg.ok && cfg.error) return fail(cfg.error);
  const doc = cfg.ok ? cfg.doc : EMPTY, current = cfg.ok ? cfg.current : '';
  switch (sub) {
    case 'view': {
      const d = redact(flags.bools.has('minify') ? minify(doc, current) : doc, flags.bools.has('raw')) as JObj, out = flags.values.output?.at(-1);
      if (!out || out === 'yaml') return ok(kubeYaml(d));
      const p = printObjects(out, [d], true);
      if ('error' in p) return fail(p.error);
      if ('raw' in p) { io.raw(p.raw); return { state, status: 0 }; }
      return ok(p.lines);
    }
    case 'current-context': return current ? ok([current]) : fail('error: current-context is not set');
    case 'get-contexts': {
      const list = cfg.ok ? cfg.contexts.filter(c => !name || c.name === name) : [];
      if (name && !list.length) return fail(`error: context ${name} not found`);
      return ok(goTab(['CURRENT\tNAME\tCLUSTER\tAUTHINFO\tNAMESPACE', ...list.map(c => [c.name === current ? '*' : '', c.name, c.cluster, c.user, c.namespace ?? ''].join('\t'))]));
    }
    case 'get-clusters': return ok(['NAME', ...arr(doc.clusters).map(c => str(obj(c).name) ?? '')]);
    case 'get-users': return ok(['NAME', ...arr(doc.users).map(c => str(obj(c).name) ?? '')]);
    case 'use-context': {
      if (!name) return fail('error: Unexpected args: []');
      if (!cfg.ok || !cfg.contexts.some(c => c.name === name)) return fail(`error: no context exists with the name: "${name}"`);
      io.out(`Switched to context "${name}".`);
      return { state: save(state, cfg.path, { ...doc, 'current-context': name }), status: 0 };
    }
    case 'set-context': {
      if (!cfg.ok) return fail(`error: open ${cfg.path}: no such file or directory`);
      const target = flags.bools.has('current') ? current : name;
      if (!target) return fail('error: you must specify a non-empty context name or --current');
      const contexts = arr(doc.contexts), at = contexts.findIndex(c => str(obj(c).name) === target);
      const old = at >= 0 ? obj(obj(contexts[at]).context) : {}, set = (k: string, flagName: string, into: JObj) => { const v = flags.values[flagName]?.at(-1); if (v !== undefined) { if (v === '') delete into[k]; else into[k] = v; } };
      const context: JObj = { ...old };
      set('namespace', 'namespace', context); set('cluster', 'cluster', context); set('user', 'user', context);
      const entry = { context, name: target };
      io.out(`Context "${target}" ${at >= 0 ? 'modified' : 'created'}.`);
      return { state: save(state, cfg.path, { ...doc, contexts: at >= 0 ? contexts.map((c, i) => i === at ? entry : c) : [...contexts, entry] }), status: 0 };
    }
    default: return fail(sub ? `error: unknown command "${sub}" for "kubectl config"` : 'Modify kubeconfig files using subcommands like "kubectl config set current-context my-context"');
  }
}
