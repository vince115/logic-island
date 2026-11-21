import { describe, expect, it } from 'vitest';
import { checkNetworkAnswer, delayOf, expectedNetworkAnswer, networkSceneProblems, parseIpv4, subnetOf, type NetworkScene } from '@/lib/network/model';
import { httpThroughRouter, previewScenes, switchLearning, tcpHandshake } from '@/content/network/preview-scenes';

/* CN-0: the network-protocol capability's data model (src/lib/network/model.ts): scenes, exercise answers, IPv4. */
const clone = (s: NetworkScene): NetworkScene => structuredClone(s);

describe('IPv4 and subnets', () => {
  it('parses dotted quads and rejects malformed ones', () => {
    expect(parseIpv4('192.0.2.130')).toBe(0xc0000282);
    expect(parseIpv4('255.255.255.255')).toBe(0xffffffff);
    for (const bad of ['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', 'a.b.c.d', '']) expect(parseIpv4(bad), bad).toBeUndefined();
  });
  it('computes the network, the broadcast and the usable hosts', () => {
    expect(subnetOf('192.0.2.130', 26)).toEqual({ network: '192.0.2.128', broadcast: '192.0.2.191', hosts: 62 });
    expect(subnetOf('203.0.113.77', 24)).toEqual({ network: '203.0.113.0', broadcast: '203.0.113.255', hosts: 254 });
    expect(subnetOf('10.1.2.3', 8)).toEqual({ network: '10.0.0.0', broadcast: '10.255.255.255', hosts: 16_777_214 });
    expect(subnetOf('192.0.2.5', 30)).toEqual({ network: '192.0.2.4', broadcast: '192.0.2.7', hosts: 2 });
    // RFC 3021 point-to-point /31 and a single host /32.
    expect(subnetOf('192.0.2.5', 31)).toEqual({ network: '192.0.2.4', broadcast: '192.0.2.5', hosts: 2 });
    expect(subnetOf('192.0.2.5', 32)).toEqual({ network: '192.0.2.5', broadcast: '192.0.2.5', hosts: 1 });
    expect(subnetOf('192.0.2.5', 0)).toEqual({ network: '0.0.0.0', broadcast: '255.255.255.255', hosts: 2 ** 32 - 2 });
    for (const [a, p] of [['192.0.2.5', 33], ['192.0.2.5', -1], ['192.0.2.5', 24.5], ['300.0.0.1', 24]] as const) expect(subnetOf(a, p), `${a}/${p}`).toBeUndefined();
  });
});

describe('delay', () => {
  it('computes transmission, propagation and total delay in milliseconds', () => {
    // 1500 B on 100 Mbit/s over 2000 km: 0.12 ms on the wire, 10 ms of travel.
    expect(delayOf(1500, 100e6, 2_000_000)).toEqual({ transmission: 0.12, propagation: 10, total: 10.12 });
    expect(delayOf(1_000_000, 8e6, 0)).toEqual({ transmission: 1000, propagation: 0, total: 1000 });
    expect(delayOf(100, 1e9, 300, 3e8)).toEqual({ transmission: 0.001, propagation: 0.001, total: 0.002 });
    for (const bad of [[0, 1e6, 1], [100, 0, 1], [100, 1e6, -1], [100, 1e6, 1, 0], [NaN, 1e6, 1]]) expect(delayOf(...bad as [number, number, number, number?]), String(bad)).toBeUndefined();
  });
  it('checks delay answers as numbers', () => {
    const t = { task: 'delay', bytes: 1500, bandwidth: 100e6, distance: 2_000_000 } as const;
    expect(expectedNetworkAnswer(t, [])).toEqual({ transmission: '0.12', propagation: '10', total: '10.12' });
    expect(checkNetworkAnswer(t, [], { transmission: '0.120', propagation: '10.0', total: ' 10.12 ' }).ok).toBe(true);
    expect(checkNetworkAnswer(t, [], { transmission: '0.015', propagation: '10', total: '10.015' }).messages).toEqual([expect.stringMatching(/傳輸延遲（毫秒）」不對/), expect.stringMatching(/總延遲（毫秒）」不對/)]);
    expect(checkNetworkAnswer(t, [], { transmission: 'abc', propagation: '10', total: '10.12' }).ok).toBe(false);
    expect(() => expectedNetworkAnswer({ task: 'delay', bytes: 0, bandwidth: 1, distance: 1 }, [])).toThrow(/invalid delay/);
  });
});

