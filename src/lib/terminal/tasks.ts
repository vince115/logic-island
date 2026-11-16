import { HOME, type FsState } from './fs';

/*
 * P7 Linux Terminal Simulator: the practice tasks. Each is checked against the file system only (never against the
 * typed text), so any correct sequence of commands passes, and the check is a pure function of the state.
 */

export interface TerminalTask {
  id: string;
  title: string;
  /** What to aim for, without giving the command away. */
  goal: string;
  hint: string;
  done: (state: FsState) => boolean;
}

const node = (state: FsState, path: string) => state.nodes.get(path);
const isDir = (state: FsState, path: string) => node(state, path)?.kind === 'dir';
const isFile = (state: FsState, path: string) => node(state, path)?.kind === 'file';

export const TERMINAL_TASKS: TerminalTask[] = [
  { id: 'make-projects', title: '建立專案目錄', goal: '在家目錄裡建立 projects 目錄。', hint: '先用 pwd 確認位置，再用 mkdir 建立目錄。',
    done: s => isDir(s, `${HOME}/projects`) },
  { id: 'write-notes', title: '寫一份筆記', goal: '在 projects 裡建立 notes.txt，內容不可以是空的。', hint: '用 cd 進入 projects，再用 echo 文字 > notes.txt 寫入。',
    done: s => isFile(s, `${HOME}/projects/notes.txt`) && !!node(s, `${HOME}/projects/notes.txt`)!.content?.trim() },
  { id: 'backup-notes', title: '備份筆記', goal: '把 notes.txt 複製一份到家目錄的 backup 目錄，原檔要保留。',
    hint: '先 mkdir ~/backup，再用 cp 來源 目的地；目的地是目錄時會沿用原檔名。',
    // Any file in ~/backup with the note's content counts, so renaming it in the next task keeps this one done.
    done: s => {
      const original = node(s, `${HOME}/projects/notes.txt`);
      return !!original?.content?.trim() && [...s.nodes].some(([p, n]) => p.startsWith(`${HOME}/backup/`) && n.kind === 'file' && n.content === original.content);
    } },
  { id: 'rename-backup', title: '為備份改名', goal: '把 backup 裡的 notes.txt 改名為 notes-2026.txt。', hint: 'mv 也用來改名：mv 舊名 新名。',
    done: s => isFile(s, `${HOME}/backup/notes-2026.txt`) && !isFile(s, `${HOME}/backup/notes.txt`) },
  { id: 'executable-script', title: '讓腳本可以執行', goal: '讓 scripts/deploy.sh 對擁有者可執行，其他權限不變。',
    hint: '用 ls -l 看目前的權限，再用 chmod u+x 加上擁有者的執行權限。',
    done: s => node(s, `${HOME}/scripts/deploy.sh`)?.mode === 0o744 },
  { id: 'private-secret', title: '保護私人檔案', goal: '讓 secret.txt 只有自己能讀寫（rw-------）。', hint: '八進位權限 6 是 rw-，0 是 ---；擁有者、群組、其他人各一位。',
    done: s => node(s, `${HOME}/secret.txt`)?.mode === 0o600 },
  { id: 'clean-tmp', title: '清理暫存目錄', goal: '刪除家目錄裡的 tmp 目錄與其中所有檔案。', hint: '刪除目錄要加 -r；刪除無法復原，先用 ls 確認內容。',
    done: s => !node(s, `${HOME}/tmp`) },
];
