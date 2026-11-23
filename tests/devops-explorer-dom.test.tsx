// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeploymentHistoryView, DevopsExerciseBox, RolloutSimulatorView } from '@/components/curriculum/devops-explorer';
import { DEVOPS_EXERCISE_NOTICE, DEVOPS_LOGS_NOTICE, devopsExerciseNotice, DevopsExerciseView, devopsExamples } from '@/components/curriculum/devops-lesson';
import { devopsContent, devopsLesson, exercises, histories, rollouts } from './support/devops-fixture';
import { MonitoringDashboardView } from '@/components/curriculum/dashboard-view';
import { dashboardContent, dashboardExercises, dashboardLesson, dashboards } from './support/dashboard-fixture';
import { LogViewer } from '@/components/curriculum/log-viewer';
import { logExercises, logExplorers, logsContent, logsLesson } from './support/logs-fixture';

/*
 * CICD-0: the devops-explorer components. The history view states the four DORA metrics with their arithmetic, draws the
 * deployments as an SVG with a table of the same records, and describes the selected deployment; the rollout view
 * re-simulates when the strategy or its parameters change, draws three charts with a per-minute table, and steps through
 * the minutes with the keyboard; exercises are checked against values computed from the data. Every control is labelled.
 */
afterEach(cleanup);
const live = (container: HTMLElement) => [...container.querySelectorAll('[aria-live="polite"]')].map(e => e.textContent).join('\n');
const history = (id: string) => histories().find(h => h.id === id)!;
const rollout = (id: string) => rollouts().find(r => r.id === id)!;
const exercise = (id: string) => exercises().find(e => e.id === id)!;

