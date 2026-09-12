'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Label, TextField } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/** P1 #8: one monthly ceiling per category. Owner-only, enforced by RLS too. */
export function BudgetSettings() {
  const t = useTranslations('budgets');
  const { businessId, repo, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { currency, locale } = bootstrap.business;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['budgets', businessId],
    queryFn: () => repo.listBudgets(businessId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['budgets'] });

  const save = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error('Pick a category');
      const money = Money.parse(amount, currency);
      if (!money || money.minor <= 0n) throw new Error('Enter an amount');
      await repo.setBudget(businessId, categoryId, money.abs().minor.toString());
    },
    onSuccess: async () => {
      setAmount('');
      setCategoryId(null);
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({ mutationFn: (id: string) => repo.removeBudget(id), onSuccess: refresh });

  const budgets = listQuery.data ?? [];
  const budgeted = new Set(budgets.map((b) => b.category_id));
  const available = bootstrap.categories.filter((c) => c.type === 'expense' && !budgeted.has(c.id));

  return (
    <section aria-label={t('title')}>
      <h2 className="text-label text-muted">{t('title')}</h2>
      <p className="mt-1 text-body text-muted">{t('hint')}</p>

      {budgets.length === 0 ? (
        <p className="mt-2 text-body text-muted">{t('empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border" data-testid="budget-settings-list">
          {budgets.map((b) => (
            <li key={b.budget_id} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate text-body">{b.category_name}</span>
              <span className="tabular text-body">
                {Money.fromMinor(b.budget_minor, currency).formatCompact(locale)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('remove')}
                data-testid="remove-budget"
                onClick={() => remove.mutate(b.budget_id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <>
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('pickCategory')}>
            {available.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                data-testid="budget-category"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                className={cn('chip shrink-0', categoryId === c.id && 'chip-selected')}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <Label htmlFor="budget-amount">{t('amount')}</Label>
              <TextField
                id="budget-amount"
                inputMode="decimal"
                placeholder="5000"
                data-testid="budget-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button
              variant="quiet"
              size="md"
              className="self-end"
              data-testid="save-budget"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t('set')}
            </Button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
    </section>
  );
}
