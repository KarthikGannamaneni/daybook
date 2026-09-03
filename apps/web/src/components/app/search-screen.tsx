'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { EntryView } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { Skeleton } from '@/components/ui/field';
import { dayKey, formatDayLabel } from '@/lib/utils';
import { EntryList } from './entry-list';

/** §4.4: one box over note, party and amount. Results grouped by date. */
export function SearchScreen() {
  const t = useTranslations('search');
  const { businessId, repo, bootstrap } = useBusiness();
  const { locale, timezone } = bootstrap.business;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useMemo(() => {
    const handle = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ['entries', businessId, 'search', debounced],
    queryFn: () => repo.searchEntries(businessId, debounced),
    enabled: debounced.trim().length > 0,
  });

  const groups = useMemo(() => groupByDay(data ?? [], timezone), [data, timezone]);

  return (
    <div className="flex flex-col gap-4">
      <input
        autoFocus
        type="search"
        data-testid="search-input"
        aria-label={t('placeholder')}
        placeholder={t('placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-12 w-full rounded-card border border-border bg-surface px-4 text-body placeholder:text-muted"
      />

      {debounced.trim().length === 0 ? (
        <p className="text-body text-muted">{t('prompt')}</p>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : groups.length === 0 ? (
        <p className="text-body text-muted" data-testid="search-empty">
          {t('empty')}
        </p>
      ) : (
        groups.map(([day, entries]) => (
          <section key={day} aria-label={day}>
            <h2 className="mb-1 text-label text-muted">
              {formatDayLabel(entries[0]!.occurred_at, locale, timezone)}
            </h2>
            <EntryList entries={entries} emptyMessage={t('empty')} />
          </section>
        ))
      )}
    </div>
  );
}

function groupByDay(entries: EntryView[], timezone: string): Array<[string, EntryView[]]> {
  const map = new Map<string, EntryView[]>();
  for (const entry of entries) {
    const key = dayKey(entry.occurred_at, timezone);
    const bucket = map.get(key);
    if (bucket) bucket.push(entry);
    else map.set(key, [entry]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
