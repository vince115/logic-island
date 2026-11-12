import { courses, getCourse } from '@/content/courses';
import { getLessonById } from '@/content/curriculum';
import type { IslandId } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { databaseIsland, islands, labIsland } from '@/lib/islands/data';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import { IslandsWorldExplorer } from '@/components/islands/hex-world/islands-world-explorer';
// The home page opens on the 3D archipelago (the explorer of /islands/candidate); only navigation metadata crosses the client boundary.
// Phase F.2: 資料庫應用島 joins the map after 互動實驗島, so the four islands keep their numbers in the list. An island of
// the Phase F plan opens lesson by lesson: the world registry says how many are written and where its syllabus is.
const fromPlan=(id:string)=>{
  const record=getIsland(id),anchor=record?.entryPoints.find(e=>e.target.startsWith('/curriculum#'))?.target;
  return record&&anchor?{published:{open:lessonsOfIsland(id).filter(l=>l.lessonStatus==='complete').length,total:record.lessonCount},
    curriculumHref:anchor as `/curriculum#${string}`}:{};
};
const learningIslands=[...islands,labIsland,databaseIsland].map(island=>({...island,...(island.id===databaseIsland.id?fromPlan(island.id):{}),lessons:island.courseSlugs.map(slug=>{
  const course=getCourse(slug);
  if(!course) throw new Error(`Unknown island course: ${slug}`);
  return {slug:course.slug,title:course.title,subtitle:course.subtitle};
}),
// Each island is a subject area: its curriculum lessons by unit, shown when the island is chosen.
units:UNITS[island.id as IslandId]?.map(unit=>({title:unit.title,summary:unit.summary,lessons:unit.lessonIds.map(id=>{
  const lesson=getLessonById(id);
  if(!lesson) throw new Error(`Unknown curriculum lesson: ${id}`);
  return {id,slug:lesson.slug,title:lesson.title};
})})),
// 互動實驗島: the labs of /learn, grouped by course category in course order.
labGroups:island.id===labIsland.id?[...new Set(courses.map(c=>c.category))].map(title=>({title,
  labs:courses.filter(c=>c.category===title).map(c=>({slug:c.slug,title:c.title,subtitle:c.subtitle}))})):undefined}));
export default function Home(){return <main id="main"><h1 className="visually-hidden">Logic Island 程式邏輯島</h1><div className="home-world"><IslandsWorldExplorer islands={learningIslands} layout="fullscreen" islandInAddress/></div></main>;}
