import type { WebExample, WebExercise, WebLessonContent } from '@/lib/webcode/lesson';

/*
 * WEB-0: small pages for the web-code tests (not a lesson): a whole document, a styled fragment, a page with a script,
 * and one exercise per kind of file a learner edits (HTML, CSS, JavaScript with a variant).
 */
export const structureExample = (): WebExample => ({
  id: 'structure', title: '一份完整的 HTML 文件', description: '有 `<!DOCTYPE html>`、`head` 與 `body` 的最小文件。',
  files: { html: '<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>\n  <title>島上的第一頁</title>\n</head>\n<body>\n  <header><h1>程式邏輯島</h1></header>\n  <main><p class="intro">從這裡開始。</p></main>\n</body>\n</html>' },
  observe: [
    { check: 'doctype', label: '文件以標準模式顯示' },
    { check: 'attr', selector: 'html', name: 'lang', value: 'zh-Hant', label: 'html 的 lang 是 zh-Hant' },
    { check: 'text', selector: 'title', text: '島上的第一頁', label: '標題在 head 裡的 title' },
    { check: 'count', selector: 'head > title', count: 1, label: 'title 是 head 的子元素' },
    { check: 'count', selector: 'body > header > h1', count: 1, label: 'h1 在 header 裡' },
  ],
});
export const styledExample = (): WebExample => ({
  id: 'styled', title: '加上樣式', description: '樣式表決定元素的顏色與盒子的大小。',
  files: { html: '<p class="note">注意</p>\n<div class="box"></div>', css: 'body { margin: 0; }\n.note { color: red; font-weight: bold; margin: 0; }\n.box { width: 120px; height: 40px; padding: 10px; border: 5px solid black; }' },
  observe: [
    { check: 'style', selector: '.note', property: 'color', value: '#ff0000', label: '文字是紅色' },
    { check: 'style', selector: '.note', property: 'font-weight', value: 'bold', label: '文字是粗體' },
    { check: 'box', selector: '.box', measure: 'width', value: 150, label: '盒子連同留白與邊框寬 150px' },
    { check: 'box', selector: '.box', measure: 'height', value: 70, label: '盒子連同留白與邊框高 70px' },
  ],
});
export const counterExample = (): WebExample => ({
  id: 'counter', title: '按鈕與事件', description: '每按一次按鈕，JavaScript 就把數字加一。',
  files: { html: '<button id="add" type="button">加一</button>\n<output id="count">0</output>',
    js: "const out = document.querySelector('#count');\nlet n = 0;\ndocument.querySelector('#add').addEventListener('click', () => {\n  n += 1;\n  out.textContent = String(n);\n  console.log('count', n);\n});" },
  observe: [
    { check: 'text', selector: '#count', text: '0', label: '一開始是 0' },
    { do: 'click', selector: '#add' },
    { do: 'click', selector: '#add' },
    { check: 'text', selector: '#count', text: '2', label: '按兩次之後是 2' },
    { check: 'console', lines: ['count 1', 'count 2'], label: '每次點擊都印出目前的數字' },
  ],
});

