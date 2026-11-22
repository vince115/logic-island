// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stepper } from '@/components/curriculum/visualizations';

/*
 * 2026-11-22: a step change can disable the focused button (下一步 on the last step, 上一步 and 重來 on the first). A
 * browser then drops focus to the page and the arrow keys and Home stop working, which the network preview's keyboard
 * E2E caught under load. The stepper keeps focus in its group, on the button that still works.
 */
afterEach(cleanup);
function Harness() {
  const [at, set] = useState(0);
  return <Stepper at={at} count={4} set={set}/>;
}
const button = (name: RegExp) => screen.getByRole('button', { name });

describe('Stepper keeps keyboard focus in its group', () => {
  it('moves focus to 上一步 when End disables 下一步, and back to 下一步 when Home disables 上一步', () => {
    render(<Harness/>);
    button(/下一步/).focus();
    fireEvent.keyDown(button(/下一步/), { key: 'End' });
    expect(screen.getByText('步驟 4／4')).toBeTruthy();
    expect(button(/下一步/).getAttribute('disabled')).not.toBeNull();
    expect(document.activeElement).toBe(button(/上一步/));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByText('步驟 1／4')).toBeTruthy();
    expect(document.activeElement).toBe(button(/下一步/));
  });
  it('keeps focus after a click that reaches the last step, and leaves focus alone when it was elsewhere', () => {
    render(<><input aria-label="other"/><Harness/></>);
    button(/下一步/).focus();
    fireEvent.click(button(/下一步/));
    fireEvent.click(button(/下一步/));
    fireEvent.click(button(/下一步/));
    expect(screen.getByText('步驟 4／4')).toBeTruthy();
    expect(document.activeElement).toBe(button(/上一步/));
    const other = screen.getByRole('textbox', { name: 'other' });
    other.focus();
    fireEvent.click(button(/重來/));
    expect(document.activeElement).toBe(other);
  });
});
