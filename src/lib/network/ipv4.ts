/* CN-0: IPv4 helpers of the network-protocol capability (subnet exercises, firewall rules). */
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

