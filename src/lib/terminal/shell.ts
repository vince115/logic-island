import {
  baseName, can, childrenOf, depthOf, isInside, joinPath, LIMITS, modeString, parentOf, resolvePath, subtreeOf, validName,
  type Access, type FsNode, type FsState,
} from './fs';

/*
 * P7 Linux Terminal Simulator: the command interpreter. A fixed table of commands works on the virtual file system in
 * fs.ts; anything else is "command not found". There is no eval, no process, no network and no access to the host:
 * the input is only split into words and matched against the table. Messages follow GNU coreutils and bash so they
 * look like a real terminal.
 */

export interface Line { text: string; kind: 'out' | 'err' }
export interface RunResult { state: FsState; lines: Line[]; clear?: true }

export const COMMANDS = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'chmod', 'echo', 'whoami', 'clear', 'help'] as const;

const HELP = [
  '可用的指令（模擬環境，不會執行真實的 Shell）：',
  '  pwd                    顯示目前所在的目錄',
  '  ls [-l] [-a] [路徑]     列出目錄內容；-l 顯示權限，-a 顯示隱藏項目',
  '  cd [路徑]               切換目錄；~ 是家目錄，.. 是上一層',
  '  mkdir [-p] 目錄…        建立目錄；-p 一併建立中間的目錄',
  '  touch 檔案…             建立空檔案',
  '  cat 檔案…               顯示檔案內容',
  '  echo 文字 [> 或 >> 檔案]  輸出文字，或寫入（>）、附加（>>）到檔案',
  '  cp [-r] 來源 目的地       複製；複製目錄要加 -r',
  '  mv 來源 目的地           移動或改名',
  '  rm [-r] [-f] 路徑…       刪除；刪除目錄要加 -r（無法復原）',
  '  chmod 模式 路徑…         修改權限，例如 chmod 644 a.txt、chmod u+x run.sh',
  '  whoami、clear、help',
];

type Fail = { error: 'ENOENT' | 'ENOTDIR' | 'EACCES' };
type Found = { node: FsNode | undefined };

const ERRNO = { ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EACCES: 'Permission denied' } as const;

/** Walks to a path: every folder on the way must exist and be searchable (x). The node itself may be missing. */
function walk(state: FsState, path: string): Fail | Found {
  const parts = path.split('/').filter(Boolean);
  let at = '/';
  for (const part of parts) {
    const node = state.nodes.get(at);
    if (!node) return { error: 'ENOENT' };
    if (node.kind !== 'dir') return { error: 'ENOTDIR' };
    if (!can(node, state.user, 'x')) return { error: 'EACCES' };
    at = joinPath(at, part);
  }
  return { node: state.nodes.get(path) };
}

/**
 * Splits a command line into words: whitespace separates, single and double quotes group, an unquoted > or >> is a
 * word of its own (echo hi>a.txt works), and nothing is expanded.
 */
export function tokenize(input: string): { words: string[] } | { error: string } {
  const words: string[] = [];
  let word = '', quote: '"' | "'" | null = null, started = false, lastRedirect = false;
  const end = () => { if (started) { words.push(word); word = ''; started = false; } };
  for (const ch of input) {
    if (quote) { if (ch === quote) quote = null; else word += ch; continue; }
    if (ch === '>') {
      if (lastRedirect && !started && words.at(-1) === '>') words[words.length - 1] = '>>';
      else { end(); words.push('>'); }
      lastRedirect = true; continue;
    }
    lastRedirect = false;
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) { end(); continue; }
    word += ch; started = true;
  }
  if (quote) return { error: 'bash: unexpected EOF while looking for matching quote' };
  if (started) words.push(word);
  return { words };
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

