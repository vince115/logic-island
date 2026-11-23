import {
  baseName, can, childrenOf, DEFAULT_HOST, DEFAULT_SYSTEM, depthOf, groupOf, groupsOf, humanSize, isInside, joinPath, LIMITS, linkTarget,
  MAX_LINK_HOPS, modeString, parentOf, physicalPath, resolvePath, subtreeOf, validName, type Access, type Accounts, type FsNode, type FsState, type Mount,
} from './fs';
import { ACCOUNT_NAME, accountsOf, findGroup, findUser, groupById, loginGroups, nextId, umaskSymbolic, writeAccountFiles } from './accounts';
import { escapeGlob, expandGlob, hasMagic, type GlobIo } from './glob';
import { helpPage, manualPage } from './manual';
import * as text from './text';
import * as proc from './processes';
import { dateText } from './clock';
import { apt, aptMark, dpkg } from './packages';
import { afterSignal, journalctl, systemctl, type SysIo } from './services';
import { formatDate, UTC_ZONE, zoneDate, zoneNamed, zoneOf } from './calendar';
import { activeState, closeOrphanForwards, remoteCommand, remoteRun, sshdControl } from './ssh';
import { runBash, runExecutable, runInteractive, runText, scriptInPath, serviceScript, type ScriptCtx } from './script';
import { scheduleCommand } from './schedule';
import { basicResolver, getent, ip, lsof, nc, ss, type NetIo } from './sockets';
import { afterSystemctl, dig, dnsResolver, host, namedCheckzone, resolvectl, rndc } from './dns';
import { curl } from './http';
import { openssl } from './openssl';
import { certbot } from './certbot';
import { hupsMaster, masterOf, nginxCommand, nginxControl, reloadRunning } from './nginx';
import { nft, ufw } from './firewall';
import { mtr, ping, tcpdump, traceroute } from './diag';
import { sed } from './sed';
import { docker } from './docker';

/*
 * P7 Linux Terminal Simulator: the command interpreter. A fixed table of commands works on the virtual file system in
 * fs.ts; anything else is "command not found". There is no eval, no process, no network and no access to the host:
 * the input is only split into words and matched against the table. Messages follow GNU coreutils and bash so they
 * look like a real terminal.
 *
 * LNX-0 (2026-11-22): the commands a session may use are a profile. LAB_PROFILE is today's table, and run() uses it by
 * default, so the lab and every existing caller behave exactly as before. Later engine stages (docs/curriculum/
 * LNX0_TERMINAL_CAPABILITY.md: E1 more file commands, E2 pipes and redirection…) add their commands in a profile of their
 * own, which a lesson opts into; nothing a stage adds reaches a profile that does not list it.
 *
 * Engine stage E1: FILES_PROFILE adds uname, hostname, man, df, du, ln and readlink, and the features glob (* ? [...]),
 * help-option (指令 --help), multi-source (cp/mv a b dir/) and ls-extra (ls -h -d, GNU grouping of the operands).
 * Symbolic links are followed by every command (with a hop limit); in the lab there are none, so nothing changes there.
 * Fidelity fixes of E2 (§10.6) ride on those features: help-option also brings GNU's long options and its "Try '… --help'"
 * line, glob also brings tilde expansion (~, ~/x, ~user), multi-source also brings GNU's `cp a nodir/` errors.
 *
 * Engine stage E2 (§10): STREAMS_PROFILE adds the feature pipes — pipelines (a | b | c), redirection on any command
 * (> >> < 2> 2>> 2>&1 >&2, /dev/null), standard input for the readers, and the text commands of text.ts plus tee.
 * Engine stage E3 (§11): USERS_PROFILE adds the feature accounts — the user and group database, id, groups, useradd,
 * usermod, groupadd, newgrp, sudo, chown, chgrp and umask.
 * Engine stages E4–E6 (§12–§14): PROCESSES_PROFILE adds the feature processes — the process table, signals, jobs
 * (sleep N &), the fixed clock and the exit status ($?, the only $ the lexer accepts); PACKAGES_PROFILE adds packages
 * (apt, apt-mark, dpkg); SERVICES_PROFILE adds services (systemctl, journalctl). Each includes the profile below it.
 * Engine stages E7–E9 (§15–§17): REMOTE_PROFILE adds the feature remote — other machines reachable with ssh (keys,
 * known_hosts, sshd_config; ssh.ts); SCRIPTING_PROFILE adds scripting — a bounded Bash interpreter for script files and
 * for the prompt itself (script.ts); SCHEDULING_PROFILE adds scheduling — time zones, crontabs and systemd timers
 * (schedule.ts, calendar.ts). Each again includes the profile below it.
 * Engine stages E10–E12 (docs/curriculum/SRV0_SERVER_CAPABILITY.md): SOCKETS_PROFILE adds the feature sockets — interfaces
 * and listening sockets derived from processes (ss, lsof, nc -z, ip, getent; sockets.ts); DNS_PROFILE adds dns — zone
 * files served by named, a caching stub resolver and name lookups through /etc/hosts and DNS (dig, host, named-checkzone,
 * rndc, resolvectl; dns.ts); HTTP_PROFILE adds http — HTTP/1.1 responders and curl (http.ts).
 * Engine stages E13–E14 (SRV0_SERVER_CAPABILITY.md §11–§12): TLS_PROFILE adds tls — certificates as simulated PEM files, a
 * trust store, openssl x509/s_client/verify, curl's real HTTPS and certbot's ACME HTTP-01 (tls.ts, openssl.ts, certbot.ts);
 * NGINX_PROFILE adds nginx — a parsed nginx configuration that serves files, nginx -t/-T/-s and reload semantics (nginx.ts).
 * Engine stages E15–E17 (SRV0_SERVER_CAPABILITY.md §16–§18): PROXY_PROFILE adds proxy — nginx's proxy_pass and upstream
 * blocks (nginx.ts, proxy.ts); FIREWALL_PROFILE adds firewall — ufw and an nft subset deciding what other hosts reach
 * (firewall.ts), and remote sessions that see the lesson's network; TUNNELS_PROFILE adds tunnels — ssh -L/-R/-J and
 * ~/.ssh/config (tunnels.ts).
 * Engine stage E20 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md): CONTAINERS_PROFILE adds containers — a Docker Engine with
 * images, containers, a simulated Docker Hub and published ports (docker.ts).
 */

export interface Line { text: string; kind: 'out' | 'err' }
export interface RunResult { state: FsState; lines: Line[]; clear?: true }

export const COMMANDS = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'chmod', 'echo', 'whoami', 'clear', 'help'] as const;
/** E1: the commands engine stage E1 adds (only FILES_PROFILE and the profiles above it have them). */
export const E1_COMMANDS = ['uname', 'hostname', 'man', 'df', 'du', 'ln', 'readlink'] as const;
/** E2: the text and stream commands (STREAMS_PROFILE and USERS_PROFILE). */
export const E2_COMMANDS = ['less', 'head', 'tail', 'grep', 'sort', 'uniq', 'wc', 'cut', 'tr', 'tee'] as const;
/** E3: the user, group and ownership commands (USERS_PROFILE). */
export const E3_COMMANDS = ['id', 'groups', 'useradd', 'usermod', 'groupadd', 'newgrp', 'sudo', 'chown', 'chgrp', 'umask'] as const;
/** E4: processes, signals, jobs and the fixed clock (PROCESSES_PROFILE and above). */
export const E4_COMMANDS = ['ps', 'top', 'kill', 'pgrep', 'pidof', 'pkill', 'sleep', 'jobs', 'fg', 'bg', 'date', 'uptime'] as const;
/** E5: package management (PACKAGES_PROFILE and above). */
export const E5_COMMANDS = ['apt', 'apt-mark', 'dpkg'] as const;
/** E6: systemd and the journal (SERVICES_PROFILE). */
export const E6_COMMANDS = ['systemctl', 'journalctl'] as const;
/** E7: SSH between the lesson's machines (REMOTE_PROFILE and above); exit leaves a remote session. */
export const E7_COMMANDS = ['ssh', 'ssh-keygen', 'ssh-copy-id', 'ssh-keyscan', 'scp', 'sshd', 'exit'] as const;
/** E8: the commands of scripts (SCRIPTING_PROFILE and above); read, set, local… are the interpreter's own builtins. */
export const E8_COMMANDS = ['bash', 'sh', 'test', '[', 'printf', 'true', 'false'] as const;
/** E9: scheduling (SCHEDULING_PROFILE); cron-next and cron-run are the simulation's teaching helpers, not real commands. */
export const E9_COMMANDS = ['crontab', 'cron-next', 'cron-run', 'flock', 'timedatectl', 'systemd-analyze'] as const;
/** E10: sockets, interfaces and ports (SOCKETS_PROFILE and above). */
export const E10_COMMANDS = ['ss', 'lsof', 'nc', 'ip', 'getent'] as const;
/** E11: DNS (DNS_PROFILE and above). */
export const E11_COMMANDS = ['dig', 'host', 'named-checkzone', 'rndc', 'resolvectl'] as const;
/** E12: HTTP with curl (HTTP_PROFILE and above). */
export const E12_COMMANDS = ['curl'] as const;
/** E13: certificates and ACME (TLS_PROFILE and above). */
export const E13_COMMANDS = ['openssl', 'certbot'] as const;
/** E14: nginx (NGINX_PROFILE and above). */
export const E14_COMMANDS = ['nginx'] as const;
/** E16: the host firewall (FIREWALL_PROFILE and above); E15 (proxy) and E17 (tunnels) add behaviour, not commands. */
export const E16_COMMANDS = ['ufw', 'nft'] as const;
/**
 * E19: network diagnostics (DIAGNOSTICS_PROFILE); E18 (edge) adds behaviour, not commands. sed is a documented subset that
 * only this profile and above list, so the `command not found` list of every lower profile (and of published lessons) stays.
 */
export const E19_COMMANDS = ['ping', 'traceroute', 'mtr', 'tcpdump', 'sed'] as const;
/** E20: the Docker CLI (CONTAINERS_PROFILE); only this profile lists it, so every lower profile's command list stays. */
export const E20_COMMANDS = ['docker'] as const;
/** The commands of the files profile (the manual of E1 covers exactly these). */
export type FilesCommand = typeof COMMANDS[number] | typeof E1_COMMANDS[number];
export type CommandName = FilesCommand | typeof E2_COMMANDS[number] | typeof E3_COMMANDS[number] | typeof E4_COMMANDS[number] | typeof E5_COMMANDS[number] | typeof E6_COMMANDS[number]
  | typeof E7_COMMANDS[number] | typeof E8_COMMANDS[number] | typeof E9_COMMANDS[number] | typeof E10_COMMANDS[number] | typeof E11_COMMANDS[number]
  | typeof E12_COMMANDS[number] | typeof E13_COMMANDS[number] | typeof E14_COMMANDS[number] | typeof E16_COMMANDS[number] | typeof E19_COMMANDS[number] | typeof E20_COMMANDS[number];
/** Every command any profile may list. */
export const ALL_COMMANDS: readonly CommandName[] = [...COMMANDS, ...E1_COMMANDS, ...E2_COMMANDS, ...E3_COMMANDS, ...E4_COMMANDS, ...E5_COMMANDS, ...E6_COMMANDS,
  ...E7_COMMANDS, ...E8_COMMANDS, ...E9_COMMANDS, ...E10_COMMANDS, ...E11_COMMANDS, ...E12_COMMANDS, ...E13_COMMANDS, ...E14_COMMANDS, ...E16_COMMANDS, ...E19_COMMANDS, ...E20_COMMANDS];

/**
 * Behaviour a profile switches on besides its commands. E1: glob (* ? [...] and ~), help-option (指令 --help, long
 * options, GNU's Try line), multi-source (cp and mv with several sources into a folder), ls-extra (ls -h -d, operands
 * grouped like GNU ls). E2: pipes (pipelines, redirection, standard input). E3: accounts (users, groups, umask).
 * E4: processes (the process table, jobs, $?). E5: packages. E6: services. E7: remote (ssh). E8: scripting (the Bash
 * interpreter, also at the prompt). E9: scheduling (time zones, cron, timers). E10: sockets. E11: dns. E12: http. E13: tls.
 * E14: nginx. E15: proxy (nginx's reverse proxy and upstreams). E16: firewall (ufw, nft; connections from other hosts). E17: tunnels
 * (ssh -L/-R/-J and ~/.ssh/config). E18: edge (HTTP caching: nginx's proxy_cache, validators, a CDN edge, time that passes with
 * sleep, curl -w timings). E19: diagnostics (ping, traceroute, mtr, tcpdump -r and a sed subset). E20: containers (docker).
 */
export type ShellFeature = 'glob' | 'help-option' | 'multi-source' | 'ls-extra' | 'pipes' | 'accounts' | 'processes' | 'packages' | 'services' | 'remote' | 'scripting' | 'scheduling'
  | 'sockets' | 'dns' | 'http' | 'tls' | 'nginx' | 'proxy' | 'firewall' | 'tunnels' | 'edge' | 'diagnostics' | 'containers';

/** LNX-0: the commands a session may run (E1: and the features it switches on; none by default). */
export interface ShellProfile { readonly id: string; readonly commands: readonly CommandName[]; readonly features?: readonly ShellFeature[] }
/** The P7 lab's table: every command above, no pipes. run() uses it when no profile is given. */
export const LAB_PROFILE: ShellProfile = { id: 'lab', commands: COMMANDS };
/** E1: the lab's commands plus file-system and system-information commands, globs, --help and multi-source cp/mv. */
export const FILES_PROFILE = {
  id: 'files',
  commands: ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'ln', 'readlink', 'chmod', 'echo', 'du', 'df', 'uname', 'hostname', 'whoami', 'man', 'clear', 'help'] as readonly FilesCommand[],
  features: ['glob', 'help-option', 'multi-source', 'ls-extra'] as readonly ShellFeature[],
} satisfies ShellProfile;
/** E2: the files profile plus pipelines, redirection and the text commands. */
export const STREAMS_PROFILE: ShellProfile = {
  id: 'streams',
  commands: ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'less', 'head', 'tail', 'grep', 'sort', 'uniq', 'wc', 'cut', 'tr', 'tee', 'cp', 'mv', 'rm', 'ln', 'readlink',
    'chmod', 'echo', 'du', 'df', 'uname', 'hostname', 'whoami', 'man', 'clear', 'help'],
  features: ['glob', 'help-option', 'multi-source', 'ls-extra', 'pipes'],
};
/** E3: the streams profile plus users, groups, sudo, ownership and umask. */
export const USERS_PROFILE: ShellProfile = {
  id: 'users',
  commands: [...STREAMS_PROFILE.commands.filter(c => c !== 'whoami' && c !== 'man' && c !== 'clear' && c !== 'help'),
    'chown', 'chgrp', 'umask', 'id', 'groups', 'whoami', 'useradd', 'usermod', 'groupadd', 'newgrp', 'sudo', 'man', 'clear', 'help'],
  features: ['glob', 'help-option', 'multi-source', 'ls-extra', 'pipes', 'accounts'],
};
const LAST: readonly CommandName[] = ['man', 'clear', 'help'];
/** A profile's commands with more added before man, clear and help. */
const above = (below: ShellProfile, added: readonly CommandName[]): CommandName[] => [...below.commands.filter(c => !LAST.includes(c)), ...added, ...LAST];
/** E4: the users profile plus processes, signals, jobs, the clock and $?. */
export const PROCESSES_PROFILE: ShellProfile = { id: 'processes', commands: above(USERS_PROFILE, E4_COMMANDS), features: [...USERS_PROFILE.features!, 'processes'] };
/** E5: the processes profile plus apt, apt-mark and dpkg. */
export const PACKAGES_PROFILE: ShellProfile = { id: 'packages', commands: above(PROCESSES_PROFILE, E5_COMMANDS), features: [...PROCESSES_PROFILE.features!, 'packages'] };
/** E6: the packages profile plus systemctl and journalctl. */
export const SERVICES_PROFILE: ShellProfile = { id: 'services', commands: above(PACKAGES_PROFILE, E6_COMMANDS), features: [...PACKAGES_PROFILE.features!, 'services'] };
/** E7: the services profile plus ssh, keys, known_hosts and other machines. */
export const REMOTE_PROFILE: ShellProfile = { id: 'remote', commands: above(SERVICES_PROFILE, E7_COMMANDS), features: [...SERVICES_PROFILE.features!, 'remote'] };
/** E8: the remote profile plus the Bash interpreter (scripts, and ; && || $var $(…) if for while case at the prompt). */
export const SCRIPTING_PROFILE: ShellProfile = { id: 'scripting', commands: above(REMOTE_PROFILE, E8_COMMANDS), features: [...REMOTE_PROFILE.features!, 'scripting'] };
/** E9: the scripting profile plus crontab, systemd timers, time zones and flock. */
export const SCHEDULING_PROFILE: ShellProfile = { id: 'scheduling', commands: above(SCRIPTING_PROFILE, E9_COMMANDS), features: [...SCRIPTING_PROFILE.features!, 'scheduling'] };
/** E10: the scheduling profile plus interfaces, listening sockets, ss, lsof, nc -z, ip and getent. */
export const SOCKETS_PROFILE: ShellProfile = { id: 'sockets', commands: above(SCHEDULING_PROFILE, E10_COMMANDS), features: [...SCHEDULING_PROFILE.features!, 'sockets'] };
/** E11: the sockets profile plus zones, named, the stub resolver's cache, dig, host, named-checkzone, rndc and resolvectl. */
export const DNS_PROFILE: ShellProfile = { id: 'dns', commands: above(SOCKETS_PROFILE, E11_COMMANDS), features: [...SOCKETS_PROFILE.features!, 'dns'] };
/** E12: the dns profile plus HTTP responders and curl. */
export const HTTP_PROFILE: ShellProfile = { id: 'http', commands: above(DNS_PROFILE, E12_COMMANDS), features: [...DNS_PROFILE.features!, 'http'] };
/** E13: the http profile plus certificates, the trust store, openssl, HTTPS in curl and certbot. */
export const TLS_PROFILE: ShellProfile = { id: 'tls', commands: above(HTTP_PROFILE, E13_COMMANDS), features: [...HTTP_PROFILE.features!, 'tls'] };
/** E14: the tls profile plus nginx's configuration, nginx -t/-T/-s and the files it serves. */
export const NGINX_PROFILE: ShellProfile = { id: 'nginx', commands: above(TLS_PROFILE, E14_COMMANDS), features: [...TLS_PROFILE.features!, 'nginx'] };
/** E15: the nginx profile plus reverse proxying (proxy_pass, upstream blocks, forwarding headers, 502/504). */
export const PROXY_PROFILE: ShellProfile = { id: 'proxy', commands: above(NGINX_PROFILE, []), features: [...NGINX_PROFILE.features!, 'proxy'] };
/** E16: the proxy profile plus the host firewall (ufw, nft) and connections that other hosts make. */
export const FIREWALL_PROFILE: ShellProfile = { id: 'firewall', commands: above(PROXY_PROFILE, E16_COMMANDS), features: [...PROXY_PROFILE.features!, 'firewall'] };
/** E17: the firewall profile plus SSH tunnels (-L, -R), jump hosts (-J, ProxyJump) and ~/.ssh/config. */
export const TUNNELS_PROFILE: ShellProfile = { id: 'tunnels', commands: above(FIREWALL_PROFILE, []), features: [...FIREWALL_PROFILE.features!, 'tunnels'] };
/** E18: the tunnels profile plus HTTP caching (proxy_cache, Cache-Control, validators, a CDN edge), sleep that moves the clock and curl -w timings. */
export const EDGE_PROFILE: ShellProfile = { id: 'edge', commands: above(TUNNELS_PROFILE, []), features: [...TUNNELS_PROFILE.features!, 'edge'] };
/** E19: the edge profile plus ping, traceroute, mtr, tcpdump -r and a documented subset of sed. */
export const DIAGNOSTICS_PROFILE: ShellProfile = { id: 'diagnostics', commands: above(EDGE_PROFILE, E19_COMMANDS), features: [...EDGE_PROFILE.features!, 'diagnostics'] };
/** E20: the diagnostics profile plus the Docker CLI: images, containers, a simulated Docker Hub and published ports. */
export const CONTAINERS_PROFILE: ShellProfile = { id: 'containers', commands: above(DIAGNOSTICS_PROFILE, E20_COMMANDS), features: [...DIAGNOSTICS_PROFILE.features!, 'containers'] };
/** The profiles a lesson machine may name (TerminalMachine.profile), from the narrowest. */
export const PROFILES = {
  lab: LAB_PROFILE, files: FILES_PROFILE, streams: STREAMS_PROFILE, users: USERS_PROFILE, processes: PROCESSES_PROFILE, packages: PACKAGES_PROFILE, services: SERVICES_PROFILE,
  remote: REMOTE_PROFILE, scripting: SCRIPTING_PROFILE, scheduling: SCHEDULING_PROFILE, sockets: SOCKETS_PROFILE, dns: DNS_PROFILE, http: HTTP_PROFILE,
  tls: TLS_PROFILE, nginx: NGINX_PROFILE, proxy: PROXY_PROFILE, firewall: FIREWALL_PROFILE, tunnels: TUNNELS_PROFILE, edge: EDGE_PROFILE, diagnostics: DIAGNOSTICS_PROFILE,
  containers: CONTAINERS_PROFILE,
} as const;
export type ProfileId = keyof typeof PROFILES;

