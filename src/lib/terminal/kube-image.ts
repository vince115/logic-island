import type { Seconds } from './clock';
import type { FsNode } from './fs';
import { imageNodes, parseRef, programFor, qualified, runIn, seedLines, type DockerContainer, type DockerImage, type DockerState, type LogLine, type LogSeed } from './docker';
import { digestRefOf, hostOf } from './registry';
import type { RuntimeSpec } from './runtime';
import { arr, bytesOf, obj, quantityText, str, type J } from './kube-model';
import { isMountPoint } from './kube-storage-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §6): what a pod's container is. Images come from the lesson's
 * docker.images (the simulated Docker Hub) and docker.registries (a public registry; a private one needs imagePullSecrets,
 * engine stage E36), pulled by each node's containerd. What the main process does reuses the E21–E24 program model: the
 * image's own behaviour unless command or args replace it, a program the lesson declares (docker.programs), or the
 * simulation's shell (sh -c, sleep, echo…) through docker.ts's runIn — so needsEnv, exitAfter and memory work as in Docker.
 */

export type Resolved = { img: DockerImage; name: string } | { error: string; reason: 'ErrImagePull' | 'InvalidImageName' };
/** E36: a registry login from a pod's imagePullSecrets (a kubernetes.io/dockerconfigjson Secret's auths). */
export interface RegCred { host: string; user: string; token: string }
/** E36: how a pull may authenticate — the pod's registry logins, or 'pulled' (the node already has the image: no login needed). */
export type PullAuth = 'pulled' | { creds: readonly RegCred[] };
const UNPACK = (q: string) => `failed to pull and unpack image "${q}": failed to resolve reference "${q}"`;
/** The image a container names, as a node's containerd pulls it (or containerd's error). */
export function resolveImage(d: DockerState | undefined, image: string, auth?: PullAuth): Resolved {
  const digest = image.includes('@') ? digestRefOf(image) : null, ref = digest ? parseRef(digest.repo) : parseRef(image);
  if (!ref) return { reason: 'InvalidImageName', error: `Failed to apply default image tag "${image}": couldn't parse image name "${image}": invalid reference format` };
  const q = digest ? `${qualified(ref).replace(/:[^:/]+$/, '')}@sha256:${digest.digest}` : qualified(ref), host = hostOf(ref.repo);
  if (host) {
    const reg = d?.registries?.find(r => r.host === host);
    if (!reg) return { reason: 'ErrImagePull', error: `rpc error: code = Unknown desc = ${UNPACK(q)}: failed to do request: Head "https://${host}/v2/${ref.repo.slice(host.length + 1)}/manifests/${digest ? `sha256:${digest.digest}` : ref.tag}": dial tcp: lookup ${host.split(':')[0]}: no such host` };
    const path = ref.repo.slice(host.length + 1), cred = auth && auth !== 'pulled' ? auth.creds.find(c => c.host === host) : undefined;
    if (!reg.public && auth !== 'pulled') {
      if (!cred) return { reason: 'ErrImagePull', error: `rpc error: code = Unknown desc = ${UNPACK(q)}: pull access denied, repository does not exist or may require authorization: authorization failed: no basic auth credentials` };
      // E36: the login of the pod's imagePullSecrets (a wrong one is the registry's 401; a user without the repository is denied).
      const who = reg.users.find(u => u.name === cred.user && u.token === cred.token);
      if (!who) return { reason: 'ErrImagePull', error: `rpc error: code = Unknown desc = ${UNPACK(q)}: unexpected status from HEAD request to https://${host}/v2/${path}/manifests/${digest ? `sha256:${digest.digest}` : ref.tag}: 401 Unauthorized` };
      if (who.repos && !who.repos.some(p => p === path || (p.endsWith('/*') && path.startsWith(p.slice(0, -1))))) return { reason: 'ErrImagePull', error: `rpc error: code = Unknown desc = ${UNPACK(q)}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed` };
    }
    const at = digest ? `sha256:${digest.digest}` : reg.tags[path]?.[ref.tag];
    const m = at ? reg.manifests[at.replace(/^sha256:/, '')] ?? reg.manifests[at] : undefined;
    if (m) return { img: m.image, name: q };
  } else {
    const img = d?.images.find(i => i.pullable && !i.built && i.repo === ref.repo && (digest ? i.digest === digest.digest : i.tag === ref.tag));
    if (img) return { img, name: q };
  }
  return { reason: 'ErrImagePull', error: `rpc error: code = NotFound desc = ${UNPACK(q)}: ${q}: not found` };
}
export const imageIdOf = (r: { img: DockerImage; name: string }) => `${r.name.replace(/[:@][^/]*$/, '')}@sha256:${r.img.digest}`;

