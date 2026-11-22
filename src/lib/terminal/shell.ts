import {
  baseName, can, childrenOf, DEFAULT_HOST, DEFAULT_SYSTEM, depthOf, groupOf, groupsOf, humanSize, isInside, joinPath, LIMITS, linkTarget,
  MAX_LINK_HOPS, modeString, parentOf, physicalPath, resolvePath, subtreeOf, validName, type Access, type FsNode, type FsState, type Mount,
} from './fs';
import { escapeGlob, expandGlob, hasMagic } from './glob';
import { helpPage, manualPage } from './manual';

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
 */

export interface Line { text: string; kind: 'out' | 'err' }
export interface RunResult { state: FsState; lines: Line[]; clear?: true }

export const COMMANDS = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'chmod', 'echo', 'whoami', 'clear', 'help'] as const;
/** E1: the commands engine stage E1 adds (only FILES_PROFILE has them). */
export const E1_COMMANDS = ['uname', 'hostname', 'man', 'df', 'du', 'ln', 'readlink'] as const;
export type CommandName = typeof COMMANDS[number] | typeof E1_COMMANDS[number];
/** Every command any profile may list. */
export const ALL_COMMANDS: readonly CommandName[] = [...COMMANDS, ...E1_COMMANDS];

/**
 * E1: behaviour a profile switches on besides its commands. glob: * ? [...] in arguments; help-option: 指令 --help;
 * multi-source: cp and mv with several sources into a folder; ls-extra: ls -h and -d, and operands grouped like GNU ls.
 */
export type ShellFeature = 'glob' | 'help-option' | 'multi-source' | 'ls-extra';

/** LNX-0: the commands a session may run (E1: and the features it switches on; none by default). */
export interface ShellProfile { readonly id: string; readonly commands: readonly CommandName[]; readonly features?: readonly ShellFeature[] }
/** The P7 lab's table: every command above, no pipes. run() uses it when no profile is given. */
export const LAB_PROFILE: ShellProfile = { id: 'lab', commands: COMMANDS };
/** E1: the lab's commands plus file-system and system-information commands, globs, --help and multi-source cp/mv. */
export const FILES_PROFILE: ShellProfile = {
  id: 'files',
  commands: ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'ln', 'readlink', 'chmod', 'echo', 'du', 'df', 'uname', 'hostname', 'whoami', 'man', 'clear', 'help'],
  features: ['glob', 'help-option', 'multi-source', 'ls-extra'],
};
/** The profiles a lesson machine may name (TerminalMachine.profile). */
export const PROFILES = { lab: LAB_PROFILE, files: FILES_PROFILE } as const;
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
  ['echo', '  echo 文字 [> 或 >> 檔案]  輸出文字，或寫入（>）、附加（>>）到檔案'],
  ['cp', '  cp [-r] 來源 目的地       複製；複製目錄要加 -r'],
  ['mv', '  mv 來源 目的地           移動或改名'],
  ['rm', '  rm [-r] [-f] 路徑…       刪除；刪除目錄要加 -r（無法復原）'],
  ['chmod', '  chmod 模式 路徑…         修改權限，例如 chmod 644 a.txt、chmod u+x run.sh'],
  ['ln', '  ln -s 目標 連結名稱       建立符號連結'],
  ['readlink', '  readlink [-f] 連結       顯示連結指向的目標'],
  ['du', '  du [-s] [-h] [-a] [路徑…]  估計目錄占用的空間'],
  ['df', '  df [-h] [-T] [路徑…]      顯示各個檔案系統的空間用量'],
  ['uname', '  uname [-a] [-s] [-r] [-m]  顯示核心與系統資訊'],
  ['hostname', '  hostname               顯示主機名稱'],
  ['man', '  man 指令                顯示指令的說明頁（也可以用 指令 --help）'],
];
/** E1: the lines that change when a profile has the feature (the lab keeps its own lines). */
const HELP_FEATURE: [ShellFeature, CommandName, string][] = [
  ['ls-extra', 'ls', '  ls [-l] [-a] [-h] [-d] [路徑…]  列出目錄內容；-l 詳細資料，-a 隱藏項目，-h 易讀的大小，-d 目錄本身'],
  ['multi-source', 'cp', '  cp [-r] 來源… 目的地      複製；複製目錄要加 -r；多個來源時目的地必須是目錄'],
  ['multi-source', 'mv', '  mv 來源… 目的地          移動或改名；多個來源時目的地必須是目錄'],
];
const HELP_LAST: CommandName[] = ['whoami', 'clear', 'help'];

