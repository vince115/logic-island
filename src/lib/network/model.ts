/*
 * CN-0 (2026-11-21): the network-protocol capability's data model. A lesson describes fixed scenes: the nodes of a small
 * network and the messages they exchange in order, each with its protocol headers by layer and, where it matters, the
 * tables a node keeps (MAC, ARP, NAT, routing) after that message. Nothing here touches a real network; the component
 * (src/components/curriculum/network-protocol.tsx) only draws a scene. Exercise answers are read or computed from the
 * same data (expectedNetworkAnswer), never written into the lesson a second time.
 *
 * This is separate from the database lessons' protocol-sequence capability (SQL round trips over a dataset,
 * src/lib/sql/sequence.ts), which keeps its meaning.
 */

export const NETWORK_MODELS = ['tcp-ip', 'osi'] as const;
export type NetworkModel = typeof NETWORK_MODELS[number];
export const LAYER_IDS = ['application', 'presentation', 'session', 'transport', 'network', 'link', 'physical'] as const;
export type LayerId = typeof LAYER_IDS[number];
export interface LayerInfo { id: LayerId; name: string; en: string }

/** Each model's layers from the top; a header's layer must be one of its scene's model. */
export const LAYER_MODELS: Record<NetworkModel, { name: string; layers: LayerInfo[] }> = {
  'tcp-ip': { name: 'TCP/IP 四層模型', layers: [
    { id: 'application', name: '應用層', en: 'Application' }, { id: 'transport', name: '傳輸層', en: 'Transport' },
    { id: 'network', name: '網際網路層', en: 'Internet' }, { id: 'link', name: '網路存取層', en: 'Link' }] },
  osi: { name: 'OSI 七層模型', layers: [
    { id: 'application', name: '應用層', en: 'Application' }, { id: 'presentation', name: '表現層', en: 'Presentation' },
    { id: 'session', name: '會議層', en: 'Session' }, { id: 'transport', name: '傳輸層', en: 'Transport' },
    { id: 'network', name: '網路層', en: 'Network' }, { id: 'link', name: '資料鏈結層', en: 'Data Link' },
    { id: 'physical', name: '實體層', en: 'Physical' }] },
};
export const layerInfo = (model: NetworkModel, layer: LayerId) => LAYER_MODELS[model].layers.find(l => l.id === layer);

export const NODE_KINDS = ['host', 'server', 'router', 'switch', 'access-point', 'resolver'] as const;
export type NodeKind = typeof NODE_KINDS[number];
export const NODE_KIND_LABELS: Record<NodeKind, string> = { host: '主機', server: '伺服器', router: '路由器', switch: '交換器', 'access-point': '無線基地台', resolver: 'DNS 伺服器' };
export interface NetworkNode { id: string; label: string; kind: NodeKind; /** Addresses shown under the name, e.g. "IP 192.168.1.10". */ addresses?: string[] }
export interface HeaderField { name: string; value: string }
/** One layer's header of a message; a message lists them from the top layer down, the order they wrap the payload. */
export interface ProtocolHeader { layer: LayerId; protocol: string; fields: HeaderField[] }
/** A table a node keeps, as it is right after the message; `changed` marks the rows the message added or changed. */
export interface NodeTable { node: string; name: string; head: string[]; rows: string[][]; changed?: number[] }
export interface NetworkMessage {
  id: string; from: string; to: string;
  /** Short name on the arrow, e.g. "SYN" or "DNS 查詢 A example.com". */
  label: string;
  headers: ProtocolHeader[];
  payload?: string;
  /** What happens in this step and why; shown and announced (aria-live). */
  note: string;
  tables?: NodeTable[];
  /** The message is lost on the way (a timeout or a retransmission follows). */
  lost?: boolean;
}
export interface NetworkScene { id: string; title: string; description: string; model: NetworkModel; nodes: NetworkNode[]; messages: NetworkMessage[] }

// ---- exercises ---------------------------------------------------------------------------------------------------
/**
 * field: the value of one header field of one message (an ACK number, a destination MAC after a router, a TTL).
 * layer: which layer of the scene's model carries a protocol's header. subnet: an address and prefix length give the
 * network address, the broadcast address and the number of usable hosts, computed by subnetOf. delay: a packet of
 * `bytes` on a link of `bandwidth` bits per second and `distance` metres (signal speed `speed` m/s, 2×10⁸ in copper and
 * fibre when omitted) gives the transmission, propagation and total delay in milliseconds, computed by delayOf.
 */
export type NetworkTask =
  | { task: 'field'; scene: string; message: string; layer: LayerId; field: string }
  | { task: 'layer'; scene: string; protocol: string }
  | { task: 'subnet'; address: string; prefix: number }
  | { task: 'delay'; bytes: number; bandwidth: number; distance: number; speed?: number }
  /** table: one cell of a node's table right after a message, found by the row's first cell and the column's name. */
  | { task: 'table'; scene: string; message: string; node: string; table: string; row: string; column: string };

