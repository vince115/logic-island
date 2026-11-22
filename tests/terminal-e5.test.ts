import { describe, expect, it } from 'vitest';
import { initialState, type FsState } from '@/lib/terminal/fs';
import { SYSTEM_MANUAL } from '@/lib/terminal/manual';
import { compareVersions } from '@/lib/terminal/packages';
import { E5_COMMANDS, PACKAGES_PROFILE, PROCESSES_PROFILE, run, USERS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, describeCheck, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { htopExercise, pkgContent, pkgMachine, pkgPackages, securityExercise } from './support/terminal-fixture';

/*
 * Engine stage E5 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §13): the packages profile — repositories and package
 * lists, apt (update, install with dependencies, remove, purge, autoremove, upgrade, list, show, policy), holds, version
 * pinning and downgrades, dpkg's view, Debian version order, and the package check of lessons.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, PACKAGES_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const web = (...commands: string[]) => session(pkgMachine, ...commands);
const out = (...commands: string[]) => web(...commands).last.out;
const err = (...commands: string[]) => web(...commands).last.err;
const status = (...commands: string[]) => web(...commands).state.status;
const installed = (s: FsState) => (s.packages?.installed ?? []).map(p => `${p.config ? 'rc' : 'ii'} ${p.name} ${p.version}${p.auto ? ' auto' : ''}`);
const READING = ['Reading package lists... Done', 'Building dependency tree... Done', 'Reading state information... Done'];
const problems = (edit: (c: TerminalLessonContent) => void) => { const c = pkgContent(); edit(c); return terminalContentProblems(c).join('\n'); };

describe('the packages profile', () => {
  it('is the processes profile plus apt, apt-mark and dpkg', () => {
    expect([...PACKAGES_PROFILE.commands].sort()).toEqual([...PROCESSES_PROFILE.commands, ...E5_COMMANDS].sort());
    expect(PACKAGES_PROFILE.features).toEqual([...PROCESSES_PROFILE.features!, 'packages']);
    expect(profileOf(pkgMachine)).toBe(PACKAGES_PROFILE);
    for (const cmd of E5_COMMANDS) {
      expect(run(initialState(), `${cmd} list`, PROCESSES_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(run(initialState(), `${cmd} list`, USERS_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${SYSTEM_MANUAL[cmd].usage}`);
    }
  });
});

describe('Debian versions', () => {
  it('compare like dpkg', () => {
    const sorted = ['1.0~rc1', '1.0', '1.0-1', '1.0-1ubuntu1', '1.0-1ubuntu1.1', '1.0-1ubuntu1.10', '1.0a', '1.2', '1.10', '1:0.9'];
    for (let i = 1; i < sorted.length; i++) expect(compareVersions(sorted[i - 1], sorted[i]), `${sorted[i - 1]} < ${sorted[i]}`).toBe(-1);
    expect(compareVersions('1.24.0-2ubuntu7.1', '1.24.0-2ubuntu7')).toBe(1);
    expect(compareVersions('3.0.13-0ubuntu3.4', '3.0.13-0ubuntu3.4')).toBe(0);
    expect(compareVersions('2.0-1', '02.0-1')).toBe(0);
  });
});

describe('apt', () => {
  it('needs root to change anything', () => {
    expect(err('apt install htop')).toEqual(['E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)', 'E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?']);
    expect(err('apt update')).toEqual(['E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)', 'E: Unable to lock directory /var/lib/apt/lists/']);
    expect(status('apt remove curl')).toBe(100);
    expect(web('apt install htop').state.packages).toEqual(machineState(pkgMachine).packages);
  });
  it('updates the lists, and a machine that never did sees no package until then', () => {
    expect(out('sudo apt update')).toEqual([
      'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease', 'Hit:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease', 'Hit:3 http://security.ubuntu.com/ubuntu noble-security InRelease',
      ...READING, "2 packages can be upgraded. Run 'apt list --upgradable' to see them.",
    ]);
    const fresh: TerminalMachine = { ...pkgMachine, packages: { ...pkgPackages, stale: true } };
    expect(session(fresh, 'sudo apt install -y htop').last.err).toEqual(['E: Unable to locate package htop']);
    expect(session(fresh, 'apt list --upgradable').last.out).toEqual(['Listing... Done']);
    const updated = session(fresh, 'sudo apt update', 'sudo apt install -y htop');
    expect(updated.log[0].out[0]).toBe('Get:1 http://archive.ubuntu.com/ubuntu noble InRelease');
    expect(installed(updated.state)).toContain('ii htop 3.3.0-4build1');
    const one: TerminalMachine = { ...pkgMachine, packages: { ...pkgPackages, installed: [{ name: 'openssl', version: '3.0.13-0ubuntu3' }] } };
    expect(session(one, 'sudo apt update').last.out.at(-1)).toBe("1 package can be upgraded. Run 'apt list --upgradable' to see it.");
    expect(session(one, 'sudo apt upgrade -y', 'sudo apt update').last.out.at(-1)).toBe('All packages are up to date.');
  });
  it('installs a package with its dependencies, asking first when more is installed than was asked for', () => {
    const plan = [...READING, 'The following additional packages will be installed:', '  nginx-common', 'The following NEW packages will be installed:', '  nginx nginx-common',
      '0 upgraded, 2 newly installed, 0 to remove and 2 not upgraded.'];
    expect(out('sudo apt install nginx')).toEqual([...plan, 'Do you want to continue? [Y/n] Abort.']);
    expect(status('sudo apt install nginx')).toBe(1);
    const r = web('sudo apt install -y nginx');
    expect(r.last.out).toEqual([...plan,
      'Selecting previously unselected package nginx-common.', 'Preparing to unpack .../nginx-common_1.24.0-2ubuntu7.1_all.deb ...', 'Unpacking nginx-common (1.24.0-2ubuntu7.1) ...',
      'Selecting previously unselected package nginx.', 'Preparing to unpack .../nginx_1.24.0-2ubuntu7.1_amd64.deb ...', 'Unpacking nginx (1.24.0-2ubuntu7.1) ...',
      'Setting up nginx-common (1.24.0-2ubuntu7.1) ...', 'Setting up nginx (1.24.0-2ubuntu7.1) ...']);
    expect(installed(r.state)).toEqual(['ii curl 8.5.0-2ubuntu10', 'ii nginx 1.24.0-2ubuntu7.1', 'ii nginx-common 1.24.0-2ubuntu7.1 auto', 'ii openssl 3.0.13-0ubuntu3']);
    // The package's files are on the disk, root's, with the folders on the way.
    expect(r.state.nodes.get('/usr/sbin/nginx')).toEqual({ kind: 'file', mode: 0o755, owner: 'root', content: 'nginx 1.24.0-2ubuntu7.1\n' });
    expect(r.state.nodes.get('/usr/sbin')).toEqual({ kind: 'dir', mode: 0o755, owner: 'root' });
    expect(r.state.nodes.get('/etc/nginx/nginx.conf')).toMatchObject({ kind: 'file', owner: 'root' });
    // A package with nothing extra is installed without a question.
    expect(out('sudo apt install htop').slice(3)).toEqual(['The following NEW packages will be installed:', '  htop', '0 upgraded, 1 newly installed, 0 to remove and 2 not upgraded.',
      'Selecting previously unselected package htop.', 'Preparing to unpack .../htop_3.3.0-4build1_amd64.deb ...', 'Unpacking htop (3.3.0-4build1) ...', 'Setting up htop (3.3.0-4build1) ...']);
  });
  it('says what is already installed, and marks an automatic package manual when asked for by name', () => {
    expect(out('sudo apt install -y openssl')).toEqual([...READING, 'The following packages will be upgraded:', '  openssl', '1 upgraded, 0 newly installed, 0 to remove and 1 not upgraded.',
      'Preparing to unpack .../openssl_3.0.13-0ubuntu3.4_amd64.deb ...', 'Unpacking openssl (3.0.13-0ubuntu3.4) over (3.0.13-0ubuntu3) ...', 'Setting up openssl (3.0.13-0ubuntu3.4) ...']);
    const r = web('sudo apt install -y nginx', 'sudo apt install nginx-common');
    expect(r.last.out).toEqual([...READING, 'nginx-common is already the newest version (1.24.0-2ubuntu7.1).', 'nginx-common set to manually installed.', '0 upgraded, 0 newly installed, 0 to remove and 2 not upgraded.']);
    expect(installed(r.state)).toContain('ii nginx-common 1.24.0-2ubuntu7.1');
  });
  it('pins a version, refuses a downgrade or a held package with -y, and reports unmet dependencies', () => {
    const r = web('sudo apt install -y nginx=1.24.0-2ubuntu7');
    expect(installed(r.state)).toEqual(expect.arrayContaining(['ii nginx 1.24.0-2ubuntu7', 'ii nginx-common 1.24.0-2ubuntu7.1 auto']));
    expect(err('sudo apt install -y nginx=9.9')).toEqual(["E: Version '9.9' for 'nginx' was not found"]);
    expect(err('sudo apt install -y nginx', 'sudo apt install -y nginx=1.24.0-2ubuntu7')).toEqual(['E: Packages were downgraded and -y was used without --allow-downgrades.']);
    expect(installed(web('sudo apt install -y nginx', 'sudo apt install -y --allow-downgrades nginx=1.24.0-2ubuntu7').state)).toContain('ii nginx 1.24.0-2ubuntu7');
    expect(out('sudo apt install curl').slice(3)).toEqual(['The following held packages will be changed:', '  curl', 'The following packages will be upgraded:', '  curl',
      '1 upgraded, 0 newly installed, 0 to remove and 1 not upgraded.', 'Do you want to continue? [Y/n] Abort.']);
    expect(err('sudo apt install -y curl')).toEqual(['E: Held packages were changed and -y was used without --allow-change-held-packages.']);
    expect(installed(web('sudo apt install -y --allow-change-held-packages curl').state)).toContain('ii curl 8.5.0-2ubuntu10.6');
    const unmet = web('sudo apt install -y legacy-app');
    expect(unmet.last.out.slice(-2)).toEqual(['The following packages have unmet dependencies:', ' legacy-app : Depends: libgone1 but it is not installable']);
    expect(unmet.last.err).toEqual(['E: Unable to correct problems, you have held broken packages.']);
    expect(unmet.state.status).toBe(100);
    expect(err('sudo apt install -y nope')).toEqual(['E: Unable to locate package nope']);
    expect(err('sudo apt install ./x.deb')).toEqual(['E: 模擬環境不安裝 .deb 檔案（./x.deb）：請從套件庫安裝']);
  });
  it('removes (keeping configuration files), autoremoves what is no longer needed and purges', () => {
    const r = web('sudo apt install -y nginx', 'sudo apt remove -y nginx-common');
    expect(r.last.out).toEqual([...READING, 'The following packages will be REMOVED:', '  nginx nginx-common', '0 upgraded, 0 newly installed, 2 to remove and 2 not upgraded.',
      'Removing nginx (1.24.0-2ubuntu7.1) ...', 'Removing nginx-common (1.24.0-2ubuntu7.1) ...']);
    expect(installed(r.state)).toEqual(['ii curl 8.5.0-2ubuntu10', 'rc nginx-common 1.24.0-2ubuntu7.1', 'ii openssl 3.0.13-0ubuntu3']);
    expect(r.state.nodes.has('/usr/sbin/nginx')).toBe(false);
    expect(r.state.nodes.has('/etc/nginx/nginx.conf')).toBe(true);
    const auto = web('sudo apt install -y nginx', 'sudo apt remove -y nginx');
    expect(auto.last.out.slice(3, 6)).toEqual(['The following packages were automatically installed and are no longer required:', '  nginx-common', "Use 'sudo apt autoremove' to remove it."]);
    const gone = session(auto.state, 'sudo apt autoremove -y', 'dpkg -l nginx-common');
    expect(gone.log[0].out.slice(3)).toEqual(['The following packages will be REMOVED:', '  nginx-common', '0 upgraded, 0 newly installed, 1 to remove and 2 not upgraded.', 'Removing nginx-common (1.24.0-2ubuntu7.1) ...']);
    expect(gone.last.out.at(-1)).toBe('rc  nginx-common   1.24.0-2ubuntu7.1 all          small, powerful, scalable web/proxy server - common files');
    const purged = session(gone.state, 'sudo apt purge -y nginx-common');
    expect(purged.last.out.slice(3)).toEqual(['The following packages will be REMOVED:', '  nginx-common*', '0 upgraded, 0 newly installed, 1 to remove and 2 not upgraded.', 'Purging configuration files for nginx-common (1.24.0-2ubuntu7.1) ...']);
    expect(purged.state.nodes.has('/etc/nginx')).toBe(false);
    expect(installed(purged.state)).toEqual(['ii curl 8.5.0-2ubuntu10', 'ii openssl 3.0.13-0ubuntu3']);
    expect(out('sudo apt remove -y htop')).toEqual([...READING, "Package 'htop' is not installed, so not removed", '0 upgraded, 0 newly installed, 0 to remove and 2 not upgraded.']);
    expect(out('sudo apt remove openssl').at(-1)).toBe('Do you want to continue? [Y/n] Abort.');
    expect(err('sudo apt remove -y curl')).toEqual(['E: Held packages were changed and -y was used without --allow-change-held-packages.']);
  });
  it('upgrades everything but held packages', () => {
    const r = web('sudo apt upgrade -y');
    expect(r.last.out).toEqual([...READING, 'Calculating upgrade... Done', 'The following packages have been kept back:', '  curl', 'The following packages will be upgraded:', '  openssl',
      '1 upgraded, 0 newly installed, 0 to remove and 1 not upgraded.', 'Preparing to unpack .../openssl_3.0.13-0ubuntu3.4_amd64.deb ...',
      'Unpacking openssl (3.0.13-0ubuntu3.4) over (3.0.13-0ubuntu3) ...', 'Setting up openssl (3.0.13-0ubuntu3.4) ...']);
    expect(installed(r.state)).toEqual(['ii curl 8.5.0-2ubuntu10', 'ii openssl 3.0.13-0ubuntu3.4']);
    expect(out('sudo apt upgrade').at(-1)).toBe('Do you want to continue? [Y/n] Abort.');
    expect(out('sudo apt upgrade -y', 'sudo apt upgrade -y').slice(4)).toEqual(['The following packages have been kept back:', '  curl', '0 upgraded, 0 newly installed, 0 to remove and 1 not upgraded.']);
  });
  it('lists, shows and explains versions', () => {
    expect(out('apt list --upgradable')).toEqual(['Listing... Done', 'curl/noble-updates 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10]',
      'openssl/noble-security 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3]']);
    expect(out('sudo apt install -y nginx', 'apt list --installed')).toEqual(['Listing... Done', 'curl/noble,now 8.5.0-2ubuntu10 amd64 [installed,upgradable to: 8.5.0-2ubuntu10.6]',
      'nginx/noble-updates,noble-security,now 1.24.0-2ubuntu7.1 amd64 [installed]', 'nginx-common/noble-updates,now 1.24.0-2ubuntu7.1 all [installed,automatic]',
      'openssl/noble,now 3.0.13-0ubuntu3 amd64 [installed,upgradable to: 3.0.13-0ubuntu3.4]']);
    expect(out('apt list "nginx*"')).toEqual(['Listing... Done', 'nginx/noble-updates,noble-security 1.24.0-2ubuntu7.1 amd64', 'nginx-common/noble-updates 1.24.0-2ubuntu7.1 all']);
    expect(out('apt show htop')).toEqual(['Package: htop', 'Version: 3.3.0-4build1', 'Priority: optional', 'Section: utils', 'APT-Sources: http://archive.ubuntu.com/ubuntu noble/main amd64 Packages',
      'Description: interactive processes viewer', '']);
    expect(err('apt show nope')).toEqual(['N: Unable to locate package nope', 'E: No packages found']);
    expect(out('apt policy openssl')).toEqual(['openssl:', '  Installed: 3.0.13-0ubuntu3', '  Candidate: 3.0.13-0ubuntu3.4', '  Version table:', '     3.0.13-0ubuntu3.4 500',
      '        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages', ' *** 3.0.13-0ubuntu3 500', '        500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages',
      '        100 /var/lib/dpkg/status']);
    // apt warns when its output is not a terminal.
    const piped = web('apt list --upgradable | head -n 1');
    expect(piped.last).toEqual({ out: ['Listing... Done'], err: ['', 'WARNING: apt does not have a stable CLI interface. Use with caution in scripts.', ''] });
    expect(err('apt frobnicate')).toEqual(['E: Invalid operation frobnicate']);
    expect(err('apt -z list')).toEqual(["E: Command line option 'z' [from -z] is not understood in combination with the other options."]);
    expect(err('apt list --frob')).toEqual(['E: Command line option --frob is not understood in combination with the other options']);
  });
});

describe('apt-mark and dpkg', () => {
  it('holds and releases packages (root only)', () => {
    expect(out('apt-mark showhold')).toEqual(['curl']);
    expect(out('sudo apt-mark unhold curl', 'apt-mark showhold')).toEqual([]);
    expect(web('sudo apt-mark unhold curl').last.out).toEqual(['Canceled hold on curl.']);
    expect(out('sudo apt-mark hold curl')).toEqual(['curl was already set on hold.']);
    expect(out('sudo apt-mark hold openssl curl')).toEqual(['openssl set on hold.', 'curl was already set on hold.']);
    expect(out('sudo apt-mark unhold openssl')).toEqual(['openssl was already not on hold.']);
    expect(err('apt-mark hold openssl')).toEqual(['dpkg: error: requested operation requires superuser privilege', 'E: Executing dpkg failed. Are you root?']);
    expect(err('sudo apt-mark hold nope')).toEqual(['E: Unable to locate package nope']);
    expect(out('sudo apt-mark auto openssl', 'sudo apt-mark manual openssl')).toEqual(['openssl set to manually installed.']);
  });
  it('shows the dpkg database', () => {
    expect(out('dpkg -l')).toEqual([
      'Desired=Unknown/Install/Remove/Purge/Hold', '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend', '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)',
      '||/ Name           Version         Architecture Description', '+++-==============-===============-============-=======================================================',
      'hi  curl           8.5.0-2ubuntu10 amd64        command line tool for transferring data with URL syntax', 'ii  openssl        3.0.13-0ubuntu3 amd64        Secure Sockets Layer toolkit - cryptographic utility',
    ]);
    expect(err('dpkg -l nope')).toEqual(['dpkg-query: no packages found matching nope']);
    expect(status('dpkg -l nope')).toBe(1);
    expect(out('sudo apt install -y nginx', 'dpkg -L nginx-common')).toEqual(['/.', '/etc', '/etc/nginx', '/etc/nginx/nginx.conf', '/usr', '/usr/lib', '/usr/lib/systemd', '/usr/lib/systemd/system', '/usr/lib/systemd/system/nginx.service']);
    expect(err('dpkg -L htop')).toEqual(["dpkg-query: package 'htop' is not installed", 'Use dpkg --contents (= dpkg-deb --contents) to list archive files contents.']);
    expect(out('dpkg -s curl')).toEqual(['Package: curl', 'Status: hold ok installed', 'Version: 8.5.0-2ubuntu10', 'Description: command line tool for transferring data with URL syntax']);
    expect(err('dpkg -i x.deb')).toEqual(['dpkg: 模擬環境不安裝 .deb 檔案；請用 apt install 從套件庫安裝']);
  });
});

describe('packages machines in lessons', () => {
  it('builds the database from the lesson data', () => {
    const db = machineState(pkgMachine).packages!;
    expect(db.current).toBe(true);
    expect(db.holds).toEqual(['curl']);
    expect(db.repositories.map(r => `${r.name}:${r.enabled}`)).toEqual(['noble:true', 'noble-updates:true', 'noble-security:true', 'old-ppa:false']);
  });
  it('validates the package data and keeps it to the packages profile', () => {
    const p = (packages: object) => machineProblems({ ...pkgMachine, packages: { ...pkgPackages, ...packages } }).join('\n');
    expect(machineProblems(pkgMachine)).toEqual([]);
    expect(machineProblems({ ...pkgMachine, profile: 'processes' }).join('\n')).toMatch(/packages need the packages profile \(engine stage E5\)/);
    expect(p({ repositories: [...pkgPackages.repositories, { ...pkgPackages.repositories[0] }] })).toMatch(/repository noble: needs a unique name/);
    expect(p({ repositories: [{ ...pkgPackages.repositories[0], url: 'ftp://x' }] })).toMatch(/repository noble: invalid url/);
    expect(p({ available: [{ ...pkgPackages.available[5], version: 'x1' }] })).toMatch(/package htop x1: invalid name or version/);
    expect(p({ available: [{ ...pkgPackages.available[5], repo: 'nowhere' }] })).toMatch(/unknown repository nowhere/);
    expect(p({ available: [{ ...pkgPackages.available[5], depends: ['ghost'] }] })).toMatch(/depends on unknown package ghost/);
    expect(p({ available: [{ ...pkgPackages.available[5], files: [{ path: 'usr/bin/x', kind: 'file', mode: 0o755 }] }] })).toMatch(/file usr\/bin\/x is not an absolute/);
    expect(p({ available: [{ ...pkgPackages.available[5], files: [{ path: '/usr/bin/x', kind: 'link', mode: 0o777 }] }] })).toMatch(/a link \(and only a link\) needs a target/);
    expect(p({ installed: [{ name: 'curl', version: '1.0' }, { name: 'curl', version: '1.0' }] })).toMatch(/installed curl: needs a unique name/);
    expect(p({ installed: [{ name: 'curl', version: '1.0', held: true, config: true }] })).toMatch(/a removed package \(config\) cannot be held/);
  });
  it('checks packages: installed, version, held, absent, purged', () => {
    expect(checkTerminalExercise(htopExercise, [pkgMachine], ['sudo apt install -y htop']).ok).toBe(true);
    expect(checkTerminalExercise(htopExercise, [pkgMachine], []).results[0].message).toBe('套件 htop 應該已安裝，但它沒有安裝');
    expect(checkTerminalExercise(securityExercise, [pkgMachine], ['sudo apt-mark unhold curl', 'sudo apt upgrade -y']).results[1].message)
      .toBe('套件 curl 應該已安裝（版本 8.5.0-2ubuntu10，被 hold），但安裝的版本是 8.5.0-2ubuntu10.6');
    const purge = { ...htopExercise, checks: [{ kind: 'package' as const, name: 'nginx-common', purged: true as const }] };
    expect(checkTerminalExercise(purge, [pkgMachine], ['sudo apt install -y nginx', 'sudo apt remove -y nginx-common']).results[0].message).toBe('套件 nginx-common 應該完全移除（含設定檔），但它的設定檔還在（rc）');
    expect(checkTerminalExercise(purge, [pkgMachine], ['sudo apt install -y nginx', 'sudo apt purge -y nginx-common']).ok).toBe(true);
    expect(describeCheck({ kind: 'package', name: 'curl', absent: true })).toBe('套件 curl 應該沒有安裝');
  });
  it('validates the fixture lesson and rejects package checks elsewhere', () => {
    expect(terminalContentProblems(pkgContent())).toEqual([]);
    expect(problems(c => { c.machines[0].profile = 'processes'; delete c.machines[0].packages; })).toMatch(/a package check needs a packages machine \(engine stage E5\)/);
    expect(problems(c => { c.exercises[0].checks = [{ kind: 'package', name: 'Bad Name' }]; })).toMatch(/a package check needs a packages machine \(engine stage E5\) and a valid name/);
    expect(problems(c => { c.examples[0].steps[0].command = 'systemctl status'; })).toMatch(/systemctl is not in the packages profile of machine pkg/);
  });
});
