import type { Metadata } from 'next';
import { Catalog } from '@/components/catalog';
import { courses } from '@/content/courses';
import { openLabText } from '@/content/world/labs';

// P1-38: the numbers and the algorithm labs' names come from the lab registry, the same source as the page's own summary
// and the world's central hub; a planned lab is not counted.
const labs = openLabText();
export const metadata: Metadata = { title: '互動實驗島', description: `互動實驗島（Interactive Lab Island）：${labs.short}（${labs.detail}）。演算法實驗（${courses.map(c => c.title).join('、')}）自己輸入資料、逐步播放，並對照 C++、Java、Python、JavaScript 程式碼；工具實驗即時調整設定並觀察結果。` };
// 互動實驗島 (Interactive Lab Island): every lab, by learning domain (Phase E.5; multi-archipelago v2 P4). /visualize redirects here; the introduction moved to /curriculum.
export default function Page() { return <Catalog/>; }