export const NETWORK_FIELDS: Record<NetworkTask['task'], Record<string, string>> = {
  field: { value: '欄位的值' },
  layer: { layer: '所在的層' },
  subnet: { network: '網路位址', broadcast: '廣播位址', hosts: '可用主機數' },
  delay: { transmission: '傳輸延遲（毫秒）', propagation: '傳播延遲（毫秒）', total: '總延遲（毫秒）' },
  table: { cell: '表格中的值' },
};
/** Numeric answers (delay) are compared as numbers to this many milliseconds, so 0.8 and 0.800 are the same answer. */
export const DELAY_TOLERANCE = 0.0005;
const HINTS: Record<string, string> = {
  value: '找到這一步的訊息，從外層往內一層一層看標頭：只有屬於題目那一層的標頭才有這個欄位。',
  layer: '想一想這個協定負責什麼：在兩個程式之間（應用）、兩端的行程之間（傳輸）、跨網路找路（網路）、還是同一段鏈路上的下一站（鏈結）。',
  network: '網路位址是把位址與遮罩做 AND：主機位元全部變成 0。',
  broadcast: '廣播位址是網路位址的主機位元全部變成 1。',
  hosts: '主機位元有 32 − 前綴長度 個；扣掉全 0 的網路位址與全 1 的廣播位址（/31 與 /32 例外）。',
  transmission: '傳輸延遲是把整個封包推上線路的時間：位元數 ÷ 頻寬（位元組要先乘以 8）。',
  propagation: '傳播延遲是訊號走完線路的時間：距離 ÷ 訊號速度，和封包大小無關。',
  total: '總延遲是傳輸延遲加傳播延遲（這裡不計排隊與處理延遲）。',
  cell: '依訊息的順序一步一步更新表格：節點只從它看到的訊息學到東西，還沒看到的不會出現在表裡。',
};

/** Transmission, propagation and total delay in milliseconds (rounded to the microsecond), or undefined for bad input. */
export function delayOf(bytes: number, bandwidth: number, distance: number, speed = 2e8): { transmission: number; propagation: number; total: number } | undefined {
  if (![bytes, bandwidth, distance, speed].every(Number.isFinite) || bytes <= 0 || bandwidth <= 0 || distance < 0 || speed <= 0) return undefined;
  const round = (ms: number) => Math.round(ms * 1000) / 1000;
  const transmission = bytes * 8 / bandwidth * 1000, propagation = distance / speed * 1000;
  return { transmission: round(transmission), propagation: round(propagation), total: round(transmission + propagation) };
}