/** The container's environment as its processes see it: PATH, HOSTNAME (the pod), env, the kubernetes service's variables, the image's ENV, HOME. */
export function podEnv(spec: J, img: DockerImage | undefined, pod: string, links = true, resolved?: readonly (readonly [string, string])[]): string[] {
  // E36: the variables the kubelet resolved (env with valueFrom, envFrom) replace the spec's plain values.
  const own = resolved ?? arr(obj(spec).env).map(e => [str(obj(e).name) ?? '', str(obj(e).value) ?? ''] as const).filter(([n]) => n);
  const imageEnv = img?.env ?? [], names = new Set(own.map(([n]) => n));
  const path = imageEnv.find(e => e.startsWith('PATH=')) ?? 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  const service = links ? ['KUBERNETES_SERVICE_HOST=10.96.0.1', 'KUBERNETES_SERVICE_PORT=443', 'KUBERNETES_SERVICE_PORT_HTTPS=443', 'KUBERNETES_PORT=tcp://10.96.0.1:443',
    'KUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443', 'KUBERNETES_PORT_443_TCP_PROTO=tcp', 'KUBERNETES_PORT_443_TCP_PORT=443', 'KUBERNETES_PORT_443_TCP_ADDR=10.96.0.1'] : [];
  return [names.has('PATH') ? undefined : path, `HOSTNAME=${pod}`, ...own.map(([n, v]) => `${n}=${v}`), ...service.filter(e => !names.has(e.split('=')[0])),
    ...imageEnv.filter(e => !e.startsWith('PATH=') && !names.has(e.split('=')[0])), names.has('HOME') ? undefined : 'HOME=/root'].filter((e): e is string => e !== undefined);
}

/** The container as docker.ts's runIn sees it (its files: the image's and its writable layer). */
export function podContainer(img: DockerImage, spec: J, pod: string, cid: string, t: Seconds, layer?: ReadonlyMap<string, FsNode>, mounts?: ReadonlyMap<string, FsNode>): DockerContainer {
  const argv = argvOf(img, spec), nodes = imageNodes(img, cid);
  nodes.set('/etc/hostname', { kind: 'file', mode: 0o644, owner: 'root', content: `${pod}\n` });
  // E36: the configMap and secret volumes (kube-volumes.ts) over the image's files, under the writable layer: a volume's
  // folder hides what the image had there; the folders above it are the image's when it has them.
  // E38: a storage volume's mount point hides the image's files under it too.
  const hides = (p: string) => mounts!.has(`${p}/..data`) || isMountPoint(mounts!.get(p));
  for (const p of [...mounts?.keys() ?? []].filter(hides)) for (const q of [...nodes.keys()]) if (q.startsWith(`${p}/`)) nodes.delete(q);
  for (const [p, n] of mounts ?? []) if (n.kind !== 'dir' || !nodes.has(p) || hides(p)) nodes.set(p, n);
  for (const [p, n] of layer ?? []) nodes.set(p, n);
  return { id: cid, name: pod, ref: img.repo, image: img.id, path: argv[0] ?? 'sh', args: argv.slice(1), cmd: argv, custom: true, created: t, started: t, status: 'running', exitCode: 0,
    ports: [], env: [], workdir: str(obj(spec).workingDir) ?? (img.workdir || '/'), rm: false, tty: false, interactive: false, logs: [], nodes, execs: 0, hostname: pod, ...img.user ? { user: img.user } : {} };
}
/** command replaces ENTRYPOINT, args replaces CMD (command alone drops CMD); an entrypoint script hands over to the command. */
export function argvOf(img: DockerImage, spec: J): string[] {
  const s = obj(spec), command = s.command ? arr(s.command).map(String) : undefined, args = s.args ? arr(s.args).map(String) : undefined;
  const argv = [...command ?? img.entrypoint, ...args ?? (command ? [] : img.cmd)];
  return argv[0]?.endsWith('.sh') && argv.length > 1 ? argv.slice(1) : argv;
}

