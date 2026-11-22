import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkWebExercise, judge, treeLines, webBehaviourProblems, webDocument, WEB_SANDBOX, WEB_VIEWPORT, type WebFiles, type WebRun, type WebSetup, type WebStep } from '@/lib/webcode/lesson';
import { CLASSIC_SCROLL_BARS, openWebBrowser, type WebBrowser } from './support/webcode-browser';
import { badgeExercise, greetExercise, headingExercise, webContent } from './support/webcode-fixture';

/*
 * WEB-0: the web-code harness in a real browser (headless Chromium; skipped and reported as Not Executed where it is
 * not installed, required in CI). Pages load in the same sandboxed frame the lesson page uses, with the same document
 * and the same parent-side function. Covered: every check and action, what the frame records (console, links, form
 * submissions), the outline of the DOM the browser built, isolation (no network, no access to the parent), and a page
 * that never finishes.
 */
let browser: WebBrowser | null = null;
beforeAll(async () => { browser = await openWebBrowser(); }, 60_000);
afterAll(async () => { await browser?.close(); });
const page = (files: WebFiles, steps: WebStep[] = [], setup?: WebSetup): Promise<WebRun> => browser!.run({ files, steps, viewport: WEB_VIEWPORT, setup });
const inBrowser = (name: string, fn: () => Promise<void>, timeout = 30_000) => it(name, async ctx => { if (!browser) return ctx.skip(); await fn(); }, timeout);

describe('the document in the frame', () => {
  inBrowser('wraps a fragment in a standards-mode document and leaves no trace of the harness in the tree', async () => {
    const r = await page({ html: '<h1 id="t" class="big title">島</h1>\n<p>文字 <a href="https://example.com/a">連結</a></p>', css: 'h1 { color: red; }', js: 'console.log(document.querySelectorAll("script").length)' });
    expect(r.standards).toBe(true);
    expect(treeLines(r.tree)).toEqual([
      'html [lang="zh-Hant"]',
      '  head',
      '    style [data-file="style.css"]',
      '  body',
      '    h1#t.big.title  "島"',
      '    p  "文字"',
      '      a [href="https://example.com/a"]  "連結"',
      '    script [data-file="script.js"]',
    ]);
    // The page's own script sees one script element: its own.
    expect(r.console).toEqual([{ kind: 'log', text: '1' }]);
  });
  inBrowser('keeps a whole document as written: its head, its title, and a missing doctype stays missing (a srcdoc frame is in standards mode either way)', async () => {
    const full = await page({ html: '<!DOCTYPE html>\n<html lang="en">\n<head><title>Hi</title></head>\n<body><main><p>x</p></main></body>\n</html>', css: 'p { margin: 0 }' },
      [{ check: 'doctype', label: 'doctype' }, { check: 'count', selector: 'head > title', count: 1, label: 'title in head' }]);
    expect(full.results.map(r => r.ok)).toEqual([true, true]);
    expect(full.title).toBe('Hi');
    expect(treeLines(full.tree).slice(0, 4)).toEqual(['html [lang="en"]', '  head', '    style [data-file="style.css"]', '    title  "Hi"']);
    const quirks = await page({ html: '<html><head><title>Old</title></head><body><p id="m">x</p><script>document.querySelector("#m").textContent = document.compatMode</script></body></html>' },
      [{ check: 'doctype', label: 'doctype' }, { check: 'text', selector: '#m', text: 'CSS1Compat', label: 'standards mode all the same' }]);
    expect(quirks.results.map(r => r.ok)).toEqual([false, true]);
    expect(quirks.standards).toBe(false);
  });
  inBrowser('puts the style sheet and the script where the page links them', async () => {
    const r = await page({ html: '<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="style.css"><style>p { color: blue }</style></head><body><p>x</p><script src="script.js"></script><footer>f</footer></body></html>',
      css: 'p { color: red }', js: 'console.log(!!document.querySelector("footer"))' }, [{ check: 'style', selector: 'p', property: 'color', value: 'blue', label: 'the later rule wins' }]);
    expect(r.results[0].ok).toBe(true);
    // The script ran where the page put it: before the footer existed.
    expect(r.console).toEqual([{ kind: 'log', text: 'false' }]);
    expect(treeLines(r.tree).filter(l => /style|script|link/.test(l))).toEqual(['    style [data-file="style.css"]', '    style', '    script [data-file="script.js"]']);
  });
  inBrowser('shows what the browser built, not what was typed: implied tbody, and a paragraph closed by a block', async () => {
    const r = await page({ html: '<table><tr><td>1</td></tr></table>\n<p>一<div>二</div>' });
    expect(treeLines(r.tree).slice(3)).toEqual(['    table', '      tbody', '        tr', '          td  "1"', '    p  "一"', '    div  "二"']);
  });
  inBrowser('does not let closing tags in the style sheet or the script end their elements', async () => {
    const r = await page({ html: '<p id="a">x</p>', css: '/* </style><p id="leak">leak</p> */ #a { color: red }', js: 'console.log("</script><p id=leak2>".length)' },
      [{ check: 'count', selector: '#leak, #leak2', count: 0, label: 'nothing leaked' }, { check: 'style', selector: '#a', property: 'color', value: 'red', label: 'style applied' }]);
    expect(r.results.map(x => x.ok)).toEqual([true, true]);
    expect(r.console).toEqual([{ kind: 'log', text: '21' }]);
  });
});

