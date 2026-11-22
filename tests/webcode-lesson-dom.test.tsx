// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WebExampleView, WebExerciseBox, WebSolution } from '@/components/curriculum/webcode-lesson';
import { WEB_SANDBOX, type WebReport, type WebRun, type WebRunner } from '@/lib/webcode/lesson';
import { counterExample, greetExercise, headingExercise, styledExample } from './support/webcode-fixture';

/*
 * WEB-0: the web-code lesson components (jsdom does not run the frame; a real browser does in tests/webcode-runner.test.ts
 * and the lesson E2E). An example shows its files as code and the page in a sandboxed frame, and believes only reports
 * that come from its own frame with its own nonce; the learner can edit the files and run them again. An exercise has
 * labelled editors, lists what Check does before it is pressed, announces each check's result in a polite region, and
 * keeps the focus on Check while it runs.
 */
afterEach(cleanup);

const frameOf = (root: HTMLElement) => root.querySelector('iframe') as HTMLIFrameElement;
const nonceOf = (frame: HTMLIFrameElement) => /var NONCE = '([^']+)'/.exec(frame.getAttribute('srcdoc') ?? '')![1];
const report = (patch: Partial<WebReport> = {}): WebReport => ({ console: [], tree: [{ d: 0, t: 'html', i: '', c: [], a: [], x: '' }, { d: 1, t: 'body', i: '', c: [], a: [], x: '' }, { d: 2, t: 'p', i: '', c: ['note'], a: [], x: '注意' }],
  height: 90, navigations: [], submissions: [], title: '', standards: true, requests: [], storage: { local: {}, session: {}, cookies: {} }, ...patch });
function post(frame: HTMLIFrameElement, data: object, source: unknown = frame.contentWindow) {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data, source: source as MessageEventSource })); });
}