/** Each help line with the command it describes (null: the heading); a profile prints the lines of its own commands. */
const HELP: [CommandName | null, string][] = [
  [null, '可用的指令（模擬環境，不會執行真實的 Shell）：'],
  ['pwd', '  pwd                    顯示目前所在的目錄'],
  ['ls', '  ls [-l] [-a] [路徑]     列出目錄內容；-l 顯示權限，-a 顯示隱藏項目'],
  ['cd', '  cd [路徑]               切換目錄；~ 是家目錄，.. 是上一層'],
  ['mkdir', '  mkdir [-p] 目錄…        建立目錄；-p 一併建立中間的目錄'],
  ['touch', '  touch 檔案…             建立空檔案'],
  ['cat', '  cat 檔案…               顯示檔案內容'],
  ['less', '  less 檔案…              顯示檔案內容（模擬環境不分頁，和 cat 相同）'],
  ['head', '  head [-n 行數] [檔案…]    顯示開頭幾行（預設 10 行）'],
  ['tail', '  tail [-n 行數] [檔案…]    顯示最後幾行；-n +N 從第 N 行開始'],
  ['grep', '  grep [-i] [-v] [-n] [-c] [-w] 樣式 [檔案…]  找出含有樣式的行'],
  ['sort', '  sort [-n] [-r] [-u] [-t 字元] [-k 欄] [檔案…]  排序各行'],
  ['uniq', '  uniq [-c] [-d] [-u] [檔案]  合併相鄰的重複行；-c 計算次數'],
  ['wc', '  wc [-l] [-w] [-m] [-c] [檔案…]  計算行數、字數、字元數與位元組數'],
  ['cut', '  cut -d 字元 -f 欄位 | -c 位置 [檔案…]  取出部分欄位或字元'],
  ['tr', '  tr [-d] [-s] 集合1 [集合2]  轉換或刪除字元（只讀標準輸入）'],
  ['tee', '  tee [-a] 檔案…           把標準輸入同時印出並寫入檔案'],
  ['echo', '  echo 文字 [> 或 >> 檔案]  輸出文字，或寫入（>）、附加（>>）到檔案'],
  ['cp', '  cp [-r] 來源 目的地       複製；複製目錄要加 -r'],
  ['mv', '  mv 來源 目的地           移動或改名'],
  ['rm', '  rm [-r] [-f] 路徑…       刪除；刪除目錄要加 -r（無法復原）'],
  ['chmod', '  chmod 模式 路徑…         修改權限，例如 chmod 644 a.txt、chmod u+x run.sh'],
  ['chown', '  chown [-R] 使用者[:群組] 路徑…  修改擁有者與群組'],
  ['chgrp', '  chgrp [-R] 群組 路徑…      修改群組'],
  ['umask', '  umask [-S] [模式]         顯示或設定新檔案的權限遮罩'],
  ['ln', '  ln -s 目標 連結名稱       建立符號連結'],
  ['readlink', '  readlink [-f] 連結       顯示連結指向的目標'],
  ['du', '  du [-s] [-h] [-a] [路徑…]  估計目錄占用的空間'],
  ['df', '  df [-h] [-T] [路徑…]      顯示各個檔案系統的空間用量'],
  ['uname', '  uname [-a] [-s] [-r] [-m]  顯示核心與系統資訊'],
  ['hostname', '  hostname               顯示主機名稱'],
  ['id', '  id [使用者]              顯示 UID、GID 與所屬的群組'],
  ['groups', '  groups [使用者…]         顯示所屬的群組'],
  ['useradd', '  useradd [-m] [-s shell] [-G 群組] [-r] 名稱  建立使用者（需要 root）'],
  ['usermod', '  usermod -aG 群組 使用者     把使用者加入群組；沒有 -a 的 -G 會取代原有的群組'],
  ['groupadd', '  groupadd [-r] 名稱        建立群組（需要 root）'],
  ['newgrp', '  newgrp [群組]            以新的群組身分繼續（剛加入的群組不必重新登入）'],
  ['sudo', '  sudo [-u 使用者] 指令…     以 root（或指定的使用者）身分執行'],
  ['ps', '  ps [aux | -ef] [-u 使用者] [-p PID] [-o 欄位] [--sort=-%cpu]  列出行程'],
  ['top', '  top -b -n 1 [-o %MEM]     一次的行程快照（依 %CPU 排序）'],
  ['kill', '  kill [-訊號] PID|%工作…    送訊號（預設 SIGTERM，-9 是 SIGKILL）；kill -l 列出訊號'],
  ['pgrep', '  pgrep [-l] [-a] [-f] 樣式   依名稱找出行程的 PID'],
  ['pidof', '  pidof 程式               列出程式的 PID'],
  ['pkill', '  pkill [-訊號] [-f] 樣式    依名稱送訊號'],
  ['sleep', '  sleep 秒數 [&]           等待（模擬時鐘不前進，立即結束）；加 & 放到背景'],
  ['jobs', '  jobs [-l]                列出背景工作'],
  ['fg', '  fg [%N]                  把背景工作移到前景'],
  ['bg', '  bg [%N]                  讓停止的工作在背景繼續'],
  ['date', '  date                     顯示機器的時間（固定不動）'],
  ['uptime', '  uptime                   開機多久與平均負載'],
  ['apt', '  apt update|install|remove|purge|autoremove|upgrade|list|show|policy  套件管理（變更需要 root）'],
  ['apt-mark', '  apt-mark hold|unhold|showhold 套件  鎖定套件的版本'],
  ['dpkg', '  dpkg -l [樣式] | -L 套件 | -s 套件  查看已安裝的套件'],
  ['systemctl', '  systemctl start|stop|restart|status|enable|disable|daemon-reload 服務  管理 systemd 服務'],
  ['journalctl', '  journalctl [-u 服務] [-p err] [--since 時間] [-n N] [-r]  查詢 journal 日誌'],
  ['ssh', '  ssh [-i 金鑰] [-o 選項] [使用者@]主機 [指令]  登入遠端主機，或在遠端執行一個指令'],
  ['ssh-keygen', '  ssh-keygen -t ed25519 [-f 檔案] -N \'\' | -l -f 檔案 | -R 主機  產生金鑰、看指紋、移除 known_hosts 的主機'],
  ['ssh-copy-id', '  ssh-copy-id [-i 公鑰] 使用者@主機  把公鑰加到遠端的 authorized_keys（需要密碼登入）'],
  ['ssh-keyscan', '  ssh-keyscan 主機           取得主機的公鑰（可接 >> ~/.ssh/known_hosts）'],
  ['scp', '  scp 來源 [使用者@]主機:路徑  在本機與遠端之間複製檔案'],
  ['sshd', '  sshd -t | -T              檢查 /etc/ssh/sshd_config（需要 root）'],
  ['exit', '  exit [N]                 離開遠端的工作階段（或結束指令稿）'],
  ['bash', '  bash [-n] [-x] 指令稿 [參數…] | -c 指令  執行 Bash 指令稿'],
  ['sh', '  sh 指令稿 [參數…]          以 sh 執行指令稿（模擬環境和 bash 相同）'],
  ['test', '  test 條件、[ 條件 ]        檢查檔案與字串、比較整數（結束碼 0 是成立）'],
  ['printf', '  printf 格式 [參數…]        依格式輸出（%s %d %5.2f 等）'],
  ['crontab', '  crontab 檔案 | -l | -r [-u 使用者]  安裝、列出、刪除自己的 crontab'],
  ['cron-next', '  cron-next [-n N] \'分 時 日 月 週\' | -l  （教學輔助）列出接下來的執行時間'],
  ['cron-run', '  cron-run                  （教學輔助）以 cron 的環境執行下一批到期的工作'],
  ['flock', '  flock [-n] 鎖檔 指令…       取得鎖才執行，避免重疊執行'],
  ['timedatectl', '  timedatectl              顯示時間與時區'],
  ['systemd-analyze', '  systemd-analyze calendar 運算式  計算 OnCalendar= 接下來的觸發時間'],
  ['ss', '  ss [-t] [-u] [-l] [-a] [-n] [-p]  列出 socket（-tlnp：監聽中的 TCP 埠與程式）'],
  ['lsof', '  lsof -i [:埠] [-n] [-P]        列出開啟網路 socket 的行程（看別人的行程要 sudo）'],
  ['nc', '  nc -zv 主機 埠               檢查能不能連到主機的 TCP 埠'],
  ['ip', '  ip addr | ip -br addr | ip route  顯示介面位址與路由'],
  ['getent', '  getent hosts 名稱 | services 名稱  依 /etc/hosts、DNS 與 /etc/services 查詢'],
  ['dig', '  dig [@伺服器] 名稱 [類型] [+short]  查詢 DNS 記錄'],
  ['host', '  host [-t 類型] 名稱 [伺服器]     以簡短的句子查詢 DNS'],
  ['named-checkzone', '  named-checkzone 區域 檔案        檢查區域檔'],
  ['rndc', '  rndc reload [區域]             讓 named 重新載入區域檔（需要 root）'],
  ['resolvectl', '  resolvectl flush-caches        清除本機解析器的快取（需要 root）'],
  ['curl', '  curl [-v] [-I] [-L] [-s] [-o 檔案] [-w 格式] 網址  送出 HTTP 請求'],
  ['openssl', '  openssl x509 -in 檔案 -noout -dates | s_client -connect 主機:443 | verify  查看與驗證憑證'],
  ['certbot', '  certbot certonly --webroot -w 目錄 -d 網域 | --nginx | certificates | renew  向 Let\'s Encrypt 取得與更新憑證（需要 root）'],
  ['nginx', '  nginx -t | -T | -s reload      檢查、印出與重新載入 nginx 的設定（需要 root）'],
  ['ufw', '  ufw status | allow | deny | enable | delete …  設定主機防火牆（需要 root）'],
  ['nft', '  nft list ruleset | add rule inet filter input …  以 nftables 設定封包過濾（需要 root）'],
  ['ping', '  ping -c 次數 主機              送 ICMP echo，看主機回不回應、來回時間與遺失率'],
  ['traceroute', '  traceroute [-n] [-I|-T] 主機    列出封包經過的每一個路由器'],
  ['mtr', '  mtr --report -c 次數 [-n] [-w] 主機  每一跳的遺失率與延遲統計'],
  ['tcpdump', '  tcpdump -r 擷取檔 [-n] [-A] [-c N] [過濾條件]  讀取擷取的封包'],
  ['sed', '  sed [-n] [-i] [-E] \'Np\' | \'/樣式/p\' | \'s/舊/新/[g]\' [檔案…]  印出或取代行（模擬環境的子集）'],
  ['docker', '  docker run|ps|images|pull|logs|exec|stop|start|rm|rmi|port|inspect …  管理 Image 與 Container（需要 docker 群組或 sudo）'],
  ['man', '  man 指令                顯示指令的說明頁（也可以用 指令 --help）'],
];
/** The lines that change when a profile has the feature (the lab keeps its own lines). */
const HELP_FEATURE: [ShellFeature, CommandName, string][] = [
  ['ls-extra', 'ls', '  ls [-l] [-a] [-h] [-d] [路徑…]  列出目錄內容；-l 詳細資料，-a 隱藏項目，-h 易讀的大小，-d 目錄本身'],
  ['multi-source', 'cp', '  cp [-r] 來源… 目的地      複製；複製目錄要加 -r；多個來源時目的地必須是目錄'],
  ['multi-source', 'mv', '  mv 來源… 目的地          移動或改名；多個來源時目的地必須是目錄'],
  ['pipes', 'cat', '  cat [-n] [檔案…]          顯示檔案內容；沒有檔案時讀標準輸入'],
  ['pipes', 'echo', '  echo [-n] [-e] 文字…       輸出一行文字；-n 不換行'],
  ['accounts', 'chmod', '  chmod [-R] 模式 路徑…      修改權限，例如 chmod 640 a.txt、chmod -R g+w 目錄'],
  ['edge', 'date', '  date [-u] [+格式]          顯示機器的時間（sleep 會讓時鐘前進；有時區時依時區）'],
  ['scripting', 'date', '  date [-u] [+格式]          顯示機器的時間（固定不動；有時區時依時區）'],
  ['edge', 'sleep', '  sleep 秒數 [&]           等待：模擬的時鐘前進這麼多秒（快取過期、Age 增加）；加 & 放到背景'],
  ['tunnels', 'ssh', '  ssh [-J 跳板機] [-L 埠:主機:埠] [-R 埠:主機:埠] [-f -N] [使用者@]主機 [指令]  登入、執行指令、建立 SSH 通道'],
];
const HELP_LAST: CommandName[] = ['whoami', 'clear', 'help'];

export type Errno = 'ENOENT' | 'ENOTDIR' | 'EACCES' | 'ELOOP';
type Fail = { error: Errno };
/** The node (if any) and its real path: every link on the way followed (the last one too when following). */
export type Found = { node: FsNode | undefined; path: string };
/** E2: why a file could not be opened for writing. */
export type OpenErrno = Errno | 'EISDIR' | 'ENAMETOOLONG' | 'ENOSPC';

export const ERRNO = { ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EACCES: 'Permission denied', ELOOP: 'Too many levels of symbolic links' } as const;
export const OPEN_TEXT: Record<OpenErrno, string> = { ...ERRNO, EISDIR: 'Is a directory', ENAMETOOLONG: 'File name too long', ENOSPC: 'No space left on device' };

/**
 * Walks to a path: every folder on the way must exist and be searchable (x). The node itself may be missing. E1: a
 * symbolic link on the way is followed (the last part only when `follow`), at most MAX_LINK_HOPS times (then ELOOP).
 */
export function walk(state: Pick<FsState, 'nodes' | 'user' | 'groups'>, path: string, follow = true): Fail | Found {
  const rest = path.split('/').filter(Boolean);
  let at = '/', hops = 0;
  while (rest.length) {
    const node = state.nodes.get(at);
    if (!node) return { error: 'ENOENT' };
    if (node.kind !== 'dir') return { error: 'ENOTDIR' };
    if (!can(node, state.user, 'x', groupsOf(state))) return { error: 'EACCES' };
    const next = joinPath(at, rest.shift()!), found = state.nodes.get(next);
    if (found?.kind === 'link' && (rest.length || follow)) {
      if (++hops > MAX_LINK_HOPS) return { error: 'ELOOP' };
      rest.unshift(...linkTarget(at, found.target ?? '').split('/').filter(Boolean));
      at = '/';
      continue;
    }
    at = next;
  }
  return { node: state.nodes.get(at), path: at };
}

/**
 * A word of a command line with its glob pattern (quoted characters escaped). E1: `tilde` when it starts with an
 * unquoted ~. E2: `op` for an operator of the pipes feature (| < > >> 2> 2>> 2>&1 >&2), which quoting never produces.
 */
export interface Word { text: string; pattern: string; tilde?: true; op?: string }

