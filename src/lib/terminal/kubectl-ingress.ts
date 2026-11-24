import { goJson, kubeYaml } from './kube-output';
import { createDoc } from './kube-write';
import type { J, JObj } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §9): kubectl create ingress NAME --rule=host/path=service:port
 * [,tls[=secret]] (repeatable) [--class=] [--default-backend=service:port] [--annotation=key=value] — the object as
 * kubectl's generator builds it: rules of the same host merged, a path ending in * is Prefix (the * dropped) and any other
 * Exact, a numeric port is port.number and a name port.name, TLS hosts grouped by secret (each host once).
 * --dry-run=client -o yaml|json prints it.
 */

const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
const RULE = /^([\w*\-.]*)\/(.*)=([a-z0-9][a-z0-9-]{0,61}[a-z0-9]?):([\w-]+)(,tls(=([\w-]+))?)?$/;
const BACKEND = /^([a-z0-9][a-z0-9-]{0,61}[a-z0-9]?):([\w-]+)$/;
const port = (p: string): J => /^\d+$/.test(p) ? { number: Number(p) } : { name: p };

export function ingressVerb(x: Kx): KubeResult | undefined {
  if (x.verb !== 'create' || (x.pos[0] !== 'ingress' && x.pos[0] !== 'ing')) return undefined;
  const name = x.pos[1], rules = x.flags.values.rule ?? [], def = flag(x, 'default-backend'), annotations: JObj = {};
  if (!name || x.pos.length > 2) return fail(x, `error: exactly one NAME is required, got ${x.pos.length - 1}`);
  if (def === undefined && !rules.length) return fail(x, 'error: not enough information provided: every ingress has to either specify a default-backend (which catches all traffic) or a list of rules (which catch specific paths)');
  for (const a of x.flags.values.annotation ?? []) {
    const m = /^([\w\-./]+)=(.*)$/s.exec(a);
    if (!m) return fail(x, `error: annotation ${a} is invalid and should be in format key=[value]`);
    annotations[m[1]] = m[2];
  }
  if (def !== undefined && !BACKEND.test(def)) return fail(x, 'error: default-backend should be in format servicename:serviceport');
  const built: JObj[] = [], tls: { secretName: string; hosts: string[] }[] = [], seen = new Set<string>();
  for (const r of rules) {
    const m = RULE.exec(r);
    if (!m) return fail(x, `error: rule ${r} is invalid and should be in format host/path=svcname:svcport[,tls[=secret]]`);
    const [, host, rest, svc, p, withTls, , secret] = m, path0 = `/${rest}`, prefix = path0.endsWith('*');
    const entry: J = { backend: { service: { name: svc, port: port(p) } }, path: prefix ? path0.slice(0, -1) : path0, pathType: prefix ? 'Prefix' : 'Exact' };
    const same = built.find(b => (b.host ?? '') === host);
    if (same) (((same.http as JObj).paths) as J[]).push(entry);
    else built.push({ ...host ? { host } : {}, http: { paths: [entry] } });
    if (withTls && !seen.has(host)) {
      seen.add(host);
      const t = tls.find(e => e.secretName === (secret ?? ''));
      if (t) { if (host) t.hosts.push(host); } else tls.push({ secretName: secret ?? '', hosts: host ? [host] : [] });
    }
  }
  const cls = flag(x, 'class'), bp = def ? BACKEND.exec(def)! : undefined;
  const spec: JObj = { ...cls ? { ingressClassName: cls } : {}, ...bp ? { defaultBackend: { service: { name: bp[1], port: port(bp[2]) } } } : {}, ...built.length ? { rules: built } : {},
    ...tls.length ? { tls: tls.map(t => ({ ...t.hosts.length ? { hosts: t.hosts } : {}, ...t.secretName ? { secretName: t.secretName } : {} })) } : {} };
  const doc: JObj = { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { ...Object.keys(annotations).length ? { annotations } : {}, creationTimestamp: null, name, ...x.nsGiven ? { namespace: x.ns } : {} }, spec, status: { loadBalancer: {} } };
  const dry = flag(x, 'dry-run'), out = flag(x, 'output');
  if (dry === 'client') {
    if (out === 'yaml') kubeYaml(doc).forEach(l => x.io.out(l));
    else if (out === 'json') goJson(doc).split('\n').forEach(l => x.io.out(l));
    else x.io.out(`ingress.networking.k8s.io/${name} created (dry run)`);
    return { state: x.state, status: 0 };
  }
  const r = createDoc(x.k, doc, x.ns, x.now, 'STDIN');
  if ('error' in r) {
    const e = r.error.replace('error when creating "STDIN": ', '').replace(/^Error from server \(\w+\): /, '').replace(/^The Ingress /, 'Ingress.networking.k8s.io ');
    return fail(x, /^（/.test(e) ? e : `error: failed to create ingress: ${e}`);
  }
  x.io.out(`ingress.networking.k8s.io/${name} created`);
  return { state: { ...x.state, kube: r.k }, status: 0 };
}