describe('DeploymentHistoryView', () => {
  it('shows the DORA metrics with their arithmetic, says the data is illustrative, and has a table for the chart', () => {
    const { container } = render(<DeploymentHistoryView explorer={history('team-a')}/>);
    const metrics = within(screen.getByLabelText('DORA 指標'));
    expect(metrics.getByText('部署頻率').nextElementSibling!.textContent).toBe('每週 2.5 次5 次 × 7 ÷ 14 天；有部署的日子 5 天');
    expect(metrics.getByText('變更前置時間（中位數）').nextElementSibling!.textContent).toContain('2 小時');
    expect(metrics.getByText('變更失敗率').nextElementSibling!.textContent).toBe('40%2 次造成故障 ÷ 5 次部署');
    expect(metrics.getByText('失敗部署復原時間（中位數）').nextElementSibling!.textContent).toBe('1 小時 23 分鐘偵測時間中位數 18 分鐘');
    expect(container.textContent).toContain('示意資料');
    const chart = screen.getByRole('img');
    expect(chart.querySelector('title')!.textContent).toMatch(/14 天內 5 次部署，其中 2 次造成故障/);
    expect(chart.querySelectorAll('g[data-failed]')).toHaveLength(2);
    const table = screen.getByRole('table', { name: '部署紀錄（時間軸的文字版）' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).getByRole('rowheader', { name: 'd3' }).parentElement!.textContent).toBe('d3第 4 天 10:00330、90、600正常——');
    // The median: 8 lead times, the middle two marked.
    expect([...container.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['120', '120']);
    expect(container.textContent).toContain('共 8 個（偶數），中位數是中間兩個的平均，四捨五入到整數分鐘：120。');
  });
  it('describes the deployment chosen with the keyboard-operable select', () => {
    const { container } = render(<DeploymentHistoryView explorer={history('team-a')}/>);
    expect(live(container)).toContain('部署 d1 在第 1 天 10:00上線，包含 2 個變更，前置時間 2 小時、1 小時。');
    fireEvent.change(screen.getByLabelText('選擇一次部署'), { target: { value: '3' } });
    expect(live(container)).toContain('部署 d4 在第 8 天 14:00上線，包含 1 個變更，前置時間 4 小時。');
    expect(live(container)).toContain('造成故障：第 8 天 15:00開始，20 分鐘後偵測到，2 小時後恢復服務。');
    expect(screen.getByRole('img').querySelector('g[data-selected]')!.hasAttribute('data-failed')).toBe(true);
    expect(screen.getByRole('rowheader', { name: 'd4' }).parentElement!.hasAttribute('data-current')).toBe(true);
  });
});

describe('RolloutSimulatorView', () => {
  it('simulates the lesson\'s strategy and states the totals', () => {
    const { container } = render(<RolloutSimulatorView explorer={rollout('checkout')}/>);
    expect(live(container)).toContain('滾動更新（maxSurge 1、maxUnavailable 0）：第 8 分鐘完成；maxSurge = 1 個、maxUnavailable = 0 個。');
    const totals = within(screen.getByLabelText('整段時間的總計'));
    expect(totals.getByText('錯誤的請求').nextElementSibling!.textContent).toBe('15v1 5、v2 10');
    expect(totals.getByText('同時執行的尖峰').nextElementSibling!.textContent).toBe('5 個平常是 4 個');
    expect(totals.getByText('額外的執行個體分鐘').nextElementSibling!.textContent).toBe('8超過 4 個的部分逐分鐘加總');
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getAllByRole('img')[0].querySelector('title')!.textContent).toMatch(/虛線是平常的 4 個，尖峰 5 個/);
    const table = screen.getByRole('table', { name: '每分鐘的執行個體、請求、錯誤與事件' });
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(within(table).getByRole('rowheader', { name: '2' }).parentElement!.textContent).toBe('23（3）2（1）依就緒數750250000移除 1 個 v1；啟動 1 個 v2（第 4 分鐘就緒）');
  });
  it('re-simulates when the strategy or its parameters change, and refuses impossible parameters', () => {
    const { container } = render(<RolloutSimulatorView explorer={rollout('checkout')}/>);
    fireEvent.change(screen.getByLabelText('部署策略'), { target: { value: 'recreate' } });
    expect(within(screen.getByLabelText('整段時間的總計')).getByText('丟棄的請求').nextElementSibling!.textContent).toBe('2,0002 分鐘容量不足或沒有可用的執行個體');
    fireEvent.change(screen.getByLabelText('部署策略'), { target: { value: 'rolling' } });
    fireEvent.change(screen.getByLabelText('maxSurge（個數或 %）'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('maxUnavailable（個數或 %）'), { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toMatch(/不能同時是 0/);
    expect(screen.getByLabelText('maxSurge（個數或 %）').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('maxUnavailable（個數或 %）'), { target: { value: '1' } });
    expect(within(screen.getByLabelText('整段時間的總計')).getByText('丟棄的請求').nextElementSibling!.textContent).toMatch(/^800/);
    fireEvent.change(screen.getByLabelText('部署策略'), { target: { value: 'canary' } });
    fireEvent.change(screen.getByLabelText('步驟（流量%/觀察分鐘）'), { target: { value: '25/2, 100/2' } });
    expect(live(container)).toContain('金絲雀發布（25%／2 分 → 100%／2 分）：第 8 分鐘完成');
    expect(screen.getByRole('table', { name: '閘門的判定（新版本在觀察期間的請求）' }).textContent).toContain('第 1 步2–350012‰200 ms通過');
    fireEvent.click(screen.getByRole('button', { name: /恢復課程的設定/ }));
    expect((screen.getByLabelText('部署策略') as HTMLSelectElement).value).toBe('rolling');
  });
  it('rolls back when the gate fails, and promotes the faulty version with the gate switched off', () => {
    const { container } = render(<RolloutSimulatorView explorer={rollout('bad-canary')}/>);
    expect(live(container)).toContain('第 4 分鐘回滾（第 1 步的閘門未通過）');
    expect(screen.getByRole('table', { name: /閘門的判定/ }).textContent).toContain('未通過');
    fireEvent.click(screen.getByLabelText(/啟用閘門/));
    expect(live(container)).toContain('第 8 分鐘完成');
  });
  it('steps through the minutes with the stepper and the arrow keys, announcing each minute', () => {
    const { container } = render(<RolloutSimulatorView explorer={rollout('schema')}/>);
    expect(live(container)).toContain('第 0 分鐘：執行中 5 個——v1 4 個（就緒 4）、v2 1 個（就緒 0、啟動中 1）。');
    expect(live(container)).toContain('這一分鐘：結構變更（擴充）：新增欄位 full_name；啟動 1 個 v2（第 2 分鐘就緒）。');
    const next = screen.getByRole('button', { name: /下一步/ });
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(live(container)).toContain('第 2 分鐘：');
    fireEvent.click(next); fireEvent.click(next); fireEvent.click(next);
    expect(live(container)).toContain('第 5 分鐘：');
    expect(live(container)).toContain('資料庫缺少v1需要的欄位，它承接的請求全部失敗。');
    fireEvent.keyDown(next, { key: 'End' });
    expect(live(container)).toContain('第 9 分鐘：');
    expect(screen.getByRole('rowheader', { name: '9' }).parentElement!.hasAttribute('data-current')).toBe(true);
    fireEvent.keyDown(screen.getByRole('button', { name: /上一步/ }), { key: 'Home' });
    expect(live(container)).toContain('第 0 分鐘：');
  });
  it('lists the flag schedule and its exposure in the minute description', () => {
    const { container } = render(<RolloutSimulatorView explorer={rollout('flag')}/>);
    expect(container.textContent).toContain('功能旗標「新結帳流程」在 v2 的程式裡，走新功能的請求錯誤率 100‰；開放比例：第 0 分鐘 0%、第 6 分鐘 20%');
    fireEvent.keyDown(screen.getByRole('button', { name: /下一步/ }), { key: 'End' });
    expect(live(container)).toContain('功能旗標開放：新結帳流程 20%。');
  });
});

describe('devops exercises', () => {
  const content = devopsContent();
  it('checks a number answer by value', () => {
    render(<DevopsExerciseBox exercise={exercise('x-per-week')} content={content}/>);
    const input = screen.getByLabelText('每週部署次數');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/還沒通過/)).toBeTruthy();
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
  });
  it('checks a choice and a table', () => {
    const { unmount } = render(<DevopsExerciseBox exercise={exercise('x-best')} content={content}/>);
    fireEvent.click(screen.getByLabelText('B 團隊'));
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
    unmount();
    render(<DevopsExerciseBox exercise={exercise('x-canary')} content={content}/>);
    fireEvent.change(screen.getByLabelText('第 1 步觀察期間 v2 的錯誤'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('回滾的分鐘'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByRole('list').textContent).toBe('還沒有填「中止的步驟」。');
    fireEvent.change(screen.getByLabelText('中止的步驟'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
  });
  it('simulates a rollout plan with the learner\'s parameters and shows the result', () => {
    const { container } = render(<DevopsExerciseBox exercise={exercise('x-plan')} content={content}/>);
    expect(container.textContent).toContain('條件：丟棄的請求最多 0；同時執行的執行個體最多 5；在第 8 分鐘以前完成。');
    fireEvent.change(screen.getByLabelText(/^maxSurge/), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^maxUnavailable/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(live(container)).toContain('丟棄的請求有 800，超過上限 0。');
    expect(live(container)).toContain('你的設定模擬的結果：完成（第 8 分鐘）；錯誤 14、丟棄 800、尖峰 4 個、額外的執行個體分鐘 0。');
    fireEvent.change(screen.getByLabelText(/^maxSurge/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^maxUnavailable/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
  });
  it('shows computed reference answers in the exercise view, and the lesson\'s explorers by id', () => {
    const { container } = render(<DevopsExerciseView exercise={exercise('x-dora')} content={content}/>);
    expect(container.textContent).toContain('變更前置時間中位數（分鐘）：120 分鐘');
    expect(container.textContent).toContain('失敗部署復原時間中位數（分鐘）：83 分鐘');
    cleanup();
    const plan = render(<DevopsExerciseView exercise={exercise('x-plan')} content={content}/>);
    expect(plan.container.textContent).toContain('其中一種設定：滾動更新（maxSurge 1、maxUnavailable 0）；模擬結果：錯誤 15、丟棄 0、尖峰 5 個、額外的執行個體分鐘 8，第 8 分鐘完成。');
    expect(devopsExamples(devopsLesson()).map(([id]) => id)).toEqual(['team-a', 'team-b', 'checkout', 'bad-canary', 'schema', 'flag']);
  });
});

describe('MonitoringDashboardView (D3)', () => {
  const dash = (id: string) => dashboards().find(d => d.id === id)!;
  const summary = () => within(screen.getByLabelText('告警規則的結果'));
  const card = (dt: string) => summary().getByText(dt).nextElementSibling!.textContent;
  it('draws one line chart per series with a table of the same numbers, and shades the incidents', () => {
    const { container } = render(<MonitoringDashboardView explorer={dash('api')}/>);
    expect(container.textContent).toContain('示意資料');
    const charts = [...container.querySelectorAll('svg[data-series]')];
    expect(charts.map(c => c.getAttribute('data-series'))).toEqual(['p95', 'rpm', 'errors', 'cpu']);
    for (const c of charts) expect(c.querySelectorAll('rect[class*="incident"]')).toHaveLength(2);
    expect(charts[2].querySelector('title')!.textContent).toMatch(/^「錯誤率」（錯誤，單位 ‰）每分鐘的值，最大 \d+（第 \d+ 分鐘）；底色是 2 次事故的期間；虛線是告警門檻 10。數字見下方表格$/);
    // The threshold is drawn on the rule's series only.
    expect(charts.map(c => !!c.querySelector('[data-threshold]'))).toEqual([false, false, true, false]);
    const table = screen.getByRole('table', { name: '「錯誤率」每分鐘的值（‰，圖的文字版，每列 10 分鐘）' });
    expect(within(table).getAllByRole('row')).toHaveLength(19);
    expect(within(table).getByRole('rowheader', { name: '100–109' }).parentElement!.children[1].textContent).toBe('29');
  });
  it('evaluates the lesson\'s rule, and re-evaluates when the rule is chosen or edited', () => {
    const { container } = render(<MonitoringDashboardView explorer={dash('api')}/>);
    expect([card('通知'), card('誤報'), card('偵測到的事故')]).toEqual(['3 次每次進入觸發中發一次', '1 次觸發期間沒有和任何事故重疊', '2 個漏掉 0 個']);
    const intervals = screen.getByRole('table', { name: '觸發的期間（每一列是一次通知）' });
    expect(within(intervals).getByRole('rowheader', { name: '2' }).parentElement!.textContent).toBe('2第 100 分鐘（第 101 分鐘恢復）誤報');
    fireEvent.change(screen.getByLabelText('課程的規則'), { target: { value: 'slow' } });
    expect((screen.getByLabelText('視窗長度（分鐘）') as HTMLInputElement).value).toBe('10');
    expect([card('通知'), card('誤報')]).toEqual(['2 次每次進入觸發中發一次', '0 次觸發期間沒有和任何事故重疊']);
    expect(screen.getByRole('table', { name: '每個事故：第一次觸發與偵測延遲' }).textContent).toContain('有問題的版本第 60 分鐘第 66 分鐘6 分鐘');
    expect(container.querySelector('svg[data-series="errors"] path[class*="overlay"]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('視窗計算'), { target: { value: 'none' } });
    fireEvent.change(screen.getByLabelText('持續多久才觸發（分鐘）'), { target: { value: '1' } });
    expect((screen.getByLabelText('課程的規則') as HTMLSelectElement).value).toBe('');
    expect([card('通知'), card('誤報')]).toEqual(['2 次每次進入觸發中發一次', '0 次觸發期間沒有和任何事故重疊']);
    expect(screen.getByRole('table', { name: '每個事故：第一次觸發與偵測延遲' }).textContent).toContain('資料庫連線耗盡第 130 分鐘第 132 分鐘2 分鐘');
    fireEvent.change(screen.getByLabelText('指標'), { target: { value: 'cpu' } });
    fireEvent.change(screen.getByLabelText('門檻（整數）'), { target: { value: '70' } });
    expect(screen.getByRole('table', { name: '每個事故：第一次觸發與偵測延遲' }).textContent).toContain('有問題的版本第 60 分鐘沒有觸發（漏掉）');
    expect(container.querySelector('svg[data-series="cpu"] [data-threshold="70"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /恢復課程的規則/ }));
    expect((screen.getByLabelText('指標') as HTMLSelectElement).value).toBe('errors');
  });
  it('flags a rule it cannot evaluate and draws no state strip', () => {
    render(<MonitoringDashboardView explorer={dash('tiny')}/>);
    fireEvent.change(screen.getByLabelText('門檻（整數）'), { target: { value: '5.5' } });
    expect(screen.getByRole('alert').textContent).toBe('「門檻（整數）」要填 0 以上的整數。');
    expect(screen.getByLabelText('門檻（整數）').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('門檻（整數）').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(screen.queryByLabelText('告警規則的結果')).toBeNull();
    fireEvent.change(screen.getByLabelText('門檻（整數）'), { target: { value: '5' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('steps through the minutes with the keyboard, describing each minute and its alert state', () => {
    const { container } = render(<MonitoringDashboardView explorer={dash('tiny')}/>);
    fireEvent.change(screen.getByLabelText('課程的規則'), { target: { value: 'patient' } });
    expect(live(container)).toContain('第 0 分鐘：錯誤率 1 ‰。條件不成立，告警狀態：未觸發。沒有進行中的事故。');
    const next = screen.getByRole('button', { name: /下一步/ });
    for (let k = 0; k < 4; k++) fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(live(container)).toContain('第 4 分鐘：錯誤率 9 ‰。條件成立，告警狀態：等待中。事故「結帳失敗」進行中。');
    fireEvent.click(next);
    expect(live(container)).toContain('告警狀態：觸發中。');
    expect(container.querySelector('svg rect[data-state="firing"]')).toBeTruthy();
    fireEvent.keyDown(next, { key: 'End' });
    expect(live(container)).toContain('第 11 分鐘：');
    fireEvent.keyDown(screen.getByRole('button', { name: /上一步/ }), { key: 'Home' });
    expect(live(container)).toContain('第 0 分鐘：');
    fireEvent.change(screen.getByLabelText('課程的規則'), { target: { value: 'smooth' } });
    expect(live(container)).toContain('規則的值（3 分鐘的視窗）還沒有（視窗未滿），條件不成立');
    expect(screen.getByRole('table', { name: '每段相同狀態的分鐘' }).querySelector('tbody')!.textContent).toBe('第 0–3 分鐘未觸發第 4–6 分鐘觸發中第 7 分鐘已恢復第 8–11 分鐘未觸發');
  });
  it('shows the incident timeline with the computed times and the severity cell marked', () => {
    render(<MonitoringDashboardView explorer={dash('api')}/>);
    const a = within(screen.getByRole('region', { name: '事故時間線：有問題的版本' }));
    expect(a.getByRole('table', { name: '「有問題的版本」的事件（依時間）' }).textContent).toContain('62偵測到錯誤率告警觸發');
    const times = within(a.getByLabelText('「有問題的版本」的時間'));
    expect(times.getByText('偵測時間').nextElementSibling!.textContent).toBe('2 分鐘偵測到 − 開始');
    expect(times.getByText('恢復時間').nextElementSibling!.textContent).toBe('8 分鐘恢復 − 開始（影響的期間）');
    const matrix = a.getByRole('table', { name: /嚴重等級矩陣/ });
    expect([...matrix.querySelectorAll('td[data-at]')].map(c => c.textContent)).toEqual(['SEV2']);
  });
});

describe('the alert-rule exercise (D3)', () => {
  const content = dashboardContent();
  const ex = (id: string) => dashboardExercises().find(e => e.id === id)!;
  it('evaluates the learner\'s rule and states the result', () => {
    const { container } = render(<DevopsExerciseBox exercise={ex('x-rule')} content={content}/>);
    expect(container.textContent).toContain('條件：每個事故都在開始後 3 分鐘內觸發；誤報最多 0 次。');
    fireEvent.change(screen.getByLabelText('指標'), { target: { value: 'errors' } });
    fireEvent.change(screen.getByLabelText('比較'), { target: { value: '>' } });
    fireEvent.change(screen.getByLabelText('門檻（整數）'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('持續多久才觸發（分鐘）'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(live(container)).toContain('誤報有 1 次，超過上限 0。');
    expect(live(container)).toContain('你的規則評估的結果：通知 3 次、誤報 1 次、漏掉 0 個事故；偵測延遲 有問題的版本 0 分鐘、資料庫連線耗盡 1 分鐘。');
    fireEvent.change(screen.getByLabelText('持續多久才觸發（分鐘）'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
  });
  it('checks a golden-signal table, and shows computed reference answers and the dashboards by id', () => {
    render(<DevopsExerciseBox exercise={ex('x-signals')} content={content}/>);
    for (const [label, v] of [['p95 延遲', '延遲'], ['每分鐘請求', '流量'], ['錯誤率', '錯誤'], ['資料庫 CPU', '飽和度']]) fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
    cleanup();
    const view = render(<DevopsExerciseView exercise={ex('x-rule')} content={content}/>);
    expect(view.container.textContent).toContain('其中一條規則：錯誤率（‰） > 10，持續 1 分鐘才觸發；評估結果：通知 2 次、誤報 0 次、漏掉 0 個事故；偵測延遲 有問題的版本 1 分鐘、資料庫連線耗盡 2 分鐘');
    cleanup();
    const sev = render(<DevopsExerciseView exercise={ex('x-incident')} content={content}/>);
    expect(sev.container.textContent).toContain('嚴重等級：SEV2');
    expect(devopsExamples(dashboardLesson()).map(([id]) => id)).toEqual(['tiny', 'api', 'api-slow']);
  });
});

describe('LogViewer (D4)', () => {
  const logs = (id: string) => logExplorers().find(x => x.id === id)!;
  const resultsTable = () => screen.getByRole('table', { name: '符合篩選的紀錄（依時間，每頁 20 筆）' });
  const rowNumbers = () => within(resultsTable()).getAllByRole('rowheader').map(h => h.textContent);
  it('lists the records a page at a time, says the data is illustrative, and pages with buttons', () => {
    const { container } = render(<LogViewer explorer={logs('shop')}/>);
    expect(container.textContent).toContain('示意資料');
    expect(container.textContent).toContain('409 筆紀錄，從 0:02 到 14:57（時間是從開始算起的分:秒）；服務：catalog、gateway、orders、payments；等級：除錯 0、資訊 403、警告 1、錯誤 5。');
    expect(container.textContent).toContain('其中 400 筆是以固定種子產生的一般流量。');
    expect(live(container)).toContain('符合的紀錄 409 筆（共 409 筆）；第 1／21 頁，第 1–20 筆。');
    expect(rowNumbers()).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: '最後一頁' }));
    expect(live(container)).toContain('第 21／21 頁，第 401–409 筆。');
    expect(rowNumbers()).toEqual(['401', '402', '403', '404', '405', '406', '407', '408', '409']);
    expect((screen.getByRole('button', { name: '下一頁' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '上一頁' }));
    expect(rowNumbers()[0]).toBe('381');
  });
  it('filters by level, service, a field and a time range, and counts the groups', () => {
    const { container } = render(<LogViewer explorer={logs('small')}/>);
    fireEvent.change(screen.getByLabelText('最低等級'), { target: { value: 'warn' } });
    expect(rowNumbers()).toEqual(['4', '5', '6']);
    expect(within(resultsTable()).getByRole('rowheader', { name: '4' }).parentElement!.textContent).toContain('0:03paymentspay-1錯誤（error）charge failed');
    fireEvent.change(screen.getByLabelText('最低等級'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('服務'), { target: { value: 'gateway' } });
    expect(rowNumbers()).toEqual(['1', '3', '6', '7', '9']);
    fireEvent.change(screen.getByLabelText('欄位'), { target: { value: 'status' } });
    fireEvent.change(screen.getByLabelText('比較'), { target: { value: '>=' } });
    fireEvent.change(screen.getByLabelText('值'), { target: { value: '500' } });
    expect(rowNumbers()).toEqual(['6']);
    fireEvent.click(screen.getByRole('button', { name: /清除篩選/ }));
    fireEvent.change(screen.getByLabelText('從（秒或 分:秒）'), { target: { value: '0:02' } });
    fireEvent.change(screen.getByLabelText('到（不含）'), { target: { value: '6' } });
    expect(live(container)).toContain('符合的紀錄 4 筆（共 9 筆）');
    const groups = () => screen.getByRole('table', { name: /^符合篩選的紀錄依/ });
    expect(within(groups()).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual(['gateway250%', 'orders125%', 'payments125%']);
    fireEvent.change(screen.getByLabelText('分組依據'), { target: { value: 'status' } });
    expect(within(groups()).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual(['502250%', '200125%', '（沒有這個欄位）125%']);
  });
  it('flags a filter it cannot read and lists no records', () => {
    render(<LogViewer explorer={logs('small')}/>);
    fireEvent.change(screen.getByLabelText('欄位'), { target: { value: 'status' } });
    fireEvent.change(screen.getByLabelText('比較'), { target: { value: '>' } });
    fireEvent.change(screen.getByLabelText('值'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('從（秒或 分:秒）'), { target: { value: '1:99' } });
    expect(screen.getByRole('alert').textContent).toBe('「>」只能和整數比較。「從」要寫成秒數或「分:秒」（例如 12:05）。');
    expect(screen.getByLabelText('值').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('值').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(screen.queryByRole('table', { name: /符合篩選的紀錄/ })).toBeNull();
  });
  it('follows a request by its correlation id with the seconds between records', () => {
    const { container } = render(<LogViewer explorer={logs('small')}/>);
    const select = screen.getByLabelText('request_id（關聯 ID）') as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(['r-1', 'r-4']);
    expect(live(container)).toContain('request_id = r-1：5 筆紀錄，經過的服務依序是 gateway → orders → payments → orders → gateway；從第一筆到最後一筆 5 秒；第一個錯誤在 payments（0:03）。');
    const trace = screen.getByRole('table', { name: 'request_id = r-1 的紀錄（依時間；Δ 是和前一筆相差的秒數）' });
    expect(within(trace).getAllByRole('row').slice(1).map(r => [...r.children].slice(1, 5).map(c => c.textContent).join(' '))).toEqual([
      '0:00 — 0 gateway', '0:01 +1 1 orders', '0:03 +2 3 payments', '0:04 +1 4 orders', '0:05 +1 5 gateway']);
    fireEvent.change(select, { target: { value: 'r-4' } });
    expect(live(container)).toContain('request_id = r-4：2 筆紀錄，經過的服務依序是 auth → gateway；從第一筆到最後一筆 1 秒；沒有錯誤。');
  });
  it('masks with the editor\'s rules, shows the redacted lines and what is still seen or lost, and flags bad rules', () => {
    const { container } = render(<LogViewer explorer={logs('small')}/>);
    const rules = screen.getByLabelText(/^遮蔽規則/) as HTMLTextAreaElement;
    expect(rules.value).toBe('field password');
    const checks = () => [...screen.getByLabelText('遮蔽的結果').querySelectorAll('li')].map(li => `${li.textContent}${li.hasAttribute('data-bad') ? ' ✗' : ''}`);
    expect(checks()).toEqual(['必須隱藏「amy@example.com」：仍看得到（第 4 筆紀錄的 message） ✗', '必須隱藏「4111 1111 1111 1111」：仍看得到（第 4 筆紀錄的 message） ✗',
      '必須隱藏「tok_9f8e7d6c5b4a」：仍看得到（第 4 筆紀錄的 authorization） ✗', '必須隱藏「hunter2」：已隱藏', '必須保留「r-1」：仍保留', '必須保留「A-1001」：仍保留', '必須保留「/checkout」：仍保留', '必須保留「u-7」：仍保留']);
    fireEvent.change(rules, { target: { value: 'pattern email\npattern card\npattern token\nfield password' } });
    expect(live(container)).toContain('4 條規則改動了 5 個值（訊息、欄位或原始行）。');
    expect(checks().filter(x => x.endsWith('✗'))).toEqual([]);
    const lines = screen.getByLabelText('遮蔽後的日誌').textContent!;
    expect(lines).toContain('"message":"charge failed for *** card ***"');
    expect(lines).toContain('2026-11-24 10:00:03 ERROR payment failed for ***');
    expect(lines).not.toContain('hunter2');
    fireEvent.change(rules, { target: { value: 'pattern digits' } });
    expect(checks()).toContain('必須保留「A-1001」：被遮掉了（剩 0／4 次） ✗');
    fireEvent.change(rules, { target: { value: 'pattern phone' } });
    expect(screen.getByRole('alert').textContent).toBe('第 1 行：沒有「phone」這個樣式，可以用 email、card、token、ipv4、digits。');
    expect(rules.getAttribute('aria-invalid')).toBe('true');
    expect(rules.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(screen.queryByLabelText('遮蔽的結果')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /恢復課程的規則/ }));
    expect(rules.value).toBe('field password');
  });
  it('shows the raw lines with their parsed format on demand', () => {
    render(<LogViewer explorer={logs('small')}/>);
    expect(screen.getByRole('table', { name: '程式直接印出的日誌行' }).querySelectorAll('tbody tr')).toHaveLength(4);
    expect(screen.getByText('解析的結果（每一行是不是結構化的）').parentElement!.textContent).toContain('l3：結構化（key=value），4 個欄位');
  });
});

describe('the D4 exercises', () => {
  const content = logsContent();
  const ex = (id: string) => logExercises().find(e => e.id === id)!;
  it('checks masking rules in the redact exercise and says what they did', () => {
    const { container } = render(<DevopsExerciseBox exercise={ex('l-redact')} content={content}/>);
    expect(container.textContent).toContain('必須隱藏：「amy@example.com」、「4111 1111 1111 1111」、「tok_9f8e7d6c5b4a」、「hunter2」；必須保留：「r-1」、「A-1001」、「/checkout」、「u-7」。');
    const rules = screen.getByLabelText(/^遮蔽規則/);
    fireEvent.change(rules, { target: { value: 'pattern email\npattern card\npattern token' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(live(container)).toContain('遮蔽後，第 8 筆紀錄的 password仍看得到必須隱藏的「hunter2」。');
    expect(live(container)).toContain('你的規則改動了 4 個值（訊息、欄位或原始行）。');
    fireEvent.change(rules, { target: { value: 'pattern email\npattern card\npattern token\nfield password' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
  });
  it('checks a correlate table and shows computed reference answers and the log viewers by id', () => {
    const box = render(<DevopsExerciseBox exercise={ex('l-trace')} content={content}/>);
    expect(box.container.textContent).toContain('日誌的時間寫成「分:秒」或秒數');
    expect(box.container.textContent).not.toContain('時間一律換算成分鐘');
    fireEvent.change(screen.getByLabelText('依序經過的服務'), { target: { value: 'gateway, orders, payments, orders, gateway' } });
    fireEvent.change(screen.getByLabelText('從第一筆到最後一筆（秒）'), { target: { value: '5 秒' } });
    fireEvent.change(screen.getByLabelText('第一個出錯的服務'), { target: { value: 'payments' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(screen.getByText(/正確/)).toBeTruthy();
    cleanup();
    const view = render(<DevopsExerciseView exercise={ex('l-trace')} content={content}/>);
    expect(view.container.textContent).toContain('依序經過的服務：gateway → orders → payments → orders → gateway');
    cleanup();
    const red = render(<DevopsExerciseView exercise={ex('l-redact')} content={content}/>);
    expect(red.container.querySelector('pre')!.textContent).toBe('pattern email\npattern card\npattern token\nfield password');
    expect(red.container.textContent).toContain('改動了 5 個值；必須隱藏的 4 個值都看不到，必須保留的 4 個值都還在。');
    expect(devopsExamples(logsLesson()).map(([id]) => id)).toEqual(['small', 'shop', 'masking']);
    // A lesson with logs gets the logs notice; the others (CICD01) keep the earlier notice word for word.
    expect(devopsExerciseNotice(content)).toBe(DEVOPS_LOGS_NOTICE);
    expect(devopsExerciseNotice(devopsContent())).toBe(DEVOPS_EXERCISE_NOTICE);
    expect(DEVOPS_EXERCISE_NOTICE).toContain('時間一律以分鐘計');
  });
});
