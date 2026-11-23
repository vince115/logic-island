import { parentOf, type FsNode, type FsState } from './fs';
import type { Seconds } from './clock';
import { layerSizesOf, rootfsOf } from './build';
import {
  findLocal, hex, localImage, parseRef, pull, qualified, refText, remoteName, short, type DockerImage, type DockerState, type ImageRef,
} from './docker';

/*
 * Engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13.6): registries. Besides the simulated Docker Hub of
 * E20, a lesson may declare private registries (registry.example.com:5000, ghcr.example): their users with obviously fake
 * lesson tokens (and who may push where), whether anyone may pull, whether tags are immutable, and the images they serve.
 * docker login checks a user's token and keeps it, base64-encoded, in ~/.docker/config.json (with Docker's warning that it
 * is stored unencrypted); push and pull read it there. A pushed image's manifest is a Docker image manifest (schema 2)
 * written from the image: its digest is the SHA-256 of that text, so the same content has the same digest under any name
 * and a rebuilt image another one. A tag points to a digest; it moves when another image is pushed with it, unless the
 * registry's tags are immutable. Pulling by digest (NAME@sha256:…) gets exactly that manifest.
 */

export interface RegistryUser { name: string; token: string; push: boolean; /** Repository paths (a trailing /* for a namespace) the user may use; default all. */ repos?: readonly string[] }
export interface RegistryManifest { digest: string; size: number; image: DockerImage; layers: { diffId: string; size: number }[] }
export interface DockerRegistry {
  host: string;
  users: readonly RegistryUser[];
  immutable: boolean;
  /** Anyone may pull (no login needed to pull). */
  public: boolean;
  /** Repository path (team/api) → tag → digest, and every digest the repository has held. */
  tags: Readonly<Record<string, Readonly<Record<string, string>>>>;
  digests: Readonly<Record<string, readonly string[]>>;
  manifests: Readonly<Record<string, RegistryManifest>>;
  /** Repository path → the layers (diff IDs) it has. */
  blobs: Readonly<Record<string, readonly string[]>>;
}
export interface DigestRef { repo: string; digest: string }
export interface RegistryCli {
  state: FsState; args: readonly string[]; now: Seconds; stdin?: string | null; user: string; path: string;
  out(line: string): void; raw(data: string): void; err(line: string): void;
}
type Result = { state: FsState; status: number };

const bytes = (text: string) => new TextEncoder().encode(text).length;
const HUB = 'https://index.docker.io/v1/';

/** NAME[:TAG]@sha256:<64 hex digits> (the tag, if any, is ignored: the digest decides), or null. */
export function digestRefOf(text: string): DigestRef | null {
  const at = text.indexOf('@');
  if (at < 0) return null;
  const d = text.slice(at + 1), r = parseRef(text.slice(0, at));
  if (!r || !/^sha256:[0-9a-f]{64}$/.test(d)) return null;
  return { repo: r.repo, digest: d.slice(7) };
}
/** The registry host of a repository name (its first component when that has a dot or a port, or is localhost). */
export function hostOf(repo: string): string | undefined {
  const first = repo.split('/')[0];
  return repo.includes('/') && (/[.:]/.test(first) || first === 'localhost') ? first : undefined;
}
const pathOf = (repo: string) => { const h = hostOf(repo); return h ? repo.slice(h.length + 1) : remoteName(repo); };
const noHost = (host: string) => `Get "https://${host}/v2/": dial tcp: lookup ${host.split(':')[0]} on 127.0.0.53:53: no such host`;
/** Whether a repository is a private registry's (one the lesson declares, or a host it does not know): not Docker Hub's. */
export function isPrivate(d: DockerState, repo: string): boolean {
  const h = hostOf(repo);
  return !!h && ((d.registries ?? []).some(r => r.host === h) || !d.images.some(i => i.pullable && i.repo === repo));
}