describe('WebExampleView', () => {
  it('shows the files as code and the page in a sandboxed frame that loads the page with no network access', async () => {
    const { container } = render(<WebExampleView example={styledExample()}/>);
    expect(screen.getByRole('heading', { level: 3, name: '加上樣式' })).toBeTruthy();
    expect([...container.querySelectorAll('figcaption')].map(f => f.textContent)).toEqual(['index.html', 'style.css', '瀏覽器裡的結果']);
    expect(container.querySelector('pre')!.textContent).toBe('<p class="note">注意</p>\n<div class="box"></div>');
    const frame = await waitFor(() => { const f = frameOf(container); expect(f).toBeTruthy(); return f; });
    expect(frame.getAttribute('sandbox')).toBe(WEB_SANDBOX);
    expect(frame.title).toBe('加上樣式：頁面預覽');
    const srcdoc = frame.getAttribute('srcdoc')!;
    expect(srcdoc).toContain('<p class="note">注意</p>');
    expect(srcdoc).toContain(".box { width: 120px;");
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain('LIVE = true');
    // The example's verified statements are listed.
    expect(within(container.querySelector('details ul')!.parentElement as HTMLElement).getAllByRole('listitem').map(li => li.textContent))
      .toEqual(['文字是紅色', '文字是粗體', '盒子連同留白與邊框寬 150px', '盒子連同留白與邊框高 70px']);
  });
  it('shows what its own frame reports (outline, console, title, link and form notes) and ignores every other message', async () => {
    const { container } = render(<WebExampleView example={counterExample()}/>);
    const frame = await waitFor(() => { const f = frameOf(container); expect(f).toBeTruthy(); return f; });
    const nonce = nonceOf(frame);
    expect(screen.getByText('頁面載入後會顯示。')).toBeTruthy();
    // Another window with the right nonce, and the right frame with a wrong nonce, are not believed.
    post(frame, { li: nonce, kind: 'ready', ...report({ title: '假的' }) }, window);
    post(frame, { li: 'wrong', kind: 'ready', ...report({ title: '假的' }) });
    expect(screen.queryByText(/假的/)).toBeNull();
    post(frame, { li: nonce, kind: 'ready', ...report({ title: '計數器', height: 200 }) });
    expect(screen.getByText('分頁標題：計數器')).toBeTruthy();
    expect(container.querySelector('details pre')!.textContent).toBe('html\n  body\n    p.note  "注意"');
    expect(frame.style.height).toBe('202px');
    expect(screen.queryByRole('log')).toBeNull();
    post(frame, { li: nonce, kind: 'update', ...report({ console: [{ kind: 'log', text: 'count 1' }, { kind: 'error', text: 'Uncaught Error: x' }],
      navigations: [{ href: 'https://example.com/a', target: '_blank', text: '外部' }], submissions: [{ form: '<form>', handled: false, method: 'post', action: '/go', data: [['q', '海龜']] }], standards: false }) });
    const log = screen.getByRole('log', { name: '按鈕與事件：主控台輸出' });
    expect([...log.children].map(c => [c.getAttribute('data-kind'), c.textContent])).toEqual([['log', 'count 1'], ['error', '✕ Uncaught Error: x']]);
    expect(screen.getByText(/連結「外部」會前往/).textContent).toBe('連結「外部」會前往 https://example.com/a（target="_blank"）；預覽不會離開這一頁。');
    expect(screen.getByText(/表單送出了/).textContent).toBe('表單送出了（POST /go）：q=海龜；預覽不會真的送出。');
    expect(screen.getByText(/相容模式/)).toBeTruthy();
  });
  it('lists the requests the page made and what it stored, and keeps the stored data for the next run until the learner clears it (W3, W4)', async () => {
    const example = { ...counterExample(), setup: { api: [{ path: '/api/books', body: [] }], storage: { visits: '1' } } };
    const { container } = render(<WebExampleView example={example}/>);
    const first = await waitFor(() => { const f = frameOf(container); expect(f).toBeTruthy(); return f; });
    // The lesson's setup travels in the frame's document.
    expect(first.getAttribute('srcdoc')).toContain('var SETUP = {"api":[{"path":"/api/books","body":[]}],"storage":{"visits":"1"}}');
    expect(screen.queryByRole('list', { name: '按鈕與事件：網路請求' })).toBeNull();
    post(first, { li: nonceOf(first), kind: 'update', ...report({ requests: [{ method: 'GET', path: '/api/books', body: '', status: 200 }, { method: 'POST', path: '/api/wishes', body: '{}', status: 0 },
      { method: 'GET', path: '/api/down', body: '', status: -1 }, { method: 'GET', path: '/nowhere', body: '', status: 404 }], storage: { local: { visits: '2' }, session: { tab: 'a' }, cookies: { lang: 'zh-Hant' } } }) });
    expect(within(screen.getByRole('list', { name: '按鈕與事件：網路請求' })).getAllByRole('listitem').map(li => li.textContent))
      .toEqual(['GET /api/books → 200', 'POST /api/wishes → 等待回應…', 'GET /api/down → 連線失敗', 'GET /nowhere → 404']);
    expect(within(screen.getByRole('list', { name: '按鈕與事件：儲存的資料' })).getAllByRole('listitem').map(li => li.textContent))
      .toEqual(['localStorage visits = 2', 'sessionStorage tab = a', 'Cookie lang = zh-Hant']);
    // Running again is a reload: the next document starts with what the page had stored.
    fireEvent.click(screen.getByText('動手改這個範例'));
    fireEvent.click(screen.getByRole('button', { name: '執行' }));
    const second = await waitFor(() => { const f = frameOf(container); expect(f).not.toBe(first); return f; });
    expect(second.getAttribute('srcdoc')).toContain('"storage":{"visits":"2"},"cookies":{"lang":"zh-Hant"}');
    post(second, { li: nonceOf(second), kind: 'ready', ...report({ storage: { local: { visits: '3' }, session: {}, cookies: { lang: 'zh-Hant' } } }) });
    fireEvent.click(screen.getByRole('button', { name: '清除儲存的資料並重新載入' }));
    const third = await waitFor(() => { const f = frameOf(container); expect(f).not.toBe(second); return f; });
    expect(third.getAttribute('srcdoc')).toContain('"storage":{},"cookies":{}');
  });
  it('lets the learner edit the files and run the page again, then restore the original', async () => {
    const { container } = render(<WebExampleView example={styledExample()}/>);
    const first = await waitFor(() => { const f = frameOf(container); expect(f).toBeTruthy(); return f; });
    const html = screen.getByRole('textbox', { name: '加上樣式：HTML' }) as HTMLTextAreaElement, css = screen.getByRole('textbox', { name: '加上樣式：CSS' }) as HTMLTextAreaElement;
    expect(html.value).toBe(styledExample().files.html);
    expect(html.getAttribute('spellcheck')).toBe('false');
    expect(html.getAttribute('autocapitalize')).toBe('off');
    fireEvent.change(css, { target: { value: '.note { color: blue; }' } });
    // Typing alone does not reload the page.
    expect(frameOf(container)).toBe(first);
    expect(first.getAttribute('srcdoc')).not.toContain('color: blue');
    fireEvent.click(screen.getByRole('button', { name: '執行' }));
    const second = await waitFor(() => { const f = frameOf(container); expect(f.getAttribute('srcdoc')).toContain('.note { color: blue; }'); return f; });
    expect(nonceOf(second)).not.toBe(nonceOf(first));
    fireEvent.click(screen.getByRole('button', { name: '還原' }));
    await waitFor(() => expect(frameOf(container).getAttribute('srcdoc')).toContain('.note { color: red;'));
    expect(css.value).toBe(styledExample().files.css);
  });
});

