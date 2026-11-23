import type { FsState } from './fs';
import type { TerminalMachine, TerminalRemote } from './lesson';
import type { TerminalDocker } from './docker-lesson';
import { runnerDocker } from './artifacts-lesson';
import { keyPair } from './ssh';

/*
 * Engine stage E31 as lesson data (docs/curriculum/CICD0_E31_DEPLOY_HOSTS.md §6). On a deploy-hosts machine a remote
 * machine may run Docker (its own images, containers and programs; the lesson's registries and the local machine's
 * Docker Hub and registry images are what it can pull) and may let the runners of GitHub Actions reach it (runners: true,
 * the network scope as data). An Actions secret may be an SSH private key the simulation derives from a seed (sshKey), so
 * no key material is written in a lesson; the lesson writes the matching public line (keyPair(seed, comment).publicLine)
 * into the host's authorized_keys.
 */

/** E31: what a remote adds (TerminalRemote.docker and runners). */
export interface TerminalRemoteDeploy {
  /** Its Docker daemon (E20–E24 data without registries: the lesson's registries are the local machine's). */
  docker?: TerminalDocker;
  /** The runners of the lesson's Actions can open connections to it (ssh, curl). */
  runners?: boolean;
}
/** E31: a secret whose value is a simulated OpenSSH private key (keyPair(seed, comment).privateText). */
export interface TerminalSshKey { seed: string; comment?: string }

/** The address a runner connects from (an Azure runner's private network, as the runner logs show it). */
export const RUNNER_ADDRESS = '10.1.0.4';
const LINE = (max: number) => (t: unknown) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');

/** The secret value an sshKey stands for. */
export const sshKeyValue = (k: TerminalSshKey) => keyPair(k.seed, k.comment ?? '').privateText;

/** E31: the problems of a machine's deploy-hosts data (remote Docker, runners and SSH-key secrets need the profile). */
export function deployProblems(m: TerminalMachine, deployHosts: boolean): string[] {
  const out: string[] = [];
  for (const r of m.remotes ?? []) {
    const at = `remote ${r.host}`;
    if (r.docker !== undefined && !deployHosts) out.push(`${at}: docker needs the deploy-hosts profile (engine stage E31)`);
    if (r.runners !== undefined && !deployHosts) out.push(`${at}: runners needs the deploy-hosts profile (engine stage E31)`);
    if (!deployHosts) continue;
    if (r.docker !== undefined && (typeof r.docker !== 'object' || r.docker === null)) { out.push(`${at}: docker is the host's Docker data`); continue; }
    if (r.docker?.registries !== undefined) out.push(`${at}: docker.registries are the lesson's (the local machine's docker.registries), not a host's`);
    if (r.runners !== undefined && typeof r.runners !== 'boolean') out.push(`${at}: runners is true or false`);
    if (r.runners && r.reachableFrom !== undefined) out.push(`${at}: runners and reachableFrom cannot be combined`);
    if (r.runners && !m.actions) out.push(`${at}: runners needs the machine's actions`);
  }
  for (const repo of m.forge?.repos ?? []) for (const s of repo.secrets ?? []) {
    if (s.sshKey === undefined) continue;
    const at = `forge repo ${repo.url}: secret ${s.name}`;
    if (!deployHosts) { out.push(`${at}: sshKey needs the deploy-hosts profile (engine stage E31)`); continue; }
    if (s.value !== undefined) out.push(`${at}: give either value or sshKey`);
    if (!LINE(64)(s.sshKey?.seed) || (s.sshKey.comment !== undefined && !LINE(64)(s.sshKey.comment))) out.push(`${at}: sshKey needs a seed (and a comment) of 1..64 characters on one line`);
  }
  return out;
}

/** E31: a remote's daemon as Docker data — the local machine's pullable images (none local), its registries and programs, then the host's own. */
export function remoteDocker(m: TerminalMachine, r: TerminalRemote): TerminalDocker | undefined {
  const own = r.docker;
  if (!own) return undefined;
  const base = runnerDocker(m) ?? {}, names = new Set((own.images ?? []).map(i => i.name));
  return {
    ...own, images: [...(base.images ?? []).filter(i => !names.has(i.name)), ...own.images ?? []],
    ...m.docker?.registries ? { registries: m.docker.registries } : {},
    ...base.programs || own.programs ? { programs: [...own.programs ?? [], ...base.programs ?? []] } : {},
  };
}
/** The local machine's responders a remote's images and programs name (the host serves them from its containers). */
export function remoteResponders(m: TerminalMachine, r: TerminalRemote, d: TerminalDocker): NonNullable<TerminalMachine['responders']> {
  const used = new Set([...d.images ?? [], ...d.programs ?? []].flatMap(x => (x.http ? [x.http.responder] : [])));
  const own = r.responders ?? [];
  return [...own, ...(m.responders ?? []).filter(x => used.has(x.id) && !own.some(y => y.id === x.id))];
}

/** E31: the hosts the runners reach (the machine's CI state); the marker of a deploy-hosts machine. */
export function deployState(m: TerminalMachine, state: FsState, deployHosts: boolean): FsState {
  if (!deployHosts || !state.ci || deployProblems(m, deployHosts).length) return state;
  return { ...state, ci: { ...state.ci, deploy: { hosts: (m.remotes ?? []).filter(r => r.runners).map(r => r.host) } } };
}
/** E31: the runner image's network: its address and the hosts it reaches (for /etc/hosts). */
export function runnerNetwork(m: TerminalMachine): Pick<TerminalMachine, 'address' | 'peers'> {
  return { address: RUNNER_ADDRESS, peers: (m.remotes ?? []).filter(r => r.runners).map(r => ({ host: r.host, address: r.address, ...r.aliases ? { aliases: r.aliases } : {} })) };
}
