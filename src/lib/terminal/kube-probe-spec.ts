import { arr, obj, str, type J, type JObj } from './kube-model';

/*
 * Engine stage E33 (docs/curriculum/KUB0_E33_PROBES.md §2): a container's probes and lifecycle hooks as the API server
 * keeps them. Defaults (SetDefaults_Probe, SetDefaults_HTTPGetAction): timeoutSeconds 1, periodSeconds 10,
 * successThreshold 1, failureThreshold 3, httpGet path / and scheme HTTP; initialDelaySeconds stays absent (0). Validation
 * in the API server's words (one handler, non-negative numbers, a liveness or startup successThreshold of 1, ports, no
 * probes or lifecycle on init containers), the fields only prose covers (grpc, host, HTTPS, a probe's own grace period,
 * postStart, tcpSocket hooks), and kubectl describe's line (DescribeProbe).
 */

export type ProbeType = 'liveness' | 'readiness' | 'startup';
export const PROBE_TYPES: readonly ProbeType[] = ['startup', 'liveness', 'readiness'];
export const PROBE_FIELD: Record<ProbeType, string> = { liveness: 'livenessProbe', readiness: 'readinessProbe', startup: 'startupProbe' };
export const PROBE_NAME: Record<ProbeType, string> = { liveness: 'Liveness', readiness: 'Readiness', startup: 'Startup' };
export type Action =
  | { kind: 'http'; path: string; port: number | string; headers: [string, string][] }
  | { kind: 'tcp'; port: number | string }
  | { kind: 'exec'; command: string[] }
  | { kind: 'sleep'; seconds: number };
export interface Probe { action: Action; delay: number; timeout: number; period: number; success: number; failure: number }

const num = (v: J | undefined, d: number) => typeof v === 'number' && v > 0 ? v : d;
const port = (v: J | undefined): number | string => typeof v === 'number' ? v : str(v) ?? '';
/** The handler of a probe or hook (the first of exec, httpGet, tcpSocket, sleep). */
export function actionOf(h0: J | undefined): Action | undefined {
  const h = obj(h0);
  if (h.exec !== undefined) return { kind: 'exec', command: arr(obj(h.exec).command).map(String) };
  if (h.httpGet !== undefined) {
    const g = obj(h.httpGet);
    return { kind: 'http', path: str(g.path) || '/', port: port(g.port), headers: arr(g.httpHeaders).map(x => [str(obj(x).name) ?? '', str(obj(x).value) ?? ''] as [string, string]) };
  }
  if (h.tcpSocket !== undefined) return { kind: 'tcp', port: port(obj(h.tcpSocket).port) };
  if (h.sleep !== undefined) return { kind: 'sleep', seconds: Number(obj(h.sleep).seconds ?? 0) };
  return undefined;
}
/** A container's probe of this type (defaults applied), or undefined. */
export function probeOf(spec: J | undefined, type: ProbeType): Probe | undefined {
  const p = obj(spec)[PROBE_FIELD[type]];
  if (p === undefined || p === null) return undefined;
  const o = obj(p), action = actionOf(o);
  if (!action) return undefined;
  return { action, delay: typeof o.initialDelaySeconds === 'number' ? o.initialDelaySeconds : 0, timeout: num(o.timeoutSeconds, 1), period: num(o.periodSeconds, 10), success: num(o.successThreshold, 1), failure: num(o.failureThreshold, 3) };
}
export const probesOf = (spec: J | undefined) => PROBE_TYPES.filter(t => probeOf(spec, t));
export const preStopOf = (spec: J | undefined) => actionOf(obj(obj(obj(spec).lifecycle).preStop));

/** The API server's defaults of a container's probes and hooks (only the ones it has). */
export function defaultProbes(c: JObj): void {
  const http = (h: J | undefined) => { const o = obj(h); if (o.httpGet !== undefined) o.httpGet = { path: '/', scheme: 'HTTP', ...obj(o.httpGet) }; return o; };
  for (const f of Object.values(PROBE_FIELD)) {
    if (c[f] === undefined || c[f] === null) continue;
    const p = http({ ...obj(c[f]) });
    for (const [k, d] of [['timeoutSeconds', 1], ['periodSeconds', 10], ['successThreshold', 1], ['failureThreshold', 3]] as const) if (!p[k]) p[k] = d;
    c[f] = p;
  }
  if (c.lifecycle !== undefined && c.lifecycle !== null) {
    const l = { ...obj(c.lifecycle) };
    for (const h of ['preStop', 'postStart']) if (l[h] !== undefined) l[h] = http({ ...obj(l[h]) });
    c.lifecycle = l;
  }
}

/** kubectl describe's text of a probe: http-get http://:8080/healthz delay=0s timeout=1s period=10s #success=1 #failure=3. */
export function describeProbe(p0: J): string {
  const p = obj(p0), n = (k: string) => String(typeof p[k] === 'number' ? p[k] : 0);
  const attrs = `delay=${n('initialDelaySeconds')}s timeout=${n('timeoutSeconds')}s period=${n('periodSeconds')}s #success=${n('successThreshold')} #failure=${n('failureThreshold')}`;
  if (p.exec !== undefined) return `exec [${arr(obj(p.exec).command).map(String).join(' ')}] ${attrs}`;
  if (p.httpGet !== undefined) {
    const g = obj(p.httpGet), pt = g.port === undefined ? '' : String(g.port), host = str(g.host) ?? '';
    return `http-get ${(str(g.scheme) ?? 'HTTP').toLowerCase()}://${pt ? `${host.includes(':') ? `[${host}]` : host}:${pt}` : host}${str(g.path) ?? ''} ${attrs}`;
  }
  if (p.tcpSocket !== undefined) return `tcp-socket ${str(obj(p.tcpSocket).host) ?? ''}:${String(obj(p.tcpSocket).port ?? '')} ${attrs}`;
  return `unknown ${attrs}`;
}

