'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money, supportsGst } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { monthKey } from '@/lib/utils';

/**
 * P1 #9: GST, offered only where it means something.
 *
 * The tax is a split *inside* the amount, never added on top: turning this on
 * must not change a single total in the ledger.
 */
export function GstSettings() {
  const t = useTranslations('gst');
  const { repo, businessId, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { currency, locale, timezone, gst_enabled: enabled } = bootstrap.business;
  const [error, setError] = useState<string | null>(null);

  const month = monthKey(new Date(), timezone);
  const summaryQuery = useQuery({
    queryKey: ['gst', businessId, month],
    queryFn: () => repo.gstSummary(businessId, month),
    enabled: Boolean(enabled),
  });

  const toggle = useMutation({
    mutationFn: (next: boolean) => repo.setGstEnabled(businessId, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
    onError: (err: Error) => setError(err.message),
  });

  // Not a globally useful feature: hide it where it is just noise.
  if (!supportsGst(locale, currency)) return null;

  const rows = summaryQuery.data ?? [];
  const collected = rows.find((r) => r.type === 'income')?.tax_minor ?? '0';
  const paid = rows.find((r) => r.type === 'expense')?.tax_minor ?? '0';
  const net = (BigInt(collected) - BigInt(paid)).toString();

  return (
    <section aria-label={t('title')}>
      <h2 className="text-label text-muted">{t('title')}</h2>
      <p className="mt-1 text-body text-muted">{t('hint')}</p>

      <Button
        variant={enabled ? 'primary' : 'quiet'}
        size="md"
        className="mt-2"
        aria-pressed={Boolean(enabled)}
        data-testid="toggle-gst"
        onClick={() => toggle.mutate(!enabled)}
      >
        {t('enable')}
      </Button>

      {enabled && (
        <div className="mt-3" data-testid="gst-summary">
          <h3 className="text-label text-muted">{t('summary')}</h3>
          {rows.length === 0 ? (
            <p className="mt-1 text-body text-muted">{t('noneThisMonth')}</p>
          ) : (
            <dl className="mt-1 divide-y divide-border">
              {([
                [t('collected'), collected],
                [t('paid'), paid],
                [t('netPayable'), net],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between py-2">
                  <dt className="text-body">{label}</dt>
                  <dd className="tabular text-body font-semibold">
                    {Money.fromMinor(value, currency).format(locale)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
    </section>
  );
}
