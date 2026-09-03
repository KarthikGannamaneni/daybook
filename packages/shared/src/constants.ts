import type { AccountKind } from '@khata/parser';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Utilities',
  'Raw Material',
  'Transport',
  'Food & Tea',
  'Marketing',
  'Maintenance',
  'Bank Charges',
  'Taxes',
  'Other',
] as const;

export const DEFAULT_INCOME_CATEGORIES = ['Sales', 'Services', 'Other'] as const;

export const DEFAULT_ACCOUNTS: Array<{ name: string; kind: AccountKind }> = [
  { name: 'Cash', kind: 'cash' },
  { name: 'Bank', kind: 'bank' },
  { name: 'UPI', kind: 'upi' },
];

/** Roles, most privileged first. */
export const ROLES = ['owner', 'staff', 'accountant'] as const;
export type Role = (typeof ROLES)[number];

/** §3: staff may only touch their own entries, and only recent ones. */
export const STAFF_EDIT_WINDOW_DAYS = 7;
/** §4.3: the undo toast commits after this long. */
export const UNDO_WINDOW_MS = 8_000;
/** §4.5: the WhatsApp `undo` command reaches back this far. */
export const WHATSAPP_UNDO_WINDOW_MS = 10 * 60_000;
/** §4.5: linking codes expire after this long. */
export const LINK_CODE_TTL_MS = 10 * 60_000;
/** §4.1: the app lock re-prompts after this long in the background. */
export const APP_LOCK_IDLE_MS = 5 * 60_000;
/** §4.3: attachment ceiling before and after client-side compression. */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TARGET_BYTES = 800 * 1024;
/** §4.3: duplicate-detection window. */
export const DUPLICATE_WINDOW_MS = 2 * 60_000;

export const SUPPORTED_LOCALES = ['en', 'hi', 'te'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
