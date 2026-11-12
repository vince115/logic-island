import { CurriculumCatalog } from '@/components/curriculum/catalog';
import { lessons } from '@/content/curriculum';

export const metadata = { title: `完整課綱 · ${lessons.length} 堂課`, description: '完整課綱（Curriculum）：基礎程式島、資料結構島、演算法島各 20 堂，依建議順序排列，C++、Java、Python、JavaScript 四語對照；資料庫應用島的 SQL 課程在瀏覽器裡直接執行。' };
export default function Page() { return <CurriculumCatalog/>; }