describe('checks', () => {
  const html = '<ul id="list"><li class="done">買 牛奶</li><li>寫   作業</li><li>運動</li></ul>\n<img id="logo" alt="標誌" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">\n<input id="name" value="小安" required>\n<input id="agree" type="checkbox" checked>';
  const css = 'body { margin: 0; font-size: 16px; }\n#list { margin: 0; padding: 0; list-style: none; width: 200px; }\nli { height: 20px; color: rgb(0, 128, 0); }\n.done { text-decoration-line: line-through; }\n.done::before { content: "v"; color: gray; }';
  inBrowser('count, text, attr, value: pass and fail with what was found', async () => {
    const steps: WebStep[] = [
      { check: 'count', selector: 'li', count: 3, label: 'c1' }, { check: 'count', selector: 'li', count: 4, label: 'c2' },
      { check: 'count', selector: 'li', count: 2, op: 'min', label: 'c3' }, { check: 'count', selector: 'li', count: 2, op: 'max', label: 'c4' },
      { check: 'text', selector: 'li:nth-child(2)', text: '寫 作業', label: 't1' }, { check: 'text', selector: 'li', text: '牛奶', match: 'includes', label: 't2' }, { check: 'text', selector: 'li', text: '牛奶', label: 't3' },
      { check: 'attr', selector: '#logo', name: 'alt', label: 'a1' }, { check: 'attr', selector: '#logo', name: 'alt', value: '標誌', label: 'a2' }, { check: 'attr', selector: '#logo', name: 'alt', value: '圖', label: 'a3' },
      { check: 'attr', selector: '#logo', name: 'title', label: 'a4' }, { check: 'attr', selector: '#logo', name: 'title', match: 'absent', label: 'a5' }, { check: 'attr', selector: '#logo', name: 'src', value: 'data:image', match: 'includes', label: 'a6' },
      { check: 'value', selector: '#name', value: '小安', label: 'v1' }, { check: 'value', selector: '#agree', value: true, label: 'v2' }, { check: 'value', selector: '#agree', value: false, label: 'v3' },
      { check: 'text', selector: '#nope', text: 'x', label: 'm1' }, { check: 'count', selector: 'li:::bad', count: 1, label: 'bad selector' },
    ];
    const r = await page({ html, css }, steps);
    expect(r.results.map(x => x.ok)).toEqual([true, false, true, false, true, true, false, true, true, false, false, true, true, true, true, false, false, false]);
    const shown = judge(steps, r.results);
    expect(shown.find(s => s.label === 'c2')!.message).toBe('目前有 3 個 `li`。');
    expect(shown.find(s => s.label === 't3')!.message).toBe('`li` 目前的文字是「買 牛奶」。');
    expect(shown.find(s => s.label === 'a3')!.message).toBe('`#logo` 的 alt 目前是「標誌」。');
    expect(shown.find(s => s.label === 'a4')!.message).toBe('`#logo` 沒有 title 屬性。');
    expect(shown.find(s => s.label === 'v3')!.message).toBe('`#agree` 目前已勾選。');
    expect(shown.find(s => s.label === 'm1')!.message).toBe('頁面上找不到 `#nope`。');
    expect(shown.find(s => s.label === 'bad selector')!.message).toBe('選擇器 `li:::bad` 無法使用。');
  });
  inBrowser('style compares what the browser computed, however the expected value is written; box measures at the check viewport', async () => {
    const steps: WebStep[] = [
      { check: 'style', selector: 'li', property: 'color', value: 'green', label: 's1' }, { check: 'style', selector: 'li', property: 'color', value: '#008000', label: 's2' },
      { check: 'style', selector: 'li', property: 'color', value: 'rgb(0,128,0)', label: 's3' }, { check: 'style', selector: 'li', property: 'color', value: 'red', label: 's4' },
      { check: 'style', selector: 'li', property: 'color', value: ['red', 'green'], label: 's5' },
      { check: 'style', selector: '.done', property: 'text-decoration-line', value: 'line-through', label: 's6' },
      { check: 'style', selector: '.done', property: 'content', value: '"v"', pseudo: '::before', label: 's7' }, { check: 'style', selector: '.done', property: 'color', value: 'gray', pseudo: '::before', label: 's8' },
      { check: 'box', selector: '#list', measure: 'width', value: 200, label: 'b1' }, { check: 'box', selector: '#list', measure: 'height', value: 60, label: 'b2' },
      { check: 'box', selector: 'li:nth-child(3)', measure: 'top', value: 40, label: 'b3' }, { check: 'box', selector: 'li:nth-child(3)', measure: 'top', value: 20, from: 'li:nth-child(2)', label: 'b4' },
      { check: 'box', selector: '#list', measure: 'width', value: 180, label: 'b5' }, { check: 'box', selector: '#list', measure: 'width', value: 180, tolerance: 20, label: 'b6' },
      { check: 'box', selector: 'li', measure: 'right', value: 200, label: 'b7' }, { check: 'box', selector: 'li', measure: 'left', value: 0, from: '#gone', label: 'b8' },
    ];
    const r = await page({ html, css }, steps);
    expect(r.results.map(x => x.ok)).toEqual([true, true, true, false, true, true, true, true, true, true, true, true, false, true, true, false]);
    const shown = judge(steps, r.results);
    expect(shown.find(s => s.label === 's4')!.message).toBe('`li` 的 color 計算後是 rgb(0, 128, 0)。');
    expect(shown.find(s => s.label === 'b5')!.message).toBe('`#list` 的寬度目前是 200px。');
    expect(shown.find(s => s.label === 'b8')!.message).toBe('頁面上找不到 `#gone`。');
  });
  inBrowser('a percentage width is measured at the exercise viewport, whatever the size of the outer page', async () => {
    const steps: WebStep[] = [{ check: 'box', selector: 'div', measure: 'width', value: 300, label: 'half of 600' }];
    expect((await page({ html: '<div style="width:50%;height:10px"></div>', css: 'body{margin:0}' }, steps)).results[0].ok).toBe(true);
    const narrow = await browser!.run({ files: { html: '<div style="width:50%;height:10px"></div>', css: 'body{margin:0}' }, steps, viewport: { width: 320, height: 400 } });
    expect(narrow.results[0]).toMatchObject({ ok: false, actual: '160' });
  });
});

describe('structure checks', () => {
  inBrowser('label reads a control\'s label the way assistive technology does; headings checks the outline', async () => {
    const html = '<h1>報名</h1><h2>聯絡方式</h2><label for="email">電子郵件</label><input id="email"><label>姓名 <input id="name"></label><input id="bare" placeholder="電話">'
      + '<span id="hint">搜尋 站內</span><input id="q" aria-labelledby="hint"><input id="x" aria-label="關閉" title="t"><h3>備註</h3><h2>送出</h2>';
    const steps: WebStep[] = [
      { check: 'label', selector: '#email', text: '電子郵件', label: 'l1' }, { check: 'label', selector: '#name', text: '姓名', label: 'l2' }, { check: 'label', selector: '#bare', text: '電話', label: 'l3' },
      { check: 'label', selector: '#q', text: '搜尋 站內', label: 'l4' }, { check: 'label', selector: '#x', text: '關', match: 'includes', label: 'l5' }, { check: 'label', selector: '#email', text: '姓名', label: 'l6' },
      { check: 'headings', label: 'outline' },
    ];
    const r = await page({ html }, steps);
    expect(r.results.map(x => x.ok)).toEqual([true, true, false, true, true, false, true]);
    const shown = judge(steps, r.results);
    expect(shown.find(s => s.label === 'l3')!.message).toBe('`#bare` 沒有標籤（沒有對應的 label，也沒有 aria-label）。');
    expect(shown.find(s => s.label === 'l6')!.message).toBe('`#email` 目前的標籤文字是「電子郵件」。');
    const outline: WebStep[] = [{ check: 'headings', label: 'outline' }];
    for (const [page_, ok, said] of [['<h1>a</h1><h3>b</h3>', false, '頁面的標題依序是 h1、h3。'], ['<h2>a</h2><h1>b</h1>', false, '頁面的標題依序是 h2、h1。'], ['<h1>a</h1><h2>b</h2><h1>c</h1>', false, '頁面的標題依序是 h1、h2、h1。'],
      ['<p>x</p>', false, '頁面沒有任何標題。'], ['<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h3>e</h3><h4>f</h4><h2>g</h2>', true, '']] as const) {
      const shownOutline = judge(outline, (await page({ html: page_ }, outline)).results)[0];
      expect([shownOutline.ok, shownOutline.message], page_).toEqual([ok, said]);
    }
  });
});

