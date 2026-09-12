'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { invalidateLedger } from '@/lib/ledger-cache';
import { haptic } from '@/lib/utils';

/**
 * P1 #2: the due-today proposal card.
 *
 * It sits above the composer and it *proposes*. Confirming is a tap; nothing is
 * ever written without one. A ledger that posts entries nobody confirmed stops
 * being a record of what happened and becomes a forecast.
 */
export function RecurringDueCard() {
  const t = useTranslations('recurring');
  const { businessId, repo, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);
  const { currency, locale } = bootstrap.business;

  const dueQuery = useQuery({
    queryKey: ['recurring', businessId, 'due'],
    queryFn: () => repo.listDueRecurring(businessId),
  });

  const refresh = () => invalidateLedger(queryClient);

  const confirm = useMutation({
    mutationFn: (id: string) => repo.confirmRecurring(id),
    onSuccess: async () => {
      haptic(10);
      await refresh();
      show({ message: t('confirmed'), durationMs: 2500 });
    },
    onError: (err: Error) => setError(err.message),
  });

  const skip = useMutation({
    mutationFn: (id: string) => repo.skipRecurring(id),
    onSuccess: async () => {
      await refresh();
      show({ message: t('skipped'), durationMs: 2500 });
    },
    onError: (err: Error) => setError(err.message),
  });

  const due = dueQuery.data ?? [];
  if (due.length === 0) return null;

  const busy = confirm.isPending || skip.isPending;

  return (
    <section className="card p-4" aria-label={t('dueTitle')} data-testid="recurring-due">
      <p className="flex items-center gap-1.5 text-label text-muted">
        <CalendarClock className="h-4 w-4" aria-hidden />
        {t('dueTitle')}
      </p>

      <ul className="mt-2 divide-y divide-border">
        {due.map((item) => (
          <li key={item.id} className="py-3" data-testid="recurring-due-row">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-body">
                  {item.note || item.category_name || item.party_name || '—'}
                </span>
                <span className="block text-label text-muted">
                  {[item.category_name, item.account_name].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="tabular text-body font-semibold">
                {Money.fromMinor(item.amount_minor, currency).formatCompact(locale)}
              </span>
            </div>

            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                data-testid="recurring-confirm"
                disabled={busy}
                onClick={() => confirm.mutate(item.id)}
              >
                {t('confirm')}
              </Button>
              <Button
                variant="quiet"
                size="md"
                data-testid="recurring-skip"
                disabled={busy}
                onClick={() => skip.mutate(item.id)}
              >
                {t('skip')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-label text-muted">{t('dueHint')}</p>
      )}
    </section>
  );
}