/** Runs one command line against the state and returns the new state and what the terminal prints. */
export function run(state: FsState, input: string): RunResult {
  const out: Line[] = [];
  const print = (text: string) => out.push({ text, kind: 'out' });
  const fail = (text: string) => out.push({ text, kind: 'err' });
  const done = (next: FsState = state): RunResult => ({ state: next, lines: out });

  if (input.length > LIMITS.input) { fail(`輸入太長：一行最多 ${LIMITS.input} 個字元`); return done(); }
  const tokens = tokenize(input);
  if ('error' in tokens) { fail(tokens.error); return done(); }
  const words = tokens.words;
  if (!words.length) return done();
  if (words.some(w => ['|', ';', '&&', '||', '&', '<'].includes(w)) || /[|;&<`$]/.test(input.replace(/(["']).*?\1/g, '')))
  { fail('此模擬器不支援管線、指令串接、變數與背景執行（| ; && $ `）；一次輸入一個指令。'); return done(); }

  const [cmd, ...args] = words;
  const nodes = new Map(state.nodes);
  const commit = (cwd = state.cwd): RunResult => done({ ...state, nodes, cwd });
  const resolve = (p: string) => resolvePath(state, p);
  const shown = (p: string) => p;
  const allowed = (node: FsNode, access: Access) => can(node, state.user, access);
  /** The folder a new entry goes into must exist, be a folder, and be writable and searchable. */
  const writableParent = (path: string): 'ENOENT' | 'ENOTDIR' | 'EACCES' | null => {
    const w = walk({ ...state, nodes }, parentOf(path));
    if ('error' in w) return w.error;
    if (!w.node) return 'ENOENT';
    if (w.node.kind !== 'dir') return 'ENOTDIR';
    return allowed(w.node, 'w') && allowed(w.node, 'x') ? null : 'EACCES';
  };
  const room = (count: number) => nodes.size + count <= LIMITS.nodes;
  const tooDeep = (path: string) => depthOf(path) > LIMITS.depth;

  switch (cmd) {
    case 'help': HELP.forEach(print); return done();
    case 'whoami': print(state.user); return done();
    case 'clear': return { state, lines: [], clear: true };
    case 'pwd': print(state.cwd); return done();

    case 'echo': {
      const at = args.findIndex(a => a === '>' || a === '>>');
      const text = (at < 0 ? args : args.slice(0, at)).join(' ');
      if (at < 0) { print(text); return done(); }
      const target = args[at + 1];
      if (!target || args.length > at + 2) { fail('bash: syntax error near unexpected token `newline\''); return done(); }
      const path = resolve(target), w = walk({ ...state, nodes }, path);
      if ('error' in w) { fail(`bash: ${shown(target)}: ${ERRNO[w.error]}`); return done(); }
      if (w.node?.kind === 'dir') { fail(`bash: ${shown(target)}: Is a directory`); return done(); }
      if (w.node && !allowed(w.node, 'w')) { fail(`bash: ${shown(target)}: Permission denied`); return done(); }
      if (!w.node) {
        const why = writableParent(path);
        if (why) { fail(`bash: ${shown(target)}: ${ERRNO[why]}`); return done(); }
        if (!validName(baseName(path)) || tooDeep(path)) { fail(`bash: ${shown(target)}: File name too long`); return done(); }
        if (!room(1)) { fail(`bash: ${shown(target)}: No space left on device`); return done(); }
      }
      const content = (args[at] === '>>' ? w.node?.content ?? '' : '') + text + '\n';
      if (content.length > LIMITS.fileLength) { fail(`bash: ${shown(target)}: File too large（模擬環境上限 ${LIMITS.fileLength} 字元）`); return done(); }
      nodes.set(path, { kind: 'file', mode: w.node?.mode ?? 0o644, owner: w.node?.owner ?? state.user, content });
      return commit();
    }

    case 'cd': {
      if (args.length > 1) { fail('bash: cd: too many arguments'); return done(); }
      const target = args[0] ?? '~', path = resolve(target), w = walk(state, path);
      if ('error' in w) { fail(`bash: cd: ${target}: ${ERRNO[w.error]}`); return done(); }
      if (!w.node) { fail(`bash: cd: ${target}: No such file or directory`); return done(); }
      if (w.node.kind !== 'dir') { fail(`bash: cd: ${target}: Not a directory`); return done(); }
      if (!allowed(w.node, 'x')) { fail(`bash: cd: ${target}: Permission denied`); return done(); }
      return done({ ...state, cwd: path });
    }

    case 'ls': {
      const o = options(args, 'la');
      if ('bad' in o) { fail(`ls: invalid option -- '${o.bad}'`); return done(); }
      const long = o.flags.has('l'), all = o.flags.has('a'), targets = o.operands.length ? o.operands : ['.'];
      // Folders end in / (like ls -F) so the listing reads without colours; . and .. stay as they are.
      const label = (name: string, node: FsNode) => node.kind === 'dir' && name !== '.' && name !== '..' ? `${name}/` : name;
      const entry = (name: string, node: FsNode) => long
        ? `${modeString(node)} ${node.owner.padEnd(7)} ${node.owner.padEnd(7)} ${String(node.kind === 'dir' ? 4096 : byteLength(node.content ?? '')).padStart(5)} ${label(name, node)}`
        : label(name, node);
      targets.forEach((target, i) => {
        const path = resolve(target), w = walk(state, path);
        if ('error' in w || !w.node) { fail(`ls: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); return; }
        if (w.node.kind === 'file') { print(entry(target, w.node)); return; }
        if (!allowed(w.node, 'r')) { fail(`ls: cannot open directory '${target}': Permission denied`); return; }
        if (targets.length > 1) { if (i) print(''); print(`${target}:`); }
        const rows: [string, FsNode][] = childrenOf(state.nodes, path).map(p => [baseName(p), state.nodes.get(p)!]);
        if (all) rows.unshift(['.', w.node], ['..', state.nodes.get(parentOf(path))!]);
        const shownRows = all ? rows : rows.filter(([name]) => !name.startsWith('.'));
        if (long) shownRows.forEach(([name, node]) => print(entry(name, node)));
        else if (shownRows.length) print(shownRows.map(([name, node]) => entry(name, node)).join('  '));
      });
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
            if (step === path && !o.flags.has('p')) fail(`mkdir: cannot create directory '${target}': File exists`);
            else if (existing.kind !== 'dir') fail(`mkdir: cannot create directory '${target}': Not a directory`);
            if (step === path || existing.kind !== 'dir') break;
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
        const path = resolve(target), w = walk({ ...state, nodes }, path);
        if ('error' in w) { fail(`touch: cannot touch '${target}': ${ERRNO[w.error]}`); continue; }
        if (w.node) { if (!allowed(w.node, 'w') && w.node.owner !== state.user) fail(`touch: cannot touch '${target}': Permission denied`); continue; }
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
      if (o.operands.length !== 2) { fail(`${cmd}: ${o.operands.length < 2 ? 'missing destination file operand' : '模擬環境一次只處理一個來源'}`); return done(); }
      const [from, to] = o.operands, src = resolve(from), sw = walk(state, src);
      if ('error' in sw || !sw.node) { fail(`${cmd}: cannot stat '${from}': ${ERRNO['error' in sw ? sw.error : 'ENOENT']}`); return done(); }
      if (cmd === 'cp' && sw.node.kind === 'dir' && !o.flags.has('r')) { fail(`cp: -r not specified; omitting directory '${from}'`); return done(); }
      if (src === '/') { fail(`${cmd}: cannot ${cmd === 'cp' ? 'copy' : 'move'} '/'`); return done(); }
      const dw = walk(state, resolve(to));
      if ('error' in dw) { fail(`${cmd}: cannot ${cmd === 'cp' ? 'create regular file' : 'move'} '${to}': ${ERRNO[dw.error]}`); return done(); }
      const dest = dw.node?.kind === 'dir' ? joinPath(resolve(to), baseName(src)) : resolve(to);
      if (dest === src) { fail(`${cmd}: '${from}' and '${to}' are the same file`); return done(); }
      if (sw.node.kind === 'dir' && isInside(dest, src)) { fail(`${cmd}: cannot ${cmd === 'cp' ? 'copy' : 'move'} a directory, '${from}', into itself, '${to}'`); return done(); }
      const existing = nodes.get(dest);
      if (existing?.kind === 'dir' && sw.node.kind === 'file') { fail(`${cmd}: cannot overwrite directory '${to}' with non-directory`); return done(); }
      if (existing && sw.node.kind === 'dir') { fail(`${cmd}: cannot overwrite '${to}': 模擬環境不合併目錄`); return done(); }
      if (cmd === 'cp' && sw.node.kind === 'file' && !allowed(sw.node, 'r')) { fail(`cp: cannot open '${from}' for reading: Permission denied`); return done(); }
      if (cmd === 'cp' && existing && !allowed(existing, 'w')) { fail(`${cmd}: cannot create regular file '${to}': Permission denied`); return done(); }
      const why = writableParent(dest);
      if (why) { fail(`${cmd}: cannot create regular file '${to}': ${ERRNO[why]}`); return done(); }
      if (cmd === 'mv') { const sp = writableParent(src); if (sp) { fail(`mv: cannot move '${from}': ${ERRNO[sp]}`); return done(); } }
      if (!validName(baseName(dest))) { fail(`${cmd}: invalid name '${to}'`); return done(); }
      const tree = subtreeOf(state.nodes, src);
      if (tree.some(p => tooDeep(dest + p.slice(src.length)))) { fail(`${cmd}: '${to}': File name too long`); return done(); }
      if (cmd === 'cp' && !room(tree.length - (existing ? 1 : 0))) { fail(`cp: cannot create '${to}': No space left on device`); return done(); }
      if (cmd === 'cp' && sw.node.kind === 'dir' && tree.some(p => state.nodes.get(p)!.kind === 'file' && !allowed(state.nodes.get(p)!, 'r')))
      { fail(`cp: cannot open '${from}' 中的部分檔案: Permission denied`); return done(); }
      const moved = cmd === 'mv' && isInside(state.cwd, src);
      for (const p of tree) {
        const node = state.nodes.get(p)!;
        if (cmd === 'mv') nodes.delete(p);
        nodes.set(dest + p.slice(src.length), cmd === 'cp' ? { ...node, owner: state.user } : node);
      }
      return commit(moved ? dest + state.cwd.slice(src.length) : state.cwd);
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
        const w = walk({ ...state, nodes }, path);
        if ('error' in w || !w.node) { if (!force || ('error' in w && w.error !== 'ENOENT')) fail(`rm: cannot remove '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        if (w.node.kind === 'dir' && !recursive) { fail(`rm: cannot remove '${target}': Is a directory`); continue; }
        if (isInside(state.cwd, path)) { fail(`rm: cannot remove '${target}': 目前所在的目錄在它裡面，請先用 cd 離開`); continue; }
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
        const path = resolve(target), w = walk({ ...state, nodes }, path);
        if ('error' in w || !w.node) { fail(`chmod: cannot access '${target}': ${ERRNO['error' in w ? w.error : 'ENOENT']}`); continue; }
        const mode = applyMode(w.node.mode, spec);
        if (mode === undefined) { fail(`chmod: invalid mode: '${spec}'`); return commit(); }
        if (w.node.owner !== state.user && state.user !== 'root') { fail(`chmod: changing permissions of '${target}': Operation not permitted`); continue; }
        nodes.set(path, { ...w.node, mode });
      }
      return commit();
    }

    default:
      fail(`bash: ${cmd}: command not found（模擬環境支援：${COMMANDS.join('、')}）`);
      return done();
  }
}

/** The prompt, e.g. learner@logic-island:~/projects$ */
export function prompt(state: FsState): string {
  const where = isInside(state.cwd, state.home) ? '~' + state.cwd.slice(state.home.length) : state.cwd;
  return `${state.user}@logic-island:${where}$`;
}