describe('actions and what the frame records', () => {
  inBrowser('click, input, select, check, key and wait drive the page; focus follows', async () => {
    const html = '<input id="q"><select id="s"><option value="a">A</option><option value="b">B</option></select><input id="c" type="checkbox"><button id="b" type="button">go</button><p id="out"></p>';
    const js = "const out = document.querySelector('#out');\nconst say = t => { out.textContent += t + ';'; };\n"
      + "document.querySelector('#q').addEventListener('input', e => say('input ' + e.target.value));\n"
      + "document.querySelector('#s').addEventListener('change', e => say('change ' + e.target.value));\n"
      + "document.querySelector('#c').addEventListener('change', e => say('checked ' + e.target.checked));\n"
      + "document.querySelector('#b').addEventListener('click', () => { say('click'); setTimeout(() => say('later'), 50); });\n"
      + "document.addEventListener('keydown', e => say('key ' + e.key));";
    const steps: WebStep[] = [
      { do: 'input', selector: '#q', value: '海' }, { do: 'select', selector: '#s', value: 'b' }, { do: 'check', selector: '#c', checked: true }, { do: 'check', selector: '#c', checked: true },
      { do: 'key', selector: '#q', key: 'Escape' }, { check: 'focus', selector: '#q', label: 'focus on the field' },
      { do: 'key', selector: '#b', key: 'Enter' }, { check: 'text', selector: '#out', text: 'input 海;change b;checked true;key Escape;key Enter;click;', label: 'before the timer' },
      { do: 'wait', ms: 120 }, { check: 'text', selector: '#out', text: 'later;', match: 'includes', label: 'after the timer' },
      { check: 'value', selector: '#s', value: 'b', label: 'selected' }, { check: 'focus', selector: '#q', label: 'focus moved' }, { do: 'click', selector: '#missing' }, { check: 'count', selector: 'p', count: 1, label: 'after a failed action' },
    ];
    const r = await page({ html, js }, steps);
    const shown = judge(steps, r.results);
    expect(shown.map(s => s.ok)).toEqual([true, true, true, true, false, true]);
    expect(shown[4].message).toBe('目前的焦點在 <button#b>。');
    // The check after an action that found nothing still runs; an earlier failed action explains a later failed check.
    expect(r.results.at(-2)).toEqual({ ok: false, missing: true });
    expect(judge([{ do: 'click', selector: '#missing' }, { check: 'count', selector: 'p', count: 9, label: 'x' }], [{ ok: false, missing: true }, { ok: false, actual: '1' }])[0].message)
      .toBe('無法點擊 `#missing`：頁面上找不到這個元素。');
  });
  inBrowser('records console output in order, with values shown the way a console shows them, and uncaught errors', async () => {
    const js = "console.log('a', 1, true, null, undefined);\nconsole.log([1, 'x'], { k: [2] });\nconsole.warn('careful');\nconsole.error('bad');\nconsole.log(document.querySelector('p'));\n"
      + "const o = {}; o.self = o; console.log(o);\nPromise.resolve().then(() => console.log('micro'));\nsetTimeout(() => console.log('macro'), 0);\nconsole.log('sync');\nundefinedFunction();";
    const steps: WebStep[] = [{ do: 'wait', ms: 30 }, { check: 'console', lines: ['sync', 'micro', 'macro'], match: 'includes', label: 'order' }, { check: 'console', lines: ['a 1 true null undefined'], label: 'not all' }];
    const r = await page({ html: '<p id="x" class="y">p</p>', js }, steps);
    expect(r.console.slice(0, 7)).toEqual([
      { kind: 'log', text: 'a 1 true null undefined' }, { kind: 'log', text: '[1,"x"] {"k":[2]}' }, { kind: 'warn', text: 'careful' }, { kind: 'error', text: 'bad' },
      { kind: 'log', text: '<p#x.y>' }, { kind: 'log', text: '{"self":"[Circular]"}' }, { kind: 'log', text: 'sync' }]);
    expect(r.console[7]).toMatchObject({ kind: 'error' });
    expect(r.console[7].text).toMatch(/^Uncaught ReferenceError: undefinedFunction/);
    expect(r.console.slice(8).map(l => l.text)).toEqual(['micro', 'macro']);
    expect(r.results.slice(1).map(x => x.ok)).toEqual([true, false]);
  });
  inBrowser('an uncaught error or rejection is the page\'s own: shown in its console, never reported against the page that hosts the frame', async () => {
    const before = browser!.hostErrors().length;
    const r = await page({ html: '<p>x</p>', js: "Promise.reject(new Error('later'));\nsetTimeout(() => { throw new TypeError('in a timer'); }, 0);\nmissing();" }, [{ do: 'wait', ms: 50 }, { check: 'count', selector: 'p', count: 1, label: 'p' }]);
    expect(r.console.map(l => l.kind)).toEqual(['error', 'error', 'error']);
    // W1: an error in script.js carries its line in that file.
    expect(r.console.map(l => l.text).sort()).toEqual(['Uncaught (in promise) Error: later', 'Uncaught ReferenceError: missing is not defined（script.js 第 3 行）', 'Uncaught TypeError: in a timer（script.js 第 2 行）']);
    expect(browser!.hostErrors().slice(before)).toEqual([]);
  });
  inBrowser('a link is recorded, never followed; a fragment link scrolls on the same page', async () => {
    const html = '<a id="out" href="https://example.com/next" target="_blank">外部</a> <a id="in" href="#bottom">往下</a><div style="height:2000px"></div><p id="bottom">底</p>';
    const steps: WebStep[] = [{ do: 'click', selector: '#out' }, { check: 'navigated', href: 'https://example.com/next', label: 'n1' }, { check: 'count', selector: '#bottom', count: 1, label: 'still here' },
      { do: 'click', selector: '#in' }, { check: 'navigated', href: '#bottom', label: 'n2' }, { check: 'navigated', href: '#top', label: 'n3' }, { check: 'box', selector: '#bottom', measure: 'top', value: 2000, tolerance: 60, label: 'document position' }];
    const r = await page({ html, css: 'body{margin:0}' }, steps);
    expect(judge(steps, r.results).map(s => s.ok)).toEqual([true, true, true, false, true]);
    expect(r.navigations).toEqual([{ href: 'https://example.com/next', target: '_blank', text: '外部' }, { href: '#bottom', target: '', text: '往下' }]);
  });
  inBrowser('a form submission is recorded with its data after native validation, and never leaves the page', async () => {
    const html = '<form id="f" action="/signup" method="post"><input name="email" type="email" required><input name="plan" type="radio" value="free" checked><input name="plan" type="radio" value="pro"><button id="send" name="via" value="button">送出</button></form>';
    const steps: WebStep[] = [
      { do: 'click', selector: '#send' }, { check: 'submitted', count: 0, label: 'empty required field: not submitted' }, { check: 'count', selector: 'input:invalid', count: 1, label: 'the field is invalid' },
      { do: 'input', selector: '[name=email]', value: 'not-an-email' }, { do: 'submit', selector: '#f' }, { check: 'submitted', count: 0, label: 'wrong format: not submitted' },
      { do: 'input', selector: '[name=email]', value: 'a@example.com' }, { do: 'click', selector: '#send' }, { check: 'submitted', count: 1, label: 'submitted once' },
      { check: 'submitted', data: { email: 'a@example.com', plan: 'free', via: 'button' }, label: 'with the data' }, { check: 'submitted', data: { email: 'a@example.com' }, label: 'not only the email' },
      { do: 'key', selector: '[name=email]', key: 'Enter' }, { check: 'submitted', count: 2, label: 'Enter submits too' }, { check: 'count', selector: '#f', count: 1, label: 'still on the page' },
    ];
    const r = await page({ html }, steps);
    expect(judge(steps, r.results).map(s => s.ok)).toEqual([true, true, true, true, true, false, true, true]);
    expect(r.submissions[0]).toEqual({ form: '<form#f>', handled: false, method: 'post', action: '/signup', data: [['email', 'a@example.com'], ['plan', 'free'], ['via', 'button']] });
  });
});

