import { AppShell } from '@/components/nav/app-shell';

// 2026-11-12: the curriculum pages share the sidebar (island → level → lesson).
export default function CurriculumLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="curriculum">{children}</AppShell>;
}
