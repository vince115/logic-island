import type { FsNode, FsState } from './fs';
import type { DockerContainer, DockerImage, RunOptions } from './docker';
import { curl, parseUrl } from './http';
import { podView, kubeConnect } from './kube-net';
import { kubeResolver, nslookup, podFqdn, podHostsFile, resolvConf } from './kube-dns';
import { nameOf, nsOf, uidOf, type JObj } from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §6): kubectl exec on the kube-net profile. The container gets
 * the kubelet's /etc/hosts and /etc/resolv.conf (not part of its writable layer) and the pod's network view, so curl,
 * getent and nc (docker.ts's container shell, E22's commands) work inside pods, loops included. nslookup (DNS only, as
 * Ubuntu's bind9-dnsutils prints it) and BusyBox's wget (-q, -O -, -T; through curl's machinery, following redirects)
 * run here when the image has them, as the command right after --.
 */

const file = (content: string): FsNode => ({ kind: 'file', mode: 0o644, owner: 'root', content });
/** The kubelet's files of the pod (kept out of the writable layer) and the pod's network view. */
export function podExec(state: FsState, pod: JObj, box: DockerContainer, layer?: ReadonlyMap<string, FsNode>): { files: [string, FsNode][]; view: NonNullable<RunOptions['view']> } {
  const ip = state.kube!.pods[uidOf(pod)]!.ip;
  const files: [string, FsNode][] = [['/etc/hosts', file(podHostsFile(ip, nameOf(pod), podFqdn(pod)))], ['/etc/resolv.conf', file(resolvConf(nsOf(pod) ?? 'default'))]];
  const nodes = box.nodes as Map<string, FsNode>;
  for (const [p, n] of files) if (!layer?.has(p)) nodes.set(p, n);
  return { files, view: { ...podView(state, pod), ...state.clock ? { clock: state.clock } : {} } };
}
type Done = { lines: { stream: 1 | 2; text: string }[]; status: number; kubeNet?: FsState['kubeNet']; nodes: ReadonlyMap<string, FsNode> };
const has = (img: DockerImage, cmd: string) => (img.commands ?? []).includes(cmd);

/** nslookup and wget in the pod (undefined: another command, for docker.ts's runIn). */
export function podNetCommand(box: DockerContainer, img: DockerImage, view: NonNullable<RunOptions['view']>, argv: readonly string[]): Done | undefined {
  const name = argv[0].slice(argv[0].lastIndexOf('/') + 1);
  if ((name !== 'nslookup' && name !== 'wget') || !has(img, name)) return undefined;
  const done = (d: Omit<Done, 'nodes'>): Done => ({ ...d, nodes: box.nodes });
  const state: FsState = { nodes: box.nodes, cwd: '/', user: 'root', home: '/root', host: box.hostname ?? box.name, ...view };
  if (name === 'nslookup') {
    const r = nslookup(state, argv.slice(1));
    return done({ lines: [...r.out.map(text => ({ stream: 1 as const, text })), ...r.err.map(text => ({ stream: 2 as const, text }))], status: r.status });
  }
  return done(wget(state, argv.slice(1)));
}

/** BusyBox wget: -q, -O FILE (only - is simulated), -T SECONDS, one URL (http://, or a bare host). */
function wget(state: FsState, args: readonly string[]): Omit<Done, 'nodes'> {
  const lines: Done['lines'] = [], err = (text: string) => lines.push({ stream: 2, text });
  let quiet = false, output: string | undefined, url: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-T') { i++; continue; }
    if (/^-[qO]+/.test(a) && !a.startsWith('--')) {
      for (let j = 1; j < a.length; j++) {
        if (a[j] === 'q') quiet = true;
        else if (a[j] === 'O') { output = a.slice(j + 1) || args[++i]; break; }
      }
      continue;
    }
    if (a.startsWith('-')) { err(`wget：模擬環境的 wget 只支援 -q、-O - 與 -T（${a}）`); return { lines, status: 1 }; }
    url = a;
  }
  if (!url) { err('BusyBox v1.36.1 (2023-05-18 22:34:17 UTC) multi-call binary.'); err(''); err('Usage: wget [-cqS] [--spider] [-O FILE] [-o LOGFILE] [--header STR] [--post-data STR | --post-file FILE] [-Y on/off]'); return { lines, status: 1 }; }
  if (output !== '-') { err('wget：模擬環境的 wget 只把內容印到標準輸出，請加上 -O -（例如 wget -qO- http://web）'); return { lines, status: 1 }; }
  const full = /^[a-z]+:\/\//.test(url) ? url : `http://${url}`, u = parseUrl(full);
  if ('code' in u) { err(`wget: not an http or ftp url: ${url}`); return { lines, status: 1 }; }
  const looked = kubeResolver(state, u.host, 4);
  if ('error' in looked) { err(`wget: bad address '${u.host}'`); return { lines, status: 1 }; }
  if (!quiet) err(`Connecting to ${u.host} (${looked.found.address}:${u.port})`);
  let data = '';
  const msgs: string[] = [];
  const r = curl(state, ['-s', '-S', '-i', '-L', full], { out: d => { data += d; }, err: l => msgs.push(l), user: 'root', tty: false, resolve: kubeResolver, connect: (s, a, p) => kubeConnect(s, a, p) });
  const kubeNet = r.state.kubeNet;
  if (r.status !== 0) {
    const m = msgs.join('\n');
    err(r.status === 52 ? 'wget: error getting response: Connection reset by peer' : `wget: can't connect to remote host (${looked.found.address}): ${/after 0 ms/.test(m) ? 'Connection refused' : 'Connection timed out'}`);
    return { lines, status: 1, ...kubeNet ? { kubeNet } : {} };
  }
  let head = '';
  while (data.startsWith('HTTP/')) { const at = data.indexOf('\n\n'); head = data.slice(0, at < 0 ? data.length : at); data = at < 0 ? '' : data.slice(at + 2); }
  const statusLine = head.split('\n')[0] ?? '', code = Number(statusLine.split(' ')[1] ?? 0);
  if (code >= 400) { err(`wget: server returned error: ${statusLine}`); return { lines, status: 1, ...kubeNet ? { kubeNet } : {} }; }
  if (!quiet) err('writing to stdout');
  const body = data.endsWith('\n') ? data.slice(0, -1) : data;
  if (data) body.split('\n').forEach(text => lines.push({ stream: 1, text }));
  if (!quiet) err('written to stdout');
  return { lines, status: 0, ...kubeNet ? { kubeNet } : {} };
}
