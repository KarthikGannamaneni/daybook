'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BUDGET_OVER_PERCENT, BUDGET_WARN_PERCENT, Money } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { cn } from '@/lib/utils';

/**
 * P1 #8: budget progress on the month view.
 *
 * Soft alerts at 80% and 100%, in the app only. No WhatsApp nudge — a bot that
 * nags about money is a bot people mute, and then the useful messages go too.
 */
export function BudgetBars() {
  const t = useTranslations('budgets');
  const { businessId, repo, bootstrap } = useBusiness();
  const { currency, locale } = bootstrap.business;

  const { data } = useQuery({
    queryKey: ['budgets', businessId],
    queryFn: () => repo.listBudgets(businessId),
  });

  const budgets = data ?? [];
  if (budgets.length === 0) return null;

  return (
    <section aria-label={t('title')} data-testid="budget-bars">
      <h3 className="mb-2 text-label text-muted">{t('title')}</h3>
      <ul className="flex flex-col gap-2">
        {budgets.map((b) => {
          const over = b.percent_used >= BUDGET_OVER_PERCENT;
          const warn = !over && b.percent_used >= BUDGET_WARN_PERCENT;
          const spent = Money.fromMinor(b.spent_minor, currency);
          const budget = Money.fromMinor(b.budget_minor, currency);
          const diff = Money.fromMinor(
            (BigInt(b.spent_minor) - BigInt(b.budget_minor)).toString(),
            currency,
          );

          return (
            <li key={b.budget_id} className="card p-4" data-testid="budget-row">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-body">{b.category_name}</span>
                <span className="tabular text-label text-muted">
                  {t('spentOf', { spent: spent.formatCompact(locale), budget: budget.formatCompact(locale) })}
                </span>
              </div>

              <span className="mt-2 block h-1.5 w-full rounded-full bg-border">
                <span
                  className={cn(
                    'block h-1.5 rounded-full',
                    over ? 'bg-expense' : warn ? 'bg-accent' : 'bg-income',
                  )}
                  style={{ width: `${Math.min(Math.max(b.percent_used, 2), 100)}%` }}
                />
              </span>

              <p
                className={cn('mt-1 text-label', over ? 'text-expense' : 'text-muted')}
                data-testid={over ? 'budget-over' : warn ? 'budget-warn' : 'budget-ok'}
              >
                {over
                  ? t('over', { amount: diff.abs().formatCompact(locale) })
                  : t('remaining', {
                      amount: Money.fromMinor(b.remaining_minor, currency).formatCompact(locale),
                    })}
                {' · '}
                {b.percent_used}%
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
