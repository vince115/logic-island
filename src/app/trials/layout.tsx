import { AppShell } from '@/components/nav/app-shell';
import { trialsEnabled } from '@/lib/trials/flag';

// 2026-11-12: the trial pages share the sidebar (family → exam → papers); a build without the trial system has no shell.
export default function TrialsLayout({ children }: { children: React.ReactNode }) {
  return trialsEnabled() ? <AppShell area="trials">{children}</AppShell> : children;
}
