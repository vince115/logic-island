import { P9World } from '@/components/p9/p9-world';
import { subjectIslands } from '@/content/world';
import { hubSummary, regionSummaries } from '@/lib/world/learning-islands';

/**
 * P9 world overview as the home page (`/`), in a build made with LOGIC_ISLAND_P9_PROTOTYPE=1 only: the same P9World
 * and scene /p9 drew, with the same registry data. /p9 now redirects here; the region pages stay under /p9/<region>.
 */
export function P9Home() {
  return <main id="main"><h1 className="visually-hidden">Logic Island 世界群島</h1>
    <P9World regions={regionSummaries()} hub={hubSummary()} accents={Object.fromEntries(subjectIslands.map(island => [island.id, island.theme.accent]))}/></main>;
}
