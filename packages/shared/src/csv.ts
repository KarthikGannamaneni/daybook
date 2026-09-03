import { Money } from './money.ts';
import type { EntryView } from './types.ts';

/** RFC 4180 quoting: Excel and Sheets both need the doubled-quote form. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

export const CSV_HEADERS = [
  'date_iso',
  'date_local',
  'type',
  'amount',
  'amount_display',
  'currency',
  'account',
  'category',
  'party',
  'note',
  'source',
  'created_at',
  'entry_id',
] as const;

/**
 * CSV export (§4.6): amounts in major units with 2 decimals for machines, plus a
 * locale-formatted column so the preview matches what the app shows.
 */
export function entriesToCsv(
  entries: EntryView[],
  opts: { currency: string; locale: string; timezone?: string },
): string {
  const dateFormatter = new Intl.DateTimeFormat(opts.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: opts.timezone,
  });

  const lines = [CSV_HEADERS.join(',')];
  for (const e of entries) {
    const money = Money.fromMinor(e.amount_minor, opts.currency);
    const occurred = new Date(e.occurred_at);
    lines.push(
      [
        occurred.toISOString(),
        dateFormatter.format(occurred),
        e.type,
        money.toMajorString(),
        money.format(opts.locale),
        opts.currency,
        e.account_name ?? '',
        e.category_name ?? '',
        e.party_name ?? '',
        e.note ?? '',
        e.source,
        e.created_at,
        e.id,
      ]
        .map((v) => csvCell(String(v)))
        .join(','),
    );
  }
  // Leading BOM so Excel opens UTF-8 notes (Devanagari, Telugu) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
