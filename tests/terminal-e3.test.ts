import { describe, expect, it } from 'vitest';
import { initialState, type FsState } from '@/lib/terminal/fs';
import { defaultAccounts, groupText, loginGroups, nextId, passwdText, umaskSymbolic } from '@/lib/terminal/accounts';
import { USER_MANUAL } from '@/lib/terminal/manual';
import { E3_COMMANDS, FILES_PROFILE, run, STREAMS_PROFILE, USERS_PROFILE } from '@/lib/terminal/shell';
import {
  checkTerminalExercise, describeCheck, machineAccounts, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine,
} from '@/lib/terminal/lesson';
import { filesContent, joinExercise, serviceExercise, umaskExercise, usersContent, usersMachine, webMachine } from './support/terminal-fixture';

/*
 * Engine stage E3 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §11): the users profile — the user and group database
 * (/etc/passwd, /etc/group, /etc/shadow generated from it), id, groups, useradd, usermod (-G versus -aG), groupadd,
 * newgrp, sudo (allowed and refused), chown and chgrp (root, or the owner within its own groups), umask and its effect on
 * new files and folders, and the group bits deciding for members. Lesson machines opt in with profile: 'users'.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; lines: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, USERS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), lines: r.lines.map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const team = (...commands: string[]) => session(usersMachine, ...commands);
const out = (...commands: string[]) => team(...commands).last.out;
const err = (...commands: string[]) => team(...commands).last.err;
/** The team machine with learner outside sudo. */
const plain: TerminalMachine = { ...usersMachine, accounts: { ...usersMachine.accounts, groups: [{ name: 'devs', gid: 1100, members: ['alice'] }] } };
const node = (s: FsState, path: string) => s.nodes.get(path);
const TRY = (cmd: string) => `Try '${cmd} --help' for more information.`;
const problems = (edit: (c: TerminalLessonContent) => void) => { const c = usersContent(); edit(c); return terminalContentProblems(c).join('\n'); };

