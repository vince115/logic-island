import { baseName, parentOf, resolvePath, type FsNode, type FsState } from './fs';
import { isoText, type Seconds } from './clock';
import { clockOf } from './processes';
import { advanceClock } from './shell';
import { build } from './build';
import {
  displayPorts, docker, dropAnonymous, ellipsis, findLocal, formatted, goQuote, hex, hooksOf, humanDuration, imageById, imageNodes, localImage, parseRef, settleDocker, short, start, statusText, stop,
  syncDocker, tabwrite, withLogs, type DockerContainer, type DockerImage, type DockerState, type PortBinding,
} from './docker';
import { activeTest, parseDuration, durationText, type HealthConfig } from './health';
import { pullAny } from './registry';
import { ensureVolumeDir, imageVolumes, NETWORK_NAME, nextSubnet, prepareMounts, removeVolumeDir, type DockerMount, type DockerNetwork } from './storage-net';
import { emitYaml, Pairs, parseYaml, YamlError, type Out, type Y } from './yaml';

/*
 * Engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13): Docker Compose v2 (the docker compose plugin,
 * v2.32.4 with Docker CE 27.5.1) on the simulated daemon. A compose.yaml (or compose.yml, docker-compose.yaml,
 * docker-compose.yml, or -f FILE) in the YAML subset of yaml.ts is interpolated (${VAR}, ${VAR:-default}, ${VAR:?error},
 * $$ from the shell's exported variables and the project's .env), validated (unknown keys are schema errors; real keys the
 * simulation does not model are said) and normalized the way `docker compose config` prints it. The project is named by -p,
 * COMPOSE_PROJECT_NAME, the top-level name or its folder; its containers are PROJECT-SERVICE-1 (labelled with the project and
 * the service), its default network PROJECT_default (each container is reachable by its service name there), its volumes
 * PROJECT_NAME. up creates what is missing (images are built or pulled first), recreates what changed, and starts the
 * services in the order depends_on gives, waiting — the clock moves — for a dependency to be healthy or to have completed
 * when the condition says so. The progress is Compose's plain output (what it prints when standard output is not a
 * terminal): one line per event, " Container shop-db-1  Started".
 */

export const COMPOSE_VERSION = '2.32.4';

export interface ComposeCli {
  state: FsState; args: readonly string[]; allowed: boolean; denied: string;
  io: { out(line: string): void; raw(data: string): void; err(line: string): void; user: string; tty: boolean; stdin?: string | null; images?: boolean; storageNet?: boolean; compose?: boolean };
}
type Result = { state: FsState; status: number };
class ComposeError extends Error { constructor(message: string, readonly status = 1) { super(message); } }

// ------------------------------------------------------------------------------------------------- the model

export type Condition = 'service_started' | 'service_healthy' | 'service_completed_successfully';
export interface ComposePort { target: number; published: number; hostIp?: string; protocol: 'tcp' | 'udp' }
export interface ComposeVolume { type: 'volume' | 'bind'; source: string; target: string; readOnly: boolean }
export interface ComposeService {
  name: string;
  image?: string;
  build?: { context: string; dockerfile: string; args: [string, string][]; target?: string };
  ports: ComposePort[];
  environment: [string, string | null][];
  volumes: ComposeVolume[];
  networks: [string, string[]][];
  dependsOn: { service: string; condition: Condition; required: boolean; restart: boolean }[];
  healthcheck?: HealthConfig;
  healthDisabled?: boolean;
  restart?: string;
  command?: string[];
  entrypoint?: string[];
  user?: string;
  workingDir?: string;
  containerName?: string;
  labels: [string, string][];
}
export interface ComposeProject {
  name: string; dir: string; file: string;
  services: ComposeService[];
  networks: { key: string; name: string; external: boolean }[];
  volumes: { key: string; name: string; external: boolean }[];
  warnings: string[];
}

const FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const TOP = ['version', 'name', 'services', 'networks', 'volumes', 'configs', 'secrets', 'include'];
const SERVICE_KEYS = ['image', 'build', 'ports', 'environment', 'env_file', 'volumes', 'networks', 'depends_on', 'healthcheck', 'restart', 'command', 'entrypoint', 'user', 'working_dir', 'container_name', 'labels'];
/** Real service keys of the Compose specification the simulation does not model (said, not faked). */
const SERVICE_OTHER = ['annotations', 'attach', 'blkio_config', 'cap_add', 'cap_drop', 'cgroup', 'cgroup_parent', 'configs', 'cpu_count', 'cpu_percent', 'cpu_period', 'cpu_quota', 'cpu_rt_period',
  'cpu_rt_runtime', 'cpu_shares', 'cpus', 'cpuset', 'credential_spec', 'deploy', 'develop', 'device_cgroup_rules', 'devices', 'dns', 'dns_opt', 'dns_search', 'domainname', 'expose', 'extends',
  'external_links', 'extra_hosts', 'gpus', 'group_add', 'hostname', 'init', 'ipc', 'isolation', 'links', 'logging', 'mac_address', 'mem_limit', 'mem_reservation', 'mem_swappiness', 'memswap_limit',
  'network_mode', 'oom_kill_disable', 'oom_score_adj', 'pid', 'pids_limit', 'platform', 'privileged', 'profiles', 'pull_policy', 'read_only', 'runtime', 'scale', 'secrets', 'security_opt',
  'shm_size', 'stdin_open', 'stop_grace_period', 'stop_signal', 'storage_opt', 'sysctls', 'tmpfs', 'tty', 'ulimits', 'userns_mode', 'uts', 'volumes_from', 'post_start', 'pre_stop', 'label_file', 'models', 'provider'];
const CONDITIONS: Condition[] = ['service_started', 'service_healthy', 'service_completed_successfully'];

/** Compose's project name: lower case, only [a-z0-9_-], starting with a letter or a digit. */
export const normalizeProjectName = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[^a-z0-9]+/, '');
const validProjectName = (s: string) => /^[a-z0-9][a-z0-9_-]*$/.test(s);

/** The shell's exported variables (what docker compose sees in its environment). */
function shellEnv(state: FsState): Map<string, string> {
  const sh = state.shell, out = new Map<string, string>();
  for (const k of sh?.exported ?? []) { const v = sh?.vars[k]; if (v !== undefined) out.set(k, v); }
  return out;
}
/** A .env or env_file: KEY=VALUE lines (# comments, optional export, quotes removed). */
function envFile(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(l);
    if (!m) continue;
    let v = m[2];
    if (/^"(.*)"$/.test(v)) v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    else if (/^'(.*)'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out.push([m[1], v]);
  }
  return out;
}

/** ${VAR}, ${VAR:-default}, ${VAR-default}, ${VAR:?error}, ${VAR?error}, ${VAR:+alt}, $VAR and $$ (compose-go's template). */
function interpolate(text: string, vars: ReadonlyMap<string, string>, where: string, warn: (name: string) => void): string {
  return text.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?+])((?:[^}]|\}(?!\}))*?))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, braced: string | undefined, op: string | undefined, word: string | undefined, bare: string | undefined) => {
    if (all === '$$') return '$';
    const name = braced ?? bare!, v = vars.get(name), empty = v === undefined || v === '';
    if (op === ':-') return empty ? word ?? '' : v!;
    if (op === '-') return v === undefined ? word ?? '' : v;
    if (op === ':+') return empty ? '' : word ?? '';
    if (op === '+') return v === undefined ? '' : word ?? '';
    if (op === ':?' || op === '?') {
      if (op === ':?' ? empty : v === undefined) throw new ComposeError(`error while interpolating ${where}: required variable ${name} is missing a value${word ? `: ${word}` : ''}`);
      return v!;
    }
    if (v === undefined) { warn(name); return ''; }
    return v;
  });
}
/** Every scalar (not the keys) of the file, interpolated; the path names the value in errors. */
function interpolateTree(y: Y, vars: ReadonlyMap<string, string>, path: string, warn: (name: string) => void): Y {
  if (y.t === 'str') return { ...y, v: interpolate(y.v, vars, path, warn) };
  if (y.t === 'seq') return { ...y, a: y.a.map((x, i) => interpolateTree(x, vars, `${path}[${i}]`, warn)) };
  if (y.t === 'map') return { ...y, m: y.m.map(([k, v]) => [k, interpolateTree(v, vars, path ? `${path}.${k}` : k, warn)] as [string, Y]) };
  return y;
}

/** sh-style words of a command string (quotes and backslashes), as compose-go's shellwords split command and entrypoint. */
function shellWords(s: string): string[] {
  const out: string[] = [];
  let cur = '', any = false, q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; else if (ch === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue; }
    if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; any = true; continue; }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** Reads, interpolates, validates and normalizes the project (the compose file of the folder, or -f). */
