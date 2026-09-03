// GENERATED FILE — do not edit.
// Mirrored from packages/parser/src by scripts/sync-parser.mjs.
// Edit the source there, then run `pnpm sync:parser`.

import type { AccountKind } from './types.ts';

/** Tokens that force an income entry when they appear before the amount. */
export const INCOME_MARKERS = new Set([
  'got',
  'received',
  'recd',
  'recieved',
  'rcvd',
  'income',
  'credit',
  'credited',
  'sale',
  'sales',
  'sold',
  'collected',
  'earned',
]);

/** Tokens that force an expense entry. Expense is also the default. */
export const EXPENSE_MARKERS = new Set([
  'paid',
  'pay',
  'spent',
  'spend',
  'gave',
  'given',
  'bought',
  'buy',
  'purchase',
  'purchased',
  'expense',
  'debit',
  'debited',
  'cost',
]);

/** Noise words dropped from the note once everything else has been extracted. */
export const FILLER_WORDS = new Set([
  'for', 'of', 'the', 'a', 'an', 'rs', 'rupees', 'inr', 'ka', 'ke',
  // prepositions only ever trimmed from the *edges* of the note, after the
  // party clause has already been taken out.
  'from', 'to', 'on', 'at', 'in', 'by', 'via', 'with',
]);

export const ACCOUNT_KEYWORDS: Record<string, AccountKind> = {
  cash: 'cash',
  nagad: 'cash',
  bank: 'bank',
  neft: 'bank',
  imps: 'bank',
  rtgs: 'bank',
  cheque: 'bank',
  check: 'bank',
  card: 'bank',
  upi: 'upi',
  gpay: 'upi',
  googlepay: 'upi',
  phonepe: 'upi',
  paytm: 'upi',
  bhim: 'upi',
  qr: 'upi',
};

/**
 * Keyword -> canonical default category name (see the seeded categories in §4.2).
 * Longest match wins, so multi-word keys are checked before single words.
 */
export const CATEGORY_KEYWORDS: Array<[string, string]> = [
  // expense
  ['bank charge', 'Bank Charges'],
  ['bank charges', 'Bank Charges'],
  ['bank fee', 'Bank Charges'],
  ['raw material', 'Raw Material'],
  ['food & tea', 'Food & Tea'],
  ['tea shop', 'Food & Tea'],
  ['rent', 'Rent'],
  ['salary', 'Salaries'],
  ['salaries', 'Salaries'],
  ['wages', 'Salaries'],
  ['wage', 'Salaries'],
  ['staff', 'Salaries'],
  ['electricity', 'Utilities'],
  ['current bill', 'Utilities'],
  ['water', 'Utilities'],
  ['internet', 'Utilities'],
  ['wifi', 'Utilities'],
  ['broadband', 'Utilities'],
  ['recharge', 'Utilities'],
  ['phone bill', 'Utilities'],
  ['gas', 'Utilities'],
  ['material', 'Raw Material'],
  ['stock', 'Raw Material'],
  ['goods', 'Raw Material'],
  ['paper', 'Raw Material'],
  ['ink', 'Raw Material'],
  ['cement', 'Raw Material'],
  ['petrol', 'Transport'],
  ['diesel', 'Transport'],
  ['fuel', 'Transport'],
  ['auto', 'Transport'],
  ['cab', 'Transport'],
  ['taxi', 'Transport'],
  ['ola', 'Transport'],
  ['uber', 'Transport'],
  ['bus', 'Transport'],
  ['train', 'Transport'],
  ['transport', 'Transport'],
  ['travel', 'Transport'],
  ['courier', 'Transport'],
  ['delivery', 'Transport'],
  ['tea', 'Food & Tea'],
  ['chai', 'Food & Tea'],
  ['coffee', 'Food & Tea'],
  ['snacks', 'Food & Tea'],
  ['tiffin', 'Food & Tea'],
  ['lunch', 'Food & Tea'],
  ['breakfast', 'Food & Tea'],
  ['dinner', 'Food & Tea'],
  ['food', 'Food & Tea'],
  ['canteen', 'Food & Tea'],
  ['biscuit', 'Food & Tea'],
  ['ads', 'Marketing'],
  ['ad', 'Marketing'],
  ['advertisement', 'Marketing'],
  ['marketing', 'Marketing'],
  ['pamphlet', 'Marketing'],
  ['banner', 'Marketing'],
  ['hoarding', 'Marketing'],
  ['repair', 'Maintenance'],
  ['maintenance', 'Maintenance'],
  ['servicing', 'Maintenance'],
  ['cleaning', 'Maintenance'],
  ['gst', 'Taxes'],
  ['tds', 'Taxes'],
  ['tax', 'Taxes'],
  // income
  ['job work', 'Services'],
  ['service', 'Services'],
  ['consulting', 'Services'],
  ['consultation', 'Services'],
  ['sale', 'Sales'],
  ['sales', 'Sales'],
  ['sold', 'Sales'],
  ['order', 'Sales'],
];

const INCOME_CATEGORIES = new Set(['Sales', 'Services']);

/** Categories only ever proposed for the matching entry type. */
export function categoryMatchesType(category: string, type: 'expense' | 'income'): boolean {
  return type === 'income' ? INCOME_CATEGORIES.has(category) : !INCOME_CATEGORIES.has(category);
}
