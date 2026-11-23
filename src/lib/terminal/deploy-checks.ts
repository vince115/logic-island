import type { FsState } from './fs';
import { settleDocker } from './docker';
import { describeDockerCheck, dockerCheckProblems, dockerFailure, type DockerCheck, type DockerLevels } from './docker-lesson';
import { digestRefOf } from './registry';

/*
 * Engine stage E31 (docs/curriculum/CICD0_E31_DEPLOY_HOSTS.md §7): the container and image checks may name a remote
 * machine (host) whose Docker daemon they read, and a container check's image may be a digest reference
 * (NAME@sha256:…): the container was created from the image with that repository digest, whatever name it was run by.
 * Without host and without a digest the checks are E20–E24's, unchanged.
 */

export type HostDockerCheck = Extract<DockerCheck, { kind: 'container' | 'image' }>;

/** Whether a container or image check is E31's (it names a host, or a container's image by digest). */
export const isDeployCheck = (c: DockerCheck): c is HostDockerCheck =>
  (c.kind === 'container' || c.kind === 'image') && (c.host !== undefined || (c.kind === 'container' && !!c.image?.includes('@')));

/** The check without host and without a digest image (what docker-lesson.ts checks). */
function plain(c: HostDockerCheck): HostDockerCheck {
  const { host: _h, ...rest } = c;
  void _h;
  if (rest.kind !== 'container' || !rest.image?.includes('@')) return rest;
  const { image: _i, ...noImage } = rest;
  void _i;
  return noImage;
}

export function deployCheckProblems(c: HostDockerCheck, lv: DockerLevels & { deployHosts?: boolean }, known: (host: string) => boolean): string | null {
  if (!lv.deployHosts || (c.host !== undefined && (typeof c.host !== 'string' || !known(c.host))))
    return `a ${c.kind} check with host (or a container's image by digest) needs a deploy-hosts machine (engine stage E31) and a remote machine of the lesson`;
  if (c.kind === 'container' && c.image?.includes('@') && (!digestRefOf(c.image) || c.absent)) return 'a container check\'s image by digest is NAME@sha256:<64 hex digits>, and not with absent';
  return dockerCheckProblems(plain(c), lv);
}

export function describeDeployCheck(c: HostDockerCheck): string {
  const p = plain(c), base = describeDockerCheck(c.kind === 'container' && p.kind === 'container' && c.image?.includes('@') ? { ...p, image: c.image } : p);
  return c.host ? `${c.host} 上${base.replace(/^本機/, '')}` : base;
}

/** Why the check fails on the host's daemon (or the machine's, without host). */
export function deployCheckFailure(c: HostDockerCheck, end: FsState, hostState: (host: string) => FsState | undefined): string | null {
  const s = c.host ? hostState(c.host) : end;
  if (!s) return `沒有 ${c.host} 這台主機`;
  const why = dockerFailure(plain(c), s);
  if (why) return c.host ? why.replace(/^本機/, '這台主機') : why;
  if (c.kind !== 'container' || !c.image?.includes('@')) return null;
  const d = settleDocker(s).docker!, x = d.containers.find(k => k.name === c.name), r = digestRefOf(c.image)!;
  if (!x) return `沒有名為 ${c.name} 的容器`;
  const img = d.images.find(i => i.id === x.image), want = `${r.repo}@sha256:${r.digest}`;
  const has = x.ref === c.image || (d.repoDigests?.[x.image] ?? []).includes(want) || (!!img?.pullable && !img.built && `${img.repo}@sha256:${img.digest}` === want);
  return has ? null : `它是由 ${x.ref} 建立的`;
}
