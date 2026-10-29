'use client';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
const subscribe=(callback:()=>void)=>{window.addEventListener('theme-change',callback);return()=>window.removeEventListener('theme-change',callback);};
export function ThemeToggle(){const dark=useSyncExternalStore(subscribe,()=>document.documentElement.dataset.theme==='dark',()=>false);return <Button size="icon" variant="ghost" aria-label={dark?'切換淺色模式':'切換深色模式'} onClick={()=>{const theme=dark?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('logiclab-theme',theme);}catch{}window.dispatchEvent(new Event('theme-change'));}}>{dark?<Sun size={19}/>:<Moon size={19}/>}</Button>;}