describe('layout checks for positioning (WEB-2)', () => {
  inBrowser('hit says what is drawn on top; scroll moves the page or a box; box can measure from the viewport', async () => {
    const html = '<header id="bar">bar</header><div id="a"></div><div id="b"><span id="inner">x</span></div><div id="tall"></div><div id="pane"><div id="long"></div></div>';
    const css = 'body { margin: 0; } #bar { position: sticky; top: 0; height: 40px; background: #eee; z-index: 3; }'
      + '#a, #b { position: absolute; width: 100px; height: 100px; } #a { left: 0; top: 60px; background: red; z-index: 2; } #b { left: 50px; top: 110px; background: blue; z-index: 1; }'
      + '#inner { display: block; width: 100px; height: 100px; } #tall { height: 1500px; } #pane { position: absolute; left: 300px; top: 60px; width: 100px; height: 100px; overflow: auto; } #long { height: 500px; }';
    const steps: WebStep[] = [
      { check: 'hit', selector: '#a', top: '#a', label: 'a is on top at its own centre' },
      { check: 'hit', selector: '#b', top: '#b', label: 'b at its centre (through its child)' },
      { check: 'hit', selector: '#b', top: '#a', label: 'not a' },
      { check: 'box', selector: '#bar', measure: 'top', value: 0, label: 'bar at the top of the page' },
      { do: 'scroll', selector: ':page', top: 300 },
      { check: 'box', selector: '#bar', measure: 'top', value: 300, label: 'sticky: 300 down the page' },
      { check: 'box', selector: '#bar', measure: 'top', value: 0, from: ':viewport', label: 'sticky: still at the top of the viewport' },
      { check: 'box', selector: '#a', measure: 'top', value: -240, from: ':viewport', label: 'a scrolled up out of view' },
      { check: 'hit', selector: '#a', top: '#a', label: 'a is off screen now' },
      { do: 'scroll', selector: '#pane', top: 120 },
      { check: 'box', selector: '#long', measure: 'top', value: -120, from: '#pane', label: 'the pane scrolled its content' },
      { do: 'scroll', selector: '#nope', top: 1 }, { check: 'hit', selector: '#b', top: '#nope', label: 'missing top' },
    ];
    const r = await page({ html, css }, steps);
    const shown = judge(steps, r.results);
    expect(shown.map(s => s.ok)).toEqual([true, true, false, true, true, true, true, false, true, false]);
    expect(shown[2].message).toBe('`#b` 的中心點上，畫在最上面的是 <span#inner>。');
    expect(shown[7].message).toBe('`#a` 的中心點不在畫面內。');
    expect(shown[9].message).toBe('無法把 `#nope` 往下捲到 1px：頁面上找不到這個元素。');
  });
});

describe('scripts, timers and events (WEB-3: W1 and W2)', () => {
  inBrowser('a script runs where the page loads it: in the head it finds no body, deferred or as a module it finds the whole document', async () => {
    const page_ = (script: string) => `<!DOCTYPE html><html><head><title>T</title>${script}</head><body><p id="p">x</p></body></html>`;
    const js = "console.log(document.body ? 'body: ' + document.querySelectorAll('p').length : 'no body yet');";
    expect((await page({ html: page_('<script src="script.js"></script>'), js })).console).toEqual([{ kind: 'log', text: 'no body yet' }]);
    expect((await page({ html: page_('<script src="script.js" defer></script>'), js })).console).toEqual([{ kind: 'log', text: 'body: 1' }]);
    expect((await page({ html: page_('<script type="module" src="script.js"></script>'), js })).console).toEqual([{ kind: 'log', text: 'body: 1' }]);
    // The classic mistake and its error, with the line in script.js.
    const broken = await page({ html: page_('<script src="script.js"></script>'), js: "const p = document.querySelector('#p');\np.textContent = 'y';" });
    expect(broken.console).toHaveLength(1);
    expect(broken.console[0].text).toMatch(/^Uncaught TypeError: .*（script\.js 第 2 行）$/);
  });
  inBrowser('a check runs on a virtual clock: timers fire in time order without real waiting, intervals repeat, cleared timers never fire', async () => {
    const js = "console.log('start');\nsetTimeout(() => console.log('t500'), 500);\nsetTimeout(() => console.log('t100'), 100);\nsetTimeout(() => console.log('t0'), 0);\n"
      + "Promise.resolve().then(() => console.log('micro'));\nconst gone = setTimeout(() => console.log('never'), 50);\nclearTimeout(gone);\n"
      + "let n = 0;\nconst every = setInterval(() => { console.log('tick ' + (++n)); if (n === 3) clearInterval(every); }, 1000);\n"
      + "setTimeout(() => { console.log('t100 again'); setTimeout(() => console.log('nested'), 10); }, 100);\nconsole.log('end');";
    const steps: WebStep[] = [
      { check: 'console', lines: ['start', 'end', 'micro', 't0'], label: 'zero-delay timers have fired when the page is first looked at' },
      { do: 'wait', ms: 100 }, { check: 'console', lines: ['start', 'end', 'micro', 't0', 't100', 't100 again'], label: 'same time: in the order they were set' },
      { do: 'wait', ms: 400 }, { check: 'console', lines: ['nested', 't500'], match: 'includes', label: 'a timer set by a timer' },
      { do: 'wait', ms: 9500 }, { check: 'console', lines: ['start', 'end', 'micro', 't0', 't100', 't100 again', 'nested', 't500', 'tick 1', 'tick 2', 'tick 3'], label: 'the interval ran three times and stopped' },
    ];
    const before = Date.now();
    const r = await page({ html: '<p>x</p>', js }, steps);
    expect(r.results.filter((_, i) => i % 2 === 0).map(x => x.ok)).toEqual([true, true, true, true]);
    // Ten virtual seconds in well under two real ones.
    expect(Date.now() - before).toBeLessThan(2000);
  });
  inBrowser('async functions and timers interleave as in a browser; an awaited timer resumes when the clock reaches it', async () => {
    const js = "const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));\nasync function load() {\n  console.log('loading');\n  await sleep(300);\n  console.log('loaded');\n  return 42;\n}\n"
      + "load().then(v => { document.querySelector('#out').textContent = String(v); });\nconsole.log('after call');";
    const steps: WebStep[] = [{ check: 'console', lines: ['loading', 'after call'], label: 'before' }, { check: 'text', selector: '#out', text: '', label: 'empty' },
      { do: 'wait', ms: 299 }, { check: 'text', selector: '#out', text: '', label: 'not yet' }, { do: 'wait', ms: 1 }, { check: 'text', selector: '#out', text: '42', label: 'resolved' },
      { check: 'console', lines: ['loading', 'after call', 'loaded'], label: 'order' }];
    const r = await page({ html: '<p id="out"></p>', js }, steps);
    expect(judge(steps, r.results).map(s => s.ok)).toEqual([true, true, true, true, true]);
  });
  inBrowser('dispatch fires any event on an element: it bubbles to a delegating listener, and mouseenter does not', async () => {
    const js = "const log = [];\ndocument.querySelector('#list').addEventListener('mouseover', e => log.push('over ' + e.target.id));\n"
      + "document.querySelector('#list').addEventListener('mouseenter', e => log.push('enter ' + e.target.id));\ndocument.querySelector('#list').addEventListener('dblclick', e => log.push('dbl ' + e.target.id));\n"
      + "document.addEventListener('saved', e => { log.push('saved'); document.querySelector('#out').textContent = log.join(', '); });";
    const steps: WebStep[] = [{ do: 'dispatch', selector: '#a', event: 'mouseover' }, { do: 'dispatch', selector: '#a', event: 'mouseenter' }, { do: 'dispatch', selector: '#b', event: 'dblclick' },
      { do: 'dispatch', selector: '#b', event: 'saved' }, { check: 'text', selector: '#out', text: 'over a, dbl b, saved', label: 'delegated' }];
    expect((await page({ html: '<ul id="list"><li id="a">a</li><li id="b">b</li></ul><p id="out"></p>', js }, steps)).results[4].ok).toBe(true);
  });
});

