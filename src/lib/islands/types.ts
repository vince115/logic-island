import type { Course } from '@/content/courses';

export type Vec3 = [number, number, number];
export type IslandModelId = 'beacon-workshop' | 'data-harbor' | 'algorithm-observatory';
export interface IslandBounds { min: Vec3; max: Vec3 }
export interface IslandDefinition {
  id: string;
  name: string;
  englishName: string;
  description: string;
  landmark: string;
  modelId: IslandModelId;
  position: Vec3;
  bounds: IslandBounds;
  accent: string;
  courseSlugs: Course['slug'][];
  catalogEntry?: { href: '/learn'; label: string };
}
export interface LearningLink { slug: Course['slug']; title: string; subtitle: string }
export interface LearningIsland extends IslandDefinition { lessons: LearningLink[] }
