import type { Seconds } from './clock';
import { parseRef, programFor, qualified, runIn, type DockerImage, type DockerState } from './docker';
import { respond, type Responder } from './http';
import { argvOf, podContainer, resolveImage } from './kube-image';
import type { Action } from './kube-probe-spec';
import { mountNodes } from './kube-volumes';
import { arr, nameOf, obj, str, uidOf, type CSim, type J, type JObj, type KubeHealth, type KubeState } from './kube-model';

/*
 * Engine stage E33 (docs/curriculum/KUB0_E33_PROBES.md §3): what a probe or a hook meets in the container. The service is
 * the image's (or the lesson program's) E12 responder on its HTTP port, listening once the E23 `ready` seconds (or the
 * lesson's listenAfter) have passed since this run of the container started; an image's exposed ports listen too
 * (tcpSocket). The lesson's kube.health changes answers over time since the start (a path answering 500 after 60 s, 503
 * until 20 s; an exec command's exit status). Other exec commands run in the container's files (its writable layer
 * included) through docker.ts's runIn. The texts are the kubelet's (HTTP probe failed with statuscode, dial tcp … connection
 * refused, context deadline exceeded).
 */

/** E33: the lesson's time-dependent health of an image (the TerminalKube field health). */
export type TerminalKubeHealth = KubeHealth;
export interface Target { d: DockerState | undefined; k: KubeState; pod: JObj; spec: J; c: CSim; ip: string; t: Seconds }
export type Outcome = { ok: boolean; message: string; seconds: number } | { errored: string; seconds: number };

const sameImage = (a: string, b: string) => { const x = parseRef(a), y = parseRef(b); return a === b || (!!x && !!y && qualified(x) === qualified(y)); };
export const healthOf = (k: KubeState, image: string) => k.health?.find(h => sameImage(h.image, image));
const within = (w: { after?: number; until?: number }, age: number) => age >= (w.after ?? 0) && (w.until === undefined || age < w.until);

/** The container's service: its HTTP port and responder, the ports that listen, and seconds before they do. */
export function serviceOf(x: Target): { img?: DockerImage; http?: { port: number; responder: Responder }; ports: number[]; listen: number } {
  const res = resolveImage(x.d, x.c.image, x.k.config ? 'pulled' : undefined);
  if ('error' in res) return { ports: [], listen: 0 };
  const img = res.img, s = obj(x.spec), own = !s.command && !s.args && !img.ownMain, prog = own || !x.d ? undefined : programFor(x.d, argvOf(img, x.spec));
  const http = own ? img.http : prog?.http, service = own ? img.service : !!prog?.service;
  const ports = [...new Set([...http ? [http.port] : [], ...service && own ? img.expose : []])];
  return { img, ...http ? { http } : {}, ports, listen: healthOf(x.k, x.c.image)?.listenAfter ?? (own ? img.ready : prog?.ready) ?? 0 };
}
/** A port as a probe names it: a number, or the name of one of the container's ports. */
export function portOf(spec: J, p: number | string): number | undefined {
  if (typeof p === 'number') return p;
  const named = arr(obj(spec).ports).map(obj).find(x => str(x.name) === p);
  return typeof named?.containerPort === 'number' ? named.containerPort : undefined;
}
const SLEEP = /^(?:.*;\s*)?(?:exec\s+)?sleep\s+(\d+)\s*$/;
/** Seconds an exec command takes: sleep N, or sh -c "…; sleep N" (the hook pattern); else at once. */
function execSeconds(argv: readonly string[]): number {
  const base = (w: string | undefined) => (w ?? '').slice((w ?? '').lastIndexOf('/') + 1);
  if (base(argv[0]) === 'sleep' && /^\d+$/.test(argv[1] ?? '')) return Number(argv[1]);
  if (['sh', 'bash'].includes(base(argv[0])) && argv[1] === '-c' && argv[2] !== undefined) { const m = SLEEP.exec(argv[2]); if (m) return Number(m[1]); }
  return 0;
}

