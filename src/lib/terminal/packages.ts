import { LIMITS, parentOf, type FsNode, type FsState } from './fs';
import { segmentRegExp } from './glob';
import { setUpUnits, stopUnits, type SysIo } from './services';
import { getopt } from './text';

/*
 * Engine stage E5 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §13): Debian/Ubuntu package management as data — apt
 * (update, install, remove, purge, autoremove, upgrade, list, show, policy), apt-mark (hold, unhold, showhold, auto,
 * manual) and dpkg (-l, -L, -s). A machine has repositories, the packages they offer (name, version, dependencies, the
 * files they install) and what is installed. Nothing is downloaded: installing writes the package's declared files (a
 * binary, a unit file, a configuration file) so later lessons can find them, and E6 enables and starts a unit a package
 * installs, as Debian's maintainer scripts do. dnf is described in the lesson text only (§13.4).
 */

export interface Repository { name: string; url: string; suite: string; components: readonly string[]; enabled: boolean }
/** A file a package installs (root's); one under /etc is a configuration file (kept by remove, deleted by purge). */
export interface PackageFile { path: string; kind: 'dir' | 'file' | 'link'; mode: number; content?: string; target?: string }
export interface PackageDef {
  name: string;
  version: string;
  /** The repository (by name) that offers this version. */
  repo: string;
  component?: string;
  /** all, or the machine's architecture (default). */
  arch?: string;
  section?: string;
  description: string;
  depends: readonly string[];
  files: readonly PackageFile[];
  /** A security update (shown by apt show; the lesson explains unattended-upgrades). */
  security?: boolean;
}
export interface InstalledPackage { name: string; version: string; auto?: boolean; /** rc: removed, its configuration files remain. */ config?: boolean }
export interface PackageDb {
  repositories: readonly Repository[];
  available: readonly PackageDef[];
  installed: readonly InstalledPackage[];
  holds: readonly string[];
  /** Whether the package lists are current (false: a fresh machine that never ran apt update sees no package). */
  current: boolean;
}

export const PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]+$/;
export const PACKAGE_VERSION = /^(?:\d+:)?\d[A-Za-z0-9.+~-]*$/;

// ------------------------------------------------------------------------------------------------------- versions

const order = (c: string | undefined) => c === undefined || /\d/.test(c) ? 0 : /[A-Za-z]/.test(c) ? c.charCodeAt(0) : c === '~' ? -1 : c.charCodeAt(0) + 256;
/** dpkg's verrevcmp: non-digit runs by the modified ASCII order (~ before everything, letters before other signs), digit runs numerically. */
function verrevcmp(a: string, b: string): number {
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    let first = 0;
    while ((i < a.length && !/\d/.test(a[i])) || (j < b.length && !/\d/.test(b[j]))) {
      const x = order(a[i]), y = order(b[j]);
      if (x !== y) return x - y;
      i++; j++;
    }
    while (a[i] === '0') i++;
    while (b[j] === '0') j++;
    while (i < a.length && /\d/.test(a[i]) && j < b.length && /\d/.test(b[j])) { if (!first) first = a.charCodeAt(i) - b.charCodeAt(j); i++; j++; }
    if (i < a.length && /\d/.test(a[i])) return 1;
    if (j < b.length && /\d/.test(b[j])) return -1;
    if (first) return first;
  }
  return 0;
}
/** Debian version order: epoch, then upstream version, then revision (1.2-1 < 1.2-1ubuntu1 < 1.2-1ubuntu1.1; 1.0~rc1 < 1.0). */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const colon = v.indexOf(':'), epoch = colon > 0 ? Number(v.slice(0, colon)) : 0, rest = colon > 0 ? v.slice(colon + 1) : v, dash = rest.lastIndexOf('-');
    return { epoch, upstream: dash >= 0 ? rest.slice(0, dash) : rest, revision: dash >= 0 ? rest.slice(dash + 1) : '' };
  };
  const x = split(a), y = split(b);
  return Math.sign(x.epoch - y.epoch || verrevcmp(x.upstream, y.upstream) || verrevcmp(x.revision, y.revision));
}

// --------------------------------------------------------------------------------------------------------- helpers

