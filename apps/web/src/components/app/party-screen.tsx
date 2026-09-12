'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money, gstinSchema } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Label, Skeleton, TextField } from '@/components/ui/field';
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

      {bootstrap.business.gst_enabled && party && <PartyGstin partyId={party.id} gstin={party.gstin} />}

      {entriesQuery.isLoading ? <Skeleton className="h-24 w-full" /> : <EntryList entries={entries} emptyMessage={t('empty')} />}
    </div>
  );
}

/** P1 #9: a supplier's GSTIN, validated before it is stored. */
function PartyGstin({ partyId, gstin }: { partyId: string; gstin: string | null }) {
  const t = useTranslations('gst');
  const { repo, businessId } = useBusiness();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(gstin ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim();
      if (trimmed === '') return repo.setPartyGstin(partyId, null);
      const parsed = gstinSchema.safeParse(trimmed);
      if (!parsed.success) throw new Error(t('gstinInvalid'));
      return repo.setPartyGstin(partyId, parsed.data);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <section className="card p-4" aria-label={t('gstin')}>
      <Label htmlFor="party-gstin">{t('gstin')}</Label>
      <div className="mt-1 flex gap-2">
        <TextField
          id="party-gstin"
          data-testid="party-gstin"
          placeholder="29ABCDE1234F1Z5"
          maxLength={15}
          className="uppercase"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
        />
        <Button variant="quiet" size="md" data-testid="save-gstin" onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
    </section>
  );
}