/** The words of a command line, each with its glob pattern (quoted characters escaped); see tokenize. */
function lex(input: string): { words: Word[] } | { error: string } {
  const words: Word[] = [];
  let word = '', pattern = '', quote: '"' | "'" | null = null, started = false, lastRedirect = false, tilde = false;
  const end = () => { if (started) { words.push({ text: word, pattern, ...tilde ? { tilde } : {} }); word = ''; pattern = ''; started = false; tilde = false; } };
  for (const ch of input) {
    if (quote) { if (ch === quote) quote = null; else { word += ch; pattern += escapeGlob(ch); } continue; }
    if (ch === '>') {
      if (lastRedirect && !started && words.at(-1)?.text === '>') words[words.length - 1] = { text: '>>', pattern: '>>' };
      else { end(); words.push({ text: '>', pattern: '>' }); }
      lastRedirect = true; continue;
    }
    lastRedirect = false;
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) { end(); continue; }
    if (!started && ch === '~') tilde = true;
    // Unquoted, only a backslash is escaped (this tokenizer gives it no meaning); * ? [ ] keep their glob meaning.
    word += ch; pattern += ch === '\\' ? '\\\\' : ch; started = true;
  }
  if (quote) return { error: 'bash: unexpected EOF while looking for matching quote' };
  end();
  return { words };
}

const REFUSED = '此模擬器不支援管線、指令串接、變數與背景執行（| ; && $ `）；一次輸入一個指令。';
/** E2: what the pipes feature still refuses. */
const REFUSED_PIPES = '此模擬器不支援指令串接、變數、命令替換與背景執行（; && || $ ` &）；管線（|）與重新導向（> >> < 2> 2>&1）可以使用。';
/** E4: what the processes feature still refuses ($? and a final & are allowed). */
const REFUSED_STATUS = '此模擬器不支援指令串接、變數（$? 以外）與命令替換（; && || $ `）；背景執行只能在行尾（sleep 300 &）；管線與重新導向可以使用。';

/**
 * E2: the words of a line for the pipes feature. Unquoted | < > >> are operators; a word that is just an unquoted 1 or 2
 * right before > makes it a redirection of that descriptor (2> 2>>), and >&1 >&2 duplicate one. ; && || $ ` and a
 * background & are refused, as are here-documents (<<).
 */
function lexLine(input: string, opts: { status?: number } = {}): { words: Word[]; background?: true } | { error: string } {
  const words: Word[] = [];
  let word = '', pattern = '', quote: '"' | "'" | null = null, started = false, quoted = false, tilde = false;
  // E4 (processes): $? becomes the last exit status (not inside single quotes), and a final & runs the line in the background.
  const status = opts.status !== undefined ? String(opts.status) : null, refused = status === null ? REFUSED_PIPES : REFUSED_STATUS;
  const reset = () => { word = ''; pattern = ''; started = false; quoted = false; tilde = false; };
  const end = () => { if (started) words.push({ text: word, pattern, ...tilde ? { tilde } : {} }); reset(); };
  const cs = Array.from(input);
  for (let i = 0; i < cs.length; i++) {
    const ch = cs[i];
    if (status !== null && ch === '$' && cs[i + 1] === '?' && quote !== "'") { word += status; pattern += status; started = true; i++; continue; }
    if (quote) { if (ch === quote) quote = null; else { word += ch; pattern += escapeGlob(ch); } continue; }
    if (ch === '"' || ch === "'") { quote = ch; started = true; quoted = true; continue; }
    if (/\s/.test(ch)) { end(); continue; }
    if (status !== null && ch === '&' && cs[i + 1] !== '&' && cs[i - 1] !== '&' && cs.slice(i + 1).every(c => /\s/.test(c))) {
      end();
      if (!words.length) return { error: 'bash: syntax error near unexpected token `&\'' };
      return { words, background: true };
    }
    if (ch === ';' || ch === '`' || ch === '$' || ch === '&' || (ch === '|' && cs[i + 1] === '|') || (ch === '<' && cs[i + 1] === '<')) return { error: refused };
    if (ch === '|' || ch === '<') { end(); words.push({ text: ch, pattern: ch, op: ch }); continue; }
    if (ch === '>') {
      const fd = started && !quoted && (word === '1' || word === '2') ? word : '';
      if (fd) reset(); else end();
      let op = fd === '2' ? '2>' : '>';
      if (cs[i + 1] === '>') { op += '>'; i++; }
      else if (cs[i + 1] === '&') {
        if (cs[i + 2] !== '1' && cs[i + 2] !== '2') return { error: refused };
        op = `${fd === '2' ? '2' : ''}>&${cs[i + 2]}`;
        i += 2;
      }
      words.push({ text: op, pattern: op, op });
      continue;
    }
    if (!started && ch === '~') tilde = true;
    word += ch; pattern += ch === '\\' ? '\\\\' : ch; started = true;
  }
  if (quote) return { error: 'bash: unexpected EOF while looking for matching quote' };
  end();
  return { words };
}

/**
 * Splits a command line into words: whitespace separates, single and double quotes group, an unquoted > or >> is a
 * word of its own (echo hi>a.txt works), and nothing is expanded (E1: run() expands globs afterwards when the profile
 * has the glob feature).
 */
export function tokenize(input: string): { words: string[] } | { error: string } {
  const lexed = lex(input);
  return 'error' in lexed ? lexed : { words: lexed.words.map(w => w.text) };
}

const REDIRECTS = ['<', '>', '>>', '2>', '2>>'];
/** E2: one stage of a pipeline. E8: the interpreter builds stages with expanded words; its here-documents are the op 'here' (the word is the text). */
export interface Stage { argv: Word[]; redirects: { op: string; word?: Word }[] }

/** E2: a line's pipeline (stages split at |, each with its redirections in order), or bash's syntax error. */
function parseLine(words: Word[]): { stages: Stage[] } | { error: string } {
  const stages: Stage[] = [{ argv: [], redirects: [] }];
  const empty = (s: Stage) => !s.argv.length && !s.redirects.length;
  for (let i = 0; i < words.length; i++) {
    const w = words[i], stage = stages.at(-1)!;
    if (w.op === '|') {
      if (empty(stage)) return { error: 'bash: syntax error near unexpected token `|\'' };
      stages.push({ argv: [], redirects: [] });
      continue;
    }
    if (w.op && REDIRECTS.includes(w.op)) {
      const target = words[i + 1];
      if (!target || target.op) return { error: `bash: syntax error near unexpected token \`${target?.op ?? 'newline'}'` };
      stage.redirects.push({ op: w.op, word: target });
      i++;
      continue;
    }
    if (w.op) { stage.redirects.push({ op: w.op }); continue; }
    stage.argv.push(w);
  }
  if (stages.length > 1 && empty(stages.at(-1)!)) return { error: 'bash: syntax error: unexpected end of file' };
  return { stages };
}

/** E2: the command names a line runs — each stage of a pipeline and the command sudo runs (for the lesson validator). */
export function commandNames(input: string): string[] {
  const lexed = lexLine(input, { status: 0 }), parsed = 'error' in lexed ? null : parseLine(lexed.words);
  if (!parsed || 'error' in parsed) {
    const t = tokenize(input);
    return 'words' in t && t.words.length ? [t.words[0]] : [];
  }
  return parsed.stages.flatMap(s => {
    const argv = s.argv.map(w => w.text);
    if (argv[0] !== 'sudo') return argv.slice(0, 1);
    let i = 1;
    while (i < argv.length && argv[i].startsWith('-')) i += argv[i] === '-u' ? 2 : 1;
    return argv[i] ? ['sudo', argv[i]] : ['sudo'];
  });
}

/** Leading -abc options (any order, combinable) and the remaining operands; `--` ends the options. With `gnu` (help-option), --name is a long option. */
function options(args: string[], allowed: string, longs: Readonly<Record<string, string>> = {}, gnu = false): { flags: Set<string>; operands: string[] } | { bad: string; long?: true } {
  const flags = new Set<string>(), operands: string[] = [];
  let done = false;
  for (const arg of args) {
    if (!done && arg === '--') { done = true; continue; }
    if (gnu && !done && arg.startsWith('--')) {
      const f = longs[arg.slice(2)];
      if (f === undefined) return { bad: arg, long: true };
      flags.add(f);
      continue;
    }
    if (!done && arg.startsWith('-') && arg.length > 1) {
      for (const f of arg.slice(1)) { if (!allowed.includes(f)) return { bad: f }; flags.add(f); }
    } else operands.push(arg);
  }
  return { flags, operands };
}
/** Fix 1: the long options each E1 command knows (GNU's names). */
const LONG: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ls: { all: 'a', 'human-readable': 'h', directory: 'd' },
  mkdir: { parents: 'p' },
  cp: { recursive: 'r' },
  rm: { recursive: 'r', force: 'f' },
  du: { summarize: 's', 'human-readable': 'h', all: 'a' },
  df: { 'human-readable': 'h', 'print-type': 'T' },
  uname: { all: 'a', 'kernel-name': 's', nodename: 'n', 'kernel-release': 'r', 'kernel-version': 'v', machine: 'm', 'operating-system': 'o' },
  ln: { symbolic: 's', force: 'f' },
  readlink: { canonicalize: 'f' },
  chown: { recursive: 'R' },
  chgrp: { recursive: 'R' },
  cat: { number: 'n' },
  less: {},
  head: { lines: 'n', bytes: 'c', verbose: 'v' },
  tail: { lines: 'n', bytes: 'c', follow: 'f', verbose: 'v' },
  grep: {
    'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', 'word-regexp': 'w', 'line-regexp': 'x', recursive: 'r', 'dereference-recursive': 'R',
    'files-with-matches': 'l', 'extended-regexp': 'E', 'fixed-strings': 'F', 'with-filename': 'H', 'no-filename': 'h', regexp: 'e',
    'only-matching': 'o', 'after-context': 'A', 'before-context': 'B', context: 'C', quiet: 'q', silent: 'q',
  },
  sort: { 'numeric-sort': 'n', reverse: 'r', unique: 'u', 'ignore-case': 'f', key: 'k', 'field-separator': 't' },
  uniq: { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' },
  wc: { lines: 'l', words: 'w', chars: 'm', bytes: 'c' },
  cut: { delimiter: 'd', fields: 'f', characters: 'c', bytes: 'b', 'only-delimited': 's' },
  tr: { delete: 'd', 'squeeze-repeats': 's', complement: 'c' },
  tee: { append: 'a' },
  id: { user: 'u', group: 'g', groups: 'G', name: 'n' },
};
/** E2: the option letters (':' takes a value) of the commands parsed with text.getopt. */
const SPEC: Readonly<Record<string, string>> = {
  cat: 'n', less: '', head: 'n:c:v', tail: 'n:c:fv', grep: 'ivncwxrRlEFHhe:oA:B:C:q', sort: 'nrufk:t:', uniq: 'cdui', wc: 'lwmc', cut: 'd:f:c:b:s', tr: 'dscC', tee: 'a', id: 'ugGn',
};

const byteLength = (text: string) => new TextEncoder().encode(text).length;
/** E1: a path as the learner wrote it with a name after it (du, ln, glob). */
const joinShown = (at: string, name: string) => at.endsWith('/') ? at + name : `${at}/${name}`;
/** E1: du's block rule: a folder takes 4K, a file its size rounded up to whole 4K blocks, a link nothing (KiB). */
const blocksOf = (node: FsNode) => node.kind === 'dir' ? 4 : node.kind === 'link' ? 0 : Math.ceil(byteLength(node.content ?? '') / 4096) * 4;
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** E3: the session's umask (022 when the state has none, which gives the lab's 644 files and 755 folders). */
export const maskOf = (state: Pick<FsState, 'umask'>) => state.umask ?? 0o022;
/** E3: who owns a new node: the user, and with accounts the session's primary group when it is not the user's own name. */
export function ownedBy(state: FsState): Pick<FsNode, 'owner' | 'group'> {
  const primary = state.accounts ? groupsOf(state)[0] : undefined;
  return primary && primary !== state.user ? { owner: state.user, group: primary } : { owner: state.user };
}

/** Applies an octal (644) or symbolic (u+x, go-w, a=r, +x; clauses joined by commas) mode; undefined if invalid. */
export function applyMode(mode: number, spec: string): number | undefined {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8) & 0o777;
  let next = mode;
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
    if (!m) return undefined;
    const who = m[1] && !m[1].includes('a') ? m[1] : 'ugo';
    const bits = (m[3].includes('r') ? 4 : 0) | (m[3].includes('w') ? 2 : 0) | (m[3].includes('x') ? 1 : 0);
    for (const w of who) {
      const shift = w === 'u' ? 6 : w === 'g' ? 3 : 0, mask = 7 << shift, value = bits << shift;
      next = m[2] === '+' ? next | value : m[2] === '-' ? next & ~value : (next & ~mask) | value;
    }
  }
  return next;
}

/**
 * E1: df's table. Columns as GNU df: Filesystem (at least 14 wide), [Type (4)], size (5), Used (5), Avail (5), Use% (4)
 * right-aligned, then Mounted on; one space between columns. Use% is used / size rounded up; Avail is size − used.
 */
function dfTable(mounts: readonly Mount[], human: boolean, types: boolean): string[] {
  const size = (kib: number) => human ? humanSize(kib * 1024) : String(kib);
  const header = ['Filesystem', ...types ? ['Type'] : [], human ? 'Size' : '1K-blocks', 'Used', human ? 'Avail' : 'Available', 'Use%', 'Mounted on'];
  const min = [14, ...types ? [4] : [], 5, 5, 5, 4, 0];
  const right = [false, ...types ? [false] : [], true, true, true, true, false];
  const rows = [header, ...mounts.map(m => [m.device, ...types ? [m.type] : [], size(m.size), size(m.used), size(m.size - m.used),
    m.size ? `${Math.ceil(m.used * 100 / m.size)}%` : '-', m.path])];
  const widths = header.map((_, i) => Math.max(min[i], ...rows.map(r => r[i].length)));
  return rows.map(r => r.map((cell, i) => i === r.length - 1 ? cell : right[i] ? cell.padStart(widths[i]) : cell.padEnd(widths[i])).join(' '));
}

/** E1: what a glob may see: readable folders' names, what exists (a dangling link too), what is a folder. */
function globIo(state: FsState): GlobIo {
  const resolve = (p: string) => physicalPath(state.nodes, resolvePath(state, p));
  return {
    list: p => {
      const v = walk(state, resolve(p || '.'));
      return 'error' in v || v.node?.kind !== 'dir' || !can(v.node, state.user, 'r', groupsOf(state)) ? null : childrenOf(state.nodes, v.path).map(baseName);
    },
    exists: p => { const v = walk(state, resolve(p), false); return !('error' in v) && !!v.node; },
    isDir: p => { const v = walk(state, resolve(p)); return !('error' in v) && v.node?.kind === 'dir'; },
  };
}

/** Fix 3 (glob feature): ~ ~/x and ~user at the start of an unquoted word become the home folder, as bash expands them. */
function tilde(state: FsState, word: Word): Word {
  if (!word.tilde) return word;
  const cut = (s: string) => { const at = s.indexOf('/'); return at < 0 ? s.length : at; };
  const name = word.text.slice(1, cut(word.text));
  const home = !name || name === state.user ? state.home
    : state.accounts ? findUser(state.accounts, name)?.home : name === 'root' ? '/root' : undefined;
  if (home === undefined) return word;
  return { text: home + word.text.slice(cut(word.text)), pattern: Array.from(home).map(escapeGlob).join('') + word.pattern.slice(cut(word.pattern)) };
}

/** E1: tilde and pathname expansion of the words (the glob feature); `literal` words are only tilde-expanded. */
function expand(state: FsState, words: readonly Word[], features: ReadonlySet<ShellFeature>, literal: (i: number) => boolean): string[] {
  if (!features.has('glob')) return words.map(w => w.text);
  return words.flatMap((w0, i) => {
    const w = tilde(state, w0);
    if (literal(i) || !hasMagic(w.pattern)) return [w.text];
    const found = expandGlob(w.pattern, state.home, globIo(state));
    return found.length ? found : [w.text];
  });
}

/** E8: pathname expansion of words the interpreter already expanded (for, function arguments, its own builtins). */
export function globFields(state: FsState, fields: readonly Word[], profile: ShellProfile): string[] {
  return expand(state, fields, new Set(profile.features ?? []), () => false);
}

/** E2: reads a file for a command or for <; /dev/null is empty (the simulation has no device files). */
export function readPath(state: FsState, word: string): text.ReadResult {
  const logical = resolvePath(state, word);
  if (logical === '/dev/null' && !state.nodes.has('/dev/null')) return { text: '', regular: false };
  const w = walk(state, physicalPath(state.nodes, logical));
  if ('error' in w) return w;
  if (!w.node) return { error: 'ENOENT' };
  if (w.node.kind === 'dir') return { error: 'EISDIR' };
  if (!can(w.node, state.user, 'r', groupsOf(state))) return { error: 'EACCES' };
  return { text: w.node.content ?? '', regular: true };
}

/**
 * E2: opens a file for writing the way bash does for > and >> (and tee): an existing file needs w (it is truncated unless
 * appending; it keeps its mode, owner and group); a new one needs w and x on its folder and is 666 & ~umask, owned by
 * the user. Changes `nodes`; path null is /dev/null (output discarded).
 */
export function openWrite(nodes: Map<string, FsNode>, who: FsState, word: string, append: boolean): { path: string | null } | { error: OpenErrno } {
  const logical = resolvePath(who, word);
  if (logical === '/dev/null' && !nodes.has('/dev/null')) return { path: null };
  const view = { ...who, nodes };
  const w = walk(view, physicalPath(nodes, logical));
  if ('error' in w) return w;
  if (w.node?.kind === 'dir') return { error: 'EISDIR' };
  if (w.node) {
    if (!can(w.node, who.user, 'w', groupsOf(who))) return { error: 'EACCES' };
    if (!append) nodes.set(w.path, { ...w.node, content: '' });
    return { path: w.path };
  }
  const parent = walk(view, parentOf(w.path));
  if ('error' in parent) return parent;
  if (!parent.node) return { error: 'ENOENT' };
  if (parent.node.kind !== 'dir') return { error: 'ENOTDIR' };
  if (!can(parent.node, who.user, 'w', groupsOf(who)) || !can(parent.node, who.user, 'x', groupsOf(who))) return { error: 'EACCES' };
  if (!validName(baseName(w.path)) || depthOf(w.path) > LIMITS.depth) return { error: 'ENAMETOOLONG' };
  if (nodes.size + 1 > LIMITS.nodes) return { error: 'ENOSPC' };
  nodes.set(w.path, { kind: 'file', mode: 0o666 & ~maskOf(who), ...ownedBy(who), content: '' });
  return { path: w.path };
}

