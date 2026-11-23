import { isoText, type Seconds } from './clock';
import { hex } from './docker';
import type { LogLine, LogSeed } from './docker';
import type { FsNode } from './fs';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md): the shared model of the simulated Kubernetes cluster. The
 * cluster lives in the local machine's state (FsState.kube), like docker and git: fictional kubeadm-style nodes as data
 * (allocatable cpu, memory and pods, labels, taints), an API store of unstructured objects (metadata, spec, status), the
 * kubelet's per-pod record (PodSim), events, and the images each node has pulled. Nothing here is random: UIDs, name
 * suffixes and container IDs come from SHA-256 of the data, pod IPs are the lowest free address of the node's CIDR.
 */

/** JSON as the API server stores it (kubectl -o json/yaml and jsonpath read this). */
export type J = null | boolean | number | string | J[] | { [k: string]: J };
export type JObj = { [k: string]: J };

export interface Taint { key: string; value?: string; effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute' }
export interface KubeNode {
  name: string; address: string; cidr: string; control: boolean; created: Seconds;
  labels: Readonly<Record<string, string>>; taints: readonly Taint[];
  /** Allocatable: millicores, bytes, pods (and the texts as the lesson wrote them). */
  cpu: number; memory: number; pods: number; cpuText: string; memoryText: string;
}
/** An event (core/v1 Event), aggregated like the event correlator does: the same object, reason and message count up. */
export interface KubeEvent {
  ns: string; kind: string; name: string; uid: string; reason: string; type: 'Normal' | 'Warning'; message: string;
  first: Seconds; last: Seconds; count: number; source: string; seq: number;
}
/** What the kubelet keeps of a container: its state, the step it takes next and when, its logs and writable layer. */
export interface CSim {
  name: string; image: string; init: boolean;
  state: 'waiting' | 'running' | 'terminated';
  reason?: string; message?: string; started?: Seconds; finished?: Seconds; exit?: number;
  last?: { reason: string; exit: number; started: Seconds; finished: Seconds };
  restarts: number; crashes: number; pullFails: number;
  next?: Seconds; step?: 'pull' | 'pulled' | 'start' | 'exit' | 'backoff' | 'restart';
  /** During a back-off: when the kubelet tries again (the pull, or the restart). */
  retry?: Seconds;
  /** The exit planned at `next` (step exit). */
  plan?: { exit: number; oom?: boolean; logs: readonly LogSeed[]; reason?: string; message?: string };
  imageId?: string; cid?: string;
  logs: readonly LogLine[]; prev: readonly LogLine[];
  /** Files exec changed (the container's writable layer; a restart starts from the image again). */
  layer?: ReadonlyMap<string, FsNode>;
}
/** The kubelet's record of a bound pod (by uid). */
export interface PodSim { node: string; bound: Seconds; ip: string; init: readonly CSim[]; main: readonly CSim[]; static?: true }
export interface KubeState {
  created: Seconds;
  nodes: readonly KubeNode[];
  objects: readonly JObj[];
  pods: Readonly<Record<string, PodSim>>;
  events: readonly KubeEvent[];
  /** The resourceVersion counter, the object counter (UIDs) and the time the controllers have played up to. */
  rv: number; seq: number; settled: Seconds;
  /** The images each node has (pulled, or there at the start). */
  cache: Readonly<Record<string, readonly string[]>>;
  /** Seconds an image pull takes (per image as named; default pullSeconds). */
  pull: Readonly<Record<string, number>>; pullSeconds: number;
  /** Pods the scheduler could not place (by uid): when it last tried, why, and the cluster change it had seen. */
  unscheduled: Readonly<Record<string, { t: Seconds; message: string; n: number }>>;
  /** The last change that may let them fit (a pod deleted, a node's labels or taints): its time and number; they are tried again then. */
  retry?: { t: Seconds; n: number };
}

export const KUBE_VERSION = 'v1.32.3';
export const KUSTOMIZE_VERSION = 'v5.5.0';
export const CONTAINERD_VERSION = '1.7.24';
export const API_SERVER = 'https://10.0.0.50:6443';
export const CLUSTER_NAME = 'kubernetes';
export const ADMIN_USER = 'kubernetes-admin';
export const ADMIN_CONTEXT = 'kubernetes-admin@kubernetes';
export const NODE_OS = 'Ubuntu 24.04.1 LTS';
export const NODE_KERNEL = '6.8.0-48-generic';
export const SYSTEM_NAMESPACES = ['default', 'kube-node-lease', 'kube-public', 'kube-system'] as const;
export const CONTROL_TAINT: Taint = { key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' };
/** Limits that keep the settle loop cheap whatever the learner applies. */
export const KUBE_LIMITS = { nodes: 5, pods: 60, objects: 200, events: 400, logs: 400 } as const;

/** A JSON value as an object (or an empty one). */
export const obj = (v: J | undefined): JObj => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export const arr = (v: J | undefined): J[] => Array.isArray(v) ? v : [];
export const str = (v: J | undefined): string | undefined => typeof v === 'string' ? v : undefined;
export const meta = (o: JObj) => obj(o.metadata);
export const nameOf = (o: JObj) => str(meta(o).name) ?? '';
export const nsOf = (o: JObj) => str(meta(o).namespace);
export const kindOf = (o: JObj) => str(o.kind) ?? '';
export const uidOf = (o: JObj) => str(meta(o).uid) ?? '';
export const labelsOf = (o: JObj): Record<string, string> => Object.fromEntries(Object.entries(obj(meta(o).labels)).filter((e): e is [string, string] => typeof e[1] === 'string'));
export const createdOf = (o: JObj) => parseStamp(str(meta(o).creationTimestamp));

/** RFC 3339 as the API server writes it (2026-11-24T10:00:00Z), and back. */
export const stamp = (t: Seconds) => `${isoText(Math.floor(t)).replace(' ', 'T')}Z`;
export function parseStamp(text: string | undefined): Seconds | undefined {
  const m = text ? /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)Z$/.exec(text) : null;
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : undefined;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Go's RFC1123Z in UTC (describe's Start Time: Tue, 24 Nov 2026 10:00:00 +0000). */
export function rfc1123(t: Seconds): string {
  const d = new Date(Math.floor(t) * 1000), two = (n: number) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]}, ${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} +0000`;
}

/** apimachinery's duration.HumanDuration (AGE, LAST SEEN). */
export function humanDuration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < -1) return '<invalid>';
  if (s < 0) return '0s';
  if (s < 120) return `${s}s`;
  const m = Math.floor(s / 60), h = Math.floor(s / 3600), d = Math.floor(h / 24);
  if (m < 10) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  if (m < 180) return `${m}m`;
  if (h < 8) return m % 60 ? `${h}h${m % 60}m` : `${h}h`;
  if (h < 48) return `${h}h`;
  if (h < 24 * 8) return h % 24 ? `${d}d${h % 24}h` : `${d}d`;
  if (h < 24 * 365 * 2) return `${d}d`;
  if (h < 24 * 365 * 8) return d % 365 ? `${Math.floor(d / 365)}y${d % 365}d` : `${Math.floor(d / 365)}y`;
  return `${Math.floor(d / 365)}y`;
}
/** Go's time.Duration text for whole seconds (2s, 1m30s). */
export function goDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}h${m}m${s % 60}s` : m ? `${m}m${s % 60}s` : `${s}s`;
}

