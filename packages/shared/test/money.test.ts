import { describe, expect, it } from 'vitest';
import { Money, currencySymbol, minorDigitsFor, sumMinor } from '../src';

describe('Money construction', () => {
  it('builds from minor units', () => {
    expect(Money.fromMinor(45000n).toMajorString()).toBe('450.00');
    expect(Money.fromMinor('45000').toMajorString()).toBe('450.00');
    expect(Money.fromMinor(45000).toMajorString()).toBe('450.00');
  });

  it('builds from major units', () => {
    expect(Money.fromMajor('450').minor).toBe(45000n);
    expect(Money.fromMajor('450.50').minor).toBe(45050n);
    expect(Money.fromMajor(1200, 'USD').minor).toBe(120000n);
  });

  it('throws on an unusable major value', () => {
    expect(() => Money.fromMajor('abc')).toThrow(/not a valid/i);
  });

  it('pads sub-rupee values', () => {
    expect(Money.fromMinor(5n).toMajorString()).toBe('0.05');
    expect(Money.fromMinor(0n).toMajorString()).toBe('0.00');
    expect(Money.fromMinor(-5n).toMajorString()).toBe('-0.05');
  });
});

describe('Money.parse — what a user types', () => {
  const rows: Array<[string, bigint]> = [
    ['450', 45000n],
    ['450.50', 45050n],
    ['1,20,000', 12000000n],
    ['1,200', 120000n],
    ['₹450', 45000n],
    ['Rs 450', 45000n],
    ['450/-', 45000n],
    ['1.5k', 150000n],
    ['2k', 200000n],
    ['2lakh', 20000000n],
    ['-450', -45000n],
  ];
  for (const [input, minor] of rows) {
    it(`parses "${input}"`, () => {
      expect(Money.parse(input)?.minor).toBe(minor);
    });
  }

  it('returns null for junk', () => {
    expect(Money.parse('')).toBeNull();
    expect(Money.parse('   ')).toBeNull();
    expect(Money.parse('abc')).toBeNull();
    expect(Money.parse('₹')).toBeNull();
  });

  it('rounds a third decimal half-up', () => {
    expect(Money.parse('12.345')?.minor).toBe(1235n);
  });

  it('respects zero-decimal currencies', () => {
    expect(Money.parse('450', 'JPY')?.minor).toBe(450n);
  });
});

describe('Money arithmetic', () => {
  const a = Money.fromMinor(45000n);
  const b = Money.fromMinor(5000n);

  it('adds and subtracts exactly', () => {
    expect(a.add(b).minor).toBe(50000n);
    expect(a.subtract(b).minor).toBe(40000n);
  });

  it('stays exact where floats would not', () => {
    const tenth = Money.fromMajor('0.1');
    const sum = tenth.add(tenth).add(tenth);
    expect(sum.toMajorString()).toBe('0.30');
  });

  it('handles very large values', () => {
    const big = Money.fromMinor('999999999999999');
    expect(big.add(Money.fromMinor(1n)).minor).toBe(1000000000000000n);
  });

  it('negates, absolutes and compares', () => {
    expect(a.negate().isNegative).toBe(true);
    expect(a.negate().abs().minor).toBe(45000n);
    expect(a.compare(b)).toBe(1);
    expect(b.compare(a)).toBe(-1);
    expect(a.compare(Money.fromMinor(45000n))).toBe(0);
    expect(Money.fromMinor(0n).isZero).toBe(true);
  });

  it('refuses to mix currencies', () => {
    expect(() => a.add(Money.fromMinor(1n, 'USD'))).toThrow(/currency mismatch/i);
    expect(() => a.subtract(Money.fromMinor(1n, 'USD'))).toThrow(/currency mismatch/i);
    expect(() => a.compare(Money.fromMinor(1n, 'USD'))).toThrow(/currency mismatch/i);
  });
});

describe('Money formatting', () => {
  it('groups INR in lakhs for en-IN', () => {
    const formatted = Money.fromMinor(12345600n, 'INR').format('en-IN');
    expect(formatted).toContain('1,23,456');
    expect(formatted).toMatch(/₹/);
  });

  it('groups USD in thousands for en-US', () => {
    expect(Money.fromMinor(12345600n, 'USD').format('en-US')).toBe('$123,456.00');
  });

  it('formats EUR for de-DE', () => {
    const formatted = Money.fromMinor(123456n, 'EUR').format('de-DE');
    expect(formatted).toContain('1.234,56');
  });

  it('drops empty decimals in compact form', () => {
    expect(Money.fromMinor(45000n).formatCompact('en-IN')).toBe('₹450');
    expect(Money.fromMinor(45050n).formatCompact('en-IN')).toBe('₹450.50');
  });

  it('serialises as minor units', () => {
    expect(JSON.stringify({ amount: Money.fromMinor(45000n) })).toBe('{"amount":"45000"}');
    expect(Money.fromMinor(45000n).toString()).toBe('INR 450.00');
  });
});

describe('currency metadata', () => {
  it('knows minor-unit digits', () => {
    expect(minorDigitsFor('INR')).toBe(2);
    expect(minorDigitsFor('usd')).toBe(2);
    expect(minorDigitsFor('JPY')).toBe(0);
    expect(minorDigitsFor('KWD')).toBe(3);
  });

  it('extracts the symbol for the composer prefix', () => {
    expect(currencySymbol('INR', 'en-IN')).toBe('₹');
    expect(currencySymbol('USD', 'en-US')).toBe('$');
  });

  it('sums minor units without leaving bigint', () => {
    expect(sumMinor(['45000', 5000n, '1'])).toBe(50001n);
    expect(sumMinor([])).toBe(0n);
  });
});