/** What the main process does from its start: lines it prints, an exit now or later (OOM at the memory limit), or a start error. */
export interface Behaviour { lines: LogLine[]; exit?: { exit: number; oom?: boolean }; later?: { at: Seconds; exit: number; oom?: boolean; logs: readonly LogSeed[] }; startError?: string; nodes?: ReadonlyMap<string, FsNode> }
const outputLines = (text: string | undefined, t: Seconds): LogLine[] => text ? text.replace(/\n$/, '').split('\n').map(line => ({ t, stream: 1 as const, text: line })) : [];
/** redirects (E38): the main shell line's parts may redirect and pipe (echo … > /data/x; sleep 3600), as on the kube-storage profile. */
export function behaviour(d: DockerState | undefined, img: DockerImage, spec: J, pod: string, cid: string, t: Seconds, resolved?: readonly (readonly [string, string])[], mounts?: ReadonlyMap<string, FsNode>, redirects = false): Behaviour {
  const s = obj(spec), own = !s.command && !s.args && !img.ownMain, argv = argvOf(img, spec);
  const prog = own ? undefined : d ? programFor(d, argv) : undefined;
  const rt: RuntimeSpec | undefined = own ? img.runtime : prog?.runtime;
  const env = podEnv(spec, img, pod, true, resolved);
  const missing = (rt?.needsEnv ?? []).find(n => { const e = env.find(x => x.startsWith(`${n}=`)); return !e || e === `${n}=`; });
  if (missing !== undefined) return { lines: outputLines(rt?.missingEnv?.output ?? `（模擬環境：程式需要環境變數 ${missing}，但容器沒有設定它）`, t).map(l => ({ ...l, stream: 2 as const })), exit: { exit: rt?.missingEnv?.exit ?? 1 } };
  const limitText = quantityText(obj(obj(s.resources).limits).memory), limit = limitText ? bytesOf(limitText) ?? undefined : undefined;
  const m = rt?.memory;
  const oomAt = limit === undefined || !m ? undefined : m.start > limit ? t : m.growth > 0 && (m.max === undefined || m.max > limit) ? t + Math.ceil((limit - m.start) / m.growth) : undefined;
  const run = (service: boolean, lines: LogLine[], exit: number, until?: Seconds): Behaviour => {
    if (oomAt !== undefined && oomAt <= t) return { lines, exit: { exit: 137, oom: true } };
    if (!service) return { lines, exit: { exit } };
    const after = rt?.exitAfter ? { at: t + rt.exitAfter.seconds, exit: rt.exitAfter.exit, logs: rt.exitAfter.logs } : until !== undefined ? { at: until, exit: 0, logs: [] } : undefined;
    if (oomAt !== undefined && oomAt <= (after?.at ?? Infinity)) return { lines, later: { at: oomAt, exit: 137, oom: true, logs: [] } };
    return after ? { lines, later: after } : { lines };
  };
  if (own) return run(img.service, [...seedLines(img.logs, t), ...img.service ? [] : outputLines(img.output, t)], img.exit);
  if (prog) return run(prog.service, [...seedLines(prog.logs, t), ...prog.service ? [] : outputLines(prog.output, t)], prog.exit);
  const box = podContainer(img, spec, pod, cid, t, undefined, mounts);
  const r = shellMain(box, img, argv, t, redirects) ?? runIn(box, img, argv, { tty: false, env: [], now: t, main: true });
  if ('notFound' in r) return { lines: [], startError: `failed to create containerd task: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "${r.notFound}": executable file not found in $PATH: unknown` };
  const lines = r.lines.map(l => ({ ...l, t }));
  // E33 reads nodes: what the main shell line wrote (touch /tmp/healthy) stays in the container's layer on the probes profile.
  return { ...r.running ? run(true, lines, 0, r.until) : run(false, lines, r.status), nodes: r.nodes };
}

/** Splits a shell line at ; and && outside quotes (each part with the operator before it). */
function parts(line: string): { op: ';' | '&&'; text: string }[] {
  const out: { op: ';' | '&&'; text: string }[] = [];
  let q: string | null = null, cur = '', op: ';' | '&&' = ';';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ';' || (ch === '&' && line[i + 1] === '&')) { out.push({ op, text: cur.trim() }); op = ch === ';' ? ';' : '&&'; if (ch === '&') i++; cur = ''; continue; }
    cur += ch;
  }
  out.push({ op, text: cur.trim() });
  return out.filter(p => p.text);
}
/**
 * The common main process of a pod's container: sh -c "a; b && c; sleep N" (or exec sleep, sleep infinity) — each part
 * runs as its own simple command in the container (docker.ts's runIn), and a last sleep keeps the container running.
 * null: not that form (runIn takes the whole command).
 */
function shellMain(c: DockerContainer, img: DockerImage, argv: readonly string[], t: Seconds, redirects = false): ReturnType<typeof runIn> | null {
  if (!['sh', 'bash', '/bin/sh', '/bin/bash'].includes(argv[0]) || argv[1] !== '-c' || argv.length !== 3 || !/;|&&/.test(argv[2]) || (redirects ? /[`$]|\|\|/ : /[|<>`$]|\|\|/).test(argv[2])) return null;
  const lines: { stream: 1 | 2; text: string }[] = [];
  let box = c, status = 0;
  const list = parts(argv[2]);
  for (const [i, p] of list.entries()) {
    if (p.op === '&&' && status !== 0) continue;
    const sleep = /^(?:exec\s+)?sleep\s+(\S+)$/.exec(p.text);
    if (sleep && i === list.length - 1) {
      const r = runIn(box, img, ['sleep', sleep[1]], { tty: false, env: [], now: t, main: true });
      if ('notFound' in r) return r;
      return { ...r, lines: [...lines, ...r.lines] };
    }
    const ex = /^exit(?:\s+(\d+))?$/.exec(p.text);
    if (ex) return { lines, status: ex[1] ? Number(ex[1]) % 256 : status, nodes: box.nodes };
    const r = runIn(box, img, [argv[0], '-c', p.text], { tty: false, env: [], now: t, main: false });
    if ('notFound' in r) { lines.push({ stream: 2, text: `${argv[0].replace(/^.*\//, '')}: 1: ${r.notFound}: not found` }); status = 127; continue; }
    lines.push(...r.lines);
    status = r.status;
    box = { ...box, nodes: r.nodes };
  }
  return { lines, status, nodes: box.nodes };
}