describe('the pretend server and storage (WEB-4: W3 and W4)', () => {
  const api = [
    { path: '/api/books', body: [{ id: 1, title: '海龜的一年' }, { id: 2, title: '潮汐表' }], delay: 300 },
    { path: '/api/books', method: 'POST' as const, status: 201, body: { id: 3 } },
    { path: '/api/members/9', status: 404, body: { error: '找不到會員' } },
    { path: '/api/down', fail: true },
    { path: '/hello.txt', body: '你好' },
    { path: '/api/empty', status: 204 },
  ];
  inBrowser('fetch is answered from the routes after their delay on the page\'s clock; statuses, JSON, text, 404 and a network error behave as in a browser', async () => {
    const js = "const out = document.querySelector('#out');\nconst say = t => { out.textContent += t + ';'; };\n"
      + "async function go() {\n  const res = await fetch('/api/books?sort=title');\n  say(res.status + ' ' + res.ok + ' ' + res.headers.get('content-type'));\n  const books = await res.json();\n  say(books.map(b => b.title).join('+'));\n"
      + "  const missing = await fetch('/api/members/9');\n  say(missing.status + ' ' + missing.ok + ' ' + (await missing.json()).error);\n  say((await (await fetch('/nowhere')).json()).error);\n"
      + "  say(await (await fetch('/hello.txt')).text());\n  say(String((await fetch('/api/empty')).status));\n"
      + "  const made = await fetch('/api/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新書' }) });\n  say(made.status + ' ' + (await made.json()).id);\n"
      + "  try { await fetch('/api/down'); } catch (e) { say(e.name); }\n}\ngo();";
    const steps: WebStep[] = [
      { check: 'text', selector: '#out', text: '', label: 'nothing before the first answer' }, { do: 'wait', ms: 299 }, { check: 'text', selector: '#out', text: '', label: 'not at 299 ms' },
      { do: 'wait', ms: 1 }, { check: 'text', selector: '#out', text: '200 true application/json;海龜的一年+潮汐表;', label: 'the first answer at 300 ms' },
      { do: 'wait', ms: 2000 }, { check: 'text', selector: '#out', text: '200 true application/json;海龜的一年+潮汐表;404 false 找不到會員;Not Found;你好;204;201 3;TypeError;', label: 'everything' },
      { check: 'request', path: '/api/books', label: 'asked for the books' }, { check: 'request', path: '/api/books?sort=title', count: 1, label: 'once, with the query' },
      { check: 'request', path: '/api/books', method: 'POST', body: { title: '新書' }, label: 'posted the new book' }, { check: 'request', path: '/api/books', method: 'POST', body: { title: '別的' }, label: 'not another body' },
      { check: 'request', path: '/api/loans', label: 'never asked for loans' }, { check: 'request', path: '/api/books', method: 'DELETE', count: 0, label: 'deleted nothing' },
    ];
    const r = await page({ html: '<p id="out"></p>', js }, steps, { api });
    const shown = judge(steps, r.results);
    expect(shown.map(s => s.ok)).toEqual([true, true, true, true, true, true, true, false, false, true]);
    expect(shown[7].message).toBe('最後一次 POST /api/books 送出的內容是 {"title":"新書"}。');
    expect(shown[8].message).toMatch(/^頁面目前送出的請求：GET \/api\/books\?sort=title, GET \/api\/members\/9, /);
    // A GET cannot carry a body: as in a browser, fetch rejects and nothing is sent.
    const getBody = await page({ html: '<p id="out"></p>', js: "fetch('/api/books', { body: 'x' }).then(() => 'sent', e => e.name).then(t => { document.querySelector('#out').textContent = t; });" },
      [{ do: 'wait', ms: 500 }, { check: 'text', selector: '#out', text: 'TypeError', label: 'rejected' }, { check: 'request', path: '/api/books', count: 0, label: 'nothing sent' }], { api });
    expect(getBody.results.slice(1).map(x => x.ok)).toEqual([true, true]);
    expect(r.requests.map(q => `${q.method} ${q.path} ${q.status}`)).toEqual(['GET /api/books?sort=title 200', 'GET /api/members/9 404', 'GET /nowhere 404', 'GET /hello.txt 200', 'GET /api/empty 204', 'POST /api/books 201', 'GET /api/down -1']);
    expect(r.console).toEqual([]);
  });
  inBrowser('localStorage, sessionStorage and cookies are the page\'s own, start from what an earlier visit left, and can be checked', async () => {
    const js = "const visits = Number(localStorage.getItem('visits') || '0') + 1;\nlocalStorage.setItem('visits', String(visits));\nlocalStorage.setItem('prefs', JSON.stringify({ theme: 'dark' }));\nlocalStorage.removeItem('old');\n"
      + "sessionStorage.setItem('tab', 'a');\ndocument.cookie = 'lang=zh-Hant; max-age=3600; path=/';\ndocument.cookie = 'gone=1; max-age=0';\ndocument.cookie = 'secret=x; HttpOnly';\n"
      + "document.querySelector('#out').textContent = [visits, localStorage.length, localStorage.key(0), document.cookie].join(' | ');";
    const steps: WebStep[] = [
      { check: 'text', selector: '#out', text: '4 | 2 | visits | sid=abc; lang=zh-Hant', label: 'what the page read and wrote' },
      { check: 'storage', key: 'visits', value: '4', label: 's1' }, { check: 'storage', key: 'prefs', label: 's2' }, { check: 'storage', key: 'old', match: 'absent', label: 's3' },
      { check: 'storage', key: 'tab', value: 'a', area: 'session', label: 's4' }, { check: 'storage', key: 'visits', value: '1', label: 's5' }, { check: 'storage', key: 'nope', label: 's6' },
      { check: 'cookie', name: 'lang', value: 'zh-Hant', label: 'c1' }, { check: 'cookie', name: 'gone', match: 'absent', label: 'c2' }, { check: 'cookie', name: 'secret', match: 'absent', label: 'c3' }, { check: 'cookie', name: 'sid', value: 'x', label: 'c4' },
    ];
    const r = await page({ html: '<p id="out"></p>', js }, steps, { storage: { visits: '3', old: 'x' }, cookies: { sid: 'abc', gone: '1' } });
    const shown = judge(steps, r.results);
    expect(shown.map(s => s.ok)).toEqual([true, true, true, true, true, false, false, true, true, true, false]);
    expect(shown[5].message).toBe('localStorage 的 visits 目前是「4」。');
    expect(shown[6].message).toBe('localStorage 裡沒有 nope。');
    expect(shown[10].message).toBe('Cookie sid 目前是「abc」。');
    expect(r.storage).toEqual({ local: { visits: '4', prefs: '{"theme":"dark"}' }, session: { tab: 'a' }, cookies: { sid: 'abc', lang: 'zh-Hant' } });
    // A first visit starts empty.
    expect((await page({ html: '<p id="out"></p>', js }, [{ check: 'storage', key: 'visits', value: '1', label: 'first visit' }])).results[0].ok).toBe(true);
  });
});