describe('WebExerciseBox', () => {
  const result = (oks: boolean[], extra: Partial<WebRun> = {}): WebRun => ({ ...report(), results: oks.map(ok => ok ? { ok } : { ok, actual: '0' }), ...extra });
  it('shows the fixed files, a labelled editor for each file to complete, and every step of the check before it runs', () => {
    const { container } = render(<WebExerciseBox exercise={greetExercise()} run={() => Promise.resolve(result([]))}/>);
    expect(container.querySelector('figcaption')!.textContent).toBe('index.html（固定，不能修改）');
    const editor = screen.getByRole('textbox', { name: '打招呼：JavaScript' }) as HTMLTextAreaElement;
    expect(editor.value).toBe(greetExercise().starter.js);
    expect(screen.getByLabelText(/script\.js/)).toBe(editor);
    expect(screen.queryByRole('textbox', { name: '打招呼：HTML' })).toBeNull();
    const steps = within(screen.getByRole('list', { name: '檢查的步驟' })).getAllByRole('listitem').map(li => li.textContent);
    expect(steps).toEqual(['檢查：按下之前是空的', '操作：點擊 #go', '檢查：按下之後向輸入框裡的名字打招呼', '操作：在 #name 輸入「阿明」', '操作：點擊 #go', '檢查：改了名字再按，招呼跟著改']);
    expect(screen.getByText('「檢查」會把你目前的檔案載入一份全新的頁面（寬 600px、高 400px），依序做下面的事，只看結果，不看寫法。')).toBeTruthy();
    expect(screen.getByText('隱藏的檢查：換一份頁面資料（另一個預設名字）再做一次，只顯示通過與否。')).toBeTruthy();
  });
  it('checks the edited files with the runner and announces each result, what was found, and the hidden check', async () => {
    const pages: Parameters<WebRunner>[0][] = [];
    const run: WebRunner = page => { pages.push(page); return Promise.resolve(pages.length === 1 ? result([true, true, false, true, true, true], { console: [{ kind: 'error', text: 'Uncaught TypeError: x' }] }) : result([true, false])); };
    const { container } = render(<WebExerciseBox exercise={greetExercise()} run={run}/>);
    fireEvent.change(screen.getByRole('textbox', { name: '打招呼：JavaScript' }), { target: { value: 'attempt();' } });
    fireEvent.click(screen.getByRole('button', { name: '檢查' }));
    const verdict = await screen.findByText(/還沒通過：2 項未通過。/);
    expect(verdict.closest('[aria-live="polite"]')).toBeTruthy();
    expect(pages.map(p => [p.files.js, p.files.html.includes('小安'), p.files.html.includes('海龜'), p.viewport])).toEqual([['attempt();', true, false, { width: 600, height: 400 }], ['attempt();', false, true, { width: 600, height: 400 }]]);
    const items = within(screen.getByRole('list', { name: '檢查的步驟' })).getAllByRole('listitem');
    expect(items.map(li => [li.getAttribute('data-ok'), li.textContent])).toEqual([
      ['true', '通過：按下之前是空的'], [null, '操作：點擊 #go'], ['false', '未通過：按下之後向輸入框裡的名字打招呼　#hello 目前的文字是「0」。'],
      [null, '操作：在 #name 輸入「阿明」'], [null, '操作：點擊 #go'], ['true', '通過：改了名字再按，招呼跟著改']]);
    expect(screen.getByText('未通過：隱藏的檢查：換一份頁面資料（另一個預設名字）再做一次，只顯示通過與否。').closest('li')!.getAttribute('data-ok')).toBe('false');
    expect(screen.getByText(/檢查用的頁面在主控台有錯誤/).textContent).toBe('檢查用的頁面在主控台有錯誤：Uncaught TypeError: x');
    // The preview shows the checked files too.
    expect(frameOf(container).getAttribute('srcdoc')).toContain('attempt();');
    // Editing after a check clears its result.
    fireEvent.change(screen.getByRole('textbox', { name: '打招呼：JavaScript' }), { target: { value: 'again();' } });
    expect(screen.queryByText(/還沒通過/)).toBeNull();
  });
  it('announces a pass, keeps Check focusable while it runs, and drops a result that an edit made stale', async () => {
    let finish: (r: WebRun) => void = () => {};
    const run: WebRunner = () => new Promise(resolve => { finish = resolve; });
    render(<WebExerciseBox exercise={headingExercise()} run={run}/>);
    const check = screen.getByRole('button', { name: '檢查' });
    check.focus();
    fireEvent.click(check);
    const busy = await screen.findByRole('button', { name: '檢查中…' });
    expect(busy).toBe(check);
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect((busy as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(check);
    await act(async () => { finish(result([true, true, true])); });
    expect(await screen.findByText('全部通過。')).toBeTruthy();
    // A second check, edited while it runs: its result is not shown.
    fireEvent.click(screen.getByRole('button', { name: '檢查' }));
    await screen.findByRole('button', { name: '檢查中…' });
    fireEvent.change(screen.getByRole('textbox', { name: '加上主標題：HTML' }), { target: { value: '<h2>x</h2>' } });
    await act(async () => { finish(result([true, true, true])); });
    await screen.findByRole('button', { name: '檢查' });
    expect(screen.queryByText('全部通過。')).toBeNull();
  });
  it('resets the files to the starter and says so', async () => {
    const { container } = render(<WebExerciseBox exercise={headingExercise()} run={() => Promise.resolve(result([false, false, true]))}/>);
    const editor = screen.getByRole('textbox', { name: '加上主標題：HTML' }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '<h1>x</h1>' } });
    fireEvent.click(screen.getByRole('button', { name: '執行' }));
    await waitFor(() => expect(frameOf(container).getAttribute('srcdoc')).toContain('<h1>x</h1>'));
    fireEvent.click(screen.getByRole('button', { name: '重設' }));
    expect(editor.value).toBe(headingExercise().starter.html);
    expect(screen.getByText('已重設：檔案回到練習開始時的內容。')).toBeTruthy();
    await waitFor(() => expect(frameOf(container).getAttribute('srcdoc')).toContain('<p>我的網站</p>'));
  });
});

describe('WebSolution', () => {
  it('shows the reference solution\'s files as code', () => {
    const { container } = render(<WebSolution exercise={greetExercise()}/>);
    expect(container.querySelector('figcaption')!.textContent).toBe('script.js');
    expect(container.querySelector('pre')!.textContent).toBe(greetExercise().solution.js);
  });
});
