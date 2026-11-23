// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeploymentHistoryView, DevopsExerciseBox, RolloutSimulatorView } from '@/components/curriculum/devops-explorer';
import { DevopsExerciseView, devopsExamples } from '@/components/curriculum/devops-lesson';
import { devopsContent, devopsLesson, exercises, histories, rollouts } from './support/devops-fixture';

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