describe('accessibility checks (WEB-4: W5)', () => {
  inBrowser('name reads an element\'s accessible name and role its role, explicit or implied by the tag', async () => {
    const html = '<header id="top"><nav id="n1" aria-label="主選單"><a id="home" href="/">首頁</a></nav></header>'
      + '<main><h1 id="h">借書<span aria-hidden="true">★</span></h1><button id="b1"><img src="data:," alt="搜尋"></button><button id="b2"><span aria-hidden="true">✕</span></button><button id="b3" aria-label="關閉視窗">✕</button>'
      + '<div id="fake" onclick="go()">假按鈕</div><div id="made" role="button" tabindex="0">自製按鈕</div><a id="noref">不是連結</a>'
      + '<label for="q">書名</label><input id="q" type="search"><input id="agree" type="checkbox" aria-labelledby="t1 t2"><span id="t1">我同意</span><span id="t2">借閱規則</span>'
      + '<img id="deco" src="data:," alt=""><img id="pic" src="data:," alt="燈塔" title="不會用到"><fieldset id="fs"><legend>取書地點</legend></fieldset><section id="s1"><h2>無名</h2></section><section id="s2" aria-label="最新消息"></section>'
      + '<article><header id="inner">文章頁首</header></article><input id="t" title="電話"></main><footer id="foot">頁尾</footer>';
    const steps: WebStep[] = [
      { check: 'name', selector: '#home', text: '首頁', label: 'n' }, { check: 'name', selector: '#n1', text: '主選單', label: 'n' }, { check: 'name', selector: '#h', text: '借書', label: 'n' },
      { check: 'name', selector: '#b1', text: '搜尋', label: 'n' }, { check: 'name', selector: '#b2', text: '關閉', label: 'empty' }, { check: 'name', selector: '#b3', text: '關閉視窗', label: 'n' },
      { check: 'name', selector: '#q', text: '書名', label: 'n' }, { check: 'name', selector: '#agree', text: '我同意 借閱規則', label: 'n' }, { check: 'name', selector: '#pic', text: '燈塔', label: 'n' },
      { check: 'name', selector: '#fs', text: '取書地點', label: 'n' }, { check: 'name', selector: '#t', text: '電話', label: 'title as a last resort' }, { check: 'name', selector: '#made', text: '自製', match: 'includes', label: 'n' },
      { check: 'role', selector: '#home', role: 'link', label: 'r' }, { check: 'role', selector: '#noref', role: 'link', label: 'no href' }, { check: 'role', selector: '#b1', role: 'button', label: 'r' },
      { check: 'role', selector: '#fake', role: 'button', label: 'a div is not a button' }, { check: 'role', selector: '#made', role: 'button', label: 'r' }, { check: 'role', selector: '#q', role: 'searchbox', label: 'r' },
      { check: 'role', selector: '#agree', role: 'checkbox', label: 'r' }, { check: 'role', selector: '#deco', role: 'presentation', label: 'r' }, { check: 'role', selector: '#top', role: 'banner', label: 'r' },
      { check: 'role', selector: '#inner', role: 'banner', label: 'a header inside an article is not the banner' }, { check: 'role', selector: '#foot', role: 'contentinfo', label: 'r' },
      { check: 'role', selector: '#s1', role: 'region', label: 'an unnamed section is no landmark' }, { check: 'role', selector: '#s2', role: 'region', label: 'r' }, { check: 'role', selector: '#h', role: 'heading', label: 'r' },
    ];
    const r = await page({ html }, steps);
    const shown = judge(steps, r.results);
    expect(shown.filter(s => !s.ok).map(s => s.label)).toEqual(['empty', 'no href', 'a div is not a button', 'a header inside an article is not the banner', 'an unnamed section is no landmark']);
    expect(shown.find(s => s.label === 'empty')!.message).toBe('`#b2` 沒有無障礙名稱（螢幕閱讀器唸不出它是什麼）。');
    expect(shown.find(s => s.label === 'a div is not a button')!.message).toBe('`#fake` 目前的角色是 generic。');
    expect(shown.find(s => s.label === 'no href')!.message).toBe('`#noref` 目前的角色是 generic。');
  });
  inBrowser('tab moves focus in tab order: positive tabindex first, then the document; skipped elements are skipped; a page can trap it', async () => {
    const html = '<a id="a" href="#x">a</a><button id="b">b</button><button id="off" disabled>off</button><div id="div">div</div><div id="t0" tabindex="0">t0</div><span id="tm" tabindex="-1">tm</span>'
      + '<input id="hid" type="hidden"><input id="gone" style="display:none"><input id="r1" type="radio" name="g"><input id="r2" type="radio" name="g" checked><input id="first" tabindex="2"><input id="second" tabindex="5"><select id="sel"><option>1</option></select>';
    const order: string[] = [];
    const steps: WebStep[] = [];
    for (const id of ['first', 'second', 'a', 'b', 't0', 'r2', 'sel']) { steps.push({ do: 'tab' }, { check: 'focus', selector: `#${id}`, label: id }); order.push(id); }
    steps.push({ do: 'tab', shift: true }, { check: 'focus', selector: '#r2', label: 'back' }, { do: 'tab', shift: true }, { check: 'focus', selector: '#t0', label: 'back again' });
    const r = await page({ html }, steps);
    expect(judge(steps, r.results).map(s => [s.label, s.ok])).toEqual([...order.map(id => [id, true]), ['back', true], ['back again', true]]);
    // A dialog that keeps focus inside: the page handles Tab itself.
    const trap = '<button id="open">開啟</button><div id="dlg" role="dialog" aria-label="確認"><button id="yes">確定</button><button id="no">取消</button></div><button id="after">之後</button>';
    const js = "const dlg = document.querySelector('#dlg');\ndlg.addEventListener('keydown', e => {\n  if (e.key !== 'Tab') return;\n  const items = dlg.querySelectorAll('button');\n  const last = items[items.length - 1];\n"
      + "  if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); items[0].focus(); }\n  else if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); last.focus(); }\n});";
    const trapped: WebStep[] = [{ do: 'click', selector: '#yes' }, { do: 'tab' }, { check: 'focus', selector: '#no', label: 'next in the dialog' }, { do: 'tab' }, { check: 'focus', selector: '#yes', label: 'wrapped to the first' },
      { do: 'tab', shift: true }, { check: 'focus', selector: '#no', label: 'and back to the last' }];
    expect(judge(trapped, (await page({ html: trap, js }, trapped)).results).map(s => s.ok)).toEqual([true, true, true]);
    const free: WebStep[] = [{ do: 'click', selector: '#no' }, { do: 'tab' }, { check: 'focus', selector: '#after', label: 'without the trap focus leaves' }];
    expect(judge(free, (await page({ html: trap }, free)).results)[0].ok).toBe(true);
  });
});