const EMPTY: PackageDb = { repositories: [], available: [], installed: [], holds: [], current: true };
export const dbOf = (state: Pick<FsState, 'packages'>): PackageDb => state.packages ?? EMPTY;
const repoOf = (db: PackageDb, def: PackageDef) => db.repositories.find(r => r.name === def.repo);
/** The versions apt can see: those of enabled repositories, once the lists are current. */
const visible = (db: PackageDb) => db.current ? db.available.filter(d => repoOf(db, d)?.enabled) : [];
/** The newest visible version of a package. */
export function candidate(db: PackageDb, name: string): PackageDef | undefined {
  return visible(db).filter(d => d.name === name).sort((a, b) => compareVersions(b.version, a.version))[0];
}
/** The installed (ii) entry of a package. */
export const installedOf = (db: PackageDb, name: string) => db.installed.find(p => p.name === name && !p.config);
/** The definition of a version (from any repository, enabled or not), for its files. */
const defOf = (db: PackageDb, name: string, version: string) => db.available.find(d => d.name === name && d.version === version);
const known = (db: PackageDb, name: string) => !!installedOf(db, name) || visible(db).some(d => d.name === name);
const debArch = (state: FsState) => ({ x86_64: 'amd64', aarch64: 'arm64', armv7l: 'armhf' } as Record<string, string>)[state.system?.machine ?? 'x86_64'] ?? 'amd64';
const archOf = (state: FsState, def: PackageDef | undefined) => def?.arch ?? debArch(state);
const isConffile = (path: string) => path.startsWith('/etc/');
const UNIT_FILE = /^\/(?:etc|usr\/lib|lib)\/systemd\/system\/([^/]+\.service)$/;
const debName = (state: FsState, def: PackageDef) => `${def.name}_${def.version.replace(/^\d+:/, '')}_${archOf(state, def)}.deb`;
/** The suites that offer this version: noble-updates,noble-security. */
const suitesOf = (db: PackageDb, name: string, version: string) => visible(db).filter(d => d.name === name && d.version === version).map(d => repoOf(db, d)!.suite).join(',');
/** Installed packages that apt upgrade would upgrade (or keep back when held). */
const upgradable = (db: PackageDb) => db.installed.filter(p => { if (p.config) return false; const c = candidate(db, p.name); return !!c && compareVersions(c.version, p.version) > 0; });

/** Wraps a package list the way apt prints it (two spaces in, at most 80 columns). */
function wrap(names: readonly string[]): string[] {
  const lines: string[] = [];
  let line = ' ';
  for (const n of names) {
    if (line.length + 1 + n.length > 80 && line.trim()) { lines.push(line); line = ' '; }
    line += ` ${n}`;
  }
  if (line.trim()) lines.push(line);
  return lines;
}
const section = (io: SysIo, title: string, names: readonly string[]) => { if (names.length) { io.out(title); wrap([...names].sort()).forEach(l => io.out(l)); } };
const reading = (io: SysIo) => { io.out('Reading package lists... Done'); io.out('Building dependency tree... Done'); io.out('Reading state information... Done'); };

/** Writes a package's files (folders on the way are created root:root 0755); an existing configuration file is kept. */
function writeFiles(nodes: Map<string, FsNode>, def: PackageDef) {
  for (const f of def.files) {
    const chain: string[] = [];
    for (let q = parentOf(f.path); q !== '/' && !nodes.has(q); q = parentOf(q)) chain.unshift(q);
    for (const q of chain) nodes.set(q, { kind: 'dir', mode: 0o755, owner: 'root' });
    if (f.kind === 'dir') { if (!nodes.has(f.path)) nodes.set(f.path, { kind: 'dir', mode: f.mode, owner: 'root' }); continue; }
    if (f.kind === 'file' && isConffile(f.path) && nodes.get(f.path)?.kind === 'file') continue;
    nodes.set(f.path, f.kind === 'link' ? { kind: 'link', mode: 0o777, owner: 'root', target: f.target ?? '' } : { kind: 'file', mode: f.mode, owner: 'root', content: f.content ?? '' });
  }
}
/** Deletes a package's files (configuration files too when purging; folders it lists when they are empty). */
function deleteFiles(nodes: Map<string, FsNode>, def: PackageDef | undefined, purge: boolean, keep: ReadonlySet<string> = new Set()) {
  if (!def) return;
  for (const f of [...def.files].reverse()) {
    if (keep.has(f.path) || (isConffile(f.path) && !purge)) continue;
    if (f.kind !== 'dir') { nodes.delete(f.path); continue; }
    if (purge && ![...nodes.keys()].some(p => p.startsWith(`${f.path}/`))) nodes.delete(f.path);
  }
}