/** One write of a command: fd 1 is standard output (raw text), fd 2 standard error (whole lines with their newline). */
export interface Ev { fd: 1 | 2; data: string }
interface Ctx {
  profile: ShellProfile;
  features: ReadonlySet<ShellFeature>;
  /** E2: standard input; null is the keyboard, which the simulation does not have. */
  stdin: string | null;
  stdinRegular: boolean;
  /** E2: whether standard output is the terminal (ls prints one name per line, without / and @, when it is not). */
  tty: boolean;
  /** E4: the command words of every stage of the line (ps lists them as processes). */
  peers?: string[][];
  /** E4: run by sudo (kill is then /bin/kill, not bash's builtin). */
  sudo?: boolean;
  /** E8: the exported variables of the interpreter that runs the command (PATH, TZ…); default the login environment. */
  env?: Readonly<Record<string, string>>;
  /** E8: the script that runs the command (its step budget and nesting), if any. */
  script?: ScriptCtx;
}
/** status: the exit status (E4: $?). notices: bash's job notices ([1]+  Terminated …), printed on the terminal. */
export interface Exec { state: FsState; events: Ev[]; status: number; clear?: true; notices?: string[] }

/** E10–E12: the network commands and the module function of each. */
const NET_COMMANDS = { ss, lsof, nc, ip, getent, dig, host, 'named-checkzone': namedCheckzone, rndc, resolvectl, curl, openssl, nginx: nginxCommand, ufw, nft, ping, traceroute, mtr, tcpdump } as const;

/** E13: certbot.service's ExecStart=/usr/bin/certbot -q renew runs the simulation's certbot (its output goes to the journal). */
function certbotService(profile: ShellProfile, ctx: Ctx) {
  return (s: FsState, line: string, user: string) => {
    const words = line.replace(/^[-@+!:]+/, '').split(/\s+/).filter(Boolean);
    if (!words.length || baseName(words[0]) !== 'certbot') return undefined;
    const lines: string[] = [];
    const r = certbot(s, words.slice(1), {
      out: d => lines.push(...d.replace(/\n$/, '').split('\n')), err: l => lines.push(l), user, tty: false, resolve: dnsResolver, stdin: null, tls: true,
      hook: (st, source) => { const x = runText(st, source, profile, { parent: ctx }); return { state: x.state, status: x.status }; },
    });
    return { state: r.state, lines, status: r.status, id: 'certbot', full: true as const };
  };
}

/** Shell builtins: sudo cannot run them (sudo: cd: command not found, as on Linux). */
const BUILTINS = ['cd', 'umask', 'help', 'newgrp', 'jobs', 'fg', 'bg'];