export function loadProject(state: FsState, o: { file?: string; name?: string; envFile?: string }, warn: (line: string) => void = () => undefined): ComposeProject {
  let file: string | undefined;
  if (o.file !== undefined) {
    file = resolvePath(state, o.file);
    if (state.nodes.get(file)?.kind !== 'file') throw new ComposeError(`open ${file}: no such file or directory`);
  } else {
    // Compose looks in the current folder, then in its parents.
    for (let dir = state.cwd; ; dir = parentOf(dir)) {
      const hit = FILES.map(f => `${dir === '/' ? '' : dir}/${f}`).find(p => state.nodes.get(p)?.kind === 'file');
      if (hit) { file = hit; break; }
      if (dir === '/') break;
    }
    if (!file) throw new ComposeError('no configuration file provided: not found');
  }
  const dir = parentOf(file), warnings: string[] = [];
  const note = (w: string) => { warnings.push(w); warn(w); };
  let y: Y;
  try { y = parseYaml(state.nodes.get(file)!.content ?? ''); } catch (e) { if (e instanceof YamlError) throw new ComposeError(e.message); throw e; }
  if (y.t === 'null') throw new ComposeError(`${file}: empty compose file`);
  const invalid = (what: string) => new ComposeError(`validating ${file}: ${what}`);
  if (y.t !== 'map') throw invalid('top-level object must be a mapping');
  // The variables: the shell's exported ones over the project's .env (or --env-file).
  const env = shellEnv(state), dotEnvPath = o.envFile !== undefined ? resolvePath(state, o.envFile) : `${dir === '/' ? '' : dir}/.env`, dotEnv = state.nodes.get(dotEnvPath);
  if (o.envFile !== undefined && dotEnv?.kind !== 'file') throw new ComposeError(`couldn't find env file: ${dotEnvPath}`);
  const vars = new Map<string, string>([...dotEnv?.kind === 'file' ? envFile(dotEnv.content ?? '') : [], ...env]);
  const warned = new Set<string>();
  const top = interpolateTree(y, vars, '', name => { if (!warned.has(name)) { warned.add(name); note(`The "${name}" variable is not set. Defaulting to a blank string.`); } }) as Extract<Y, { t: 'map' }>;
  const get = (m: Extract<Y, { t: 'map' }>, k: string) => m.m.find(([x]) => x === k)?.[1];
  for (const [k] of top.m) if (!TOP.includes(k) && !k.startsWith('x-')) throw invalid(`additional properties '${k}' not allowed`);
  for (const k of ['configs', 'secrets', 'include']) if (get(top, k)) throw new ComposeError(`docker compose：模擬環境不支援頂層的 ${k}`);
  if (get(top, 'version')) note(`${file}: the attribute \`version\` is obsolete, it will be ignored, please remove it to avoid potential confusion`);
  const str = (v: Y | undefined, path: string): string | undefined => {
    if (!v || v.t === 'null') return undefined;
    if (v.t !== 'str') throw invalid(`${path} must be a string`);
    return v.v;
  };
  const mapOf = (v: Y | undefined, path: string): Extract<Y, { t: 'map' }> | undefined => {
    if (!v || v.t === 'null') return undefined;
    if (v.t !== 'map') throw invalid(`${path} must be a mapping`);
    return v;
  };
  const listOf = (v: Y | undefined, path: string): Y[] => {
    if (!v || v.t === 'null') return [];
    if (v.t !== 'seq') throw invalid(`${path} must be a list`);
    return v.a;
  };
  const bool = (v: Y | undefined, path: string): boolean | undefined => {
    const t = str(v, path);
    if (t === undefined) return undefined;
    if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
    throw invalid(`${path} must be a boolean`);
  };
  const words = (v: Y | undefined, path: string): string[] | undefined => {
    if (!v || v.t === 'null') return undefined;
    if (v.t === 'str') return shellWords(v.v);
    if (v.t === 'seq') return v.a.map((x, i) => str(x, `${path}.${i}`) ?? '');
    throw invalid(`${path} must be a string or a list`);
  };
  const pairsOf = (v: Y | undefined, path: string, sep: string): [string, string | null][] => {
    if (!v || v.t === 'null') return [];
    if (v.t === 'map') return v.m.map(([k, x]) => [k, x.t === 'null' ? null : str(x, `${path}.${k}`)!]);
    if (v.t === 'seq') return v.a.map((x, i) => { const t = str(x, `${path}.${i}`) ?? ''; const at = t.indexOf(sep); return at < 0 ? [t, null] : [t.slice(0, at), t.slice(at + 1)]; });
    throw invalid(`${path} must be a mapping or a list`);
  };
  // The project's name: -p, COMPOSE_PROJECT_NAME, the top-level name, or its folder.
  const given = o.name ?? env.get('COMPOSE_PROJECT_NAME') ?? str(get(top, 'name'), 'name');
  if (given !== undefined && !validProjectName(given)) throw new ComposeError(`invalid project name "${given}": must consist only of lowercase alphanumeric characters, hyphens, and underscores as well as start with a letter or number`);
  const name = given ?? normalizeProjectName(baseName(dir));
  if (!name) throw new ComposeError('project name must not be empty');
  const at = (p: string) => p.startsWith('~') ? resolvePath(state, p) : resolvePath({ cwd: dir, home: state.home }, p);
  // Top-level networks and volumes (each is PROJECT_KEY unless it has a name or is external).
  const declared = (kind: 'networks' | 'volumes') => (mapOf(get(top, kind), kind)?.m ?? []).map(([key, v]) => {
    const m = mapOf(v, `${kind}.${key}`);
    for (const [k] of m?.m ?? []) if (!['name', 'external', 'driver', 'labels', 'driver_opts'].includes(k)) throw invalid(`${kind}.${key} additional properties '${k}' not allowed`);
    const driver = str(m && get(m, 'driver'), `${kind}.${key}.driver`);
    if (driver !== undefined && driver !== (kind === 'networks' ? 'bridge' : 'local')) throw new ComposeError(`docker compose：模擬環境的 ${kind}.${key} 只支援 driver: ${kind === 'networks' ? 'bridge' : 'local'}`);
    if (m && (get(m, 'labels') || get(m, 'driver_opts'))) throw new ComposeError(`docker compose：模擬環境不支援 ${kind}.${key} 的 labels 與 driver_opts`);
    const external = bool(m && get(m, 'external'), `${kind}.${key}.external`) ?? false, own = str(m && get(m, 'name'), `${kind}.${key}.name`);
    return { key, name: own ?? (external ? key : `${name}_${key}`), external };
  });
  const volumes = declared('volumes'), networks0 = declared('networks');
  const servicesY = mapOf(get(top, 'services'), 'services');
  if (!servicesY || !servicesY.m.length) throw new ComposeError('no service selected');
  const services: ComposeService[] = [];
  for (const [svc, v] of servicesY.m) {
    const path = `services.${svc}`;
    if (!/^[a-zA-Z0-9._-]+$/.test(svc)) throw invalid(`services Additional property ${svc} is not allowed`);
    const m = mapOf(v, path) ?? { t: 'map' as const, m: [], line: 0, col: 0, keys: [] };
    for (const [k] of m.m) {
      if (SERVICE_OTHER.includes(k)) throw new ComposeError(`docker compose：模擬環境不支援 ${path}.${k}（請從 ${baseName(file)} 移除，或改用模擬環境支援的寫法）`);
      if (!SERVICE_KEYS.includes(k) && !k.startsWith('x-')) throw invalid(`${path} additional properties '${k}' not allowed`);
    }
    const s: ComposeService = { name: svc, ports: [], environment: [], volumes: [], networks: [], dependsOn: [], labels: [] };
    s.image = str(get(m, 'image'), `${path}.image`);
    const b = get(m, 'build');
    if (b && b.t !== 'null') {
      if (b.t === 'str') s.build = { context: at(b.v), dockerfile: 'Dockerfile', args: [] };
      else {
        const bm = mapOf(b, `${path}.build`)!;
        for (const [k] of bm.m) if (!['context', 'dockerfile', 'args', 'target'].includes(k)) {
          if (['cache_from', 'cache_to', 'labels', 'network', 'platforms', 'secrets', 'ssh', 'tags', 'pull', 'no_cache', 'shm_size', 'extra_hosts', 'additional_contexts', 'dockerfile_inline', 'isolation', 'privileged', 'ulimits'].includes(k)) throw new ComposeError(`docker compose：模擬環境不支援 ${path}.build.${k}`);
          throw invalid(`${path}.build additional properties '${k}' not allowed`);
        }
        s.build = { context: at(str(get(bm, 'context'), `${path}.build.context`) ?? '.'), dockerfile: str(get(bm, 'dockerfile'), `${path}.build.dockerfile`) ?? 'Dockerfile',
          args: pairsOf(get(bm, 'args'), `${path}.build.args`, '=').map(([k, x]) => [k, x ?? vars.get(k) ?? '']), ...str(get(bm, 'target'), `${path}.build.target`) ? { target: str(get(bm, 'target'), '')! } : {} };
      }
    }
    if (!s.image && !s.build) throw new ComposeError(`service "${svc}" has neither an image nor a build context specified: invalid compose project`);
    for (const [i, p] of listOf(get(m, 'ports'), `${path}.ports`).entries()) s.ports.push(portOf(p, `${path}.ports.${i}`, invalid));
    // environment (a mapping or KEY=VALUE items) over env_file; a bare KEY takes the shell's value or stays unset.
    const fromFiles: [string, string | null][] = [];
    const ef = get(m, 'env_file');
    for (const f of !ef || ef.t === 'null' ? [] : ef.t === 'str' ? [ef] : listOf(ef, `${path}.env_file`)) {
      const pathText = f.t === 'map' ? str(get(f, 'path'), `${path}.env_file.path`) : str(f, `${path}.env_file`);
      const required = f.t === 'map' ? bool(get(f, 'required'), `${path}.env_file.required`) ?? true : true;
      const abs = at(pathText ?? '');
      const node = state.nodes.get(abs);
      if (node?.kind !== 'file') { if (required) throw new ComposeError(`env file ${abs} not found: stat ${abs}: no such file or directory`); continue; }
      fromFiles.push(...envFile(node.content ?? ''));
    }
    const own = pairsOf(get(m, 'environment'), `${path}.environment`, '=').map(([k, x]): [string, string | null] => [k, x ?? vars.get(k) ?? null]);
    const merged = new Map<string, string | null>([...fromFiles, ...own]);
    s.environment = [...merged];
    for (const [i, x] of listOf(get(m, 'volumes'), `${path}.volumes`).entries()) {
      const vol = volumeOf(x, `${path}.volumes.${i}`, at, invalid);
      if (vol.type === 'volume' && vol.source && !volumes.some(d => d.key === vol.source)) throw new ComposeError(`service "${svc}" refers to undefined volume ${vol.source}: invalid compose project`);
      s.volumes.push(vol);
    }
    const nets = get(m, 'networks');
    if (nets && nets.t === 'seq') s.networks = nets.a.map((x, i) => [str(x, `${path}.networks.${i}`) ?? '', []]);
    else if (nets && nets.t === 'map') s.networks = nets.m.map(([k, x]) => { const nm = mapOf(x, `${path}.networks.${k}`); return [k, listOf(nm && get(nm, 'aliases'), `${path}.networks.${k}.aliases`).map(a => str(a, '') ?? '')]; });
    else if (nets && nets.t !== 'null') throw invalid(`${path}.networks must be a mapping or a list`);
    if (!s.networks.length) s.networks = [['default', []]];
    for (const [n] of s.networks) if (n !== 'default' && !networks0.some(d => d.key === n)) throw new ComposeError(`service "${svc}" refers to undefined network ${n}: invalid compose project`);
    const deps = get(m, 'depends_on');
    if (deps && deps.t === 'seq') s.dependsOn = deps.a.map(x => ({ service: str(x, `${path}.depends_on`) ?? '', condition: 'service_started' as const, required: true, restart: false }));
    else if (deps && deps.t === 'map') s.dependsOn = deps.m.map(([k, x]) => {
      const dm = mapOf(x, `${path}.depends_on.${k}`);
      for (const [kk] of dm?.m ?? []) if (!['condition', 'required', 'restart'].includes(kk)) throw invalid(`${path}.depends_on.${k} additional properties '${kk}' not allowed`);
      const c = str(dm && get(dm, 'condition'), `${path}.depends_on.${k}.condition`) ?? 'service_started';
      if (!CONDITIONS.includes(c as Condition)) throw invalid(`${path}.depends_on.${k}.condition must be one of the following: "service_started", "service_healthy", "service_completed_successfully"`);
      return { service: k, condition: c as Condition, required: bool(dm && get(dm, 'required'), '') ?? true, restart: bool(dm && get(dm, 'restart'), '') ?? false };
    });
    else if (deps && deps.t !== 'null') throw invalid(`${path}.depends_on must be a mapping or a list`);
    const hc = mapOf(get(m, 'healthcheck'), `${path}.healthcheck`);
    if (hc) {
      for (const [k] of hc.m) if (!['test', 'interval', 'timeout', 'retries', 'start_period', 'start_interval', 'disable'].includes(k)) throw invalid(`${path}.healthcheck additional properties '${k}' not allowed`);
      if (bool(get(hc, 'disable'), `${path}.healthcheck.disable`)) s.healthDisabled = true;
      else {
        const t = get(hc, 'test');
        const test = !t || t.t === 'null' ? [] : t.t === 'str' ? ['CMD-SHELL', t.v] : listOf(t, `${path}.healthcheck.test`).map(x => str(x, '') ?? '');
        if (test.length && !['CMD', 'CMD-SHELL', 'NONE'].includes(test[0])) throw new ComposeError(`${path}.healthcheck.test: 模擬環境的 test 是一段文字，或以 CMD、CMD-SHELL、NONE 開頭的清單`);
        const dur = (k: string) => { const x = str(get(hc, k), `${path}.healthcheck.${k}`); if (x === undefined) return 0; const d = parseDuration(x); if (d === null) throw new ComposeError(`services.${svc}.healthcheck.${k}: time: invalid duration "${x}"`); return d; };
        const retries = str(get(hc, 'retries'), `${path}.healthcheck.retries`);
        if (retries !== undefined && !/^\d+$/.test(retries)) throw invalid(`${path}.healthcheck.retries must be a number`);
        s.healthcheck = { test, interval: dur('interval'), timeout: dur('timeout'), retries: Number(retries ?? 0), startPeriod: dur('start_period'), startInterval: dur('start_interval') };
        if (test[0] === 'NONE') s.healthDisabled = true;
      }
    }
    const restart = str(get(m, 'restart'), `${path}.restart`);
    if (restart !== undefined && !/^(no|always|unless-stopped|on-failure(:\d+)?)$/.test(restart)) throw new ComposeError(`invalid restart policy: ${restart}`);
    if (restart !== undefined) s.restart = restart;
    const cmd = words(get(m, 'command'), `${path}.command`), ep = words(get(m, 'entrypoint'), `${path}.entrypoint`);
    if (cmd) s.command = cmd;
    if (ep) s.entrypoint = ep;
    const user = str(get(m, 'user'), `${path}.user`), wd = str(get(m, 'working_dir'), `${path}.working_dir`), cn = str(get(m, 'container_name'), `${path}.container_name`);
    if (user !== undefined) s.user = user;
    if (wd !== undefined) s.workingDir = wd;
    if (cn !== undefined) { if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(cn)) throw invalid(`${path}.container_name does not match pattern`); s.containerName = cn; }
    s.labels = pairsOf(get(m, 'labels'), `${path}.labels`, '=').map(([k, x]) => [k, x ?? '']);
    services.push(s);
  }
  for (const s of services) for (const dep of s.dependsOn) if (!services.some(x => x.name === dep.service)) {
    if (dep.required) throw new ComposeError(`service "${s.name}" depends on undefined service "${dep.service}": invalid compose project`);
  }
  orderOf(services, services.map(s => s.name));
  const used = new Set(services.flatMap(s => s.networks.map(([n]) => n)));
  const networks = [...used.has('default') && !networks0.some(n => n.key === 'default') ? [{ key: 'default', name: `${name}_default`, external: false }] : [], ...networks0];
  return { name, dir, file, services, networks, volumes, warnings };
}

