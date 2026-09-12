'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Label, TextField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** P1 #2: define a repeating entry once. The home screen proposes it when due. */
export function RecurringSettings() {
  const t = useTranslations('recurring');
  const { businessId, repo, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { currency, locale } = bootstrap.business;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [cadence, setCadence] = useState<'monthly' | 'weekly'>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(bootstrap.defaultAccountId);

  const listQuery = useQuery({
    queryKey: ['recurring', businessId, 'all'],
    queryFn: () => repo.listRecurring(businessId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['recurring'] });

  const create = useMutation({
    mutationFn: async () => {
      const money = Money.parse(amount, currency);
      if (!money || money.minor <= 0n) throw new Error('Enter an amount');
      await repo.createRecurring({
        businessId,
        type: 'expense',
        amountMinor: money.abs().minor.toString(),
        accountId,
        categoryId,
        partyName: null,
        note: note.trim() || null,
        cadence,
        dayOfMonth: cadence === 'monthly' ? Number(dayOfMonth) : null,
        dayOfWeek: cadence === 'weekly' ? Number(dayOfWeek) : null,
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setAmount('');
      setNote('');
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => repo.setRecurringActive(input.id, input.active),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => repo.deleteRecurring(id),
    onSuccess: refresh,
  });

  const rows = listQuery.data ?? [];
  const expenseCategories = bootstrap.categories.filter((c) => c.type === 'expense');

  return (
    <section aria-label={t('title')}>
      <h2 className="text-label text-muted">{t('title')}</h2>

      {rows.length === 0 ? (
        <p className="mt-1 text-body text-muted">{t('empty')}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border" data-testid="recurring-list">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2" data-testid="recurring-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">
                  {r.note || r.category_name || '—'}{' '}
                  <span className="tabular font-semibold">
                    {Money.fromMinor(r.amount_minor, currency).formatCompact(locale)}
                  </span>
                </span>
                <span className="block text-label text-muted">
                  {r.cadence === 'monthly'
                    ? `${t('monthly')} · ${r.day_of_month}`
                    : `${t('weekly')} · ${WEEKDAYS[r.day_of_week ?? 0]}`}
                  {' · '}
                  {r.is_active ? t('nextDue', { date: r.next_due_on }) : t('paused')}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                data-testid="recurring-toggle"
                onClick={() => toggle.mutate({ id: r.id, active: !r.is_active })}
              >
                {r.is_active ? t('pause') : t('resume')}
              </Button>
              <Button size="sm" variant="ghost" aria-label={t('remove')} onClick={() => remove.mutate(r.id)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="quiet" size="md" className="mt-2" data-testid="add-recurring" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        {t('add')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title={t('add')} description={t('clampNote')}>
        <div className="flex flex-col gap-3">
          <TextField
            autoFocus
            inputMode="decimal"
            aria-label="Amount"
            placeholder="12000"
            data-testid="recurring-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField
            aria-label="Note"
            placeholder="monthly rent"
            data-testid="recurring-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex gap-1.5" role="group" aria-label={t('title')}>
            {(['monthly', 'weekly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={cadence === option}
                data-testid={`cadence-${option}`}
                onClick={() => setCadence(option)}
                className={cn('chip', cadence === option && 'chip-selected')}
              >
                {t(option)}
              </button>
            ))}
          </div>

          {cadence === 'monthly' ? (
            <div>
              <Label htmlFor="day-of-month">{t('dayOfMonth')}</Label>
              <TextField
                id="day-of-month"
                inputMode="numeric"
                data-testid="recurring-day"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value.replace(/\D/g, '').slice(0, 2) || '1')}
              />
            </div>
          ) : (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('dayOfWeek')}>
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={Number(dayOfWeek) === index}
                  onClick={() => setDayOfWeek(String(index))}
                  className={cn('chip shrink-0', Number(dayOfWeek) === index && 'chip-selected')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Category">
            {expenseCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                data-testid="recurring-category"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                className={cn('chip shrink-0', categoryId === c.id && 'chip-selected')}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Account">
            {bootstrap.accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={accountId === a.id}
                onClick={() => setAccountId(a.id)}
                className={cn('chip shrink-0', accountId === a.id && 'chip-selected')}
              >
                {a.name}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="text-label text-expense">
              {error}
            </p>
          )}

          <Button
            variant="primary"
            size="lg"
            data-testid="recurring-save"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {t('add')}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
