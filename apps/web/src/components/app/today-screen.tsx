'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Money } from '@khata/shared';
import { useApp, useBusiness } from '@/components/providers';
import { AnimatedTotal } from '@/components/ui/amount';
import { Skeleton } from '@/components/ui/field';
import { pendingEntries, type QueuedCreate } from '@/lib/offline/queue';
import { dayKey } from '@/lib/utils';
import { Composer } from './composer';
import { RecurringDueCard } from './recurring-card';
import { EntryList } from './entry-list';

/**
 * §4.3 zero-click home screen: the composer is the page. Today's running total
 * and the last five entries sit beneath it, and nothing else competes.
 */
export function TodayScreen() {
  const t = useTranslations('today');
  const { businessId, repo, bootstrap } = useBusiness();
  const { pendingSync } = useApp();
  const { currency, locale, timezone } = bootstrap.business;
  const today = dayKey(new Date(), timezone);

  const totalsQuery = useQuery({
    queryKey: ['totals', businessId, 'day', today],
    queryFn: () => repo.getDayTotals(businessId, today),
  });

  const entriesQuery = useQuery({
    queryKey: ['entries', businessId, 'recent'],
    queryFn: () => repo.listEntries(businessId, { limit: 5 }),
  });

  const [queued, setQueued] = useState<QueuedCreate[]>([]);
  useEffect(() => {
    void pendingEntries().then(setQueued);
  }, [pendingSync]);

  return (
    <div className="flex flex-col gap-4">
      {/* P1 #2: due schedules propose themselves above the composer. */}
      <RecurringDueCard />

      <Composer />

      <section className="card p-4" aria-label={t('spentToday')}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-label text-muted">{t('spentToday')}</p>
            {totalsQuery.isLoading ? (
              <Skeleton className="mt-1 h-9 w-32" />
            ) : (
              <AnimatedTotal
                testId="today-expense-total"
                minor={totalsQuery.data?.expenseMinor ?? '0'}
                currency={currency}
                locale={locale}
                className="text-amount font-semibold"
              />
            )}
          </div>
          <div className="text-right">
            <p className="text-label text-muted">{t('receivedToday')}</p>
            <p className="tabular text-body font-semibold text-income" data-testid="today-income-total">
              {Money.fromMinor(totalsQuery.data?.incomeMinor ?? '0', currency).formatCompact(locale)}
            </p>
          </div>
        </div>
      </section>

      {queued.length > 0 && (
        <section className="card p-4" aria-label="Waiting to sync">
          <p className="text-label text-muted">{t('pendingSync', { count: queued.length })}</p>
          <ul className="mt-2 divide-y divide-border">
            {queued.map((item) => (
              <li key={item.clientId} className="flex justify-between py-2 text-body text-muted">
                <span className="truncate">{item.note || 'Entry'}</span>
                <span className="tabular">
                  {Money.fromMinor(item.amountMinor, currency).formatCompact(locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t('recent')}>
        <h2 className="mb-1 text-label text-muted">{t('recent')}</h2>
        {entriesQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <EntryList entries={entriesQuery.data ?? []} emptyMessage={t('empty')} />
        )}
      </section>
    </div>
  );
}
