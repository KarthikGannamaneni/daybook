'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Money, type CategoryTotal } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/field';
import { addMonths, formatMonthLabel, monthKey, zonedDayStart } from '@/lib/utils';
import { EntryList } from './entry-list';

/**
 * §4.4 month view: totals, then a horizontal bar list by category. No pie
 * charts, and no chart library — the bars are divs, so nothing extra is
 * downloaded for this route (§10.6).
 */
export function MonthScreen() {
  const t = useTranslations('monthView');
  const { businessId, repo, bootstrap } = useBusiness();
  const { currency, locale, timezone } = bootstrap.business;

  const [month, setMonth] = useState(() => monthKey(new Date(), timezone));
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [dismissedInsight, setDismissedInsight] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ['totals', businessId, 'month', month],
    queryFn: () => repo.getMonthSummary(businessId, month),
  });
  const categoriesQuery = useQuery({
    queryKey: ['totals', businessId, 'month-categories', month],
    queryFn: () => repo.getMonthCategoryTotals(businessId, month),
  });
  const previousQuery = useQuery({
    queryKey: ['totals', businessId, 'month-categories', addMonths(month, -1)],
    queryFn: () => repo.getMonthCategoryTotals(businessId, addMonths(month, -1)),
  });

  const expenses = useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.type === 'expense'),
    [categoriesQuery.data],
  );
  const largest = expenses.reduce((max, c) => (BigInt(c.total_minor) > max ? BigInt(c.total_minor) : max), 1n);

  const insight = useMemo(
    () => buildInsight(expenses, previousQuery.data ?? []),
    [expenses, previousQuery.data],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button size="icon" aria-label={t('previous')} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Button>
        <h2 className="text-body font-semibold" data-testid="month-label">
          {formatMonthLabel(month, locale)}
        </h2>
        <Button size="icon" aria-label={t('next')} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </Button>
      </div>

      {/* Swipe left and right to change month (§4.4). */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_event, info) => {
          if (info.offset.x < -60) setMonth(addMonths(month, 1));
          else if (info.offset.x > 60) setMonth(addMonths(month, -1));
        }}
        className="flex flex-col gap-4"
      >
        <section className="card grid grid-cols-3 gap-2 p-4" aria-label="Month totals">
          <Total label={t('income')} minor={summaryQuery.data?.incomeMinor} currency={currency} locale={locale} tone="income" testId="month-income" />
          <Total label={t('expense')} minor={summaryQuery.data?.expenseMinor} currency={currency} locale={locale} tone="expense" testId="month-expense" />
          <Total label={t('net')} minor={summaryQuery.data?.netMinor} currency={currency} locale={locale} tone="neutral" testId="month-net" />
        </section>

        {insight && !dismissedInsight && (
          <section className="card flex items-start justify-between gap-3 p-4" data-testid="insight-card">
            <p className="text-body">
              {t(insight.direction === 'up' ? 'insightHigher' : 'insightLower', {
                category: insight.category,
                percent: insight.percent,
              })}
            </p>
            <button type="button" className="text-label text-muted" onClick={() => setDismissedInsight(true)}>
              {t('dismiss')}
            </button>
          </section>
        )}

        <section aria-label={t('byCategory')}>
          <h3 className="mb-2 text-label text-muted">{t('byCategory')}</h3>
          {categoriesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : expenses.length === 0 ? (
            <p className="py-6 text-body text-muted">{t('empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="category-breakdown">
              {expenses.map((category) => {
                const width = Number((BigInt(category.total_minor) * 100n) / largest);
                const open = openCategory === category.category_id;
                return (
                  <li key={`${category.category_id}-${category.type}`} className="card overflow-hidden">
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left"
                      aria-expanded={open}
                      onClick={() => setOpenCategory(open ? null : category.category_id)}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-body">{category.category_name}</span>
                        <span className="tabular text-body font-semibold">
                          {Money.fromMinor(category.total_minor, currency).formatCompact(locale)}
                        </span>
                      </span>
                      <span className="mt-2 block h-1.5 w-full rounded-full bg-border">
                        <span
                          className="block h-1.5 rounded-full bg-expense"
                          style={{ width: `${Math.max(width, 2)}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-label text-muted">
                        {t('entries', { count: category.entry_count })}
                      </span>
                    </button>
                    {open && category.category_id && (
                      <div className="border-t border-border px-4">
                        <CategoryEntries month={month} categoryId={category.category_id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </motion.div>
    </div>
  );
}

function Total({
  label,
  minor,
  currency,
  locale,
  tone,
  testId,
}: {
  label: string;
  minor: string | undefined;
  currency: string;
  locale: string;
  tone: 'income' | 'expense' | 'neutral';
  testId: string;
}) {
  return (
    <div>
      <p className="text-label text-muted">{label}</p>
      <p
        data-testid={testId}
        className={
          'tabular text-body font-semibold ' +
          (tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : '')
        }
      >
        {Money.fromMinor(minor ?? '0', currency).formatCompact(locale)}
      </p>
    </div>
  );
}

function CategoryEntries({ month, categoryId }: { month: string; categoryId: string }) {
  const { businessId, repo, bootstrap } = useBusiness();
  const { timezone } = bootstrap.business;
  // Same month boundary the totals above use, or the drill-down disagrees with
  // the number it was opened from.
  const from = zonedDayStart(month, timezone);
  const to = zonedDayStart(addMonths(month, 1), timezone);
  const { data, isLoading } = useQuery({
    queryKey: ['entries', businessId, 'category', month, categoryId],
    queryFn: () =>
      repo.listEntries(businessId, {
        categoryId,
        from,
        to: new Date(new Date(to).getTime() - 1).toISOString(),
      }),
  });

  if (isLoading) return <Skeleton className="my-3 h-10 w-full" />;
  return <EntryList entries={data ?? []} emptyMessage="No entries in this category." />;
}

interface Insight {
  category: string;
  percent: number;
  direction: 'up' | 'down';
}

/**
 * §6.3: at most one insight card, driven by simple rules — no model, no
 * ranking service. A category has to move by at least 25% and be worth at
 * least ~1000 major units before it is worth interrupting anyone.
 */
export function buildInsight(current: CategoryTotal[], previous: CategoryTotal[]): Insight | null {
  const previousByName = new Map(previous.filter((c) => c.type === 'expense').map((c) => [c.category_name, BigInt(c.total_minor)]));
  let best: Insight | null = null;

  for (const category of current) {
    const now = BigInt(category.total_minor);
    const before = previousByName.get(category.category_name);
    if (!before || before === 0n || now < 100000n) continue;
    const ratio = Number((now * 100n) / before) - 100;
    if (Math.abs(ratio) < 25) continue;
    if (!best || Math.abs(ratio) > best.percent) {
      best = { category: category.category_name, percent: Math.abs(Math.round(ratio)), direction: ratio > 0 ? 'up' : 'down' };
    }
  }
  return best;
}
