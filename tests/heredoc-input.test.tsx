// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalExerciseBox } from '@/components/curriculum/terminal-lesson';
import { closesHeredoc, openHeredocs } from '@/lib/terminal/heredoc-input';
import { gitLab, pushExercise } from './support/git-fixture';
import { reportExercise, webMachine } from './support/terminal-fixture';

/*
 * CICD-3: a here-document typed in the lesson terminal. A line that opens one continues with a `> ` prompt until the
 * delimiter line, then the whole text runs as one command (and is replayed as one by Check). Only on machines whose
 * profile has the scripting feature; on the others the line runs at once, as before.
 */
afterEach(cleanup);

describe('openHeredocs / closesHeredoc', () => {
  it('finds quoted and bare delimiters, <<- and several in one line, and skips here-strings, quotes and comments', () => {
    expect(openHeredocs("cat > ci.yml <<'EOF'")).toEqual([{ delimiter: 'EOF', strip: false }]);
    expect(openHeredocs('cat <<"END" | tee a')).toEqual([{ delimiter: 'END', strip: false }]);
    expect(openHeredocs('cat <<-DONE')).toEqual([{ delimiter: 'DONE', strip: true }]);
    expect(openHeredocs('cat <<A <<B')).toEqual([{ delimiter: 'A', strip: false }, { delimiter: 'B', strip: false }]);
    expect(openHeredocs('grep x <<< "$text"')).toEqual([]);
    expect(openHeredocs("echo '<<EOF'")).toEqual([]);
    expect(openHeredocs('echo hi # cat <<EOF')).toEqual([]);
    expect(openHeredocs('echo $((1 << 2))')).toEqual([]);
    expect(closesHeredoc('EOF', { delimiter: 'EOF', strip: false })).toBe(true);
    expect(closesHeredoc('\tEOF', { delimiter: 'EOF', strip: false })).toBe(false);
    expect(closesHeredoc('\tEOF', { delimiter: 'EOF', strip: true })).toBe(true);
  });
});

const field = () => screen.getByRole('textbox');
function type(line: string) {
  fireEvent.change(field(), { target: { value: line } });
  fireEvent.click(screen.getByRole('button', { name: '執行' }));
}

describe('TerminalExerciseBox: here-documents', () => {
  it('collects the lines after a > prompt and runs them as one command', () => {
    const { container } = render(<TerminalExerciseBox exercise={pushExercise} machines={[gitLab]}/>);
    type('cd shop');
    type("cat > notes.txt <<'EOF'");
    expect(field().getAttribute('aria-label')).toMatch(/^here-document 的下一行（單獨一行的 EOF 結束/);
    type('first line');
    type('second $HOME line');
    type('EOF');
    expect(field().getAttribute('aria-label')).toMatch(/^指令/);
    type('cat notes.txt');
    const log = container.querySelector('[role="log"]')!.textContent!;
    expect(log).toContain("cat > notes.txt <<'EOF'");
    expect(log).toContain('> first line');
    expect(log).toContain('first line\nsecond $HOME line'.split('\n')[1]);
    expect(log.match(/second \$HOME line/g)!.length).toBe(2); // typed once, printed once by cat (quoted: no expansion)
  });
  it('Escape cancels a here-document without running it', () => {
    const { container } = render(<TerminalExerciseBox exercise={pushExercise} machines={[gitLab]}/>);
    type('cd shop');
    type('cat > gone.txt <<EOF');
    type('text');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(container.querySelector('[role="log"]')!.textContent).toContain('^C（已取消 here-document）');
    type('ls gone.txt');
    expect(container.querySelector('[role="log"]')!.textContent).toContain("ls: cannot access 'gone.txt': No such file or directory");
  });
  it('on a machine without the scripting feature the line runs at once, as before', () => {
    render(<TerminalExerciseBox exercise={reportExercise} machines={[webMachine]}/>);
    type('cat <<EOF');
    expect(field().getAttribute('aria-label')).toMatch(/^指令/);
  });
});