/** The image manifest (schema 2) a registry stores for an image: its digest, its size and its layers (oldest first). */
export function manifestOf(img: DockerImage): { digest: string; size: number; layers: { diffId: string; size: number }[] } {
  const sizes = layerSizesOf(img), layers = rootfsOf(img).map((diffId, k) => ({ diffId, size: sizes[k] ?? 0 }));
  const config = JSON.stringify({ architecture: 'amd64', config: { User: img.user ?? '', Env: img.env, Cmd: img.cmd, Entrypoint: img.entrypoint, WorkingDir: img.workdir }, created: img.created, os: 'linux', rootfs: { type: 'layers', diff_ids: layers.map(l => `sha256:${l.diffId}`) } });
  const json = JSON.stringify({
    schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
    config: { mediaType: 'application/vnd.docker.container.image.v1+json', size: bytes(config), digest: `sha256:${img.id}` },
    layers: layers.map(l => ({ mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', size: l.size, digest: `sha256:${hex(`blob/${l.diffId}`)}` })),
  }, null, 3);
  return { digest: hex(json), size: bytes(json), layers };
}
/** The image as a registry keeps it (no local name). */
const snapshot = (img: DockerImage): DockerImage => { const { dangling: _d, digestOnly: _o, ...rest } = img; void _d; void _o; return { ...rest, repo: '', tag: '', local: false, pullable: false }; };

// ------------------------------------------------------------------------------------------------- credentials

const homeOf = (state: FsState, user: string) => user === state.user ? state.home : user === 'root' ? '/root' : `/home/${user}`;
const configPath = (state: FsState, user: string) => `${homeOf(state, user) === '/' ? '' : homeOf(state, user)}/.docker/config.json`;
function readConfig(state: FsState, user: string): { auths?: Record<string, { auth?: string }> } & Record<string, unknown> {
  try { const v = JSON.parse(state.nodes.get(configPath(state, user))?.content ?? '{}') as unknown; return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; }
}
function writeConfig(state: FsState, user: string, config: Record<string, unknown>): FsState {
  const path = configPath(state, user), dir = parentOf(path), nodes = new Map<string, FsNode>(state.nodes);
  if (!nodes.has(dir)) nodes.set(dir, { kind: 'dir', mode: 0o700, owner: user });
  nodes.set(path, { kind: 'file', mode: 0o600, owner: user, content: JSON.stringify(config, null, '\t') });
  return { ...state, nodes };
}
/** The user and token docker login stored for a registry (base64 of user:token), if any. */
function credentialsOf(state: FsState, user: string, host: string): { user: string; token: string } | undefined {
  const auth = readConfig(state, user).auths?.[host]?.auth;
  if (typeof auth !== 'string') return undefined;
  try { const text = atob(auth), at = text.indexOf(':'); return at < 0 ? undefined : { user: text.slice(0, at), token: text.slice(at + 1) }; } catch { return undefined; }
}
const loginOf = (reg: DockerRegistry, c: { user: string; token: string } | undefined) => c ? reg.users.find(u => u.name === c.user && u.token === c.token) : undefined;
const mayUse = (u: RegistryUser, path: string) => !u.repos || u.repos.some(p => p === path || (p.endsWith('/*') && path.startsWith(p.slice(0, -1))));

// ------------------------------------------------------------------------------------------------- docker login | logout

/** docker login [-u USER] [-p PASSWORD | --password-stdin] SERVER. */
export function loginCommand(x: RegistryCli): Result {
  let user: string | undefined, password: string | undefined, fromStdin = false;
  const words: string[] = [];
  for (let i = 0; i < x.args.length; i++) {
    const a = x.args[i], long = /^--(username|password)=(.*)$/.exec(a);
    if (a === '-u' || a === '--username') user = x.args[++i];
    else if (a === '-p' || a === '--password') password = x.args[++i];
    else if (long) { if (long[1] === 'username') user = long[2]; else password = long[2]; }
    else if (a === '--password-stdin') fromStdin = true;
    else if (a.startsWith('-')) { x.err(a.startsWith('--') ? `unknown flag: ${a.split('=')[0]}` : `unknown shorthand flag: '${a[1]}' in ${a}`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; }
    else words.push(a);
  }
  if (words.length > 1) { x.err(`"${x.path}" requires at most 1 argument.`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 1 }; }
  if (password !== undefined && fromStdin) { x.err('Error: --password and --password-stdin are mutually exclusive'); return { state: x.state, status: 1 }; }
  if (fromStdin && !user) { x.err('Error: Must provide --username with --password-stdin'); return { state: x.state, status: 1 }; }
  const host = words[0]?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host) { x.err('docker login：模擬環境的 Docker Hub 不需要登入（課程的公開 Image 都可以直接拉取）；私有 Registry 請寫出位址，例如 docker login registry.example.com:5000'); return { state: x.state, status: 1 }; }
  if (password !== undefined) x.err('WARNING! Using --password via the CLI is insecure. Use --password-stdin.');
  if (fromStdin) password = (x.stdin ?? '').replace(/\r?\n$/, '').replace(/\r$/, '');
  if (password === undefined || !user) { x.err('Error: Cannot perform an interactive login from a non TTY device'); return { state: x.state, status: 1 }; }
  if (!password) { x.err('Error: Password Required'); return { state: x.state, status: 1 }; }
  const reg = (x.state.docker!.registries ?? []).find(r => r.host === host);
  if (!reg) { x.err(`Error response from daemon: ${noHost(host)}`); return { state: x.state, status: 1 }; }
  if (!loginOf(reg, { user, token: password })) { x.err(`Error response from daemon: Get "https://${host}/v2/": unauthorized: incorrect username or password`); return { state: x.state, status: 1 }; }
  const config = readConfig(x.state, x.user);
  const state = writeConfig(x.state, x.user, { ...config, auths: { ...config.auths ?? {}, [host]: { auth: btoa(`${user}:${password}`) } } });
  // Docker's warning (standard error) when the credentials go to the file in plain text, then the result.
  [`WARNING! Your password will be stored unencrypted in ${configPath(state, x.user)}.`, 'Configure a credential helper to remove this warning. See', 'https://docs.docker.com/go/credential-store/', ''].forEach(l => x.err(l));
  x.out('Login Succeeded');
  return { state, status: 0 };
}
/** docker logout [SERVER]: forgets the stored credentials. */
export function logoutCommand(x: RegistryCli): Result {
  const bad = x.args.find(a => a.startsWith('-'));
  if (bad) { x.err(bad.startsWith('--') ? `unknown flag: ${bad}` : `unknown shorthand flag: '${bad[1]}' in ${bad}`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; }
  if (x.args.length > 1) { x.err(`"${x.path}" requires at most 1 argument.`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 1 }; }
  const host = x.args[0]?.replace(/^https?:\/\//, '').replace(/\/+$/, '') ?? HUB, config = readConfig(x.state, x.user);
  if (!config.auths?.[host]) { x.out(`Not logged in to ${host}`); return { state: x.state, status: 0 }; }
  x.out(`Removing login credentials for ${host}`);
  const auths = { ...config.auths };
  delete auths[host];
  return { state: writeConfig(x.state, x.user, { ...config, auths }), status: 0 };
}

// ------------------------------------------------------------------------------------------------- docker tag

/** docker tag SOURCE TARGET: another name for the same image (a tag that named another image moves; that image may be left dangling). */
export function tagCommand(x: RegistryCli): Result {
  const d = x.state.docker!, bad = x.args.find(a => a.startsWith('-'));
  if (bad) { x.err(bad.startsWith('--') ? `unknown flag: ${bad}` : `unknown shorthand flag: '${bad[1]}' in ${bad}`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; }
  if (x.args.length !== 2) {
    [`"${x.path}" requires exactly 2 arguments.`, `See '${x.path} --help'.`, '', `Usage:  ${x.path} SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]`, '', 'Create a tag TARGET_IMAGE that refers to SOURCE_IMAGE'].forEach(l => x.err(l));
    return { state: x.state, status: 1 };
  }
  const [from, to] = x.args;
  const parseError = (t: string) => {
    const name = t.lastIndexOf(':') > t.lastIndexOf('/') ? t.slice(0, t.lastIndexOf(':')) : t;
    x.err(`Error parsing reference: "${t}" is not a valid repository/tag: invalid reference format${/[A-Z]/.test(name) ? `: repository name (${name.includes('/') ? name : `library/${name}`}) must be lowercase` : ''}`);
    return { state: x.state, status: 1 };
  };
  if (!from.includes('@') && !parseRef(from) && !/^(sha256:)?[0-9a-f]{4,64}$/.test(from)) return parseError(from);
  const src = findLocal(d, from);
  if (!src) { const r = parseRef(from); x.err(`Error response from daemon: No such image: ${r ? refText(r) : from}`); return { state: x.state, status: 1 }; }
  if (to.includes('@')) { x.err('refusing to create a tag with a digest reference'); return { state: x.state, status: 1 }; }
  const target = parseRef(to);
  if (!target) return parseError(to);
  return { state: { ...x.state, docker: retag(d, src, target) }, status: 0 };
}
/** The image under another name: a tag that named another image moves (that image, left without a name, is dangling). */
function retag(d: DockerState, src: DockerImage, target: ImageRef): DockerState {
  const old = localImage(d, target);
  if (old?.id === src.id) return d;
  let images = [...d.images];
  if (old) images = images.some(i => i !== old && i.local && !i.dangling && !i.digestOnly && i.id === old.id) ? images.filter(i => i !== old) : images.map(i => i === old ? (i.pullable ? { ...i, local: false } : { ...i, dangling: true }) : i);
  const { dangling: _d, digestOnly: _o, ...rest } = src;
  void _d; void _o;
  // The name is the image's, not Docker Hub's (a pullable entry of the same name keeps saying what Docker Hub has).
  const hub = images.findIndex(i => i.pullable && !i.local && i.repo === target.repo && i.tag === target.tag);
  const entry: DockerImage = { ...rest, repo: target.repo, tag: target.tag, local: true, pullable: false };
  if (hub >= 0 && images[hub].id === src.id) images[hub] = { ...images[hub], local: true };
  else images.push(entry);
  return { ...d, images };
}

// ------------------------------------------------------------------------------------------------- docker push

/** docker push NAME[:TAG]: the layers each registry needs, then the tag's digest (Docker Hub and unknown hosts refuse). */
export function pushCommand(x: RegistryCli): Result {
  const d = x.state.docker!;
  let quiet = false;
  const words: string[] = [];
  for (const a of x.args) {
    if (a === '-q' || a === '--quiet') quiet = true;
    else if (a === '--disable-content-trust' || a === '--disable-content-trust=true') continue;
    else if (a === '-a' || a === '--all-tags') { x.err('docker push：模擬環境一次推送一個標籤（不支援 -a）'); return { state: x.state, status: 1 }; }
    else if (a.startsWith('-')) { x.err(a.startsWith('--') ? `unknown flag: ${a.split('=')[0]}` : `unknown shorthand flag: '${a[1]}' in ${a}`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; }
    else words.push(a);
  }
  if (words.length !== 1) {
    [`"${x.path}" requires exactly 1 argument.`, `See '${x.path} --help'.`, '', `Usage:  ${x.path} [OPTIONS] NAME[:TAG]`, '', 'Upload an image to a registry'].forEach(l => x.err(l));
    return { state: x.state, status: 1 };
  }
  const typed = words[0];
  if (typed.includes('@')) { x.err('cannot push a digest reference'); return { state: x.state, status: 1 }; }
  const ref = parseRef(typed);
  if (!ref) { x.err('invalid reference format'); return { state: x.state, status: 1 }; }
  const say = (l: string) => { if (!quiet) x.out(l); };
  if (!(typed.lastIndexOf(':') > typed.lastIndexOf('/'))) say('Using default tag: latest');
  const img = localImage(d, ref);
  if (!img) { x.err(`An image does not exist locally with the tag: ${ref.repo}`); return { state: x.state, status: 1 }; }
  const host = hostOf(ref.repo), path = pathOf(ref.repo), m = manifestOf(img), top = [...m.layers].reverse();
  say(`The push refers to repository [${host ? ref.repo : `docker.io/${path}`}]`);
  const preparing = () => top.forEach(l => say(`${short(l.diffId)}: Preparing`));
  // Docker Hub: the simulation has no accounts there.
  if (!host) { preparing(); x.err('denied: requested access to the resource is denied'); return { state: x.state, status: 1 }; }
  const regs = d.registries ?? [], reg = regs.find(r => r.host === host);
  if (!reg) { x.err(noHost(host)); return { state: x.state, status: 1 }; }
  const who = loginOf(reg, credentialsOf(x.state, x.user, host));
  if (!who) { preparing(); x.err('unauthorized: authentication required'); return { state: x.state, status: 1 }; }
  if (!who.push || !mayUse(who, path)) { preparing(); x.err('denied: requested access to the resource is denied'); return { state: x.state, status: 1 }; }
  const have = reg.blobs[path] ?? [];
  for (const l of top) {
    const other = have.includes(l.diffId) ? undefined : Object.keys(reg.blobs).sort().find(p => p !== path && reg.blobs[p].includes(l.diffId));
    say(`${short(l.diffId)}: ${have.includes(l.diffId) ? 'Layer already exists' : other ? `Mounted from ${other}` : 'Pushed'}`);
  }
  const blobs = { ...reg.blobs, [path]: [...new Set([...have, ...m.layers.map(l => l.diffId)])] };
  const old = reg.tags[path]?.[ref.tag];
  if (reg.immutable && old !== undefined && old !== m.digest) {
    x.err(`tag invalid: The image tag '${ref.tag}' already exists in the '${path}' repository and cannot be overwritten because the repository is immutable.`);
    return { state: { ...x.state, docker: { ...d, registries: regs.map(r => r === reg ? { ...r, blobs } : r) } }, status: 1 };
  }
  if (quiet) x.out(`${ref.repo}:${ref.tag}`); else x.out(`${ref.tag}: digest: sha256:${m.digest} size: ${m.size}`);
  const next: DockerRegistry = {
    ...reg, blobs, tags: { ...reg.tags, [path]: { ...reg.tags[path] ?? {}, [ref.tag]: m.digest } }, digests: { ...reg.digests, [path]: [...new Set([...reg.digests[path] ?? [], m.digest])] },
    manifests: { ...reg.manifests, [m.digest]: { digest: m.digest, size: m.size, image: snapshot(img), layers: m.layers } },
  };
  const repoDigests = { ...d.repoDigests ?? {}, [img.id]: [...new Set([...d.repoDigests?.[img.id] ?? [], `${ref.repo}@sha256:${m.digest}`])] };
  return { state: { ...x.state, docker: { ...d, registries: regs.map(r => r === reg ? next : r), repoDigests } }, status: 0 };
}

// ------------------------------------------------------------------------------------------------- docker pull (registries, digests)

type Pulled = { d: DockerState; lines: string[]; name: string } | { error: string };
/** Whether a local image has this layer already (docker pull says Already exists). */
const haveLayer = (d: DockerState, diffId: string) => d.images.some(i => i.local && rootfsOf(i).includes(diffId));
/** A local name for a pulled image: the tag moves to it (the image it named before is left dangling unless another tag names it). */
function placeTagged(d: DockerState, img: DockerImage, ref: ImageRef): DockerImage[] {
  let images = [...d.images];
  const old = localImage(d, ref);
  if (old && old.id !== img.id) images = images.some(i => i !== old && i.local && !i.dangling && !i.digestOnly && i.id === old.id) ? images.filter(i => i !== old) : images.map(i => i === old ? { ...i, dangling: true } : i);
  images = images.filter(i => !(i.digestOnly && i.id === img.id && i.repo === ref.repo) && !(i.dangling && i.id === img.id));
  return [...images, { ...img, repo: ref.repo, tag: ref.tag, local: true, pullable: false }];
}
const withDigest = (d: DockerState, id: string, name: string): DockerState => ({ ...d, repoDigests: { ...d.repoDigests ?? {}, [id]: [...new Set([...d.repoDigests?.[id] ?? [], name])] } });

/** docker pull from a private registry, by tag or by digest, with the stored credentials. */
export function registryPull(state: FsState, d: DockerState, want: { repo: string; tag?: string; digest?: string }, user: string): Pulled {
  const host = hostOf(want.repo)!, path = pathOf(want.repo), reg = (d.registries ?? []).find(r => r.host === host);
  if (!reg) return { error: `Error response from daemon: ${noHost(host)}` };
  const what = want.tag ?? `sha256:${want.digest}`, shown = want.tag ? `${want.repo}:${want.tag}` : `${want.repo}@sha256:${want.digest}`;
  const who = loginOf(reg, credentialsOf(state, user, host));
  if (!reg.public && !who) return { error: `Error response from daemon: Head "https://${host}/v2/${path}/manifests/${what}": unauthorized: authentication required` };
  if (who && !mayUse(who, path)) return { error: `Error response from daemon: pull access denied for ${want.repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied` };
  const digest = want.tag ? reg.tags[path]?.[want.tag] : (reg.digests[path] ?? []).includes(want.digest!) ? want.digest : undefined;
  if (!digest) return { error: `Error response from daemon: manifest for ${shown} not found: manifest unknown: manifest unknown` };
  const m = reg.manifests[digest], lines = [`${what}: Pulling from ${path}`];
  const named = want.tag ? localImage(d, { repo: want.repo, tag: want.tag }) : d.images.find(i => i.local && !i.dangling && i.id === m.image.id);
  if (named?.id === m.image.id) return { d: withDigest(d, m.image.id, `${want.repo}@sha256:${digest}`), lines: [...lines, `Digest: sha256:${digest}`, `Status: Image is up to date for ${shown}`], name: shown };
  for (const l of m.layers) lines.push(`${short(l.diffId)}: ${haveLayer(d, l.diffId) ? 'Already exists' : 'Pull complete'}`);
  lines.push(`Digest: sha256:${digest}`, `Status: Downloaded newer image for ${shown}`);
  const images = want.tag ? placeTagged(d, m.image, { repo: want.repo, tag: want.tag }) : [...d.images, { ...m.image, repo: want.repo, tag: '', local: true, pullable: false, digestOnly: true as const }];
  return { d: withDigest({ ...d, images }, m.image.id, `${want.repo}@sha256:${digest}`), lines, name: shown };
}

/** docker pull NAME@sha256:… of Docker Hub (the digests the lesson's images have there). */
function hubDigestPull(d: DockerState, r: DigestRef): Pulled {
  const img = d.images.find(i => i.pullable && !i.built && i.repo === r.repo && i.digest === r.digest), shown = `${r.repo}@sha256:${r.digest}`;
  if (!img) return { error: d.images.some(i => i.pullable && i.repo === r.repo) ? `Error response from daemon: manifest for ${shown} not found: manifest unknown: manifest unknown`
    : `Error response from daemon: pull access denied for ${r.repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied` };
  const name = `${qualified({ repo: r.repo, tag: 'x' }).replace(/:x$/, '')}@sha256:${r.digest}`, lines = [`sha256:${r.digest}: Pulling from ${remoteName(r.repo)}`];
  if (d.images.some(i => i.local && !i.dangling && i.id === img.id)) return { d, lines: [...lines, `Digest: sha256:${r.digest}`, `Status: Image is up to date for ${shown}`], name };
  for (const diffId of rootfsOf(img)) lines.push(`${short(diffId)}: ${haveLayer(d, diffId) ? 'Already exists' : 'Pull complete'}`);
  lines.push(`Digest: sha256:${r.digest}`, `Status: Downloaded newer image for ${shown}`);
  return { d: withDigest({ ...d, images: [...d.images, { ...img, tag: '', local: true, pullable: false, digestOnly: true }] }, img.id, shown), lines, name };
}

/** E23's docker pull: by tag or digest, from Docker Hub or a private registry (the last line is the name it prints). */
export function pullAny(state: FsState, d: DockerState, typed: string, user: string, now: Seconds): Pulled {
  if (typed.includes('@')) {
    const r = digestRefOf(typed);
    if (!r) return { error: 'invalid reference format' };
    return isPrivate(d, r.repo) ? registryPull(state, d, r, user) : hubDigestPull(d, r);
  }
  const ref = parseRef(typed);
  if (!ref) return { error: 'invalid reference format' };
  if (isPrivate(d, ref.repo)) {
    const r = registryPull(state, d, { repo: ref.repo, tag: ref.tag }, user);
    return 'error' in r || typed.lastIndexOf(':') > typed.lastIndexOf('/') ? r : { ...r, lines: ['Using default tag: latest', ...r.lines] };
  }
  const p = pull(d, ref, typed, now);
  return 'error' in p ? p : { ...p, name: qualified(ref) };
}
