import { describe, expect, it } from 'vitest';
import {
  extractDate,
  parseAmountToken,
  parseMessage,
  roundDiv,
  selectAmount,
  shiftDays,
  toPlainDate,
} from '../src';

const NOW = new Date(2026, 8, 2, 10, 30, 0);

describe('parseAmountToken', () => {
  it('rejects empty and non-numeric tokens', () => {
    expect(parseAmountToken('')).toBeNull();
    expect(parseAmountToken('   ')).toBeNull();
    expect(parseAmountToken('abc')).toBeNull();
    expect(parseAmountToken('rs')).toBeNull();
    expect(parseAmountToken('₹')).toBeNull();
    expect(parseAmountToken('12.5.6')).toBeNull();
  });

  it('applies suffix multipliers', () => {
    expect(parseAmountToken('2l')?.minor).toBe(20000000n);
    expect(parseAmountToken('2lac')?.minor).toBe(20000000n);
    expect(parseAmountToken('3lakhs')?.minor).toBe(30000000n);
    expect(parseAmountToken('1.234k')?.minor).toBe(123400n);
  });

  it('marks explicit money tokens', () => {
    expect(parseAmountToken('₹450')?.explicit).toBe(true);
    expect(parseAmountToken('450/-')?.explicit).toBe(true);
    expect(parseAmountToken('450.00')?.explicit).toBe(true);
    expect(parseAmountToken('450')?.explicit).toBe(false);
  });

  it('reports the sign', () => {
    expect(parseAmountToken('+500')?.sign).toBe('+');
    expect(parseAmountToken('-500')?.sign).toBe('-');
    expect(parseAmountToken('500')?.sign).toBeNull();
  });

  it('supports zero-decimal currencies', () => {
    expect(parseAmountToken('450', 0)?.minor).toBe(450n);
  });
});

describe('roundDiv', () => {
  it('rounds half up', () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(4n, 2n)).toBe(2n);
    expect(roundDiv(1n, 3n)).toBe(0n);
    expect(roundDiv(2n, 3n)).toBe(1n);
  });
});

describe('selectAmount', () => {
  it('reports no_amount for an empty candidate list', () => {
    expect(selectAmount([])).toEqual({ ok: false, reason: 'no_amount' });
  });

  it('prefers the single explicitly-marked candidate', () => {
    const result = selectAmount([
      { minor: 100n, index: 0, explicit: false, sign: null },
      { minor: 200n, index: 1, explicit: true, sign: null },
    ]);
    expect(result.ok && result.amount.minor).toBe(200n);
  });

  it('refuses to guess between two marked candidates', () => {
    expect(
      selectAmount([
        { minor: 100n, index: 0, explicit: true, sign: null },
        { minor: 200n, index: 1, explicit: true, sign: null },
      ]),
    ).toEqual({ ok: false, reason: 'ambiguous_amount' });
  });
});

describe('extractDate', () => {
  it('returns null when nothing looks like a date', () => {
    expect(extractDate(['450', 'tea'], NOW)).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(extractDate(['32/13'], NOW)).toBeNull();
    expect(extractDate(['31', 'sep'], NOW)).toBeNull();
    expect(extractDate(['sep', '31'], NOW)).toBeNull();
    expect(extractDate(['0', 'sep'], NOW)).toBeNull();
  });

  it('accepts 29 february', () => {
    expect(extractDate(['29', 'feb'], NOW)).toEqual({
      date: { year: 2024, month: 2, day: 29 },
      consumed: [0, 1],
    });
  });

  it('normalises 2-digit years either side of the 1970 pivot', () => {
    expect(extractDate(['3/9/99'], NOW)?.date).toEqual({ year: 1999, month: 9, day: 3 });
    expect(extractDate(['3/9/26'], NOW)?.date).toEqual({ year: 2026, month: 9, day: 3 });
  });

  it('understands hindi-english shortcuts', () => {
    expect(extractDate(['aaj'], NOW)?.date).toEqual({ year: 2026, month: 9, day: 2 });
    expect(extractDate(['yday'], NOW)?.date).toEqual({ year: 2026, month: 9, day: 1 });
    expect(extractDate(['ystd'], NOW)?.date).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it('consumes the leading "on" for a month-first date', () => {
    expect(extractDate(['on', 'sep', '1'], NOW)?.consumed).toEqual([0, 1, 2]);
  });

  it('does not swallow a trailing 4-digit token that is not a year', () => {
    const match = extractDate(['3', 'sep', 'tea'], NOW);
    expect(match?.consumed).toEqual([0, 1]);
  });
});

describe('date helpers', () => {
  it('shifts across a month boundary', () => {
    expect(shiftDays(new Date(2026, 8, 1, 12), -1)).toEqual({ year: 2026, month: 8, day: 31 });
  });

  it('converts a Date to a plain date', () => {
    expect(toPlainDate(new Date(2026, 0, 31, 23))).toEqual({ year: 2026, month: 1, day: 31 });
  });
});

describe('parseMessage — remainder edge cases', () => {
  it('drops a dangling party preposition', () => {
    const r = parseMessage('paid 500 to', { now: NOW });
    expect(r.kind === 'entry' && r.note).toBe('');
    expect(r.kind === 'entry' && r.party).toBeNull();
  });

  it('falls back to the party name as the note', () => {
    const r = parseMessage('gave 2000 to suresh', { now: NOW });
    expect(r.kind === 'entry' && r.note).toBe('Suresh');
  });

  it('does not treat a long income remainder as a party', () => {
    const r = parseMessage('got 5000 for the printing work done', { now: NOW });
    expect(r.kind === 'entry' && r.party).toBeNull();
  });

  it('keeps an account word that is part of the note', () => {
    const r = parseMessage('250 bank charges paid', { now: NOW });
    expect(r.kind === 'entry' && r.account).toBeNull();
    expect(r.kind === 'entry' && r.category).toBe('Bank Charges');
  });
});