/** Whether a package (or what depends on it) is still needed by a manually installed package. */
function needed(db: PackageDb, installed: readonly InstalledPackage[]): Set<string> {
  const keep = new Set<string>();
  const visit = (name: string) => {
    if (keep.has(name)) return;
    keep.add(name);
    const p = installed.find(q => q.name === name && !q.config);
    for (const dep of (p && defOf(db, p.name, p.version)?.depends) ?? []) if (installed.some(q => q.name === dep && !q.config)) visit(dep);
  };
  installed.filter(p => !p.config && !p.auto).forEach(p => visit(p.name));
  return keep;
}

// -------------------------------------------------------------------------------------------------------------- apt

const LOCK = ['E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)', 'E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?'];
const UNMET = ['Some packages could not be installed. This may mean that you have', 'requested an impossible situation or if you are using the unstable',
  'distribution that some required packages have not yet been created', 'or been moved out of Incoming.', 'The following information may help to resolve the situation:', '',
  'The following packages have unmet dependencies:'];

interface Step { def: PackageDef; from?: string; auto: boolean }

/**
 * apt update|install|remove|purge|autoremove|upgrade|full-upgrade|list|show|policy. Changes need root (else the lock
 * errors and status 100). apt asks "Do you want to continue? [Y/n]" when it installs more than was asked for, removes,
 * downgrades or upgrades; the simulation has no keyboard, so without -y it answers like a closed input: Abort.
 */