/**
 * Go's text/tabwriter: a cell ends with a tab, the text after a line's last tab is not a cell; a column's width is set by
 * the block of consecutive lines that have a cell in it (kubectl's tables: minwidth 10, padding 3; describe: 0 and 2).
 */
export function goTab(lines: readonly string[], minwidth = 10, padding = 3): string[] {
  const cells = lines.map(l => l.split('\t')), widths = cells.map(c => c.map(() => 0));
  const len = (s: string) => [...s].length;
  const format = (from: number, to: number, col: number) => {
    for (let i = from; i < to;) {
      if (col >= cells[i].length - 1) { i++; continue; }
      let j = i, width = minwidth;
      for (; j < to && col < cells[j].length - 1; j++) width = Math.max(width, len(cells[j][col]) + padding);
      for (let k = i; k < j; k++) widths[k][col] = width;
      format(i, j, col + 1);
      i = j;
    }
  };
  format(0, lines.length, 0);
  return cells.map((c, i) => c.map((cell, k) => k < c.length - 1 ? cell + ' '.repeat(Math.max(0, widths[i][k] - len(cell))) : cell).join(''));
}

/** The characters apimachinery's rand.String and SafeEncodeString use (no vowels, no 0 1 3). */
const ALPHABET = 'bcdfghjklmnpqrstvwxz2456789';
/** A deterministic suffix of n characters from the seed (pod names, pod-template-hash, volume names). */
export function suffix(seed: string, n = 5): string {
  const h = hex(`suffix/${seed}`);
  let out = '';
  for (let i = 0; out.length < n; i += 2) out += ALPHABET[parseInt(h.slice(i % 60, (i % 60) + 2), 16) % ALPHABET.length];
  return out;
}
/** A UID (8-4-4-4-12 hex digits) from the seed. */
export function uid(seed: string): string {
  const h = hex(`uid/${seed}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const containerId = (seed: string) => hex(`containerd/${seed}`);

/** CPU quantities: 500m, 0.5, 2 → millicores (null when not a quantity). */
export function cpuMilli(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(m?)$/.exec(text.trim());
  if (!m) return null;
  return m[2] ? Math.ceil(Number(m[1])) : Math.ceil(Number(m[1]) * 1000);
}
const UNITS: Record<string, number> = { '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
/** Memory quantities: 128Mi, 1G, 500000 → bytes (null when not a quantity). */
export function bytesOf(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(k|M|G|T|Ki|Mi|Gi|Ti)?$/.exec(text.trim());
  return m ? Math.ceil(Number(m[1]) * UNITS[m[2] ?? '']) : null;
}
/** A quantity as JSON may hold it (a number or a string). */
export const quantityText = (v: J | undefined) => typeof v === 'number' ? String(v) : str(v);

export const sameJ = (a: J | undefined, b: J | undefined): boolean => JSON.stringify(sortJ(a ?? null)) === JSON.stringify(sortJ(b ?? null));
/** A copy with every object's keys sorted (Go's encoding of a map). */
export function sortJ(v: J): J {
  if (Array.isArray(v)) return v.map(sortJ);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortJ(v[k])]));
  return v;
}
/** The cluster changed at t: the scheduler tries its unschedulable pods again. */
export const changed = (k: KubeState, t: Seconds): KubeState => ({ ...k, retry: { t, n: (k.retry?.n ?? 0) + 1 } });
export const clone = <T extends J>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The log lines as kubectl logs prints them (both streams, in order). */
export const logText = (lines: readonly LogLine[]) => lines.map(l => l.text);
