'use client';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SITE_TIMES, SITE_TIME_LABELS, setSiteTime, useSiteTime, type SiteTime } from '@/lib/site-time';

const ICONS: Record<SiteTime, typeof Sun> = { morning: Sunrise, noon: Sun, sunset: Sunset, dusk: Moon };

/** The light / dark switch, now four times of day: 清晨、中午、黃昏 are light, 傍晚 is dark (src/lib/site-time.ts). */
export function ThemeToggle(){
  const time=useSiteTime();
  const next=SITE_TIMES[(SITE_TIMES.indexOf(time)+1)%SITE_TIMES.length];
  const Icon=ICONS[time];
  return <Button size="icon" variant="ghost" aria-label={`時間：${SITE_TIME_LABELS[time]}（按一下切換到${SITE_TIME_LABELS[next]}）`} title={`${SITE_TIME_LABELS[time]} → ${SITE_TIME_LABELS[next]}`}
    onClick={()=>setSiteTime(next)}><Icon size={19}/></Button>;
}
