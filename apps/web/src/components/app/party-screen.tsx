'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Money } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Skeleton } from '@/components/ui/field';
import { EntryList } from './entry-list';

/**
 * §4.4 party view: every entry with this party plus the running total, which
 * doubles as "how much have I paid this supplier".
 */
export function PartyScreen({ partyId }: { partyId: string }) {
  const t = useTranslations('party');
  const { businessId, repo, bootstrap } = useBusiness();
  const { currency, locale } = bootstrap.business;

  const partiesQuery = useQuery({ queryKey: ['parties', businessId], queryFn: () => repo.listParties(businessId) });
  const entriesQuery = useQuery({
    queryKey: ['entries', businessId, 'party', partyId],
    queryFn: () => repo.listEntries(businessId, { partyId }),
  });

  const party = partiesQuery.data?.find((p) => p.id === partyId);
  const entries = entriesQuery.data ?? [];

  let paid = 0n;
  let received = 0n;
  for (const entry of entries) {
    if (entry.type === 'expense') paid += BigInt(entry.amount_minor);
    else received += BigInt(entry.amount_minor);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-body font-semibold">{party?.name ?? 'Party'}</h1>

      <section className="card grid grid-cols-2 gap-2 p-4" aria-label={t('total', { name: party?.name ?? '' })}>
        <div>
          <p className="text-label text-muted">Paid</p>
          <p className="tabular text-body font-semibold text-expense" data-testid="party-paid">
            {Money.fromMinor(paid.toString(), currency).formatCompact(locale)}
          </p>
        </div>
        <div>
          <p className="text-label text-muted">Received</p>
          <p className="tabular text-body font-semibold text-income" data-testid="party-received">
            {Money.fromMinor(received.toString(), currency).formatCompact(locale)}
          </p>
        </div>
      </section>

      {entriesQuery.isLoading ? <Skeleton className="h-24 w-full" /> : <EntryList entries={entries} emptyMessage={t('empty')} />}
    </div>
  );
}