export const headingExercise = (): WebExercise => ({
  id: 'heading', title: '加上主標題', statement: '把「我的網站」改成頁面唯一的主標題（`h1`），下面保留一段文字。',
  hints: ['主標題用 `h1` 元素。', '一頁只放一個 `h1`。'], explanation: '`h1` 是頁面的主標題；段落用 `p`。',
  starter: { html: '<p>我的網站</p>\n<p>歡迎光臨。</p>' },
  solution: { html: '<h1>我的網站</h1>\n<p>歡迎光臨。</p>' },
  steps: [
    { check: 'count', selector: 'h1', count: 1, label: '頁面有一個 h1' },
    { check: 'text', selector: 'h1', text: '我的網站', label: 'h1 的文字是「我的網站」' },
    { check: 'count', selector: 'p', count: 1, op: 'min', label: '至少有一個段落' },
  ],
  mistakes: [
    { files: { html: '<h2>我的網站</h2>\n<p>歡迎光臨。</p>' }, why: '`h2` 是次標題，不是頁面的主標題。' },
    { files: { html: '<h1>我的網站</h1>\n<h1>歡迎光臨。</h1>' }, why: '把每一行都做成 `h1`，頁面就有兩個主標題，也沒有段落了。' },
  ],
});
export const badgeExercise = (): WebExercise => ({
  id: 'badge', title: '做一個徽章', statement: '讓 `.badge` 寬 80px、高 24px，背景是 `navy`、文字是白色。',
  hints: ['寬與高用 `width` 與 `height`。', '背景色是 `background-color`，文字顏色是 `color`。'], explanation: '盒子的大小與顏色都由樣式表決定，HTML 不用改。',
  fixed: { html: '<span class="badge">新</span>' },
  starter: { css: '.badge {\n  display: inline-block;\n}' },
  solution: { css: '.badge {\n  display: inline-block;\n  width: 80px;\n  height: 24px;\n  background-color: navy;\n  color: white;\n}' },
  steps: [
    { check: 'box', selector: '.badge', measure: 'width', value: 80, label: '寬 80px' },
    { check: 'box', selector: '.badge', measure: 'height', value: 24, label: '高 24px' },
    { check: 'style', selector: '.badge', property: 'background-color', value: 'navy', label: '背景是 navy' },
    { check: 'style', selector: '.badge', property: 'color', value: 'white', label: '文字是白色' },
  ],
  mistakes: [{ files: { css: '.badge {\n  width: 80px;\n  height: 24px;\n  background-color: navy;\n  color: white;\n}' }, why: '少了 `display: inline-block`，行內元素的 `width` 與 `height` 不會生效。' }],
});
export const greetExercise = (): WebExercise => ({
  id: 'greet', title: '打招呼', statement: '按下按鈕後，把輸入框裡的名字放進 `#hello`，寫成「你好，名字！」。',
  hints: ['用 `addEventListener` 監聽按鈕的 `click`。', '輸入框的內容在 `value`。'], explanation: '在事件處理函式裡才讀 `value`，讀到的才是按下去那一刻的內容。',
  fixed: { html: '<input id="name" value="小安">\n<button id="go" type="button">打招呼</button>\n<p id="hello"></p>' },
  starter: { js: "const button = document.querySelector('#go');\n" },
  solution: { js: "const button = document.querySelector('#go');\nbutton.addEventListener('click', () => {\n  const name = document.querySelector('#name').value;\n  document.querySelector('#hello').textContent = `你好，${name}！`;\n});" },
  steps: [
    { check: 'text', selector: '#hello', text: '', label: '按下之前是空的' },
    { do: 'click', selector: '#go' },
    { check: 'text', selector: '#hello', text: '你好，小安！', label: '按下之後向輸入框裡的名字打招呼' },
    { do: 'input', selector: '#name', value: '阿明' },
    { do: 'click', selector: '#go' },
    { check: 'text', selector: '#hello', text: '你好，阿明！', label: '改了名字再按，招呼跟著改' },
  ],
  mistakes: [
    { files: { js: "const name = document.querySelector('#name').value;\ndocument.querySelector('#go').addEventListener('click', () => {\n  document.querySelector('#hello').textContent = `你好，${name}！`;\n});" }, why: '在載入時就讀了 `value`，之後改名字也不會變。' },
    { files: { js: "document.querySelector('#hello').textContent = '你好，小安！';" }, why: '沒有等按鈕被按下就寫入，而且名字是寫死的。' },
  ],
  variants: [{ title: '另一個預設名字', fixed: { html: '<input id="name" value="海龜">\n<button id="go" type="button">打招呼</button>\n<p id="hello"></p>' },
    steps: [{ do: 'click', selector: '#go' }, { check: 'text', selector: '#hello', text: '你好，海龜！', label: '向另一個名字打招呼' }] }],
});

export const webContent = (): WebLessonContent => ({ examples: [structureExample(), styledExample(), counterExample()], exercises: [headingExercise(), badgeExercise(), greetExercise()] });