const HANDLERS = ['exec', 'httpGet', 'tcpSocket', 'grpc'];
const HOOK_HANDLERS = ['exec', 'httpGet', 'tcpSocket', 'sleep'];
const IANA = /^(?=.*[a-z])[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
function portErrors(v: J | undefined, at: string): string[] {
  if (typeof v === 'number') return v >= 1 && v <= 65535 ? [] : [`${at}: Invalid value: ${v}: must be between 1 and 65535, inclusive`];
  const s = str(v) ?? '';
  if (!s) return [`${at}: Required value`];
  return s.length <= 15 && IANA.test(s) && !s.includes('--') ? [] : [`${at}: Invalid value: "${s}": must contain only alpha-numeric characters (a-z, 0-9), and hyphens (-)`];
}
function handlerErrors(h: JObj, at: string, kinds: readonly string[]): string[] {
  const set = kinds.filter(k => h[k] !== undefined && h[k] !== null);
  if (!set.length) return [`${at}: Required value: must specify a handler type`];
  if (set.length > 1) return [`${at}: Forbidden: may not specify more than 1 handler type`];
  const k = set[0], v = obj(h[k]);
  if (k === 'exec') return arr(v.command).length ? [] : [`${at}.exec.command: Required value`];
  if (k === 'httpGet') {
    const scheme = str(v.scheme) ?? 'HTTP';
    return [...portErrors(v.port, `${at}.httpGet.port`), ...['HTTP', 'HTTPS'].includes(scheme) ? [] : [`${at}.httpGet.scheme: Unsupported value: "${scheme}": supported values: "HTTP", "HTTPS"`]];
  }
  if (k === 'tcpSocket') return portErrors(v.port, `${at}.tcpSocket.port`);
  if (k === 'sleep') return typeof v.seconds === 'number' && v.seconds >= 0 ? [] : [`${at}.sleep.seconds: Invalid value: ${String(v.seconds ?? 0)}: must be greater than or equal to 0`];
  return [];
}
/** E33: the field errors of a Pod's probes, hooks and grace period (after the E32 errors, in the API server's order). */
export function probeErrors(doc: JObj): string[] {
  const spec = obj(doc.spec), out: string[] = [], grace = spec.terminationGracePeriodSeconds;
  if (typeof grace === 'number' && grace < 0) out.push(`spec.terminationGracePeriodSeconds: Invalid value: ${grace}: must be greater than or equal to 0`);
  for (const list of ['initContainers', 'containers']) arr(spec[list]).forEach((c0, i) => {
    const c = obj(c0), at = `spec.${list}[${i}]`;
    for (const [type, f] of Object.entries(PROBE_FIELD) as [ProbeType, string][]) {
      if (c[f] === undefined || c[f] === null) continue;
      if (list === 'initContainers') { out.push(`${at}.${f}: Forbidden: may not be set for init containers without restartPolicy=Always`); continue; }
      const p = obj(c[f]);
      out.push(...handlerErrors(p, `${at}.${f}`, HANDLERS));
      for (const k of ['initialDelaySeconds', 'timeoutSeconds', 'periodSeconds', 'successThreshold', 'failureThreshold']) if (typeof p[k] === 'number' && p[k] < 0) out.push(`${at}.${f}.${k}: Invalid value: ${p[k]}: must be greater than or equal to 0`);
      if (type !== 'readiness' && typeof p.successThreshold === 'number' && p.successThreshold > 1) out.push(`${at}.${f}.successThreshold: Invalid value: ${p.successThreshold}: must be 1`);
    }
    if (c.lifecycle === undefined || c.lifecycle === null) return;
    if (list === 'initContainers') { out.push(`${at}.lifecycle: Forbidden: may not be set for init containers without restartPolicy=Always`); return; }
    for (const h of ['postStart', 'preStop']) { const v = obj(c.lifecycle)[h]; if (v !== undefined && v !== null) out.push(...handlerErrors(obj(v), `${at}.lifecycle.${h}`, HOOK_HANDLERS)); }
  });
  return out;
}
const PROSE = '（課文說明）';
/** E33: the first probe or hook field only prose covers (its path), or null. */
export function probeLater(doc: JObj): { path: string; stage: string } | null {
  for (const [i, c0] of arr(obj(doc.spec).containers).entries()) {
    const c = obj(c0), at = `spec.containers[${i}]`;
    for (const f of Object.values(PROBE_FIELD)) {
      const p = obj(c[f]);
      if (p.grpc !== undefined) return { path: `${at}.${f}.grpc`, stage: PROSE };
      if (p.terminationGracePeriodSeconds !== undefined) return { path: `${at}.${f}.terminationGracePeriodSeconds`, stage: PROSE };
      const g = obj(p.httpGet), tcp = obj(p.tcpSocket);
      if (g.host !== undefined || tcp.host !== undefined) return { path: `${at}.${f}.${g.host !== undefined ? 'httpGet' : 'tcpSocket'}.host`, stage: PROSE };
      if (str(g.scheme) === 'HTTPS') return { path: `${at}.${f}.httpGet.scheme`, stage: PROSE };
    }
    const l = obj(c.lifecycle);
    if (l.postStart !== undefined) return { path: `${at}.lifecycle.postStart`, stage: PROSE };
    if (obj(l.preStop).tcpSocket !== undefined) return { path: `${at}.lifecycle.preStop.tcpSocket`, stage: PROSE };
    if (obj(obj(l.preStop).httpGet).host !== undefined || str(obj(obj(l.preStop).httpGet).scheme) === 'HTTPS') return { path: `${at}.lifecycle.preStop.httpGet`, stage: PROSE };
  }
  return null;
}