/** The command line as one command: runs argv[0] of the profile with its arguments, standard input and output. */
function exec(state: FsState, words: readonly string[], ctx: Ctx): Exec {
  const { profile, features } = ctx;
  const pipes = features.has('pipes'), gnu = features.has('help-option');
  const out: Ev[] = [];
  let size = 0, clipped = false;
  /** E4: the exit status when it is not the default (1 after an error message, else 0; ls and sort use 2). */
  let code: number | undefined;
  const notices: string[] = [];
  const push = (ev: Ev) => {
    if (pipes) {
      if (clipped) return;
      if (size + ev.data.length > LIMITS.output) { clipped = true; return; }
      size += ev.data.length;
    }
    out.push(ev);
  };
  const print = (line: string) => push({ fd: 1, data: `${line}\n` });
  const write = (data: string) => { if (data) push({ fd: 1, data }); };
  const fail = (line: string) => push({ fd: 2, data: `${line}\n` });
  const [cmd, ...args] = words;
  const done = (next: FsState = state): Exec => {
    const failed = out.some(e => e.fd === 2);
    if (clipped) out.push({ fd: 2, data: `（模擬環境：輸出超過 ${LIMITS.output} 個字元，其餘省略）\n` });
    return { state: next, events: out, status: code ?? (failed ? (cmd === 'ls' || cmd === 'sort' ? 2 : 1) : 0), ...notices.length ? { notices } : {} };
  };
  /** Fix 2: GNU follows a usage error with this line. */
  const usage = (line: string) => { fail(line); if (gnu) fail(`Try '${cmd} --help' for more information.`); };
  const badOption = (o: { bad: string; long?: true }) => usage(o.long ? `${cmd}: unrecognized option '${o.bad}'` : `${cmd}: invalid option -- '${o.bad}'`);

  const nodes = new Map(state.nodes);
  /** The state as it is now (commands with several operands see their own earlier changes). */
  const cur = (): FsState => ({ ...state, nodes });
  const commit = (cwd = state.cwd): Exec => done({ ...state, nodes, cwd });
  /** E1: the real path of what an operand names: links on the way followed, the last part as it is (the lab: just resolvePath). */
  const resolve = (p: string) => physicalPath(nodes, resolvePath(state, p));
  /** E1: the real working directory (the prompt and pwd keep the path as cd was given it, like bash). */
  const here = () => physicalPath(nodes, state.cwd, true);
  const shown = (p: string) => p;
  const allowed = (node: FsNode, access: Access) => can(node, state.user, access, groupsOf(state));
  /** The folder a new entry goes into must exist, be a folder, and be writable and searchable. */
  const writableParent = (path: string): Errno | null => {
    const w = walk(cur(), parentOf(path));
    if ('error' in w) return w.error;
    if (!w.node) return 'ENOENT';
    if (w.node.kind !== 'dir') return 'ENOTDIR';
    return allowed(w.node, 'w') && allowed(w.node, 'x') ? null : 'EACCES';
  };
  const room = (count: number) => nodes.size + count <= LIMITS.nodes;
  const tooDeep = (path: string) => depthOf(path) > LIMITS.depth;
  /** E1: whether an operand names a folder (following links). */
  const isFolder = (p: string) => { const w = walk(cur(), resolve(p)); return !('error' in w) && w.node?.kind === 'dir'; };
  /** E2: the TextIo of the text commands. */
  const textIo = (): text.TextIo => ({
    out: write, err: fail, usage, stdinRegular: ctx.stdinRegular,
    read: name => name === '-' ? ctx.stdin === null ? { error: 'NOINPUT' } : { text: ctx.stdin, regular: ctx.stdinRegular } : readPath(cur(), name),
    entry: (name, follow) => {
      const w = walk(cur(), physicalPath(nodes, resolvePath(state, name)), follow);
      if ('error' in w) return w;
      if (!w.node) return { error: 'ENOENT' };
      if (w.node.kind === 'link') return { kind: 'link' };
      if (w.node.kind === 'file') return allowed(w.node, 'r') ? { kind: 'file', text: w.node.content ?? '' } : { error: 'EACCES' };
      return { kind: 'dir', names: allowed(w.node, 'r') && allowed(w.node, 'x') ? childrenOf(nodes, w.path).map(baseName) : null };
    },
  });
  /** E2: parses the options of a text command (GNU getopt), printing the usage error. */
  const parsed = (name: string, rest: readonly string[] = args): text.Parsed | null => {
    const o = text.getopt(rest, SPEC[name], LONG[name]);
    if ('error' in o) { usage(`${name}: ${o.error}`); return null; }
    return o;
  };
  const accounts = (): Accounts => accountsOf(state);
  /** E4–E6: how the process, package and service commands write and as whom they run. */
  const pio = (): proc.ProcIo => ({ out: print, err: fail, user: state.user, ...ctx.sudo ? { sudo: true } : {} });
  const sio = (): SysIo => ({ out: print, err: fail, user: state.user, tty: ctx.tty });
  /** E3: useradd, usermod and groupadd as an ordinary user (shadow-utils' messages). */
  const notRoot = (file: string) => { fail(`${cmd}: Permission denied.`); fail(`${cmd}: cannot lock ${file}; try again later.`); };
  const saveAccounts = (next: Accounts): Exec => { writeAccountFiles(nodes, next); return done({ ...state, nodes, accounts: next }); };

  const known = (profile.commands as readonly string[]).includes(cmd);
  // E1: 指令 --help prints the command's short help (echo prints it as text, as in bash; sudo only before its command).
  if (known && features.has('help-option') && !['echo', 'test', '[', 'true', 'false'].includes(cmd)) {
    const stop = args.indexOf('--'), limit = cmd === 'sudo' ? args.findIndex(a => !a.startsWith('-')) : -1;
    const at = args.indexOf('--help');
    if (at >= 0 && (stop < 0 || at < stop) && (limit < 0 || at < limit)) { helpPage(cmd as CommandName, features).forEach(print); return done(); }
  }

  switch (known ? cmd as CommandName : undefined) {
    case 'help': {
      const lineOf = (c: CommandName, line: string) => HELP_FEATURE.find(([f, h]) => h === c && features.has(f))?.[2] ?? line;
      HELP.filter(([c]) => !c || profile.commands.includes(c)).forEach(([c, line]) => print(c ? lineOf(c, line) : line));
      const last = HELP_LAST.filter(c => profile.commands.includes(c));
      if (last.length) print(`  ${last.join('、')}`);
      if (features.has('glob')) print('  萬用字元：* 任意多個字元、? 一個字元、[abc] 或 [a-z] 其中一個字元');
      if (pipes) print('  管線與重新導向：a | b、> 檔案、>> 檔案、< 檔案、2> 檔案、2>&1、> /dev/null');
      if (features.has('scripting')) {
        print('  指令稿與互動式 Shell：變數 $x ${x:-預設}、$(指令)、$((運算))、; && ||、if／for／while／case、函式');
        print('  內建指令：read、set（-e -u -x -o pipefail）、local、export、unset、shift、return、exit、source、cd');
      }
      return done();
    }
    case 'whoami':
      if (gnu && args.length) { usage(`whoami: extra operand '${args[0]}'`); return done(); }
      print(state.user); return done();
    case 'clear': return { state, events: [], status: 0, clear: true };
    case 'pwd': print(state.cwd); return done();

    case 'echo': {
      if (pipes) {
        // E2: bash's echo: leading -n (no newline), -e (\n \t \\) and -E; redirection is the shell's.
        let i = 0, newline = true, escapes = false;
        for (; i < args.length && /^-[neE]+$/.test(args[i]); i++) for (const f of args[i].slice(1)) { if (f === 'n') newline = false; else escapes = f === 'e'; }
        let line = args.slice(i).join(' ');
        if (escapes) line = line.replace(/\\([nt\\])/g, (_, c: string) => c === 'n' ? '\n' : c === 't' ? '\t' : '\\');
        write(line + (newline ? '\n' : ''));
        return done();
      }
      const at = args.findIndex(a => a === '>' || a === '>>');
      const line = (at < 0 ? args : args.slice(0, at)).join(' ');
      if (at < 0) { print(line); return done(); }
      const target = args[at + 1];
      if (!target || args.length > at + 2) { fail('bash: syntax error near unexpected token `newline\''); return done(); }
      const w = walk(cur(), resolve(target));
      if ('error' in w) { fail(`bash: ${shown(target)}: ${ERRNO[w.error]}`); return done(); }
      if (w.node?.kind === 'dir') { fail(`bash: ${shown(target)}: Is a directory`); return done(); }
      if (w.node && !allowed(w.node, 'w')) { fail(`bash: ${shown(target)}: Permission denied`); return done(); }
      // E1: writing through a link writes its target (a dangling link creates it).
      const path = w.path;
      if (!w.node) {
        const why = writableParent(path);
        if (why) { fail(`bash: ${shown(target)}: ${ERRNO[why]}`); return done(); }
        if (!validName(baseName(path)) || tooDeep(path)) { fail(`bash: ${shown(target)}: File name too long`); return done(); }
        if (!room(1)) { fail(`bash: ${shown(target)}: No space left on device`); return done(); }
      }
      const content = (args[at] === '>>' ? w.node?.content ?? '' : '') + line + '\n';
      if (content.length > LIMITS.fileLength) { fail(`bash: ${shown(target)}: File too large（模擬環境上限 ${LIMITS.fileLength} 字元）`); return done(); }
      // An existing file keeps its mode, owner and group; a new one is the user's.
      nodes.set(path, w.node ? { ...w.node, content } : { kind: 'file', mode: 0o644, owner: state.user, content });
      return commit();
    }

    case 'cd': {
      if (args.length > 1) { fail('bash: cd: too many arguments'); return done(); }
      // The working directory keeps the path as written (bash's cd -L): cd into a link shows the link's path.
      const target = args[0] ?? '~', path = resolvePath(state, target), w = walk(state, path);
      if ('error' in w) { fail(`bash: cd: ${target}: ${ERRNO[w.error]}`); return done(); }
      if (!w.node) { fail(`bash: cd: ${target}: No such file or directory`); return done(); }
      if (w.node.kind !== 'dir') { fail(`bash: cd: ${target}: Not a directory`); return done(); }
      if (!allowed(w.node, 'x')) { fail(`bash: cd: ${target}: Permission denied`); return done(); }
      return done({ ...state, cwd: path });
    }

    case 'ls': {
      const extra = features.has('ls-extra');
      const o = options(args, extra ? 'lahd' : 'la', LONG.ls, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      const long = o.flags.has('l'), all = o.flags.has('a'), human = o.flags.has('h'), self = o.flags.has('d');
      const targets = o.operands.length ? o.operands : ['.'];
      const size = (node: FsNode) => node.kind === 'dir' ? 4096 : byteLength((node.kind === 'link' ? node.target : node.content) ?? '');
      // Folders end in / (like ls -F) so the listing reads without colours; . and .. stay as they are; E1: links end in @.
      // E2: not to a terminal (a pipe or a file), ls prints plain names, one per line, as GNU ls does.
      const label = (name: string, node: FsNode) => !ctx.tty ? name : node.kind === 'dir' && name !== '.' && name !== '..' && !name.endsWith('/') ? `${name}/` : node.kind === 'link' ? `${name}@` : name;
      const entry = (name: string, node: FsNode) => long
        ? `${modeString(node)} ${node.owner.padEnd(7)} ${groupOf(node).padEnd(7)} ${(human ? humanSize(size(node)) : String(size(node))).padStart(5)} ${node.kind === 'link' ? `${name} -> ${node.target ?? ''}` : label(name, node)}`
        : label(name, node);
      const row = (entries: string[]) => { if (long || !ctx.tty) entries.forEach(print); else if (entries.length) print(entries.join('  ')); };
      /** An operand: a link is followed when it leads to a folder (not with -l or -d, unless it ends in /), like GNU ls. */
      const look = (target: string): Fail | Found => {
        const path = resolve(target), w = walk(state, path, false);
        if ('error' in w || w.node?.kind !== 'link' || ((long || self) && !target.endsWith('/'))) return w;
        const f = walk(state, path);
        if (extra && target.endsWith('/') && !('error' in f) && f.node && f.node.kind !== 'dir') return { error: 'ENOTDIR' };
        return target.endsWith('/') || (!('error' in f) && f.node?.kind === 'dir') ? f : w;
      };
      const listing = (dir: Found & { node: FsNode }) => {
        const rows: [string, FsNode][] = childrenOf(state.nodes, dir.path).map(p => [baseName(p), state.nodes.get(p)!]);
        if (all) rows.unshift(['.', dir.node], ['..', state.nodes.get(parentOf(dir.path))!]);
        const shownRows = all ? rows : rows.filter(([name]) => !name.startsWith('.'));
        row(shownRows.map(([name, node]) => entry(name, node)));
      };
      if (!extra) {
        targets.forEach((target, i) => {
          const w = look(target);
          if ('error' in w || !w.node) { fail(`ls: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); return; }
          if (w.node.kind !== 'dir') { print(entry(target, w.node)); return; }
          if (!allowed(w.node, 'r')) { fail(`ls: cannot open directory '${target}': Permission denied`); return; }
          if (targets.length > 1) { if (i) print(''); print(`${target}:`); }
          listing({ ...w, node: w.node });
        });
        return done();
      }
      // E1 (GNU): errors first, then the operands that are not listed as folders (sorted, together), then each folder.
      const files: [string, FsNode][] = [], dirs: [string, Found & { node: FsNode }][] = [];
      for (const target of targets) {
        const w = look(target);
        if ('error' in w || !w.node) fail(`ls: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`);
        else if (w.node.kind !== 'dir' || self) files.push([target, w.node]);
        else dirs.push([target, { ...w, node: w.node }]);
      }
      const byName = <T>(a: [string, T], b: [string, T]) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      files.sort(byName); dirs.sort(byName);
      row(files.map(([name, node]) => entry(name, node)));
      let printed = files.length > 0;
      for (const [target, dir] of dirs) {
        if (!allowed(dir.node, 'r')) { fail(`ls: cannot open directory '${target}': Permission denied`); continue; }
        if (targets.length > 1) { if (printed) print(''); print(`${target}:`); }
        listing(dir);
        printed = true;
      }
      return done();
    }

    case 'mkdir': {
      const o = options(args, 'p', LONG.mkdir, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      if (!o.operands.length) { usage('mkdir: missing operand'); return done(); }
      // E3: 777 & ~umask (755 with the default 022); -p's parents also get u+wx, as GNU mkdir gives them.
      const mode = 0o777 & ~maskOf(state);
      for (const target of o.operands) {
        const path = resolve(target);
        const chain = o.flags.has('p') ? path.split('/').filter(Boolean).map((_, i, all) => '/' + all.slice(0, i + 1).join('/')) : [path];
        for (const step of chain) {
          const existing = nodes.get(step);
          if (existing) {
            // E1: a link to a folder counts as the folder for -p.
            const folder = existing.kind === 'dir' || (existing.kind === 'link' && isFolder(step));
            if (step === path && !o.flags.has('p')) fail(`mkdir: cannot create directory '${target}': File exists`);
            else if (!folder) fail(`mkdir: cannot create directory '${target}': Not a directory`);
            if (step === path || !folder) break;
            continue;
          }
          const why = writableParent(step);
          if (why) { fail(`mkdir: cannot create directory '${target}': ${ERRNO[why]}`); break; }
          if (!validName(baseName(step)) || tooDeep(step)) { fail(`mkdir: cannot create directory '${target}': File name too long`); break; }
          if (!room(1)) { fail(`mkdir: cannot create directory '${target}': No space left on device`); break; }
          nodes.set(step, { kind: 'dir', mode: step === path ? mode : mode | 0o300, ...ownedBy(cur()) });
        }
      }
      return commit();
    }

    case 'touch': {
      if (!args.length) { usage('touch: missing file operand'); return done(); }
      for (const target of args) {
        const w = walk(cur(), resolve(target));
        if ('error' in w) { fail(`touch: cannot touch '${target}': ${ERRNO[w.error]}`); continue; }
        if (w.node) {
          if (!allowed(w.node, 'w') && w.node.owner !== state.user) fail(`touch: cannot touch '${target}': Permission denied`);
          // E18: touch gives the file the clock's time (nginx's Last-Modified changes, its ETag too).
          else if (features.has('edge') && w.node.kind === 'file') nodes.set(w.path, { ...w.node, mtime: proc.clockOf(state).now });
          continue;
        }
        // E1: touching a dangling link creates its target.
        const path = w.path;
        const why = writableParent(path);
        if (why) { fail(`touch: cannot touch '${target}': ${ERRNO[why]}`); continue; }
        if (!validName(baseName(path)) || tooDeep(path)) { fail(`touch: cannot touch '${target}': File name too long`); continue; }
        if (!room(1)) { fail(`touch: cannot touch '${target}': No space left on device`); continue; }
        nodes.set(path, { kind: 'file', mode: 0o666 & ~maskOf(state), ...ownedBy(cur()), content: '' });
      }
      return commit();
    }

    case 'cat': {
      if (pipes) { const o = parsed('cat'); if (o) text.cat(textIo(), o); return done(); }
      if (!args.length) { fail('cat: 模擬環境沒有標準輸入，請指定檔案，例如 cat README.txt'); return done(); }
      for (const target of args) {
        const w = walk(state, resolve(target));
        if ('error' in w || !w.node) { fail(`cat: ${target}: ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        if (w.node.kind === 'dir') { fail(`cat: ${target}: Is a directory`); continue; }
        if (!allowed(w.node, 'r')) { fail(`cat: ${target}: Permission denied`); continue; }
        const content = w.node.content ?? '';
        (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n').forEach(l => content && print(l));
      }
      return done();
    }

    case 'less': { const o = parsed('less'); if (o) text.less(textIo(), o); return done(); }
    case 'head': case 'tail': { const o = parsed(cmd, text.countShorthand(args)); if (o) text.headTail(textIo(), cmd as 'head' | 'tail', o); return done(); }
    case 'grep': {
      // E4: grep's status is 0 when a line was selected, 1 when none, 2 after an error.
      const o = parsed('grep');
      if (!o) { code = 2; return done(); }
      // Fix (E19 batch): -q prints nothing; a match makes the status 0 even after an error (GNU grep).
      const quiet = o.flags.has('q'), io = textIo();
      const hit = text.grep(quiet ? { ...io, out: () => {} } : io, o);
      code = quiet && hit ? 0 : out.some(e => e.fd === 2) ? 2 : hit ? 0 : 1;
      return done();
    }
    case 'sort': { const o = parsed('sort'); if (o) text.sort(textIo(), o); return done(); }
    case 'uniq': { const o = parsed('uniq'); if (o) text.uniq(textIo(), o); return done(); }
    case 'wc': { const o = parsed('wc'); if (o) text.wc(textIo(), o); return done(); }
    case 'cut': { const o = parsed('cut'); if (o) text.cut(textIo(), o); return done(); }
    case 'tr': { const o = parsed('tr'); if (o) text.tr(textIo(), o); return done(); }

    case 'tee': {
      const o = parsed('tee');
      if (!o) return done();
      if (ctx.stdin === null) { fail(text.noInput('tee')); return done(); }
      const data = ctx.stdin, targets: [string, string][] = [];
      for (const name of o.operands) {
        const opened = openWrite(nodes, cur(), name, o.flags.has('a'));
        if ('error' in opened) fail(`tee: ${name}: ${OPEN_TEXT[opened.error]}`);
        else if (opened.path) targets.push([name, opened.path]);
      }
      for (const [name, path] of targets) {
        const node = nodes.get(path)!, content = (node.content ?? '') + data;
        if (content.length > LIMITS.fileLength) fail(`tee: ${name}: File too large（模擬環境上限 ${LIMITS.fileLength} 字元）`);
        else nodes.set(path, { ...node, content });
      }
      write(data);
      return commit();
    }

    case 'cp': case 'mv': {
      const o = options(args, cmd === 'cp' ? 'r' : '', LONG[cmd] ?? {}, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      const multi = features.has('multi-source'), n = o.operands.length;
      if (multi && n < 2) { usage(n ? `${cmd}: missing destination file operand after '${o.operands[0]}'` : `${cmd}: missing file operand`); return done(); }
      if (!multi && n !== 2) { fail(`${cmd}: ${n < 2 ? 'missing destination file operand' : '模擬環境一次只處理一個來源'}`); return done(); }
      const to = o.operands[n - 1], sources = o.operands.slice(0, -1);
      if (sources.length > 1) {
        const dw = walk(cur(), resolve(to));
        if ('error' in dw && dw.error !== 'ENOENT') { fail(`${cmd}: failed to access '${to}': ${ERRNO[dw.error]}`); return done(); }
        if ('error' in dw || dw.node?.kind !== 'dir') { fail(`${cmd}: target '${to}' is not a directory`); return done(); }
      }
      let cwd = state.cwd;
      for (const from of sources) {
        const before: ReadonlyMap<string, FsNode> = new Map(nodes);
        // E1: cp without -r copies what a link points to; cp -r and mv take the link itself.
        const src = resolve(from), sw = walk(cur(), src, cmd === 'cp' && !o.flags.has('r'));
        if ('error' in sw || !sw.node) { fail(`${cmd}: cannot stat '${from}': ${ERRNO['error' in sw ? sw.error : 'ENOENT']}`); continue; }
        const real = sw.path, node = sw.node;
        if (cmd === 'cp' && node.kind === 'dir' && !o.flags.has('r')) { fail(`cp: -r not specified; omitting directory '${from}'`); continue; }
        if (real === '/') { fail(`${cmd}: cannot ${cmd === 'cp' ? 'copy' : 'move'} '/'`); continue; }
        const dw = walk(cur(), resolve(to));
        if ('error' in dw) { fail(`${cmd}: cannot ${cmd === 'cp' ? 'create regular file' : 'move'} '${to}': ${ERRNO[dw.error]}`); continue; }
        // Fix 4 (multi-source): a destination written with a trailing / must be a folder for a file (a folder may be renamed to it).
        if (multi && to.endsWith('/') && node.kind !== 'dir' && dw.node?.kind !== 'dir') {
          if (dw.node) fail(`${cmd}: failed to access '${to}': Not a directory`);
          else fail(cmd === 'mv' ? `mv: cannot move '${from}' to '${to}': Not a directory` : `cp: cannot create regular file '${to}': Not a directory`);
          continue;
        }
        // Into a folder (following a link to one), keeping the name; cp writes through a link to a file, mv replaces the link.
        const dest = dw.node?.kind === 'dir' ? joinPath(dw.path, baseName(src)) : cmd === 'cp' ? dw.path : resolve(to);
        if (dest === real) { fail(`${cmd}: '${from}' and '${to}' are the same file`); continue; }
        if (node.kind === 'dir' && isInside(dest, real)) { fail(`${cmd}: cannot ${cmd === 'cp' ? 'copy' : 'move'} a directory, '${from}', into itself, '${to}'`); continue; }
        const existing = nodes.get(dest);
        if (existing?.kind === 'dir' && node.kind !== 'dir') { fail(`${cmd}: cannot overwrite directory '${to}' with non-directory`); continue; }
        if (existing && node.kind === 'dir') { fail(`${cmd}: cannot overwrite '${to}': 模擬環境不合併目錄`); continue; }
        if (cmd === 'cp' && node.kind === 'file' && !allowed(node, 'r')) { fail(`cp: cannot open '${from}' for reading: Permission denied`); continue; }
        if (cmd === 'cp' && existing && !allowed(existing, 'w')) { fail(`${cmd}: cannot create regular file '${to}': Permission denied`); continue; }
        const why = writableParent(dest);
        if (why) { fail(`${cmd}: cannot create regular file '${to}': ${ERRNO[why]}`); continue; }
        if (cmd === 'mv') { const sp = writableParent(real); if (sp) { fail(`mv: cannot move '${from}': ${ERRNO[sp]}`); continue; } }
        if (!validName(baseName(dest))) { fail(`${cmd}: invalid name '${to}'`); continue; }
        const tree = subtreeOf(before, real);
        if (tree.some(p => tooDeep(dest + p.slice(real.length)))) { fail(`${cmd}: '${to}': File name too long`); continue; }
        if (cmd === 'cp' && !room(tree.length - (existing ? 1 : 0))) { fail(`cp: cannot create '${to}': No space left on device`); continue; }
        if (cmd === 'cp' && node.kind === 'dir' && tree.some(p => before.get(p)!.kind === 'file' && !allowed(before.get(p)!, 'r')))
        { fail(`cp: cannot open '${from}' 中的部分檔案: Permission denied`); continue; }
        const physical = physicalPath(before, cwd, true), moved = cmd === 'mv' && isInside(physical, real);
        for (const p of tree) {
          const each = before.get(p)!, target = dest + p.slice(real.length);
          if (cmd === 'mv') nodes.delete(p);
          // A copy belongs to the user (and, LNX-0, to the user's own group); a move keeps the node as it was. E3 (a state
          // with a umask): a new copy is masked by it, an existing file keeps its mode, owner and group, like GNU cp.
          if (cmd === 'mv') nodes.set(target, each);
          else if (state.umask !== undefined) {
            const old = nodes.get(target);
            nodes.set(target, old && old.kind === 'file' && each.kind === 'file' ? { ...old, content: each.content }
              : { ...copyOf(each, state.user), ...ownedBy(cur()), mode: each.kind === 'link' ? each.mode : each.mode & ~state.umask });
          } else nodes.set(target, copyOf(each, state.user));
        }
        if (moved) cwd = dest + physical.slice(real.length);
      }
      return commit(cwd);
    }

    case 'rm': {
      const o = options(args, 'rfR', LONG.rm, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      const recursive = o.flags.has('r') || o.flags.has('R'), force = o.flags.has('f');
      if (!o.operands.length) { if (!force) usage('rm: missing operand'); return done(); }
      for (const target of o.operands) {
        const path = resolve(target);
        if (baseName(target) === '.' || baseName(target) === '..') { fail(`rm: refusing to remove '.' or '..' directory: skipping '${target}'`); continue; }
        if (path === '/') { fail("rm: it is dangerous to operate recursively on '/'"); continue; }
        // E1: a link is removed itself, never what it points to.
        const w = walk(cur(), path, false);
        if ('error' in w || !w.node) { if (!force || ('error' in w && w.error !== 'ENOENT')) fail(`rm: cannot remove '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        if (w.node.kind === 'dir' && !recursive) { fail(`rm: cannot remove '${target}': Is a directory`); continue; }
        if (isInside(here(), path)) { fail(`rm: cannot remove '${target}': 目前所在的目錄在它裡面，請先用 cd 離開`); continue; }
        const why = writableParent(path);
        if (why) { fail(`rm: cannot remove '${target}': ${ERRNO[why]}`); continue; }
        const tree = subtreeOf(nodes, path);
        // Emptying a folder needs write and search permission on it, at every level of the tree.
        const locked = tree.find(p => { const n = nodes.get(p)!; return n.kind === 'dir' && childrenOf(nodes, p).length > 0 && !(allowed(n, 'w') && allowed(n, 'x')); });
        if (locked) { fail(`rm: cannot remove '${locked === path ? target : locked}': Permission denied`); continue; }
        tree.forEach(p => nodes.delete(p));
      }
      return commit();
    }

    case 'chmod': {
      // E3 (accounts): chmod -R applies the mode to the folder and everything under it (links are not followed).
      const recursive = features.has('accounts') && (args[0] === '-R' || args[0] === '--recursive');
      const rest = recursive ? args.slice(1) : args;
      if (rest.length < 2) { usage(rest.length ? `chmod: missing operand after '${rest[0]}'` : 'chmod: missing operand'); return done(); }
      const [spec, ...targets] = rest;
      for (const target of targets) {
        const path = resolve(target), w = walk(cur(), path);
        if ('error' in w || !w.node) {
          const own = walk(cur(), path, false);
          if (!('error' in w) && !('error' in own) && own.node?.kind === 'link') fail(`chmod: cannot operate on dangling symlink '${target}'`);
          else fail(`chmod: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`);
          continue;
        }
        if (applyMode(w.node.mode, spec) === undefined) { usage(`chmod: invalid mode: '${spec}'`); return commit(); }
        const paths = recursive && w.node.kind === 'dir' ? subtreeOf(nodes, w.path) : [w.path];
        for (const p of paths) {
          const node = nodes.get(p)!;
          if (node.kind === 'link') continue;
          const name = p === w.path ? target : joinShown(target, p.slice(w.path.length + 1));
          if (node.owner !== state.user && state.user !== 'root') { fail(`chmod: changing permissions of '${name}': Operation not permitted`); continue; }
          // E1: chmod changes what a link points to (a link's own mode is always 777).
          nodes.set(p, { ...node, mode: applyMode(node.mode, spec)! });
        }
      }
      return commit();
    }

    case 'uname': {
      const o = options(args, 'asnrvmo', LONG.uname, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      if (o.operands.length) { usage(`uname: extra operand '${o.operands[0]}'`); return done(); }
      const sys = { ...DEFAULT_SYSTEM, ...state.system }, every = o.flags.has('a');
      const fields: [string, string][] = [['s', sys.kernel], ['n', state.host ?? DEFAULT_HOST], ['r', sys.release], ['v', sys.version], ['m', sys.machine], ['o', sys.os]];
      const chosen = fields.filter(([f]) => every || o.flags.has(f));
      print((chosen.length ? chosen : fields.slice(0, 1)).map(([, v]) => v).join(' '));
      return done();
    }

    case 'hostname': {
      const o = options(args, '');
      if ('bad' in o) { fail(`hostname: invalid option -- '${o.bad}'`); return done(); }
      if (!o.operands.length) { print(state.host ?? DEFAULT_HOST); return done(); }
      if (state.user !== 'root') { fail('hostname: you must be root to change the host name'); return done(); }
      if (o.operands.length > 1 || !HOST_NAME.test(o.operands[0])) { fail('hostname: the specified hostname is invalid'); return done(); }
      return done({ ...state, host: o.operands[0] });
    }

    case 'man': {
      const o = options(args, '', {}, gnu);
      if ('bad' in o) {
        fail(o.long ? `man: unrecognized option '${o.bad}'` : `man: invalid option -- '${o.bad}'`);
        if (gnu) fail("Try 'man --help' or 'man --usage' for more information.");
        return done();
      }
      if (!o.operands.length) { fail('What manual page do you want?'); fail("For example, try 'man man'."); return done(); }
      o.operands.forEach((page, i) => {
        if (!(profile.commands as readonly string[]).includes(page)) { fail(`No manual entry for ${page}`); code = 16; return; }
        if (i && out.some(l => l.fd === 1)) print('');
        manualPage(page as CommandName, features).forEach(print);
      });
      return done();
    }

    case 'df': {
      const o = options(args, 'hT', LONG.df, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      const mounts = state.mounts ?? [];
      if (!mounts.length) { fail('df: no file systems processed'); return done(); }
      const rows = !o.operands.length ? [...mounts] : o.operands.flatMap(target => {
        const w = walk(state, resolve(target));
        if ('error' in w || !w.node) { fail(`df: ${target}: ${ERRNO['error' in w ? w.error : 'ENOENT']}`); return []; }
        const mount = mounts.filter(m => isInside(w.path, m.path)).sort((a, b) => b.path.length - a.path.length)[0];
        return mount ? [mount] : [];
      });
      if (rows.length) dfTable(rows, o.flags.has('h'), o.flags.has('T')).forEach(print);
      return done();
    }

    case 'du': {
      const o = options(args, 'sha', LONG.du, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      const summary = o.flags.has('s'), every = o.flags.has('a'), human = o.flags.has('h');
      if (summary && every) { usage('du: cannot both summarize and show all entries'); return done(); }
      const line = (kib: number, name: string) => print(`${human ? humanSize(kib * 1024) : kib}\t${name}`);
      // Post-order like GNU du (a folder after its contents), names sorted; links are counted as 0 and never followed.
      const visit = (path: string, name: string, node: FsNode, top: boolean): number => {
        if (node.kind !== 'dir') { if (top || (every && !summary)) line(blocksOf(node), name); return blocksOf(node); }
        let total = blocksOf(node);
        if (!allowed(node, 'r') || !allowed(node, 'x')) fail(`du: cannot read directory '${name}': Permission denied`);
        else for (const kid of childrenOf(state.nodes, path)) total += visit(kid, joinShown(name, baseName(kid)), state.nodes.get(kid)!, false);
        if (top || !summary) line(total, name);
        return total;
      };
      for (const target of o.operands.length ? o.operands : ['.']) {
        const w = walk(state, resolve(target), false);
        if ('error' in w || !w.node) { fail(`du: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        visit(w.path, target, w.node, true);
      }
      return done();
    }

    case 'ln': {
      const o = options(args, 'sf', LONG.ln, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      if (!o.flags.has('s')) { fail('ln: 模擬環境只支援符號連結，請使用 ln -s 目標 連結名稱（硬連結只在課文中說明）'); return done(); }
      const n = o.operands.length;
      if (!n) { usage('ln: missing file operand'); return done(); }
      const nameOf = (target: string) => baseName(target.replace(/\/+$/, '') || '/');
      let jobs: [string, string, string][];
      if (n === 1) jobs = [[o.operands[0], resolve(nameOf(o.operands[0])), `./${nameOf(o.operands[0])}`]];
      else {
        const to = o.operands[n - 1], intoFolder = isFolder(to);
        if (n > 2 && !intoFolder) { fail(`ln: target '${to}' is not a directory`); return done(); }
        const folder = intoFolder ? (walk(cur(), resolve(to)) as Found).path : '';
        jobs = o.operands.slice(0, -1).map(t => intoFolder ? [t, joinPath(folder, nameOf(t)), joinShown(to, nameOf(t))] : [t, resolve(to), to]);
      }
      for (const [target, path, name] of jobs) {
        const at = `ln: failed to create symbolic link '${name}'`;
        if (!target) { fail(`${at}: No such file or directory`); continue; }
        const w = walk(cur(), path, false);
        if ('error' in w) { fail(`${at}: ${ERRNO[w.error]}`); continue; }
        const why = writableParent(path);
        if (w.node && !o.flags.has('f')) { fail(`${at}: File exists`); continue; }
        if (w.node?.kind === 'dir') { fail(`ln: cannot overwrite directory '${name}'`); continue; }
        if (why) { fail(`${at}: ${ERRNO[why]}`); continue; }
        if (!validName(baseName(path)) || tooDeep(path)) { fail(`${at}: File name too long`); continue; }
        if (!w.node && !room(1)) { fail(`${at}: No space left on device`); continue; }
        nodes.set(path, { kind: 'link', mode: 0o777, ...ownedBy(cur()), target });
      }
      return commit();
    }

    case 'readlink': {
      const o = options(args, 'f', LONG.readlink, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      if (!o.operands.length) { usage('readlink: missing operand'); return done(); }
      // Like GNU readlink: nothing is printed (and nothing is an error message) when the path is not a link.
      for (const target of o.operands) {
        if (o.flags.has('f')) { const w = walk(state, resolvePath(state, target)); if (!('error' in w)) print(w.path); continue; }
        const w = walk(state, resolve(target), false);
        if (!('error' in w) && w.node?.kind === 'link') print(w.node.target ?? '');
      }
      return done();
    }

    case 'id': {
      const o = parsed('id');
      if (!o) return done();
      const acc = accounts();
      if (o.operands.length > 1) { usage(`id: extra operand '${o.operands[1]}'`); return done(); }
      const which = ['u', 'g', 'G'].filter(f => o.flags.has(f));
      if (which.length > 1) { usage('id: cannot print "only" of more than one choice'); return done(); }
      if (o.flags.has('n') && !which.length) { usage('id: printing only names or real IDs requires -u, -g, or -G'); return done(); }
      // With a name: the database (what the next login gets). Without: the session (groups as they were at login).
      const name = o.operands[0], user = findUser(acc, name ?? state.user);
      if (name !== undefined && !user) { fail(`id: '${name}': no such user`); return done(); }
      const groups = name !== undefined ? loginGroups(acc, name) : [...groupsOf(state)];
      const uid = user?.uid ?? FIRST_UNKNOWN, gidOf = (g: string) => findGroup(acc, g)?.gid;
      const both = (id: number | undefined, label: string) => id === undefined ? label : `${id}(${label})`;
      const named = o.flags.has('n');
      if (which[0] === 'u') print(named ? user?.name ?? state.user : String(uid));
      else if (which[0] === 'g') print(named ? groups[0] ?? '' : String(gidOf(groups[0]) ?? user?.gid ?? ''));
      else if (which[0] === 'G') print(groups.map(g => named ? g : String(gidOf(g) ?? g)).join(' '));
      else print(`uid=${both(uid, user?.name ?? state.user)} gid=${both(gidOf(groups[0]) ?? user?.gid, groups[0] ?? '')} groups=${groups.map(g => both(gidOf(g), g)).join(',')}`);
      return done();
    }

    case 'groups': {
      const o = options(args, '', {}, gnu);
      if ('bad' in o) { badOption(o); return done(); }
      const acc = accounts();
      if (!o.operands.length) { print(groupsOf(state).join(' ')); return done(); }
      for (const name of o.operands) {
        if (!findUser(acc, name)) fail(`groups: '${name}': no such user`);
        else print(`${name} : ${loginGroups(acc, name).join(' ')}`);
      }
      return done();
    }

    case 'useradd': {
      const o = text.getopt(args, 'mMrs:G:g:u:c:d:', { 'create-home': 'm', 'no-create-home': 'M', system: 'r', shell: 's', groups: 'G', gid: 'g', uid: 'u', comment: 'c', 'home-dir': 'd' });
      if ('error' in o) { fail(`useradd: ${o.error}`); fail('Usage: useradd [options] LOGIN'); return done(); }
      if (o.operands.length !== 1) { fail('Usage: useradd [options] LOGIN'); return done(); }
      if (state.user !== 'root') { notRoot('/etc/passwd'); return done(); }
      const acc = accounts(), name = o.operands[0], one = (f: string) => o.flags.get(f)?.at(-1), system = o.flags.has('r');
      if (!ACCOUNT_NAME.test(name)) { fail(`useradd: invalid user name '${name}': use --badname to ignore`); return done(); }
      if (findUser(acc, name)) { fail(`useradd: user '${name}' already exists`); return done(); }
      if (acc.users.length >= LIMITS.users) { fail(`useradd: 模擬環境最多 ${LIMITS.users} 個使用者`); return done(); }
      const extra = (one('G') ?? '').split(',').filter(Boolean);
      const missing = extra.find(g => !findGroup(acc, g));
      if (missing) { fail(`useradd: group '${missing}' does not exist`); return done(); }
      let groups = acc.groups, gid: number | undefined;
      const given = one('g');
      if (given !== undefined) {
        const g = findGroup(acc, given) ?? (/^\d+$/.test(given) ? groupById(acc, Number(given)) : undefined);
        if (!g) { fail(`useradd: group '${given}' does not exist`); return done(); }
        gid = g.gid;
      } else if (findGroup(acc, name)) { fail(`useradd: group ${name} exists - if you want to add this user to that group, use -g.`); return done(); }
      const wanted = one('u');
      if (wanted !== undefined && (!/^\d+$/.test(wanted) || Number(wanted) > 65534)) { fail(`useradd: invalid user ID '${wanted}'`); return done(); }
      const uid = wanted !== undefined ? Number(wanted) : nextId(acc.users.map(u => u.uid), system);
      if (uid === undefined) { fail("useradd: can't get unique UID (no more available UIDs)"); return done(); }
      if (wanted !== undefined && acc.users.some(u => u.uid === uid)) { fail(`useradd: UID ${uid} is not unique`); return done(); }
      const home = one('d') ?? `/home/${name}`, shell = one('s') ?? '/bin/sh', comment = one('c') ?? '';
      if (!home.startsWith('/') || home.includes(':')) { fail(`useradd: invalid home directory '${home}'`); return done(); }
      if (!shell.startsWith('/') || shell.includes(':')) { fail(`useradd: invalid shell '${shell}'`); return done(); }
      if (/[:\n]/.test(comment) || comment.length > 64) { fail(`useradd: invalid comment '${comment}'`); return done(); }
      if (gid === undefined) {
        if (acc.groups.length >= LIMITS.groups) { fail(`useradd: 模擬環境最多 ${LIMITS.groups} 個群組`); return done(); }
        // A user private group, with the uid as its gid when that is free (USERGROUPS_ENAB).
        const used = acc.groups.map(g => g.gid);
        gid = used.includes(uid) ? nextId(used, system) : uid;
        if (gid === undefined) { fail("useradd: can't create group"); return done(); }
        groups = [...groups, { name, gid, members: [] }];
      }
      groups = groups.map(g => extra.includes(g.name) && !g.members.includes(name) ? { ...g, members: [...g.members, name] } : g);
      const next: Accounts = { users: [...acc.users, { name, uid, gid, comment, home, shell }], groups };
      if (o.flags.has('m') && !o.flags.has('M')) {
        const path = resolvePath({ cwd: '/', home: '/' }, home), primary = groupById(next, gid)?.name ?? name;
        const own = (n: FsNode): FsNode => ({ ...n, owner: name, ...primary !== name ? { group: primary } : {} });
        const skel = subtreeOf(nodes, '/etc/skel').slice(1);
        if (nodes.has(path)) { fail(`useradd: warning: the home directory ${home} already exists.`); fail('useradd: Not copying any file from skel directory into it.'); }
        else if (nodes.get(parentOf(path))?.kind !== 'dir' || tooDeep(path) || !room(1 + skel.length)) fail(`useradd: cannot create directory ${home}`);
        else {
          // Ubuntu's HOME_MODE is 0750; the files of /etc/skel are copied in, owned by the new user.
          nodes.set(path, own({ kind: 'dir', mode: 0o750, owner: name }));
          for (const p of skel) nodes.set(path + p.slice('/etc/skel'.length), own(copyOf(nodes.get(p)!, name)));
        }
      }
      return saveAccounts(next);
    }

    case 'usermod': {
      const o = text.getopt(args, 'aG:g:s:c:d:', { append: 'a', groups: 'G', gid: 'g', shell: 's', comment: 'c', home: 'd' });
      if ('error' in o) { fail(`usermod: ${o.error}`); fail('Usage: usermod [options] LOGIN'); return done(); }
      if (o.operands.length !== 1) { fail('Usage: usermod [options] LOGIN'); return done(); }
      if (o.flags.has('a') && !o.flags.has('G')) { fail('usermod: -a flag is ONLY allowed with the -G flag'); fail('Usage: usermod [options] LOGIN'); return done(); }
      if (state.user !== 'root') { notRoot('/etc/passwd'); return done(); }
      const acc = accounts(), name = o.operands[0], one = (f: string) => o.flags.get(f)?.at(-1);
      const user = findUser(acc, name);
      if (!user) { fail(`usermod: user '${name}' does not exist`); return done(); }
      if (!o.flags.size) { fail('usermod: no changes'); return done(); }
      let groups = acc.groups, changed = { ...user };
      const list = one('G');
      if (list !== undefined) {
        const wanted = list.split(',').filter(Boolean), missing = wanted.find(g => !findGroup(acc, g));
        if (missing) { fail(`usermod: group '${missing}' does not exist`); return done(); }
        // -aG adds; -G alone makes these the user's only supplementary groups (the classic way to lose sudo).
        groups = groups.map(g => {
          const member = g.members.includes(name), want = wanted.includes(g.name) || (o.flags.has('a') && member);
          return want === member ? g : { ...g, members: want ? [...g.members, name] : g.members.filter(m => m !== name) };
        });
      }
      const primary = one('g');
      if (primary !== undefined) {
        const g = findGroup(acc, primary) ?? (/^\d+$/.test(primary) ? groupById(acc, Number(primary)) : undefined);
        if (!g) { fail(`usermod: group '${primary}' does not exist`); return done(); }
        changed = { ...changed, gid: g.gid };
      }
      const shell = one('s'), comment = one('c'), home = one('d');
      if (shell !== undefined) { if (!shell.startsWith('/') || shell.includes(':')) { fail(`usermod: invalid field '${shell}'`); return done(); } changed = { ...changed, shell }; }
      if (comment !== undefined) { if (/[:\n]/.test(comment) || comment.length > 64) { fail(`usermod: invalid field '${comment}'`); return done(); } changed = { ...changed, comment }; }
      if (home !== undefined) { if (!home.startsWith('/') || home.includes(':')) { fail(`usermod: invalid field '${home}'`); return done(); } changed = { ...changed, home }; }
      return saveAccounts({ users: acc.users.map(u => u.name === name ? changed : u), groups });
    }

    case 'groupadd': {
      const o = text.getopt(args, 'rg:', { system: 'r', gid: 'g' });
      if ('error' in o) { fail(`groupadd: ${o.error}`); fail('Usage: groupadd [options] GROUP'); return done(); }
      if (o.operands.length !== 1) { fail('Usage: groupadd [options] GROUP'); return done(); }
      if (state.user !== 'root') { notRoot('/etc/group'); return done(); }
      const acc = accounts(), name = o.operands[0], given = o.flags.get('g')?.at(-1);
      if (!ACCOUNT_NAME.test(name)) { fail(`groupadd: '${name}' is not a valid group name`); return done(); }
      if (findGroup(acc, name)) { fail(`groupadd: group '${name}' already exists`); return done(); }
      if (acc.groups.length >= LIMITS.groups) { fail(`groupadd: 模擬環境最多 ${LIMITS.groups} 個群組`); return done(); }
      if (given !== undefined && (!/^\d+$/.test(given) || Number(given) > 65534)) { fail(`groupadd: invalid group ID '${given}'`); return done(); }
      if (given !== undefined && groupById(acc, Number(given))) { fail(`groupadd: GID '${given}' already exists`); return done(); }
      const gid = given !== undefined ? Number(given) : nextId(acc.groups.map(g => g.gid), o.flags.has('r'));
      if (gid === undefined) { fail("groupadd: can't create group"); return done(); }
      return saveAccounts({ users: acc.users, groups: [...acc.groups, { name, gid, members: [] }] });
    }

    case 'newgrp': {
      if (args.length > 1) { fail('usage: newgrp [-] [group]'); return done(); }
      const acc = accounts(), mine = loginGroups(acc, state.user), group = args[0];
      // Like logging in again: the database's groups (with `group` as the primary one), so a group just joined counts.
      if (group === undefined) return done({ ...state, groups: mine });
      if (!findGroup(acc, group)) { fail(`newgrp: group '${group}' does not exist`); return done(); }
      if (!mine.includes(group) && state.user !== 'root') { fail(`newgrp: 你不在 ${group} 群組裡（模擬環境沒有群組密碼）`); return done(); }
      return done({ ...state, groups: [group, ...mine.filter(g => g !== group)] });
    }

    case 'umask': {
      const symbolic = args[0] === '-S', rest = symbolic ? args.slice(1) : args, mask = maskOf(state);
      if (rest[0]?.startsWith('-') && rest[0] !== '-') { fail(`bash: umask: ${rest[0]}: invalid option`); fail('umask: usage: umask [-p] [-S] [mode]'); return done(); }
      if (!rest.length) { print(symbolic ? umaskSymbolic(mask) : mask.toString(8).padStart(4, '0')); return done(); }
      const spec = rest[0];
      if (/^\d/.test(spec)) {
        if (!/^[0-7]+$/.test(spec) || parseInt(spec, 8) > 0o777) { fail(`bash: umask: ${spec}: octal number out of range`); return done(); }
        return done({ ...state, umask: parseInt(spec, 8) });
      }
      // A symbolic mode describes the permissions to keep (umask u=rwx,g=rx,o= is 027).
      const kept = applyMode(~mask & 0o777, spec);
      if (kept === undefined) { fail(`bash: umask: \`${spec}': invalid symbolic mode operator`); return done(); }
      return done({ ...state, umask: ~kept & 0o777 });
    }

    case 'sudo': {
      let i = 0, target = 'root';
      for (; i < args.length && args[i].startsWith('-'); i++) {
        const a = args[i];
        if (a === '--') { i++; break; }
        if (a === '-u' && i + 1 < args.length) { target = args[++i]; continue; }
        if (a.startsWith('-u') && a.length > 2) { target = a.slice(2); continue; }
        fail(a === '-u' ? "sudo: option requires an argument -- 'u'" : `sudo: invalid option -- '${a.startsWith('--') ? a.slice(2) : a.slice(1, 2)}'`);
        fail('usage: sudo [-u 使用者] 指令 [參數…]');
        return done();
      }
      const rest = args.slice(i);
      if (!rest.length) { fail('usage: sudo [-u 使用者] 指令 [參數…]'); return done(); }
      // sudoers: root, and the members of sudo (Debian, Ubuntu) or wheel (RHEL) as the session has them; no password prompt.
      if (state.user !== 'root' && !groupsOf(state).some(g => g === 'sudo' || g === 'wheel')) {
        fail(`${state.user} is not in the sudoers file.  This incident will be reported.`);
        return done();
      }
      const acc = accounts(), who = findUser(acc, target);
      if (!who) { fail(`sudo: unknown user ${target}`); return done(); }
      // E8: sudo also runs a script by its path (or one found in PATH).
      const script = features.has('scripting') && !BUILTINS.includes(rest[0]) && (rest[0].includes('/') || !!scriptInPath(cur(), rest[0], ctx.env));
      if (!script && (BUILTINS.includes(rest[0]) || !(profile.commands as readonly string[]).includes(rest[0]))) { fail(`sudo: ${rest[0]}: command not found`); return done(); }
      // The command runs as the target with the target's groups and home; the arguments were expanded by the learner's shell.
      const r = exec({ ...cur(), user: who.name, groups: loginGroups(acc, who.name), home: who.home }, rest, { ...ctx, sudo: true });
      r.events.forEach(push);
      code = r.status;
      notices.push(...r.notices ?? []);
      const { user: _u, groups: _g, home: _h, ...kept } = r.state;
      void _u; void _g; void _h;
      return done({ ...kept, user: state.user, home: state.home, ...state.groups ? { groups: state.groups } : {} });
    }

    case 'chown': case 'chgrp': {
      const o = options(args, 'R', LONG[cmd], gnu);
      if ('bad' in o) { badOption(o); return done(); }
      if (o.operands.length < 2) { usage(o.operands.length ? `${cmd}: missing operand after '${o.operands[0]}'` : `${cmd}: missing operand`); return done(); }
      const acc = accounts(), [spec, ...targets] = o.operands;
      const userNamed = (n: string) => findUser(acc, n) ?? (/^\d+$/.test(n) ? acc.users.find(u => u.uid === Number(n)) : undefined);
      const groupNamed = (n: string) => findGroup(acc, n) ?? (/^\d+$/.test(n) ? groupById(acc, Number(n)) : undefined);
      let owner: string | undefined, group: string | undefined;
      if (cmd === 'chgrp') {
        const g = groupNamed(spec);
        if (!g) { fail(`chgrp: invalid group: '${spec}'`); return done(); }
        group = g.name;
      } else {
        const [u, g, more] = spec.split(':');
        if (more !== undefined) { fail(`chown: invalid spec: '${spec}'`); return done(); }
        if (u) { const found = userNamed(u); if (!found) { fail(`chown: invalid user: '${spec}'`); return done(); } owner = found.name; }
        if (g) { const found = groupNamed(g); if (!found) { fail(`chown: invalid group: '${spec}'`); return done(); } group = found.name; }
        // user: (a colon and no group) means the user's login group.
        else if (g === '' && owner) group = groupById(acc, findUser(acc, owner)!.gid)?.name;
      }
      for (const target of targets) {
        const w = walk(cur(), resolve(target));
        if ('error' in w || !w.node) { fail(`${cmd}: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        const paths = o.flags.has('R') && w.node.kind === 'dir' ? subtreeOf(nodes, w.path) : [w.path];
        for (const p of paths) {
          const node = nodes.get(p)!, name = p === w.path ? target : joinShown(target, p.slice(w.path.length + 1));
          if (node.kind === 'link' && p !== w.path) continue;
          // As on Linux: only root may give a file away; its owner may change its group to a group the owner is in.
          const newOwner = owner ?? node.owner, newGroup = group ?? groupOf(node);
          const ok = state.user === 'root' || (node.owner === state.user && newOwner === node.owner && (newGroup === groupOf(node) || groupsOf(state).includes(newGroup)));
          if (!ok) { fail(`${cmd}: ${newOwner !== node.owner ? 'changing ownership' : 'changing group'} of '${name}': Operation not permitted`); continue; }
          const { group: _g, ...rest } = node;
          void _g;
          nodes.set(p, { ...rest, owner: newOwner, ...newGroup !== newOwner ? { group: newGroup } : {} });
        }
      }
      return commit();
    }

    case 'ps': code = proc.ps(cur(), args, pio(), ctx.peers ?? [[...words]]); return done();
    case 'top': code = proc.top(cur(), args, pio()); return done();
    case 'pgrep': code = proc.pgrep(cur(), 'pgrep', args, pio()).status; return done();
    case 'pidof': code = proc.pidof(cur(), args, pio()); return done();
    case 'kill': case 'pkill': {
      const master = features.has('nginx') ? masterOf(cur()) : undefined;
      const r = cmd === 'kill' ? proc.kill(cur(), args, pio()) : proc.pgrep(cur(), 'pkill', args, pio());
      notices.push(...r.notices);
      code = r.status;
      // E6: systemd notices when a service's main process ends (and Restart= may start it again).
      const after = afterSignal(r.state, r.ended);
      // E14: SIGHUP makes nginx's master reload its configuration. E17: a background ssh that ends takes its -R listeners on the server.
      const reloaded = master && r.status === 0 && masterOf(after)?.pid === master.pid && hupsMaster(cmd, args, master) ? reloadRunning(after) : after;
      return done(features.has('tunnels') && !reloaded.sshd ? closeOrphanForwards(reloaded) : reloaded);
    }
    case 'sleep': {
      const p = proc.sleepProblem(args);
      if (p) { usage(p); return done(); }
      // E18: from the edge profile up the simulated clock moves (every machine of the lesson), so caches expire and Age grows.
      if (!features.has('edge')) return done();
      const seconds = proc.sleepSeconds(args);
      if (seconds > 366 * 86400) { fail('sleep：模擬環境一次最多前進 366 天'); return done(); }
      return done(advanceClock(cur(), seconds));
    }
    case 'jobs': code = proc.jobsCommand(cur(), args, pio()); return done();
    case 'fg': case 'bg': { const r = proc.fgBg(cur(), cmd as 'fg' | 'bg', args, pio()); code = r.status; return done(r.state); }
    case 'date':
      if (features.has('scripting')) {
        // E8: date +FORMAT for scripts (backup-$(date +%F)); E9: the machine's time zone, or TZ= in the command's environment.
        let utc = false, format: string | undefined;
        for (const a of args) {
          if (a === '-u' || a === '--utc' || a === '--universal') utc = true;
          else if (a.startsWith('+') && format === undefined) format = a.slice(1);
          else if (a.startsWith('-')) { fail('date: 模擬環境的 date 只支援 -u 與 +格式（不能用 -d 或設定時間）'); return done(); }
          else { fail(`date: invalid date '${a}'`); return done(); }
        }
        const tz = ctx.env?.TZ, zone = utc ? UTC_ZONE : tz !== undefined ? zoneNamed(tz.replace(/^:/, '')) ?? UTC_ZONE : zoneOf(state), now = proc.clockOf(state).now;
        print(format !== undefined ? formatDate(format, zone, now) : zoneDate(zone, now));
        return done();
      }
      if (args.length && !(args.length === 1 && args[0] === '-u')) { fail('date: 模擬環境的 date 只顯示機器固定的時間（不接受格式與設定）'); return done(); }
      print(dateText(proc.clockOf(state).now)); return done();
    case 'uptime':
      if (args.length) { usage(`uptime: invalid option -- '${args[0].replace(/^-+/, '').slice(0, 1)}'`); return done(); }
      print(` ${proc.uptimeLine(state)}`); return done();
    case 'apt': { const r = apt(cur(), args, sio()); code = r.status; return done(r.state); }
    case 'apt-mark': { const r = aptMark(cur(), args, sio()); code = r.status; return done(r.state); }
    case 'dpkg': code = dpkg(cur(), args, sio()); return done();
    case 'systemctl': {
      // E7: starting or reloading ssh checks sshd_config first (sshd -t) and applies it after.
      const remote = features.has('remote') && !!state.sshd;
      if (remote) {
        const pre = sshdControl(cur(), args, state.user, 'before');
        if (pre.refused) { pre.refused.forEach(l => fail(l.text)); code = 1; return done(pre.state); }
      }
      // E14: starting, restarting or reloading nginx tests its configuration first (a failure keeps the running one on reload).
      let base = cur();
      if (features.has('nginx')) {
        const pre = nginxControl(base, args, state.user, 'before');
        if (pre.refused) { pre.refused.forEach(fail); code = 1; return done(pre.state); }
        base = pre.state;
      }
      const r = systemctl(base, args, { ...sio(), ...features.has('scripting') ? { script: serviceScript(profile, features.has('tls') ? certbotService(profile, ctx) : undefined) } : {} });
      code = r.status;
      // E11: named (re)started or reloaded by systemd loads its zones.
      let after = features.has('dns') ? afterSystemctl(base, r.state, args, r.status) : r.state;
      if (features.has('nginx')) after = nginxControl(after, args, state.user, 'after', base, r.status).state;
      return done(remote ? sshdControl(after, args, state.user, 'after', r.status).state : after);
    }
    case 'journalctl': code = journalctl(cur(), args, sio()); return done();

    case 'ssh': case 'ssh-keygen': case 'ssh-copy-id': case 'ssh-keyscan': case 'scp': case 'sshd': {
      // E7: other machines, keys and known_hosts (ssh.ts); a remote command runs on the remote machine's own shell.
      const r = remoteCommand(cmd, cur(), args, { out: write, err: fail, user: state.user, tty: ctx.tty, stdin: ctx.stdin, profile, alone: (ctx.peers?.length ?? 1) === 1 });
      code = r.status;
      return done(r.state);
    }
    case 'exit': {
      // E7: exit leaves a session opened with ssh (the interpreter's own exit, E8, ends a script first).
      if (args.length > 1) { fail('bash: exit: too many arguments'); return done(); }
      const n = args[0] === undefined ? state.status ?? 0 : /^[+-]?\d+$/.test(args[0]) ? ((Number(args[0]) % 256) + 256) % 256 : undefined;
      if (n === undefined) fail(`bash: exit: ${args[0]}: numeric argument required`);
      if (!state.login) { fail('exit：模擬環境不會關閉這個終端機（用 ssh 登入的遠端工作階段才用 exit 離開）'); return done(); }
      code = n ?? 2;
      return done({ ...state, logout: n ?? 2 });
    }
    case 'test': case '[': {
      const r = testCommand(cur(), cmd, args);
      r.errors.forEach(fail);
      code = r.status;
      return done();
    }
    case 'true': code = 0; return done();
    case 'false': code = 1; return done();
    case 'printf': {
      const r = printf(args);
      write(r.text);
      r.errors.forEach(fail);
      code = r.status;
      return done();
    }
    case 'bash': case 'sh': {
      const r = runBash(cur(), cmd, args, ctx);
      r.events.forEach(push);
      notices.push(...r.notices ?? []);
      code = r.status;
      return done(sameShell(r.state, cur()));
    }
    case 'ss': case 'lsof': case 'nc': case 'ip': case 'getent': case 'dig': case 'host': case 'named-checkzone': case 'rndc': case 'resolvectl': case 'curl':
    case 'openssl': case 'nginx': case 'certbot': case 'ufw': case 'nft': case 'ping': case 'traceroute': case 'mtr': case 'tcpdump': {
      // E10–E14 (sockets.ts, dns.ts, http.ts, openssl.ts, certbot.ts, nginx.ts): names are looked up through /etc/hosts and, from the dns profile up, DNS.
      // E18: edge (curl -w's timers); E19: the diagnostics of diag.ts.
      const io: NetIo = { out: write, err: fail, user: state.user, tty: ctx.tty, resolve: features.has('dns') ? dnsResolver : basicResolver, stdin: ctx.stdin, ...features.has('tls') ? { tls: true } : {}, ...features.has('edge') ? { edge: true } : {} };
      // E13: certbot runs a deploy hook through the shell (as the user it runs as, root).
      const r = cmd === 'certbot' ? certbot(cur(), args, { ...io, hook: (s, source) => { const x = runText(s, source, profile, { parent: ctx }); return { state: x.state, status: x.status }; } })
        : NET_COMMANDS[cmd as keyof typeof NET_COMMANDS](cur(), args, io);
      code = r.status;
      return done(r.state);
    }
    case 'docker': {
      // E20 (docker.ts): the daemon's images and containers; the socket decides who may use it (root or the docker group).
      const r = docker(cur(), args, { out: write, err: fail, user: state.user, tty: ctx.tty, stdin: ctx.stdin });
      code = r.status;
      return done(r.state);
    }
    case 'sed': {
      // E19: a documented subset of GNU sed (sed.ts); -i writes through a temporary file in the same folder, as GNU sed does.
      code = sed(args, {
        out: write, err: fail,
        read: name => name === '-' ? ctx.stdin === null ? { error: 'NOINPUT' } : { text: ctx.stdin, regular: ctx.stdinRegular } : readPath(cur(), name),
        write: (name, content, backup) => {
          const w = walk(cur(), resolve(name));
          if ('error' in w || !w.node) return `sed: can't read ${name}: ${ERRNO['error' in w ? w.error : 'ENOENT']}`;
          if (w.node.kind !== 'file') return `sed: couldn't edit ${name}: not a regular file`;
          const dir = parentOf(w.path), why = writableParent(w.path);
          if (why) return `sed: couldn't open temporary file ${dir === '/' ? '' : dir}/sedXXXXXX: ${ERRNO[why]}`;
          if (backup !== undefined) nodes.set(`${w.path}${backup}`, { ...w.node });
          // The new file is the user's (GNU sed cannot give it back to another owner unless it runs as root); the mode stays.
          nodes.set(w.path, { ...w.node, content, ...state.user === 'root' ? {} : ownedBy(cur()) });
          return null;
        },
      });
      return commit();
    }
    case 'crontab': case 'cron-next': case 'cron-run': case 'flock': case 'timedatectl': case 'systemd-analyze': {
      // E9 (schedule.ts); flock runs its command like sudo does, a -c string through the interpreter.
      const r = scheduleCommand(cmd, cur(), args, {
        out: write, err: fail, user: state.user, tty: ctx.tty, profile,
        argv: (s, argv) => { const x = exec(s, argv, { ...ctx, peers: undefined }); x.events.forEach(push); return { state: x.state, status: x.status }; },
        text: (s, source, opts) => { const x = runText(s, source, profile, { ...opts, parent: ctx }); x.events.forEach(push); return { state: x.state, status: x.status }; },
      });
      code = r.status;
      return done(r.state);
    }

    default: {
      // E8: a name without a slash may be a script in PATH (a file starting with #! in /usr/local/bin…).
      const path = features.has('scripting') && !cmd.includes('/') ? scriptInPath(cur(), cmd, ctx.env) ?? cmd : cmd;
      // E4: a path is a program to execute: bash's 127 when it is missing, 126 when it cannot be executed.
      if (features.has('processes') && path.includes('/')) {
        const w = walk(cur(), resolve(path));
        if ('error' in w || !w.node) { fail(`bash: ${cmd}: ${ERRNO['error' in w ? w.error : 'ENOENT']}`); code = 'error' in w && w.error !== 'ENOENT' ? 126 : 127; }
        else if (w.node.kind === 'dir') { fail(`bash: ${cmd}: Is a directory`); code = 126; }
        else if (!allowed(w.node, 'x') || !(w.node.mode & 0o111)) { fail(`bash: ${cmd}: Permission denied`); code = 126; }
        else if (features.has('scripting')) {
          // E8: a script with a bash or sh shebang runs in the interpreter (as a child: the session keeps its directory and variables).
          const r = runExecutable(cur(), w.path, path, args, ctx);
          r.events.forEach(push);
          notices.push(...r.notices ?? []);
          code = r.status;
          return done(sameShell(r.state, cur()));
        }
        else { fail(`bash: ${cmd}: 模擬環境不執行程式檔（指令稿的直譯在之後的引擎階段）`); code = 126; }
        return done();
      }
      fail(`bash: ${cmd}: command not found（模擬環境支援：${profile.commands.join('、')}）`);
      code = 127;
      return done();
    }
  }
}
/** id for a session user missing from the database (never on a lesson machine). */
const FIRST_UNKNOWN = 1000;

/**
 * Runs one command line against the state and returns the new state and what the terminal prints. Only the profile's
 * commands run (default: LAB_PROFILE, the lab's whole table); any other is "command not found". E2: with the pipes
 * feature the line may be a pipeline with redirections.
 */
export function run(state: FsState, input: string, profile: ShellProfile = LAB_PROFILE): RunResult {
  const r = runInput(state, input, profile);
  // E18: a file whose content the line changed was modified now (nginx's Last-Modified and ETag read it).
  return profile.features?.includes('edge') ? { ...r, state: stampTimes(state, r.state) } : r;
}

/** E18: sleep's time: every machine of the lesson (the local one and its network) moves its clock forward. */
export function advanceClock(state: FsState, seconds: number): FsState {
  const step = (s: FsState): FsState => ({ ...s, clock: { ...proc.clockOf(s), now: proc.clockOf(s).now + seconds } });
  const next = step(state);
  return next.net ? { ...next, net: { ...next.net, hosts: next.net.hosts.map(h => ({ ...h, state: step(h.state) })) } } : next;
}
/** E18: the files of the machines whose content changed get the clock's time as their mtime (touch sets it on its own). */
function stampTimes(before: FsState, after: FsState): FsState {
  const stamp = (b: FsState | undefined, a: FsState): FsState => {
    if (b && b.nodes === a.nodes) return a;
    const now = proc.clockOf(a).now;
    let nodes: Map<string, FsNode> | undefined;
    for (const [path, node] of a.nodes) {
      if (node.kind !== 'file') continue;
      const old = b?.nodes.get(path);
      if (old === node) continue;
      const changed = !old || old.kind !== 'file' || old.content !== node.content;
      const mtime = changed ? now : node.mtime ?? old.mtime;
      if (node.mtime === mtime || (mtime === undefined && node.mtime === undefined)) continue;
      nodes ??= new Map(a.nodes);
      const { mtime: _m, ...rest } = node;
      void _m;
      nodes.set(path, mtime === undefined ? rest : { ...rest, mtime });
    }
    return nodes ? { ...a, nodes } : a;
  };
  const root = stamp(before, after);
  if (!root.net) return root;
  return { ...root, net: { ...root.net, hosts: root.net.hosts.map((h, i) => { const s = stamp(before.net?.hosts[i]?.state, h.state); return s === h.state ? h : { ...h, state: s }; }) } };
}

/** run() with standard input for the line and without a terminal (E7: ssh host command runs with what was piped into ssh, no tty). */
export function runInput(state: FsState, input: string, profile: ShellProfile, stdin?: string | null, tty = true): RunResult {
  const features = new Set(profile.features ?? []);
  if (input.length > LIMITS.input) return { state, lines: [{ text: `輸入太長：一行最多 ${LIMITS.input} 個字元`, kind: 'err' }] };
  // E7: during an interactive ssh session the line runs on the remote machine (exit there ends the session).
  if (state.session && features.has('remote')) return remoteRun(state, input, profile);
  // E8: the scripting profile's prompt is the interpreter itself (variables, ; && ||, if, for, functions…).
  if (features.has('scripting')) return runInteractive(state, input, profile, stdin, tty);
  if (features.has('pipes')) return runLine(state, input, profile, features, stdin, tty);
  const tokens = lex(input);
  if ('error' in tokens) return { state, lines: [{ text: tokens.error, kind: 'err' }] };
  if (!tokens.words.length) return { state, lines: [] };
  if (tokens.words.some(w => ['|', ';', '&&', '||', '&', '<'].includes(w.text)) || /[|;&<`$]/.test(input.replace(/(["']).*?\1/g, '')))
    return { state, lines: [{ text: REFUSED, kind: 'err' }] };
  // E1: pathname expansion of the arguments (not of the command name or of a redirection's file).
  const words = expand(state, tokens.words, features, i => !i || ['>', '>>'].includes(tokens.words[i - 1].text));
  const r = exec(state, words, { profile, features, stdin: null, stdinRegular: false, tty: true });
  return { state: r.state, lines: r.events.map(e => ({ text: e.data.slice(0, -1), kind: e.fd === 1 ? 'out' : 'err' })), ...r.clear ? { clear: true } : {} };
}

type Sink = { path: string; shown: string; data: string };
/** Where a descriptor writes: the terminal (shown as output or as an error, by the stream it was opened as), the next stage, nowhere or a file. */
type Target = { t: 'term'; kind: Line['kind'] } | { t: 'pipe' } | { t: 'null' } | { t: 'file'; sink: Sink };

/**
 * E2: a line of the pipes feature. First every stage's redirections are applied, stage by stage and left to right (bash
 * starts all the stages at once, so a file written at the end of a pipeline is usually truncated before the start of it
 * reads it: cat f | sort > f empties f; here it always does). A failed redirection prints bash's message on that
 * stage's standard error and skips its command. Then the stages run in turn, each on the state the previous one left and
 * with the previous one's standard output as its standard input; standard error reaches the terminal unless redirected.
 * A stage of a pipeline with more than one stage is a subshell: cd, umask and newgrp there do not change the session.
 */
function runLine(state: FsState, input: string, profile: ShellProfile, features: ReadonlySet<ShellFeature>, stdin?: string | null, tty = true): RunResult {
  // E4 (processes): every line sets $? (a syntax error is 2, as in bash; an empty line keeps it).
  const statusMode = features.has('processes');
  const withStatus = (s: FsState, status: number): FsState => statusMode ? { ...s, status } : s;
  const fail = (text: string, status = 2): RunResult => ({ state: withStatus(state, status), lines: [{ text, kind: 'err' }] });
  const lexed = lexLine(input, statusMode ? { status: state.status ?? 0 } : {});
  if ('error' in lexed) return fail(lexed.error);
  if (!lexed.words.length) return { state, lines: [] };
  const line = parseLine(lexed.words);
  if ('error' in line) return fail(line.error);
  if (line.stages.length > LIMITS.stages) return fail(`此模擬器的管線最多 ${LIMITS.stages} 段`);
  if (lexed.background) {
    const r = background(state, line.stages, features);
    return { state: withStatus(r.state, r.status), lines: r.lines };
  }
  const r = runStages(state, line.stages, profile, { ...stdin !== undefined ? { stdin } : {}, ...tty ? {} : { tty: false } });
  return { state: withStatus(r.state, r.status), lines: render(r.shown), ...r.clear ? { clear: true } : {} };
}

/** E4: a line ending in &: only sleep runs in the background (it is the one program that would keep running); bash prints [job] pid. */
export function background(state: FsState, stages: readonly Stage[], features: ReadonlySet<ShellFeature>): { state: FsState; status: number; lines: Line[] } {
  const err = (...texts: string[]) => ({ state, status: 1, lines: texts.map(text => ({ text, kind: 'err' as const })) });
  const only = stages.length === 1 && !stages[0].redirects.length && stages[0].argv[0]?.text === 'sleep';
  if (!only) return err('bash: 模擬環境的背景執行（&）只支援 sleep，例如 sleep 300 &');
  const argv = expand(state, stages[0].argv, features, j => j === 0), problem = proc.sleepProblem(argv.slice(1));
  if (problem) return err(problem, "Try 'sleep --help' for more information.");
  if (proc.tableOf(state).length >= proc.MAX_PROCESSES) return err(`bash: fork: 模擬環境最多 ${proc.MAX_PROCESSES} 個行程`);
  const r = proc.startJob(state, argv);
  return { state: r.state, status: 0, lines: [{ text: r.notice, kind: 'out' }] };
}

/** E8: how the interpreter runs a pipeline of expanded stages: initial standard input, whether its output is a terminal, the environment. */
export interface StageOptions { stdin?: string | null; tty?: boolean; env?: Readonly<Record<string, string>>; script?: ScriptCtx }
/** E8: what reached the terminal (output and errors, in order), the exit status of the last stage and of each stage (pipefail). */
export interface StagesResult { state: FsState; shown: Shown[]; status: number; statuses: number[]; clear: boolean }

/**
 * E2: the stages of a pipeline (see runLine). E8: also the interpreter's way to run commands, with an initial standard
 * input, a terminal or not, and its environment, so permissions, pipes and redirection behave exactly as at the prompt.
 */
export function runStages(state: FsState, stages: readonly Stage[], profile: ShellProfile, opts: StageOptions = {}): StagesResult {
  const features = new Set(profile.features ?? []);
  const shown: Shown[] = [];
  const route = (fds: readonly Target[], ev: Ev, piped: { data: string }) => {
    const to = fds[ev.fd];
    if (to.t === 'term') shown.push({ kind: to.kind, data: ev.data });
    else if (to.t === 'pipe') piped.data += ev.data;
    else if (to.t === 'file') to.sink.data += ev.data;
  };
  // 1. Redirections, in order, on one copy of the file system.
  const nodes = new Map(state.nodes), opened = { ...state, nodes };
  const plans = stages.map((stage, i) => {
    const fds: Target[] = [{ t: 'null' }, i === stages.length - 1 ? { t: 'term', kind: 'out' } : { t: 'pipe' }, { t: 'term', kind: 'err' }];
    const sinks: Sink[] = [], early: Ev[] = [];
    let stdin: string | null | undefined, stdinRegular = false, ok = true;
    for (const r of stage.redirects) {
      if (r.op === '2>&1') { fds[2] = fds[1]; continue; }
      if (r.op === '>&2') { fds[1] = fds[2]; continue; }
      // E8: a here-document or here-string of the interpreter is standard input text.
      if (r.op === 'here') { stdin = r.word?.text ?? ''; stdinRegular = false; continue; }
      if (!r.word) continue;
      const target = tilde(opened, r.word).text;
      const problem = (why: string) => { early.push({ fd: 2, data: `bash: ${target}: ${why}\n` }); ok = false; };
      if (r.op === '<') {
        const read = readPath(opened, target);
        if ('error' in read) { problem(text.ERROR_TEXT[read.error]); break; }
        stdin = read.text; stdinRegular = read.regular;
        continue;
      }
      const result = openWrite(nodes, opened, target, r.op.endsWith('>>'));
      if ('error' in result) { problem(OPEN_TEXT[result.error]); break; }
      const fd = r.op.startsWith('2') ? 2 : 1;
      if (result.path === null) fds[fd] = { t: 'null' };
      else { const sink = { path: result.path, shown: target, data: '' }; sinks.push(sink); fds[fd] = { t: 'file', sink }; }
    }
    // A failed redirection stops the list there, so its message goes where standard error pointed at that moment.
    return { stage, fds, sinks, early, stdin, stdinRegular, ok };
  });
  // 2. The commands, one stage after another.
  let cur: FsState = opened, pipe: string | null = opts.stdin ?? null, clear = false, status = 0;
  const statuses: number[] = [];
  const peers = stages.map(st => st.argv.map(w => w.text));
  for (const plan of plans) {
    const piped = { data: '' };
    plan.early.forEach(ev => route(plan.fds, ev, piped));
    let work = cur;
    status = plan.ok ? 0 : 1;
    if (plan.ok && plan.stage.argv.length) {
      const argv = expand(work, plan.stage.argv, features, j => j === 0);
      const stdin = plan.stdin !== undefined ? plan.stdin : pipe;
      const r = exec(work, argv, {
        profile, features, stdin, stdinRegular: plan.stdin !== undefined && plan.stdinRegular, tty: plan.fds[1].t === 'term' && opts.tty !== false, peers,
        ...opts.env ? { env: opts.env } : {}, ...opts.script ? { script: opts.script } : {},
      });
      work = r.state;
      status = r.status;
      r.events.forEach(ev => route(plan.fds, ev, piped));
      for (const n of r.notices ?? []) shown.push({ kind: 'out', data: `${n}\n` });
      if (r.clear && plans.length === 1 && plan.fds[1].t === 'term') clear = true;
    }
    if (plan.sinks.length) {
      const flushed = new Map(work.nodes);
      for (const sink of plan.sinks) {
        const node = flushed.get(sink.path);
        if (node?.kind !== 'file' || !sink.data) continue;
        const content = (node.content ?? '') + sink.data;
        if (content.length > LIMITS.fileLength) { shown.push({ kind: 'err', data: `bash: ${sink.shown}: File too large（模擬環境上限 ${LIMITS.fileLength} 字元）\n` }); continue; }
        flushed.set(sink.path, { ...node, content });
      }
      work = { ...work, nodes: flushed };
    }
    pipe = piped.data;
    statuses.push(status);
    cur = plans.length > 1 ? sameShell(work, state) : work;
  }
  return { state: cur, shown, status, statuses, clear };
}

/** E2: the state after a subshell: its file system and accounts, the shell's own working directory, umask and groups. */
export function sameShell(next: FsState, shell: FsState): FsState {
  const { umask: _m, groups: _g, ...rest } = next;
  void _m; void _g;
  return { ...rest, cwd: shell.cwd, ...shell.umask !== undefined ? { umask: shell.umask } : {}, ...shell.groups ? { groups: shell.groups } : {} };
}

/** E2: what reached the terminal, and as which stream (2>&1 shows errors as output, >&2 output as errors). */
export type Shown = { kind: Line['kind']; data: string };
/** E2: what reaches the terminal, as lines: output split at newlines (a last line without one too), errors in order. */
export function render(events: readonly Shown[]): Line[] {
  const lines: Line[] = [];
  let partial = '';
  for (const e of events) {
    if (e.kind === 'out') {
      const parts = (partial + e.data).split('\n');
      partial = parts.pop()!;
      for (const p of parts) lines.push({ text: p, kind: 'out' });
      continue;
    }
    if (partial) { lines.push({ text: partial, kind: 'out' }); partial = ''; }
    for (const p of e.data.replace(/\n$/, '').split('\n')) lines.push({ text: p, kind: 'err' });
  }
  if (partial) lines.push({ text: partial, kind: 'out' });
  return lines;
}

/** A copied node: the same kind, mode and content, owned by the user, in the user's own group (no group field). */
function copyOf(node: FsNode, user: string): FsNode {
  const { group: _group, ...rest } = node;
  void _group;
  return { ...rest, owner: user };
}

// ------------------------------------------------------------------------------------------- E8: test, [ and printf

class TestError extends Error {}
const UNARY = ['-e', '-f', '-d', '-r', '-w', '-x', '-s', '-L', '-h', '-z', '-n'];
const BINARY = ['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef'];

/** E8: a file test (-e -f -d -r -w -x -s; -L and -h do not follow the last link) with the user's permissions. */
export function fileTest(state: FsState, op: string, path: string): boolean {
  const w = walk(state, physicalPath(state.nodes, resolvePath(state, path)), op !== '-L' && op !== '-h');
  if ('error' in w || !w.node) return false;
  const node = w.node, groups = groupsOf(state);
  switch (op) {
    case '-e': return true;
    case '-f': return node.kind === 'file';
    case '-d': return node.kind === 'dir';
    case '-L': case '-h': return node.kind === 'link';
    case '-s': return node.kind === 'dir' || (node.content ?? '').length > 0;
    case '-r': return can(node, state.user, 'r', groups);
    case '-w': return can(node, state.user, 'w', groups);
    // root may execute what has any x bit (and enter every folder).
    case '-x': return state.user === 'root' ? node.kind === 'dir' || (node.mode & 0o111) !== 0 : can(node, state.user, 'x', groups);
    default: return false;
  }
}
const integer = (t: string) => { if (!/^\s*[+-]?\d+\s*$/.test(t)) throw new TestError(`${t}: integer expression expected`); return Number(t); };
/** E8: one test of two operands (string, integer or the -nt family, which needs timestamps the simulation does not have). */
export function binaryTest(op: string, a: string, b: string): boolean {
  switch (op) {
    case '=': case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '-eq': return integer(a) === integer(b);
    case '-ne': return integer(a) !== integer(b);
    case '-lt': return integer(a) < integer(b);
    case '-le': return integer(a) <= integer(b);
    case '-gt': return integer(a) > integer(b);
    case '-ge': return integer(a) >= integer(b);
    default: throw new TestError(`${op}: 模擬環境的檔案沒有時間戳記與 inode，不支援這個比較`);
  }
}
/** E8: one test of one operand. */
export function unaryTest(state: FsState, op: string, a: string): boolean {
  if (op === '-z') return a === '';
  if (op === '-n') return a !== '';
  return fileTest(state, op, a);
}
function evalTest(state: FsState, a: readonly string[]): boolean {
  switch (a.length) {
    case 0: return false;
    case 1: return a[0] !== '';
    case 2:
      if (a[0] === '!') return a[1] === '';
      if (UNARY.includes(a[0])) return unaryTest(state, a[0], a[1]);
      throw new TestError(`${a[0]}: unary operator expected`);
    case 3:
      if (BINARY.includes(a[1])) return binaryTest(a[1], a[0], a[2]);
      if (a[0] === '!') return !evalTest(state, a.slice(1));
      if (a[0] === '(' && a[2] === ')') return a[1] !== '';
      if (a[1] === '-a' || a[1] === '-o') return a[1] === '-a' ? a[0] !== '' && a[2] !== '' : a[0] !== '' || a[2] !== '';
      throw new TestError(`${a[1]}: binary operator expected`);
    case 4:
      if (a[0] === '!') return !evalTest(state, a.slice(1));
      if (a[0] === '(' && a[3] === ')') return evalTest(state, a.slice(1, 3));
  }
  // More: -o is weaker than -a, ! and ( ) group (POSIX's XSI extension, as bash's test).
  let i = 0;
  const or = (): boolean => { let v = and(); while (a[i] === '-o') { i++; const r = and(); v = v || r; } return v; };
  const and = (): boolean => { let v = not(); while (a[i] === '-a') { i++; const r = not(); v = v && r; } return v; };
  const not = (): boolean => { if (a[i] === '!') { i++; return !not(); } return primary(); };
  const primary = (): boolean => {
    if (i >= a.length) throw new TestError('argument expected');
    if (a[i] === '(') { i++; const v = or(); if (a[i] !== ')') throw new TestError("`)' expected"); i++; return v; }
    if (UNARY.includes(a[i]) && i + 1 < a.length) { const op = a[i]; i += 2; return unaryTest(state, op, a[i - 1]); }
    if (i + 2 < a.length && BINARY.includes(a[i + 1])) { const [x, op, y] = a.slice(i, i + 3); i += 3; return binaryTest(op, x, y); }
    return a[i++] !== '';
  };
  const v = or();
  if (i < a.length) throw new TestError('too many arguments');
  return v;
}
/** E8: test and [ (bash's builtins): status 0 when the expression holds, 1 when not, 2 with bash's message when it is malformed. */
export function testCommand(state: FsState, cmd: string, args: readonly string[]): { status: number; errors: string[] } {
  let a = [...args];
  if (cmd === '[') {
    if (a.at(-1) !== ']') return { status: 2, errors: ["bash: [: missing `]'"] };
    a = a.slice(0, -1);
  }
  try { return { status: evalTest(state, a) ? 0 : 1, errors: [] }; }
  catch (e) { if (e instanceof TestError) return { status: 2, errors: [`bash: ${cmd}: ${e.message}`] }; throw e; }
}

/** E8: printf's backslash escapes (\n \t \\ \" \r \a \e and \0NNN octal). */
export function printfEscapes(text: string): string {
  return text.replace(/\\(0[0-7]{0,3}|[ntr\\"ae'])/g, (_, c: string) => c[0] === '0' ? String.fromCharCode(parseInt(c, 8) || 0)
    : ({ n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', a: '\x07', e: '\x1b', "'": "'" } as Record<string, string>)[c]);
}
/**
 * E8: bash's printf: %s %b %c %d %i %u %o %x %X %f %e %% with the flags - 0 + and space, a width and a precision; the
 * format is reused while arguments remain; a missing argument is empty (or 0); a bad number is bash's error and 0.
 */
export function printf(args: readonly string[]): { text: string; errors: string[]; status: number } {
  if (!args.length) return { text: '', errors: ['printf: usage: printf [-v var] format [arguments]'], status: 2 };
  if (args[0] === '-v') return { text: '', errors: ['bash: printf: -v: 模擬環境不支援 -v，請用 變數=$(printf …)'], status: 2 };
  const [format, ...rest] = args[0] === '--' ? args.slice(1) : args;
  if (format === undefined) return { text: '', errors: ['printf: usage: printf [-v var] format [arguments]'], status: 2 };
  let text = '', i = 0, status = 0;
  const errors: string[] = [];
  const number = (arg: string | undefined, float: boolean): number => {
    if (arg === undefined || arg === '') return 0;
    if (/^['"]./.test(arg)) return arg.codePointAt(1)!;
    if (float ? /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(arg) : /^\s*[+-]?\d+$/.test(arg)) return Number(arg);
    errors.push(`bash: printf: ${arg}: invalid number`); status = 1;
    return float ? Number.parseFloat(arg) || 0 : Number.parseInt(arg, 10) || 0;
  };
  const pad = (body: string, flags: string, width: number, numeric: boolean) => {
    if (body.length >= width) return body;
    if (flags.includes('-')) return body.padEnd(width);
    if (flags.includes('0') && numeric) { const sign = /^[+\- ]/.test(body) ? body[0] : ''; return sign + body.slice(sign.length).padStart(width - sign.length, '0'); }
    return body.padStart(width);
  };
  do {
    const start = i;
    text += format.replace(/%([-+ 0#]*)(\d*)(?:\.(\d*))?([sbcdiuoxXfeE%])|\\(0[0-7]{0,3}|.)/g, (all, flags: string, w: string, prec: string | undefined, conv: string, esc: string) => {
      if (esc !== undefined) return printfEscapes(all);
      if (conv === '%') return '%';
      const width = Number(w || 0), arg = rest[i++];
      switch (conv) {
        case 's': { const v = arg ?? ''; return pad(prec !== undefined ? v.slice(0, Number(prec)) : v, flags, width, false); }
        case 'b': return pad(printfEscapes(arg ?? ''), flags, width, false);
        case 'c': return pad((arg ?? '').slice(0, 1), flags, width, false);
        case 'f': case 'e': case 'E': {
          const n = number(arg, true), p = prec === undefined || prec === '' ? 6 : Number(prec);
          let body = conv === 'f' ? n.toFixed(p) : n.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
          if (conv === 'E') body = body.toUpperCase();
          if (n >= 0 && flags.includes('+')) body = `+${body}`; else if (n >= 0 && flags.includes(' ')) body = ` ${body}`;
          return pad(body, flags, width, true);
        }
        default: {
          const n = Math.trunc(number(arg, false));
          let body = conv === 'o' ? Math.abs(n).toString(8) : conv === 'x' ? Math.abs(n).toString(16) : conv === 'X' ? Math.abs(n).toString(16).toUpperCase() : String(Math.abs(n));
          if (prec) body = body.padStart(Number(prec), '0');
          body = (n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '') + body;
          return pad(body, flags, width, true);
        }
      }
    });
    if (i === start) break;
  } while (i < rest.length);
  return { text, errors, status };
}

/** The prompt, e.g. learner@logic-island:~/projects$ (LNX-0: the state's host when it has one; # for root, as in bash). */
export function prompt(state: FsState): string {
  // E7: in an ssh session, the remote machine's prompt.
  if (state.session) state = activeState(state);
  const where = isInside(state.cwd, state.home) ? '~' + state.cwd.slice(state.home.length) : state.cwd;
  return `${state.user}@${state.host ?? DEFAULT_HOST}:${where}${state.user === 'root' ? '#' : '$'}`;
}
