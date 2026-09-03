import { describe, expect, it } from 'vitest';
import { parseMessage } from '../src';
import type { ParsedEntry, ParseResult } from '../src';

/** Fixed anchor so relative dates are deterministic: Wed 2 Sep 2026, local time. */
const NOW = new Date(2026, 8, 2, 10, 30, 0);

function parse(input: string): ParseResult {
  return parseMessage(input, { now: NOW });
}

function entry(input: string): ParsedEntry {
  const r = parse(input);
  if (r.kind !== 'entry') throw new Error(`expected an entry for "${input}", got ${r.kind}`);
  return r;
}

interface Row {
  input: string;
  type?: 'expense' | 'income';
  amountMinor?: string;
  note?: string;
  party?: string | null;
  account?: string | null;
  category?: string | null;
  date?: { year: number; month: number; day: number } | null;
}

const ENTRY_ROWS: Row[] = [
  // --- §4.5 documented shapes -------------------------------------------------
  { input: '450 tea shop', type: 'expense', amountMinor: '45000', note: 'tea shop', category: 'Food & Tea', party: null, account: null, date: null },
  { input: 'paid 12000 rent', type: 'expense', amountMinor: '1200000', note: 'rent', category: 'Rent' },
  { input: 'got 5000 from ramesh', type: 'income', amountMinor: '500000', party: 'Ramesh' },
  { input: 'received 5000 ramesh', type: 'income', amountMinor: '500000', party: 'Ramesh' },
  { input: '+5000 ramesh', type: 'income', amountMinor: '500000', party: 'Ramesh' },
  { input: '450 tea shop bank', type: 'expense', amountMinor: '45000', note: 'tea shop', account: 'bank' },
  { input: '450 tea shop upi', type: 'expense', amountMinor: '45000', note: 'tea shop', account: 'upi' },
  { input: '450 tea shop cash', type: 'expense', account: 'cash', note: 'tea shop' },
  { input: '450 tea shop yesterday', date: { year: 2026, month: 9, day: 1 }, note: 'tea shop' },
  { input: '450 tea shop on 3 sep', date: { year: 2025, month: 9, day: 3 }, note: 'tea shop' },

  // --- case, symbols, separators ---------------------------------------------
  { input: 'PAID 12000 RENT', type: 'expense', amountMinor: '1200000', category: 'Rent' },
  { input: '₹450 tea', amountMinor: '45000', note: 'tea' },
  { input: 'rs 450 tea', amountMinor: '45000', note: 'tea' },
  { input: 'Rs.450 tea', amountMinor: '45000', note: 'tea' },
  { input: '450rs tea', amountMinor: '45000', note: 'tea' },
  { input: '450/- tea', amountMinor: '45000', note: 'tea' },
  { input: 'INR 2500 material', amountMinor: '250000', category: 'Raw Material' },
  { input: '1,200 diesel', amountMinor: '120000', category: 'Transport' },
  { input: '1,20,000 rent', amountMinor: '12000000', category: 'Rent' },
  { input: '450450 goods', amountMinor: '45045000', category: 'Raw Material' },
  { input: '12.50 tea', amountMinor: '1250' },
  { input: '12.345 misc', amountMinor: '1235' },
  { input: '1.2k rent', amountMinor: '120000', category: 'Rent' },
  { input: '2k salary', amountMinor: '200000', category: 'Salaries' },
  { input: '1.5k', amountMinor: '150000', note: '' },
  { input: '2 lakh rent', amountMinor: '20000000', category: 'Rent' },
  { input: '1.25lakh material', amountMinor: '12500000' },
  { input: '450', type: 'expense', amountMinor: '45000', note: '', party: null, category: null },

  // --- direction markers ------------------------------------------------------
  { input: 'spent 300 auto', type: 'expense', category: 'Transport' },
  { input: 'gave 2000 to suresh', type: 'expense', party: 'Suresh' },
  { input: 'bought 800 paper', type: 'expense', category: 'Raw Material' },
  { input: 'sold 3000', type: 'income', amountMinor: '300000', category: 'Sales' },
  { input: 'sale 2000 cash', type: 'income', account: 'cash', category: 'Sales' },
  { input: 'collected 1500 from anita', type: 'income', party: 'Anita' },
  { input: 'credited 900 upi', type: 'income', account: 'upi' },
  { input: '-450 tea', type: 'expense', amountMinor: '45000' },

  // --- accounts ---------------------------------------------------------------
  { input: '450 tea via gpay', account: 'upi', note: 'tea' },
  { input: '450 tea by phonepe', account: 'upi' },
  { input: '900 stock in bank', account: 'bank', category: 'Raw Material' },
  { input: '5000 rent neft', account: 'bank' },
  { input: '250 snacks paytm', account: 'upi' },
  { input: 'bank charges 250', account: null, category: 'Bank Charges', note: 'bank charges' },
  { input: '1200 cheque to landlord', account: 'bank', party: 'Landlord' },

  // --- dates ------------------------------------------------------------------
  { input: '300 tea today', date: { year: 2026, month: 9, day: 2 } },
  { input: '300 tea day before yesterday', date: { year: 2026, month: 8, day: 31 } },
  { input: '300 tea 3/9', date: { year: 2025, month: 9, day: 3 } },
  { input: '300 tea 3-9-2026', date: { year: 2026, month: 9, day: 3 } },
  { input: '300 tea 1/9/26', date: { year: 2026, month: 9, day: 1 } },
  { input: '300 tea on sep 1', date: { year: 2026, month: 9, day: 1 } },
  { input: '300 tea 3rd sept 2025', date: { year: 2025, month: 9, day: 3 } },
  { input: '300 tea 15 aug', date: { year: 2026, month: 8, day: 15 } },

  // --- categories -------------------------------------------------------------
  { input: '600 electricity bill', category: 'Utilities' },
  { input: '250 for chai', category: 'Food & Tea', note: 'chai' },
  { input: '4000 raw material', category: 'Raw Material' },
  { input: '150 courier', category: 'Transport' },
  { input: '2000 pamphlet printing', category: 'Marketing' },
  { input: '750 ac repair', category: 'Maintenance' },
  { input: '9000 gst payment', category: 'Taxes' },
  { input: 'got 4500 for job work', type: 'income', category: 'Services' },
  { input: '3000 wifi recharge', category: 'Utilities' },

  // --- non-latin scripts ------------------------------------------------------
  { input: '500 चाय', amountMinor: '50000', note: 'चाय', category: null },
  { input: '250 టీ కొట్టు', amountMinor: '25000', note: 'టీ కొట్టు' },
  { input: 'paid 1200 किराया', type: 'expense', amountMinor: '120000', note: 'किराया' },
  { input: '80 tea ☕', amountMinor: '8000', category: 'Food & Tea' },
];

