import { AppShell } from '@/components/nav/app-shell';

// R6: a region's overview shares the curriculum sidebar; its region node holds the 群島總覽 entry.
export default function RegionsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="curriculum">{children}</AppShell>;
}
