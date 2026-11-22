// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmbeddingSpaceView, LlmExerciseBox, placeLabels, SamplingExplorerView, TokenExplorerView } from '@/components/curriculum/llm-explorer';
import { documentSpace, exercises, sampler, tokenizer, tokenSpace } from './support/llm-fixture';

/*
 * LLM-0: the llm-explorer components. The token view lists coloured token chips with their ids, steps through the merges
 * with the shared stepper and re-encodes what the learner types; the sampling view's bars follow temperature, top-k and
 * top-p, and generation steps token by token with the seeded generator; the embedding view's scatter plot has a table
 * as its text alternative; exercises are checked by value. Every control is labelled and keyboard operable.
 */
afterEach(cleanup);
const live = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')!;
const chips = (name: RegExp) => within(screen.getByRole('list', { name })).getAllByRole('listitem');

describe('TokenExplorerView', () => {
  it('shows the final tokens with their ids, says the data is illustrative, and decodes back to the text', () => {
    const { container } = render(<TokenExplorerView explorer={tokenizer()}/>);
    const tokens = chips(/^第 6 步之後的 token（共 7 個）/);
    expect(tokens.map(t => t.querySelector('span')!.textContent)).toEqual(['low', 'e', 'r', '␣學<0xE7>', '<0x94>', '<0x9F>', '<|endoftext|>']);
    expect(tokens[0].textContent).toContain('ID 257');
    expect(tokens[6].hasAttribute('data-special')).toBe(true);
    expect(container.textContent).toContain('示意資料');
    expect(container.textContent).toContain('字元 21 個 · UTF-8 位元組 25 個 · token 7 個（合併 6 步）');
    // The stepper counts merges, not states: the last state reads 合併 6／6, matching 合併 6 步 (not 合併 7／7).
    expect(container.textContent).toMatch(/合併 6／6|尚未合併（共 6 步）/);
    expect(container.textContent).toContain('257 101 114 262 148 159 264');
    expect(container.textContent).toContain('（與原文相同）');
    expect(container.textContent).toContain('7 × 0.5 ÷ 1,000 = 0.0035 元');
  });
  it('steps through the merges with the stepper and the keyboard, announcing each merge', () => {
    const { container } = render(<TokenExplorerView explorer={tokenizer()}/>);
    fireEvent.keyDown(screen.getByRole('button', { name: /上一步/ }), { key: 'Home' });
    expect(chips(/^第 0 步之後的 token（共 13 個）/)).toHaveLength(13);
    expect(live(container).textContent).toMatch(/還沒有合併：每個位元組是一個 token/);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(live(container).textContent).toMatch(/第 1 步：套用第 0 條規則（ID 256）l ＋ o → lo，合併 1 處，剩 12 個 token/);
    expect(chips(/^第 1 步之後/).filter(t => t.hasAttribute('data-new')).map(t => t.querySelector('span')!.textContent)).toEqual(['lo']);
  });
  it('re-encodes typed text and presets, and shows each token\'s bytes on request', () => {
    render(<TokenExplorerView explorer={tokenizer()}/>);
    fireEvent.change(screen.getByLabelText('要斷詞的文字'), { target: { value: '學校' } });
    expect(chips(/共 6 個/).map(t => t.querySelector('span')!.textContent)).toEqual(['<0xE5>', '<0xAD>', '<0xB8>', '<0xE6>', '<0xA0>', '<0xA1>']);
    fireEvent.click(screen.getByRole('button', { name: 'low␣low' }));
    expect(screen.getByRole('button', { name: 'low␣low' }).getAttribute('aria-pressed')).toBe('true');
    expect(chips(/共 2 個/).map(t => t.querySelector('span')!.textContent)).toEqual(['low', '␣low']);
    fireEvent.click(screen.getByLabelText(/顯示每個 token 的位元組/));
    expect(chips(/共 2 個/)[1].textContent).toContain('20 6C 6F 77');
  });
});