function portOf(p: Y, path: string, invalid: (w: string) => ComposeError): ComposePort {
  if (p.t === 'map') {
    const get = (k: string) => { const v = p.m.find(([x]) => x === k)?.[1]; return v && v.t === 'str' ? v.v : undefined; };
    for (const [k] of p.m) if (!['target', 'published', 'host_ip', 'protocol', 'mode', 'name', 'app_protocol'].includes(k)) throw invalid(`${path} additional properties '${k}' not allowed`);
    const target = Number(get('target')), published = Number(get('published'));
    if (!Number.isInteger(target) || target < 1 || target > 65535) throw invalid(`${path}.target must be a number`);
    if (get('published') === undefined) throw new ComposeError('docker compose：模擬環境需要指定主機的連接埠（published），不會隨機選一個');
    if (!Number.isInteger(published) || published < 1 || published > 65535) throw new ComposeError(`invalid hostPort: ${get('published')}`);
    const proto = get('protocol') ?? 'tcp';
    if (proto !== 'tcp' && proto !== 'udp') throw new ComposeError(`invalid proto: ${proto}`);
    return { target, published, ...get('host_ip') ? { hostIp: get('host_ip') } : {}, protocol: proto };
  }
  if (p.t !== 'str') throw invalid(`${path} must be a string or a number`);
  const m = /^(?:(\d+\.\d+\.\d+\.\d+):)?(\d+):(\d+)(?:\/(tcp|udp))?$/.exec(p.v);
  if (!m) {
    if (/^\d+(\/(tcp|udp))?$/.test(p.v)) throw new ComposeError(`docker compose：模擬環境需要指定主機的連接埠（例如 "8080:${p.v.split('/')[0]}"），不會隨機選一個`);
    if (/-/.test(p.v)) throw new ComposeError(`docker compose：模擬環境不支援連接埠的範圍（${p.v}）`);
    throw new ComposeError(`invalid port: ${p.v}`);
  }
  const published = Number(m[2]), target = Number(m[3]);
  if (published < 1 || published > 65535) throw new ComposeError(`invalid hostPort: ${m[2]}`);
  if (target < 1 || target > 65535) throw new ComposeError(`invalid containerPort: ${m[3]}`);
  return { target, published, ...m[1] ? { hostIp: m[1] } : {}, protocol: (m[4] ?? 'tcp') as 'tcp' | 'udp' };
}
function volumeOf(x: Y, path: string, at: (p: string) => string, invalid: (w: string) => ComposeError): ComposeVolume {
  if (x.t === 'map') {
    const get = (k: string) => { const v = x.m.find(([y]) => y === k)?.[1]; return v && v.t === 'str' ? v.v : undefined; };
    for (const [k] of x.m) if (!['type', 'source', 'target', 'read_only', 'bind', 'volume', 'consistency'].includes(k)) throw invalid(`${path} additional properties '${k}' not allowed`);
    const type = get('type'), target = get('target'), source = get('source') ?? '';
    if (type !== 'volume' && type !== 'bind') throw new ComposeError(`docker compose：模擬環境的 ${path}.type 只支援 volume 與 bind`);
    if (!target?.startsWith('/')) throw invalid(`${path}.target must be an absolute path`);
    return { type, source: type === 'bind' ? at(source) : source, target, readOnly: (get('read_only') ?? 'false').toLowerCase() === 'true' };
  }
  if (x.t !== 'str') throw invalid(`${path} must be a string`);
  const parts = x.v.split(':');
  if (parts.length === 1) { if (!x.v.startsWith('/')) throw new ComposeError(`invalid spec: ${x.v}: invalid volume specification`); return { type: 'volume', source: '', target: x.v, readOnly: false }; }
  if (parts.length > 3) throw new ComposeError(`invalid spec: ${x.v}: too many colons`);
  const [source, target, mode = ''] = parts;
  if (!target.startsWith('/')) throw new ComposeError(`invalid spec: ${x.v}: invalid volume specification`);
  if (mode && !mode.split(',').every(o => ['ro', 'rw', 'z', 'Z'].includes(o))) throw new ComposeError(`invalid spec: ${x.v}: unknown option ${mode}`);
  const bind = source.startsWith('.') || source.startsWith('/') || source.startsWith('~');
  return { type: bind ? 'bind' : 'volume', source: bind ? at(source) : source, target, readOnly: mode.split(',').includes('ro') };
}

