// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalCommands, TerminalExampleView, TerminalExerciseBox } from '@/components/curriculum/terminal-lesson';
import { backupExercise, groupExample, reportExercise, webMachine } from './support/terminal-fixture';

/*
 * LNX-0: the terminal lesson components. An example is a static transcript (prompt, command, output) beside a text tree
 * of its machine. An exercise is a console: a labelled input (no auto-capitalization), output in a polite log, ↑/↓
 * history, Check that replays the commands and announces each check's result, and Reset that restores the machine.
 */
afterEach(cleanup);
const machines = [webMachine];
const input = () => screen.getByRole('textbox', { name: /^指令/ });
function type(command: string) {
  fireEvent.change(input(), { target: { value: command } });
  fireEvent.click(screen.getByRole('button', { name: '執行' }));
}

describe('TerminalExampleView', () => {
  it('shows each step as prompt, command and output, and the machine as a text tree', () => {
    const { container } = render(<TerminalExampleView example={groupExample} machine={webMachine}/>);
    const [transcript, tree] = [...container.querySelectorAll('pre')];
    expect(transcript.textContent).toBe('learner@web-01:~$ ls -l /srv\ndrwxrwxr-x root    devs     4096 team/\n'
      + 'learner@web-01:~$ touch /srv/team/plan.txt\n'
      + 'learner@web-01:~$ cat /var/log/app.log\ncat: /var/log/app.log: Permission denied\n');
    const lines = tree.textContent!.split('\n');
    expect(lines[0]).toMatch(/^drwxr-xr-x root:root\s+\/$/);
    expect(lines.find(l => l.includes('team/'))).toMatch(/^drwxrwxr-x root:devs\s+ {4}team\/$/);
    expect(lines.find(l => l.includes('learner/'))).toMatch(/learner\/ {2}← 目前位置$/);
    expect(lines.find(l => l.includes('app.log'))).toMatch(/^-rw-r----- root:adm/);
    expect(screen.getByText('終端機紀錄（網站伺服器 web-01）')).toBeTruthy();
  });
  it('lists a reference solution\'s commands', () => {
    const { container } = render(<TerminalCommands commands={backupExercise.solution}/>);
    expect(container.querySelector('pre')!.textContent).toBe('$ mkdir backup\n$ cp notes.txt backup/\n$ chmod 600 backup/notes.txt\n');
  });
});

describe('TerminalExerciseBox', () => {
  it('has a labelled input without auto-capitalization and a polite log', () => {
    render(<TerminalExerciseBox exercise={backupExercise} machines={machines}/>);
    const field = input();
    expect(field.getAttribute('autocapitalize')).toBe('off');
    expect(field.getAttribute('spellcheck')).toBe('false');
    expect(field.getAttribute('aria-label')).toBe('指令（目前位置 ~）');
    expect(screen.getByText('learner@web-01:~$').getAttribute('for')).toBe(field.id);
    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.getAttribute('aria-label')).toBe('備份筆記：終端機輸出');
  });
  it('runs commands into the log, follows cd in the prompt and recalls history with the arrow keys', () => {
    render(<TerminalExerciseBox exercise={backupExercise} machines={machines}/>);
    type('cd reports');
    expect(input().getAttribute('aria-label')).toBe('指令（目前位置 ~/reports）');
    type('cat today.txt');
    const log = screen.getByRole('log');
    expect(within(log).getByText('3 errors')).toBeTruthy();
    expect(log.textContent).toContain('learner@web-01:~/reports$ cat today.txt');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect((input() as HTMLInputElement).value).toBe('cat today.txt');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect((input() as HTMLInputElement).value).toBe('cd reports');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect((input() as HTMLInputElement).value).toBe('');
  });
  it('passes when the solution is typed, announcing every check; Reset restores the machine', () => {
    const { container } = render(<TerminalExerciseBox exercise={backupExercise} machines={machines}/>);
    for (const c of backupExercise.solution) type(c);
    fireEvent.click(screen.getByRole('button', { name: '檢查' }));
    const live = container.querySelector('[aria-live="polite"]:not([role="log"])')!;
    expect(live.textContent).toContain('全部通過。');
    expect([...live.querySelectorAll('li')].map(li => [li.getAttribute('data-ok'), li.textContent])).toEqual([
      ['true', '通過：/home/learner/backup 應該存在（目錄）'], ['true', '通過：/home/learner/backup/notes.txt 的內容應該符合題目'],
      ['true', '通過：/home/learner/backup/notes.txt 的權限應該是 600'], ['true', '通過：/home/learner/notes.txt 應該維持原樣']]);
    expect(container.querySelector('details pre')!.textContent).toContain('backup/');

    fireEvent.click(screen.getByRole('button', { name: '重設' }));
    expect(live.textContent).toContain('已重設');
    expect(container.querySelector('details pre')!.textContent).not.toContain('backup/');
    expect(screen.getByRole('log').textContent).not.toContain('mkdir backup');
    fireEvent.click(screen.getByRole('button', { name: '檢查' }));
    expect(live.textContent).toContain('還沒通過：');
    expect(live.textContent).toContain('未通過：/home/learner/backup 應該存在（目錄），但它還不存在');
  });
  it('fails a typed-in answer to an output exercise on the variant machine', () => {
    const { container } = render(<TerminalExerciseBox exercise={reportExercise} machines={machines}/>);
    type('echo 3 errors');
    fireEvent.click(screen.getByRole('button', { name: '檢查' }));
    const live = container.querySelector('[aria-live="polite"]:not([role="log"])')!;
    expect(live.textContent).toMatch(/未通過：.*換成「另一天的報告」的機器重新執行時/);
    type('cat reports/today.txt');
    expect(live.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '檢查' }));
    expect(live.textContent).toContain('全部通過。');
  });
});
