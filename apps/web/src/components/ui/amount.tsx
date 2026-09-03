'use client';

import { useEffect, useRef } from 'react';
import { Money } from '@khata/shared';
import { cn } from '@/lib/utils';

/**
 * §6.2: the running total counts up to its new value in ~250 ms.
 *
 * Hand-rolled on requestAnimationFrame rather than an animation library: this
 * is on the home screen, and the home screen has a bundle budget (§10.6). The
 * intermediate frames run on a plain number; the value at rest is always
 * rendered straight from the bigint, so nothing is ever rounded into view.
 */
export function AnimatedTotal({
  minor,
  currency,
  locale,
  className,
  testId,
}: {
  minor: string;
  currency: string;
  locale: string;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<string>(minor);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const from = Number(previous.current);
    const to = Number(minor);
    previous.current = minor;

    const exact = Money.fromMinor(minor, currency).formatCompact(locale);
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
      node.textContent = exact;
      return;
    }

    let frame = 0;
    const started = performance.now();
    const duration = 250;

    const tick = (now: number) => {
      const progress = Math.min((now - started) / duration, 1);
      // easeOutCubic: fast first, settles softly.
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (to - from) * eased);
      node.textContent = Money.fromMinor(BigInt(value), currency).formatCompact(locale);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else node.textContent = exact;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [minor, currency, locale]);

  return (
    <span ref={ref} data-testid={testId} className={cn('tabular', className)}>
      {Money.fromMinor(minor, currency).formatCompact(locale)}
    </span>
  );
}

export function AmountText({
  minor,
  currency,
  locale,
  type,
  className,
}: {
  minor: string;
  currency: string;
  locale: string;
  type: 'expense' | 'income';
  className?: string;
}) {
  return (
    <span
      className={cn('tabular font-semibold', type === 'income' ? 'text-income' : 'text-expense', className)}
    >
      {type === 'income' ? '+' : '−'}
      {Money.fromMinor(minor, currency).formatCompact(locale)}
    </span>
  );
}