export function apt(state: FsState, args: readonly string[], io: SysIo): { state: FsState; status: number } {
  const o = getopt(args, 'yqa', { yes: 'y', 'assume-yes': 'y', quiet: 'q', 'allow-downgrades': '\x01', 'allow-change-held-packages': '\x02', installed: '\x03', upgradable: '\x04', 'no-install-recommends': '\x05', purge: '\x06', 'all-versions': 'a' });
  if ('error' in o) {
    const short = /^invalid option -- '(.)'$/.exec(o.error)?.[1], long = /'(--[^'=]+)/.exec(o.error)?.[1];
    io.err(short ? `E: Command line option '${short}' [from -${short}] is not understood in combination with the other options.` : `E: Command line option ${long ?? o.error} is not understood in combination with the other options`);
    return { state, status: 100 };
  }
  const [verb, ...names] = o.operands;
  if (!io.tty) { io.err(''); io.err('WARNING: apt does not have a stable CLI interface. Use with caution in scripts.'); io.err(''); }
  if (!verb) {
    ['apt 2.7.14 (amd64)', 'Usage: apt [options] command', '', 'Most used commands:', '  list - list packages based on package names', '  show - show package details',
      '  install - install packages', '  remove - remove packages', '  autoremove - automatically remove all unused packages', '  update - update list of available packages',
      '  upgrade - upgrade the system by installing/upgrading packages', '  full-upgrade - upgrade the system by removing/installing/upgrading packages', '  policy - show policy settings'].forEach(l => io.out(l));
    return { state, status: 1 };
  }
  const db = dbOf(state), root = io.user === 'root', yes = o.flags.has('y');
  const changes = ['update', 'install', 'remove', 'purge', 'autoremove', 'upgrade', 'full-upgrade'];
  if (changes.includes(verb) && !root) {
    if (verb === 'update') { io.err('E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)'); io.err('E: Unable to lock directory /var/lib/apt/lists/'); }
    else LOCK.forEach(l => io.err(l));
    return { state, status: 100 };
  }
  const notUpgraded = (planned: ReadonlySet<string>) => upgradable(db).filter(p => !planned.has(p.name)).length;
  const summary = (up: number, fresh: number, down: number, remove: number, planned: ReadonlySet<string>) =>
    io.out(`${up} upgraded, ${fresh} newly installed, ${down ? `${down} downgraded, ` : ''}${remove} to remove and ${notUpgraded(planned)} not upgraded.`);
  const abort = () => { io.out('Do you want to continue? [Y/n] Abort.'); return { state, status: 1 }; };

  switch (verb) {
    case 'update': {
      db.repositories.filter(r => r.enabled).forEach((r, i) => io.out(`${db.current ? 'Hit' : 'Get'}:${i + 1} ${r.url} ${r.suite} InRelease`));
      const next = { ...db, current: true };
      reading(io);
      const n = upgradable(next).length;
      io.out(n ? `${n} package${n === 1 ? ' can be upgraded. Run \'apt list --upgradable\' to see it.' : 's can be upgraded. Run \'apt list --upgradable\' to see them.'}` : 'All packages are up to date.');
      return { state: { ...state, packages: next }, status: 0 };
    }
    case 'install': case 'upgrade': case 'full-upgrade': {
      const plan = new Map<string, Step>(), orderOf: string[] = [], unmet: [string, string][] = [];
      const want = (def: PackageDef, auto: boolean) => {
        if (plan.has(def.name)) return;
        const inst = installedOf(db, def.name);
        plan.set(def.name, { def, ...inst ? { from: inst.version } : {}, auto: inst ? !!inst.auto && auto : auto });
        for (const dep of def.depends) {
          if (installedOf(db, dep) || plan.has(dep)) continue;
          const c = candidate(db, dep);
          if (!c) unmet.push([def.name, dep]); else want(c, true);
        }
        orderOf.push(def.name);
      };
      const manual: string[] = [];
      reading(io);
      let kept: string[] = [];
      if (verb === 'install') {
        if (!names.length) { summary(0, 0, 0, 0, new Set()); return { state, status: 0 }; }
        for (const spec of names) {
          if (spec.endsWith('.deb')) { io.err(`E: 模擬環境不安裝 .deb 檔案（${spec}）：請從套件庫安裝`); return { state, status: 100 }; }
          const [name, version] = spec.split('=');
          const inst = installedOf(db, name);
          let def: PackageDef | undefined;
          if (version !== undefined) {
            def = visible(db).find(d => d.name === name && d.version === version);
            if (!def) { io.err(known(db, name) ? `E: Version '${version}' for '${name}' was not found` : `E: Unable to locate package ${name}`); return { state, status: 100 }; }
          } else {
            def = candidate(db, name);
            if (!def && !inst) { io.err(`E: Unable to locate package ${name}`); return { state, status: 100 }; }
          }
          if (inst && (!def || compareVersions(def.version, inst.version) === 0)) {
            io.out(`${name} is already the newest version (${inst.version}).`);
            if (inst.auto) { io.out(`${name} set to manually installed.`); manual.push(name); }
            continue;
          }
          want(def!, false);
        }
      } else {
        io.out('Calculating upgrade... Done');
        for (const p of upgradable(db)) {
          if (db.holds.includes(p.name)) { kept.push(p.name); continue; }
          want(candidate(db, p.name)!, !!p.auto);
        }
      }
      if (unmet.length) {
        UNMET.forEach(l => io.out(l));
        unmet.forEach(([pkg, dep]) => io.out(` ${pkg} : Depends: ${dep} but it is not installable`));
        io.err('E: Unable to correct problems, you have held broken packages.');
        return { state, status: 100 };
      }
      const steps = orderOf.map(n => plan.get(n)!);
      const fresh = steps.filter(s => !s.from), ups = steps.filter(s => s.from && compareVersions(s.def.version, s.from) > 0), downs = steps.filter(s => s.from && compareVersions(s.def.version, s.from) < 0);
      const requested = new Set(names.map(n => n.split('=')[0]));
      const extras = verb === 'install' ? fresh.filter(s => !requested.has(s.def.name)).map(s => s.def.name) : [];
      const held = steps.filter(s => s.from && db.holds.includes(s.def.name)).map(s => s.def.name);
      kept = kept.sort();
      section(io, 'The following packages have been kept back:', kept);
      section(io, 'The following additional packages will be installed:', extras);
      section(io, 'The following held packages will be changed:', held);
      section(io, 'The following NEW packages will be installed:', fresh.map(s => s.def.name));
      section(io, 'The following packages will be upgraded:', ups.map(s => s.def.name));
      section(io, 'The following packages will be DOWNGRADED:', downs.map(s => s.def.name));
      summary(ups.length, fresh.length, downs.length, 0, new Set(steps.map(s => s.def.name)));
      const base = manual.length ? { ...db, installed: db.installed.map(p => manual.includes(p.name) ? { ...p, auto: false } : p) } : db;
      if (!steps.length) return { state: manual.length ? { ...state, packages: base } : state, status: 0 };
      if (held.length && yes && !o.flags.has('\x02')) { io.err('E: Held packages were changed and -y was used without --allow-change-held-packages.'); return { state, status: 100 }; }
      if (downs.length && yes && !o.flags.has('\x01')) { io.err('E: Packages were downgraded and -y was used without --allow-downgrades.'); return { state, status: 100 }; }
      const asks = verb !== 'install' || extras.length > 0 || downs.length > 0 || held.length > 0;
      if (asks && !yes) return abort();
      const nodes = new Map(state.nodes);
      for (const s of steps) {
        const old = s.from ? defOf(db, s.def.name, s.from) : undefined;
        if (!s.from) io.out(`Selecting previously unselected package ${s.def.name}.`);
        io.out(`Preparing to unpack .../${debName(state, s.def)} ...`);
        io.out(s.from ? `Unpacking ${s.def.name} (${s.def.version}) over (${s.from}) ...` : `Unpacking ${s.def.name} (${s.def.version}) ...`);
        deleteFiles(nodes, old, false, new Set(s.def.files.map(f => f.path)));
        writeFiles(nodes, s.def);
      }
      if (nodes.size > LIMITS.nodes) { io.err(`E: 模擬環境的檔案數上限是 ${LIMITS.nodes}，無法安裝`); return { state, status: 100 }; }
      const installed = [...base.installed.filter(p => !plan.has(p.name)), ...steps.map(s => ({ name: s.def.name, version: s.def.version, ...s.auto ? { auto: true } : {} }))]
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      let next: FsState = { ...state, nodes, packages: { ...base, installed } };
      for (const s of steps) {
        io.out(`Setting up ${s.def.name} (${s.def.version}) ...`);
        if (!s.from) next = setUpUnits(next, s.def.files.map(f => UNIT_FILE.exec(f.path)?.[1]).filter((u): u is string => !!u), io.out);
      }
      return { state: next, status: 0 };
    }
    case 'remove': case 'purge': case 'autoremove': {
      const purge = verb === 'purge' || o.flags.has('\x06');
      reading(io);
      const gone = new Set<string>(), purgeOnly: string[] = [];
      if (verb !== 'autoremove') {
        for (const name of names) {
          if (!known(db, name) && !db.installed.some(p => p.name === name)) { io.err(`E: Unable to locate package ${name}`); return { state, status: 100 }; }
          if (installedOf(db, name)) { gone.add(name); continue; }
          if (purge && db.installed.some(p => p.name === name && p.config)) { purgeOnly.push(name); continue; }
          io.out(`Package '${name}' is not installed, so not removed`);
        }
        // What depends on a removed package goes too.
        let grew = true;
        while (grew) {
          grew = false;
          for (const p of db.installed) {
            if (p.config || gone.has(p.name)) continue;
            if ((defOf(db, p.name, p.version)?.depends ?? []).some(d => gone.has(d))) { gone.add(p.name); grew = true; }
          }
        }
      }
      const remaining = db.installed.filter(p => !gone.has(p.name));
      const keep = needed(db, remaining);
      const unused = remaining.filter(p => !p.config && p.auto && !keep.has(p.name)).map(p => p.name);
      if (verb === 'autoremove') unused.forEach(n => gone.add(n));
      else if (unused.length) {
        section(io, 'The following packages were automatically installed and are no longer required:', unused);
        io.out(`Use 'sudo apt autoremove' to remove ${unused.length === 1 ? 'it' : 'them'}.`);
      }
      const list = [...gone, ...purgeOnly].sort();
      section(io, 'The following packages will be REMOVED:', list.map(n => purge ? `${n}*` : n));
      summary(0, 0, 0, list.length, new Set());
      if (!list.length) return { state, status: 0 };
      const held = [...gone].filter(n => db.holds.includes(n));
      if (held.length) {
        section(io, 'The following held packages will be changed:', held);
        if (yes && !o.flags.has('\x02')) { io.err('E: Held packages were changed and -y was used without --allow-change-held-packages.'); return { state, status: 100 }; }
      }
      if (!yes) return abort();
      // Dependents first, as dpkg removes them.
      const byDeps = [...gone].sort((a, b) => {
        const da = defOf(db, a, installedOf(db, a)!.version)?.depends ?? [], dbb = defOf(db, b, installedOf(db, b)!.version)?.depends ?? [];
        return da.includes(b) ? -1 : dbb.includes(a) ? 1 : a < b ? -1 : 1;
      });
      const units = byDeps.flatMap(n => defOf(db, n, installedOf(db, n)!.version)?.files.map(f => UNIT_FILE.exec(f.path)?.[1]).filter((u): u is string => !!u) ?? []);
      let next = stopUnits(state, units);
      const nodes = new Map(next.nodes);
      for (const n of byDeps) {
        const p = installedOf(db, n)!;
        io.out(`Removing ${n} (${p.version}) ...`);
        deleteFiles(nodes, defOf(db, n, p.version), purge);
      }
      for (const n of [...(purge ? byDeps : []), ...purgeOnly]) {
        const p = db.installed.find(q => q.name === n)!;
        io.out(`Purging configuration files for ${n} (${p.version}) ...`);
        deleteFiles(nodes, defOf(db, n, p.version), true);
      }
      const installed = db.installed.flatMap(p => {
        if (purgeOnly.includes(p.name)) return [];
        if (!gone.has(p.name)) return [p];
        const conf = !purge && (defOf(db, p.name, p.version)?.files ?? []).some(f => f.kind === 'file' && isConffile(f.path));
        return conf ? [{ name: p.name, version: p.version, config: true }] : [];
      });
      next = { ...next, nodes, packages: { ...db, installed, holds: db.holds.filter(h => !gone.has(h)) } };
      return { state: next, status: 0 };
    }
    case 'list': {
      io.out('Listing... Done');
      const patterns = names.map(n => segmentRegExp(n));
      const all = [...new Set([...visible(db).map(d => d.name), ...db.installed.map(p => p.name)])].sort().filter(n => !patterns.length || patterns.some(re => re.test(n)));
      for (const name of all) {
        const inst = installedOf(db, name), rc = db.installed.find(p => p.name === name && p.config), cand = candidate(db, name);
        const newer = !!inst && !!cand && compareVersions(cand.version, inst.version) > 0;
        if (o.flags.has('\x04') && !newer) continue;
        if (o.flags.has('\x03') && !inst) continue;
        const arch = archOf(state, cand ?? (inst ? defOf(db, name, inst.version) : undefined));
        if (inst && newer && !o.flags.has('\x03')) { io.out(`${name}/${suitesOf(db, name, cand.version)} ${cand.version} ${arch} [upgradable from: ${inst.version}]`); continue; }
        if (inst) {
          const suites = suitesOf(db, name, inst.version);
          const tags = ['installed', ...inst.auto ? ['automatic'] : [], ...!suites ? ['local'] : [], ...newer ? [`upgradable to: ${cand.version}`] : []];
          io.out(`${name}/${suites ? `${suites},now` : 'now'} ${inst.version} ${arch} [${tags.join(',')}]`);
          continue;
        }
        const version = cand?.version ?? rc!.version;
        io.out(`${name}/${cand ? suitesOf(db, name, cand.version) : 'now'} ${version} ${arch}${rc ? ' [residual-config]' : ''}`);
      }
      return { state, status: 0 };
    }
    case 'show': {
      if (!names.length) { io.err('E: No packages found'); return { state, status: 100 }; }
      let status = 0;
      for (const name of names) {
        const inst = installedOf(db, name), def = candidate(db, name) ?? (inst ? defOf(db, name, inst.version) : undefined);
        if (!def) { io.err(`N: Unable to locate package ${name}`); io.err('E: No packages found'); status = 100; continue; }
        const repo = repoOf(db, def), local = !visible(db).includes(def);
        io.out(`Package: ${def.name}`);
        io.out(`Version: ${def.version}`);
        io.out('Priority: optional');
        if (def.section) io.out(`Section: ${def.section}`);
        if (def.depends.length) io.out(`Depends: ${def.depends.join(', ')}`);
        if (inst && inst.version === def.version) io.out(`APT-Manual-Installed: ${inst.auto ? 'no' : 'yes'}`);
        io.out(`APT-Sources: ${local || !repo ? '/var/lib/dpkg/status' : `${repo.url} ${repo.suite}/${def.component ?? repo.components[0]} ${archOf(state, def)} Packages`}`);
        io.out(`Description: ${def.description}`);
        io.out('');
      }
      return { state, status };
    }
    case 'policy': {
      if (!names.length) { io.err('模擬環境：請指定套件，例如 apt policy nginx'); return { state, status: 1 }; }
      for (const name of names) {
        const inst = installedOf(db, name), cand = candidate(db, name), defs = visible(db).filter(d => d.name === name);
        if (!inst && !defs.length) { io.out(`N: Unable to locate package ${name}`); continue; }
        io.out(`${name}:`);
        io.out(`  Installed: ${inst?.version ?? '(none)'}`);
        io.out(`  Candidate: ${cand?.version ?? '(none)'}`);
        io.out('  Version table:');
        const versions = [...new Set([...defs.map(d => d.version), ...inst ? [inst.version] : []])].sort((a, b) => compareVersions(b, a));
        for (const v of versions) {
          const sources = defs.filter(d => d.version === v);
          io.out(`${inst?.version === v ? ' *** ' : '     '}${v} ${sources.length ? 500 : 100}`);
          for (const d of sources) { const r = repoOf(db, d)!; io.out(`        500 ${r.url} ${r.suite}/${d.component ?? r.components[0]} ${archOf(state, d)} Packages`); }
          if (inst?.version === v) io.out('        100 /var/lib/dpkg/status');
        }
      }
      return { state, status: 0 };
    }
    default:
      io.err(`E: Invalid operation ${verb}`);
      return { state, status: 100 };
  }
}