/** depends_on's order: dependencies first (by name among equals); a cycle is an error. */
export function orderOf(services: readonly ComposeService[], wanted: readonly string[]): string[] {
  const out: string[] = [], state = new Map<string, 'visiting' | 'done'>();
  const visit = (n: string, chain: string[]) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'visiting') throw new ComposeError(`dependency cycle detected: ${[...chain.slice(chain.indexOf(n)), n].join(' -> ')}`);
    state.set(n, 'visiting');
    const s = services.find(x => x.name === n);
    for (const d of [...s?.dependsOn ?? []].sort((a, b) => a.service < b.service ? -1 : 1)) if (services.some(x => x.name === d.service)) visit(d.service, [...chain, n]);
    state.set(n, 'done');
    out.push(n);
  };
  for (const n of [...wanted].sort()) visit(n, []);
  return out;
}

// ------------------------------------------------------------------------------------------------- docker compose config

const imageNameOf = (p: ComposeProject, s: ComposeService) => s.image ?? `${p.name}-${s.name}`;
/** The project as `docker compose config` prints it (compose-go's canonical form). */
export function configYaml(p: ComposeProject): string[] {
  const services = [...p.services].sort((a, b) => a.name < b.name ? -1 : 1).map(s => {
    const f: [string, Out][] = [];
    if (s.build) f.push(['build', new Pairs([['context', s.build.context], ['dockerfile', s.build.dockerfile], ...s.build.args.length ? [['args', new Pairs(s.build.args)] as [string, Out]] : [], ...s.build.target ? [['target', s.build.target] as [string, Out]] : []])]);
    if (s.command) f.push(['command', s.command]);
    if (s.containerName) f.push(['container_name', s.containerName]);
    if (s.dependsOn.length) f.push(['depends_on', new Pairs([...s.dependsOn].sort((a, b) => a.service < b.service ? -1 : 1).map(d => [d.service, new Pairs([['condition', d.condition], ...d.restart ? [['restart', true] as [string, Out]] : [], ['required', d.required]])])) ]);
    if (s.entrypoint) f.push(['entrypoint', s.entrypoint]);
    if (s.environment.length) f.push(['environment', new Pairs([...s.environment].sort((a, b) => a[0] < b[0] ? -1 : 1))]);
    if (s.healthcheck && !s.healthDisabled) {
      const h = s.healthcheck;
      f.push(['healthcheck', new Pairs([['test', h.test], ...h.timeout ? [['timeout', durationText(h.timeout)] as [string, Out]] : [], ...h.interval ? [['interval', durationText(h.interval)] as [string, Out]] : [],
        ...h.retries ? [['retries', h.retries] as [string, Out]] : [], ...h.startPeriod ? [['start_period', durationText(h.startPeriod)] as [string, Out]] : [], ...h.startInterval ? [['start_interval', durationText(h.startInterval)] as [string, Out]] : []])]);
    } else if (s.healthDisabled) f.push(['healthcheck', new Pairs([['disable', true]])]);
    if (s.image) f.push(['image', s.image]);
    if (s.labels.length) f.push(['labels', new Pairs([...s.labels].sort((a, b) => a[0] < b[0] ? -1 : 1))]);
    f.push(['networks', new Pairs([...s.networks].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([n, aliases]) => [n, aliases.length ? new Pairs([['aliases', aliases]]) : null]))]);
    if (s.ports.length) f.push(['ports', s.ports.map(x => new Pairs([['mode', 'ingress'], ...x.hostIp ? [['host_ip', x.hostIp] as [string, Out]] : [], ['target', x.target], ['published', String(x.published)], ['protocol', x.protocol]]))]);
    if (s.restart) f.push(['restart', s.restart]);
    if (s.user) f.push(['user', s.user]);
    if (s.volumes.length) f.push(['volumes', s.volumes.map(v => new Pairs([['type', v.type], ...v.source ? [['source', v.source] as [string, Out]] : [], ['target', v.target], ...v.readOnly ? [['read_only', true] as [string, Out]] : [],
      ...v.type === 'bind' ? [['bind', new Pairs([['create_host_path', true]])] as [string, Out]] : [['volume', new Pairs([])] as [string, Out]]]))]);
    if (s.workingDir) f.push(['working_dir', s.workingDir]);
    return [s.name, new Pairs(f)] as [string, Out];
  });
  const named = (list: { key: string; name: string; external: boolean }[]) => new Pairs([...list].sort((a, b) => a.key < b.key ? -1 : 1).map(x => [x.key, new Pairs([['name', x.name], ...x.external ? [['external', true] as [string, Out]] : []])]));
  return emitYaml(new Pairs([['name', p.name], ['services', new Pairs(services)], ...p.networks.length ? [['networks', named(p.networks)] as [string, Out]] : [], ...p.volumes.length ? [['volumes', named(p.volumes)] as [string, Out]] : []]));
}

// ------------------------------------------------------------------------------------------------- the project's containers

const LABEL = { project: 'com.docker.compose.project', service: 'com.docker.compose.service', number: 'com.docker.compose.container-number', hash: 'com.docker.compose.config-hash' };
/** The containers of a project (by Compose's labels), in the order they were created. */
export const projectContainers = (d: DockerState, project: string) => d.containers.filter(c => c.labels?.[LABEL.project] === project);
const containerOf = (d: DockerState, project: string, service: string) => projectContainers(d, project).find(c => c.labels?.[LABEL.service] === service);
const containerName = (p: ComposeProject, s: ComposeService) => s.containerName ?? `${p.name}-${s.name}-1`;
/** The name logs and attach use: the container's name without the project's prefix (db-1). */
const shortName = (project: string, c: DockerContainer) => c.name.startsWith(`${project}-`) ? c.name.slice(project.length + 1) : c.name;

/** What decides whether a container must be recreated: the service's configuration and its image. */
const hashOf = (p: ComposeProject, s: ComposeService, imageId: string) => hex(`compose/${JSON.stringify({ ...s, project: p.name, networks: s.networks, imageId })}`);

