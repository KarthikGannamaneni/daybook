import { describe, expect, it } from 'vitest';
import { addMonths, dayKey, formatDayLabel, formatMonthLabel, monthKey, zonedDayEnd, zonedDayStart } from '../utils';
import { maskPhone } from '../data/phone';
import { buildInsight } from '@/components/app/month-screen';
import type { CategoryTotal } from '@khata/shared';

describe('calendar helpers', () => {
  it('derives the local day in the business timezone', () => {
    // 18:45 UTC is already the next day in Kolkata (+05:30).
    expect(dayKey('2026-09-01T18:45:00.000Z', 'Asia/Kolkata')).toBe('2026-09-02');
    expect(dayKey('2026-09-01T18:45:00.000Z', 'UTC')).toBe('2026-09-01');
  });

  it('derives the month key', () => {
    expect(monthKey('2026-09-17T06:00:00.000Z', 'Asia/Kolkata')).toBe('2026-09-01');
  });

  it('adds and subtracts months across year boundaries', () => {
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-09-01', 0)).toBe('2026-09-01');
  });

  it('labels a month independently of the viewer timezone', () => {
    // Regression: formatting the key as a local instant showed the month before.
    expect(formatMonthLabel('2026-09-01', 'en-US')).toBe('September 2026');
    expect(formatMonthLabel('2026-01-01', 'en-US')).toBe('January 2026');
  });

  it('labels today and yesterday in words', () => {
    const now = new Date();
    expect(formatDayLabel(now.toISOString(), 'en-IN', 'UTC')).toBe('Today');
    expect(formatDayLabel(new Date(now.getTime() - 86400000).toISOString(), 'en-IN', 'UTC')).toBe('Yesterday');
  });
});

describe('maskPhone', () => {
  it('masks the middle of an Indian number', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98xxx xx210');
  });

  it('leaves an unrecognisable value alone', () => {
    expect(maskPhone('123')).toBe('123');
  });
});

describe('buildInsight', () => {
  const total = (name: string, minor: string): CategoryTotal => ({
    category_id: name,
    category_name: name,
    type: 'expense',
    total_minor: minor,
    entry_count: 1,
  });

  it('flags a category that moved by more than a quarter', () => {
    const insight = buildInsight([total('Transport', '140000')], [total('Transport', '100000')]);
    expect(insight).toEqual({ category: 'Transport', percent: 40, direction: 'up' });
  });

  it('ignores small movements', () => {
    expect(buildInsight([total('Transport', '110000')], [total('Transport', '100000')])).toBeNull();
  });

  it('ignores categories that are too small to matter', () => {
    expect(buildInsight([total('Tea', '5000')], [total('Tea', '1000')])).toBeNull();
  });

  it('ignores a category with no history to compare against', () => {
    expect(buildInsight([total('Transport', '500000')], [])).toBeNull();
  });

  it('reports a drop', () => {
    const insight = buildInsight([total('Rent', '100000')], [total('Rent', '200000')]);
    expect(insight?.direction).toBe('down');
  });
});

describe('zoned day boundaries', () => {
  it('starts an IST day at 18:30 UTC the day before', () => {
    // Regression: filtering a month by UTC midnight dropped every IST evening
    // entry, so a category total disagreed with the entries behind it.
    expect(zonedDayStart('2026-09-01', 'Asia/Kolkata')).toBe('2026-08-31T18:30:00.000Z');
    expect(zonedDayEnd('2026-09-01', 'Asia/Kolkata')).toBe('2026-09-01T18:29:59.999Z');
  });

  it('is the identity for UTC', () => {
    expect(zonedDayStart('2026-09-01', 'UTC')).toBe('2026-09-01T00:00:00.000Z');
  });

  it('handles a timezone behind UTC', () => {
    expect(zonedDayStart('2026-09-01', 'America/New_York')).toBe('2026-09-01T04:00:00.000Z');
  });

  it('round-trips with dayKey', () => {
    for (const tz of ['Asia/Kolkata', 'UTC', 'America/New_York', 'Pacific/Auckland']) {
      expect(dayKey(zonedDayStart('2026-09-01', tz), tz)).toBe('2026-09-01');
      expect(dayKey(zonedDayEnd('2026-09-01', tz), tz)).toBe('2026-09-01');
    }
  });
});
