'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * §6.1: one primary action per screen. `primary` is that action; everything
 * else is quiet by construction.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-card font-medium transition-transform duration-feedback ' +
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg',
        quiet: 'border border-border bg-surface text-fg',
        ghost: 'text-muted hover:text-fg',
        danger: 'border border-border bg-surface text-expense',
      },
      size: {
        md: 'h-11 px-4 text-body',
        lg: 'h-14 px-5 text-body',
        sm: 'h-9 px-3 text-label',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'quiet', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