describe('SamplingExplorerView', () => {
  const bars = () => chips(/候選 token/).map(li => [li.querySelector('span')!.textContent, li.querySelector('[class*="barText"]')!.firstChild!.textContent]);
  it('shows the distribution and reacts to temperature, top-k and top-p', () => {
    render(<SamplingExplorerView explorer={sampler()}/>);
    expect(bars()).toEqual([['很好', '66.5%'], ['不錯', '24.5%'], ['很糟', '9.0%']]);
    fireEvent.change(screen.getByLabelText(/^temperature/), { target: { value: '0.5' } });
    expect(bars()).toEqual([['很好', '86.7%'], ['不錯', '11.7%'], ['很糟', '1.6%']]);
    fireEvent.change(screen.getByLabelText(/^top-k/), { target: { value: '1' } });
    expect(bars()).toEqual([['很好', '100.0%'], ['不錯', '刪去（top-k）'], ['很糟', '刪去（top-k）']]);
    fireEvent.click(screen.getByRole('button', { name: /恢復預設設定/ }));
    fireEvent.change(screen.getByLabelText('上文'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^top-p/), { target: { value: '0.8' } });
    expect(bars()).toEqual([['。', '62.5%'], ['，', '37.5%'], ['！', '刪去（top-p）']]);
    fireEvent.change(screen.getByLabelText(/^temperature/), { target: { value: '0' } });
    expect(bars()[1]).toEqual(['，', '不選（greedy）']);
  });
  it('generates token by token with the seed, and the same seed gives the same tokens', () => {
    const { container } = render(<SamplingExplorerView explorer={sampler()}/>);
    const note = () => live(container).textContent!;
    expect(note()).toMatch(/從提示「今天 天氣」開始/);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(note()).toMatch(/第 1 個 token：上文「天氣」，抽到 u = 0\.6011，選中「很好」/);
    expect(note()).toMatch(/很好 \[0\.000, 0\.665\)、不錯 \[0\.665, 0\.910\)、很糟 \[0\.910, 1\.000\)/);
    fireEvent.keyDown(screen.getByRole('button', { name: /下一步/ }), { key: 'End' });
    expect(chips(/目前的文字/).map(t => t.querySelector('span')!.textContent)).toEqual(['今天', '天氣', '很好', '。', '<|endoftext|>']);
    expect(note()).toMatch(/生成了結束 token，停止/);
    const seed = screen.getByLabelText(/亂數種子/);
    fireEvent.change(seed, { target: { value: 'abc' } });
    expect(seed.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toMatch(/目前仍使用 42/);
    fireEvent.change(seed, { target: { value: '42' } });
    expect(chips(/目前的文字/).map(t => t.querySelector('span')!.textContent)).toEqual(['今天', '天氣', '很好', '。', '<|endoftext|>']);
  });
});

describe('EmbeddingSpaceView', () => {
  it('draws a labelled scatter plot with a similarity table and a coordinate table as its text alternative', () => {
    render(<EmbeddingSpaceView explorer={documentSpace()}/>);
    const plot = screen.getByRole('img');
    expect(plot.querySelector('title')!.textContent).toMatch(/選取「通勤時遇到交通延誤」，最相近的是 「早上的火車誤點了」/);
    expect(plot.querySelectorAll('circle')).toHaveLength(4);
    expect(plot.querySelectorAll('rect')).toHaveLength(1);
    const table = screen.getByRole('table', { name: /和「通勤時遇到交通延誤」的餘弦相似度/ });
    expect(within(table).getAllByRole('row').slice(1).map(r => within(r).getByRole('rowheader').textContent)).toEqual(['早上的火車誤點了', '今天下午會下大雨', '這家店的蛋糕很好吃', '我家的貓喜歡睡覺']);
    expect(screen.getByRole('table', { name: '每個向量的各維度數值與投影後的座標' })).toBeTruthy();
  });
  it('changes the compared item and the metric with labelled controls', () => {
    render(<EmbeddingSpaceView explorer={tokenSpace()}/>);
    fireEvent.change(screen.getByLabelText('比較對象'), { target: { value: 'car' } });
    const first = () => within(screen.getByRole('table', { name: /和「汽車」的/ })).getAllByRole('row')[1];
    expect(within(first()).getByRole('rowheader').textContent).toBe('火車');
    fireEvent.click(screen.getByLabelText('內積'));
    expect(screen.getByRole('table', { name: /和「汽車」的內積/ })).toBeTruthy();
    expect(first().textContent).toContain('1.350');
  });
});

describe('LlmExerciseBox', () => {
  const [tokens, count, , ids, , , , nearestSentence] = exercises();
  const verdict = (container: HTMLElement) => live(container).textContent;
  it('checks a field answer by value and explains a wrong one', () => {
    const { container } = render(<LlmExerciseBox exercise={tokens}/>);
    fireEvent.change(screen.getByLabelText('token'), { target: { value: 'l|o|w|e|r' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(verdict(container)).toMatch(/還沒通過：「token」不對/);
    fireEvent.change(screen.getByLabelText('token'), { target: { value: 'low | e | r' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(verdict(container)).toBe('正確。');
    fireEvent.click(screen.getByRole('button', { name: /清除/ }));
    expect((screen.getByLabelText('token') as HTMLInputElement).value).toBe('');
  });
  it('checks numbers, tables and choices', () => {
    const a = render(<LlmExerciseBox exercise={count}/>);
    fireEvent.change(screen.getByLabelText('token 數'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(verdict(a.container)).toBe('正確。');
    a.unmount();
    const b = render(<LlmExerciseBox exercise={ids}/>);
    fireEvent.change(screen.getByLabelText(/token ID/), { target: { value: '257 258' } });
    fireEvent.change(screen.getByLabelText(/位元組數/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(verdict(b.container)).toMatch(/「「學生」的位元組數」不對/);
    b.unmount();
    const c = render(<LlmExerciseBox exercise={nearestSentence}/>);
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(verdict(c.container)).toMatch(/還沒有選擇答案/);
    fireEvent.click(screen.getByLabelText('早上的火車誤點了'));
    fireEvent.click(screen.getByRole('button', { name: /檢查答案/ }));
    expect(verdict(c.container)).toBe('正確。');
  });
});

describe('scatter plot labels', () => {
  it('moves a label off a neighbour it would cover (蘋果 and 香蕉 a few pixels apart) and keeps every label inside the plot', () => {
    const at = placeLabels([{ id: 'a', x: 160, y: 60, label: '蘋果' }, { id: 'b', x: 166, y: 64, label: '香蕉' }, { id: 'c', x: 300, y: 20, label: 'token' }]);
    expect(at.a).toEqual({ x: 160, y: 51, anchor: 'middle' });
    expect(at.b).not.toEqual({ x: 166, y: 55, anchor: 'middle' });
    const box = (p: { x: number; y: number; anchor: string }, w: number) => { const l = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'start' ? p.x : p.x - w; return [l, l + w, p.y - 10, p.y + 2]; };
    const [al, ar, at2, ab] = box(at.a, 22), [bl, br, bt, bb] = box(at.b, 22);
    expect(ar <= bl || al >= br || ab <= bt || at2 >= bb).toBe(true);
    expect(at.c.anchor).not.toBe('start');
    // No label covers another point's marker (蘋果's dot under 香蕉's label was the bug seen in the browser).
    const [cl, cr, ct, cb] = box(at.b, 22);
    expect(cr <= 154 || cl >= 166 || cb <= 54 || ct >= 66).toBe(true);
  });
});
