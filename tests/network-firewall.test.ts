import { describe, expect, it } from 'vitest';
import { checkFirewallRules, decidePacket, firewallTaskProblems, parseFirewallRules, type FirewallPacket } from '@/lib/network/firewall';
import { checkNetworkAnswer, expectedNetworkAnswer } from '@/lib/network/model';

/*
 * CN-4: the firewall exercises of the network-protocol capability (src/lib/network/firewall.ts). Rules are judged by what
 * they decide for the test packets, first match wins, never by their text.
 */
const WEB = '203.0.113.10', OFFICE = '192.0.2.0/24';
const packets: FirewallPacket[] = [
  { label: '外部連 HTTPS', protocol: 'tcp', src: '198.51.100.7', dst: WEB, port: 443, state: 'new' },
  { label: '外部連 SSH', protocol: 'tcp', src: '198.51.100.7', dst: WEB, port: 22, state: 'new' },
  { label: '辦公室連 SSH', protocol: 'tcp', src: '192.0.2.15', dst: WEB, port: 22, state: 'new' },
  { label: '回應封包', protocol: 'tcp', src: '198.51.100.7', dst: WEB, port: 51000, state: 'established' },
  { label: '外部 ping', protocol: 'icmp', src: '198.51.100.7', dst: WEB, state: 'new' },
];
const reference = `default deny\nallow tcp from any to ${WEB} port 443\nallow tcp from ${OFFICE} to ${WEB} port 22\nallow tcp from any to any established`;

describe('firewall rules', () => {
  it('parses the stated language and reports each bad line by number', () => {
    const p = parseFirewallRules(`# 公司網站\n\nDEFAULT DENY\nallow tcp from any to ${WEB} port 8000-8080\ndeny icmp from 0.0.0.0/0 to any`);
    expect(p).toMatchObject({ defaultAction: 'deny', explicitDefault: true, errors: [], rules: [{ action: 'allow', protocol: 'tcp', ports: [8000, 8080], established: false }, { action: 'deny', protocol: 'icmp' }] });
    expect(parseFirewallRules('allow everything').errors).toEqual([expect.stringMatching(/^第 1 行：看不懂/)]);
    expect(parseFirewallRules('allow tcp from 10.0.0.0/33 to any').errors).toEqual([expect.stringMatching(/位址/)]);
    expect(parseFirewallRules('\nallow tcp from any to any port 9-1').errors).toEqual([expect.stringMatching(/^第 2 行：連接埠/)]);
    expect(parseFirewallRules('allow icmp from any to any port 7').errors).toEqual([expect.stringMatching(/ICMP 沒有連接埠/)]);
    expect(parseFirewallRules('allow tcp from any to any').defaultAction).toBe('deny');
  });
  it('decides by the first matching rule, else the default', () => {
    const p = parseFirewallRules(reference);
    expect(packets.map(x => decidePacket(p, x))).toEqual([
      { action: 'allow', rule: 0 }, { action: 'deny', rule: -1 }, { action: 'allow', rule: 1 }, { action: 'allow', rule: 2 }, { action: 'deny', rule: -1 }]);
    // Order matters: a deny before the allow wins.
    expect(decidePacket(parseFirewallRules(`deny tcp from any to any\n${reference}`), packets[0])).toEqual({ action: 'deny', rule: 0 });
  });
  it('accepts any rule set that decides every packet the same way, and explains each wrong decision', () => {
    // Another order and a wider (but equivalent here) rule still pass.
    expect(checkFirewallRules(`allow tcp from any to any established\nallow tcp from 192.0.2.0/24 to ${WEB} port 22\nallow tcp from any to ${WEB} port 443`, reference, packets).ok).toBe(true);
    const tooOpen = checkFirewallRules(`default allow\ndeny icmp from any to any`, reference, packets);
    expect(tooOpen.ok).toBe(false);
    expect(tooOpen.messages).toEqual(['封包「外部連 SSH」應該擋下，你的規則沒有一條符合，依預設放行。']);
    expect(checkFirewallRules(`allow tcp from any to ${WEB} port 443`, reference, packets).messages).toEqual(['封包「辦公室連 SSH」應該放行，你的規則沒有一條符合，依預設擋下。', '封包「回應封包」應該放行，你的規則沒有一條符合，依預設擋下。']);
    expect(checkFirewallRules('', reference, packets)).toEqual({ ok: false, messages: ['還沒有寫任何規則。'] });
    expect(checkFirewallRules('allow all', reference, packets).messages[0]).toMatch(/看不懂/);
  });
  it('checks an exercise\'s own data and runs through the network answer check', () => {
    expect(firewallTaskProblems(reference, packets)).toEqual([]);
    expect(firewallTaskProblems('allow nonsense', packets).join()).toMatch(/reference rules/);
    expect(firewallTaskProblems(reference, packets.slice(0, 1)).join()).toMatch(/at least two/);
    expect(firewallTaskProblems('default allow', packets).join()).toMatch(/both allowed and denied/);
    expect(firewallTaskProblems(reference, [{ ...packets[0], port: undefined }, packets[1]]).join()).toMatch(/have a port/);
    const task = { task: 'firewall', reference, packets } as const;
    expect(expectedNetworkAnswer(task, [])).toEqual({ rules: reference });
    expect(checkNetworkAnswer(task, [], { rules: reference }).ok).toBe(true);
    expect(checkNetworkAnswer(task, [], { rules: 'default allow' }).ok).toBe(false);
    expect(() => expectedNetworkAnswer({ ...task, reference: 'default allow' }, [])).toThrow(/both allowed and denied/);
  });
});