type Errno = 'ENOENT' | 'ENOTDIR' | 'EACCES' | 'ELOOP';
type Fail = { error: Errno };
/** The node (if any) and its real path: every link on the way followed (the last one too when following). */
type Found = { node: FsNode | undefined; path: string };

const ERRNO = { ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EACCES: 'Permission denied', ELOOP: 'Too many levels of symbolic links' } as const;

/**
 * Walks to a path: every folder on the way must exist and be searchable (x). The node itself may be missing. E1: a
 * symbolic link on the way is followed (the last part only when `follow`), at most MAX_LINK_HOPS times (then ELOOP).
 */
function walk(state: Pick<FsState, 'nodes' | 'user' | 'groups'>, path: string, follow = true): Fail | Found {
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

interface Word { text: string; pattern: string }

/** The words of a command line, each with its glob pattern (quoted characters escaped); see tokenize. */
function lex(input: string): { words: Word[] } | { error: string } {
  const words: Word[] = [];
  let word = '', pattern = '', quote: '"' | "'" | null = null, started = false, lastRedirect = false;
  const end = () => { if (started) { words.push({ text: word, pattern }); word = ''; pattern = ''; started = false; } };
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
    // Unquoted, only a backslash is escaped (this tokenizer gives it no meaning); * ? [ ] keep their glob meaning.
    word += ch; pattern += ch === '\\' ? '\\\\' : ch; started = true;
  }
  if (quote) return { error: 'bash: unexpected EOF while looking for matching quote' };
  if (started) words.push({ text: word, pattern });
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

/** Leading -abc options (any order, combinable) and the remaining operands; `--` ends the options. */
function options(args: string[], allowed: string): { flags: Set<string>; operands: string[] } | { bad: string } {
  const flags = new Set<string>(), operands: string[] = [];
  let done = false;
  for (const arg of args) {
    if (!done && arg === '--') { done = true; continue; }
    if (!done && arg.startsWith('-') && arg.length > 1) {
      for (const f of arg.slice(1)) { if (!allowed.includes(f)) return { bad: f }; flags.add(f); }
    } else operands.push(arg);
  }
  return { flags, operands };
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;
/** E1: a path as the learner wrote it with a name after it (du, ln, glob). */
const joinShown = (at: string, name: string) => at.endsWith('/') ? at + name : `${at}/${name}`;
/** E1: du's block rule: a folder takes 4K, a file its size rounded up to whole 4K blocks, a link nothing (KiB). */
const blocksOf = (node: FsNode) => node.kind === 'dir' ? 4 : node.kind === 'link' ? 0 : Math.ceil(byteLength(node.content ?? '') / 4096) * 4;
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

/**
 * Runs one command line against the state and returns the new state and what the terminal prints. Only the profile's
 * commands run (default: LAB_PROFILE, the lab's whole table); any other is "command not found".
 */
export function run(state: FsState, input: string, profile: ShellProfile = LAB_PROFILE): RunResult {
  const out: Line[] = [];
  const print = (text: string) => out.push({ text, kind: 'out' });
  const fail = (text: string) => out.push({ text, kind: 'err' });
  const done = (next: FsState = state): RunResult => ({ state: next, lines: out });
  const features = new Set(profile.features ?? []);

  if (input.length > LIMITS.input) { fail(`輸入太長：一行最多 ${LIMITS.input} 個字元`); return done(); }
  const tokens = lex(input);
  if ('error' in tokens) { fail(tokens.error); return done(); }
  if (!tokens.words.length) return done();
  if (tokens.words.some(w => ['|', ';', '&&', '||', '&', '<'].includes(w.text)) || /[|;&<`$]/.test(input.replace(/(["']).*?\1/g, '')))
  { fail('此模擬器不支援管線、指令串接、變數與背景執行（| ; && $ `）；一次輸入一個指令。'); return done(); }

  const nodes = new Map(state.nodes);
  /** The state as it is now (commands with several operands see their own earlier changes). */
  const cur = (): FsState => ({ ...state, nodes });
  const commit = (cwd = state.cwd): RunResult => done({ ...state, nodes, cwd });
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

  // E1: pathname expansion of the arguments (not of the command name or of a redirection's file).
  const words = features.has('glob')
    ? tokens.words.flatMap((w, i, all) => {
      if (!i || !hasMagic(w.pattern) || ['>', '>>'].includes(all[i - 1].text)) return [w.text];
      const found = expandGlob(w.pattern, state.home, {
        list: p => {
          const v = walk(state, resolve(p || '.'));
          return 'error' in v || v.node?.kind !== 'dir' || !allowed(v.node, 'r') ? null : childrenOf(state.nodes, v.path).map(baseName);
        },
        exists: p => { const v = walk(state, resolve(p), false); return !('error' in v) && !!v.node; },
        isDir: p => isFolder(p),
      });
      return found.length ? found : [w.text];
    })
    : tokens.words.map(w => w.text);

  const [cmd, ...args] = words;
  const known = (profile.commands as readonly string[]).includes(cmd);
  // E1: 指令 --help prints the command's short help (echo prints it as text, as in bash).
  if (known && features.has('help-option') && cmd !== 'echo') {
    const at = args.indexOf('--help'), stop = args.indexOf('--');
    if (at >= 0 && (stop < 0 || at < stop)) { helpPage(cmd as CommandName).forEach(print); return done(); }
  }

  switch (known ? cmd as CommandName : undefined) {
    case 'help': {
      const lineOf = (c: CommandName, line: string) => HELP_FEATURE.find(([f, h]) => h === c && features.has(f))?.[2] ?? line;
      HELP.filter(([c]) => !c || profile.commands.includes(c)).forEach(([c, line]) => print(c ? lineOf(c, line) : line));
      const last = HELP_LAST.filter(c => profile.commands.includes(c));
      if (last.length) print(`  ${last.join('、')}`);
      if (features.has('glob')) print('  萬用字元：* 任意多個字元、? 一個字元、[abc] 或 [a-z] 其中一個字元');
      return done();
    }
    case 'whoami': print(state.user); return done();
    case 'clear': return { state, lines: [], clear: true };
    case 'pwd': print(state.cwd); return done();

    case 'echo': {
      const at = args.findIndex(a => a === '>' || a === '>>');
      const text = (at < 0 ? args : args.slice(0, at)).join(' ');
      if (at < 0) { print(text); return done(); }
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
      const content = (args[at] === '>>' ? w.node?.content ?? '' : '') + text + '\n';
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
      const o = options(args, extra ? 'lahd' : 'la');
      if ('bad' in o) { fail(`ls: invalid option -- '${o.bad}'`); return done(); }
      const long = o.flags.has('l'), all = o.flags.has('a'), human = o.flags.has('h'), self = o.flags.has('d');
      const targets = o.operands.length ? o.operands : ['.'];
      const size = (node: FsNode) => node.kind === 'dir' ? 4096 : byteLength((node.kind === 'link' ? node.target : node.content) ?? '');
      // Folders end in / (like ls -F) so the listing reads without colours; . and .. stay as they are; E1: links end in @.
      const label = (name: string, node: FsNode) => node.kind === 'dir' && name !== '.' && name !== '..' && !name.endsWith('/') ? `${name}/` : node.kind === 'link' ? `${name}@` : name;
      const entry = (name: string, node: FsNode) => long
        ? `${modeString(node)} ${node.owner.padEnd(7)} ${groupOf(node).padEnd(7)} ${(human ? humanSize(size(node)) : String(size(node))).padStart(5)} ${node.kind === 'link' ? `${name} -> ${node.target ?? ''}` : label(name, node)}`
        : label(name, node);
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
        if (long) shownRows.forEach(([name, node]) => print(entry(name, node)));
        else if (shownRows.length) print(shownRows.map(([name, node]) => entry(name, node)).join('  '));
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
      if (long) files.forEach(([name, node]) => print(entry(name, node)));
      else if (files.length) print(files.map(([name, node]) => entry(name, node)).join('  '));
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
      const o = options(args, 'p');
      if ('bad' in o) { fail(`mkdir: invalid option -- '${o.bad}'`); return done(); }
      if (!o.operands.length) { fail('mkdir: missing operand'); return done(); }
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
          nodes.set(step, { kind: 'dir', mode: 0o755, owner: state.user });
        }
      }
      return commit();
    }

    case 'touch': {
      if (!args.length) { fail('touch: missing file operand'); return done(); }
      for (const target of args) {
        const w = walk(cur(), resolve(target));
        if ('error' in w) { fail(`touch: cannot touch '${target}': ${ERRNO[w.error]}`); continue; }
        if (w.node) { if (!allowed(w.node, 'w') && w.node.owner !== state.user) fail(`touch: cannot touch '${target}': Permission denied`); continue; }
        // E1: touching a dangling link creates its target.
        const path = w.path;
        const why = writableParent(path);
        if (why) { fail(`touch: cannot touch '${target}': ${ERRNO[why]}`); continue; }
        if (!validName(baseName(path)) || tooDeep(path)) { fail(`touch: cannot touch '${target}': File name too long`); continue; }
        if (!room(1)) { fail(`touch: cannot touch '${target}': No space left on device`); continue; }
        nodes.set(path, { kind: 'file', mode: 0o644, owner: state.user, content: '' });
      }
      return commit();
    }

    case 'cat': {
      if (!args.length) { fail('cat: 模擬環境沒有標準輸入，請指定檔案，例如 cat README.txt'); return done(); }
      for (const target of args) {
        const w = walk(state, resolve(target));
        if ('error' in w || !w.node) { fail(`cat: ${target}: ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        if (w.node.kind === 'dir') { fail(`cat: ${target}: Is a directory`); continue; }
        if (!allowed(w.node, 'r')) { fail(`cat: ${target}: Permission denied`); continue; }
        const text = w.node.content ?? '';
        (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').forEach(l => text && print(l));
      }
      return done();
    }

    case 'cp': case 'mv': {
      const o = options(args, cmd === 'cp' ? 'r' : '');
      if ('bad' in o) { fail(`${cmd}: invalid option -- '${o.bad}'`); return done(); }
      const multi = features.has('multi-source'), n = o.operands.length;
      if (multi && n < 2) { fail(n ? `${cmd}: missing destination file operand after '${o.operands[0]}'` : `${cmd}: missing file operand`); return done(); }
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
          const each = before.get(p)!;
          if (cmd === 'mv') nodes.delete(p);
          // A copy belongs to the user (and, LNX-0, to the user's own group); a move keeps the node as it was.
          nodes.set(dest + p.slice(real.length), cmd === 'cp' ? copyOf(each, state.user) : each);
        }
        if (moved) cwd = dest + physical.slice(real.length);
      }
      return commit(cwd);
    }

    case 'rm': {
      const o = options(args, 'rfR');
      if ('bad' in o) { fail(`rm: invalid option -- '${o.bad}'`); return done(); }
      const recursive = o.flags.has('r') || o.flags.has('R'), force = o.flags.has('f');
      if (!o.operands.length) { if (!force) fail('rm: missing operand'); return done(); }
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
      if (args.length < 2) { fail(args.length ? `chmod: missing operand after '${args[0]}'` : 'chmod: missing operand'); return done(); }
      const [spec, ...targets] = args;
      for (const target of targets) {
        const path = resolve(target), w = walk(cur(), path);
        if ('error' in w || !w.node) {
          const own = walk(cur(), path, false);
          if (!('error' in w) && !('error' in own) && own.node?.kind === 'link') fail(`chmod: cannot operate on dangling symlink '${target}'`);
          else fail(`chmod: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`);
          continue;
        }
        const mode = applyMode(w.node.mode, spec);
        if (mode === undefined) { fail(`chmod: invalid mode: '${spec}'`); return commit(); }
        if (w.node.owner !== state.user && state.user !== 'root') { fail(`chmod: changing permissions of '${target}': Operation not permitted`); continue; }
        // E1: chmod changes what a link points to (a link's own mode is always 777).
        nodes.set(w.path, { ...w.node, mode });
      }
      return commit();
    }

    case 'uname': {
      const o = options(args, 'asnrvmo');
      if ('bad' in o) { fail(`uname: invalid option -- '${o.bad}'`); return done(); }
      if (o.operands.length) { fail(`uname: extra operand '${o.operands[0]}'`); return done(); }
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
      const o = options(args, '');
      if ('bad' in o) { fail(`man: invalid option -- '${o.bad}'`); return done(); }
      if (!o.operands.length) { fail('What manual page do you want?'); fail("For example, try 'man man'."); return done(); }
      o.operands.forEach((page, i) => {
        if (!(profile.commands as readonly string[]).includes(page)) { fail(`No manual entry for ${page}`); return; }
        if (i && out.some(l => l.kind === 'out')) print('');
        manualPage(page as CommandName).forEach(print);
      });
      return done();
    }

    case 'df': {
      const o = options(args, 'hT');
      if ('bad' in o) { fail(`df: invalid option -- '${o.bad}'`); return done(); }
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
      const o = options(args, 'sha');
      if ('bad' in o) { fail(`du: invalid option -- '${o.bad}'`); return done(); }
      const summary = o.flags.has('s'), every = o.flags.has('a'), human = o.flags.has('h');
      if (summary && every) { fail('du: cannot both summarize and show all entries'); return done(); }
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
      const o = options(args, 'sf');
      if ('bad' in o) { fail(`ln: invalid option -- '${o.bad}'`); return done(); }
      if (!o.flags.has('s')) { fail('ln: 模擬環境只支援符號連結，請使用 ln -s 目標 連結名稱（硬連結只在課文中說明）'); return done(); }
      const n = o.operands.length;
      if (!n) { fail('ln: missing file operand'); return done(); }
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
        nodes.set(path, { kind: 'link', mode: 0o777, owner: state.user, target });
      }
      return commit();
    }

    case 'readlink': {
      const o = options(args, 'f');
      if ('bad' in o) { fail(`readlink: invalid option -- '${o.bad}'`); return done(); }
      if (!o.operands.length) { fail('readlink: missing operand'); return done(); }
      // Like GNU readlink: nothing is printed (and nothing is an error message) when the path is not a link.
      for (const target of o.operands) {
        if (o.flags.has('f')) { const w = walk(state, resolvePath(state, target)); if (!('error' in w)) print(w.path); continue; }
        const w = walk(state, resolve(target), false);
        if (!('error' in w) && w.node?.kind === 'link') print(w.node.target ?? '');
      }
      return done();
    }

    default:
      fail(`bash: ${cmd}: command not found（模擬環境支援：${profile.commands.join('、')}）`);
      return done();
  }
}

/** A copied node: the same kind, mode and content, owned by the user, in the user's own group (no group field). */
function copyOf(node: FsNode, user: string): FsNode {
  const { group: _group, ...rest } = node;
  void _group;
  return { ...rest, owner: user };
}

/** The prompt, e.g. learner@logic-island:~/projects$ (LNX-0: the state's host when it has one; # for root, as in bash). */
export function prompt(state: FsState): string {
  const where = isInside(state.cwd, state.home) ? '~' + state.cwd.slice(state.home.length) : state.cwd;
  return `${state.user}@${state.host ?? DEFAULT_HOST}:${where}${state.user === 'root' ? '#' : '$'}`;
}
