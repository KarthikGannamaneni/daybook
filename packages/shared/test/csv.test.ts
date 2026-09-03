import { describe, expect, it } from 'vitest';
import { CSV_HEADERS, entriesToCsv, type EntryView } from '../src';

const base: EntryView = {
  id: 'e1',
  business_id: 'b1',
  type: 'expense',
  amount_minor: '12345600',
  account_id: 'a1',
  category_id: 'c1',
  party_id: null,
  note: 'tea shop',
  occurred_at: '2026-09-01T09:30:00.000Z',
  attachment_path: null,
  source: 'app',
  created_by: 'u1',
  client_id: 'cl1',
  deleted_at: null,
  created_at: '2026-09-01T09:30:05.000Z',
  updated_at: null,
  account_name: 'Cash',
  category_name: 'Food & Tea',
  party_name: null,
};

describe('entriesToCsv', () => {
  it('writes a header row and a BOM', () => {
    const csv = entriesToCsv([], { currency: 'INR', locale: 'en-IN' });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(CSV_HEADERS.join(','));
  });

  it('exports machine and display amounts', () => {
    const csv = entriesToCsv([base], { currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata' });
    expect(csv).toContain('123456.00');
    expect(csv).toContain('1,23,456.00');
  });

  it('quotes cells containing commas, quotes and newlines', () => {
    const csv = entriesToCsv(
      [{ ...base, note: 'tea, "extra" strong\nmorning' }],
      { currency: 'INR', locale: 'en-IN' },
    );
    expect(csv).toContain('"tea, ""extra"" strong\nmorning"');
  });

  it('renders empty optional columns as blanks', () => {
    const csv = entriesToCsv([{ ...base, note: null, category_name: null }], {
      currency: 'INR',
      locale: 'en-IN',
    });
    expect(csv.split('\r\n')[1]).toContain(',,');
  });
});