/** A new container for a service (as docker create would make it): mounts, networks, environment, labels, health check. */
function createContainer(state: FsState, d: DockerState, p: ComposeProject, s: ComposeService, img: DockerImage, now: Seconds): { state: FsState; d: DockerState; c: DockerContainer } {
  const name = containerName(p, s), id = hex(`container/${state.host ?? 'logic-island'}/${d.seq + 1}/${name}/compose`);
  const cmd = s.command ?? (s.entrypoint ? [] : img.cmd), entry = s.entrypoint ?? img.entrypoint;
  const [path0, ...args0] = entry.length ? [...entry, ...cmd] : cmd;
  const mounts: DockerMount[] = s.volumes.map(v => v.type === 'volume'
    ? v.source ? { type: 'volume' as const, source: p.volumes.find(x => x.key === v.source)!.name, target: v.target, readonly: v.readOnly, via: 'mount' as const }
      : { type: 'volume' as const, source: hex(`volume/${id}/${v.target}`), target: v.target, readonly: false, anonymous: true as const, via: 'mount' as const }
    : { type: 'bind' as const, source: v.source, target: v.target, readonly: v.readOnly, via: 'mount' as const });
  mounts.push(...imageVolumes(img, mounts, id));
  const networks = Object.fromEntries(s.networks.map(([key, aliases]) => [p.networks.find(n => n.key === key)!.name, { aliases: [name, s.name, ...aliases] }]));
  const ports: PortBinding[] = s.ports.map(x => ({ hostIp: x.hostIp ?? '0.0.0.0', host: x.published, container: x.target, proto: x.protocol }));
  const health = s.healthDisabled ? undefined : s.healthcheck ? { ...img.healthcheck ?? { test: [], interval: 0, timeout: 0, retries: 0, startPeriod: 0, startInterval: 0 }, ...s.healthcheck, ...s.healthcheck.test.length ? {} : { test: img.healthcheck?.test ?? [] } } : img.healthcheck;
  const labels: Record<string, string> = {
    ...Object.fromEntries(s.labels), [LABEL.hash]: hashOf(p, s, img.id), [LABEL.number]: '1', 'com.docker.compose.depends_on': s.dependsOn.map(x => `${x.service}:${x.condition}:${x.restart}`).join(','),
    'com.docker.compose.image': `sha256:${img.id}`, 'com.docker.compose.oneoff': 'False', [LABEL.project]: p.name, 'com.docker.compose.project.config_files': p.file,
    'com.docker.compose.project.working_dir': p.dir, [LABEL.service]: s.name, 'com.docker.compose.version': COMPOSE_VERSION,
  };
  let c: DockerContainer = {
    id, name, ref: imageNameOf(p, s), image: img.id, path: path0 ?? '', args: args0, cmd, custom: !!s.command || !!s.entrypoint, created: now, status: 'created', exitCode: 0, ports,
    env: s.environment.filter((e): e is [string, string] => e[1] !== null).map(([k, v]) => `${k}=${v}`), workdir: s.workingDir ?? img.workdir, rm: false, tty: false, interactive: false, logs: [],
    nodes: imageNodes(img, id), execs: 0, ...s.user ?? img.user ? { user: s.user ?? img.user } : {}, ...mounts.length ? { mounts } : {}, networks, labels,
    ...activeTest(health) ? { healthcheck: health } : {}, ...s.restart ? { restart: s.restart } : {},
  };
  const m = prepareMounts(state, d, c, now);
  c = m.c;
  return { state: m.host, d: { ...m.d, seq: m.d.seq + 1, containers: [...m.d.containers, c] }, c };
}

// ------------------------------------------------------------------------------------------------- docker compose

interface Ctx { x: ComposeCli; state: FsState; p: ComposeProject; quiet: boolean; event(id: string, status: string): void }

/** docker compose [-f FILE] [-p NAME] [--project-directory DIR] [--env-file FILE] [--progress plain|quiet] COMMAND … */
export function composeCommand(x: ComposeCli): Result {
  const { io } = x;
  let file: string | undefined, name: string | undefined, envFile: string | undefined, dir: string | undefined, quiet = false, i = 0;
  const args = x.args;
  for (; i < args.length && args[i].startsWith('-'); i++) {
    const a = args[i], long = /^(--[a-z-]+)=(.*)$/.exec(a), flag = long ? long[1] : a, value = () => long ? long[2] : args[++i];
    if (flag === '-f' || flag === '--file') file = value();
    else if (flag === '-p' || flag === '--project-name') name = value();
    else if (flag === '--env-file') envFile = value();
    else if (flag === '--project-directory') dir = value();
    else if (flag === '--progress') { const v = value(); if (v === 'quiet') quiet = true; else if (!['plain', 'auto', 'tty'].includes(v ?? '')) { io.err(`unsupported --progress value "${v}"`); return { state: x.state, status: 1 }; } }
    else if (flag === '--ansi') value();
    else if (flag === '-v' || flag === '--version') { io.out(`Docker Compose version v${COMPOSE_VERSION}`); return { state: x.state, status: 0 }; }
    else { io.err(flag.startsWith('--') ? `unknown flag: ${flag}` : `unknown shorthand flag: '${flag[1]}' in ${flag}`); return { state: x.state, status: 1 }; }
  }
  const sub = args[i], rest = args.slice(i + 1);
  if (!sub) {
    ['', 'Usage:  docker compose [OPTIONS] COMMAND', '', 'Define and run multi-container applications with Docker', '', 'Commands:',
      ...([['build', 'Build or rebuild services'], ['config', 'Parse, resolve and render compose file in canonical format'], ['down', 'Stop and remove containers, networks'], ['exec', 'Execute a command in a running container'],
        ['logs', 'View output from containers'], ['ls', 'List running compose projects'], ['ps', 'List containers'], ['pull', 'Pull service images'], ['restart', 'Restart service containers'],
        ['start', 'Start services'], ['stop', 'Stop services'], ['up', 'Create and start containers'], ['version', 'Show the Docker Compose version information']] as const).map(([c, t]) => `  ${c.padEnd(12)}${t}`),
      '', '（模擬環境只支援上面這些子指令）'].forEach(io.out);
    return { state: x.state, status: 0 };
  }
  if (sub === 'version') { io.out(`Docker Compose version v${COMPOSE_VERSION}`); return { state: x.state, status: 0 }; }
  const KNOWN = ['up', 'down', 'ps', 'logs', 'exec', 'build', 'config', 'restart', 'stop', 'start', 'pull', 'ls'];
  if (!KNOWN.includes(sub)) {
    if (['run', 'rm', 'create', 'kill', 'pause', 'unpause', 'top', 'events', 'port', 'push', 'cp', 'images', 'wait', 'watch', 'scale', 'attach', 'stats', 'alpha', 'commit', 'export', 'volumes'].includes(sub)) io.err(`docker compose ${sub}：模擬環境不支援（支援 ${KNOWN.join('、')}）`);
    else { io.err(`unknown docker command: "compose ${sub}"`); }
    return { state: x.state, status: 1 };
  }
  if (sub !== 'config' && !x.allowed) { io.err(x.denied); return { state: x.state, status: 1 }; }
  if (sub === 'ls') return lsCommand(x, rest);
  let state = settleDocker(x.state);
  let p: ComposeProject;
  try {
    const base = dir !== undefined ? { ...state, cwd: resolvePath(state, dir) } : state;
    p = loadProject(base, { ...file !== undefined ? { file } : {}, ...name !== undefined ? { name } : {}, ...envFile !== undefined ? { envFile } : {} }, w => io.err(`WARN[0000] ${w}`));
  } catch (e) {
    if (e instanceof ComposeError) { io.err(e.message); return { state, status: e.status }; }
    throw e;
  }
  const ctx: Ctx = { x, state, p, quiet, event: (id, status) => { if (!quiet) io.err(` ${id}  ${status}`); } };
  try {
    const status = (() => {
      switch (sub) {
        case 'config': return configCommand(ctx, rest);
        case 'up': return upCommand(ctx, rest);
        case 'down': return downCommand(ctx, rest);
        case 'ps': return psCommand(ctx, rest);
        case 'logs': return logsCommand(ctx, rest);
        case 'exec': return execCommand(ctx, rest);
        case 'build': return buildCommand(ctx, rest);
        case 'pull': return pullCommand(ctx, rest);
        default: return lifecycleCommand(ctx, sub as 'start' | 'stop' | 'restart', rest);
      }
    })();
    state = ctx.state;
    return { state, status };
  } catch (e) {
    if (e instanceof ComposeError) { io.err(e.message); return { state: ctx.state, status: e.status }; }
    throw e;
  }
}

/** Options of a subcommand (flags without a value, flags with one) and the other words. */
function opts(c: Ctx, sub: string, args: readonly string[], flags: readonly string[], valued: readonly string[]): { set: Set<string>; values: Record<string, string>; words: string[] } {
  const set = new Set<string>(), values: Record<string, string> = {}, words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i], eq = a.startsWith('--') ? a.indexOf('=') : -1, nm = eq < 0 ? a : a.slice(0, eq);
    if (words.length && sub === 'exec') { words.push(a); continue; }
    if (valued.includes(nm)) { values[nm] = eq < 0 ? args[++i] ?? '' : a.slice(eq + 1); continue; }
    if (flags.includes(a)) { set.add(a); continue; }
    if (/^-[a-zA-Z]{2,}$/.test(a) && [...a.slice(1)].every(ch => flags.includes(`-${ch}`))) { [...a.slice(1)].forEach(ch => set.add(`-${ch}`)); continue; }
    if (a.startsWith('-') && a !== '-') throw new ComposeError(a.startsWith('--') ? `unknown flag: ${nm}` : `unknown shorthand flag: '${a[1]}' in ${a}`);
    words.push(a);
  }
  return { set, values, words };
}
/** The services a command names (all when none), checked against the project. */
function selected(c: Ctx, names: readonly string[]): string[] {
  for (const n of names) if (!c.p.services.some(s => s.name === n)) throw new ComposeError(`no such service: ${n}`);
  return names.length ? [...names] : c.p.services.map(s => s.name);
}
const service = (c: Ctx, n: string) => c.p.services.find(s => s.name === n)!;
const dOf = (c: Ctx) => c.state.docker!;
const nowOf = (c: Ctx) => clockOf(c.state).now;
const put = (c: Ctx, d: DockerState) => { c.state = syncDocker({ ...c.state, docker: d }); };
const replace = (d: DockerState, x: DockerContainer): DockerState => ({ ...d, containers: d.containers.map(y => y.id === x.id ? x : y) });

function configCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'config', args, ['-q', '--quiet', '--services', '--volumes', '--images', '--no-interpolate', '--resolve-image-digests', '--no-normalize'], ['--format', '-o', '--output']);
  if (o.values['--format'] !== undefined && o.values['--format'] !== 'yaml') throw new ComposeError('docker compose config：模擬環境只輸出 YAML（--format yaml）');
  if (o.values['-o'] !== undefined || o.values['--output'] !== undefined) throw new ComposeError('docker compose config：模擬環境不支援 -o（請用重新導向 > 檔案）');
  if (o.set.has('-q') || o.set.has('--quiet')) return 0;
  if (o.set.has('--services')) { c.p.services.map(s => s.name).sort().forEach(c.x.io.out); return 0; }
  if (o.set.has('--volumes')) { c.p.volumes.map(v => v.key).forEach(c.x.io.out); return 0; }
  if (o.set.has('--images')) { c.p.services.map(s => imageNameOf(c.p, s)).forEach(c.x.io.out); return 0; }
  configYaml(c.p).forEach(c.x.io.out);
  return 0;
}

/** Builds a service's image (BuildKit's plain progress on standard error) and tags it with the service's image name. */
function buildService(c: Ctx, s: ComposeService): void {
  const b = s.build!, ref = parseRef(imageNameOf(c.p, s))!, d = dOf(c);
  const r = build(c.state, d, { tags: [ref], file: b.dockerfile.startsWith('/') ? b.dockerfile : `${b.context === '/' ? '' : b.context}/${b.dockerfile}`, context: b.context, args: Object.fromEntries(b.args),
    noCache: false, ...b.target ? { target: b.target } : {}, quiet: false, storageNet: true, compose: true }, { out: () => undefined, err: l => c.x.io.err(l) }, hooksOf(d));
  put(c, r.state.docker!);
  if (r.status !== 0) throw new ComposeError(`failed to solve: 建置服務 ${s.name} 失敗（見上面的 ERROR）`);
  c.event(`Service ${s.name}`, 'Built');
}
/** The image a service runs: built (when it has build and the image is missing, or --build), else pulled when missing. */
function ensureImage(c: Ctx, s: ComposeService, rebuild: boolean): void {
  const named = imageNameOf(c.p, s), ref = parseRef(named), have = ref ? localImage(dOf(c), ref) : named.includes('@') ? findLocal(dOf(c), named) : undefined;
  if (!ref && !named.includes('@')) throw new ComposeError(/[A-Z]/.test(named) ? `invalid reference format: repository name (${named}) must be lowercase` : 'invalid reference format');
  if (s.build && (rebuild || !have)) { buildService(c, s); return; }
  if (have || !s.image) return;
  c.event(s.name, 'Pulling');
  const r = pullAny(c.state, dOf(c), s.image, c.x.io.user, nowOf(c));
  if ('error' in r) { c.event(s.name, 'Error'); throw new ComposeError(r.error); }
  put(c, r.d);
  c.event(s.name, 'Pulled');
}
const imageOfService = (c: Ctx, s: ComposeService) => { const named = imageNameOf(c.p, s), ref = parseRef(named); return ref ? localImage(dOf(c), ref) : named.includes('@') ? findLocal(dOf(c), named) : undefined; };

/** Creates the networks and volumes a set of services needs (external ones must exist). */
function ensureResources(c: Ctx, names: readonly string[]): void {
  const wantNets = new Set(names.flatMap(n => service(c, n).networks.map(([k]) => k))), wantVols = new Set(names.flatMap(n => service(c, n).volumes.filter(v => v.type === 'volume' && v.source).map(v => v.source)));
  for (const n of c.p.networks.filter(x => wantNets.has(x.key))) {
    const d = dOf(c);
    if ((d.networks ?? []).some(x => x.name === n.name)) continue;
    if (n.external) throw new ComposeError(`network ${n.name} declared as external, but could not be found`);
    if (!NETWORK_NAME.test(n.name)) throw new ComposeError(`invalid network name ${n.name}`);
    c.event(`Network ${n.name}`, 'Creating');
    const next = nextSubnet(d);
    if (!next) throw new ComposeError('Error response from daemon: could not find an available, non-overlapping IPv4 address pool among the defaults to assign to the network');
    const net: DockerNetwork = { name: n.name, id: hex(`network/${n.name}/${nowOf(c)}/${(d.networks ?? []).length}`), driver: 'bridge', subnet: next.subnet, gateway: next.gateway, created: nowOf(c) };
    put(c, { ...d, networks: [...d.networks ?? [], net] });
    c.event(`Network ${n.name}`, 'Created');
  }
  for (const v of c.p.volumes.filter(x => wantVols.has(x.key))) {
    const d = dOf(c);
    if ((d.volumes ?? []).some(x => x.name === v.name)) continue;
    if (v.external) throw new ComposeError(`external volume "${v.name}" not found`);
    c.event(`Volume "${v.name}"`, 'Creating');
    const nodes = new Map<string, FsNode>(c.state.nodes);
    ensureVolumeDir(nodes, v.name);
    c.state = { ...c.state, nodes };
    put(c, { ...d, volumes: [...d.volumes ?? [], { name: v.name, created: nowOf(c) }] });
    c.event(`Volume "${v.name}"`, 'Created');
  }
}

/** Stops a running container (SIGTERM, as docker stop). */
function stopContainer(c: Ctx, x: DockerContainer, events = true): void {
  const d = dOf(c), cur = d.containers.find(y => y.id === x.id)!;
  if (cur.status !== 'running') return;
  if (events) c.event(`Container ${cur.name}`, 'Stopping');
  put(c, replace(d, stop(cur, imageById(d, cur.image), nowOf(c))));
  if (events) c.event(`Container ${cur.name}`, 'Stopped');
}
function removeContainer(c: Ctx, x: DockerContainer, volumes: boolean): void {
  const d = dOf(c), cur = d.containers.find(y => y.id === x.id)!;
  c.event(`Container ${cur.name}`, 'Removing');
  let next: DockerState = { ...d, containers: d.containers.filter(y => y.id !== cur.id) };
  if (volumes) { const r = dropAnonymous(c.state, next, cur); c.state = r.state; next = r.d; }
  put(c, next);
  c.event(`Container ${cur.name}`, 'Removed');
}
/** Starts a created or stopped container; a daemon error (a port taken, a missing executable) ends the command. */
function startContainer(c: Ctx, x: DockerContainer): void {
  const d = dOf(c), cur = d.containers.find(y => y.id === x.id)!;
  c.event(`Container ${cur.name}`, 'Starting');
  c.state = syncDocker(c.state);
  const s = start(c.state, dOf(c), cur, nowOf(c));
  if ('error' in s) { put(c, replace(dOf(c), s.c)); c.event(`Container ${cur.name}`, 'Error'); throw new ComposeError(s.error); }
  if (s.hostNodes) c.state = { ...c.state, nodes: s.hostNodes };
  let next = replace(dOf(c), s.c);
  if (s.logs) next = withLogs(next, s.logs);
  put(c, next);
  c.event(`Container ${cur.name}`, 'Started');
}

/**
 * Waits for a dependency (depends_on's condition): healthy, or exited with 0. Time passes — the clock moves to each next
 * health probe (or to the end of a sleep) — until it is decided, as docker compose up blocks until then.
 */
function waitFor(c: Ctx, dep: ComposeService, condition: Condition): void {
  if (condition === 'service_started') return;
  const x0 = containerOf(dOf(c), c.p.name, dep.name);
  if (!x0) return;
  c.event(`Container ${x0.name}`, 'Waiting');
  for (let n = 0; n < 2000; n++) {
    c.state = settleDocker(c.state);
    const x = dOf(c).containers.find(y => y.id === x0.id);
    if (!x) throw new ComposeError(`dependency failed to start: container ${x0.name} was removed`);
    if (condition === 'service_healthy') {
      if (!x.healthcheck) { c.event(`Container ${x.name}`, 'Error'); throw new ComposeError(`dependency failed to start: container ${x.name} has no healthcheck configured`); }
      if (x.status !== 'running') { c.event(`Container ${x.name}`, 'Error'); throw new ComposeError(`dependency failed to start: container ${x.name} exited (${x.exitCode})`); }
      if (x.health?.status === 'healthy') { c.event(`Container ${x.name}`, 'Healthy'); return; }
      if (x.health?.status === 'unhealthy') { c.event(`Container ${x.name}`, 'Error'); throw new ComposeError(`dependency failed to start: container ${x.name} is unhealthy`); }
      c.state = advanceClock(c.state, Math.max(0, (x.health?.next ?? nowOf(c) + 1) - nowOf(c)));
      continue;
    }
    if (x.status === 'exited') {
      if (x.exitCode === 0) { c.event(`Container ${x.name}`, 'Exited'); return; }
      c.event(`Container ${x.name}`, 'Error');
      throw new ComposeError(`service "${dep.name}" didn't complete successfully: exit ${x.exitCode}`);
    }
    if (x.status !== 'running' || x.endsAt === undefined) throw new ComposeError(`（模擬環境：服務 ${dep.name} 的容器一直在執行，不會結束；service_completed_successfully 等不到它完成）`);
    c.state = advanceClock(c.state, Math.max(0, x.endsAt - nowOf(c)));
  }
  throw new ComposeError(`（模擬環境：等了 ${humanDuration(2000)} 以上，服務 ${dep.name} 仍沒有結果）`);
}