describe('parseMessage — entry shapes', () => {
  for (const row of ENTRY_ROWS) {
    it(`parses "${row.input}"`, () => {
      const result = entry(row.input);
      if (row.type !== undefined) expect(result.type, 'type').toBe(row.type);
      if (row.amountMinor !== undefined) expect(result.amountMinor, 'amount').toBe(row.amountMinor);
      if (row.note !== undefined) expect(result.note, 'note').toBe(row.note);
      if (row.party !== undefined) expect(result.party, 'party').toBe(row.party);
      if (row.account !== undefined) expect(result.account, 'account').toBe(row.account);
      if (row.category !== undefined) expect(result.category, 'category').toBe(row.category);
      if (row.date !== undefined) expect(result.date, 'date').toEqual(row.date);
      expect(BigInt(result.amountMinor) > 0n).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  }
});

describe('parseMessage — commands', () => {
  const rows: Array<[string, string]> = [
    ['undo', 'undo'],
    ['UNDO', 'undo'],
    ['  undo  ', 'undo'],
    ['undo!', 'undo'],
    ['today', 'today'],
    ['Today', 'today'],
    ['month', 'month'],
    ['this month', 'month'],
  ];
  for (const [input, command] of rows) {
    it(`recognises "${input}"`, () => {
      expect(parse(input)).toEqual({ kind: 'command', command });
    });
  }

  it('does not treat a date word inside an entry as a command', () => {
    expect(entry('300 tea today').date).toEqual({ year: 2026, month: 9, day: 2 });
  });
});

describe('parseMessage — adversarial input', () => {
  const rows: Array<[string | null | undefined, string]> = [
    ['', 'empty'],
    ['   ', 'empty'],
    [null, 'empty'],
    [undefined, 'empty'],
    ['😀😀😀', 'no_amount'],
    ['hello', 'no_amount'],
    ['tea shop', 'no_amount'],
    ['-', 'no_amount'],
    ['+', 'no_amount'],
    ['k', 'no_amount'],
    ['...', 'no_amount'],
    ['₹', 'no_amount'],
    ['0 tea', 'zero_amount'],
    ['0.00 tea', 'zero_amount'],
    ['450 500 tea', 'ambiguous_amount'],
    ['100 200 300', 'ambiguous_amount'],
    ['99999999999999 tea', 'amount_too_large'],
  ];
  for (const [input, reason] of rows) {
    it(`rejects ${JSON.stringify(input)} as ${reason}`, () => {
      expect(parseMessage(input, { now: NOW })).toEqual({ kind: 'unparsed', reason });
    });
  }

  it('resolves ambiguity when exactly one number is money-marked', () => {
    const r = entry('₹450 500 tea');
    expect(r.amountMinor).toBe('45000');
  });

  it('keeps a bare number that follows a consumed date out of the amount race', () => {
    const r = entry('450 tea on 3 sep');
    expect(r.amountMinor).toBe('45000');
  });
});

describe('parseMessage — options', () => {
  it('honours zero-decimal currencies', () => {
    const r = parseMessage('450 tea', { now: NOW, minorUnitDigits: 0 });
    expect(r.kind === 'entry' && r.amountMinor).toBe('450');
  });

  it('honours a custom max amount', () => {
    expect(parseMessage('5000 tea', { now: NOW, maxAmountMinor: 1000n })).toEqual({
      kind: 'unparsed',
      reason: 'amount_too_large',
    });
  });

  it('defaults "now" to the current time', () => {
    const r = parseMessage('450 tea today');
    expect(r.kind === 'entry' && r.date?.year).toBe(new Date().getFullYear());
  });
});

describe('parseMessage — confidence', () => {
  it('scores a rich message above a bare number', () => {
    expect(entry('paid 450 tea shop upi').confidence).toBeGreaterThan(entry('450').confidence);
  });
});