/** Runs a probe's (or hook's) action against the container at x.t; a probe gives up after `timeout` seconds. */
export function runAction(x: Target, a: Action, timeout: number): Outcome {
  if (a.kind === 'sleep') return { ok: true, message: '', seconds: a.seconds };
  const age = x.t - (x.c.started ?? x.t), health = healthOf(x.k, x.c.image);
  if (a.kind === 'exec') {
    const own = health?.exec?.find(e => e.command.join('\u0000') === a.command.join('\u0000') && within(e, age));
    if (own) {
      const seconds = own.seconds ?? 0;
      if (seconds >= timeout) return { ok: false, message: `command "${a.command.join(' ')}" timed out`, seconds: timeout };
      return { ok: (own.exit ?? 1) === 0, message: own.output ?? '', seconds };
    }
    const res = resolveImage(x.d, x.c.image, x.k.config ? 'pulled' : undefined);
    if ('error' in res) return { errored: 'container not found', seconds: 0 };
    // E36: an exec probe sees the container's configMap and secret volumes.
    const box = podContainer(res.img, x.spec, nameOf(x.pod), x.c.cid ?? '', x.t, x.c.layer, x.k.config ? mountNodes(x.pod, x.k.pods[uidOf(x.pod)], x.spec, x.c) : undefined);
    const r = a.command.length ? runIn(box, res.img, a.command, { tty: false, env: [], now: x.t }) : { notFound: '' };
    if ('notFound' in r) return { errored: `rpc error: code = Unknown desc = failed to exec in container: failed to start exec "${(x.c.cid ?? '').slice(0, 64)}": OCI runtime exec failed: exec failed: unable to start container process: exec: "${r.notFound}": executable file not found in $PATH: unknown`, seconds: 0 };
    const seconds = execSeconds(a.command);
    if (seconds >= timeout) return { ok: false, message: `command "${a.command.join(' ')}" timed out`, seconds: timeout };
    return { ok: r.status === 0, message: r.lines.map(l => l.text).join('\n'), seconds };
  }
  const port = portOf(x.spec, a.port), svc = serviceOf(x);
  if (port === undefined) return { errored: `unable to find port "${String(a.port)}" in container ${x.c.name}`, seconds: 0 };
  const dial = `dial tcp ${x.ip}:${port}`, open = svc.ports.includes(port) && age >= svc.listen;
  if (a.kind === 'tcp') return open ? { ok: true, message: '', seconds: 0 } : { ok: false, message: `${dial}: connect: connection refused`, seconds: 0 };
  const url = `Get "http://${x.ip}:${port}${a.path}"`;
  if (!open) return { ok: false, message: `${url}: ${dial}: connect: connection refused`, seconds: 0 };
  if (!svc.http || svc.http.port !== port) return { ok: false, message: `${url}: EOF`, seconds: 0 };
  const req = { method: 'GET', path: a.path, headers: [['Host', `${x.ip}:${port}`], ['User-Agent', 'kube-probe/1.32'], ['Accept', '*/*'], ['Connection', 'close'], ...a.headers] as [string, string][] };
  const rule = health?.paths?.find(p => p.path === a.path.split('?')[0] && within(p, age));
  const res = rule ? { status: rule.status ?? 500, wait: rule.delay } : respond(svc.http.responder, req, x.t);
  const wait = res.wait ?? 0;
  if (wait >= timeout) return { ok: false, message: `${url}: context deadline exceeded (Client.Timeout exceeded while awaiting headers)`, seconds: timeout };
  return res.status >= 200 && res.status < 400 ? { ok: true, message: '', seconds: wait } : { ok: false, message: `HTTP probe failed with statuscode: ${res.status}`, seconds: wait };
}

const whole = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
/** E33: the problems of the lesson's kube.health (images the lesson declares, small windows, valid answers). */
export function healthProblems(list: unknown, images: readonly string[]): string[] {
  if (!Array.isArray(list) || list.length > 12) return ['kube: health lists at most 12 images'];
  const out: string[] = [], seen = new Set<string>();
  for (const h0 of list) {
    const h = h0 as KubeHealth, at = `kube: health ${String(h?.image)}`;
    if (typeof h?.image !== 'string' || !parseRef(h.image) || !images.some(i => sameImage(i, h.image))) { out.push(`${at}: image is one of the machine's docker images`); continue; }
    if (seen.has(h.image)) out.push(`${at}: listed twice`);
    seen.add(h.image);
    if (h.listenAfter !== undefined && !whole(h.listenAfter, 0, 3600)) out.push(`${at}: listenAfter is 0..3600 seconds`);
    const windowOk = (w: { after?: number; until?: number }) => (w.after === undefined || whole(w.after, 0, 86400)) && (w.until === undefined || whole(w.until, (w.after ?? 0) + 1, 86400));
    if (h.paths !== undefined && (!Array.isArray(h.paths) || h.paths.length > 8 || h.paths.some(p => typeof p.path !== 'string' || !p.path.startsWith('/') || p.path.length > 200 || (p.status !== undefined && !whole(p.status, 100, 599)) || (p.delay !== undefined && !whole(p.delay, 0, 600)) || !windowOk(p))))
      out.push(`${at}: paths are at most 8 of { path: /…, status 100..599, delay 0..600, after, until > after (seconds since the start) }`);
    if (h.exec !== undefined && (!Array.isArray(h.exec) || h.exec.length > 8 || h.exec.some(e => !Array.isArray(e.command) || !e.command.length || e.command.length > 20 || e.command.some((w: unknown) => typeof w !== 'string' || !w || w.includes('\n'))
      || (e.exit !== undefined && !whole(e.exit, 0, 255)) || (e.output !== undefined && (typeof e.output !== 'string' || e.output.length > 500 || e.output.includes('\n'))) || (e.seconds !== undefined && !whole(e.seconds, 0, 600)) || !windowOk(e))))
      out.push(`${at}: exec is at most 8 of { command: words, exit 0..255, output (one line), seconds 0..600, after, until > after }`);
  }
  return out;
}