/** Starts the services in depends_on's order, each after its dependencies' conditions hold. */
function startAll(c: Ctx, names: readonly string[], restart = false): void {
  for (const n of orderOf(c.p.services, names)) {
    if (!names.includes(n)) continue;
    const s = service(c, n), x = containerOf(dOf(c), c.p.name, n);
    if (!x || (x.status === 'running' && !restart)) continue;
    for (const dep of s.dependsOn) if (c.p.services.some(y => y.name === dep.service)) waitFor(c, service(c, dep.service), dep.condition);
    if (restart && x.status === 'running') { c.event(`Container ${x.name}`, 'Restarting'); stopContainer(c, x, false); c.state = syncDocker(c.state); const s2 = start(c.state, dOf(c), dOf(c).containers.find(y => y.id === x.id)!, nowOf(c)); if ('error' in s2) throw new ComposeError(s2.error); put(c, replace(dOf(c), s2.c)); c.event(`Container ${x.name}`, 'Started'); continue; }
    startContainer(c, x);
  }
}

function upCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'up', args, ['-d', '--detach', '--build', '--no-build', '--remove-orphans', '--wait', '--no-start', '--force-recreate', '--no-recreate', '--no-deps', '--abort-on-container-exit'], ['--timeout', '-t', '--scale', '--pull']);
  if (o.values['--scale'] !== undefined) throw new ComposeError('docker compose up：模擬環境每個服務只有一個容器（不支援 --scale）');
  if (o.set.has('--abort-on-container-exit')) throw new ComposeError('docker compose up：模擬環境不支援 --abort-on-container-exit');
  const detach = o.set.has('-d') || o.set.has('--detach'), names0 = selected(c, o.words);
  const names = o.set.has('--no-deps') ? names0 : orderOf(c.p.services, names0);
  // Images first (built or pulled), then networks and volumes, then containers, then starting them.
  for (const n of names) if (!o.set.has('--no-build') || !service(c, n).build) ensureImage(c, service(c, n), o.set.has('--build'));
  for (const n of names) if (!imageOfService(c, service(c, n))) throw new ComposeError(`service "${n}" has no image to run（模擬環境：請先 docker compose build 或拿掉 --no-build）`);
  ensureResources(c, names);
  const orphans = projectContainers(dOf(c), c.p.name).filter(x => !c.p.services.some(s => s.name === x.labels?.[LABEL.service]));
  if (orphans.length && !o.set.has('--remove-orphans')) c.x.io.err(`WARN[0000] Found orphan containers ([${orphans.map(x => x.name).join(' ')}]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.`);
  for (const x of o.set.has('--remove-orphans') ? orphans : []) { stopContainer(c, x); removeContainer(c, x, false); }
  for (const n of orderOf(c.p.services, names)) {
    if (!names.includes(n)) continue;
    const s = service(c, n), img = imageOfService(c, s)!, old = containerOf(dOf(c), c.p.name, n), name = containerName(c.p, s);
    const clash = dOf(c).containers.find(y => y.name === name && y.labels?.[LABEL.project] !== c.p.name);
    if (clash) throw new ComposeError(`Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${clash.id}". You have to remove (or rename) that container to be able to reuse that name.`);
    if (old && (o.set.has('--no-recreate') || (old.labels?.[LABEL.hash] === hashOf(c.p, s, img.id) && !o.set.has('--force-recreate')))) { if (old.status === 'running') c.event(`Container ${old.name}`, 'Running'); continue; }
    if (old) {
      c.event(`Container ${old.name}`, 'Recreate');
      stopContainer(c, old, false);
      const d = dOf(c);
      put(c, { ...d, containers: d.containers.filter(y => y.id !== old.id) });
      const r = createContainer(c.state, dOf(c), c.p, s, img, nowOf(c));
      c.state = r.state; put(c, r.d);
      c.event(`Container ${name}`, 'Recreated');
      continue;
    }
    c.event(`Container ${name}`, 'Creating');
    const r = createContainer(c.state, dOf(c), c.p, s, img, nowOf(c));
    c.state = r.state; put(c, r.d);
    c.event(`Container ${name}`, 'Created');
  }
  if (o.set.has('--no-start')) return 0;
  startAll(c, names);
  if (o.set.has('--wait')) for (const n of names) { const s = service(c, n); const x = containerOf(dOf(c), c.p.name, n); if (x?.healthcheck) waitFor(c, s, 'service_healthy'); }
  if (detach) return 0;
  // Attached: the containers' output, prefixed with their names, as it was printed; the simulation has no Ctrl-C.
  const list = names.map(n => containerOf(dOf(c), c.p.name, n)!).filter(Boolean).sort((a, b) => a.name < b.name ? -1 : 1);
  c.x.io.out(`Attaching to ${list.map(x => shortName(c.p.name, x)).join(', ')}`);
  printLogs(c, list, { stamps: false, prefix: true });
  for (const x of list) if (x.status === 'exited') c.x.io.out(`${shortName(c.p.name, x)} exited with code ${x.exitCode}`);
  if (list.some(x => dOf(c).containers.find(y => y.id === x.id)?.status === 'running')) c.x.io.err('（模擬環境沒有 Ctrl-C：服務留在背景繼續執行；通常用 docker compose up -d 在背景啟動，再用 docker compose logs 看輸出）');
  return 0;
}

function downCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'down', args, ['-v', '--volumes', '--remove-orphans'], ['--rmi', '-t', '--timeout']);
  if (o.values['--rmi'] !== undefined) throw new ComposeError('docker compose down：模擬環境不支援 --rmi（請另外用 docker rmi）');
  if (o.words.length) throw new ComposeError('docker compose down：模擬環境的 down 移除整個專案（不接受服務名稱）');
  const volumes = o.set.has('-v') || o.set.has('--volumes');
  const order = orderOf(c.p.services, c.p.services.map(s => s.name)).reverse();
  const mine = projectContainers(dOf(c), c.p.name);
  const list = [...order.map(n => mine.find(x => x.labels?.[LABEL.service] === n)).filter((x): x is DockerContainer => !!x), ...o.set.has('--remove-orphans') ? mine.filter(x => !order.includes(x.labels?.[LABEL.service] ?? '')) : []];
  const nets = c.p.networks.filter(n => !n.external && (dOf(c).networks ?? []).some(x => x.name === n.name));
  const vols = volumes ? c.p.volumes.filter(v => !v.external && (dOf(c).volumes ?? []).some(x => x.name === v.name)) : [];
  if (!list.length && !nets.length && !vols.length) { c.x.io.err(`WARN[0000] Warning: No resource found to remove for project "${c.p.name}".`); return 0; }
  for (const x of list) stopContainer(c, x);
  for (const x of list) removeContainer(c, x, volumes);
  for (const v of vols) {
    const users = dOf(c).containers.filter(x => (x.mounts ?? []).some(m => m.type === 'volume' && m.source === v.name));
    c.event(`Volume ${v.name}`, 'Removing');
    if (users.length) { c.event(`Volume ${v.name}`, 'Error'); throw new ComposeError(`Error response from daemon: remove ${v.name}: volume is in use - [${users.map(u => u.id).join(', ')}]`); }
    const nodes = new Map(c.state.nodes);
    removeVolumeDir(nodes, v.name);
    c.state = { ...c.state, nodes };
    put(c, { ...dOf(c), volumes: (dOf(c).volumes ?? []).filter(x => x.name !== v.name) });
    c.event(`Volume ${v.name}`, 'Removed');
  }
  for (const n of nets) {
    const active = dOf(c).containers.filter(x => x.status === 'running' && x.networks?.[n.name] !== undefined);
    c.event(`Network ${n.name}`, 'Removing');
    if (active.length) { c.event(`Network ${n.name}`, 'Error'); throw new ComposeError(`Error response from daemon: error while removing network: network ${n.name} has active endpoints (${active.map(x => `name:"${x.name}" id:"${short(x.id)}"`).join(', ')})`); }
    put(c, { ...dOf(c), networks: (dOf(c).networks ?? []).filter(x => x.name !== n.name) });
    c.event(`Network ${n.name}`, 'Removed');
  }
  return 0;
}

function psCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'ps', args, ['-a', '--all', '-q', '--quiet', '--services', '--no-trunc'], ['--format', '--status', '--filter']);
  const names = selected(c, o.words), d = dOf(c), now = nowOf(c), all = o.set.has('-a') || o.set.has('--all');
  const list = projectContainers(d, c.p.name).filter(x => names.includes(x.labels?.[LABEL.service] ?? '') && (all || x.status === 'running') && (o.values['--status'] === undefined || x.status === o.values['--status']))
    .sort((a, b) => a.name < b.name ? -1 : 1);
  if (o.values['--filter'] !== undefined) throw new ComposeError('docker compose ps：模擬環境不支援 --filter（請用 --status）');
  if (o.set.has('--services')) { list.map(x => x.labels![LABEL.service]).forEach(c.x.io.out); return 0; }
  if (o.set.has('-q') || o.set.has('--quiet')) { list.forEach(x => c.x.io.out(o.set.has('--no-trunc') ? x.id : short(x.id))); return 0; }
  const rows = list.map(x => {
    const img = imageById(d, x.image), cmd = [x.path, ...x.args].join(' ');
    return { Name: x.name, Image: x.ref, Command: goQuote(o.set.has('--no-trunc') ? cmd : ellipsis(cmd, 20)), Service: x.labels![LABEL.service], RunningFor: `${humanDuration(now - x.created)} ago`,
      CreatedAt: `${isoText(x.created)} +0000 UTC`, Status: statusText(x, now), Ports: displayPorts(x, img), State: x.status, Health: x.status === 'running' ? x.health?.status ?? '' : '', ExitCode: String(x.exitCode),
      ID: short(x.id), Project: c.p.name };
  });
  const headers = { Name: 'NAME', Image: 'IMAGE', Command: 'COMMAND', Service: 'SERVICE', RunningFor: 'CREATED', CreatedAt: 'CREATED AT', Status: 'STATUS', Ports: 'PORTS', State: 'STATE', Health: 'HEALTH', ExitCode: 'EXIT CODE', ID: 'CONTAINER ID', Project: 'PROJECT' };
  const fmt = o.values['--format'];
  if (fmt === 'json') throw new ComposeError('docker compose ps：模擬環境的 --format 只支援 table 與 {{.欄位}}');
  const r = formatted(fmt ?? 'table {{.Name}}\t{{.Image}}\t{{.Command}}\t{{.Service}}\t{{.RunningFor}}\t{{.Status}}\t{{.Ports}}', rows, headers);
  if ('error' in r) throw new ComposeError(r.error);
  r.lines.forEach(c.x.io.out);
  return 0;
}

/** The containers' log lines in time order, each prefixed with its name (padded to the longest) and " | ". */
function printLogs(c: Ctx, list: readonly DockerContainer[], o: { stamps: boolean; prefix: boolean; tail?: number }): void {
  const d = dOf(c), cs = list.map(x => d.containers.find(y => y.id === x.id) ?? x);
  const width = Math.max(0, ...cs.map(x => shortName(c.p.name, x).length));
  const lines = cs.flatMap((x, k) => (o.tail === undefined ? x.logs : o.tail === 0 ? [] : x.logs.slice(-o.tail)).map((l, j) => ({ l, k, j, x })));
  lines.sort((a, b) => a.l.t - b.l.t || a.k - b.k || a.j - b.j);
  for (const { l, x } of lines) {
    const text = `${o.prefix ? `${shortName(c.p.name, x).padEnd(width + 1)} | ` : ''}${o.stamps ? `${isoText(l.t).replace(' ', 'T')}.000000000Z ` : ''}${l.text}`;
    if (l.stream === 1) c.x.io.out(text); else c.x.io.err(text);
  }
}
function logsCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'logs', args, ['-f', '--follow', '-t', '--timestamps', '--no-log-prefix', '--no-color'], ['--tail', '-n', '--since', '--until', '--index']);
  if (o.values['--since'] !== undefined || o.values['--until'] !== undefined) throw new ComposeError('docker compose logs：模擬環境不支援 --since 與 --until');
  const tailText = o.values['--tail'] ?? o.values['-n'];
  if (tailText !== undefined && tailText !== 'all' && !/^\d+$/.test(tailText)) throw new ComposeError(`invalid argument "${tailText}" for "-n, --tail" flag: strconv.ParseInt: parsing "${tailText}": invalid syntax`);
  const names = selected(c, o.words);
  const list = projectContainers(dOf(c), c.p.name).filter(x => names.includes(x.labels?.[LABEL.service] ?? '')).sort((a, b) => a.name < b.name ? -1 : 1);
  printLogs(c, list, { stamps: o.set.has('-t') || o.set.has('--timestamps'), prefix: !o.set.has('--no-log-prefix'), ...tailText !== undefined && tailText !== 'all' ? { tail: Number(tailText) } : {} });
  if ((o.set.has('-f') || o.set.has('--follow')) && list.some(x => x.status === 'running')) c.x.io.err('（模擬環境：-f 不會持續等待新的輸出；服務繼續執行，需要時再執行一次 docker compose logs）');
  return 0;
}

function execCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'exec', args, ['-T', '--no-TTY', '-d', '--detach', '--privileged', '-i', '--interactive', '-t', '--tty'], ['-u', '--user', '-w', '--workdir', '-e', '--env', '--index']);
  if (o.set.has('-d') || o.set.has('--detach')) throw new ComposeError('docker compose exec：模擬環境一律在前景執行（不支援 -d）');
  if (o.words.length < 2) throw new ComposeError(`"docker compose exec" requires at least 2 arguments.\nSee 'docker compose exec --help'.\n\nUsage:  docker compose exec [OPTIONS] SERVICE COMMAND [ARGS...]\n\nExecute a command in a running container`);
  const [svc, ...cmd] = o.words;
  if (!c.p.services.some(s => s.name === svc)) throw new ComposeError(`service "${svc}" is not running`);
  const x = containerOf(dOf(c), c.p.name, svc);
  if (!x || x.status !== 'running') throw new ComposeError(`service "${svc}" is not running`);
  const flags = [...o.set.has('-T') || o.set.has('--no-TTY') ? [] : ['-t'], ...o.values['-u'] ?? o.values['--user'] ? ['-u', o.values['-u'] ?? o.values['--user']] : [],
    ...o.values['-w'] ?? o.values['--workdir'] ? ['-w', o.values['-w'] ?? o.values['--workdir']] : [], ...o.values['-e'] ?? o.values['--env'] ? ['-e', o.values['-e'] ?? o.values['--env']] : []];
  const io = c.x.io;
  const r = docker(c.state, ['exec', ...flags, x.name, ...cmd], { out: data => io.raw(data), err: io.err, user: io.user, tty: io.tty, stdin: io.stdin, images: true, storageNet: true, compose: true });
  c.state = r.state;
  return r.status;
}

function buildCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'build', args, ['--no-cache', '-q', '--quiet', '--pull'], ['--build-arg']);
  if (o.set.has('--no-cache') || o.set.has('--pull') || o.values['--build-arg'] !== undefined) throw new ComposeError('docker compose build：模擬環境不支援 --no-cache、--pull 與 --build-arg（請寫在 build.args）');
  for (const n of selected(c, o.words)) { const s = service(c, n); if (s.build) buildService(c, s); }
  return 0;
}
function pullCommand(c: Ctx, args: readonly string[]): number {
  const o = opts(c, 'pull', args, ['-q', '--quiet', '--ignore-pull-failures', '--include-deps'], []);
  let status = 0;
  for (const n of selected(c, o.words)) {
    const s = service(c, n);
    if (!s.image) { c.event(n, 'Skipped - No image to be pulled'); continue; }
    c.event(n, 'Pulling');
    const r = pullAny(c.state, dOf(c), s.image, c.x.io.user, nowOf(c));
    if ('error' in r) { c.event(n, 'Error'); c.x.io.err(r.error); status = 1; if (!o.set.has('--ignore-pull-failures')) return 1; continue; }
    put(c, r.d);
    c.event(n, 'Pulled');
  }
  return status;
}
function lifecycleCommand(c: Ctx, sub: 'start' | 'stop' | 'restart', args: readonly string[]): number {
  const o = opts(c, sub, args, [], ['-t', '--timeout']);
  const names = selected(c, o.words);
  const mine = names.map(n => containerOf(dOf(c), c.p.name, n)).filter((x): x is DockerContainer => !!x);
  if (!mine.length) throw new ComposeError(sub === 'stop' ? `no container found for project "${c.p.name}"` : 'no containers to start');
  if (sub === 'stop') { for (const n of orderOf(c.p.services, names).reverse()) { const x = containerOf(dOf(c), c.p.name, n); if (x && names.includes(n)) stopContainer(c, x); } return 0; }
  startAll(c, names, sub === 'restart');
  return 0;
}
/** docker compose ls: the projects of the daemon's containers and their states. */
function lsCommand(x: ComposeCli, args: readonly string[]): Result {
  const all = args.includes('-a') || args.includes('--all'), bad = args.find(a => a.startsWith('-') && !['-a', '--all'].includes(a));
  if (bad) { x.io.err(`unknown flag: ${bad}`); return { state: x.state, status: 1 }; }
  const state = settleDocker(x.state), d = state.docker!;
  const names = [...new Set(d.containers.map(c => c.labels?.[LABEL.project]).filter((n): n is string => !!n))].sort();
  const rows: string[][] = [['NAME', 'STATUS', 'CONFIG FILES']];
  for (const n of names) {
    const cs = projectContainers(d, n), counts = new Map<string, number>();
    for (const c of cs) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    if (!all && !counts.get('running')) continue;
    rows.push([n, [...counts].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([s, k]) => `${s}(${k})`).join(', '), cs[0].labels?.['com.docker.compose.project.config_files'] ?? '']);
  }
  tabwrite(rows).forEach(l => x.io.out(l.replace(/\s+$/, '')));
  return { state, status: 0 };
}

/** E23 (checks): the container of a project's service. */
export function composeContainer(d: DockerState, project: string, svc: string): DockerContainer | undefined { return containerOf(d, project, svc); }