describe('viewports (RWD-0)', () => {
  inBrowser('resize lays the same page out at another width: media queries, percentages and container queries follow', async () => {
    const html = '<main><nav id="nav">nav</nav><section id="cards"><article class="card">a</article><article class="card">b</article></section></main>';
    const css = 'body { margin: 0; } #nav { height: 40px; } .card { height: 50px; } #cards { container-type: inline-size; }'
      + '@media (min-width: 700px) { main { display: grid; grid-template-columns: 200px 1fr; } }'
      + '@container (min-width: 500px) { .card { height: 80px; } }';
    const steps: WebStep[] = [
      { check: 'box', selector: '#nav', measure: 'width', value: 600, label: '600: one column' }, { check: 'box', selector: '.card', measure: 'height', value: 80, label: '600: the container is wide' },
      { do: 'resize', width: 360 }, { check: 'box', selector: '#nav', measure: 'width', value: 360, label: '360: full width' }, { check: 'box', selector: '.card', measure: 'height', value: 50, label: '360: narrow cards' },
      { check: 'style', selector: 'main', property: 'display', value: 'block', label: '360: no grid' },
      { do: 'resize', width: 1000, height: 700 }, { check: 'box', selector: '#nav', measure: 'width', value: 200, label: '1000: the sidebar column' },
      { check: 'box', selector: '#cards', measure: 'left', value: 200, label: '1000: content beside it' }, { check: 'box', selector: '#cards', measure: 'width', value: 800, label: '1000: the rest' },
      { do: 'resize', width: 720 }, { check: 'box', selector: '.card', measure: 'height', value: 80, label: '720: container 520' },
    ];
    const r = await page({ html, css }, steps);
    expect(judge(steps, r.results).map(s => [s.label, s.ok])).toEqual(steps.filter(s => 'check' in s).map(s => [(s as { label: string }).label, true]));
    // The page's own script sees the new width too.
    const seen = await page({ html: '<p id="w"></p>', js: "const show = () => { document.querySelector('#w').textContent = innerWidth + ' ' + matchMedia('(max-width: 400px)').matches; }; show(); document.querySelector('#w').addEventListener('click', show);" },
      [{ check: 'text', selector: '#w', text: '600 false', label: 'before' }, { do: 'resize', width: 320 }, { do: 'click', selector: '#w' }, { check: 'text', selector: '#w', text: '320 true', label: 'after' }]);
    expect(seen.results.filter((_, i) => i !== 1 && i !== 2).map(x => x.ok)).toEqual([true, true]);
  });
});

describe('scroll bars that take room (RWD-1)', () => {
  // Headless Chromium hides scroll bars; a learner on a system with classic ones has them. This browser shows them.
  let classic: WebBrowser | null = null;
  beforeAll(async () => { if (browser) classic = await openWebBrowser(CLASSIC_SCROLL_BARS); }, 60_000);
  afterAll(async () => { await classic?.close(); });
  inBrowser('a page taller than the check viewport is still measured at the full width, at every size, and still scrolls', async () => {
    // The premise: in this browser a scroll bar does take room (an element that scrolls is narrower inside than outside).
    const premise = await classic!.run({ files: { html: '<div id="s" style="width: 200px; height: 50px; overflow-y: scroll;"><p id="in" style="margin: 0; height: 300px;">x</p></div>', css: 'body { margin: 0; }' },
      steps: [{ check: 'box', selector: '#in', measure: 'width', value: 200, label: 'no room taken' }], viewport: { width: 360, height: 400 } });
    expect(premise.results[0].ok, 'this browser must draw classic scroll bars').toBe(false);
    const files: WebFiles = { html: '<header id="top">top</header><main id="tall"></main><footer id="end">end</footer>',
      css: 'body { margin: 0; } #top { height: 50px; } #tall { height: 1500px; } #end { position: fixed; left: 0; right: 0; bottom: 0; height: 40px; } @media (min-width: 700px) { #tall { margin-left: 200px; } }',
      js: "document.title = innerWidth + '/' + document.documentElement.clientWidth;" };
    const steps: WebStep[] = [
      { check: 'box', selector: '#top', measure: 'width', value: 360, label: '360: the page is as wide as its viewport' },
      { check: 'box', selector: '#end', measure: 'right', value: 360, from: ':viewport', label: '360: fixed to both edges' },
      { do: 'scroll', selector: ':page', top: 300 }, { check: 'box', selector: '#top', measure: 'top', value: -300, from: ':viewport', label: 'the page still scrolls' },
      { do: 'resize', width: 1000, height: 600 }, { check: 'box', selector: '#top', measure: 'width', value: 1000, label: '1000: full width again' },
      { check: 'box', selector: '#tall', measure: 'width', value: 800, label: '1000: the media query and the layout agree' },
    ];
    const r = await classic!.run({ files, steps, viewport: { width: 360, height: 400 } });
    expect(judge(steps, r.results).map(x => [x.label, x.ok, x.message])).toEqual(steps.filter(x => 'check' in x).map(x => [(x as { label: string }).label, true, '']));
    expect(r.title).toBe('360/360');
    // Nothing was added to the page for it: no element, no attribute.
    expect(treeLines(r.tree).slice(0, 2)).toEqual(['html [lang="zh-Hant"]', '  head']);
    expect(treeLines(r.tree).some(line => /scrollbar|style=/.test(line))).toBe(false);
  }, 60_000);
});

describe('implicit submission', () => {
  inBrowser('Enter in a field submits through the first submit button; without one, only a form with a single one-line field submits', async () => {
    const enter = async (form: string) => {
      const steps: WebStep[] = [{ do: 'key', selector: '#a', key: 'Enter' }, { check: 'submitted', count: 1, label: 'submitted' }];
      const r = await page({ html: `<form>${form}</form>` }, steps);
      return [r.results[1].ok, r.submissions[0]?.data.map(d => d.join('=')).join('&') ?? ''];
    };
    expect(await enter('<input id="a" name="a" value="1"><input name="b" value="2"><button name="go" value="yes">送出</button>')).toEqual([true, 'a=1&b=2&go=yes']);
    expect(await enter('<input id="a" name="a" value="1">')).toEqual([true, 'a=1']);
    expect(await enter('<input id="a" name="a" value="1"><input type="checkbox" name="c" checked><textarea name="t">x</textarea>')).toEqual([true, 'a=1&c=on&t=x']);
    expect(await enter('<input id="a" name="a" value="1"><input name="b" value="2">')).toEqual([false, '']);
    expect(await enter('<input id="a" name="a" value="1"><button disabled>送出</button>')).toEqual([false, '']);
    expect(await enter('<input id="a" name="a" value="1"><input name="b"><button type="button">不是送出</button>')).toEqual([false, '']);
    expect(await enter('<input id="a" name="a" required value=""><button>送出</button>')).toEqual([false, '']);
  });
});

