'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';

/**
 * §4.2: the seeded categories and accounts are a starting point, not a cage —
 * a print lab and a tea stall do not spend money on the same things. Rename,
 * add, archive. Nothing is ever deleted, because entries point at these rows.
 */
export function TaxonomySettings() {
  const t = useTranslations('settings');
  const { repo, businessId, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'expense' | 'income'>('expense');
  const [newAccount, setNewAccount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
  const fail = (err: Error) => setError(err.message);

  const addCategory = useMutation({
    mutationFn: () => repo.addCategory(businessId, newCategory, newCategoryType),
    onSuccess: async () => {
      setNewCategory('');
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const addAccount = useMutation({
    mutationFn: () => repo.addAccount(businessId, newAccount, 'other'),
    onSuccess: async () => {
      setNewAccount('');
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const rename = useMutation({
    mutationFn: async (input: { id: string; kind: 'category' | 'account' }) =>
      input.kind === 'category'
        ? repo.renameCategory(input.id, editingName)
        : repo.renameAccount(input.id, editingName),
    onSuccess: async () => {
      setEditingId(null);
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const archive = useMutation({
    mutationFn: async (input: { id: string; kind: 'category' | 'account'; archived: boolean }) =>
      input.kind === 'category'
        ? repo.setCategoryArchived(input.id, input.archived)
        : repo.setAccountArchived(input.id, input.archived),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const row = (
    id: string,
    name: string,
    kind: 'category' | 'account',
    subtitle?: string,
  ) => (
    <li key={id} className="flex items-center gap-2 py-2">
      {editingId === id ? (
        <>
          <TextField
            autoFocus
            aria-label={t('rename')}
            data-testid="taxonomy-rename-input"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            className="h-9 flex-1"
          />
          <Button size="sm" variant="primary" data-testid="taxonomy-rename-save" onClick={() => rename.mutate({ id, kind })}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="flex-1 text-left text-body"
            data-testid="taxonomy-row"
            onClick={() => {
              setEditingId(id);
              setEditingName(name);
            }}
          >
            {name}
            {subtitle ? <span className="ml-2 text-label text-muted">{subtitle}</span> : null}
          </button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('archive')}
            data-testid="taxonomy-archive"
            onClick={() => archive.mutate({ id, kind, archived: true })}
          >
            <Archive className="h-4 w-4" aria-hidden />
          </Button>
        </>
      )}
    </li>
  );

  return (
    <>
      <section aria-label={t('categories')}>
        <h2 className="text-label text-muted">{t('categories')}</h2>

        <div className="mt-2 flex gap-1.5" role="group" aria-label={t('categories')}>
          {(['expense', 'income'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={newCategoryType === type}
              data-testid={`category-type-${type}`}
              onClick={() => setNewCategoryType(type)}
              className={'chip' + (newCategoryType === type ? ' chip-selected' : '')}
            >
              {type === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <ul className="mt-1 divide-y divide-border">
          {bootstrap.categories
            .filter((c) => c.type === newCategoryType)
            .map((c) => row(c.id, c.name, 'category'))}
        </ul>

        <div className="mt-2 flex gap-2">
          <TextField
            aria-label={t('addCategory')}
            placeholder={t('namePlaceholder')}
            data-testid="new-category-name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <Button
            size="md"
            variant="quiet"
            data-testid="add-category"
            disabled={!newCategory.trim() || addCategory.isPending}
            onClick={() => addCategory.mutate()}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('addCategory')}
          </Button>
        </div>
      </section>

      <section aria-label={t('accounts')}>
        <h2 className="text-label text-muted">{t('accounts')}</h2>
        <ul className="mt-1 divide-y divide-border">
          {bootstrap.accounts.map((a) => row(a.id, a.name, 'account', a.kind))}
        </ul>

        <div className="mt-2 flex gap-2">
          <TextField
            aria-label={t('addAccount')}
            placeholder={t('namePlaceholder')}
            data-testid="new-account-name"
            value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)}
          />
          <Button
            size="md"
            variant="quiet"
            data-testid="add-account"
            disabled={!newAccount.trim() || addAccount.isPending}
            onClick={() => addAccount.mutate()}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('addAccount')}
          </Button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-label text-expense">
            {error}
          </p>
        )}

      </section>
    </>
  );
}
