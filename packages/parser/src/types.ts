/**
 * Result shapes for the WhatsApp message parser.
 *
 * Amounts are decimal strings of integer *minor units* (paise for INR) so the
 * result can be JSON-serialised into `whatsapp_messages.parse_result` without
 * ever passing money through a JS `number`.
 */

export type EntryType = 'expense' | 'income';

export type AccountKind = 'cash' | 'bank' | 'upi' | 'other';

/** A calendar date with no timezone attached; the caller anchors it to the business tz. */
export interface PlainDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export type ParsedCommandName = 'undo' | 'today' | 'month';

export interface ParsedCommand {
  kind: 'command';
  command: ParsedCommandName;
}

export interface ParsedEntry {
  kind: 'entry';
  type: EntryType;
  /** Integer minor units as a decimal string, always > 0. */
  amountMinor: string;
  /** Free text remainder, original casing, may be empty. */
  note: string;
  /** Party name in Title Case when one could be identified. */
  party: string | null;
  /** Account kind requested by a trailing/`via` keyword, else null. */
  account: AccountKind | null;
  /** Canonical default-category name matched by keyword, else null. */
  category: string | null;
  /** Date override when the message named one, else null (caller uses "now"). */
  date: PlainDate | null;
  /** 0..1, rough signal for logging and later parser tuning. Never gates a save. */
  confidence: number;
}

export type ParseFailureReason =
  | 'empty'
  | 'no_amount'
  | 'ambiguous_amount'
  | 'zero_amount'
  | 'amount_too_large';

export interface ParseFailure {
  kind: 'unparsed';
  reason: ParseFailureReason;
}

export type ParseResult = ParsedCommand | ParsedEntry | ParseFailure;

export interface ParseOptions {
  /** Anchor for relative dates ("yesterday"). Defaults to the current time. */
  now?: Date;
  /** Digits in a minor unit. 2 for INR/USD/EUR, 0 for JPY. */
  minorUnitDigits?: number;
  /** Upper sanity bound in minor units. Anything above is rejected, not saved. */
  maxAmountMinor?: bigint;
}