describe('isolation', () => {
  inBrowser('the page cannot reach the network, the parent page or the site\'s storage: its storage is its own, and fetch never leaves the frame', async () => {
    const js = "const report = [];\n"
      + "try { parent.document.title; report.push('parent readable'); } catch (e) { report.push('parent blocked'); }\n"
      + "localStorage.setItem('a', '1'); document.cookie = 'b=2';\n"
      + "const xhr = new XMLHttpRequest(); xhr.onerror = () => report.push('xhr blocked'); xhr.onload = () => report.push('xhr ok');\n"
      + "try { xhr.open('GET', 'https://example.com/'); xhr.send(); } catch (e) { report.push('xhr blocked'); }\n"
      + "fetch('https://example.com/data').then(r => report.push('fetch answered ' + r.status)).then(() => { document.querySelector('#r').textContent = report.join(', '); });";
    const r = await page({ html: '<p id="r"></p><img id="i" src="https://example.com/x.png" alt="x">', js }, [{ do: 'wait', ms: 200 }, { check: 'text', selector: '#r', text: 'parent blocked, xhr blocked, fetch answered 404', label: 'isolated' }]);
    expect(r.results[1]).toMatchObject({ ok: true });
    // What it stored lives in the frame only (the opaque origin has no real storage), and the request went to the pretend server.
    expect(r.storage).toEqual({ local: { a: '1' }, session: {}, cookies: { b: '2' } });
    expect(r.requests).toEqual([{ method: 'GET', path: '/data', body: '', status: 404 }]);
    expect(await browser!.hostStorage()).toEqual({ local: 0, cookie: '' });
  });
  inBrowser('an endless loop is stopped with an error instead of freezing the page, in the script file, an inline script and a handler', async () => {
    for (const js of ['while (true) {}', 'for (;;) {}', 'let i = 0;\ndo { i++; } while (i > 0);', 'for (let i = 0; i >= 0; i++) { /* never ends */ }']) {
      const r = await page({ html: '<p>x</p>', js }, [{ check: 'count', selector: 'p', count: 1, label: 'p' }]);
      expect(r.console, js).toEqual([{ kind: 'error', text: 'Uncaught Error: 迴圈執行太久，已被停止（可能是不會結束的迴圈）' }]);
      expect(r.results[0].ok, js).toBe(true);
    }
    const inline = await page({ html: '<p id="a">x</p><script>while (true) {}</script><p id="b">y</p>' }, [{ check: 'count', selector: 'p', count: 2, label: 'both paragraphs' }]);
    expect(inline.console[0].text).toMatch(/迴圈執行太久/);
    expect(inline.results[0].ok).toBe(true);
    // A loop that ends is not disturbed, and the budget is per task: a later click starts afresh.
    const fine = await page({ html: '<button id="b" type="button">go</button><p id="n"></p>',
      js: "let total = 0;\nfor (let i = 0; i < 200000; i++) total += i;\nconsole.log(total);\ndocument.querySelector('#b').addEventListener('click', () => { let k = 0; while (k < 50000) k++; document.querySelector('#n').textContent = String(k); });" },
      [{ do: 'click', selector: '#b' }, { check: 'text', selector: '#n', text: '50000', label: 'the handler ran' }]);
    expect(fine.console).toEqual([{ kind: 'log', text: '19999900000' }]);
    expect(fine.results[1].ok).toBe(true);
    const verdict = await checkWebExercise(greetExercise(), { js: "document.querySelector('#go').addEventListener('click', () => { while (true) {} });" }, browser!.run);
    expect(verdict.ok).toBe(false);
    expect(verdict.console.some(l => /迴圈執行太久/.test(l.text))).toBe(true);
  }, 90_000);
  inBrowser('a frame that never answers is a timeout: the frame is removed, focus stays where it was, and the next page still runs', async () => {
    // The harness only answers with its own nonce; a job that expects another one hears nothing.
    const job = { sandbox: WEB_SANDBOX, srcdoc: webDocument({ html: '<p>x</p>' }, 'one'), nonce: 'another', steps: [], width: 600, height: 400, timeoutMs: 400 };
    await expect(browser!.job(job)).rejects.toThrow(/timeout/);
    expect((await page({ html: '<p>x</p>' }, [{ check: 'count', selector: 'p', count: 1, label: 'p' }])).results[0].ok).toBe(true);
  });
  it('a run that times out fails every check of the exercise with that reason, and its variants', async () => {
    const verdict = await checkWebExercise(greetExercise(), greetExercise().solution, () => Promise.reject(new Error('timeout')));
    expect(verdict.ok).toBe(false);
    expect(verdict.results.map(c => c.label)).toEqual(['按下之前是空的', '按下之後向輸入框裡的名字打招呼', '改了名字再按，招呼跟著改']);
    expect(verdict.results.every(c => !c.ok && c.message === '頁面沒有在時間內完成載入與檢查（可能有不會結束的迴圈）。')).toBe(true);
    expect(verdict.hidden).toEqual([{ title: '另一個預設名字', ok: false }]);
  });
});

describe('exercises', () => {
  inBrowser('a solution passes every check and variant; the starter and each typical mistake fail; the fixture behaves as it states', async () => {
    for (const exercise of [headingExercise(), badgeExercise(), greetExercise()]) {
      const solved = await checkWebExercise(exercise, exercise.solution, browser!.run);
      expect(solved.ok, exercise.id).toBe(true);
      expect(solved.results.every(r => r.message === ''), exercise.id).toBe(true);
      expect((await checkWebExercise(exercise, exercise.starter, browser!.run)).ok, exercise.id).toBe(false);
      for (const m of exercise.mistakes) expect((await checkWebExercise(exercise, m.files, browser!.run)).ok, m.why).toBe(false);
    }
    expect(await webBehaviourProblems(webContent(), browser!.run)).toEqual([]);
  }, 60_000);
  inBrowser('an answer typed in by hand passes the shown page and fails the variant, which shows only that it failed', async () => {
    const typed = await checkWebExercise(greetExercise(), { js: "let n = 0;\ndocument.querySelector('#go').addEventListener('click', () => { document.querySelector('#hello').textContent = n++ ? '你好，阿明！' : '你好，小安！'; });" }, browser!.run);
    expect(typed.results.every(r => r.ok)).toBe(true);
    expect(typed.hidden).toEqual([{ title: '另一個預設名字', ok: false }]);
    expect(typed.ok).toBe(false);
  });
  inBrowser('behaviour problems name the example or exercise and what went wrong', async () => {
    const content = webContent();
    content.examples[0].observe.push({ check: 'count', selector: 'h2', count: 1, label: '有一個 h2' });
    content.examples[2].files.js += '\nnope();';
    content.exercises[0].solution = { html: '<h1>別的標題</h1><p>x</p>' };
    content.exercises[1].mistakes[0].files = content.exercises[1].solution;
    content.exercises[2].starter = content.exercises[2].solution;
    const problems = (await webBehaviourProblems(content, browser!.run)).join('\n');
    expect(problems).toMatch(/example structure: "有一個 h2" does not hold: 目前有 0 個 `h2`。/);
    expect(problems).toMatch(/example counter logs an error: Uncaught ReferenceError: nope/);
    expect(problems).toMatch(/exercise heading: the solution fails "h1 的文字是「我的網站」": `h1` 目前的文字是「別的標題」。/);
    expect(problems).toMatch(/exercise badge: the typical mistake "少了 `display: inline-block`，行內元素的 `width` 與 `height` 不會生效。" passes the check/);
    expect(problems).toMatch(/exercise greet: the starter already passes/);
  }, 60_000);
});