/** apt-mark hold|unhold|showhold|auto|manual package…: holds keep a package at its version (apt upgrade keeps it back). */
export function aptMark(state: FsState, args: readonly string[], io: SysIo): { state: FsState; status: number } {
  const [verb, ...names] = args, db = dbOf(state);
  if (verb === 'showhold') { [...db.holds].sort().forEach(n => io.out(n)); return { state, status: 0 }; }
  if (!verb || !['hold', 'unhold', 'auto', 'manual'].includes(verb)) {
    io.err(verb ? `E: Invalid operation ${verb}` : 'Usage: apt-mark [options] {auto|manual} pkg1 [pkg2 ...]');
    return { state, status: 100 };
  }
  if (!names.length) { io.err('E: No packages found'); return { state, status: 100 }; }
  if (io.user !== 'root') {
    if (verb === 'hold' || verb === 'unhold') { io.err('dpkg: error: requested operation requires superuser privilege'); io.err('E: Executing dpkg failed. Are you root?'); }
    else io.err('E: Could not create temporary file for /var/lib/apt/extended_states - mkstemp (13: Permission denied)');
    return { state, status: 100 };
  }
  const missing = names.find(n => !known(db, n));
  if (missing) { io.err(`E: Unable to locate package ${missing}`); return { state, status: 100 }; }
  let holds = [...db.holds], installed = [...db.installed];
  for (const name of names) {
    if (verb === 'hold') { if (holds.includes(name)) io.out(`${name} was already set on hold.`); else { holds.push(name); io.out(`${name} set on hold.`); } continue; }
    if (verb === 'unhold') { if (!holds.includes(name)) io.out(`${name} was already not on hold.`); else { holds = holds.filter(h => h !== name); io.out(`Canceled hold on ${name}.`); } continue; }
    const p = installedOf(db, name);
    if (!p) { io.out(`${name} can not be marked as it is not installed.`); continue; }
    const auto = verb === 'auto';
    if (!!p.auto === auto) io.out(`${name} was already set to ${auto ? 'automatically' : 'manually'} installed.`);
    else { installed = installed.map(q => q === p ? { ...q, auto } : q); io.out(`${name} set to ${auto ? 'automatically' : 'manually'} installed.`); }
  }
  return { state: { ...state, packages: { ...db, holds, installed } }, status: 0 };
}

