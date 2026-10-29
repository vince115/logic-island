import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]', { variants: { variant: { default: 'bg-[var(--accent)] text-white hover:brightness-110', outline: 'border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--soft)]', ghost: 'hover:bg-[var(--soft)]' }, size: { default: 'h-10 px-4', sm: 'h-9 px-3', icon: 'h-10 w-10' } }, defaultVariants: { variant: 'default', size: 'default' } });
function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) { const Comp = asChild ? Slot : 'button'; return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />; }
export { Button, buttonVariants };