describe('the users profile', () => {
  it('is the streams profile plus the E3 commands and the accounts feature', () => {
    expect([...USERS_PROFILE.commands].sort()).toEqual([...STREAMS_PROFILE.commands, ...E3_COMMANDS].sort());
    expect(USERS_PROFILE.features).toEqual([...STREAMS_PROFILE.features!, 'accounts']);
    expect(profileOf(usersMachine)).toBe(USERS_PROFILE);
    expect(Object.keys(USER_MANUAL).sort()).toEqual([...E3_COMMANDS].sort());
  });
  it('keeps every E3 command away from the lab, files and streams profiles', () => {
    for (const cmd of E3_COMMANDS) {
      expect(run(initialState(), `${cmd} x`).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(run(initialState(), `${cmd} x`, FILES_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(run(initialState(), `${cmd} x`, STREAMS_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
    }
    // Below the users profile -R is not an option of chmod: it is taken as the mode and 700 as a file.
    expect(run(initialState(), 'chmod -R 700 tmp', FILES_PROFILE).lines[0].text).toBe("chmod: cannot access '700': No such file or directory");
  });
  it('has a manual page and --help for every E3 command', () => {
    for (const cmd of E3_COMMANDS) {
      expect(out(`man ${cmd}`)[0], cmd).toBe(`${cmd.toUpperCase()}(1)        User Commands        ${cmd.toUpperCase()}(1)`);
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${USER_MANUAL[cmd].usage}`);
    }
    // sudo's own --help only before the command; after it, the command's.
    expect(out('sudo ls --help')[0]).toBe('用法：ls [-l] [-a] [-h] [-d] [路徑]…');
    expect(out('chmod --help')[0]).toBe('用法：chmod [-R] 模式 路徑…');
  });
});

describe('the user and group database', () => {
  it('generates /etc/passwd, /etc/group and an unreadable /etc/shadow from the machine\'s accounts', () => {
    const s = machineState(usersMachine);
    expect(s.groups).toEqual(['learner', 'sudo']);
    expect(s.umask).toBe(0o022);
    expect(s.nodes.get('/etc/passwd')).toMatchObject({ kind: 'file', mode: 0o644, owner: 'root' });
    expect(s.nodes.get('/etc/shadow')).toMatchObject({ mode: 0o640, owner: 'root', group: 'shadow' });
    expect(out('tail -n 3 /etc/passwd')).toEqual(['learner:x:1000:1000::/home/learner:/bin/bash', 'alice:x:1001:1001:Alice Chen:/home/alice:/bin/bash', 'svc-web:x:998:33::/srv/www:/usr/sbin/nologin']);
    expect(out('head -n 1 /etc/passwd')).toEqual(['root:x:0:0:root:/root:/bin/bash']);
    expect(out('grep -E "^(sudo|devs|learner|alice):" /etc/group')).toEqual(['sudo:x:27:learner', 'learner:x:1000:', 'devs:x:1100:alice', 'alice:x:1001:']);
    expect(out('cut -d : -f 1 /etc/passwd | wc -l')).toEqual(['9']);
    expect(err('cat /etc/shadow')).toEqual(['cat: /etc/shadow: Permission denied']);
    expect(out('ls -l /etc')).toEqual(['-rw-r--r-- root    root      173 group', '-rw-r--r-- root    root      407 passwd', '-rw-r----- root    shadow    247 shadow', 'drwxr-xr-x root    root     4096 skel/']);
    expect(out('sudo grep learner /etc/shadow')).toEqual(['learner:!:20000:0:99999:7:::']);
  });
  it('builds the database from a small base with the machine\'s user, laid over by the machine\'s accounts', () => {
    const base = defaultAccounts('kai', '/home/kai');
    expect(base.users.map(u => u.name)).toEqual(['root', 'daemon', 'bin', 'sys', 'www-data', 'nobody', 'kai']);
    expect(base.groups.map(g => `${g.name}:${g.gid}`)).toEqual(['root:0', 'daemon:1', 'bin:2', 'sys:3', 'adm:4', 'sudo:27', 'www-data:33', 'shadow:42', 'users:100', 'nogroup:65534', 'kai:1000']);
    expect(defaultAccounts('root', '/root').users).toHaveLength(6);
    const acc = machineAccounts(usersMachine);
    expect(loginGroups(acc, 'learner')).toEqual(['learner', 'sudo']);
    expect(loginGroups(acc, 'svc-web')).toEqual(['www-data']);
    expect(passwdText(acc).split('\n')).toHaveLength(10);
    expect(groupText(acc)).toMatch(/^devs:x:1100:alice$/m);
    expect(nextId([0, 1000, 1001, 65534], false)).toBe(1002);
    expect(nextId([999, 998], true)).toBe(997);
    expect(nextId([0], false)).toBe(1000);
    expect(umaskSymbolic(0o027)).toBe('u=rwx,g=rx,o=');
  });
});

describe('id, groups and whoami', () => {
  it('shows the session and, with a name, the database', () => {
    expect(out('id')).toEqual(['uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)']);
    expect(out('id alice')).toEqual(['uid=1001(alice) gid=1001(alice) groups=1001(alice),1100(devs)']);
    expect(out('id -u')).toEqual(['1000']);
    expect(out('id -un')).toEqual(['learner']);
    expect(out('id -g alice')).toEqual(['1001']);
    expect(out('id -Gn alice')).toEqual(['alice devs']);
    expect(out('id -G')).toEqual(['1000 27']);
    expect(out('id svc-web')).toEqual(['uid=998(svc-web) gid=33(www-data) groups=33(www-data)']);
    expect(out('groups')).toEqual(['learner sudo']);
    expect(out('groups alice svc-web')).toEqual(['alice : alice devs', 'svc-web : www-data']);
    expect(out('whoami')).toEqual(['learner']);
    expect(out('sudo whoami')).toEqual(['root']);
    expect(out('sudo id')).toEqual(['uid=0(root) gid=0(root) groups=0(root)']);
  });
  it('prints GNU\'s errors', () => {
    expect(err('id bob')).toEqual(["id: 'bob': no such user"]);
    expect(err('groups bob')).toEqual(["groups: 'bob': no such user"]);
    expect(err('id -n')).toEqual(['id: printing only names or real IDs requires -u, -g, or -G', TRY('id')]);
    expect(err('id -ug')).toEqual(['id: cannot print "only" of more than one choice', TRY('id')]);
    expect(err('id a b')).toEqual(["id: extra operand 'b'", TRY('id')]);
  });
});

describe('sudo', () => {
  it('runs a command as root for a member of sudo (or wheel), with no password prompt', () => {
    expect(out('sudo cat /etc/shadow | head -n 1')).toEqual(['root:*:20000:0:99999:7:::']);
    const made = team('sudo mkdir /srv/backup', 'ls -l /srv');
    expect(made.last.out[0]).toBe('drwxr-xr-x root    root     4096 backup/');
    const wheel: TerminalMachine = { ...plain, accounts: { ...plain.accounts, groups: [...plain.accounts!.groups!, { name: 'wheel', gid: 10, members: ['learner'] }] } };
    expect(session(wheel, 'sudo whoami').last.out).toEqual(['root']);
    expect(team('sudo -u alice touch /srv/team/a.txt', 'ls -l /srv/team').last.out).toEqual(['-rw-r--r-- alice   alice       0 a.txt', '-rw-rw---- alice   devs        8 plan.txt']);
    expect(out('sudo -u alice id -un')).toEqual(['alice']);
  });
  it('refuses everyone else with the real message, and changes nothing', () => {
    const r = session(plain, 'sudo rm -r /srv/team');
    expect(r.last.err).toEqual(['learner is not in the sudoers file.  This incident will be reported.']);
    expect(r.state.nodes.has('/srv/team')).toBe(true);
    expect(session(plain, 'sudo -u alice cat /srv/team/plan.txt').last.err).toEqual(['learner is not in the sudoers file.  This incident will be reported.']);
  });
  it('keeps the session as it was, and leaves redirection to the learner\'s shell (sudo tee works, sudo echo > does not)', () => {
    const r = team('sudo ls /root', 'whoami', 'pwd');
    expect(r.log.slice(1).map(l => l.out)).toEqual([['learner'], ['/home/learner']]);
    expect(r.state).toMatchObject({ user: 'learner', home: '/home/learner', groups: ['learner', 'sudo'] });
    expect(err('sudo echo hi > /srv/motd')).toEqual(['bash: /srv/motd: Permission denied']);
    const tee = team('echo hi | sudo tee /srv/motd', 'cat /srv/motd');
    expect(tee.log[0].out).toEqual(['hi']);
    expect(tee.last.out).toEqual(['hi']);
    expect(node(tee.state, '/srv/motd')).toEqual({ kind: 'file', mode: 0o644, owner: 'root', content: 'hi\n' });
  });
  it('cannot run shell builtins, commands outside the profile or for unknown users', () => {
    expect(err('sudo cd /root')).toEqual(['sudo: cd: command not found']);
    expect(err('sudo umask 0')).toEqual(['sudo: umask: command not found']);
    expect(err('sudo apt update')).toEqual(['sudo: apt: command not found']);
    expect(err('sudo -u bob ls')).toEqual(['sudo: unknown user bob']);
    expect(err('sudo')).toEqual(['usage: sudo [-u 使用者] 指令 [參數…]']);
    expect(err('sudo -k ls')).toEqual(["sudo: invalid option -- 'k'", 'usage: sudo [-u 使用者] 指令 [參數…]']);
    // Globs are expanded by the learner's shell first: /root is unreadable, so the pattern stays as it is.
    expect(err('sudo ls /root/*')).toEqual(["ls: cannot access '/root/*': No such file or directory"]);
  });
});

describe('useradd, usermod, groupadd and newgrp', () => {
  it('need root: an ordinary user gets shadow-utils\' messages', () => {
    expect(err('useradd bob')).toEqual(['useradd: Permission denied.', 'useradd: cannot lock /etc/passwd; try again later.']);
    expect(err('usermod -aG devs learner')).toEqual(['usermod: Permission denied.', 'usermod: cannot lock /etc/passwd; try again later.']);
    expect(err('groupadd ops')).toEqual(['groupadd: Permission denied.', 'groupadd: cannot lock /etc/group; try again later.']);
    expect(team('useradd bob').state.accounts).toEqual(machineState(usersMachine).accounts);
  });
  it('useradd: the next uid, a private group, no home without -m, /bin/sh by default', () => {
    const s = team('sudo useradd bob', 'id bob', 'grep bob /etc/passwd', 'grep bob /etc/group');
    expect(s.log.slice(1).map(l => l.out[0])).toEqual(['uid=1002(bob) gid=1002(bob) groups=1002(bob)', 'bob:x:1002:1002::/home/bob:/bin/sh', 'bob:x:1002:']);
    expect(s.state.nodes.has('/home/bob')).toBe(false);
  });
  it('useradd -m -s -G -c: a 750 home with /etc/skel, the shell, supplementary groups and a comment', () => {
    const s = team('sudo useradd -m -s /bin/bash -G devs,users -c "Bob Lin" bob', 'id bob', 'sudo ls -la /home/bob');
    expect(s.log[1].out).toEqual(['uid=1002(bob) gid=1002(bob) groups=1002(bob),100(users),1100(devs)']);
    expect(s.last.out).toEqual(['drwxr-x--- bob     bob      4096 .', 'drwxr-xr-x root    root     4096 ..', '-rw-r--r-- bob     bob        17 .bashrc']);
    expect(out('sudo useradd -m -s /bin/bash -G devs,users -c "Bob Lin" bob', 'grep bob /etc/passwd')).toEqual(['bob:x:1002:1002:Bob Lin:/home/bob:/bin/bash']);
  });
  it('useradd -r: a system account below 1000; -u and -g choose the ids', () => {
    // svc-web has 998: the highest free id below 1000 is 999.
    expect(out('sudo useradd -r -s /usr/sbin/nologin backup', 'id backup')).toEqual(['uid=999(backup) gid=999(backup) groups=999(backup)']);
    expect(out('sudo useradd -r a', 'sudo useradd -r b', 'id -u b')).toEqual(['997']);
    expect(out('sudo useradd -u 2000 -g devs carol', 'id carol')).toEqual(['uid=2000(carol) gid=1100(devs) groups=1100(devs)']);
  });
  it('useradd: GNU-like errors for names, duplicates and groups', () => {
    expect(err('sudo useradd alice')).toEqual(["useradd: user 'alice' already exists"]);
    expect(err('sudo useradd Bob')).toEqual(["useradd: invalid user name 'Bob': use --badname to ignore"]);
    expect(err('sudo useradd -G ops bob')).toEqual(["useradd: group 'ops' does not exist"]);
    expect(err('sudo useradd devs')).toEqual(['useradd: group devs exists - if you want to add this user to that group, use -g.']);
    expect(err('sudo useradd -u 1001 bob')).toEqual(['useradd: UID 1001 is not unique']);
    expect(err('sudo useradd')).toEqual(['Usage: useradd [options] LOGIN']);
    expect(err('sudo useradd -x bob')).toEqual(["useradd: invalid option -- 'x'", 'Usage: useradd [options] LOGIN']);
    expect(err('sudo useradd -m -d /home/alice bob')).toEqual(['useradd: warning: the home directory /home/alice already exists.', 'useradd: Not copying any file from skel directory into it.']);
  });
  it('usermod -aG adds a group; -G without -a replaces the supplementary groups', () => {
    expect(out('sudo usermod -aG devs learner', 'id learner')).toEqual(['uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),1100(devs)']);
    const replaced = team('sudo usermod -G devs learner', 'id learner', 'grep sudo /etc/group');
    expect(replaced.log[1].out).toEqual(['uid=1000(learner) gid=1000(learner) groups=1000(learner),1100(devs)']);
    expect(replaced.last.out).toEqual(['sudo:x:27:']);
    // The session keeps its login groups (sudo still works until the next login).
    expect(replaced.state.groups).toEqual(['learner', 'sudo']);
    expect(session(replaced.state, 'sudo whoami').last.out).toEqual(['root']);
    expect(out('sudo usermod -s /usr/sbin/nologin -c Alice alice', 'grep alice /etc/passwd')).toEqual(['alice:x:1001:1001:Alice:/home/alice:/usr/sbin/nologin']);
    expect(out('sudo usermod -g devs alice', 'id alice')).toEqual(['uid=1001(alice) gid=1100(devs) groups=1100(devs)']);
  });
  it('usermod: its errors', () => {
    expect(err('sudo usermod -a learner')).toEqual(['usermod: -a flag is ONLY allowed with the -G flag', 'Usage: usermod [options] LOGIN']);
    expect(err('sudo usermod -aG ops learner')).toEqual(["usermod: group 'ops' does not exist"]);
    expect(err('sudo usermod -aG devs bob')).toEqual(["usermod: user 'bob' does not exist"]);
    expect(err('sudo usermod learner')).toEqual(['usermod: no changes']);
  });
  it('groupadd: the next gid, -r below 1000, -g, and its errors', () => {
    expect(out('sudo groupadd ops', 'grep ops /etc/group')).toEqual(['ops:x:1101:']);
    expect(out('sudo groupadd -r monitor', 'grep monitor /etc/group')).toEqual(['monitor:x:999:']);
    expect(out('sudo groupadd -g 2000 qa', 'grep qa /etc/group')).toEqual(['qa:x:2000:']);
    expect(err('sudo groupadd devs')).toEqual(["groupadd: group 'devs' already exists"]);
    expect(err('sudo groupadd -g 27 x')).toEqual(["groupadd: GID '27' already exists"]);
    expect(err('sudo groupadd Ops')).toEqual(["groupadd: 'Ops' is not a valid group name"]);
  });
  it('newgrp: a group just joined takes effect without logging in again, and becomes the primary group', () => {
    const s = team('touch /srv/team/a', 'sudo usermod -aG devs learner', 'id', 'newgrp devs', 'id', 'touch /srv/team/a', 'ls -l /srv/team/a', 'newgrp', 'id');
    expect(s.log[0].err).toEqual(["touch: cannot touch '/srv/team/a': Permission denied"]);
    expect(s.log[2].out).toEqual(['uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)']);
    expect(s.log[4].out).toEqual(['uid=1000(learner) gid=1100(devs) groups=1100(devs),1000(learner),27(sudo)']);
    expect(s.log[6].out).toEqual(['-rw-r--r-- learner devs        0 /srv/team/a']);
    expect(s.last.out).toEqual(['uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),1100(devs)']);
    expect(err('newgrp devs')).toEqual(['newgrp: 你不在 devs 群組裡（模擬環境沒有群組密碼）']);
    expect(err('newgrp ops')).toEqual(["newgrp: group 'ops' does not exist"]);
    expect(team('sudo usermod -aG devs learner', 'newgrp devs | cat').state.groups).toEqual(['learner', 'sudo']);
  });
});

describe('ownership: chown and chgrp', () => {
  it('root may give a file to anyone and change its group', () => {
    const s = team('touch a.txt', 'sudo chown alice a.txt', 'ls -l a.txt', 'sudo chown svc-web:devs a.txt', 'ls -l a.txt', 'sudo chgrp adm a.txt', 'ls -l a.txt', 'sudo chown alice: a.txt', 'ls -l a.txt');
    expect([s.log[2], s.log[4], s.log[6], s.last].map(l => l.out[0])).toEqual([
      '-rw-r--r-- alice   learner     0 a.txt', '-rw-r--r-- svc-web devs        0 a.txt', '-rw-r--r-- svc-web adm         0 a.txt', '-rw-r--r-- alice   alice       0 a.txt']);
    expect(out('touch a.txt', 'sudo chown :devs a.txt', 'ls -l a.txt')).toEqual(['-rw-r--r-- learner devs        0 a.txt']);
    expect(out('touch a.txt', 'sudo chown 1001 a.txt', 'ls -l a.txt')).toEqual(['-rw-r--r-- alice   learner     0 a.txt']);
  });
  it('an ordinary user may not give a file away, nor change the group to one it is not in', () => {
    expect(err('touch a.txt', 'chown alice a.txt')).toEqual(["chown: changing ownership of 'a.txt': Operation not permitted"]);
    expect(err('chown learner /srv/team/plan.txt')).toEqual(["chown: changing ownership of '/srv/team/plan.txt': Operation not permitted"]);
    expect(err('touch a.txt', 'chgrp devs a.txt')).toEqual(["chgrp: changing group of 'a.txt': Operation not permitted"]);
    expect(err('chgrp learner /srv/team/plan.txt')).toEqual(["chgrp: changing group of '/srv/team/plan.txt': Operation not permitted"]);
    // ...but the owner may move it to a group of the session, and chown to itself changes nothing.
    expect(out('touch a.txt', 'chgrp sudo a.txt', 'chown learner:learner a.txt', 'chown :sudo a.txt', 'ls -l a.txt')).toEqual(['-rw-r--r-- learner sudo        0 a.txt']);
  });
  it('-R goes through a folder; GNU\'s errors for users, groups and operands', () => {
    const s = team('mkdir -p p/q', 'touch p/q/r', 'sudo chown -R alice:devs p', 'ls -l p p/q');
    expect(s.last.out).toEqual(['p:', 'drwxr-xr-x alice   devs     4096 q/', '', 'p/q:', '-rw-r--r-- alice   devs        0 r']);
    expect(err('mkdir -p p/q', 'touch p/q/r', 'chown -R alice p')).toEqual(["chown: changing ownership of 'p': Operation not permitted", "chown: changing ownership of 'p/q': Operation not permitted", "chown: changing ownership of 'p/q/r': Operation not permitted"]);
    expect(err('sudo chown bob notes.txt')).toEqual(["chown: invalid user: 'bob'"]);
    expect(err('sudo chown alice:ops notes.txt')).toEqual(["chown: invalid group: 'alice:ops'"]);
    expect(err('sudo chgrp ops notes.txt')).toEqual(["chgrp: invalid group: 'ops'"]);
    expect(err('chown alice')).toEqual(["chown: missing operand after 'alice'", TRY('chown')]);
    expect(err('chgrp')).toEqual(['chgrp: missing operand', TRY('chgrp')]);
    expect(err('sudo chown alice nope')).toEqual(["chown: cannot access 'nope': No such file or directory"]);
  });
});

describe('umask', () => {
  it('shows and sets the mask, in octal or symbolically', () => {
    expect(out('umask')).toEqual(['0022']);
    expect(out('umask -S')).toEqual(['u=rwx,g=rx,o=rx']);
    expect(out('umask 027', 'umask')).toEqual(['0027']);
    expect(out('umask u=rwx,g=rx,o=', 'umask')).toEqual(['0027']);
    expect(out('umask 077', 'umask -S')).toEqual(['u=rwx,g=,o=']);
    expect(err('umask 999')).toEqual(['bash: umask: 999: octal number out of range']);
    expect(err('umask u=z')).toEqual(["bash: umask: `u=z': invalid symbolic mode operator"]);
    expect(err('umask -x')).toEqual(['bash: umask: -x: invalid option', 'umask: usage: umask [-p] [-S] [mode]']);
  });
  it('decides the mode of new files (666 & ~umask) and folders (777 & ~umask) from touch, mkdir, redirection, tee and cp', () => {
    const s = team('umask 027', 'touch t.txt', 'mkdir d', 'mkdir -p x/y', 'echo a > r.txt', 'echo a | tee e.txt', 'cp /etc/skel/.bashrc c.txt', 'ls -l');
    expect(s.last.out).toEqual([
      '-rw-r----- learner learner    17 c.txt', 'drwxr-x--- learner learner  4096 d/', '-rw-r----- learner learner     2 e.txt', '-rw-r--r-- learner learner     6 notes.txt',
      '-rw-r----- learner learner     2 r.txt', '-rw-r----- learner learner     0 t.txt', 'drwxr-x--- learner learner  4096 x/',
    ]);
    expect(node(s.state, '/home/learner/x/y')?.mode).toBe(0o750);
    expect(node(team('umask 777', 'mkdir -p a/b').state, '/home/learner/a')?.mode).toBe(0o300);
    // An existing file keeps its mode when it is written or copied over.
    expect(node(team('umask 077', 'echo x > notes.txt', 'cp /etc/skel/.bashrc notes.txt').state, '/home/learner/notes.txt')?.mode).toBe(0o644);
  });
  it('is the session\'s: a pipeline stage does not change it', () => {
    expect(team('umask 077 | cat').state.umask).toBe(0o022);
  });
});

describe('permissions with groups', () => {
  it('uses the group bits for members and the other bits for everyone else', () => {
    expect(session(plain, 'cat /srv/team/plan.txt').last.err).toEqual(['cat: /srv/team/plan.txt: Permission denied']);
    expect(out('sudo -u alice cat /srv/team/plan.txt')).toEqual(['ship v2']);
    expect(out('sudo usermod -aG devs learner', 'newgrp devs', 'cat /srv/team/plan.txt')).toEqual(['ship v2']);
    expect(err('ls /home/alice')).toEqual(["ls: cannot open directory '/home/alice': Permission denied"]);
    expect(out('sudo chmod 755 /home/alice', 'ls -ld /home/alice')).toEqual(['drwxr-xr-x alice   alice    4096 /home/alice/']);
  });
  it('needs w and x on the folder to create or delete in it', () => {
    const joined = ['sudo usermod -aG devs learner', 'newgrp devs'];
    expect(err(...joined, 'sudo chmod 755 /srv/team', 'touch /srv/team/x')).toEqual(["touch: cannot touch '/srv/team/x': Permission denied"]);
    expect(err(...joined, 'sudo chmod 775 /srv/team', 'rm /srv/team/plan.txt')).toEqual([]);
    expect(err('rm /srv/team/plan.txt')).toEqual(["rm: cannot remove '/srv/team/plan.txt': Permission denied"]);
  });
  it('chmod -R changes a folder and everything under it (only on the users profile)', () => {
    const s = team('mkdir -p p/q', 'touch p/q/r', 'chmod -R go-rwx p', 'ls -ld p p/q p/q/r');
    expect(s.last.out).toEqual(['drwx------ learner learner  4096 p/', 'drwx------ learner learner  4096 p/q/', '-rw------- learner learner     0 p/q/r']);
    expect(err('chmod -R 700 /srv')).toEqual(["chmod: changing permissions of '/srv': Operation not permitted", "chmod: changing permissions of '/srv/team': Operation not permitted", "chmod: changing permissions of '/srv/team/plan.txt': Operation not permitted", "chmod: changing permissions of '/srv/www': Operation not permitted"]);
  });
});

describe('purity', () => {
  it('never changes the state it was given', () => {
    const start = machineState(usersMachine), before = JSON.stringify([...start.nodes]), accounts = JSON.stringify(start.accounts);
    for (const c of ['sudo useradd -m bob', 'sudo usermod -G devs learner', 'sudo groupadd ops', 'sudo chown -R alice /srv', 'umask 077', 'newgrp sudo']) run(start, c, USERS_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(before);
    expect(JSON.stringify(start.accounts)).toBe(accounts);
    expect(start).toMatchObject({ groups: ['learner', 'sudo'], umask: 0o022 });
  });
});

describe('lesson machines on the users profile', () => {
  it('accepts the E3 content, and checks users, groups and the umask by their result', () => {
    expect(terminalContentProblems(usersContent())).toEqual([]);
    expect(machineProblems(usersMachine)).toEqual([]);
    const { machines } = usersContent();
    expect(checkTerminalExercise(joinExercise, machines, ['sudo usermod -a -G devs learner']).ok).toBe(true);
    expect(checkTerminalExercise(joinExercise, machines, ['sudo usermod -G devs,sudo learner']).ok).toBe(true);
    expect(checkTerminalExercise(joinExercise, machines, ['sudo usermod -G devs learner']).results[0].message).toBe('使用者 learner 應該存在（屬於 devs、sudo），但不在 sudo 群組裡');
    expect(checkTerminalExercise(serviceExercise, machines, ['sudo useradd --system --shell /usr/sbin/nologin backup-agent']).ok).toBe(true);
    expect(checkTerminalExercise(serviceExercise, machines, []).results[0].message).toBe('使用者 backup-agent 應該存在（shell 是 /usr/sbin/nologin），但這個使用者不存在');
    expect(checkTerminalExercise(umaskExercise, machines, ['umask u=rwx,g=rx,o=', 'echo > report.txt']).ok).toBe(true);
    expect(checkTerminalExercise(umaskExercise, machines, ['touch report.txt', 'chmod 640 report.txt']).results[0].message).toBe('umask 應該是 0027，但目前是 0022');
    expect(describeCheck({ kind: 'group', name: 'devs', gid: 1100, members: ['alice'], notMembers: ['bob'] })).toBe('群組 devs 應該存在（GID 是 1100，成員有 alice，成員沒有 bob）');
    expect(describeCheck({ kind: 'user', name: 'bob', absent: true })).toBe('使用者 bob 應該不存在');
  });
  it('checks groups, uids, primary groups and absent accounts', () => {
    const c = usersContent(), x = c.exercises[0];
    x.checks = [{ kind: 'group', name: 'ops', gid: 1101, members: ['alice'] }, { kind: 'user', name: 'alice', uid: 1001, group: 'alice', notGroups: ['sudo'] }];
    x.solution = ['sudo groupadd ops', 'sudo usermod -aG ops alice'];
    x.mistakes = [{ commands: ['sudo groupadd ops'], why: '還沒加入。' }];
    expect(terminalContentProblems(c)).toEqual([]);
    expect(checkTerminalExercise(x, c.machines, ['sudo groupadd -g 1200 ops', 'sudo usermod -aG ops alice']).results[0].message).toMatch(/但GID 是 1200$/);
    expect(checkTerminalExercise(x, c.machines, ['sudo groupadd ops', 'sudo usermod -aG ops,sudo alice']).results[1].message).toMatch(/但仍在 sudo 群組裡$/);
    const gone = usersContent().exercises[0];
    gone.checks = [{ kind: 'group', name: 'devs', notMembers: ['alice'] }];
    expect(checkTerminalExercise(gone, c.machines, ['sudo usermod -G "" alice']).ok).toBe(true);
    expect(checkTerminalExercise({ ...gone, checks: [{ kind: 'user', name: 'nobody2', absent: true }] }, c.machines, []).ok).toBe(true);
  });
  it('rejects accounts, a umask and account checks anywhere but on a users machine', () => {
    expect(machineProblems({ ...webMachine, accounts: { users: [] } }).join('\n')).toMatch(/accounts need the users profile \(engine stage E3\)/);
    expect(machineProblems({ ...webMachine, profile: 'streams', umask: 0o027 }).join('\n')).toMatch(/a umask needs the users profile/);
    const f = filesContent();
    f.exercises[0].checks.push({ kind: 'user', name: 'learner' }, { kind: 'umask', umask: 0o022 });
    expect(terminalContentProblems(f).join('\n')).toMatch(/exercise current: a user check needs a users machine \(engine stage E3\)[\s\S]*a umask check needs a users machine/);
    const e3 = filesContent();
    e3.exercises[0].mistakes.push({ commands: ['sudo ln -s a b'], why: 'x' });
    expect(terminalContentProblems(e3).join('\n')).toMatch(/exercise current: sudo is not in the files profile of machine srv/);
  });
  it('reports bad accounts, owners that do not exist and generated files listed by hand', () => {
    const cases: [(c: TerminalLessonContent) => void, RegExp][] = [
      [c => { c.machines[0].groups = ['learner']; }, /the session's groups come from accounts/],
      [c => { c.machines[0].umask = 0o1000; }, /umask must be 0..0777/],
      [c => { c.machines[0].files.push({ path: '/etc/passwd', kind: 'file', mode: 0o644, owner: 'root' }); }, /file \/etc\/passwd: generated from accounts/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'bob' }); }, /user bob: needs a uid of 0..65534/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'Bob', uid: 1005 }); }, /user Bob: invalid name/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'bob', uid: 1001 }); }, /two accounts share the uid 1001/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'bob', uid: 1005, group: 'ops' }); }, /user bob: group ops is not a group of the machine/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'bob', uid: 1005, home: 'bob' }); }, /user bob: the home must be an absolute, normalized path/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'bob', uid: 1005, comment: 'a:b' }); }, /user bob: the comment must be/],
      [c => { c.machines[0].accounts!.users!.push({ name: 'root', uid: 5 }); }, /user root: its uid is 0/],
      [c => { c.machines[0].accounts!.groups!.push({ name: 'ops' }); }, /group ops: needs a gid/],
      [c => { c.machines[0].accounts!.groups!.push({ name: 'ops', gid: 27 }); }, /two accounts share the gid 27/],
      [c => { c.machines[0].accounts!.groups!.push({ name: 'ops', gid: 1200, members: ['bob'] }); }, /group ops: member bob is not a user of the machine/],
      [c => { c.machines[0].files.push({ path: '/srv/x', kind: 'file', mode: 0o644, owner: 'bob' }); }, /file \/srv\/x: owner bob is not a user of the machine/],
      [c => { c.machines[0].files.push({ path: '/srv/x', kind: 'file', mode: 0o644, owner: 'alice', group: 'ops' }); }, /file \/srv\/x: group ops is not a group of the machine/],
      [c => { c.exercises[0].checks.push({ kind: 'user', name: 'Bad' }); }, /invalid user or group name in a user check/],
      [c => { c.exercises[0].checks.push({ kind: 'group', name: 'devs', members: ['A B'] }); }, /invalid group or user name in a group check/],
      [c => { c.exercises[0].checks.push({ kind: 'umask', umask: -1 }); }, /check umask must be 0..0777/],
    ];
    for (const [edit, expected] of cases) expect(problems(edit), String(expected)).toMatch(expected);
  });
});
