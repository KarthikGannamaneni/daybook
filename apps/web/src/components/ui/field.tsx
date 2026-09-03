'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const TextField = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-card border border-border bg-surface px-3 text-body placeholder:text-muted',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-label text-muted">
      {children}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}
