// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lab } from '../src/components/lab';
import { courses } from '../src/content/courses';

const course = courses.find(c => c.slug === 'array')!;
const button = (name: string) => screen.getByRole('button', { name });
const progress = () => screen.getByRole('slider', { name: '播放進度' }) as HTMLInputElement;
const description = () => document.querySelector('.step-description')!.textContent;
const values = () => Array.from(document.querySelectorAll('.cell')).map(cell => cell.textContent);
const tick = (ms = 850) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('共用播放器 DOM 整合（不等同瀏覽器 E2E）', () => {
  it.each(courses)('$title 前進後退還原相同文字、資料與操作標記', c => {
    render(<Lab course={c} />);
    fireEvent.click(button('下一步'));
    const snapshot = { description: description(), values: values(), active: document.querySelectorAll('.cell.colored').length, progress: progress().value };
    fireEvent.click(button('下一步'));
    fireEvent.click(button('上一步'));
    expect({ description: description(), values: values(), active: document.querySelectorAll('.cell.colored').length, progress: progress().value }).toEqual(snapshot);
  });

  it('到最後一步立即停止，停留後不再改變', () => {
    render(<Lab course={course} />);
    fireEvent.click(button('播放'));
    tick(); tick();
    expect(progress().value).toBe(progress().max);
    expect(button('播放')).toBeTruthy();
    expect((button('下一步') as HTMLButtonElement).disabled).toBe(true);
    const last = description();
    tick(5000);
    expect(description()).toBe(last);
  });

  it('播放中暫停，時間推進不會移動游標', () => {
    render(<Lab course={course} />);
    fireEvent.click(button('播放')); tick();
    fireEvent.click(button('暫停'));
    const step = progress().value;
    tick(4000);
    expect(progress().value).toBe(step);
  });

  it('重置會取消舊計時，且能重新播放與完成後重播', () => {
    render(<Lab course={course} />);
    fireEvent.click(button('播放')); tick();
    fireEvent.click(button('重置')); tick(2000);
    expect(progress().value).toBe('0');
    expect(button('播放')).toBeTruthy();
    fireEvent.click(button('播放')); tick(); tick();
    expect(progress().value).toBe(progress().max);
    fireEvent.click(button('播放'));
    expect(progress().value).toBe('0');
    tick();
    expect(progress().value).toBe('1');
  });

  it('播放中套用新輸入，重建步驟、取消舊計時並回到起點', () => {
    render(<Lab course={course} />);
    fireEvent.click(button('播放')); tick();
    fireEvent.change(screen.getByLabelText('輸入資料'), { target: { value: '10, 20, 30' } });
    fireEvent.change(screen.getByLabelText('操作'), { target: { value: 'update' } });
    fireEvent.change(screen.getByLabelText('新值'), { target: { value: '99' } });
    fireEvent.click(button('套用輸入'));
    expect(progress().value).toBe('0');
    expect(progress().max).toBe('3');
    expect(values()).toEqual(['10', '20', '30']);
    tick(2000);
    expect(progress().value).toBe('0');
    fireEvent.click(button('下一步'));
    expect(description()).toContain('值 30');
    fireEvent.click(button('下一步'));
    expect(values()).toEqual(['10', '20', '99']);
    fireEvent.click(button('上一步'));
    expect(values()).toEqual(['10', '20', '30']);
  });

  it('錯誤輸入不覆蓋原有步驟，且可修正後繼續', () => {
    render(<Lab course={course} />);
    fireEvent.click(button('下一步'));
    fireEvent.change(screen.getByLabelText('輸入資料'), { target: { value: 'oops' } });
    fireEvent.click(button('套用輸入'));
    expect(screen.getByRole('alert').textContent).toContain('整數');
    expect(progress().value).toBe('1');
    expect(values()).toEqual(['8', '3', '6', '2', '7', '4']);
    fireEvent.change(screen.getByLabelText('輸入資料'), { target: { value: '1,2,3' } });
    fireEvent.click(button('套用輸入'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(progress().value).toBe('0');
  });

  it('更改速度後採用新間隔，語言切換不改變步驟', () => {
    render(<Lab course={course} />);
    fireEvent.change(screen.getByLabelText('速度'), { target: { value: '2' } });
    fireEvent.click(button('播放')); tick(424);
    expect(progress().value).toBe('0');
    tick(1);
    expect(progress().value).toBe('1');
    for (const language of ['C++', 'Java', 'Python']) {
      fireEvent.click(button(language));
      expect(button(language).getAttribute('aria-pressed')).toBe('true');
      expect(progress().value).toBe('1');
    }
  });
});