describe('scenes', () => {
  it('accepts the reference scenes (both models, tables, a lost message)', () => {
    for (const scene of previewScenes) expect(networkSceneProblems(scene), scene.id).toEqual([]);
    expect(new Set(previewScenes.map(s => s.model))).toEqual(new Set(['tcp-ip', 'osi']));
    expect(tcpHandshake.messages.some(m => m.lost)).toBe(true);
    expect(switchLearning.messages.some(m => m.tables?.length)).toBe(true);
  });
  it('rejects unknown nodes, a message to itself, headers out of layer order or outside the model, and bad tables', () => {
    const s = clone(httpThroughRouter);
    s.messages[0].to = 'nowhere';
    s.messages[1].to = s.messages[1].from;
    s.messages[2].headers.reverse();
    s.messages[3].headers[0].layer = 'session';
    s.messages[1].tables![0].rows.push(['only one cell']);
    s.messages[1].tables![0].changed = [9];
    const problems = networkSceneProblems(s).join('\n');
    expect(problems).toMatch(/message req-1 names an unknown node/);
    expect(problems).toMatch(/message req-2 is sent to its own sender/);
    expect(problems).toMatch(/message res-1 lists its headers out of layer order/);
    expect(problems).toMatch(/message res-2 has a header outside the tcp-ip model/);
    expect(problems).toMatch(/table 路由表 is ragged/);
    expect(problems).toMatch(/marks a row it does not have/);
  });
  it('rejects two headers at one layer, a repeated field, duplicate ids and a scene with one node', () => {
    const s = clone(tcpHandshake);
    s.messages[0].headers.push({ ...s.messages[0].headers[1] });
    s.messages[1].headers[0].fields.push({ name: 'Seq', value: '1' });
    s.messages[2].id = s.messages[3].id;
    s.nodes = [s.nodes[0]];
    const problems = networkSceneProblems(s).join('\n');
    expect(problems).toMatch(/out of layer order \(top layer first, one per layer\)/);
    expect(problems).toMatch(/repeats a field/);
    expect(problems).toMatch(/duplicate message ack/);
    expect(problems).toMatch(/needs at least two nodes/);
  });
});

describe('exercise answers come from the scenes', () => {
  it('reads a header field, finds a protocol\'s layer and computes a subnet', () => {
    expect(expectedNetworkAnswer({ task: 'field', scene: 'preview-http-router', message: 'req-2', layer: 'network', field: 'TTL' }, previewScenes)).toEqual({ value: '63' });
    expect(expectedNetworkAnswer({ task: 'field', scene: 'preview-tcp-handshake', message: 'syn-ack', layer: 'transport', field: 'Ack' }, previewScenes)).toEqual({ value: '1001' });
    expect(expectedNetworkAnswer({ task: 'layer', scene: 'preview-tcp-handshake', protocol: 'TCP' }, previewScenes)).toEqual({ layer: 'transport' });
    expect(expectedNetworkAnswer({ task: 'subnet', address: '192.0.2.130', prefix: 26 }, previewScenes)).toEqual({ network: '192.0.2.128', broadcast: '192.0.2.191', hosts: '62' });
  });
  it('reads a cell of a node\'s table after a message', () => {
    const t = { task: 'table', scene: 'preview-switch-learning', message: 'arp-reply', node: 'sw', table: 'MAC 位址表', row: '02:00:00:00:00:0b', column: '連接埠' } as const;
    expect(expectedNetworkAnswer(t, previewScenes)).toEqual({ cell: '2' });
    expect(checkNetworkAnswer(t, previewScenes, { cell: '2' }).ok).toBe(true);
    expect(checkNetworkAnswer(t, previewScenes, { cell: '1' }).messages).toEqual([expect.stringMatching(/表格中的值」不對/)]);
    expect(checkNetworkAnswer({ task: 'field', scene: 'preview-tcp-handshake', message: 'syn-ack', layer: 'transport', field: '旗標' }, previewScenes, { value: 'syn、ack' }).ok).toBe(true);
    // B's address is not in the table before B has sent anything, and the key column is not an answer.
    expect(() => expectedNetworkAnswer({ ...t, message: 'arp-req' }, previewScenes)).toThrow(/no cell/);
    expect(() => expectedNetworkAnswer({ ...t, column: 'MAC 位址' }, previewScenes)).toThrow(/no cell/);
  });
  it('refuses a task the scenes cannot answer', () => {
    expect(() => expectedNetworkAnswer({ task: 'field', scene: 'preview-http-router', message: 'req-2', layer: 'network', field: 'Flow Label' }, previewScenes)).toThrow(/no field/);
    expect(() => expectedNetworkAnswer({ task: 'layer', scene: 'preview-http-router', protocol: 'UDP' }, previewScenes)).toThrow(/exactly one layer/);
    expect(() => expectedNetworkAnswer({ task: 'subnet', address: '192.0.2.1', prefix: 40 }, previewScenes)).toThrow(/invalid subnet/);
  });
  it('checks answers ignoring case and spaces, and says which part is missing or wrong', () => {
    const mac = { task: 'field', scene: 'preview-http-router', message: 'req-2', layer: 'link', field: '目的 MAC' } as const;
    expect(checkNetworkAnswer(mac, previewScenes, { value: ' 02:00:00:00:01:50 ' }).ok).toBe(true);
    expect(checkNetworkAnswer(mac, previewScenes, { value: '02:00:00:00:00:01' })).toMatchObject({ ok: false, messages: [expect.stringMatching(/欄位的值」不對/)] });
    const subnet = { task: 'subnet', address: '192.0.2.130', prefix: 26 } as const;
    expect(checkNetworkAnswer(subnet, previewScenes, { network: '192.0.2.128', broadcast: '192.0.2.191', hosts: '62' }).ok).toBe(true);
    const partial = checkNetworkAnswer(subnet, previewScenes, { network: '192.0.2.128', hosts: '64' });
    expect(partial.ok).toBe(false);
    expect(partial.messages).toEqual([expect.stringMatching(/還沒有填「廣播位址」/), expect.stringMatching(/「可用主機數」不對/)]);
  });
});
