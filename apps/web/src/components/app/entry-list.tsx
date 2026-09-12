'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money, type EntryView } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { useToast } from '@/components/toast';
import { AmountText } from '@/components/ui/amount';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { invalidateLedger } from '@/lib/ledger-cache';
import { cn, formatTime, haptic } from '@/lib/utils';

/**
 * §6.2: a saved entry animates into the list. §4.3: deleting shows an 8-second
 * undo toast; the toast running out is what commits the delete.
 */
export function EntryList({
  entries,
  emptyMessage,
}: {
  entries: EntryView[];
  emptyMessage: string;
}) {
  const { bootstrap } = useBusiness();
  const [selected, setSelected] = useState<EntryView | null>(null);
  const { currency, locale, timezone } = bootstrap.business;

  if (entries.length === 0) {
    return <p className="py-6 text-body text-muted">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className="divide-y divide-border" data-testid="entry-list">
        {entries.map((entry) => (
          <li key={entry.id} data-testid="entry-row" className="motion-safe:animate-row-enter">
            <button
              type="button"
              onClick={() => setSelected(entry)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-body">
                  {entry.note || entry.category_name || entry.party_name || '—'}
                </span>
                <span className="block text-label text-muted">
                  {[entry.category_name, entry.party_name, entry.account_name]
                    .filter(Boolean)
                    .join(' · ')}
                  {' · '}
                  {formatTime(entry.occurred_at, locale, timezone)}
                  {entry.source === 'whatsapp' ? ' · WhatsApp' : ''}
                </span>
              </span>
              <AmountText
                minor={entry.amount_minor}
                currency={currency}
                locale={locale}
                type={entry.type}
              />
            </button>
          </li>
        ))}
      </ul>
      <EntrySheet entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function EntrySheet({ entry, onClose }: { entry: EntryView | null; onClose: () => void }) {
  const t = useTranslations('today');
  const tc = useTranslations('composer');
  const { repo, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const remove = useMutation({
    mutationFn: async (id: string) => repo.setEntryDeleted(id, true),
    onSuccess: async (_data, id) => {
      haptic(12);
      onClose();
      await invalidateLedger(queryClient);
      show({
        message: t('deleted'),
        actionLabel: t('undo'),
        onAction: async () => {
          await repo.setEntryDeleted(id, false);
          await invalidateLedger(queryClient);
        },
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!entry) return null;
  const { currency, locale } = bootstrap.business;

  return (
    <Sheet
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) {
          setEditing(false);
          onClose();
        }
      }}
      title={entry.note || entry.category_name || 'Entry'}
      description={[entry.category_name, entry.account_name].filter(Boolean).join(' · ')}
    >
      {editing ? (
        <EntryEditor
          entry={entry}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onClose();
          }}
        />
      ) : (
        <p className="tabular text-amount font-semibold">
          {Money.fromMinor(entry.amount_minor, currency).format(locale)}
        </p>
      )}
      {entry.party_name && entry.party_id && (
        <Link
          href={`/party/${entry.party_id}`}
          className="mt-2 inline-block text-body text-accent"
          onClick={onClose}
        >
          {entry.party_name}
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-3 text-label text-expense">
          {error}
        </p>
      )}
      {!editing && (
        <div className="mt-4 flex gap-2">
          <Button
            variant="quiet"
            size="lg"
            className="flex-1"
            data-testid="edit-entry"
            onClick={() => setEditing(true)}
          >
            {tc('edit')}
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="flex-1"
            data-testid="delete-entry"
            onClick={() => remove.mutate(entry.id)}
          >
            Delete
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * §4.3: entries are editable, not only deletable. Staff edits are still bounded
 * by the database — a refusal from RLS surfaces here as a message, not a crash.
 */
function EntryEditor({
  entry,
  onCancel,
  onSaved,
}: {
  entry: EntryView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('composer');
  const { repo, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { currency } = bootstrap.business;

  const [amountText, setAmountText] = useState(Money.fromMinor(entry.amount_minor, currency).toMajorString());
  const [note, setNote] = useState(entry.note ?? '');
  const [party, setParty] = useState(entry.party_name ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(entry.category_id);
  const [accountId, setAccountId] = useState(entry.account_id);
  const [error, setError] = useState<string | null>(null);

  const categories = bootstrap.categories.filter((c) => c.type === entry.type);

  const save = useMutation({
    mutationFn: async () => {
      const money = Money.parse(amountText, currency);
      if (!money || money.minor <= 0n) throw new Error(t('amountRequired'));
      return repo.updateEntry({
        id: entry.id,
        amountMinor: money.abs().minor.toString(),
        accountId,
        categoryId,
        note: note.trim() || null,
        partyName: party.trim() || null,
      });
    },
    onSuccess: async () => {
      await invalidateLedger(queryClient);
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        inputMode="decimal"
        aria-label={t('amount')}
        data-testid="edit-amount"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        className="tabular w-full rounded-card border border-border px-3 py-2 text-amount font-semibold"
      />
      <input
        aria-label={t('notePlaceholder')}
        placeholder={t('notePlaceholder')}
        data-testid="edit-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-11 w-full rounded-card border border-border px-3 text-body"
      />
      <input
        aria-label={t('partyPlaceholder')}
        placeholder={t('partyPlaceholder')}
        data-testid="edit-party"
        value={party}
        onChange={(e) => setParty(e.target.value)}
        className="h-11 w-full rounded-card border border-border px-3 text-body"
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('category')}>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={categoryId === category.id}
            onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
            className={cn('chip shrink-0', categoryId === category.id && 'chip-selected')}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('account')}>
        {bootstrap.accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            aria-pressed={accountId === account.id}
            onClick={() => setAccountId(account.id)}
            className={cn('chip shrink-0', accountId === account.id && 'chip-selected')}
          >
            {account.name}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-label text-expense">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="quiet" size="lg" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          data-testid="edit-save"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
