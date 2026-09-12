'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

/**
 * P1 #7: switch business in one tap from the header.
 *
 * Renders as plain text when there is only one business, so the single-business
 * owner — most of them — never sees a control for a choice they do not have.
 */
export function BusinessSwitcher({ name, role }: { name: string; role: string }) {
  const t = useTranslations('businesses');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businesses, businessId, setBusinessId } = useApp();
  const [open, setOpen] = useState(false);

  const roleLabel = role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff' : 'Accountant';

  if (businesses.length <= 1) {
    return (
      <div className="min-w-0">
        <h1 className="truncate text-body font-semibold">{name}</h1>
        <p className="text-label text-muted">{roleLabel}</p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="business-switcher"
        aria-label={t('switch')}
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-1.5 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1">
            <span className="truncate text-body font-semibold">{name}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          </span>
          <span className="block text-label text-muted">{roleLabel}</span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={t('switch')}>
        <ul className="divide-y divide-border" data-testid="business-list">
          {businesses.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                data-testid="business-option"
                className="flex w-full items-center justify-between gap-3 py-3 text-left"
                onClick={async () => {
                  setBusinessId(b.id);
                  setOpen(false);
                  // Every cached read is scoped to the old business.
                  await queryClient.invalidateQueries();
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-body">{b.name}</span>
                  <span className="block text-label text-muted">
                    {b.role === 'owner' ? 'Owner' : b.role === 'staff' ? 'Staff' : 'Accountant'}
                  </span>
                </span>
                {b.id === businessId && <Check className="h-4 w-4 shrink-0 text-accent" aria-label={t('current')} />}
              </button>
            </li>
          ))}
        </ul>

        <Button
          variant="quiet"
          size="lg"
          className="mt-3 w-full"
          data-testid="add-business"
          onClick={() => {
            setOpen(false);
            router.push('/onboarding?add=1');
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('add')}
        </Button>
      </Sheet>
    </>
  );
}
