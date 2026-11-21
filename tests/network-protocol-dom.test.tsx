// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NetworkExerciseBox, NetworkSceneView } from '@/components/curriculum/network-protocol';
import { httpThroughRouter, previewExercises, previewScenes, switchLearning, tcpHandshake } from '@/content/network/preview-scenes';

/*
 * CN-0: the network-protocol component. Every message is a button in order; the stepper, the arrow keys and choosing a
 * message move the same step; the step's explanation is announced; the packet lists the current message's headers
 * from the outermost layer in; node tables say which rows the message changed; exercises are checked from the scenes.
 */
afterEach(cleanup);
const note = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')!;

describe('NetworkSceneView', () => {
  it('lists the nodes and every message in order, with the first step announced', () => {
    const { container } = render(<NetworkSceneView scene={tcpHandshake}/>);
    expect(within(screen.getByRole('list', { name: '網路中的節點' })).getAllByRole('listitem').map(li => li.querySelector('strong')!.textContent)).toEqual(['用戶端', '伺服器']);
    const steps = within(screen.getByRole('list', { name: '訊息順序（共 4 則）' })).getAllByRole('button');
    expect(steps.map(b => b.textContent)).toEqual(['SYN1. 用戶端 → 伺服器：SYN（遺失）', 'SYN（重送）2. 用戶端 → 伺服器：SYN（重送）', 'SYN, ACK3. 伺服器 → 用戶端：SYN, ACK', 'ACK4. 用戶端 → 伺服器：ACK']);
    expect(steps.map(b => b.getAttribute('aria-current'))).toEqual(['step', null, null, null]);
    expect(note(container).textContent).toMatch(/^步驟 1／4：用戶端 → 伺服器（SYN，遺失）/);
  });
  it('moves with the stepper, the arrow keys and a chosen message, and shows that message\'s headers', () => {
    const { container } = render(<NetworkSceneView scene={tcpHandshake}/>);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(note(container).textContent).toMatch(/^步驟 2／4/);
    fireEvent.keyDown(screen.getByRole('button', { name: /下一步/ }), { key: 'End' });
    expect(note(container).textContent).toMatch(/^步驟 4／4：用戶端 → 伺服器（ACK）/);
    fireEvent.click(screen.getByRole('button', { name: /3\. 伺服器 → 用戶端/ }));
    expect(note(container).textContent).toMatch(/Ack 是 1000 \+ 1 = 1001/);
    const packet = screen.getByRole('region', { name: /這則訊息的各層標頭/ });
    // Outermost first: the IP header wraps the TCP header.
    expect([...packet.querySelectorAll('[data-layer]')].map(e => e.getAttribute('data-layer'))).toEqual(['network', 'transport']);
    expect(within(packet).getByText('Ack').nextSibling?.textContent).toBe('1001');
    expect(within(packet).getByText('SYN, ACK')).toBeTruthy();
  });
  it('shows the payload innermost and the router\'s rewritten link header', () => {
    render(<NetworkSceneView scene={httpThroughRouter}/>);
    fireEvent.click(screen.getByRole('button', { name: /2\. 路由器 R1 → 網頁伺服器/ }));
    const packet = screen.getByRole('region', { name: /這則訊息的各層標頭/ });
    expect([...packet.querySelectorAll('[data-layer]')].map(e => e.getAttribute('data-layer'))).toEqual(['link', 'network', 'transport', 'application']);
    expect(within(packet).getByText('TTL').nextSibling?.textContent).toBe('63');
    expect(within(packet).getByText('來源 MAC').nextSibling?.textContent).toBe('02:00:00:00:01:01');
    expect(packet.querySelector('code')!.textContent).toContain('GET /index.html');
    expect(screen.getByRole('table', { name: '路由器 R1：路由表（這一步之後）' })).toBeTruthy();
  });
  it('marks the table rows a message added', () => {
    render(<NetworkSceneView scene={switchLearning}/>);
    fireEvent.click(screen.getByRole('button', { name: /3\. 主機 B → 交換器/ }));
    const table = screen.getByRole('table', { name: '交換器：MAC 位址表（這一步之後）' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(r => r.hasAttribute('data-changed'))).toEqual([false, true]);
    expect(rows[1].textContent).toContain('這一步新增或更新');
  });
});

describe('NetworkExerciseBox', () => {
  it('checks a field answer and explains a wrong one', () => {
    render(<NetworkExerciseBox exercise={previewExercises[0]} scenes={previewScenes}/>);
    fireEvent.change(screen.getByRole('textbox', { name: '欄位的值' }), { target: { value: '64' } });
    fireEvent.click(screen.getByRole('button', { name: '檢查答案' }));
    expect(screen.getByText(/還沒通過/)).toBeTruthy();
    expect(screen.getByText(/「欄位的值」不對/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '欄位的值' }), { target: { value: '63' } });
    fireEvent.click(screen.getByRole('button', { name: '檢查答案' }));
    expect(screen.getByText('正確。')).toBeTruthy();
  });
  it('asks for a layer with one radio button per layer of the scene\'s model', () => {
    render(<NetworkExerciseBox exercise={previewExercises[1]} scenes={previewScenes}/>);
    const group = screen.getByRole('group', { name: '所在的層' });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    fireEvent.click(within(group).getByRole('radio', { name: /傳輸層/ }));
    fireEvent.click(screen.getByRole('button', { name: '檢查答案' }));
    expect(screen.getByText('正確。')).toBeTruthy();
  });
  it('takes the three subnet values', () => {
    render(<NetworkExerciseBox exercise={previewExercises[2]} scenes={previewScenes}/>);
    for (const [name, value] of [['網路位址', '192.0.2.128'], ['廣播位址', '192.0.2.191'], ['可用主機數', '62']]) fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '檢查答案' }));
    expect(screen.getByText('正確。')).toBeTruthy();
  });
});