// ---- IPv4 ------------------------------------------------------------------------------------------------------
const QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export function parseIpv4(text: string): number | undefined {
  const m = QUAD.exec(text.trim());
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  if (parts.some(p => p > 255) || m.slice(1).some(p => p.length > 1 && p.startsWith('0'))) return undefined;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}
export const formatIpv4 = (n: number) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
/** The network address, the broadcast address and the usable hosts of an IPv4 address with a prefix length 0–32. */
export function subnetOf(address: string, prefix: number): { network: string; broadcast: string; hosts: number } | undefined {
  const ip = parseIpv4(address);
  if (ip === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return undefined;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
  // RFC 3021: a /31 has two usable addresses (a point-to-point link); a /32 names one host.
  const hosts = prefix === 32 ? 1 : prefix === 31 ? 2 : 2 ** (32 - prefix) - 2;
  return { network: formatIpv4(network), broadcast: formatIpv4(broadcast), hosts };
}

const sceneById = (scenes: readonly NetworkScene[], id: string) => scenes.find(s => s.id === id);
/** The answer, from the scenes or computed; throws when the task names something the scenes do not have. */
export function expectedNetworkAnswer(t: NetworkTask, scenes: readonly NetworkScene[]): Record<string, string> {
  switch (t.task) {
    case 'field': {
      const message = sceneById(scenes, t.scene)?.messages.find(m => m.id === t.message);
      const value = message?.headers.find(h => h.layer === t.layer)?.fields.find(f => f.name === t.field)?.value;
      if (value === undefined) throw new Error(`no field ${t.field} at ${t.layer} in ${t.scene}/${t.message}`);
      return { value };
    }
    case 'layer': {
      const scene = sceneById(scenes, t.scene);
      const layers = new Set(scene?.messages.flatMap(m => m.headers.filter(h => h.protocol === t.protocol).map(h => h.layer)));
      if (layers.size !== 1) throw new Error(`protocol ${t.protocol} must sit at exactly one layer in ${t.scene}`);
      return { layer: [...layers][0] };
    }
    case 'subnet': {
      const s = subnetOf(t.address, t.prefix);
      if (!s) throw new Error(`invalid subnet ${t.address}/${t.prefix}`);
      return { network: s.network, broadcast: s.broadcast, hosts: String(s.hosts) };
    }
    case 'table': {
      const t2 = sceneById(scenes, t.scene)?.messages.find(m => m.id === t.message)?.tables?.find(x => x.node === t.node && x.name === t.table);
      const col = t2?.head.indexOf(t.column) ?? -1, row = t2?.rows.find(r => r[0] === t.row);
      if (!t2 || col < 1 || !row) throw new Error(`no cell ${t.row}/${t.column} in ${t.node}'s ${t.table} after ${t.scene}/${t.message}`);
      return { cell: row[col] };
    }
    case 'delay': {
      const d = delayOf(t.bytes, t.bandwidth, t.distance, t.speed);
      if (!d) throw new Error(`invalid delay ${t.bytes} B, ${t.bandwidth} bit/s, ${t.distance} m`);
      return { transmission: String(d.transmission), propagation: String(d.propagation), total: String(d.total) };
    }
  }
}
/**
 * Compared case-insensitively with spaces removed (MAC addresses, hex and flags are written in different cases), and
 * with the Chinese list marks 、 and ， read as commas (「1、3、4」 is 「1,3,4」).
 */
const normalize = (text: string) => text.replace(/\s+/g, '').replace(/[、，]/g, ',').toLowerCase();
export function checkNetworkAnswer(t: NetworkTask, scenes: readonly NetworkScene[], answer: Record<string, string>): { ok: boolean; messages: string[] } {
  const expected = expectedNetworkAnswer(t, scenes), messages: string[] = [];
  for (const [field, value] of Object.entries(expected)) {
    const got = answer[field];
    const numeric = t.task === 'delay', number = Number(got?.trim());
    if (!got?.trim()) messages.push(`還沒有填「${NETWORK_FIELDS[t.task][field]}」。`);
    else if (numeric ? !(Math.abs(number - Number(value)) <= DELAY_TOLERANCE) : normalize(got) !== normalize(value)) messages.push(`「${NETWORK_FIELDS[t.task][field]}」不對：${HINTS[field]}`);
  }
  return { ok: !messages.length, messages };
}

// ---- validation ------------------------------------------------------------------------------------------------
/** A scene's own consistency: known nodes, headers in its model's layer order, tables of known nodes, unique ids. */
export function networkSceneProblems(scene: NetworkScene): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`scene ${scene.id}: ${what}`);
  const order = LAYER_MODELS[scene.model]?.layers.map(l => l.id);
  if (!order) return [`scene ${scene.id}: unknown model ${scene.model}`];
  if (!scene.title.trim() || !scene.description.trim()) fail('needs a title and a description');
  const nodes = new Set<string>();
  for (const n of scene.nodes) {
    if (nodes.has(n.id)) fail(`duplicate node ${n.id}`);
    nodes.add(n.id);
    if (!(NODE_KINDS as readonly string[]).includes(n.kind)) fail(`node ${n.id} has unknown kind ${n.kind}`);
    if (!n.label.trim()) fail(`node ${n.id} needs a label`);
  }
  if (scene.nodes.length < 2) fail('needs at least two nodes');
  if (!scene.messages.length) fail('needs at least one message');
  const messages = new Set<string>();
  for (const m of scene.messages) {
    const at = `message ${m.id}`;
    if (messages.has(m.id)) fail(`duplicate message ${m.id}`);
    messages.add(m.id);
    if (!nodes.has(m.from) || !nodes.has(m.to)) fail(`${at} names an unknown node`);
    if (m.from === m.to) fail(`${at} is sent to its own sender`);
    if (!m.label.trim() || !m.note.trim()) fail(`${at} needs a label and a note`);
    if (!m.headers.length) fail(`${at} needs at least one header`);
    const positions = m.headers.map(h => order.indexOf(h.layer));
    if (positions.some(p => p < 0)) fail(`${at} has a header outside the ${scene.model} model`);
    else if (positions.some((p, i) => i > 0 && p <= positions[i - 1])) fail(`${at} lists its headers out of layer order (top layer first, one per layer)`);
    for (const h of m.headers) {
      if (!h.protocol.trim() || !h.fields.length) fail(`${at}: the ${h.layer} header needs a protocol and fields`);
      const names = h.fields.map(f => f.name);
      if (new Set(names).size !== names.length) fail(`${at}: the ${h.protocol} header repeats a field`);
      if (h.fields.some(f => !f.name.trim() || !f.value.trim())) fail(`${at}: the ${h.protocol} header has an empty field`);
    }
    for (const t of m.tables ?? []) {
      if (!nodes.has(t.node)) fail(`${at}: table ${t.name} belongs to an unknown node`);
      if (!t.head.length || t.rows.some(r => r.length !== t.head.length)) fail(`${at}: table ${t.name} is ragged`);
      if (t.changed?.some(i => !Number.isInteger(i) || i < 0 || i >= t.rows.length)) fail(`${at}: table ${t.name} marks a row it does not have`);
    }
  }
  return problems;
}
