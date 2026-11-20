import { PRESENCE } from './config';
import type { PopulationSnapshot } from './engine';
import type { PopulationSource } from './flag';
import { MOCK_STEP_MS, mockSnapshot, parseSnapshot } from './population';

/**
 * Where a map's population numbers come from (browser only). `live`: the presence API, asked every `pollMs` while the
 * page is visible. `mock`: generated numbers (population.ts), with a hook for reviews and tests:
 * `window.__logicIslandPopulation.set({ foundations: 12 })` fixes the islands' counts, `.set(null)` returns to the
 * generated ones. The hook exists only on a page whose build chose the mock source.
 */
type Listener = (snapshot: PopulationSnapshot) => void;
interface MockHook { set: (islands: Record<string, number> | null) => void }

export function watchPopulation(source: PopulationSource, onChange: Listener): () => void {
  let timer: number | undefined, stopped = false;
  if (source === 'mock') {
    let override: Record<string, number> | undefined;
    const emit = () => { if (!stopped) onChange(mockSnapshot(Date.now(), override)); };
    const holder = window as typeof window & { __logicIslandPopulation?: MockHook };
    holder.__logicIslandPopulation = { set: islands => { override = islands ?? undefined; emit(); } };
    emit();
    timer = window.setInterval(emit, MOCK_STEP_MS / 4);
    return () => { stopped = true; window.clearInterval(timer); delete holder.__logicIslandPopulation; };
  }
  const ask = async () => {
    if (stopped || document.visibilityState !== 'visible') return;
    try {
      const response = await fetch(PRESENCE.endpoint, { credentials: 'omit' });
      const snapshot = response.ok ? parseSnapshot(await response.json()) : null;
      if (snapshot && !stopped) onChange(snapshot);
    } catch { /* offline: keep the last numbers */ }
  };
  const visible = () => { if (document.visibilityState === 'visible') void ask(); };
  document.addEventListener('visibilitychange', visible);
  void ask();
  timer = window.setInterval(() => void ask(), PRESENCE.pollMs);
  return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
}
