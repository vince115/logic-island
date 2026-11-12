import { AppShell } from '@/components/nav/app-shell';

// 2026-11-12: 互動實驗島 shares the sidebar (category → lab).
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="labs">{children}</AppShell>;
}