/** dpkg -l [pattern…], dpkg -L package, dpkg -s package (the database only; dpkg -i is not simulated). */
export function dpkg(state: FsState, args: readonly string[], io: SysIo): number {
  const [action, ...names] = args, db = dbOf(state);
  const all = (p: InstalledPackage) => defOf(db, p.name, p.version);
  if (action === '-l' || action === '--list') {
    const patterns = names.map(n => segmentRegExp(n));
    const rows = db.installed.filter(p => !patterns.length || patterns.some(re => re.test(p.name)));
    for (const n of names) if (!db.installed.some(p => segmentRegExp(n).test(p.name))) { io.err(`dpkg-query: no packages found matching ${n}`); }
    if (!rows.length) return 1;
    const cells = rows.map(p => [p.config ? 'rc' : db.holds.includes(p.name) ? 'hi' : 'ii', p.name, p.version, archOf(state, all(p)), all(p)?.description ?? '']);
    const w = [14, 12, 12, 11].map((min, i) => Math.max(min, ...cells.map(c => c[i + 1].length)));
    io.out('Desired=Unknown/Install/Remove/Purge/Hold');
    io.out('| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend');
    io.out('|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)');
    io.out(`||/ ${'Name'.padEnd(w[0])} ${'Version'.padEnd(w[1])} ${'Architecture'.padEnd(w[2])} Description`);
    io.out(`+++-${w.map(n => '='.repeat(n)).join('-')}`);
    for (const c of cells) io.out(`${c[0]}  ${c[1].padEnd(w[0])} ${c[2].padEnd(w[1])} ${c[3].padEnd(w[2])} ${c[4]}`);
    return names.some(n => !db.installed.some(p => segmentRegExp(n).test(p.name))) ? 1 : 0;
  }
  if (action === '-L' || action === '--listfiles' || action === '-s' || action === '--status') {
    if (!names.length) { io.err(`dpkg-query: error: --${action === '-L' || action === '--listfiles' ? 'listfiles' : 'status'} needs at least one package name argument`); return 2; }
    let status = 0;
    for (const name of names) {
      const p = db.installed.find(q => q.name === name);
      if (!p || (p.config && (action === '-L' || action === '--listfiles'))) {
        io.err(`dpkg-query: package '${name}' is not installed${action === '-L' || action === '--listfiles' ? '' : ' and no information is available'}`);
        if (action === '-L' || action === '--listfiles') io.err('Use dpkg --contents (= dpkg-deb --contents) to list archive files contents.');
        status = 1; continue;
      }
      const def = all(p);
      if (action === '-s' || action === '--status') {
        io.out(`Package: ${name}`);
        io.out(`Status: ${p.config ? 'deinstall ok config-files' : `${db.holds.includes(name) ? 'hold' : 'install'} ok installed`}`);
        io.out(`Version: ${p.version}`);
        if (def?.depends.length) io.out(`Depends: ${def.depends.join(', ')}`);
        io.out(`Description: ${def?.description ?? ''}`);
        continue;
      }
      const files = def?.files ?? [], dirs = new Set<string>();
      for (const f of files) for (let q = parentOf(f.path); q !== '/'; q = parentOf(q)) dirs.add(q);
      io.out('/.');
      [...new Set([...dirs, ...files.map(f => f.path)])].sort().forEach(path => io.out(path));
    }
    return status;
  }
  if (action === '-i' || action === '--install') { io.err('dpkg: 模擬環境不安裝 .deb 檔案；請用 apt install 從套件庫安裝'); return 2; }
  io.err(action ? `dpkg: error: unknown option ${action}` : 'dpkg: error: need an action option');
  io.err('');
  io.err('Type dpkg --help for help about installing and deinstalling packages [*];');
  io.err("Use 'apt' or 'aptitude' for user-friendly package management;");
  return 2;
}
